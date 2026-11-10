import { fit, type GeneratorInput } from './shared';

export function generateAddress(input: GeneratorInput): string {
  return fit(input.record.address, input);
}
