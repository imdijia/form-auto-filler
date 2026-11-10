import type { FieldHandle } from '../contracts';
import { readControlShape } from '../detection/control-type';
import { normalizeText } from '../utils/text';

/** Unified fill primitive (ARCH 2.5). Never do a bare el.value = x.
    ISOLATED world has its own clean prototype wrapper, so the native setter
    bypasses the framework value tracker installed on the element instance. */
export function nativeSetterFor(element: HTMLElement): ((value: string) => void) | null {
  let prototype: object | null = null;
  if (element instanceof HTMLTextAreaElement) prototype = HTMLTextAreaElement.prototype;
  else if (element instanceof HTMLSelectElement) prototype = HTMLSelectElement.prototype;
  else if (element instanceof HTMLInputElement) prototype = HTMLInputElement.prototype;
  else return null;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return null;
  return (value: string) => setter.call(element, String(value));
}

function focusSafely(element: HTMLElement): void {
  try {
    element.focus({ preventScroll: true });
  } catch {
    try { element.focus(); } catch { /* detached or non-focusable node */ }
  }
}

function blurSafely(element: HTMLElement): void {
  try { element.blur(); } catch { /* detached node */ }
}

/** A real text insertion event: composed + inputType + data. Plain Event is
    the fallback for engines without the InputEvent constructor. */
export function makeInputEvent(value: string): Event {
  try {
    return new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
      data: String(value),
    });
  } catch {
    return new Event('input', { bubbles: true });
  }
}

/** Exactly one input and one change event per assignment. */
export function dispatchValueEvents(element: HTMLElement, value = ''): void {
  element.dispatchEvent(makeInputEvent(value));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Close the interaction with a real blur() plus a focusout event. */
function finishSequence(element: HTMLElement): void {
  blurSafely(element);
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/** focus -> native prototype setter -> InputEvent -> change -> blur/focusout.
    Still exactly one input and one change event, so readback stays honest. */
export function setNativeValue(element: HTMLElement, value: string): void {
  const setter = nativeSetterFor(element);
  if (!setter) throw new Error('FAF: no native value setter for this element');
  focusSafely(element);
  setter(String(value));
  dispatchValueEvents(element, value);
  finishSequence(element);
}

/** contenteditable: textContent + the full input sequence. Some rich-text
    editors ignore textContent; execCommand is the last-resort fallback. */
export function setContentEditableValue(element: HTMLElement, value: string): void {
  focusSafely(element);
  element.textContent = String(value);
  if (normalizeText(element.textContent ?? '') !== normalizeText(value)) {
    insertTextFallback(element, value);
  }
  dispatchValueEvents(element, value);
  finishSequence(element);
}

export function insertTextFallback(element: HTMLElement, value: string): boolean {
  const document = element.ownerDocument;
  if (typeof document.execCommand !== 'function') return false;
  try {
    focusSafely(element);
    return document.execCommand('insertText', false, String(value));
  } catch {
    return false;
  }
}

/** Legacy hook kept for the six P0 strategies. The full sequence already did
    focus/blur, so only focusout is added here (no duplicate focus event). */
export function triggerBlur(element: HTMLElement): void {
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

export function clickControl(element: HTMLElement): void {
  element.click();
  dispatchValueEvents(element);
}

/** Readback is DOM-observable only. The ISOLATED world cannot read framework
    state objects; the second render frame is the observable proxy for it. */
export function readDomValue(handle: FieldHandle): string {
  const element = handle.element;
  const shape = readControlShape(element);

  if (shape.componentRoot && shape.controlType === 'select') {
    const display = shape.componentRoot.querySelector<HTMLElement>(
      '.ant-select-selection-item, .el-select__selected-item',
    );
    const text = normalizeText(display?.textContent ?? '');
    if (text.length > 0) return text;
    const hidden = shape.componentRoot.querySelector('input');
    return hidden instanceof HTMLInputElement ? hidden.value : '';
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      return element.checked ? element.value : '';
    }
    return element.value;
  }
  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions[0];
    return normalizeText(selected?.textContent ?? '') || element.value;
  }
  if (element instanceof HTMLTextAreaElement) return element.value;
  if (element.isContentEditable) return normalizeText(element.textContent ?? '');
  return normalizeText(element.getAttribute('value') ?? element.textContent ?? '');
}
