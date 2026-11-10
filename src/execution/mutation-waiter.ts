import { LIMITS } from '../contracts';
import type { MutationWaiter, Result } from '../contracts';
import { err, ok } from '../utils/result';

/** MutationObserver + predicate + AbortSignal + 3000ms guard. No fixed
    setTimeout is used to decide that a linkage has settled. */
export function createMutationWaiter(root: ParentNode): MutationWaiter {
  return {
    waitFor(predicate: () => boolean, signal?: AbortSignal): Promise<Result<void>> {
      if (signal?.aborted) {
        return Promise.resolve(err('E_LINKAGE_TIMEOUT', '联动等待已取消'));
      }
      if (predicate()) return Promise.resolve(ok(undefined));
      return new Promise<Result<void>>((resolve) => {
        let settled = false;
        let observer: MutationObserver | null = null;
        let detach: () => void = () => { /* replaced below */ };
        const finish = (result: Result<void>): void => {
          if (settled) return;
          settled = true;
          observer?.disconnect();
          detach();
          resolve(result);
        };
        const timeout = AbortSignal.timeout(LIMITS.LINKAGE_TIMEOUT_MS);
        const combined = signal ? combineSignals(signal, timeout) : timeout;
        const onAbort = (): void => {
          finish(err('E_LINKAGE_TIMEOUT', '等待联动稳定超时'));
        };
        combined.addEventListener('abort', onAbort, { once: true });
        detach = () => combined.removeEventListener('abort', onAbort);
        observer = new MutationObserver(() => {
          try {
            if (predicate()) finish(ok(undefined));
          } catch {
            finish(err('E_LINKAGE_TIMEOUT', '联动断言执行失败'));
          }
        });
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'aria-invalid', 'value'],
        });
      });
    },
  };
}

/** AbortSignal.any is available in Chromium 120+, but guard for safety. */
function combineSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([left, right]);
  const controller = new AbortController();
  const forward = (signal: AbortSignal): void => {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  };
  forward(left);
  forward(right);
  return controller.signal;
}
