import { fit, fromPattern, type GeneratorInput } from './shared';

export function generateCode(input: GeneratorInput): string {
  const pattern = input.field.constraints.pattern;
  const generated = pattern ? fromPattern(pattern, input.rng) : null;
  return fit(generated ?? input.record.code, input);
}
