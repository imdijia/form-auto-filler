/**
 * Contract coherence gate - these tests run for real TODAY, against the
 * locked contract artifacts. No implementation module is required.
 *
 * Authority: SPEC-v1.md §5/§6/§9, PRD-v1.md §8, ARCH-v1.md §14.2/§17.2/§18#10,
 * docs/contracts/{field-types.json,types.ts,rules.schema.json,field.ts}.
 *
 * Every assertion is discriminating: if a slug, threshold, error code or
 * schema rule drifts, a specific case turns red. No snapshot, no `expect(true)`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import fieldTypesDoc from '../../docs/contracts/field-types.json';
import rulesSchemaJson from '../../docs/contracts/rules.schema.json';
import { FIELD_TYPES, LIMITS, STORAGE_KEYS } from '../../docs/contracts/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const schema: any = rulesSchemaJson;
const doc: any = fieldTypesDoc;

function readDoc(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const typesSource = readDoc('../../docs/contracts/types.ts');
const specSource = readDoc('../../docs/SPEC-v1.md');
const archSource = readDoc('../../docs/ARCH-v1.md');

/** Extract the body of a TS `interface X { ... }` block (first closing brace). */
function interfaceBody(source: string, name: string): string {
  const start = source.indexOf(`interface ${name} {`);
  if (start < 0) return '';
  const end = source.indexOf('\n}', start);
  return source.slice(start, end < 0 ? source.length : end);
}

/** Extract quoted members of a TS string-literal union `type X = 'a' | 'b'`. */
function unionMembers(source: string, name: string): string[] {
  const start = source.indexOf(`type ${name} =`);
  if (start < 0) return [];
  const end = source.indexOf(';', start);
  const body = source.slice(start, end < 0 ? source.length : end);
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function byKey(key: string): any {
  const found = doc.types.find((t: any) => t.key === key);
  if (!found) throw new Error(`field-types.json missing type ${key}`);
  return found;
}

describe('C1 20 类字段类型枚举：三处一致（ARCH-v1 §18 #10）', () => {
  it('FIELD_TYPES 恰好 20 个且无重复', () => {
    expect(FIELD_TYPES).toHaveLength(20);
    expect(new Set(FIELD_TYPES).size).toBe(20);
  });

  it('FIELD_TYPES 与 field-types.json 的 key 顺序完全一致', () => {
    expect([...FIELD_TYPES]).toEqual(doc.types.map((t: any) => t.key));
  });

  it('FIELD_TYPES 与 rules.schema.json#FieldType.enum 完全一致', () => {
    expect([...FIELD_TYPES]).toEqual(schema.$defs.FieldType.enum);
    expect(new Set(schema.$defs.FieldType.enum).size).toBe(20);
  });

  it('每个类型都有非空且唯一的 generator id（unknown 不是生成器目标）', () => {
    const generators = doc.types.map((t: any) => t.generator);
    expect(generators.every((g: unknown) => typeof g === 'string' && g.length > 0)).toBe(true);
    expect(new Set(generators).size).toBe(20);
    expect(doc.types.some((t: any) => t.key === 'unknown')).toBe(false);
  });

  it("'unknown' 是哨兵：只在 FieldType 联合中出现，不进生成器枚举", () => {
    expect(doc.sentinel).toBe('unknown');
    expect(FIELD_TYPES).not.toContain('unknown');
    expect(schema.$defs.FieldType.enum).not.toContain('unknown');
    expect(unionMembers(typesSource, 'FieldType')).toContain('unknown');
  });

  it('featurePriority 以 label 为首、regexOrAttribute 为末，且权重优先级单调可读', () => {
    expect(doc.featurePriority[0]).toBe('label');
    expect(doc.featurePriority[1]).toBe('placeholder');
    expect(doc.featurePriority[doc.featurePriority.length - 1]).toBe('regexOrAttribute');
    expect(new Set(doc.featurePriority).size).toBe(doc.featurePriority.length);
  });
});

describe('C2 三阈值：0.6 / 100 / 200 与 types.ts#LIMITS 一致', () => {
  it('LIMITS 三个锁定值精确匹配', () => {
    expect(LIMITS.CONFIDENCE_THRESHOLD).toBe(0.6);
    expect(LIMITS.VIRTUAL_SCROLL_THRESHOLD).toBe(100);
    expect(LIMITS.MAX_FIELDS_PER_PAGE).toBe(200);
  });

  it('field-types.json 的镜像默认值等于权威 LIMITS（非权威但必须相等）', () => {
    expect(doc.confidenceThresholdDefault).toBe(LIMITS.CONFIDENCE_THRESHOLD);
    expect(doc.confidenceThresholdAuthority).toContain('types.ts#LIMITS');
    expect(doc.confidenceThresholdAuthority).toContain('rules.schema.json');
  });

  it('SPEC-v1 §6 文本与 LIMITS 三值一致', () => {
    expect(specSource).toContain('CONFIDENCE_THRESHOLD 0.6');
    expect(specSource).toContain('VIRTUAL_SCROLL_THRESHOLD 100');
    expect(specSource).toContain('MAX_FIELDS_PER_PAGE 200');
  });

  it('rules.schema.json 定义 confidenceThreshold 且限定在 [0,1]', () => {
    const rule = schema.$defs.Weights.properties.confidenceThreshold;
    expect(rule).toBeDefined();
    expect(rule.type).toBe('number');
    expect(rule.minimum).toBe(0);
    expect(rule.maximum).toBe(1);
    expect(schema.$defs.Weights.required).toContain('confidenceThreshold');
  });

  it('rules.schema.json#Limits 含三个阈值的规则字段（camelCase 映射）', () => {
    const props = schema.$defs.Limits.properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['confidenceThreshold', 'virtualScrollThreshold', 'maxFieldsPerPage']),
    );
    expect(schema.$defs.Limits.additionalProperties).toBe(false);
  });
});

