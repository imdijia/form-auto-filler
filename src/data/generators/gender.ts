import { fit, type GeneratorInput } from './shared';

/**
 * Identity consistency group: gender MUST agree with the parity of idCard
 * position 17 (GB 11643), so the value comes from the same GeneratedRecord.
 * When the page supplies real option labels (e.g. "男性" / "女士"), pick the
 * option that represents the record gender instead of inventing a new one.
 */
export function generateGender(input: GeneratorInput): string {
  const options = input.field.enumOptions;
  const wanted = input.record.gender;
  if (options.length === 0) return fit(wanted, input);
  const male = wanted === '男';
  const matched =
    options.find((option) => option === wanted) ??
    options.find((option) => (male ? /男|male|^m$/i : /女|female|^f$/i).test(option)) ??
    options[0] ??
    wanted;
  return fit(matched, input);
}
