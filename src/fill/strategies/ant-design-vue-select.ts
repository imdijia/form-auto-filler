import type { ComponentAdapter, FillerStrategy } from '../../contracts';
import { findComponentRoot } from '../../detection/control-type';
import { makeStrategy, pickFromPortal, type StrategyDeps } from './common';

const OPTION_SELECTOR = [
  '.ant-select-dropdown .ant-select-item-option-content',
  '.ant-select-dropdown .ant-select-item-option',
].join(', ');

/** P0 built-in. Ant Design Vue renders the dropdown into a body-level portal. */
export function createAntDesignVueSelectStrategy(deps: StrategyDeps): FillerStrategy & ComponentAdapter {
  const strategy = makeStrategy(
    'ant-design-vue-select',
    (handle) => {
      const root = findComponentRoot(handle.element);
      if (!root || !root.matches('.ant-select') || root.matches('.ant-cascader')) return false;
      if (root.classList.contains('ant-select-show-search')) return false;
      return handle.descriptor.controlType === 'select';
    },
    async (handle, value) =>
      pickFromPortal(
        handle,
        value,
        deps,
        { triggerSelector: '.ant-select-selector', optionSelector: OPTION_SELECTOR },
        performance.now(),
        'ant-design-vue-select',
      ),
  );
  return Object.assign(strategy, {
    library: 'ant-design-vue' as const,
    control: 'select' as const,
  });
}
