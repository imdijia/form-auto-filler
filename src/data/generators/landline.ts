import { fit, type GeneratorInput } from './shared';

export function generateLandline(input: GeneratorInput): string {
  return fit(input.record.landline, input);
}
