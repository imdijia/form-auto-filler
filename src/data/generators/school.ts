import { fit, type GeneratorInput } from './shared';

export function generateSchool(input: GeneratorInput): string {
  return fit(input.record.school, input);
}
