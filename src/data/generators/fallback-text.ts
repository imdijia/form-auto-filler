/** v2.1 label-derived fallback for controls L2 could not bind.
    Pure: no DOM, no network, no logging, no descriptor mutation. */
import type { FieldDescriptor, SkipReason } from '../../contracts';
import type { Rng } from '../../utils/rng';
import { createGeneratedRecord, isValidIdCard } from '../consistency';
import { formatDateValue, formatTimeValue } from '../../utils/time';

export const FALLBACK_PATTERN_FAIL_REASON = 'pattern 无法满足，未生成值';
export interface SemanticSource { readonly word: string; readonly source: string }
/** Kept in sync with execution/fill-planner.ts HARD_SKIPS. */
const HARD_SKIPS = new Set<SkipReason>([
  'readonly', 'disabled', 'hidden', 'file', 'captcha', 'outside-form',
  'search-or-filter', 'has-value', 'user-unchecked', 'rule-excluded',
  'unsupported-control', 'field-limit-exceeded',
]);
const SOURCE_KEYS = ['label', 'placeholder', 'ariaLabel', 'nearbyText', 'name', 'elementId'] as const;
const TAIL = /(?:[\s:：*＊]+|必填|请输入|请填写|可选|选填)$/;
const IDENTIFIER_PREFIX = /^(?:f|field|input|inp|txt|text|el|form|ctl|control|id|name|data|attr|ui|tb|box)$/i;
const PLACEHOLDER = /^(?:[-—–\s]*(?:请选择|请填写|请选|全部|不限|please\s*select|select\.\.\.).*|[-—–]+)$/i;
const pad = (n: number): string => String(n).padStart(2, '0');
const chars = (v: string): string[] => Array.from(v);
const fit = (v: string, max?: number): string =>
  typeof max === 'number' && max >= 0 ? chars(v).slice(0, Math.floor(max)).join('') : v;

/** SINGLE implementation of semantic-word cleaning + source priority, shared
    by generator and diagnostics (AC-V2-18). Identifiers lose technical
    prefixes/separators (f-org -> org), never written verbatim. */
