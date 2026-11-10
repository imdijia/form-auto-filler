import { STORAGE_KEYS } from '../contracts';
import type { FillPlan, FillReport } from '../contracts';
import type { StoragePort } from '../infra/storage';
import { SETTINGS_KEY } from '../infra/keys';

export type ScopeMode = 'dialog' | 'form' | 'document';

export interface Settings {
  readonly seed: number;
  readonly dataset: 'random';
  readonly scope: ScopeMode;
  readonly dateFormat: string;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  seed: 4821,
  dataset: 'random',
  scope: 'dialog',
  dateFormat: 'YYYY-MM-DD',
});

export async function readSettings(storage: StoragePort): Promise<Settings> {
  const stored = await storage.get<Partial<Settings>>(SETTINGS_KEY);
  return {
    seed: typeof stored?.seed === 'number' && Number.isFinite(stored.seed)
      ? Math.trunc(stored.seed)
      : DEFAULT_SETTINGS.seed,
    dataset: 'random',
    scope: stored?.scope === 'form' || stored?.scope === 'document'
      ? stored.scope
      : DEFAULT_SETTINGS.scope,
    dateFormat: typeof stored?.dateFormat === 'string' && stored.dateFormat.length > 0
      ? stored.dateFormat
      : DEFAULT_SETTINGS.dateFormat,
  };
}

export async function writeSettings(
  storage: StoragePort,
  patch: Partial<Settings>,
): Promise<Settings> {
  const next: Settings = { ...(await readSettings(storage)), ...patch, dataset: 'random' };
  await storage.set(SETTINGS_KEY, next);
  return next;
}

export function nextSeed(seed: number): number {
  const next = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return next === 0 ? 1 : next;
}

export async function readLastPlan(storage: StoragePort): Promise<FillPlan | undefined> {
  return storage.get<FillPlan>(STORAGE_KEYS.LAST_PLAN);
}

export async function writeLastPlan(storage: StoragePort, plan: FillPlan): Promise<void> {
  await storage.set(STORAGE_KEYS.LAST_PLAN, plan);
}

export async function readLastResult(storage: StoragePort): Promise<FillReport | undefined> {
  return storage.get<FillReport>(STORAGE_KEYS.LAST_RESULT);
}

/** Human-readable control labels travel with the SAME result key, never with
    configuration or counters. They contain no field values and no URL. */
export async function readResultLabels(
  storage: StoragePort,
): Promise<Readonly<Record<string, string>>> {
  const stored = await storage.get<{ labels?: Record<string, string> }>(STORAGE_KEYS.LAST_RESULT);
  return stored?.labels ?? {};
}

export async function writeLastResult(
  storage: StoragePort,
  report: FillReport,
  labels: Readonly<Record<string, string>> = {},
): Promise<void> {
  await storage.set(STORAGE_KEYS.LAST_RESULT, { ...report, labels });
}
