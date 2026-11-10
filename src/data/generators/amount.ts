import { numericInRange, type GeneratorInput } from './shared';

export function generateAmount(input: GeneratorInput): string {
  const parsed = Number(input.record.amount);
  const base = Number.isFinite(parsed) ? parsed : 100.0;
  return numericInRange(input.field, input.rng, {
    integer: false,
    min: 0.01,
    max: Math.max(100000, base),
    fractionDigits: 2,
  });
}
