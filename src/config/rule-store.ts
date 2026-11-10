import { LIMITS, STORAGE_KEYS } from '../contracts';
import type {
  EffectiveRules,
  FieldOverride,
  PageOverride,
  PresetsConfig,
  Result,
  RuleStore,
  RulesDocument,
} from '../contracts';
import type { StoragePort } from '../infra/storage';
import { createDefaultRules, DEFAULT_WEIGHTS, thresholdOf } from './default-rules';
import { parseJsonSafe, stringifyPretty } from './json-io';
import { validateFieldOverride, validateRulesDocument } from './rule-validator';
import { err, ok } from '../utils/result';
import { nowIso } from '../utils/time';

export interface PageContext {
  readonly urlPattern: string;
  readonly structureHash: string;
}

/** RuleStore plus the two page-context helpers the content runtime needs.
    Both stay off the public interface so the locked contract is unchanged. */
export interface RuleStoreEx extends RuleStore {
  getPageRecord(pageKey: string): Promise<PageOverride | undefined>;
  setPageContext(pageKey: string, context: PageContext): void;
}

function normalizePresets(value: unknown): PresetsConfig {
  if (typeof value !== 'object' || value === null) return { global: {}, bySite: {}, byPage: {} };
  const record = value as Record<string, unknown>;
  const asMap = (input: unknown): Record<string, Record<string, string>> =>
    typeof input === 'object' && input !== null ? (input as Record<string, Record<string, string>>) : {};
  const global = typeof record.global === 'object' && record.global !== null
    ? (record.global as Record<string, string>)
    : {};
  return { global, bySite: asMap(record.bySite), byPage: asMap(record.byPage) };
}

function withDefaults(stored: RulesDocument): RulesDocument {
  const base = createDefaultRules();
  const global = stored.global ?? base.global;
  return {
    schemaVersion: 1,
    global: {
      aliasDictionary: { ...base.global.aliasDictionary, ...(global.aliasDictionary ?? {}) },
      weights: { ...base.global.weights, ...(global.weights ?? {}) },
      generators: { ...base.global.generators, ...(global.generators ?? {}) },
      presets: normalizePresets(global.presets),
    },
    sites: stored.sites ?? {},
    pages: Array.isArray(stored.pages) ? stored.pages : [],
  };
}

export function createRuleStore(storage: StoragePort): RuleStoreEx {
  let cache: RulesDocument | null = null;
  const contexts = new Map<string, PageContext>();

  async function load(): Promise<RulesDocument> {
    if (cache) return cache;
    const stored = await storage.get<RulesDocument>(STORAGE_KEYS.RULES);
    const document = stored ? withDefaults(stored) : createDefaultRules();
    cache = document;
    if (!stored) await storage.set(STORAGE_KEYS.RULES, document);
    return document;
  }

  async function persist(document: RulesDocument): Promise<void> {
    cache = document;
    await storage.set(STORAGE_KEYS.RULES, document);
  }

  return {
    async getPageRecord(pageKey: string): Promise<PageOverride | undefined> {
      const document = await load();
      return document.pages.find((page) => page.pageId === pageKey);
    },

    setPageContext(pageKey: string, context: PageContext): void {
      contexts.set(pageKey, context);
    },

    load,

    async getEffectiveRules(siteKey: string, pageKey: string): Promise<EffectiveRules> {
      const document = await load();
      const site = document.sites[siteKey];
      const weights = { ...DEFAULT_WEIGHTS, ...document.global.weights };
      const page = document.pages.find((entry) => entry.pageId === pageKey);
      return {
        aliasDictionary: {
          ...document.global.aliasDictionary,
          ...(site?.aliasDictionary ?? {}),
        },
        weights,
        generators: document.global.generators,
        confidenceThreshold: thresholdOf(weights),
        pageOverrides: page?.overrides ?? [],
        presets: document.global.presets,
      };
    },

    async savePageOverride(pageKey: string, override: FieldOverride): Promise<void> {
      const problem = validateFieldOverride(override as unknown);
      if (problem) {
        // Throwing keeps the illegal document out of storage. The exported
        // JSON must always pass its own import validation.
        throw new Error('E_RULE_SCHEMA_INVALID: ' + problem);
      }
      const document = await load();
      let page = document.pages.find((entry) => entry.pageId === pageKey);
      if (!page) {
        const context = contexts.get(pageKey);
        page = {
          pageId: pageKey,
          urlPattern: context?.urlPattern ?? '/',
          hashAlgorithm: 'form-skeleton-v1',
          structureHash: context?.structureHash ?? 'unrecorded',
          detectedAt: nowIso(),
          overrides: [],
        };
        document.pages.push(page);
      }
      const index = page.overrides.findIndex(
        (entry) => entry.locator.value === override.locator.value,
      );
      if (index >= 0) page.overrides[index] = override;
      else page.overrides.push(override);
      if (page.overrides.length > 50) {
        page.overrides.splice(0, page.overrides.length - 50);
      }
      page.detectedAt = nowIso();
      await persist(document);
    },

    async removePageOverride(pageKey: string, locatorValue: string): Promise<void> {
      const document = await load();
      const page = document.pages.find((entry) => entry.pageId === pageKey);
      if (!page) return;
      page.overrides = page.overrides.filter(
        (entry) => entry.locator.value !== locatorValue,
      );
      await persist(document);
    },

    async exportJson(): Promise<string> {
      // Only the rule document. faf.counters.v1 is a separate top-level key
      // and is never read here (ARCH 15.1).
      return stringifyPretty(await load());
    },

    async importJson(raw: string): Promise<Result<RulesDocument>> {
      const parsed = parseJsonSafe(raw);
      if (!parsed.ok) return err('E_RULE_SCHEMA_INVALID', parsed.message);
      const validated = validateRulesDocument(parsed.value);
      if (!validated.ok) return err('E_RULE_SCHEMA_INVALID', validated.message);
      const document = withDefaults(validated.value);
      await persist(document);
      return ok(document);
    },
  };
}

export const MAX_PAGE_OVERRIDES = 50;
export const DEFAULT_CONFIDENCE_THRESHOLD = LIMITS.CONFIDENCE_THRESHOLD;
