/** Data-only glob matching. Rule documents store pattern strings, never code. */
import { escapeRegExp } from './text';

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => escapeRegExp(part))
    .join('.*');
  return new RegExp('^' + escaped + '$', 'i');
}

export function matchGlob(value: string, pattern: string): boolean {
  return globToRegExp(pattern).test(value);
}
