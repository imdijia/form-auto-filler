import { fit, type GeneratorInput } from './shared';

/** GB 11643 check digit, legal region code and real birth date are produced
    once per seed in consistency.ts. The generator never rebuilds them. */
export function generateIdCard(input: GeneratorInput): string {
  return fit(input.record.idCard, input);
}
