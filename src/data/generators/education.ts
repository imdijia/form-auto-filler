import { fit, pageOptionOr, type GeneratorInput } from './shared';

export function generateEducation(input: GeneratorInput): string {
  return fit(pageOptionOr(input.field, input.rng, [input.record.education]), input);
}
