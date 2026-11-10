/**
 * v2.1 QA-owned test scaffolding. Pure descriptor factory + deterministic RNG
 * derived the SAME way as the production provider (createRandomProvider uses
 * deriveSeed(seed, field.id)). No implementation logic is copied here: all
 * behaviour under test comes from src/** modules imported by the test files.
 */
import type { FieldDescriptor } from '../../src/contracts';
import { createRng, deriveSeed } from '../../src/utils/rng';

export function makeV21Field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  const base: FieldDescriptor = {
    id: 'f0-0-default',
    locator: {
      strategy: 'labelText', value: '', fallbacks: [], scope: 'form', frame: 'top',
    },
    tagName: 'INPUT',
    inputType: 'text',
    controlType: 'input',
    textFeatures: {
      label: '', placeholder: '', name: '', elementId: '', ariaLabel: '', nearbyText: '',
    },
    constraints: { required: false, readOnly: false, disabled: false, hidden: false },
    enumOptions: [],
    container: {
      kind: 'form', readablePath: '当前表单', inFormScope: true, isExcluded: false,
    },
    hasValue: false,
    inferredType: 'unknown',
    confidence: 0,
    scoreBreakdown: {},
    source: 'L2',
  };
  return {
    ...base,
    ...overrides,
    textFeatures: { ...base.textFeatures, ...(overrides.textFeatures ?? {}) },
    constraints: { ...base.constraints, ...(overrides.constraints ?? {}) },
    locator: { ...base.locator, ...(overrides.locator ?? {}) },
    container: { ...base.container, ...(overrides.container ?? {}) },
  };
}

/** Same per-field sub-seed rule as createRandomProvider, so values are
    reproducible and two fields with different ids produce different suffixes. */
export function v21Rng(fieldId: string) {
  return createRng(deriveSeed(4821, fieldId));
}

export const LOCKED_SKIP_REASONS = [
  'readonly', 'disabled', 'hidden', 'file', 'captcha', 'outside-form',
  'search-or-filter', 'has-value', 'user-unchecked', 'low-confidence',
  'rule-excluded', 'unsupported-control', 'field-limit-exceeded',
] as const;
