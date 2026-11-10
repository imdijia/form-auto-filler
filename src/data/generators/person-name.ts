import { fit, type GeneratorInput } from './shared';

export function generatePersonName(input: GeneratorInput): string {
  return fit(input.record.personName, input);
}
