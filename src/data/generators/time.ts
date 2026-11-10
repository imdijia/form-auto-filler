import { timeForField } from '../format';
import { fit, type GeneratorInput } from './shared';

export function generateTime(input: GeneratorInput): string {
  return fit(timeForField(input.record.time, input.field, input.rules), input);
}
