import { fit, type GeneratorInput } from './shared';

export function generateEmail(input: GeneratorInput): string {
  return fit(input.record.email, input);
}
