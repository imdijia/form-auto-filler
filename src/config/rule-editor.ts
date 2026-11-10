import { STORAGE_KEYS } from '../contracts';
import type { Result, RulesDocument } from '../contracts';
import type { StoragePort } from '../infra/storage';
import { createDefaultRules } from './default-rules';
import { validateRulesDocument } from './rule-validator';
import { parseJsonSafe, stringifyPretty } from './json-io';
import { err, ok } from '../utils/result';

/** Options-page editor. Every write re-validates the whole document against
    rules.schema.json, so a bad edit can never be persisted. No counters and
    no page data are ever read here (ARCH 15.1). */
function clone(value: RulesDocument): RulesDocument {
  return JSON.parse(stringifyPretty(value)) as RulesDocument;
}

export async function readDocument(storage: StoragePort): Promise<RulesDocument> {
  const stored = await storage.get<RulesDocument>(STORAGE_KEYS.RULES);
  return stored ? clone(stored) : createDefaultRules();
}

export async function saveDocument(
  storage: StoragePort,
  document: RulesDocument,
): Promise<Result<RulesDocument>> {
  const validated = validateRulesDocument(document);
  if (!validated.ok) return validated;
  await storage.set(STORAGE_KEYS.RULES, validated.value);
  return ok(validated.value);
}

export async function setAliases(
  storage: StoragePort,
  key: string,
  aliases: readonly string[],
): Promise<Result<RulesDocument>> {
  if (!Object.prototype.hasOwnProperty.call(createDefaultRules().global.aliasDictionary, key)) {
    return err('E_RULE_SCHEMA_INVALID', '字段类型不在权威枚举内');
  }
  const document = await readDocument(storage);
  document.global.aliasDictionary[key] = aliases.filter((item) => item.trim().length > 0);
  return saveDocument(storage, document);
}

export async function setGeneratorEnabled(
  storage: StoragePort,
  key: string,
  enabled: boolean,
): Promise<Result<RulesDocument>> {
  const document = await readDocument(storage);
  document.global.generators[key] = { ...(document.global.generators[key] ?? {}), enabled };
  return saveDocument(storage, document);
}

export async function setGeneratorParam(
  storage: StoragePort,
  key: string,
  param: string,
  value: string,
): Promise<Result<RulesDocument>> {
  const document = await readDocument(storage);
  document.global.generators[key] = { ...(document.global.generators[key] ?? {}), [param]: value };
  return saveDocument(storage, document);
}

export async function resetDocument(storage: StoragePort): Promise<RulesDocument> {
  const document = createDefaultRules();
  await storage.set(STORAGE_KEYS.RULES, document);
  return document;
}

export async function removePageRule(
  storage: StoragePort,
  pageId: string,
  locatorValue: string,
): Promise<Result<RulesDocument>> {
  const document = await readDocument(storage);
  const page = document.pages.find((entry) => entry.pageId === pageId);
  if (page) {
    page.overrides = page.overrides.filter((item) => item.locator.value !== locatorValue);
    if (page.overrides.length === 0) {
      document.pages = document.pages.filter((entry) => entry.pageId !== pageId);
    }
  }
  return saveDocument(storage, document);
}

export interface ImportPreview {
  readonly document: RulesDocument;
  readonly added: number;
  readonly covered: number;
  readonly conflicts: number;
}

/** "新增 N 条 / 覆盖 M 条 / 冲突 K 条" is computed BEFORE any write. */
export async function previewImport(
  storage: StoragePort,
  raw: string,
): Promise<Result<ImportPreview>> {
  const parsed = parseJsonSafe(raw);
  if (!parsed.ok) return err('E_RULE_SCHEMA_INVALID', parsed.message);
  const validated = validateRulesDocument(parsed.value);
  if (!validated.ok) return err('E_RULE_SCHEMA_INVALID', validated.message);
  const current = await readDocument(storage);
  const incoming = validated.value;
  const currentKeys = new Set(Object.keys(current.global.aliasDictionary));
  let added = 0;
  let covered = 0;
  for (const key of Object.keys(incoming.global.aliasDictionary)) {
    if (currentKeys.has(key)) covered += 1;
    else added += 1;
  }
  const currentPages = new Set(current.pages.map((page) => page.pageId));
  const conflicts = incoming.pages.filter(
    (page) => currentPages.has(page.pageId) &&
      JSON.stringify(page.overrides) !== JSON.stringify(
        current.pages.find((item) => item.pageId === page.pageId)?.overrides ?? [],
      ),
  ).length;
  return ok({ document: incoming, added, covered, conflicts });
}
