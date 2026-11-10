// @vitest-environment jsdom
/**
 * AC-V2-18 诊断元数据单元测试：引用真实 buildSingleDiagnostic /
 * buildDiagnostics / copyDiagnosticsJson，不复制实现。
 * 「缺失即失败」的锚点：fallback.source / fallback.semanticWord 若未落地，
 * 本文件必然变红；四类既有语义与 {tool,generatedAt,items} 形状一条不删不弱。
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  FieldDescriptor, FieldHandle, FillPlan, FillReport, FillResult, PlanItem,
} from '../../src/contracts';
import {
  buildDiagnostics, buildSingleDiagnostic,
} from '../../src/execution/diagnostics';
import { copyDiagnosticsJson } from '../../src/runtime/diagnostics-copy';
import { FALLBACK_PATTERN_FAIL_REASON } from '../../src/data/generators/fallback-text';
import { makeV21Field, LOCKED_SKIP_REASONS } from './v21-helpers';

/* 测试自有的夹具输入值，不是对实现输出的硬编码断言。断言只验证
   diagnostic 原样保留传入的 PlanItem.value / DOM 值（反作弊规则 4）。 */
const SOURCE_VALUE = 'QA-FALLBACK-FIXTURE-VALUE-36';

function descriptorWithLabel(label: string): FieldDescriptor {
  return makeV21Field({
    id: 'f0-0-source',
    textFeatures: {
      label, placeholder: '', name: '', elementId: '', ariaLabel: '', nearbyText: '',
    },
  });
}

function handleFor(field: FieldDescriptor, domValue: string): FieldHandle {
  const element = document.createElement('input');
  element.type = 'text';
  element.value = domValue;
  document.body.appendChild(element);
  return { descriptor: field, element, isConnected: () => element.isConnected };
}

function filledResult(value: string): FillResult {
  return {
    fieldId: 'f0-0-source',
    status: 'filled',
    verified: true,
    value,
    controlType: 'input',
    attempts: 1,
    elapsedMs: 1,
    verification: {
      domValueMatched: true,
      frameworkStateMatched: true,
      validationCleared: true,
      evidence: ['adapter:native-input'],
      checkedAt: '2026-11-10T00:00:00.000Z',
    },
  };
}

function filledItem(value = SOURCE_VALUE): PlanItem {
  return {
    fieldId: 'f0-0-source',
    fieldType: 'unknown',
    value,
    selected: true,
    batch: 0,
    dependsOn: [],
  };
}

describe('AC-V2-18 四类既有语义不被新增元数据挤掉', () => {
  it('单个诊断行始终含 fieldId / expected / actualDom / strategyId / failureReason', () => {
    const field = descriptorWithLabel('来源表');
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), handleFor(field, SOURCE_VALUE), '来源表',
    );
    expect(diag.fieldId).toBe('f0-0-source');
    expect(diag.expected).toBe(SOURCE_VALUE);
    expect(diag.actualDom).toBe(SOURCE_VALUE);
    expect(diag.strategyId).toBe('native-input');
    expect(typeof diag.failureReason).toBe('string');
    expect(diag.failureReason.length).toBeGreaterThan(0);
    expect(Array.isArray(diag.evidence)).toBe(true);
  });

  it('诊断不从报告伪造 DOM 实际值，而是从现场 handle 回读', () => {
    const field = descriptorWithLabel('来源表');
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), handleFor(field, 'DOM-ACTUAL-VALUE'), '来源表',
    );
    expect(diag.expected).toBe(SOURCE_VALUE);
    expect(diag.actualDom).toBe('DOM-ACTUAL-VALUE');
  });

  it('buildDiagnostics 对 plan 每个 item 产出一行且行内保留元素定位信息', () => {
    const field = descriptorWithLabel('来源表');
    const plan: FillPlan = {
      sessionId: 's-v21', items: [filledItem()], batches: [[filledItem()]],
      structureHash: 'h', driftDetected: false, createdAt: '2026-11-10T00:00:00.000Z',
    };
    const report: FillReport = {
      sessionId: 's-v21', total: 1, filled: 1, skipped: 0, failed: 0,
      outcomes: [filledResult(SOURCE_VALUE)], elapsedMs: 1,
    };
    const handles = new Map<string, FieldHandle>([['f0-0-source', handleFor(field, SOURCE_VALUE)]]);
    const rows = buildDiagnostics(plan, report, handles, { 'f0-0-source': '来源表' });
    expect(rows).toHaveLength(1);
    expect(rows[0].fieldId).toBe('f0-0-source');
    expect(rows[0].label).toBe('来源表');
    for (const row of rows) {
      expect(row).toHaveProperty('expected');
      expect(row).toHaveProperty('actualDom');
      expect(row).toHaveProperty('strategyId');
      expect(row).toHaveProperty('failureReason');
    }
  });
});

