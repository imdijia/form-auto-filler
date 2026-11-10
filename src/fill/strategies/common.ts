import { LIMITS } from '../../contracts';
import type {
  EffectiveRules,
  ErrorCode,
  FieldHandle,
  FillContext,
  FillResult,
  FillerStrategy,
  MutationWaiter,
  StateVerifier,
  VerificationDetail,
} from '../../contracts';
import { dateFormatAccepts } from '../../data/format';
import { findComponentRoot } from '../../detection/control-type';
import { normalizeText } from '../../utils/text';
import { failingLayer } from '../readback';
import { setNativeValue, triggerBlur } from '../native-setter';

export interface StrategyDeps {
  readonly verifier: StateVerifier;
  readonly waiter: MutationWaiter;
  readonly rules: EffectiveRules;
}

export interface PortalConfig {
  readonly triggerSelector: string;
  readonly optionSelector: string;
}

export function elapsedSince(start: number): number {
  return Math.round(performance.now() - start);
}

export function failedResult(
  handle: FieldHandle,
  code: ErrorCode,
  reason: string,
  start: number,
  attempts = 1,
  verification?: VerificationDetail,
): FillResult {
  return {
    fieldId: handle.descriptor.id,
    status: 'failed',
    verified: false,
    code,
    failureReason: reason,
    verification,
    controlType: handle.descriptor.controlType,
    attempts,
    elapsedMs: elapsedSince(start),
  };
}

export function unsupportedResult(handle: FieldHandle, start: number): FillResult {
  return {
    fieldId: handle.descriptor.id,
    status: 'failed',
    verified: false,
    code: 'E_UNSUPPORTED_CONTROL',
    failureReason: '控件超出 v1 适配范围，未写入任何值',
    skipReason: 'unsupported-control',
    controlType: handle.descriptor.controlType,
    attempts: 1,
    elapsedMs: elapsedSince(start),
  };
}

export function skippedResult(
  handle: FieldHandle,
  reason: string,
  start: number,
): FillResult {
  return {
    fieldId: handle.descriptor.id,
    status: 'skipped',
    verified: false,
    failureReason: reason,
    controlType: handle.descriptor.controlType,
    attempts: 1,
    elapsedMs: elapsedSince(start),
  };
}

export function successResult(
  handle: FieldHandle,
  value: string,
  start: number,
  attempts: number,
  verification: VerificationDetail,
): FillResult {
  return {
    fieldId: handle.descriptor.id,
    status: 'filled',
    verified: true,
    value,
    verification,
    controlType: handle.descriptor.controlType,
    attempts,
    elapsedMs: elapsedSince(start),
  };
}

/** All adapters share one StateVerifier. Event dispatch is not success. */
export async function verifyAndBuild(
  handle: FieldHandle,
  value: string,
  deps: StrategyDeps,
  start: number,
  adapterId: string,
): Promise<FillResult> {
  const verification = await deps.verifier.verify(handle, value, adapterId);
  // v2: validation state is advisory evidence only. DOM value match + two
  // stable render frames decide success; a lingering page error hint must not
  // turn a correctly written value into a reported failure.
  const passed = verification.domValueMatched && verification.frameworkStateMatched;
  if (passed) return successResult(handle, value, start, 1, verification);
  return failedResult(
    handle,
    'E_READBACK_MISMATCH',
    failingLayer(verification),
    start,
    1,
    verification,
  );
}

/** Options live in a body-level portal, never in the trigger subtree. */
export function visiblePortalOptions(
  document: Document,
  selectors: readonly string[],
): HTMLElement[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(', ')));
  return nodes.filter((node) => {
    const panel = node.closest<HTMLElement>(
      '.ant-select-dropdown, .ant-picker-dropdown, .el-select__popper, .el-picker__panel, .el-select-dropdown',
    );
    if (!panel) return true;
    if (panel.classList.contains('ant-select-dropdown-hidden')) return false;
    if (panel.getAttribute('aria-hidden') === 'true') return false;
    const style = document.defaultView?.getComputedStyle(panel);
    return style ? style.display !== 'none' && style.visibility !== 'hidden' : true;
  });
}

