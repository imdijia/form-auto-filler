import type { FieldHandle, StateVerifier, VerificationDetail } from '../contracts';
import { nowIso } from '../utils/time';
import { normalizeText } from '../utils/text';
import { readDomValue } from './native-setter';

/** One render frame. rAF is the contract signal; MessageChannel ticks are a
    hidden-tab fallback so a backgrounded page can never hang the fill. No
    fixed setTimeout is used for stability judgment. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (): void => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };
    requestAnimationFrame(finish);
    const channel = new MessageChannel();
    let ticks = 0;
    channel.port1.onmessage = (): void => {
      ticks += 1;
      if (ticks >= 4) finish();
      else channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  });
}

async function twoRenderFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** v2: ADVISORY evidence only. A lingering page validation hint is recorded
    for diagnosis but never makes a correctly written value fail. */
function readValidationState(handle: FieldHandle): boolean {
  const element = handle.element;
  if (element.getAttribute('aria-invalid') === 'true') return false;
  const container = element.closest<HTMLElement>(
    '.ant-form-item, .el-form-item, [class*="form-item"], [class*="field-wrapper"]',
  );
  if (container && /(?:has-error|is-error|--error|\berror\b)/.test(container.className)) {
    return false;
  }
  if (element instanceof HTMLInputElement && element.validity && !element.validity.valid) {
    return false;
  }
  const errorNode = container?.querySelector<HTMLElement>(
    '.ant-form-item-explain-error, .el-form-item__error, [class*="error-message"]',
  );
  if (errorNode && normalizeText(errorNode.textContent ?? '').length > 0) return false;
  return true;
}

function normalized(value: string): string {
  return normalizeText(value);
}

/** v2 single success criterion: DOM value matched AND stable across two
    render frames. validationCleared stays in the detail/evidence as advisory. */
export function verificationPassed(detail: VerificationDetail): boolean {
  return detail.domValueMatched && detail.frameworkStateMatched;
}

/** Two observable layers decide success; the third is advisory evidence. */
export function createStateVerifier(): StateVerifier {
  return {
    async verify(
      handle: FieldHandle,
      value: string,
      adapterId: string,
    ): Promise<VerificationDetail> {
      const expected = normalized(value);
      const evidence: string[] = [];
      const first = normalized(readDomValue(handle));
      const domValueMatched = first === expected;
      evidence.push(domValueMatched ? 'dom-value-match' : 'dom-value-mismatch');

      await twoRenderFrames();
      const second = normalized(readDomValue(handle));
      const frameworkStateMatched = domValueMatched && second === expected;
      evidence.push(frameworkStateMatched ? 'rerender-stable' : 'rerender-reverted');

      const cleared = readValidationState(handle);
      evidence.push(cleared ? 'validation-clear' : 'validation-advisory:页面仍有校验提示');
      evidence.push('adapter:' + adapterId);
      evidence.push(cleared ? 'aria-invalid:false' : 'aria-invalid:true');

      return {
        domValueMatched,
        frameworkStateMatched,
        validationCleared: cleared,
        evidence,
        checkedAt: nowIso(),
      };
    },
  };
}

export function failingLayer(detail: VerificationDetail): string {
  if (!detail.domValueMatched) return 'domValueMatched: 赋值后 DOM 值与预期不一致';
  if (!detail.frameworkStateMatched) return 'frameworkStateMatched: 两个渲染帧后值被框架回滚';
  if (!detail.validationCleared) {
    return 'verified: DOM 值与两帧稳定均通过；页面校验态仅作提示';
  }
  return 'verified: DOM 值匹配且两帧稳定';
}
