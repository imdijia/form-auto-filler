import type { FieldConstraints, TextFeatures } from '../contracts';
import type { ControlShape } from './control-type';
import { normalizeText, truncate } from '../utils/text';

/** Strip the decoration component libraries put on a visible label before it
    reaches matchAlias. A trailing colon / asterisk or a 请输入 prompt otherwise
    dilutes the alias score and drops common fields below the fixed threshold. */
function cleanLabelText(raw: string): string {
  return truncate(
    normalizeText(raw)
      .replace(/[*＊]/g, ' ')
      .replace(/请输入|请填写|请选择|请选|必填|选填|可选/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[：:\s]+|[：:\s]+$/g, '')
      .trim(),
    32,
  );
}

function labelFromDocument(element: HTMLElement, document: Document): string {
  if (element.id) {
    for (const label of Array.from(document.querySelectorAll('label[for]'))) {
      if (label.getAttribute('for') !== element.id) continue;
      const text = cleanLabelText(label.textContent ?? '');
      if (text) return text;
    }
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts: string[] = [];
    for (const id of labelledBy.split(/\s+/)) {
      const target = document.getElementById(id);
      if (!target) continue;
      const text = cleanLabelText(target.textContent ?? '');
      if (text) parts.push(text);
    }
    const joined = truncate(parts.join(' '), 32);
    if (joined) return joined;
  }
  return '';
}

/** `[class*="form-item"]` also matches the inner CONTENT wrapper, so a single
    closest() lands on a node with no label. Walk ancestors instead and take
    the first row that actually contains a label-like node. */
const ROW_SELECTOR = '[class*="form-item"], [class*="form-row"], [class*="form-field"], tr, .f-form-row';
const LABEL_SELECTOR = 'label, th, [class*="label"], [class*="Label"]';

function nearestRowLabel(element: HTMLElement): string {
  let node: HTMLElement | null = element;
  for (let hop = 0; node && hop < 6; hop += 1, node = node.parentElement) {
    if (!node.matches(ROW_SELECTOR)) continue;
    for (const candidate of Array.from(node.querySelectorAll<HTMLElement>(LABEL_SELECTOR))) {
      if (candidate.querySelector('input, select, textarea, button')) continue;
      const text = cleanLabelText(candidate.textContent ?? '');
      if (text.length > 0 && text.length <= 24) return text;
    }
  }
  return '';
}

/** Custom rows such as <span class="lbl">姓名：</span><input ...> expose the
    label only as a preceding sibling. Bounded so page chrome is never used. */
function precedingSiblingLabel(element: HTMLElement): string {
  let sibling = element.previousElementSibling;
  for (let hop = 0; sibling && hop < 3; hop += 1, sibling = sibling.previousElementSibling) {
    if (sibling.querySelector('input, select, textarea, button')) continue;
    const text = cleanLabelText(sibling.textContent ?? '');
    if (text.length > 0 && text.length <= 24) return text;
  }
  return '';
}

export function readTextFeatures(element: HTMLElement, document: Document): TextFeatures {
  const labels = element instanceof HTMLInputElement ? Array.from(element.labels ?? []) : [];
  const nativeLabel = labels.length > 0 ? cleanLabelText(labels[0]?.textContent ?? '') : '';
  const label =
    nativeLabel ||
    labelFromDocument(element, document) ||
    nearestRowLabel(element) ||
    precedingSiblingLabel(element) ||
    cleanLabelText(element.getAttribute('aria-label') ?? '');
  const ariaLabel = normalizeText(element.getAttribute('aria-label') ?? '');
  const placeholder = normalizeText(element.getAttribute('placeholder') ?? '');
  const name = element.getAttribute('name') ?? '';
  const elementId = element.id ?? '';
  const row = element.closest<HTMLElement>(
    '.ant-form-item, .el-form-item, tr, [class*="form-row"], [class*="form-item"]',
  );
  const nearbyText = truncate(normalizeText(row?.textContent ?? ''), 120);
  return { label, placeholder, name, elementId, ariaLabel, nearbyText };
}

function numberAttribute(element: HTMLElement, key: string): number | undefined {
  const raw = element.getAttribute(key);
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function looksLikeDateFormat(value: string): boolean {
  return /YYYY|MM|DD/i.test(value);
}

export function readConstraints(
  element: HTMLElement,
  _shape: ControlShape,
  document: Document,
): FieldConstraints {
  const placeholder = element.getAttribute('placeholder') ?? '';
  const declaredFormat =
    element.getAttribute('data-value-format') ??
    element.getAttribute('data-format') ??
    element.getAttribute('value-format') ??
    '';
  const valueFormat =
    declaredFormat.length > 0
      ? declaredFormat
      : looksLikeDateFormat(placeholder)
        ? placeholder
        : undefined;
  return {
    maxLength: numberAttribute(element, 'maxlength'),
    pattern: element.getAttribute('pattern') ?? undefined,
    min: element.getAttribute('min') ?? undefined,
    max: element.getAttribute('max') ?? undefined,
    step: element.getAttribute('step') ?? undefined,
    required:
      element.hasAttribute('required') ||
      element.getAttribute('aria-required') === 'true',
    readOnly:
      element.hasAttribute('readonly') ||
      element.getAttribute('aria-readonly') === 'true',
    disabled:
      element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true' ||
      Boolean(element.closest('.is-disabled, .ant-select-disabled, .el-select.is-disabled')),
    hidden: ((): boolean => {
      if (element.hidden || element.closest('[hidden]')) return true;
      const style = document.defaultView?.getComputedStyle(element);
      return style ? style.display === 'none' || style.visibility === 'hidden' : false;
    })(),
    valueFormat: valueFormat || undefined,
  };
}

/** Component selects display text; native selects carry their own value. */
export function readHasValue(element: HTMLElement, shape: ControlShape): boolean {
  if (shape.componentRoot && shape.controlType === 'select') {
    const display = shape.componentRoot.querySelector<HTMLElement>(
      '.ant-select-selection-item, .el-select__selected-item',
    );
    return normalizeText(display?.textContent ?? '').length > 0;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value.trim().length > 0;
  }
  if (element instanceof HTMLSelectElement) {
    return element.selectedIndex >= 0 && element.value.length > 0;
  }
  return normalizeText(element.textContent ?? '').length > 0;
}
