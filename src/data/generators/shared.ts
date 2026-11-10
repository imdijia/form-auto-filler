import type { EffectiveRules, FieldDescriptor } from '../../contracts';
import type { Rng } from '../../utils/rng';
import type { GeneratedRecord } from '../consistency';
import { truncate } from '../../utils/text';

export interface GeneratorInput {
  readonly field: FieldDescriptor;
  readonly record: GeneratedRecord;
  readonly rng: Rng;
  readonly rules: EffectiveRules;
}

export type GeneratorFn = (input: GeneratorInput) => string;

/** maxLength is a hard upper bound; values are never silently truncated by
    the browser after assignment. */
export function fitMaxLength(value: string, field: FieldDescriptor): string {
  const max = field.constraints.maxLength;
  return typeof max === 'number' && max > 0 ? truncate(value, max) : value;
}

export function fit(value: string, input: GeneratorInput): string {
  return fitMaxLength(value, input.field);
}

/** Enum values come from real page options only. Never invent a value. */
export function pageOptionOr(
  field: FieldDescriptor,
  rng: Rng,
  fallback: readonly string[],
): string {
  if (field.enumOptions.length > 0) return rng.pick(field.enumOptions);
  return fallback.length > 0 ? rng.pick(fallback) : '';
}

export interface NumericOptions {
  readonly integer: boolean;
  readonly min: number;
  readonly max: number;
  readonly fractionDigits?: number;
  readonly suffix?: string;
}

/** Respects min / max / step and writes one complete value in a single pass. */
export function numericInRange(
  field: FieldDescriptor,
  rng: Rng,
  options: NumericOptions,
): string {
  const min = Number(field.constraints.min ?? options.min);
  const max = Number(field.constraints.max ?? options.max);
  const lower = Number.isFinite(min) ? min : options.min;
  const upper = Number.isFinite(max) ? max : options.max;
  if (upper < lower) return String(lower);
  const defaultStep = options.integer ? 1 : Math.pow(10, -(options.fractionDigits ?? 2));
  const declared = Number(field.constraints.step ?? defaultStep);
  const step = Number.isFinite(declared) && declared > 0 ? declared : defaultStep;
  const steps = Math.max(0, Math.floor((upper - lower) / step));
  const chosen = lower + rng.int(0, steps) * step;
  const digits = options.integer ? 0 : (options.fractionDigits ?? 2);
  return chosen.toFixed(digits) + (options.suffix ?? '');
}

/** Builds a value for simple pattern attributes. Unsupported constructs
    return null so the caller falls back to a generic alphanumeric code. */
export function fromPattern(pattern: string, rng: Rng): string | null {
  // HTML pattern attributes are implicitly anchored. Strip ^ / $ so that
  // '^[A-Z]{2}\\d{4}$' and '[A-Z]{2}\\d{4}' produce the same value.
  let source = pattern.trim();
  if (source.startsWith('^')) source = source.slice(1);
  if (source.endsWith('$') && !source.endsWith('\\$')) source = source.slice(0, -1);
  let out = '';
  let index = 0;
  const digit = (): string => String(rng.int(0, 9));
  const upper = (): string => String.fromCharCode(65 + rng.int(0, 25));
  const lower = (): string => String.fromCharCode(97 + rng.int(0, 25));
  const alphaNum = (): string => (rng.bool() ? upper() : digit());
  while (index < source.length) {
    const rest = source.slice(index);
    const match = /^(?:\\d|\[0-9\]|\[A-Z\]|\[a-z\]|\[A-Za-z0-9\])(?:\{(\d+)\})?/.exec(rest);
    if (!match) return null;
    const token = match[0];
    const count = match[1] ? Math.min(64, Number(match[1])) : 1;
    const make = token.includes('A-Za-z0-9')
      ? alphaNum
      : token.includes('A-Z')
        ? upper
        : token.includes('a-z')
          ? lower
          : digit;
    for (let i = 0; i < count; i += 1) out += make();
    index += token.length;
  }
  return out.length > 0 ? out : null;
}
