// @vitest-environment jsdom
/**
 * v2.1 UI / 契约「缺失即失败」判别器 + 独立 WCAG oracle + L2 回归护栏。
 * 静态锚点只是补充；AC-V2-20 的权威判据是 e2e-v2.mjs 里读 computed style
 * 并用 V21-INFRA-04 反向校验过的 wcagContrast，本文件不替代它。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DetectionContext, EffectiveRules, FieldHandle, Logger } from '../../src/contracts';
import { LIMITS } from '../../src/contracts';
import { SKIP_REASON_LABELS } from '../../src/contracts/field-metadata';
import { createDefaultRules, emptyPresets } from '../../src/config/default-rules';
import { infer } from '../../src/detection/infer';
import { buildDescriptor } from '../../src/detection/field-descriptor';
import { fieldLabel } from '../../src/ui/control-labels';
import { LOCKED_SKIP_REASONS } from './v21-helpers';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

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

const SILENT_LOGGER: Logger = { debug() { /* no-op */ }, warn() { /* no-op */ } };

describe('AC-V2-18 前端锚点契约（缺失即失败，不改成恒真）', () => {
  it('ResultBar.vue 渲染 data-faf="fallback" 标记节点并含四类信息', () => {
    const source = read('src/ui/components/ResultBar.vue');
    expect(source).toContain('data-faf="fallback"');
    expect(source).toContain('按标签生成');
    expect(source).toContain('来源');
    expect(source).toContain('语义词');
    expect(source).toContain('填入');
    expect(source).toContain('item.fallback.source');
    expect(source).toContain('item.fallback.semanticWord');
    expect(source).toContain('item.expected');
  });

  it('诊断行保留元素定位信息 data-field-id，兜底行内仍有 fieldId', () => {
    const source = read('src/ui/components/ResultBar.vue');
    expect(source).toContain(':data-field-id="item.fieldId"');
    expect(source).toContain('f-diag-row__locator');
    expect(source).toContain('item.fieldId');
  });

  it('fieldLabel(unknown) 为「按标签生成」，不再是「待绑定」', () => {
    expect(fieldLabel('unknown')).toBe('按标签生成');
    expect(fieldLabel('unknown')).not.toContain('待绑定');
  });

  it('low-confidence 的跳过文案改为「已按标签生成测试数据」', () => {
    expect(SKIP_REASON_LABELS['low-confidence']).toContain('已按标签生成测试数据');
  });
});

describe('AC-V2-17 契约镜像未被新增枚举值污染', () => {
  it('SKIP_REASON_LABELS 的键集合与锁定的 13 项 SkipReason 完全一致', () => {
    const actual = Object.keys(SKIP_REASON_LABELS).sort();
    const expected = [...LOCKED_SKIP_REASONS].sort();
    expect(actual).toEqual(expected);
  });
});

describe('AC-V2-13 L2 回归护栏：descriptor 仍打 low-confidence 标记', () => {
  it('语义未识别控件经真实 infer() 后仍为 unknown + low-confidence（只在 plan item 层清除）', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'v21-unknown-field';
    const label = document.createElement('label');
    label.setAttribute('for', 'v21-unknown-field');
    label.textContent = '来源表';
    document.body.appendChild(label);
    document.body.appendChild(input);

    const descriptor = buildDescriptor(input, 0, 0, 'form', document, true);
    const handle: FieldHandle = {
      descriptor, element: input, isConnected: () => input.isConnected,
    };
    const ctx: DetectionContext = {
      root: document, scope: 'form', rules: RULES, logger: SILENT_LOGGER,
    };
    const [inferred] = infer([handle], ctx);
    expect(inferred.inferredType).toBe('unknown');
    expect(inferred.skipReason).toBe('low-confidence');
    expect(inferred.confidence).toBeLessThan(LIMITS.CONFIDENCE_THRESHOLD);
  });
});

describe('AC-V2-20 独立 WCAG oracle（对齐 docs/UI-V2.1-REVIEW.md §2 实算表）', () => {
  /* 与 e2e-v2.mjs 内的 wcagContrast 相互独立的实现；两者都以 Designer
     已公布的 CR 作为第三方基准，防止任何一侧被写坏后假绿。 */
  const luminance = (hex: string): number => {
    const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = parts.map((v) =>
      (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const contrast = (fg: string, bg: string): number => {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const near = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected)).toBeLessThan(0.05);

  it('主按钮修复后 #FFFFFF / #0369A1 = 5.93:1（PASS）', () => {
    near(contrast('#FFFFFF', '#0369A1'), 5.93);
    expect(contrast('#FFFFFF', '#0369A1')).toBeGreaterThanOrEqual(4.5);
  });

  it('主按钮 BUG 态 color:inherit 时 #16202E / #0369A1 = 2.76:1（必须 FAIL）', () => {
    near(contrast('#16202E', '#0369A1'), 2.76);
    expect(contrast('#16202E', '#0369A1')).toBeLessThan(4.5);
  });

  it('文字按钮 #0369A1 / #FFFFFF = 5.93:1；悬浮球与提示 #FFFFFF / #0C4A6E = 9.46:1', () => {
    near(contrast('#0369A1', '#FFFFFF'), 5.93);
    near(contrast('#FFFFFF', '#0C4A6E'), 9.46);
  });

  it('dark 主按钮 #082F49 / #38BDF8 = 6.48:1；禁用组合 #FFFFFF / #0284C7 = 4.10:1 仍不达标', () => {
    near(contrast('#082F49', '#38BDF8'), 6.48);
    near(contrast('#FFFFFF', '#0284C7'), 4.10);
    expect(contrast('#FFFFFF', '#0284C7')).toBeLessThan(4.5);
  });
});

describe('团队 P0 绝对规则静态扫描（UI 层）', () => {
  const EMOJI = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const PURPLE_PINK = /from-purple[\s\S]{0,40}to-pink|7C3AED[\s\S]{0,40}(?:A855F7|EC4899)/i;
  const AI_FILLER = /Welcome to|Lorem ipsum|Sign up today/i;

  it('ResultBar.vue / Fab.vue / injected.css 零 emoji 功能图标、零紫粉渐变、零空洞文案', () => {
    for (const file of [
      'src/ui/components/ResultBar.vue',
      'src/ui/components/Fab.vue',
      'src/ui/styles/injected.css',
      'src/styles/tokens.css',
    ]) {
      const source = read(file);
      expect(EMOJI.test(source), file + ' emoji').toBe(false);
      expect(PURPLE_PINK.test(source), file + ' purple-pink gradient').toBe(false);
      expect(AI_FILLER.test(source), file + ' filler copy').toBe(false);
    }
  });

  it('injected.css 不再对 .f-root button 强制 color: inherit（根因回归护栏）', () => {
    const source = read('src/ui/styles/injected.css');
    const buttonRule = /\.f-root button[^{]*\{([^}]*)\}/g;
    const matches = [...source.matchAll(buttonRule)];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match[1]).not.toMatch(/color\s*:\s*inherit/);
    }
  });
});
