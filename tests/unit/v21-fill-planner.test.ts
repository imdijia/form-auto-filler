// @vitest-environment jsdom
/**
 * AC-V2-15 / AC-V2-17 计划层单元测试：引用真实 createFillPlanner 与真实
 * generateFallbackValue。判别器全部针对「plan item」而非 descriptor：
 * 按 team-lead 口径，L2 的 low-confidence 标记仍保留在 descriptor 上，
 * 只在 plan item 层清除，故不写「descriptor 上不存在 low-confidence」的断言。
 */
import { describe, it, expect } from 'vitest';
import type {
  DataProvider, EffectiveRules, FieldDescriptor, FillContext, SkipReason,
} from '../../src/contracts';
import { LIMITS } from '../../src/contracts';
import { createDefaultRules, emptyPresets } from '../../src/config/default-rules';
import { createFillPlanner } from '../../src/execution/fill-planner';
import { generateFallbackValue } from '../../src/data/generators/fallback-text';
import { makeV21Field, v21Rng, LOCKED_SKIP_REASONS } from './v21-helpers';

const RULES: EffectiveRules = (() => {
  const doc = createDefaultRules();
  return {
    aliasDictionary: doc.global.aliasDictionary,
    weights: doc.global.weights,
    generators: doc.global.generators,
    confidenceThreshold: LIMITS.CONFIDENCE_THRESHOLD,
    pageOverrides: [],
    presets: emptyPresets(),
  };
})();

const CTX: FillContext = {
  sessionId: 's-v21-unit',
  seed: 4821,
  siteKey: 'unit',
  pageKey: 'unit',
  generated: new Map(),
  locale: 'zh-CN',
  now: '2026-11-10T00:00:00.000Z',
};

/** Delegate unknown fields to the REAL generator; a fixed literal is a test
    double for recognised types (no implementation logic copied into tests). */
const REAL_FALLBACK_PROVIDER: DataProvider = {
  id: 'v21-real-fallback-provider',
  getValue(field: FieldDescriptor): string {
    if (field.inferredType === 'unknown') {
      return generateFallbackValue(field, v21Rng(field.id));
    }
    return 'KNOWN-GENERATOR-VALUE';
  },
};

const planner = () => createFillPlanner({ structureHash: 'hash-v21', driftDetected: false });

const labelled = (id: string, label: string) => makeV21Field({
  id,
  textFeatures: {
    label, placeholder: '', name: '', elementId: '', ariaLabel: '', nearbyText: '',
  },
});

describe('AC-V2-15 unknown 字段在 plan item 层变为选中且清除 low-confidence', () => {
  it('unknown + low-confidence 的 item 为 selected=true、skipReason=undefined、值非空', async () => {
    const field = labelled('f0-0-source', '来源表');
    field.skipReason = 'low-confidence';
    const plan = await planner().plan([field], RULES, CTX, REAL_FALLBACK_PROVIDER);
    const item = plan.items[0];
    expect(item.fieldId).toBe('f0-0-source');
    expect(item.fieldType).toBe('unknown');
    expect(item.selected).toBe(true);
    expect(item.skipReason).toBeUndefined();
    expect(item.value).toContain('我是来源表测试数据');
  });

  it('descriptor 上的 low-confidence 标记未被计划层抹除（保护既有 l2-inference 断言）', async () => {
    const field = labelled('f0-0-org', '所在单位');
    field.skipReason = 'low-confidence';
    await planner().plan([field], RULES, CTX, REAL_FALLBACK_PROVIDER);
    expect(field.skipReason).toBe('low-confidence');
    expect(field.inferredType).toBe('unknown');
  });

  it('多个 unknown 字段同批全部选中且值互不重复', async () => {
    const fields = [
      labelled('f0-0-a', '同名登记项'),
      labelled('f0-0-b', '同名登记项'),
      labelled('f0-0-c', '来源表'),
    ];
    for (const f of fields) f.skipReason = 'low-confidence';
    const plan = await planner().plan(fields, RULES, CTX, REAL_FALLBACK_PROVIDER);
    expect(plan.items).toHaveLength(3);
    expect(plan.items.every((i) => i.selected === true)).toBe(true);
    expect(plan.items.every((i) => i.value.length > 0)).toBe(true);
    expect(new Set(plan.items.map((i) => i.value)).size).toBe(3);
  });
});

