import { fit, type GeneratorInput } from './shared';

export function generatePhone(input: GeneratorInput): string {
  return fit(input.record.phone, input);
}
