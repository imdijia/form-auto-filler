import { fit, pageOptionOr, type GeneratorInput } from './shared';

export function generateOrganization(input: GeneratorInput): string {
  return fit(pageOptionOr(input.field, input.rng, [input.record.organization]), input);
}
