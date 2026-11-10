/**
 * Runtime metadata for the 20 field types. The single machine-readable
 * authority is contracts/field-types.json (mirrored from docs/contracts).
 * No second alias dictionary or slug list is defined anywhere in this project.
 */
import document from './field-types.json';
import { FIELD_TYPES } from './types';
import type { ControlType, ErrorCode, FieldType, SkipReason } from './types';

export type FieldTypeKey = Exclude<FieldType, 'unknown'>;

export interface FieldTypeMeta {
  readonly key: FieldTypeKey;
  readonly label: string;
  readonly generator: string;
  readonly aliases: readonly string[];
  readonly constraints: Readonly<Record<string, unknown>>;
  readonly features: readonly string[];
}

export const FIELD_META: readonly FieldTypeMeta[] =
  document.types as unknown as readonly FieldTypeMeta[];

export const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(FIELD_META.map((item) => [item.key, item.label])),
);

export const GENERATOR_IDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(FIELD_META.map((item) => [item.key, item.generator])),
);

export const FIELD_KEYS: readonly FieldTypeKey[] = Object.freeze(
  FIELD_META.map((item) => item.key),
);

export const CONTROL_TYPE_LABELS: Readonly<Record<ControlType, string>> = Object.freeze({
  input: '输入框',
  select: '下拉',
  date: '日期',
  textarea: '文本域',
  other: '其他',
});

export const SKIP_REASON_LABELS: Readonly<Record<SkipReason, string>> = Object.freeze({
  readonly: '只读',
  disabled: '禁用',
  hidden: '隐藏',
  file: '文件上传',
  captcha: '验证码 / 密码等受保护输入',
  'outside-form': '不在表单容器内',
  'search-or-filter': '搜索框或筛选框排除',
  'has-value': '已有值，保留',
  'user-unchecked': '用户取消勾选',
  'low-confidence': '未识别字段，已按标签生成测试数据',
  'rule-excluded': '页面规则排除',
  'unsupported-control': '控件超出 v1 适配范围',
  'field-limit-exceeded': '超过单页控件上限',
});

export const ERROR_LABELS: Readonly<Record<ErrorCode, string>> = Object.freeze({
  E_FIELD_NOT_FOUND: '控件已脱离页面',
  E_READONLY_OR_DISABLED: '控件只读或禁用',
  E_UNSUPPORTED_CONTROL: '控件超出 v1 适配范围',
  E_VALIDATION_REJECTED: '页面校验拒绝了该值',
  E_READBACK_MISMATCH: '回读校验未通过',
  E_PORTAL_NOT_FOUND: '未找到下拉浮层面板',
  E_VALUE_FORMAT_MISMATCH: '日期格式无法解析',
  E_LINKAGE_TIMEOUT: '等待联动稳定超时',
  E_FIELD_LIMIT_EXCEEDED: '超过单页控件上限',
  E_TIMEOUT: '填充超时',
  E_SITE_NOT_ALLOWED: '当前页面不在测试站点白名单内',
  E_BRIDGE_UNAVAILABLE: '页面桥接不可用，已降级',
  E_RULE_SCHEMA_INVALID: '规则 JSON 结构不合法',
  E_PROVIDER_FAILED: '数据生成失败',
});

/** Gate helper: the JSON, the TS enum and the rule schema must stay identical. */
export function assertFieldMetaConsistent(): string[] {
  const problems: string[] = [];
  const jsonKeys = [...FIELD_KEYS].sort();
  const tsKeys = [...FIELD_TYPES].sort();
  if (jsonKeys.join(',') !== tsKeys.join(',')) {
    problems.push('field-types.json and FIELD_TYPES disagree on the 20 slugs');
  }
  for (const item of FIELD_META) {
    if (!item.generator || !item.label || item.aliases.length === 0) {
      problems.push('incomplete metadata for ' + item.key);
    }
  }
  return problems;
}
