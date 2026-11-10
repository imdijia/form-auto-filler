import type { FillerStrategy } from '../../contracts';
import { findComponentRoot } from '../../detection/control-type';
import { setContentEditableValue, setNativeValue, triggerBlur } from '../native-setter';
import { makeStrategy, verifyAndBuild, type StrategyDeps } from './common';

export function createNativeInputStrategy(deps: StrategyDeps): FillerStrategy {
  return makeStrategy(
    'native-input',
    (handle) => {
      const element = handle.element;
      if (findComponentRoot(element)) return false;
      if (element instanceof HTMLSelectElement) return false;
      return (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element.isContentEditable
      );
    },
    async (handle, value) => {
      const start = performance.now();
      const element = handle.element;
      if (
        element instanceof HTMLInputElement &&
        (element.type === 'checkbox' || element.type === 'radio')
      ) {
        if (!element.checked) element.click();
        const actual = element.checked ? element.value : '';
        return verifyAndBuild(handle, actual, deps, start, 'native-input');
      }
      const isFormControl =
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      if (element.isContentEditable && !isFormControl) {
        setContentEditableValue(element, value);
      } else {
        setNativeValue(element, value);
      }
      triggerBlur(element);
      return verifyAndBuild(handle, value, deps, start, 'native-input');
    },
  );
}
