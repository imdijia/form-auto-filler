/** Deterministic PRNG. Same seed + same page + same dataset => same values. */
import { fnv1a } from './hash';

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  digits(count: number): string;
  bool(): boolean;
}

/** Per-field sub-seed: independent of scan order, still reproducible. */
export function deriveSeed(seed: number, ...parts: readonly string[]): number {
  let hash = seed >>> 0;
  for (const part of parts) {
    hash = fnv1a(part + ':' + (hash >>> 0).toString(16));
  }
  return hash >>> 0;
}

export function createRng(seed: number): Rng {
  let state = (seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => {
    if (max <= min) return min;
    return min + Math.floor(next() * (max - min + 1));
  };
  const pick = <T>(items: readonly T[]): T => {
    const chosen = items[int(0, items.length - 1)];
    if (chosen === undefined) throw new Error('FAF: empty choice set');
    return chosen;
  };
  const digits = (count: number): string => {
    let out = '';
    for (let i = 0; i < count; i += 1) out += String(int(0, 9));
    return out;
  };
  return { next, int, pick, digits, bool: () => next() < 0.5 };
}
