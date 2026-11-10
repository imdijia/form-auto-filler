/**
 * C5 — Orthogonal-dimension / UI-presentation contract gates.
 *
 * Authority (architect + designer sync, 2026-11-09):
 *  - `ControlType` is FIVE classes: input / select / date / textarea / other,
 *    declared in `docs/contracts/types.ts` L42, mapped in ARCH-v1 §17.6 L1368.
 *    `docs/UIUX-v1.md` 文首 R1–R8 索引是历史留痕，不是现行规则集。
 *  - `unknown` is a low-confidence sentinel, NOT one of the 20 FieldTypes,
 *    NOT a generator target, NOT a picker-bindable item; counting uses
 *    `field_unknown` (one of 11 LocalCounterEvents).
 *  - `E_UNSUPPORTED_CONTROL` is a result-panel HANDLING GROUP, never a
 *    ControlType value, never mixed into failures, never in the
 *    zero-config denominator. `f-control-type` must not contain 「超范围控件」.
 *  - `LIMITS` in `docs/contracts/types.ts` is the sole authority for
 *    0.6 / 100 / 200; field-types.json only mirrors the default.
 *  - `docs/contracts/*` and `src/contracts/*` six files are byte-identical.
 *
 * These are real assertions against locked artifacts + real public exports.
 * No snapshot, no tautology, no `expect(true)`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FIELD_TYPES, LIMITS, type ControlType, type FieldType } from '../../docs/contracts/types';
import fieldTypesDoc from '../../docs/contracts/field-types.json';
import { CONTROL_TYPE_LABELS } from '../../src/contracts/field-metadata';
import { BINDABLE_TYPES, controlLabel, fieldLabel } from '../../src/ui/control-labels';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
function read(relative: string): string {
  return readFileSync(ROOT + relative, 'utf8');
}
function bytes(relative: string): Buffer {
  return readFileSync(ROOT + relative);
}

const typesSource = read('docs/contracts/types.ts');
const panelSource = read('src/ui/components/PlanPanel.vue');
const uiuxSource = read('docs/UIUX-v1.md');
const archSource = read('docs/ARCH-v1.md');
const prdSource = read('docs/PRD-v1.md');

const CONTROL_TYPES: ControlType[] = ['input', 'select', 'date', 'textarea', 'other'];
const CONTROL_LABELS = ['输入框', '下拉', '日期', '文本域', '其他'];

describe('C5-1 ControlType 恰好 5 类（权威 types.ts L42 / ARCH §17.6）', () => {
  it('types.ts 的 ControlType 联合精确为 5 个 slug，顺序固定、无「超范围控件」', () => {
    const body = /export type ControlType =([^;]+);/.exec(typesSource)?.[1] ?? '';
    const members = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(members).toEqual(CONTROL_TYPES);
    expect(new Set(members).size).toBe(5);
    expect(body).not.toContain('超范围控件');
  });

  it('ARCH §17.6 映射表与正文口径均为 5 类，含 other → 其他', () => {
    expect(archSource).toContain('### 17.6 控件类型映射');
    expect(archSource).toMatch(/\| `other` \| 其他 \|/);
    expect(archSource).toContain('`input` / `select` / `date` / `textarea` / `other`');
  });

  it('UIUX 文首索引明确标注为修订历史留痕，现行口径指向 R9–R15 / 正文 / 契约', () => {
    expect(uiuxSource).toContain('本表为修订历史留痕');
    expect(uiuxSource).toContain('现行口径一律以 R9 至 R15');
    expect(uiuxSource).toContain('`docs/contracts/*`');
    // The v1.1-era 4-class wording must be explicitly marked as historical.
    expect(uiuxSource).toMatch(/R1[\s\S]{0,400}4 类[\s\S]{0,400}现行|v1\.1 当时 4 类/);
  });
});

describe('C5-2 控件类型纯文本标签（运行时元数据真跑）', () => {
  it('CONTROL_TYPE_LABELS 键/值精确为 5 类中文标签', () => {
    expect(Object.keys(CONTROL_TYPE_LABELS)).toEqual(CONTROL_TYPES);
    expect(Object.values(CONTROL_TYPE_LABELS)).toEqual(CONTROL_LABELS);
  });

  it('controlLabel 对 5 类返回纯文本，未知值降级为「其他」', () => {
    for (let i = 0; i < CONTROL_TYPES.length; i += 1) {
      expect(controlLabel(CONTROL_TYPES[i])).toBe(CONTROL_LABELS[i]);
    }
    expect(controlLabel('unlisted' as ControlType)).toBe('其他');
  });

  it('f-control-type 列只渲染 controlLabel()，绝不出现「超范围控件」字样', () => {
    const spans = [...panelSource.matchAll(/<span class="f-control-type">([\s\S]*?)<\/span>/g)].map((m) => m[1]);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => s.includes('controlLabel('))).toBe(true);
    expect(spans.some((s) => s.includes('超范围控件'))).toBe(false);
  });

  it('控件类型列与字段类型列互不覆盖；超范围单列且明示「不计入失败」', () => {
    expect(panelSource).toContain('<span>控件类型</span><span>推断字段类型</span>');
    expect(panelSource).toContain('unsupportedRows');
    expect(panelSource).toMatch(/class="f-group__head"[^>]*>超范围控件 [^<]*不计入失败/);
    expect(prdSource).toContain('分母只算 v1 适配范围内且可填的控件');
    expect(uiuxSource).toContain('单列，不与失败混排');
  });
});

describe('C5-3 unknown 哨兵与三正交维度', () => {
  it('unknown 不在 20 类之内，不是生成器目标，不是拾取器可绑定项', () => {
    expect(FIELD_TYPES).toHaveLength(20);
    expect(FIELD_TYPES).not.toContain('unknown' as FieldType);
    expect(fieldTypesDoc.sentinel).toBe('unknown');
    expect(BINDABLE_TYPES).toHaveLength(20);
    expect(BINDABLE_TYPES.map((b) => b.key)).toEqual([...FIELD_TYPES]);
    expect(BINDABLE_TYPES.some((b) => b.key === ('unknown' as string))).toBe(false);
  });

  it('unknown 中文标签为「按标签生成」，低于阈值不硬猜、单独计 field_unknown', () => {
    expect(fieldLabel('unknown')).toBe('按标签生成');
    expect(LIMITS.CONFIDENCE_THRESHOLD).toBe(0.6);
    expect(fieldTypesDoc.confidenceThresholdDefault).toBe(LIMITS.CONFIDENCE_THRESHOLD);
    expect(fieldTypesDoc.confidenceThresholdAuthority).toContain('types.ts#LIMITS');
    expect(archSource).toContain('不可作为拾取器可绑定项');
    expect(archSource).toContain('单独计 `field_unknown`');
  });

  it('LocalCounterEvent 恰好 11 个事件且含 field_unknown', () => {
    const body = /export type LocalCounterEvent =([\s\S]*?);/.exec(typesSource)?.[1] ?? '';
    const events = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(events).toHaveLength(11);
    expect(new Set(events).size).toBe(11);
    expect(events).toContain('field_unknown');
    expect(uiuxSource).toContain('11 事件');
  });
});

describe('C5-4 契约镜像与安全文案', () => {
  it('docs/contracts 与 src/contracts 六份文件逐字节一致', () => {
    const files = [
      'field-types.json', 'field.ts', 'interfaces.ts',
      'rules.schema.json', 'rules.ts', 'types.ts',
    ];
    for (const file of files) {
      const a = bytes(`docs/contracts/${file}`);
      const b = bytes(`src/contracts/${file}`);
      expect({ file, identical: a.equals(b), size: a.length }).toEqual({
        file,
        identical: true,
        size: expect.any(Number),
      });
      expect(a.length).toBeGreaterThan(0);
    }
  });

  it('UIUX 明确禁止「成功」文案宣称读到组件 state 对象，且承认两帧是时序近似', () => {
    expect(uiuxSource).toContain('不写成「已读取 Vue / React 组件 state」或「读到组件内部状态」');
    expect(uiuxSource).toContain('两个渲染帧是时序近似');
    expect(archSource).toContain('「两个渲染帧」是时序近似');
    expect(archSource).toContain('第 18 章第 1 条变异测试是**必过项**');
  });

  it('唯一回读判据与 MUT-01 必过项在 ARCH 中锁定', () => {
    expect(archSource).toContain('QA 验收判据（防止按「组件内部状态」字面误判）');
    expect(archSource).toContain('QA **不得**把「展示或读取 Vue / React 组件内部 state 对象」列为通过条件');
    expect(archSource).toContain('`failureReason` 指向 `frameworkStateMatched`');
    expect(archSource).toContain('UI 不显示成功态');
  });
});