function cleanWord(raw: string, identifier: boolean): string {
  let out = String(raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  let previous = '';
  while (out.length > 0 && out !== previous) { previous = out; out = out.replace(TAIL, '').trim(); }
  if (identifier) {
    const parts = out.split(/[-_\s]+/).filter(Boolean);
    if (parts.length > 1 && IDENTIFIER_PREFIX.test(parts[0] ?? '')) parts.shift();
    out = parts.join('');
  }
  return chars(out).slice(0, 12).join('');
}

export function resolveSemanticSource(field: FieldDescriptor): SemanticSource {
  const f = field.textFeatures;
  for (const key of SOURCE_KEYS) {
    const word = cleanWord(f[key], key === 'name' || key === 'elementId');
    if (word.length > 0) return { word, source: key };
  }
  return { word: '该字段', source: 'default' };
}

/** Text class keeps the exact copy 我是{语义词}测试数据 + rng-derived ·NN. */
function chinese(field: FieldDescriptor, rng: Rng, word: string): string {
  const body = '我是' + word + '测试数据', max = field.constraints.maxLength;
  const suffix = '·' + rng.digits(2);
  if (typeof max !== 'number' || max <= 0) return body + suffix;
  return chars(body + suffix).length <= max ? body + suffix : fit(body, max);
}
function numeric(field: FieldDescriptor, rng: Rng): string {
  const c = field.constraints, lo = Number(c.min), hi = Number(c.max);
  const lower = Number.isFinite(lo) ? Math.ceil(lo) : 1, upper = Number.isFinite(hi) ? Math.floor(hi) : 99;
  if (upper < lower) return String(lower);
  const declared = Number(c.step), step = Number.isFinite(declared) && declared >= 1 ? Math.round(declared) : 1;
  return String(lower + rng.int(0, Math.floor((upper - lower) / step)) * step);
}
/** min/max are ISO date hints; default to a bounded, always-valid range. */
function isoDay(field: FieldDescriptor, rng: Rng): string {
  const c = field.constraints, min = Date.parse(c.min ?? ''), max = Date.parse(c.max ?? '');
  const lower = Number.isFinite(min) ? min : Date.parse('2026-01-01');
  const upper = Number.isFinite(max) && max >= lower ? max : Date.parse('2026-12-31');
  const days = Math.max(0, Math.floor((upper - lower) / 86400000));
  return new Date(lower + rng.int(0, days) * 86400000).toISOString().slice(0, 10);
}
/** Native datetime-local/month only accept ISO fragments; valueFormat honoured
    for date/time, min/max for all four. */
function temporal(field: FieldDescriptor, rng: Rng, kind: string): string {
  const day = isoDay(field, rng), hh = rng.int(0, 23), mm = rng.int(0, 59);
  const iso = day + 'T' + pad(hh) + ':' + pad(mm) + ':00', fmt = field.constraints.valueFormat ?? '';
  if (kind === 'datetime-local') return day + 'T' + pad(hh) + ':' + pad(mm);
  if (kind === 'month') return day.slice(0, 7);
  if (kind === 'time') return formatTimeValue(iso, /HH|mm|ss/.test(fmt) ? fmt : 'HH:mm') || pad(hh) + ':' + pad(mm);
  return formatDateValue(iso, /YYYY|MM|DD/.test(fmt) ? fmt : 'YYYY-MM-DD') || day;
}
function firstOption(field: FieldDescriptor): string {
  for (const raw of field.enumOptions ?? []) {
    const value = String(raw ?? '').trim();
    if (value.length > 0 && !PLACEHOLDER.test(value)) return value;
  }
  return '';
}

/** Format legality > semantic word > template literal (AC-V2-17). Even when L2
    leaves a field unknown, a phone/name/id control must not get 我是…测试数据:
    the page validator would reject it. Values come from the SAME seeded record
    behind generatePhone / generateIdCard / generatePersonName (real mobile
    segments, GB 11643 check digit, 2-3 char Chinese names) - no fake literals. */
type FormatFn = (f: FieldDescriptor, r: Rng, rec: ReturnType<typeof createGeneratedRecord>) => string;
const PHONE_FORMAT: readonly [RegExp, FormatFn] = [
  /手机|电话|号码|联系方式|mobile|phone/i, (_f, _r, rec) => rec.phone,
];
const FORMATS: readonly (readonly [RegExp, FormatFn])[] = [
  PHONE_FORMAT,
  [/身份证|证件号|idcard/i, (_f, _r, rec) => isValidIdCard(rec.idCard) ? rec.idCard : ''],
  [/邮箱|email|邮件/i, (_f, _r, rec) => rec.email],
  [/日期|生日|出生|date/i, (f, r) => temporal(f, r, 'date')],
  [/姓名|名字|联系人|申请人|经办人/i, (_f, _r, rec) => rec.personName],
  [/金额|数量|年龄|百分比/i, (f, r) => numeric(f, r)],
];
function semanticValue(field: FieldDescriptor, rng: Rng, word: string): string {
  const text = word + ' ' + (field.textFeatures.placeholder ?? '');
  const isTel = (field.inputType || '').toLowerCase() === 'tel';
  const hit = isTel ? PHONE_FORMAT : FORMATS.find(([test]) => test.test(text));
  return hit ? hit[1](field, rng, createGeneratedRecord(rng.int(0, 0x7ffffffe))) : chinese(field, rng, word);
}

function candidate(field: FieldDescriptor, rng: Rng, word: string): string {
  const input = (field.inputType || '').toLowerCase(), c = field.constraints;
  const numericRange = (c.min ?? '').length > 0 && (c.max ?? '').length > 0 &&
    Number.isFinite(Number(c.min)) && Number.isFinite(Number(c.max));
  if (input === 'number' || input === 'range' || numericRange) return numeric(field, rng);
  if (/^(?:date|datetime-local|month|time)$/.test(input)) return temporal(field, rng, input);
  if (input === 'email') return 'test' + rng.digits(2) + '@example.com';
  // Checked state only; the semantic word lives in the AC-V2-18 marker.
  if (input === 'checkbox' || input === 'radio') return '1';
  if (field.tagName === 'SELECT' || field.controlType === 'select' || (field.enumOptions?.length ?? 0) > 0) return firstOption(field);
  return semanticValue(field, rng, word);
}
/** '' when a pattern cannot be met: only that row is skipped; every branch above still flows through pattern / maxLength / min|max|step here. */
export function generateFallbackValue(field: FieldDescriptor, rng: Rng): string {
  if (field.inferredType !== 'unknown') return '';
  if (field.skipReason && HARD_SKIPS.has(field.skipReason)) return '';
  let primary = '';
  try { primary = candidate(field, rng, resolveSemanticSource(field).word); } catch { primary = ''; }
  const pattern = field.constraints.pattern, max = field.constraints.maxLength;
  for (const raw of pattern ? [primary, '测试数据', '123456', 'TEST01'] : [primary]) {
    const value = fit(raw, max);
    if (value.length === 0) continue;
    if (!pattern) return value;
    try { if (new RegExp(pattern).test(value)) return value; }
    catch { return value; } // an invalid HTML pattern is ignored by the browser
  }
  return '';
}
