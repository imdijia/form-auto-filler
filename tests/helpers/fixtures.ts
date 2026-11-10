/**
 * Minimal, pure-data test fixtures. These are INPUTS to the contract, never
 * an implementation of it. FieldDescriptor stays JSON-serializable as required
 * by docs/contracts/field.ts (no HTMLElement / function / Map inside).
 */
import type { FieldDescriptor, FieldHandle, FieldConstraints } from '../../docs/contracts/field';
import type { FieldType, FillContext } from '../../docs/contracts/types';

export function makeConstraints(overrides: Partial<FieldConstraints> = {}): FieldConstraints {
  return {
    required: false,
    readOnly: false,
    disabled: false,
    hidden: false,
    ...overrides,
  };
}

export function makeField(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id: 'qa-field-1',
    locator: {
      strategy: 'labelText',
      value: 'qa-label',
      fallbacks: [],
      scope: 'form',
      frame: 'top',
    },
    tagName: 'INPUT',
    inputType: 'text',
    controlType: 'input',
    textFeatures: {
      label: '',
      placeholder: '',
      name: '',
      elementId: '',
      ariaLabel: '',
      nearbyText: '',
    },
    constraints: makeConstraints(),
    enumOptions: [],
    container: {
      kind: 'form',
      readablePath: '测试表单 > 第 1 行',
      inFormScope: true,
      isExcluded: false,
    },
    hasValue: false,
    inferredType: 'unknown',
    confidence: 0,
    scoreBreakdown: {},
    source: 'L1',
    ...overrides,
  };
}

/** Field pre-normalized to a known type, as FillPlanner does before getValue. */
export function typedField(fieldType: FieldType, overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return makeField({ inferredType: fieldType, source: 'L2', confidence: 0.95, ...overrides });
}

export function makeContext(seed: number, overrides: Partial<FillContext> = {}): FillContext {
  return {
    sessionId: `qa-session-${seed}`,
    seed,
    siteKey: 'qa.test.example.com',
    pageKey: 'qa-page-1',
    generated: new Map<FieldType, string>(),
    locale: 'zh-CN',
    now: '2026-11-09T00:00:00.000Z',
    ...overrides,
  };
}

/** Runtime handle wrapper; created only inside jsdom-environment suites. */
export function makeHandle(field: FieldDescriptor, element: HTMLElement): FieldHandle {
  return {
    descriptor: field,
    element,
    isConnected: () => element.isConnected,
  };
}
