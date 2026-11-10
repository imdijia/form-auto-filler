import type { FillerStrategy } from '../../contracts';
import { normalizeText } from '../../utils/text';
import { setNativeValue, triggerBlur } from '../native-setter';
import { failedResult, makeStrategy, verifyAndBuild, type StrategyDeps } from './common';

export function createNativeSelectStrategy(deps: StrategyDeps): FillerStrategy {
  return makeStrategy(
    'native-select',
    (handle) => handle.element instanceof HTMLSelectElement,
    async (handle, value) => {
      const start = performance.now();
      const element = handle.element;
      if (!(element instanceof HTMLSelectElement)) {
        return failedResult(handle, 'E_UNSUPPORTED_CONTROL', '不是原生下拉控件', start);
      }
      const options = Array.from(element.options);
      const labelOf = (option: HTMLOptionElement): string =>
        normalizeText(option.textContent ?? '') || option.value;
      const target =
        options.find((option) => labelOf(option) === value) ??
        options.find((option) => option.value === value) ??
        options.find((option) => labelOf(option).includes(value)) ??
        options[0];
      if (!target) {
        return failedResult(handle, 'E_UNSUPPORTED_CONTROL', '原生下拉没有可选项', start);
      }
      const actual = labelOf(target);
      setNativeValue(element, target.value);
      triggerBlur(element);
      return verifyAndBuild(handle, actual, deps, start, 'native-select');
    },
  );
}
