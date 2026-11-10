/** v2 multi-path assignment retry (SPEC-v2 fill hardening).
    A single failed readback is no longer the end: three observable paths are
    tried in order, each followed by a fresh two-frame verification. */

import type { FieldHandle } from '../contracts';
import { findComponentRoot } from '../detection/control-type';
import {
  makeInputEvent, nativeSetterFor, setContentEditableValue, setNativeValue,
} from './native-setter';

export interface AssignmentPath {
  readonly id: string;
  readonly label: string;
  run(handle: FieldHandle, value: string): boolean;
}

function isFormControl(element: HTMLElement): boolean {
  if (typeof HTMLInputElement === 'undefined') return false;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

/** A node that can actually hold a value. Wrapper divs cannot. */
export function isAssignable(element: HTMLElement): boolean {
  return isFormControl(element) || element.isContentEditable;
}

/** Generic native assignment: used both as the E_UNSUPPORTED_CONTROL
    fallback and by path 2. Returns false when nothing can be written. */
export function genericAssign(element: HTMLElement, value: string): boolean {
  if (!isAssignable(element)) return false;
  try {
    if (element.isContentEditable && !isFormControl(element)) {
      setContentEditableValue(element, value);
    } else {
      setNativeValue(element, value);
    }
    return true;
  } catch {
    return false;
  }
}

function innerControl(element: HTMLElement): HTMLElement | null {
  const root = findComponentRoot(element);
  if (!root) return null;
  return root.querySelector<HTMLElement>('input, textarea, select');
}

function compositionEvent(type: string, data: string): Event {
  try {
    return new CompositionEvent(type, { bubbles: true, composed: true, data });
  } catch {
    return new Event(type, { bubbles: true });
  }
}

function compositionSequence(element: HTMLElement, value: string): boolean {
  try {
    element.focus();
    element.dispatchEvent(compositionEvent('compositionstart', ''));
    const setter = nativeSetterFor(element);
    if (setter) setter(String(value));
    else if (element.isContentEditable) element.textContent = String(value);
    else return false;
    element.dispatchEvent(makeInputEvent(value));
    element.dispatchEvent(compositionEvent('compositionend', value));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    try { element.blur(); } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

/** Path 1: component-library strategy. Write the inner native control of a
    wrapper (select / date-picker / cascader) instead of the wrapper div. */
const componentPath: AssignmentPath = {
  id: 'component-wrapper',
  label: '组件库策略',
  run(handle, value) {
    const inner = innerControl(handle.element);
    return inner ? genericAssign(inner, value) : false;
  },
};

/** Path 2: re-focus and replay the full focus/InputEvent/change/blur sequence. */
const refocusPath: AssignmentPath = {
  id: 'refocus-input-event',
  label: '重新 focus + InputEvent 序列',
  run(handle, value) {
    try { handle.element.focus(); } catch { /* ignore */ }
    return genericAssign(handle.element, value);
  },
};

/** Path 3: IME composition sequence for editors that only commit on
    compositionend. */
const compositionPath: AssignmentPath = {
  id: 'composition-sequence',
  label: 'compositionstart/compositionend 序列',
  run(handle, value) {
    const target = isAssignable(handle.element)
      ? handle.element
      : innerControl(handle.element);
    return target ? compositionSequence(target, value) : false;
  },
};

export const ASSIGNMENT_PATHS: readonly AssignmentPath[] = [
  componentPath,
  refocusPath,
  compositionPath,
];
