import type { ComponentAdapter, FillerStrategy } from '../../contracts';
import { findComponentRoot } from '../../detection/control-type';
import { fillDateControl, makeStrategy, type StrategyDeps } from './common';

/** P0 built-in. valueFormat is negotiated from the control / rule document;
    an unparseable format is E_VALUE_FORMAT_MISMATCH, never a guessed string. */
export function createAntDesignVueDatePickerStrategy(
  deps: StrategyDeps,
): FillerStrategy & ComponentAdapter {
  const strategy = makeStrategy(
    'ant-design-vue-date-picker',
    (handle) => {
      const root = findComponentRoot(handle.element);
      return Boolean(root && root.matches('.ant-picker') && handle.descriptor.controlType === 'date');
    },
    async (handle, value) =>
      fillDateControl(handle, value, deps, performance.now(), 'ant-design-vue-date-picker'),
  );
  return Object.assign(strategy, {
    library: 'ant-design-vue' as const,
    control: 'date-picker' as const,
  });
}
