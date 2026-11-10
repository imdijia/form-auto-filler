import { fit, pageOptionOr, type GeneratorInput } from './shared';

export function generateRegion(input: GeneratorInput): string {
  return fit(pageOptionOr(input.field, input.rng, [input.record.region]), input);
}
