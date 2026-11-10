/**
 * Form Auto Filler - rule store document types v1.
 * Pure declarations only. Depends on ./types only.
 * Counterpart of ARCH-v1.md sections 6.5 and 8, and rules.schema.json.
 * All string literals use ASCII quotes only.
 */

import type { FieldType, FieldLocator } from './types';

export interface PresetsConfig {
  global: Record<string, string>;
  bySite: Record<string, Record<string, string>>;
  byPage: Record<string, Record<string, string>>;
}

export interface FieldOverride {
  locator: FieldLocator;
  action: 'setType' | 'skip' | 'forceValue';
  fieldType?: Exclude<FieldType, 'unknown'>;
  note?: string;
}

export interface SiteOverride {
  aliasDictionary?: Record<string, string[]>;
  dateFormat?: string;
  enumDictionaries?: Record<string, string[]>;
}

export interface PageOverride {
  pageId: string;
  urlPattern: string;
  hashAlgorithm: string;
  structureHash: string;
  detectedAt: string;
  overrides: FieldOverride[];
}

export interface RulesDocument {
  schemaVersion: 1;
  global: {
    aliasDictionary: Record<string, string[]>;
    weights: Record<string, number>;
    generators: Record<string, Record<string, unknown>>;
    presets: PresetsConfig;
  };
  sites: Record<string, SiteOverride>;
  pages: PageOverride[];
}

/** Merged result of global + site + page overrides. */
export interface EffectiveRules {
  aliasDictionary: Readonly<Record<string, readonly string[]>>;
  weights: Readonly<Record<string, number>>;
  generators: Readonly<Record<string, Record<string, unknown>>>;
  confidenceThreshold: number;
  pageOverrides: readonly FieldOverride[];
  presets: PresetsConfig;
}
