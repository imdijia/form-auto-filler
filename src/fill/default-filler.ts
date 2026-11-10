import type { Filler } from '../contracts';
import { createFiller, P0_STRATEGY_IDS } from './filler';
import type { StrategyDeps } from './strategies/common';
import { createNativeInputStrategy } from './strategies/native-input';
import { createNativeSelectStrategy } from './strategies/native-select';
import { createAntDesignVueSelectStrategy } from './strategies/ant-design-vue-select';
import { createElementPlusSelectStrategy } from './strategies/element-plus-select';
import { createAntDesignVueDatePickerStrategy } from './strategies/ant-design-vue-date-picker';
import { createElementPlusDatePickerStrategy } from './strategies/element-plus-date-picker';

/**
 * Entry-point assembly ONLY. All six P0 strategies are registered here
 * unconditionally; createFiller() throws if any one is missing, so a broken
 * build is caught at construction time instead of silently mis-filling a
 * whole form (ARCH 14.1). register() is reserved for post-P2 adapters.
 */
export function createDefaultFiller(deps: StrategyDeps): Filler {
  const strategies = [
    createNativeInputStrategy(deps),
    createNativeSelectStrategy(deps),
    createAntDesignVueSelectStrategy(deps),
    createElementPlusSelectStrategy(deps),
    createAntDesignVueDatePickerStrategy(deps),
    createElementPlusDatePickerStrategy(deps),
  ];
  // v2: the shared verifier enables the multi-path retry inside createFiller.
  return createFiller(strategies, { verifier: deps.verifier });
}

export { P0_STRATEGY_IDS };
