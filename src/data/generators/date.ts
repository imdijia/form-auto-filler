import { dateForField } from '../format';
import { fit, type GeneratorInput } from './shared';

/** Derived from idCard positions 7-14 and formatted by valueFormat.
    An unparseable format returns '' and the adapter reports
    E_VALUE_FORMAT_MISMATCH rather than guessing. */
export function generateDate(input: GeneratorInput): string {
  return fit(dateForField(input.record.birthDate, input.field, input.rules), input);
}