export function clickOption(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  element.click();
}

export async function pickFromPortal(
  handle: FieldHandle,
  value: string,
  deps: StrategyDeps,
  config: PortalConfig,
  start: number,
  adapterId: string,
): Promise<FillResult> {
  const document = handle.element.ownerDocument;
  const root = findComponentRoot(handle.element);
  if (!root) return unsupportedResult(handle, start);
  const trigger = root.querySelector<HTMLElement>(config.triggerSelector) ?? root;
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  trigger.click();

  const signal = AbortSignal.timeout(LIMITS.LINKAGE_TIMEOUT_MS);
  const opened = await deps.waiter.waitFor(
    () => visiblePortalOptions(document, [config.optionSelector]).length > 0,
    signal,
  );
  if (!opened.ok) {
    return failedResult(
      handle,
      'E_PORTAL_NOT_FOUND',
      'portal 级选项面板未出现（联动等待超时）',
      start,
    );
  }

  const options = visiblePortalOptions(document, [config.optionSelector]);
  const textOf = (element: HTMLElement): string => normalizeText(element.textContent ?? '');
  const target =
    options.find((option) => textOf(option) === value) ??
    options.find((option) => textOf(option).includes(value)) ??
    options.find((option) => value.length > 0 && value.includes(textOf(option))) ??
    options[0];
  if (!target) {
    return failedResult(handle, 'E_PORTAL_NOT_FOUND', 'portal 面板中没有可选值', start);
  }
  const actual = textOf(target);
  clickOption(target);
  return verifyAndBuild(handle, actual, deps, start, adapterId);
}

/** valueFormat negotiation + prototype setter + blur. No bare el.value. */
export async function fillDateControl(
  handle: FieldHandle,
  value: string,
  deps: StrategyDeps,
  start: number,
  adapterId: string,
): Promise<FillResult> {
  if (!dateFormatAccepts(value, handle.descriptor, deps.rules)) {
    return failedResult(
      handle,
      'E_VALUE_FORMAT_MISMATCH',
      '日期控件 valueFormat 无法解析，未写入猜测值',
      start,
    );
  }
  const element = handle.element;
  let input: HTMLInputElement | null = null;
  if (element instanceof HTMLInputElement) input = element;
  else input = findComponentRoot(element)?.querySelector<HTMLInputElement>('input') ?? null;
  if (!input) return unsupportedResult(handle, start);
  setNativeValue(input, value);
  triggerBlur(input);
  return verifyAndBuild(handle, value, deps, start, adapterId);
}

/** Error isolation + retry ceiling of 2. A throwing adapter never reaches
    the host page and never aborts the remaining fields. */
export function makeStrategy(
  id: string,
  supports: (handle: FieldHandle) => boolean,
  run: (
    handle: FieldHandle,
    value: string,
    ctx: FillContext,
  ) => Promise<FillResult>,
): FillerStrategy {
  return {
    id,
    supports,
    async fill(handle: FieldHandle, value: string, ctx: FillContext): Promise<FillResult> {
      const start = performance.now();
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const result = await run(handle, value, ctx);
          if (result.verified && result.status === 'filled') {
            return { ...result, attempts: attempt, elapsedMs: elapsedSince(start) };
          }
          if (attempt === 2) {
            return { ...result, attempts: attempt, elapsedMs: elapsedSince(start) };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          return failedResult(
            handle,
            'E_READBACK_MISMATCH',
            'domValueMatched: 适配器执行异常（' + message + '）',
            start,
            attempt,
          );
        }
      }
      return failedResult(handle, 'E_READBACK_MISMATCH', 'domValueMatched: 未完成回读', start, 2);
    },
  };
}
