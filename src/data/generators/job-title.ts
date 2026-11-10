import { fit, pageOptionOr, type GeneratorInput } from './shared';

export function generateJobTitle(input: GeneratorInput): string {
  return fit(pageOptionOr(input.field, input.rng, [input.record.jobTitle]), input);
}
