import type { ComponentAdapter, FillerStrategy } from '../../contracts';
import { findComponentRoot } from '../../detection/control-type';
import { fillDateControl, makeStrategy, type StrategyDeps } from './common';

/** P0 built-in. Element Plus date editor, same valueFormat negotiation. */
export function createElementPlusDatePickerStrategy(
  deps: StrategyDeps,
): FillerStrategy & ComponentAdapter {
  const strategy = makeStrategy(
    'element-plus-date-picker',
    (handle) => {
      const root = findComponentRoot(handle.element);
      return Boolean(root && root.matches('.el-date-editor') && handle.descriptor.controlType === 'date');
    },
    async (handle, value) =>
      fillDateControl(handle, value, deps, performance.now(), 'element-plus-date-picker'),
  );
  return Object.assign(strategy, {
    library: 'element-plus' as const,
    control: 'date-picker' as const,
  });
}
