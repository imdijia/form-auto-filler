/**
 * Form Auto Filler - field descriptor types v1.1.
 * Pure declarations only. Depends on ./types and ./rules.
 * Counterpart of ARCH-v1.md sections 6.1, 6.3 and 17.4.
 * All string literals use ASCII quotes only.
 */

import type {
  FieldType,
  FieldLocator,
  Logger,
  ControlType,
  SkipReason,
} from './types';
import type { EffectiveRules } from './rules';

/**
 * 17.4 / 17.5 Nearest form container.
 * readablePath is human text for the picker tooltip, e.g.
 * "人员信息 > 第 2 行 > 姓名" (form > row > label). It is NOT a CSS
 * selector, XPath or DOM path, and must never be shown as an element
 * path in the picker. Element paths are allowed only in the collapsed
 * failure section of the diagnostic report (one-click locate / copy).
 */
export interface ContainerInfo {
  kind: 'form' | 'dialog' | 'search' | 'table-toolbar' | 'standalone' | 'unknown';
  readablePath: string;
  inFormScope: boolean;
  isExcluded: boolean;
  excludeReason?: string;
  rowIndex?: number;
}

export interface TextFeatures {
  label: string;
  placeholder: string;
  name: string;
  elementId: string;
  ariaLabel: string;
  nearbyText: string;
}

export interface FieldConstraints {
  maxLength?: number;
  pattern?: string;
  min?: string;
  max?: string;
  step?: string;
  required: boolean;
  readOnly: boolean;
  disabled: boolean;
  hidden: boolean;
  valueFormat?: string;
}

/**
 * Pure data, JSON serializable, safe across chrome.runtime.sendMessage.
 * No HTMLElement, no functions, no Map instances.
 */
export interface FieldDescriptor {
  id: string;
  locator: FieldLocator;
  tagName: 'INPUT' | 'TEXTAREA' | 'SELECT' | 'CONTENTEDITABLE' | 'CUSTOM';
  inputType: string;
  controlType: ControlType;
  textFeatures: TextFeatures;
  constraints: FieldConstraints;
  enumOptions: string[];
  container: ContainerInfo;
  hasValue: boolean;
  inferredType: FieldType;
  confidence: number;
  scoreBreakdown: Record<string, number>;
  source: 'L1' | 'L2' | 'L3' | 'RULE';
  skipReason?: SkipReason;
}

/** Runtime-only. Never put this across chrome.runtime.sendMessage. */
export interface FieldHandle {
  descriptor: FieldDescriptor;
  element: HTMLElement;
  isConnected(): boolean;
}

export interface DetectionContext {
  root: ParentNode;
  scope: 'form' | 'dialog' | 'document';
  rules: EffectiveRules;
  logger: Logger;
}
