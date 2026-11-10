import type {
  FieldDescriptor,
  FieldLocator,
  SkipReason,
  TextFeatures,
  FieldConstraints,
  ContainerInfo,
} from '../contracts';
import { hashString } from '../utils/hash';
import { containsAny } from '../utils/text';
import { isVisuallyHidden, readControlShape, type ControlShape } from './control-type';
import { readContainer } from './container';
import { readConstraints, readHasValue, readTextFeatures } from './text-features';
import { readEnumOptions } from './scoring/option-enum';

const SEARCH_WORDS = ['搜索', '查询', '筛选', '关键字', '关键词', 'search', 'keyword', 'filter', 'query'];
const CAPTCHA_WORDS = ['验证码', 'captcha', 'otp', 'verifycode', '校验码'];
const NON_CONTROL_TYPES = new Set(['submit', 'button', 'reset', 'image', 'hidden']);

export function isNonControlInput(shape: ControlShape): boolean {
  return shape.tagName === 'INPUT' && NON_CONTROL_TYPES.has(shape.inputType);
}

export function exclusionReason(
  element: HTMLElement,
  shape: ControlShape,
  features: TextFeatures,
  constraints: FieldConstraints,
  container: ContainerInfo,
  hasValue: boolean,
  document: Document,
  inScope = false,
): SkipReason | undefined {
  if (constraints.hidden || isVisuallyHidden(element, document)) return 'hidden';
  if (constraints.disabled) return 'disabled';
  if (shape.library === 'native' && constraints.readOnly && shape.controlType !== 'date') {
    return 'readonly';
  }
  if (shape.inputType === 'file') return 'file';
  if (shape.inputType === 'password') return 'captcha';
  const text = [
    features.label,
    features.placeholder,
    features.name,
    features.elementId,
    features.ariaLabel,
  ].join(' ').toLowerCase();
  if (containsAny(text, CAPTCHA_WORDS)) return 'captcha';
  if (inScope) {
    // v2 one-shot: only the explicit protected-control list excludes a
    // control. outside-form / search / unsupported / has-value must NOT
    // shrink the "fill every visible control" set; the filler retries those.
    return undefined;
  }
  if (shape.inputType === 'search' || containsAny(text, SEARCH_WORDS)) return 'search-or-filter';
  if (container.isExcluded) {
    return container.excludeReason === 'search-or-filter' ? 'search-or-filter' : 'outside-form';
  }
  if (shape.unsupported) return 'unsupported-control';
  if (hasValue) return 'has-value';
  return undefined;
}

function buildLocator(
  features: TextFeatures,
  container: ContainerInfo,
  scope: 'form' | 'dialog' | 'document',
  frameIndex: number,
): FieldLocator {
  const frame = frameIndex > 0 ? 'same-origin-iframe' : 'top';
  const fallbacks = [features.name, features.elementId].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const label = features.label || features.placeholder;
  if (label) {
    return { strategy: 'labelText', value: label, fallbacks, scope, frame, anchorLabel: label };
  }
  if (fallbacks.length > 0) {
    return {
      strategy: 'attr',
      value: fallbacks[0] ?? container.readablePath,
      fallbacks,
      scope,
      frame,
      anchorLabel: container.readablePath,
    };
  }
  return {
    strategy: 'rowAnchor',
    value: container.readablePath,
    fallbacks: [],
    scope,
    frame,
    anchorLabel: container.readablePath,
  };
}

/** Pure data, JSON serializable. No HTMLElement, no functions, no Map. */
export function buildDescriptor(
  element: HTMLElement,
  index: number,
  frameIndex: number,
  scope: 'form' | 'dialog' | 'document',
  document: Document,
  inScope = false,
): FieldDescriptor {
  const controlShape = readControlShape(element);
  const features = readTextFeatures(element, document);
  const constraints = readConstraints(element, controlShape, document);
  const container = readContainer(
    element, features.label || features.placeholder || features.name, inScope,
  );
  const enumOptions = readEnumOptions(element, controlShape, document);
  const hasValue = readHasValue(element, controlShape);
  const skipReason = exclusionReason(
    element, controlShape, features, constraints, container, hasValue, document, inScope,
  );
  const identity = [
    features.label, features.placeholder, features.name, features.elementId,
    controlShape.tagName, String(index),
  ].join('|');
  return {
    id: 'f' + frameIndex + '-' + index + '-' + hashString(identity),
    locator: buildLocator(features, container, scope, frameIndex),
    tagName: controlShape.tagName,
    inputType: controlShape.inputType,
    controlType: controlShape.controlType,
    textFeatures: features,
    constraints,
    enumOptions,
    container,
    hasValue,
    inferredType: 'unknown',
    confidence: 0,
    scoreBreakdown: {},
    source: 'L1',
    skipReason,
  };
}
