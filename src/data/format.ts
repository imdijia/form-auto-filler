import type { EffectiveRules, FieldDescriptor } from '../contracts';
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  formatDateValue,
  formatTimeValue,
  parseDateByFormat,
} from '../utils/time';

export function generatorConfig(
  rules: EffectiveRules,
  key: string,
): Readonly<Record<string, unknown>> {
  return rules.generators[key] ?? {};
}

/** valueFormat negotiation: control attribute > rule document > default.
    An unparseable format yields '' from formatDateValue, which the date
    adapters turn into E_VALUE_FORMAT_MISMATCH instead of guessing. */
export function resolveDateFormat(field: FieldDescriptor, rules: EffectiveRules): string {
  const declared = field.constraints.valueFormat;
  if (declared && /YYYY|MM|DD/i.test(declared)) return declared;
  const configured = generatorConfig(rules, 'date').format;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return DEFAULT_DATE_FORMAT;
}

export function resolveTimeFormat(_field: FieldDescriptor, rules: EffectiveRules): string {
  const configured = generatorConfig(rules, 'time').format;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return DEFAULT_TIME_FORMAT;
}

export function dateForField(
  iso: string,
  field: FieldDescriptor,
  rules: EffectiveRules,
): string {
  return formatDateValue(iso, resolveDateFormat(field, rules));
}

export function timeForField(
  iso: string,
  field: FieldDescriptor,
  rules: EffectiveRules,
): string {
  return formatTimeValue(iso, resolveTimeFormat(field, rules));
}

export function dateFormatAccepts(
  value: string,
  field: FieldDescriptor,
  rules: EffectiveRules,
): boolean {
  if (value.length === 0) return false;
  return parseDateByFormat(value, resolveDateFormat(field, rules));
}
