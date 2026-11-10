import type { ComponentAdapter, FillerStrategy } from '../../contracts';
import { findComponentRoot } from '../../detection/control-type';
import { makeStrategy, pickFromPortal, type StrategyDeps } from './common';

const OPTION_SELECTOR = [
  '.el-select__popper .el-select-dropdown__item',
  '.el-select-dropdown__item',
].join(', ');

/** P0 built-in. Element Plus renders options into .el-select__popper. */
export function createElementPlusSelectStrategy(deps: StrategyDeps): FillerStrategy & ComponentAdapter {
  const strategy = makeStrategy(
    'element-plus-select',
    (handle) => {
      const root = findComponentRoot(handle.element);
      if (!root || !root.matches('.el-select') || root.matches('.el-cascader')) return false;
      if (root.classList.contains('el-select--remote') || root.hasAttribute('remote')) return false;
      return handle.descriptor.controlType === 'select';
    },
    async (handle, value) =>
      pickFromPortal(
        handle,
        value,
        deps,
        {
          triggerSelector: '.el-select__wrapper, .el-select .el-input__inner, .el-select',
          optionSelector: OPTION_SELECTOR,
        },
        performance.now(),
        'element-plus-select',
      ),
  );
  return Object.assign(strategy, {
    library: 'element-plus' as const,
    control: 'select' as const,
  });
}
