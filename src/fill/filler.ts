import type {
  FieldHandle,
  FillContext,
  Filler,
  FillerStrategy,
  FillResult,
  StateVerifier,
} from '../contracts';
import { ASSIGNMENT_PATHS, genericAssign } from './assignment-paths';
import { failedResult, successResult } from './strategies/common';

/** P0 strategies are built-in and mandatory. The entrypoint registers all six
    unconditionally; the constructor fails fast if any is missing. register()
    is only for adapters added after P2. */
export const P0_STRATEGY_IDS = [
  'native-input',
  'native-select',
  'ant-design-vue-select',
  'ant-design-vue-date-picker',
  'element-plus-select',
  'element-plus-date-picker',
] as const;

export interface FillerDeps {
  readonly verifier?: StateVerifier;
}

function isOutOfScopeResult(result: FillResult): boolean {
  return result.code === 'E_UNSUPPORTED_CONTROL' || result.skipReason === 'unsupported-control';
}

export function createFiller(
  strategies: readonly FillerStrategy[],
  deps: FillerDeps = {},
): Filler {
  const present = new Set(strategies.map((strategy) => strategy.id));
  for (const id of P0_STRATEGY_IDS) {
    if (!present.has(id)) {
      throw new Error('FAF: missing mandatory P0 filler strategy: ' + id);
    }
  }
  const list: FillerStrategy[] = [...strategies];

  /** Re-run the observable readback after an alternative assignment path. */
  async function verifyAfter(
    handle: FieldHandle,
    value: string,
    adapterId: string,
    start: number,
    attempts: number,
  ): Promise<FillResult | null> {
    const verifier = deps.verifier;
    if (!verifier) return null;
    try {
      const detail = await verifier.verify(handle, value, adapterId);
      if (detail.domValueMatched && detail.frameworkStateMatched) {
        return successResult(handle, value, start, attempts, detail);
      }
    } catch {
      // A broken verifier is never a success.
    }
    return null;
  }

  return {
    register(strategy: FillerStrategy): void {
      list.push(strategy);
    },

    async fill(
      handle: FieldHandle,
      value: string,
      ctx: FillContext,
    ): Promise<FillResult> {
      const start = performance.now();
      const strategy = list.find((candidate) => {
        try {
          return candidate.supports(handle);
        } catch {
          return false;
        }
      });
      if (!strategy) {
        // v2: never abandon a visible control without at least one generic
        // native assignment. Wrapper divs stay E_UNSUPPORTED_CONTROL.
        if (genericAssign(handle.element, value)) {
          const fallback = await verifyAfter(handle, value, 'generic-native', start, 1);
          if (fallback) return fallback;
        }
        return {
          ...failedResult(
            handle,
            'E_UNSUPPORTED_CONTROL',
            '可见控件无匹配策略，通用赋值后仍未通过回读',
            start,
          ),
          skipReason: 'unsupported-control',
        };
      }

      let result: FillResult;
      try {
        result = await strategy.fill(handle, value, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        // One adapter must never abort the remaining fields or leak an
        // uncaught exception into the host page.
        return failedResult(
          handle,
          'E_READBACK_MISMATCH',
          'domValueMatched: 策略执行异常（' + message + '）',
          start,
        );
      }
      if (result.verified || result.status === 'skipped' || isOutOfScopeResult(result)) {
        return result;
      }
      if (!deps.verifier) return result;
      const detail = result.verification;
      const retryable = detail
        ? !detail.domValueMatched || !detail.frameworkStateMatched
        : true;
      if (!retryable) return result;

      // Multi-path retry: component wrapper -> refocus/InputEvent -> IME
      // composition. Any path that reads back correctly wins immediately.
      for (const path of ASSIGNMENT_PATHS) {
        let applied = false;
        try {
          applied = path.run(handle, value);
        } catch {
          applied = false;
        }
        if (!applied) continue;
        const recovered = await verifyAfter(
          handle, value, path.id, start, result.attempts + 1,
        );
        if (recovered) return recovered;
      }
      return result;
    },
  };
}