describe('AC-V2-15 / AC-V2-03 硬保护控件不进入兜底生成', () => {
  it('readonly / disabled / hidden / file / captcha 等硬跳过项 selected=false 且值为空', async () => {
    const reasons: SkipReason[] = [
      'readonly', 'disabled', 'hidden', 'file', 'captcha',
      'outside-form', 'search-or-filter', 'has-value',
      'user-unchecked', 'rule-excluded', 'unsupported-control', 'field-limit-exceeded',
    ];
    const fields = reasons.map((reason, index) =>
      makeV21Field({ id: 'f0-0-hard-' + index, skipReason: reason }));
    const plan = await planner().plan(fields, RULES, CTX, REAL_FALLBACK_PROVIDER);
    for (let i = 0; i < plan.items.length; i += 1) {
      expect(plan.items[i].selected).toBe(false);
      expect(plan.items[i].value).toBe('');
      expect(plan.items[i].skipReason).toBe(reasons[i]);
    }
  });
});

describe('AC-V2-17 pattern 无法满足只跳过本字段，沿用既有枚举', () => {
  it('兜底失败的 unknown item 使用既有 unsupported-control 枚举且带非枚举 fallbackFailure 标记', async () => {
    const field = makeV21Field({
      id: 'f0-0-pattern-unsat',
      textFeatures: {
        label: '格式受限项', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        pattern: '[A-Z]{3}-[0-9]{4}',
      },
    });
    const plan = await planner().plan([field], RULES, CTX, REAL_FALLBACK_PROVIDER);
    const item = plan.items[0];
    expect(item.value).toBe('');
    expect(item.selected).toBe(false);
    expect(item.skipReason).toBe('unsupported-control');
    expect(LOCKED_SKIP_REASONS).toContain(item.skipReason);
    expect((item as { fallbackFailure?: boolean }).fallbackFailure).toBe(true);
    expect(Object.keys(item)).not.toContain('fallbackFailure');
  });

  it('pattern 失败字段不阻塞同批其它 unknown 字段继续生成', async () => {
    const blocked = makeV21Field({
      id: 'f0-0-blocked',
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        pattern: '[A-Z]{3}-[0-9]{4}',
      },
    });
    const sibling = labelled('f0-0-sibling', '来源表');
    const plan = await planner().plan([blocked, sibling], RULES, CTX, REAL_FALLBACK_PROVIDER);
    expect(plan.items[0].selected).toBe(false);
    expect(plan.items[1].selected).toBe(true);
    expect(plan.items[1].value).toContain('我是来源表测试数据');
  });

  it('SkipReason 锁定全集不含任何新增枚举值', async () => {
    const field = makeV21Field({
      id: 'f0-0-enum',
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        pattern: '[A-Z]{3}-[0-9]{4}',
      },
    });
    const plan = await planner().plan([field], RULES, CTX, REAL_FALLBACK_PROVIDER);
    for (const item of plan.items) {
      if (item.skipReason !== undefined) {
        expect(LOCKED_SKIP_REASONS).toContain(item.skipReason);
      }
    }
  });
});

describe('AC-V2-13 已识别字段与计划形状回归', () => {
  it('已识别字段仍走生成器且计划形状（sessionId / structureHash / batches）不变', async () => {
    const known = makeV21Field({ id: 'f0-0-known', inferredType: 'personName' });
    const unknown = labelled('f0-0-unknown', '来源表');
    const plan = await planner().plan([known, unknown], RULES, CTX, REAL_FALLBACK_PROVIDER);
    expect(plan.items[0].value).toBe('KNOWN-GENERATOR-VALUE');
    expect(plan.items[0].selected).toBe(true);
    expect(plan.items[1].value).toContain('我是来源表测试数据');
    expect(plan.sessionId).toBe(CTX.sessionId);
    expect(plan.structureHash).toBe('hash-v21');
    expect(plan.driftDetected).toBe(false);
    expect(typeof plan.createdAt).toBe('string');
    expect(plan.batches.flat().length).toBe(plan.items.length);
  });

  it('超过 FILL_BATCH_SIZE 时按固定大小分批，unknown 仍全被选中', async () => {
    const fields = Array.from({ length: 25 }, (_, i) =>
      labelled('f0-0-batch-' + i, '来源表'));
    const plan = await planner().plan(fields, RULES, CTX, REAL_FALLBACK_PROVIDER);
    expect(plan.items).toHaveLength(25);
    expect(plan.batches).toHaveLength(2);
    expect(plan.items.every((i) => i.selected === true)).toBe(true);
    expect(plan.items.every((i) => i.value.length > 0)).toBe(true);
  });
});
