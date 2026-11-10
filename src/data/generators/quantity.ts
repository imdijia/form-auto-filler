import { numericInRange, type GeneratorInput } from './shared';

export function generateQuantity(input: GeneratorInput): string {
  return numericInRange(input.field, input.rng, { integer: true, min: 1, max: 99 });
}
