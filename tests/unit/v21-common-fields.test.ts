// @vitest-environment jsdom
/**
 * P0 回归（team-lead 项目外探针实证）：组件库常见字段只给 placeholder 时不得
 * 被 L2 判成 unknown 而掉进兜底生成。用户截图实测被填成
 * 「我是请输入网格员姓名测试数据·NN」/「我是请输入网格员手机号测试数据·NN」，
 * 手机号还被页面判「请输入正确的手机号」。
 *
 * 本文件只新建、不改任何既有用例；全部断言引用真实模块：
 *   buildDescriptor / infer / generateFallbackValue / createFillPlanner /
 *   createRandomProvider / createGeneratedRecord / matchAlias。
 * 不把实现逻辑复制进测试，不断言任何具体种子输出值。
 *
 * 判别前提：修复前（分母固定 label(1.0)+regexFeature(0.4)=1.4，单 placeholder
 * 命中 0.7 权重）这四类字段 confidence≈0.51、inferredType='unknown'、
 * skipReason='low-confidence'，本文件全部断言必然变红；修复后必须真实转绿。
 * 同时保留两条反向护栏（无特征 / 无别名 placeholder 仍须 unknown），
 * 防止「把所有字段都识别成 personName」这类恒真式假修复蒙混过关。
 */
import { describe, it, expect } from 'vitest';
import type {
  DetectionContext, EffectiveRules, FieldDescriptor, FieldHandle, FillContext,
} from '../../src/contracts';
import { LIMITS } from '../../src/contracts';
import { createDefaultRules, emptyPresets } from '../../src/config/default-rules';
import { buildDescriptor } from '../../src/detection/field-descriptor';
import { infer } from '../../src/detection/infer';
import { matchAlias } from '../../src/detection/scoring/alias-dictionary';
import { generateFallbackValue } from '../../src/data/generators/fallback-text';
import { createFillPlanner } from '../../src/execution/fill-planner';
import { createRandomProvider } from '../../src/data/providers/random-provider';
import { createGeneratedRecord } from '../../src/data/consistency';
import { v21Rng, LOCKED_SKIP_REASONS } from './v21-helpers';

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
  sessionId: 's-v21-common',
  seed: 4821,
  siteKey: 'unit',
  pageKey: 'unit',
  generated: new Map(),
  locale: 'zh-CN',
  now: '2026-11-10T00:00:00.000Z',
};

const DETECT_CTX = {
  rules: RULES,
  root: null,
  scope: 'form',
  logger: { debug() {}, warn() {} },
} as unknown as DetectionContext;

/** 用真实 buildDescriptor + infer 从 DOM 结构产出 descriptor；不复制 L1/L2。 */
function detect(html: string): FieldDescriptor {
  document.body.innerHTML = `<div role="dialog" id="qa-scope">${html}</div>`;
  const input = document.querySelector('input') as HTMLElement | null;
  if (!input) throw new Error('fixture has no input');
  const descriptor = buildDescriptor(input, 0, 0, 'form', document, true);
  const handle: FieldHandle = { descriptor, element: input, isConnected: () => true };
  return infer([handle], DETECT_CTX)[0] as FieldDescriptor;
}

interface CommonCase {
  readonly key: string;
  readonly type: 'personName' | 'phone' | 'idCard';
  readonly html: string;
  readonly valueRe: RegExp;
}

/** 四个控件刻意不带 id / name / aria-label，label 无 for 或完全缺失，
    与 .e2e-tmp/fixtures/fallback.html #grp-common 的判别意图一致。 */
