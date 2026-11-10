import type { ControlType, ErrorCode, FieldType, SkipReason } from '../contracts';
import {
  CONTROL_TYPE_LABELS,
  ERROR_LABELS,
  FIELD_LABELS,
  FIELD_META,
  SKIP_REASON_LABELS,
} from '../contracts/field-metadata';

export function controlLabel(type: ControlType): string {
  return CONTROL_TYPE_LABELS[type] ?? '其他';
}

export function fieldLabel(type: FieldType): string {
  // v2.1: low-confidence controls are filled from their label, not left unbound.
  if (type === 'unknown') return '按标签生成';
  return FIELD_LABELS[type] ?? type;
}

export function skipLabel(reason?: SkipReason): string {
  return reason ? (SKIP_REASON_LABELS[reason] ?? reason) : '';
}

export function errorLabel(code?: ErrorCode): string {
  return code ? (ERROR_LABELS[code] ?? code) : '';
}

export function statusLabel(status: 'pending' | 'filled' | 'skipped' | 'failed'): string {
  switch (status) {
    case 'filled': return '成功';
    case 'skipped': return '跳过';
    case 'failed': return '失败';
    default: return '待填';
  }
}

/** The 20 authoritative types. 'unknown' is a sentinel, never a bindable item. */
export const BINDABLE_TYPES = FIELD_META.map((item) => ({
  key: item.key,
  label: item.label,
  aliases: item.aliases,
}));

export function formatConfidence(value: number): string {
  return value.toFixed(2);
}
