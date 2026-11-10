/** Local diagnostic counters. Separate top-level key, zero network reporting,
    no field values, no URL plaintext, no per-dimension detail in the UI. */
import { STORAGE_KEYS } from '../contracts';
import type {
  DiagnosticCounter,
  LocalCounterEvent,
  LocalCounterRecord,
} from '../contracts';
import type { StoragePort } from '../infra/storage';
import { nowIso } from '../utils/time';

export const COUNTER_EVENTS: readonly LocalCounterEvent[] = Object.freeze([
  'fill_triggered',
  'fill_plan_confirmed',
  'first_core_action',
  'field_inferred',
  'field_unknown',
  'field_skipped',
  'field_failed',
  'picker_rebind',
  'rule_hash_drift',
  'fill_completed',
  'error_occurred',
]);

export type CounterMap = Partial<Record<LocalCounterEvent, LocalCounterRecord>>;

function emptySnapshot(): Record<LocalCounterEvent, number> {
  const snapshot = {} as Record<LocalCounterEvent, number>;
  for (const event of COUNTER_EVENTS) snapshot[event] = 0;
  return snapshot;
}

export async function readCounters(
  storage: StoragePort,
): Promise<Record<LocalCounterEvent, number>> {
  const stored = await storage.get<CounterMap>(STORAGE_KEYS.COUNTERS);
  const snapshot = emptySnapshot();
  if (!stored) return snapshot;
  for (const event of COUNTER_EVENTS) {
    const record = stored[event];
    if (record && Number.isFinite(record.count)) snapshot[event] = record.count;
  }
  return snapshot;
}

export async function readCounterRecords(
  storage: StoragePort,
): Promise<CounterMap> {
  return (await storage.get<CounterMap>(STORAGE_KEYS.COUNTERS)) ?? {};
}

export function createDiagnosticCounter(storage: StoragePort): DiagnosticCounter {
  let records: CounterMap = {};
  let loaded = false;
  // Serialize read-modify-write. Without a queue, two rapid increments both
  // read the same base object and the second write silently drops the first.
  let queue: Promise<void> = Promise.resolve();

  async function ensure(): Promise<void> {
    if (loaded) return;
    records = (await storage.get<CounterMap>(STORAGE_KEYS.COUNTERS)) ?? {};
    loaded = true;
  }

  return {
    increment(event: LocalCounterEvent): void {
      queue = queue.then(async () => {
        try {
          await ensure();
          const previous = records[event];
          records[event] = {
            event,
            count: (previous?.count ?? 0) + 1,
            lastAt: nowIso(),
          };
          await storage.set(STORAGE_KEYS.COUNTERS, records);
        } catch {
          // Counters must never block or break a fill.
        }
      });
    },

    snapshot(): Readonly<Record<LocalCounterEvent, number>> {
      const snapshot = emptySnapshot();
      for (const event of COUNTER_EVENTS) {
        snapshot[event] = records[event]?.count ?? 0;
      }
      return snapshot;
    },

    clear(): void {
      queue = queue.then(async () => {
        records = {};
        loaded = true;
        try {
          await storage.set(STORAGE_KEYS.COUNTERS, records);
        } catch {
          // Clearing is best effort and stays local.
        }
      });
    },
  };
}