const CASES: readonly CommonCase[] = [
  {
    key: 'cf-name-a',
    type: 'personName',
    html: '<div class="el-form-item">'
      + '<label class="el-form-item__label">姓名</label>'
      + '<div class="el-form-item__content">'
      + '<input data-qa-id="cf-name-a" type="text" placeholder="请输入网格员姓名">'
      + '</div></div>',
    valueRe: /^[\u4e00-\u9fa5]{2,4}$/,
  },
  {
    key: 'cf-name-b',
    type: 'personName',
    html: '<div class="cf-plain">'
      + '<input data-qa-id="cf-name-b" type="text" placeholder="请输入网格员姓名">'
      + '</div>',
    valueRe: /^[\u4e00-\u9fa5]{2,4}$/,
  },
  {
    key: 'cf-phone',
    type: 'phone',
    html: '<div class="cf-plain">'
      + '<input data-qa-id="cf-phone" type="tel" placeholder="请输入网格员手机号">'
      + '</div>',
    valueRe: /^1[3-9][0-9]{9}$/,
  },
  {
    key: 'cf-idcard',
    type: 'idCard',
    html: '<div class="cf-plain">'
      + '<input data-qa-id="cf-idcard" type="text" placeholder="请输入网格员身份证号">'
      + '</div>',
    valueRe: /^[0-9]{17}[0-9X]$/,
  },
];

describe('P0 回归：label 缺失但 placeholder 强命中必须识别为真实字段类型', () => {
  it.each(CASES)('$key → $type（confidence 达阈值、无 low-confidence、不走兜底）', (c) => {
    const field = detect(c.html);
    expect(field.inferredType).toBe(c.type);
    expect(field.confidence).toBeGreaterThanOrEqual(RULES.confidenceThreshold);
    expect(field.skipReason).not.toBe('low-confidence');
    if (field.skipReason !== undefined) {
      expect(LOCKED_SKIP_REASONS).toContain(field.skipReason);
    }
    // 一旦识别为真实类型，兜底生成器必须对该字段返回空串（不写「我是…测试数据」）。
    expect(generateFallbackValue(field, v21Rng(field.id))).toBe('');
    expect(field.scoreBreakdown && Object.keys(field.scoreBreakdown).length).toBeGreaterThan(0);
  });

  it.each(CASES)('$key → 真实 provider 产出合法值且 plan item 为 selected', async (c) => {
    const field = detect(c.html);
    const provider = createRandomProvider(createGeneratedRecord(CTX.seed), RULES, CTX.seed);
    const plan = await createFillPlanner({ structureHash: 'hash-v21-common', driftDetected: false })
      .plan([field], RULES, CTX, provider);
    const item = plan.items[0];
    expect(item).toBeDefined();
    expect(item.fieldType).toBe(c.type);
    expect(item.selected).toBe(true);
    expect(item.skipReason).toBeUndefined();
    expect(item.value).toMatch(c.valueRe);
    expect(item.value).not.toContain('我是');
    expect(item.value).not.toContain('测试数据');
    expect(item.value).not.toContain('请输入');
  });
});

describe('P0 回归护栏：修复不得变成「任何字段都识别成 personName」', () => {
  it('无任何文本特征的控件仍为 unknown，且兜底生成仍可用', () => {
    const field = detect('<div class="cf-plain"><input type="text"></div>');
    expect(field.inferredType).toBe('unknown');
    expect(field.skipReason).toBe('low-confidence');
    expect(generateFallbackValue(field, v21Rng(field.id))).toContain('我是该字段测试数据');
  });

  it('placeholder 不命中任何别名时仍为 unknown（先自证该串确无别名）', () => {
    const text = '请输入任意占位内容';
    expect(matchAlias(text, RULES.aliasDictionary)).toBeUndefined();
    const field = detect(`<div class="cf-plain"><input type="text" placeholder="${text}"></div>`);
    expect(field.inferredType).toBe('unknown');
    expect(generateFallbackValue(field, v21Rng(field.id)).length).toBeGreaterThan(0);
  });

  it('普通 label[for] 路径不回归，仍是 personName', () => {
    const field = detect('<div>'
      + '<label for="qa-normal">姓名</label>'
      + '<input id="qa-normal" type="text" placeholder="请输入网格员姓名">'
      + '</div>');
    expect(field.inferredType).toBe('personName');
    expect(field.confidence).toBeGreaterThanOrEqual(RULES.confidenceThreshold);
  });

  it('placeholder 带「请输入」装饰词时仍能命中别名', () => {
    const field = detect('<div class="cf-plain">'
      + '<input type="text" placeholder="请输入姓名">'
      + '</div>');
    expect(field.inferredType).toBe('personName');
    expect(generateFallbackValue(field, v21Rng(field.id))).toBe('');
  });
});
