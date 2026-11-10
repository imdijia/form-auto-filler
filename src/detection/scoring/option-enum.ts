import type { FieldDescriptor, FieldType } from '../../contracts';
import type { ControlShape } from '../control-type';
import { normalizeText, unique } from '../../utils/text';

/** Ant Design Vue / Element Plus render dropdowns into body-level portals.
    Never assume options live in the trigger subtree (ARCH 14.1). */
export const ANT_OPTION_SELECTOR =
  '.ant-select-dropdown .ant-select-item-option-content, .ant-select-dropdown .ant-select-item-option';
export const EL_OPTION_SELECTOR =
  '.el-select-dropdown__item, .el-select__popper .el-select-dropdown__item';

const PLACEHOLDER_TEXTS = new Set(['请选择', '全部', '无', '请选择或搜索', '']);

export function portalOptionElements(document: Document): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(ANT_OPTION_SELECTOR + ', ' + EL_OPTION_SELECTOR),
  );
}

export function portalOptionTexts(document: Document): string[] {
  return unique(
    portalOptionElements(document)
      .map((element) => normalizeText(element.textContent ?? ''))
      .filter((text) => text.length > 0 && !PLACEHOLDER_TEXTS.has(text)),
  ).slice(0, 100);
}

export function readEnumOptions(
  element: HTMLElement,
  shape: ControlShape,
  document: Document,
): string[] {
  const values: string[] = [];
  if (element instanceof HTMLSelectElement) {
    for (const option of Array.from(element.options)) {
      const text = normalizeText(option.textContent ?? '') || normalizeText(option.value);
      if (text && !PLACEHOLDER_TEXTS.has(text)) values.push(text);
    }
    return unique(values).slice(0, 100);
  }
  if (shape.componentRoot) {
    for (const select of Array.from(shape.componentRoot.querySelectorAll('select'))) {
      for (const option of Array.from(select.options)) {
        const text = normalizeText(option.textContent ?? '') || normalizeText(option.value);
        if (text && !PLACEHOLDER_TEXTS.has(text)) values.push(text);
      }
    }
  }
  if (shape.controlType === 'select') {
    values.push(...portalOptionTexts(document));
  }
  return unique(values).slice(0, 100);
}

export interface EnumHint {
  readonly fieldType: FieldType;
  readonly score: number;
  readonly evidence: string;
}

export function enumHints(field: FieldDescriptor): EnumHint[] {
  const count = field.enumOptions.length;
  if (count === 0) return [];
  if (count === 2) {
    return [{ fieldType: 'gender', score: 0.5, evidence: 'enumOptions.length===2' }];
  }
  return [
    { fieldType: 'dictEnum', score: 0.45, evidence: 'enumOptions.length>0' },
    { fieldType: 'education', score: 0.2, evidence: 'enumOptions.length>0' },
    { fieldType: 'jobTitle', score: 0.2, evidence: 'enumOptions.length>0' },
  ];
}