describe('C3 三层回读判据唯一（ARCH-v1 §14.2 / SPEC-v1 §9）', () => {
  it('VerificationDetail 的布尔字段恰好是三个固定 slug，不另起别名', () => {
    const body = interfaceBody(typesSource, 'VerificationDetail');
    const booleans = [...body.matchAll(/^\s*(\w+):\s*boolean;/gm)].map((m) => m[1]);
    expect(booleans).toEqual(['domValueMatched', 'frameworkStateMatched', 'validationCleared']);
    expect(body).toContain('evidence: string[]');
    expect(body).toContain('checkedAt: string');
    // No component-state-object field may be smuggled into the verdict type.
    const allFields = [...body.matchAll(/^\s*(\w+)[?:]?\s*:/gm)].map((m) => m[1]);
    expect(allFields).toEqual([
      'domValueMatched', 'frameworkStateMatched', 'validationCleared', 'evidence', 'checkedAt',
    ]);
  });

  it('FillResult 由 verified 驱动，带 verification / code / failureReason', () => {
    const body = interfaceBody(typesSource, 'FillResult');
    expect(body).toContain('verified: boolean');
    expect(body).toContain("status: 'filled' | 'skipped' | 'failed'");
    expect(body).toContain('code?: ErrorCode');
    expect(body).toContain('failureReason?: string');
    expect(body).toContain('verification?: VerificationDetail');
    expect(body).toContain('skipReason?: SkipReason');
  });

  it('ErrorCode 中回读失败只有一个码 E_READBACK_MISMATCH', () => {
    const codes = unionMembers(typesSource, 'ErrorCode');
    expect(codes).toContain('E_READBACK_MISMATCH');
    expect(codes.filter((c) => /READBACK|VERIFY|STATE/.test(c))).toEqual(['E_READBACK_MISMATCH']);
  });

  it('ErrorCode 覆盖 AC-3/5/6/7 与规则库所需错误码', () => {
    const codes = unionMembers(typesSource, 'ErrorCode');
    expect(codes).toEqual(expect.arrayContaining([
      'E_UNSUPPORTED_CONTROL', 'E_SITE_NOT_ALLOWED', 'E_VALIDATION_REJECTED',
      'E_VALUE_FORMAT_MISMATCH', 'E_LINKAGE_TIMEOUT', 'E_RULE_SCHEMA_INVALID',
      'E_FIELD_LIMIT_EXCEEDED', 'E_PORTAL_NOT_FOUND', 'E_FIELD_NOT_FOUND',
    ]));
  });

  it('SkipReason 覆盖误填防护所需的全部跳过原因', () => {
    const reasons = unionMembers(typesSource, 'SkipReason');
    expect(reasons).toEqual(expect.arrayContaining([
      'readonly', 'disabled', 'hidden', 'file', 'captcha', 'outside-form',
      'search-or-filter', 'has-value', 'user-unchecked', 'low-confidence',
      'unsupported-control', 'field-limit-exceeded',
    ]));
  });

  it('SPEC/ARCH 锁定「事件已派发不算成功」且禁止按字面读取组件 state 对象', () => {
    expect(specSource).toContain('事件已派发不算成功');
    expect(specSource).toContain('读取组件内部 state 对象');
    expect(archSource).toContain('展示或读取 Vue / React 组件内部 state 对象');
    expect(archSource).toContain('列为通过条件');
    expect(archSource).toContain('domValueMatched');
    expect(archSource).toContain('frameworkStateMatched');
    expect(archSource).toContain('validationCleared');
  });
});

