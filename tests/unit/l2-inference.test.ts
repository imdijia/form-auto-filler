// @vitest-environment jsdom
/**
 * L2 Chinese-first field type inference (SPEC-v1 §2 A2 / §9 AC-5, PRD-v1 §8 AC-5).
 *
 * Bound to the real public export `infer(handles, ctx)` from src/detection/**
 * (ARCH-v1 §5.2 infer.ts, interfaces.ts FieldDetector.infer). These cases
 * RUN FOR REAL. Inputs are built only from locked contract data
 * (createDefaultRules + field-types.json aliases), never from implementation
 * internals.
 */
import { describe, it, expect } from 'vitest';
import fieldTypesDoc from '../../docs/contracts/field-types.json';
import { LIMITS } from '../../docs/contracts/types';
import { createDefaultRules } from '../../src/config/default-rules';
import { loadContract, loadGateMessage, modOf, skipTag } from '../helpers/load-contract';
import { makeConstraints, makeField } from '../helpers/fixtures';

type InferModule = {
  infer: (handles: readonly unknown[], ctx: unknown) => Array<{
    inferredType: string;
    confidence: number;
    scoreBreakdown: Record<string, number>;
    skipReason?: string;
  }>;
};

const load = await loadContract<InferModule>(
  import.meta.glob('../../src/detection/**/*.ts'),
  'src/detection/** (infer)',
  ['infer'],
);

const t = load.state === 'ready' ? it : it.skip;
const tag = skipTag(load);
const m = modOf(load);

function effectiveRules() {
  const doc = createDefaultRules();
  return {
    aliasDictionary: doc.global.aliasDictionary,
    weights: doc.global.weights,
    generators: doc.global.generators,
    confidenceThreshold: LIMITS.CONFIDENCE_THRESHOLD,
    pageOverrides: [],
    presets: doc.global.presets,
  };
}

function runInfer(field: ReturnType<typeof makeField>) {
  const handle = {
    descriptor: field,
    element: document.createElement('div'),
    isConnected: () => true,
  };
  const ctx = {
    root: document.body,
    scope: 'form',
    rules: effectiveRules(),
    logger: { debug: () => {}, warn: () => {} },
  };
  return m.infer([handle], ctx)[0];
}

/** dictEnum needs page options by contract; without them inference must not hard-guess. */
function withOptionsFor(key: string): Partial<ReturnType<typeof makeField>> {
  return key === 'dictEnum' ? { enumOptions: ['中共党员', '共青团员', '群众'] } : {};
}

describe('L2 推断：20 类别名 / 打分优先级 / 低置信度 / 页面枚举', () => {
  const gate = loadGateMessage(load);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${load.path}`, () => {
      throw new Error(gate);
    });
  }

  t(`${tag}TC-L2-01 20 类字段各自首个别名均能命中且置信度 >= 0.6`, () => {
    for (const type of fieldTypesDoc.types) {
      const alias = type.aliases[0];
      const field = makeField({
        textFeatures: { ...makeField().textFeatures, label: alias },
        ...withOptionsFor(type.key),
      });
      const out = runInfer(field);
      expect([alias, out.inferredType, out.confidence >= LIMITS.CONFIDENCE_THRESHOLD]).toEqual([
        alias,
        type.key,
        true,
      ]);
    }
  });

  t(`${tag}TC-L2-02 label 与 placeholder 冲突时 label 优先（featurePriority）`, () => {
    const field = makeField({
      textFeatures: {
        label: '手机号码',
        placeholder: '姓名',
        name: '',
        elementId: '',
        ariaLabel: '',
        nearbyText: '',
      },
    });
    const out = runInfer(field);
    expect(out.inferredType).toBe('phone');
    expect(Object.keys(out.scoreBreakdown)).toEqual(expect.arrayContaining(['label', 'placeholder']));
    expect(out.scoreBreakdown.label).toBeGreaterThan(out.scoreBreakdown.placeholder);
  });

  t(`${tag}TC-L2-03 无任何特征的字段置信度 < 0.6 必须落 unknown，不硬猜`, () => {
    const out = runInfer(makeField());
    expect(out.inferredType).toBe('unknown');
    expect(out.confidence).toBeLessThan(LIMITS.CONFIDENCE_THRESHOLD);
    expect(out.skipReason).toBe('low-confidence');
  });

  t(`${tag}TC-L2-04 仅凭页面 option 枚举不得硬猜成具体业务类型`, () => {
    const out = runInfer(makeField({
      controlType: 'select',
      enumOptions: ['中共党员', '共青团员', '群众'],
    }));
    expect(['dictEnum', 'gender', 'education', 'jobTitle', 'region', 'unknown']).toContain(out.inferredType);
    expect(['idCard', 'phone', 'email', 'amount', 'quantity', 'percentage', 'date']).not.toContain(
      out.inferredType,
    );
  });

  t(`${tag}TC-L2-05 正则特征参与打分但单独不足以硬猜（maxlength=18）`, () => {
    const out = runInfer(makeField({ constraints: makeConstraints({ maxLength: 18 }) }));
    // A lone regex hint must NOT clear 0.6 - that is the "never hard-guess" rule.
    expect(out.scoreBreakdown.regexFeature).toBeGreaterThan(0);
    expect(out.confidence).toBeLessThan(LIMITS.CONFIDENCE_THRESHOLD);
    expect(out.inferredType).toBe('unknown');
  });

  t(`${tag}TC-L2-06 页面 option 不得压过 label 命中`, () => {
    const out = runInfer(makeField({
      textFeatures: { ...makeField().textFeatures, label: '手机号码' },
      enumOptions: ['男', '女'],
    }));
    expect(out.inferredType).toBe('phone');
  });
});
