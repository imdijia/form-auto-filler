import { fit, pageOptionOr, type GeneratorInput } from './shared';

/** Only real page options. Never invent an enum value. */
export function generateDictEnum(input: GeneratorInput): string {
  return fit(pageOptionOr(input.field, input.rng, []), input);
}