describe('C4 数据完整性与安全：规则库 / 存储分键 / 一致性组', () => {
  it('identity 一致性组精确为 { idCard, date, gender, personName }', () => {
    const group = doc.consistencyGroups.find((g: any) => g.id === 'identity');
    expect(group).toBeDefined();
    expect(group.members).toEqual(['idCard', 'date', 'gender', 'personName']);
    expect(group.rule).toContain('7-14');
    expect(group.rule).toContain('17');
  });

  it('关键生成器约束按契约锁定（不是只看字段存在）', () => {
    expect(byKey('idCard').constraints).toMatchObject({
      length: 18, checkDigit: 'GB 11643', validRegionCode: true, validBirthDate: true,
    });
    expect(byKey('phone').constraints.pattern).toBe('^1[3-9][0-9]{9}$');
    expect(byKey('phone').constraints.length).toBe(11);
    expect(byKey('date').constraints).toMatchObject({
      respectValueFormat: true, mustMatchIdCardBirthDate: true,
    });
    expect(byKey('dictEnum').constraints).toMatchObject({
      mustUsePageOptions: true, neverInventValues: true,
    });
    expect(byKey('personName').constraints.digitsAllowed).toBe(false);
    expect(byKey('email').constraints.asciiOnly).toBe(true);
    expect(byKey('code').constraints).toMatchObject({ respectPattern: true, respectMaxLength: true });
    expect(byKey('amount').constraints.respectMinMaxStep).toBe(true);
    expect(byKey('quantity').constraints.respectMinMaxStep).toBe(true);
    expect(byKey('percentage').constraints).toMatchObject({ min: 0, max: 100 });
    expect(byKey('longText').constraints.respectMaxLength).toBe(true);
  });

  it('FieldLocator.strategy 禁用 css/xpath，主键是页面指纹', () => {
    const strategies = schema.$defs.FieldLocator.properties.strategy.enum;
    expect(strategies).toEqual(['labelText', 'attr', 'domPath', 'rowAnchor']);
    expect(strategies.some((s: string) => /css|xpath|selector/i.test(s))).toBe(false);
    expect(schema.$defs.PageOverride.required).toEqual(
      expect.arrayContaining(['urlPattern', 'structureHash', 'hashAlgorithm']),
    );
  });

  it('PageOverride 只存增量：overrides 上限 50 且结构封闭', () => {
    expect(schema.$defs.PageOverride.properties.overrides.maxItems).toBe(50);
    expect(schema.$defs.PageOverride.additionalProperties).toBe(false);
    expect(schema.$defs.FieldOverride.properties.action.enum).toEqual(['setType', 'skip', 'forceValue']);
    expect(schema.$defs.GlobalConfig.additionalProperties).toBe(false);
  });

  it('规则文档不含可执行代码位：schemaVersion 锁定且权重只允许数字', () => {
    expect(schema.properties.schemaVersion.const).toBe(1);
    expect(schema.properties.schemaVersion.description).toContain('E_RULE_SCHEMA_INVALID');
    expect(schema.$defs.Weights.additionalProperties.type).toBe('number');
    const serialized = JSON.stringify(schema);
    expect(/"(eval|script|handler|function)"\s*:/.test(serialized)).toBe(false);
    expect(serialized).not.toContain('new Function');
  });

  it('presets schema 预留且 UI 不暴露：三键结构封闭', () => {
    expect(schema.$defs.PresetsConfig.required).toEqual(['global', 'bySite', 'byPage']);
    expect(schema.$defs.PresetsConfig.additionalProperties).toBe(false);
    expect(schema.$defs.GlobalConfig.required).toContain('presets');
  });

  it('诊断计数与配置/结果严格分键，导出 JSON 不得携带计数', () => {
    expect(STORAGE_KEYS.COUNTERS).toBe('faf.counters.v1');
    const keys = Object.values(STORAGE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.startsWith('faf.'))).toBe(true);
    expect(specSource).toContain('exportJson()');
    expect(specSource).toContain('不含计数');
  });
});
