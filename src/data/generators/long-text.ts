import { fit, type GeneratorInput } from './shared';

export function generateLongText(input: GeneratorInput): string {
  return fit(input.record.longText, input);
}
