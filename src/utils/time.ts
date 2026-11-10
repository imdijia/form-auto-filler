/** Date/time formatting with explicit valueFormat negotiation. */
import { escapeRegExp } from './text';

export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_TIME_FORMAT = 'HH:mm';

const TOKEN_SPLIT = /(YYYY|MM|DD|HH|mm|ss)/g;
const TOKEN_PATTERN: Readonly<Record<string, string>> = {
  YYYY: '[0-9]{4}',
  MM: '[0-9]{2}',
  DD: '[0-9]{2}',
  HH: '[0-9]{2}',
  mm: '[0-9]{2}',
  ss: '[0-9]{2}',
};

export function nowIso(): string {
  return new Date().toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitDateParts(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    year,
    month,
    day,
    hours: Number(match[4] ?? '0'),
    minutes: Number(match[5] ?? '0'),
    seconds: Number(match[6] ?? '0'),
  };
}

function render(parts: DateParts, format: string): string {
  const map: Readonly<Record<string, string>> = {
    YYYY: String(parts.year).padStart(4, '0'),
    MM: pad(parts.month),
    DD: pad(parts.day),
    HH: pad(parts.hours),
    mm: pad(parts.minutes),
    ss: pad(parts.seconds),
  };
  let out = '';
  for (const token of format.split(TOKEN_SPLIT)) {
    out += map[token] ?? token;
  }
  // Any remaining ASCII letter is an unsupported format token.
  return /[A-Za-z]/.test(out) ? '' : out;
}

/** Returns '' when the format cannot be parsed. Caller maps it to
    E_VALUE_FORMAT_MISMATCH instead of guessing a format. */
export function formatDateValue(iso: string, format: string): string {
  const parts = splitDateParts(iso);
  if (!parts) return '';
  return render(parts, format);
}

export function formatTimeValue(iso: string, format: string): string {
  const parts = splitDateParts(iso);
  if (!parts) return '';
  return render(parts, format);
}

/** Structural check that a generated value really matches valueFormat. */
export function parseDateByFormat(value: string, format: string): boolean {
  let pattern = '';
  for (const token of format.split(TOKEN_SPLIT)) {
    pattern += TOKEN_PATTERN[token] ?? escapeRegExp(token);
  }
  if (/[A-Za-z]/.test(format.replace(/YYYY|MM|DD|HH|mm|ss/g, ''))) return false;
  if (!new RegExp('^' + pattern + '$').test(value)) return false;
  const yearIndex = format.indexOf('YYYY');
  const year = yearIndex >= 0 ? Number(value.slice(yearIndex, yearIndex + 4)) : 2000;
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return false;
  const monthIndex = format.indexOf('MM');
  const dayIndex = format.indexOf('DD');
  if (monthIndex >= 0) {
    const month = Number(value.slice(monthIndex, monthIndex + 2));
    if (month < 1 || month > 12) return false;
    if (dayIndex >= 0) {
      const day = Number(value.slice(dayIndex, dayIndex + 2));
      const maxDay = new Date(year, month, 0).getDate();
      if (day < 1 || day > maxDay) return false;
    }
  }
  return true;
}