describe('AC-V2-18 兜底字段新增「按标签生成」元数据', () => {
  it('unknown 且已写入的字段携带 fallback.source 与 fallback.semanticWord', () => {
    const field = descriptorWithLabel('来源表');
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), handleFor(field, SOURCE_VALUE), '来源表',
    );
    expect(diag.fallback).toEqual({ source: 'label', semanticWord: '来源表' });
  });

  it('取值来源随真实 descriptor 变化（placeholder 来源可核对）', () => {
    const field = makeV21Field({
      id: 'f0-0-source',
      textFeatures: {
        label: '', placeholder: '请输入自定义编号', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), handleFor(field, SOURCE_VALUE), '自定义编号',
    );
    expect(diag.fallback?.source).toBe('placeholder');
    expect(diag.fallback?.semanticWord).toContain('自定义编号');
  });

  it('语义词全部取不到时诊断仍给出「该字段」来源标记，不含空串', () => {
    const field = makeV21Field({ id: 'f0-0-source' });
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), handleFor(field, SOURCE_VALUE), '未命名控件',
    );
    expect(diag.fallback?.source).toBe('default');
    expect(diag.fallback?.semanticWord).toBe('该字段');
  });

  it('无 handle 时不伪造 fallback 元数据（不得恒真通过）', () => {
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), undefined, '来源表',
    );
    expect(diag.fallback).toBeUndefined();
    expect(diag.actualDom).toBe('');
  });
});

describe('AC-V2-17 pattern 失败行的原因文案与既有枚举', () => {
  it('fallbackFailure 标记渲染为「pattern 无法满足，未生成值」并沿用 unsupported-control', () => {
    const item = filledItem('');
    Object.defineProperty(item, 'fallbackFailure', { value: true, enumerable: false });
    const skipped: FillResult = {
      fieldId: 'f0-0-source', status: 'skipped', verified: false,
      skipReason: 'unsupported-control', controlType: 'input', attempts: 0, elapsedMs: 0,
    };
    const diag = buildSingleDiagnostic(item, skipped, undefined, '格式受限项');
    expect(diag.failureReason).toBe(FALLBACK_PATTERN_FAIL_REASON);
    expect(diag.failureReason).toBe('pattern 无法满足，未生成值');
    expect(diag.skipReason).toBe('unsupported-control');
    expect(LOCKED_SKIP_REASONS).toContain(diag.skipReason);
    expect(diag.fallback).toBeUndefined();
  });
});

describe('AC-V2-06 / AC-V2-18 复制诊断 JSON 的包络形状', () => {
  it('copyDiagnosticsJson 产出 {tool, generatedAt, items} 可 parse 的本地文本，零外发', async () => {
    let captured = '';
    const writeText = vi.fn(async (text: string) => { captured = text; });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText }, configurable: true,
    });
    const field = descriptorWithLabel('来源表');
    const diag = buildSingleDiagnostic(
      filledItem(), filledResult(SOURCE_VALUE), handleFor(field, SOURCE_VALUE), '来源表',
    );
    const ok = await copyDiagnosticsJson([diag]);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(captured);
    expect(parsed.tool).toBe('form-auto-filler');
    expect(typeof parsed.generatedAt).toBe('string');
    expect(parsed.generatedAt.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toHaveProperty('expected');
    expect(parsed.items[0]).toHaveProperty('actualDom');
    expect(parsed.items[0]).toHaveProperty('strategyId');
    expect(parsed.items[0]).toHaveProperty('failureReason');
    expect(parsed.items[0].fallback).toEqual({ source: 'label', semanticWord: '来源表' });
  });
});
