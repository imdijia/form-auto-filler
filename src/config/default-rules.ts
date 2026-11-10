import { FIELD_META } from '../contracts/field-metadata';
import { LIMITS } from '../contracts';
import type { PresetsConfig, RulesDocument } from '../contracts';
import { DEFAULT_DATE_FORMAT } from '../utils/time';

/** Weights live in the rule document, not hard-coded in the inference code. */
export const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  label: 1.0,
  placeholder: 0.7,
  nameId: 0.5,
  ariaLabel: 0.5,
  nearbyText: 0.3,
  formRowStructure: 0.25,
  regexFeature: 0.4,
  confidenceThreshold: LIMITS.CONFIDENCE_THRESHOLD,
});

export const FEATURE_KEYS = [
  'label',
  'placeholder',
  'nameId',
  'ariaLabel',
  'nearbyText',
  'formRowStructure',
  'regexFeature',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function emptyPresets(): PresetsConfig {
  return { global: {}, bySite: {}, byPage: {} };
}

/** Aliases and generator ids come straight from field-types.json. */
export function createDefaultRules(): RulesDocument {
  const aliasDictionary: Record<string, string[]> = {};
  const generators: Record<string, Record<string, unknown>> = {};
  for (const meta of FIELD_META) {
    aliasDictionary[meta.key] = [...meta.aliases];
    generators[meta.key] = { generator: meta.generator, ...meta.constraints };
  }
  generators.date = { ...(generators.date ?? {}), format: DEFAULT_DATE_FORMAT };
  generators.time = { ...(generators.time ?? {}), format: 'HH:mm' };
  return {
    schemaVersion: 1,
    global: {
      aliasDictionary,
      weights: { ...DEFAULT_WEIGHTS },
      generators,
      presets: emptyPresets(),
    },
    sites: {},
    pages: [],
  };
}

export function weightOf(weights: Readonly<Record<string, number>>, key: FeatureKey): number {
  const value = weights[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : (DEFAULT_WEIGHTS[key] ?? 0);
}

export function thresholdOf(weights: Readonly<Record<string, number>>): number {
  const value = weights.confidenceThreshold;
  return typeof value === 'number' && value >= 0 && value <= 1
    ? value
    : LIMITS.CONFIDENCE_THRESHOLD;
}
