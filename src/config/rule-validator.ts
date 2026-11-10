/** Focused validator for rules.schema.json. No ajv / no new dependency:
    the schema is data-only, so a hand-written structural check is enough and
    keeps the rule document free of executable code and remote references. */
import { FIELD_KEYS } from '../contracts/field-metadata';
import type { Result, RulesDocument } from '../contracts';
import { err, ok } from '../utils/result';

const FIELD_KEY_SET = new Set<string>(FIELD_KEYS);
const STRATEGIES = new Set(['labelText', 'attr', 'domPath', 'rowAnchor']);
const SCOPES = new Set(['form', 'dialog', 'document']);
const FRAMES = new Set(['top', 'same-origin-iframe']);
const ACTIONS = new Set(['setType', 'skip', 'forceValue']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function rejectCodeLike(value: unknown, path: string): string | null {
  if (typeof value === 'function') return path + ': executable code is forbidden';
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const problem = rejectCodeLike(value[i], path + '[' + i + ']');
      if (problem) return problem;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return path + '.' + key + ': forbidden key';
      const problem = rejectCodeLike(nested, path + '.' + key);
      if (problem) return problem;
    }
  }
  return null;
}

function checkAliasDictionary(value: unknown, path: string): string | null {
  if (!isRecord(value)) return path + ' must be an object';
  for (const [key, aliases] of Object.entries(value)) {
    if (!FIELD_KEY_SET.has(key)) return path + '.' + key + ' is not an authoritative field type';
    if (!isStringArray(aliases) || aliases.some((item) => item.length === 0)) {
      return path + '.' + key + ' must be an array of non-empty strings';
    }
  }
  return null;
}

function checkWeights(value: unknown, path: string): string | null {
  if (!isRecord(value)) return path + ' must be an object';
  const threshold = value.confidenceThreshold;
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    return path + '.confidenceThreshold must be a number in [0,1]';
  }
  for (const [key, weight] of Object.entries(value)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      return path + '.' + key + ' must be a finite non-negative number';
    }
  }
  return null;
}

function checkPresets(value: unknown, path: string): string | null {
  if (!isRecord(value)) return path + ' must be an object';
  for (const key of ['global', 'bySite', 'byPage']) {
    if (!isRecord(value[key])) return path + '.' + key + ' must be an object';
  }
  return null;
}

function checkOverride(value: unknown, path: string): string | null {
  if (!isRecord(value)) return path + ' must be an object';
  const locator = value.locator;
  if (!isRecord(locator)) return path + '.locator must be an object';
  if (typeof locator.strategy !== 'string' || !STRATEGIES.has(locator.strategy)) {
    return path + '.locator.strategy must avoid CSS / XPath and use a readable hint';
  }
  if (typeof locator.value !== 'string' || locator.value.length === 0) {
    return path + '.locator.value must be a non-empty string';
  }
  if (!isStringArray(locator.fallbacks)) return path + '.locator.fallbacks must be a string array';
  if (typeof locator.scope !== 'string' || !SCOPES.has(locator.scope)) {
    return path + '.locator.scope is invalid';
  }
  if (typeof locator.frame !== 'string' || !FRAMES.has(locator.frame)) {
    return path + '.locator.frame is invalid';
  }
  if (typeof value.action !== 'string' || !ACTIONS.has(value.action)) {
    return path + '.action is invalid';
  }
  if (value.action === 'setType') {
    if (typeof value.fieldType !== 'string' || !FIELD_KEY_SET.has(value.fieldType)) {
      return path + '.fieldType must be one of the 20 authoritative types';
    }
  }
  return null;
}

/** Same schema gate for the picker write path. CSS / XPath locators must be
    rejected before they can ever be persisted as a rule primary key. */
export function validateFieldOverride(raw: unknown): string | null {
  return checkOverride(raw, 'override');
}

export function validateRulesDocument(raw: unknown): Result<RulesDocument> {
  if (!isRecord(raw)) return err('E_RULE_SCHEMA_INVALID', '规则文档必须是对象');
  if (raw.schemaVersion !== 1) {
    return err('E_RULE_SCHEMA_INVALID', 'schemaVersion 必须为 1');
  }
  const codeProblem = rejectCodeLike(raw, 'rules');
  if (codeProblem) return err('E_RULE_SCHEMA_INVALID', codeProblem);

  const global = raw.global;
  if (!isRecord(global)) return err('E_RULE_SCHEMA_INVALID', 'global 必须是对象');
  const aliasProblem = checkAliasDictionary(global.aliasDictionary, 'global.aliasDictionary');
  if (aliasProblem) return err('E_RULE_SCHEMA_INVALID', aliasProblem);
  const weightProblem = checkWeights(global.weights, 'global.weights');
  if (weightProblem) return err('E_RULE_SCHEMA_INVALID', weightProblem);
  if (!isRecord(global.generators)) return err('E_RULE_SCHEMA_INVALID', 'global.generators 必须是对象');
  const presetProblem = checkPresets(global.presets, 'global.presets');
  if (presetProblem) return err('E_RULE_SCHEMA_INVALID', presetProblem);

  if (raw.sites !== undefined && !isRecord(raw.sites)) {
    return err('E_RULE_SCHEMA_INVALID', 'sites 必须是对象');
  }
  if (raw.pages !== undefined && !Array.isArray(raw.pages)) {
    return err('E_RULE_SCHEMA_INVALID', 'pages 必须是数组');
  }
  const pages = (raw.pages ?? []) as unknown[];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const path = 'pages[' + index + ']';
    if (!isRecord(page)) return err('E_RULE_SCHEMA_INVALID', path + ' 必须是对象');
    for (const key of ['pageId', 'urlPattern', 'hashAlgorithm', 'structureHash', 'detectedAt']) {
      if (typeof page[key] !== 'string' || (page[key] as string).length === 0) {
        return err('E_RULE_SCHEMA_INVALID', path + '.' + key + ' 必须是非空字符串');
      }
    }
    if (!Array.isArray(page.overrides) || page.overrides.length > 50) {
      return err('E_RULE_SCHEMA_INVALID', path + '.overrides 最多 50 条增量修正');
    }
    for (let j = 0; j < page.overrides.length; j += 1) {
      const overrideProblem = checkOverride(page.overrides[j], path + '.overrides[' + j + ']');
      if (overrideProblem) return err('E_RULE_SCHEMA_INVALID', overrideProblem);
    }
  }
  return ok(raw as unknown as RulesDocument);
}
