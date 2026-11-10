import { numericInRange, type GeneratorInput } from './shared';

export function generatePercentage(input: GeneratorInput): string {
  const suffix = /%/.test(input.field.textFeatures.placeholder) ? '%' : '';
  return numericInRange(input.field, input.rng, {
    integer: true,
    min: 0,
    max: 100,
    suffix,
  });
}
