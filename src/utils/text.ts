/** Pure string helpers used by detection, generators and UI labels. */

export function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function containsAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => needle.length > 0 && lower.includes(needle.toLowerCase()));
}

export function truncate(input: string, max: number): string {
  if (max <= 0) return '';
  return input.length <= max ? input : input.slice(0, Math.max(0, max));
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isBlank(input: string): boolean {
  return normalizeText(input).length === 0;
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
