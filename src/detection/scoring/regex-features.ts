import type { FieldDescriptor, FieldType } from '../../contracts';
import { containsAny } from '../../utils/text';
import { enumHints } from './option-enum';

export interface RegexHint {
  readonly fieldType: FieldType;
  readonly score: number;
  readonly evidence: string;
}

/** Attribute / regex / structural features. These are hints only; the alias
    dictionary and the weighted score decide the final type. */
export function regexHints(field: FieldDescriptor): RegexHint[] {
  const hints: RegexHint[] = [];
  const c = field.constraints;
  const t = field.textFeatures;
  const allText = [t.label, t.placeholder, t.name, t.elementId, t.ariaLabel]
    .join(' ')
    .toLowerCase();

  if (field.inputType === 'email' || allText.includes('email') || allText.includes('mail')) {
    hints.push({ fieldType: 'email', score: 0.85, evidence: 'type=email' });
  }
  if (field.inputType === 'tel') {
    hints.push({
      fieldType: c.maxLength === 11 ? 'phone' : 'landline',
      score: c.maxLength === 11 ? 0.7 : 0.4,
      evidence: 'type=tel + maxlength',
    });
    if (c.pattern?.includes('-')) {
      hints.push({ fieldType: 'landline', score: 0.6, evidence: 'pattern contains hyphen' });
    }
  }
  if (c.maxLength === 18 || /d\{17\}/.test(c.pattern ?? '')) {
    hints.push({ fieldType: 'idCard', score: 0.7, evidence: 'maxlength=18 / 17-digit pattern' });
  }
  if (c.pattern) {
    hints.push({ fieldType: 'code', score: 0.35, evidence: 'pattern attribute present' });
  }
  if (field.inputType === 'date' || (c.readOnly && containsAny(allText, ['日期', 'date']))) {
    hints.push({ fieldType: 'date', score: 0.55, evidence: 'type=date / readonly calendar' });
  }
  if (field.inputType === 'time') {
    hints.push({ fieldType: 'time', score: 0.8, evidence: 'type=time' });
  }
  if (field.inputType === 'number') {
    const step = Number(c.step ?? '1');
    const fractional = c.step !== undefined && !Number.isInteger(step);
    hints.push({
      fieldType: fractional ? 'amount' : 'quantity',
      score: 0.5,
      evidence: 'type=number + step',
    });
    if (c.max === '100') {
      hints.push({ fieldType: 'percentage', score: 0.45, evidence: 'max=100' });
    }
  }
  if (field.tagName === 'TEXTAREA' || field.controlType === 'textarea') {
    hints.push({ fieldType: 'longText', score: 0.5, evidence: 'textarea' });
    if ((c.maxLength ?? 0) >= 30) {
      hints.push({ fieldType: 'address', score: 0.45, evidence: 'maxlength>=30' });
    }
  }
  if ((c.maxLength ?? 0) >= 30 && field.controlType === 'input') {
    hints.push({ fieldType: 'address', score: 0.3, evidence: 'maxlength>=30' });
  }
  if (containsAny(allText, ['备注', '说明', '描述', '成果', '成就', 'remark'])) {
    hints.push({ fieldType: 'longText', score: 0.4, evidence: 'text hints' });
  }
  if (containsAny(allText, ['地址', '住址', '联系地址'])) {
    hints.push({ fieldType: 'address', score: 0.4, evidence: 'text hints' });
  }
  hints.push(...enumHints(field));
  return hints;
}
