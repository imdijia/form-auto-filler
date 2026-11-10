import { LIMITS } from '../contracts';
import type {
  ControlType,
  DataProvider,
  DiagnosticCounter,
  FieldHandle,
  FillContext,
  FillExecutor,
  FillPlan,
  FillReport,
  FillResult,
  Filler,
  MutationWaiter,
  PlanItem,
  SkipReason,
  UndoManager,
} from '../contracts';
import type { RuntimeEventType } from '../infra/messages';
import { readDomValue } from '../fill/native-setter';
import { yieldToMain } from './batch-scheduler';
import { buildReport, isOutOfScope, isVerifiedSuccess } from './fill-report';

const UNIQUENESS_TYPES = new Set(['idCard', 'phone', 'code']);

export interface ExecutorDeps {
  readonly waiter: MutationWaiter;
  readonly counter: DiagnosticCounter;
  readonly undo?: UndoManager;
  readonly provider?: DataProvider;
  readonly rescan?: () => FieldHandle[];
  readonly onProgress?: (done: number, total: number) => void;
  readonly onRuntimeEvent?: (
    type: RuntimeEventType,
    sessionId: string,
    done?: number,
    total?: number,
  ) => void;
}

function controlOf(handles: Map<string, FieldHandle>, fieldId: string): ControlType {
  return handles.get(fieldId)?.descriptor.controlType ?? 'other';
}

function skipOutcome(
  item: PlanItem,
  handles: Map<string, FieldHandle>,
  reason?: SkipReason,
): FillResult {
  return {
    fieldId: item.fieldId,
    status: 'skipped',
    verified: false,
    skipReason: reason ?? 'user-unchecked',
    controlType: controlOf(handles, item.fieldId),
    attempts: 0,
    elapsedMs: 0,
  };
}

export function createFillExecutor(deps: ExecutorDeps): FillExecutor {
  let cancelled = false;
  return {
    cancel(_sessionId: string): void {
      cancelled = true;
    },

    async execute(
      plan: FillPlan,
      handles: Map<string, FieldHandle>,
      filler: Filler,
      ctx: FillContext,
    ): Promise<FillReport> {
      const startedAt = performance.now();
      cancelled = false;
      const outcomes: FillResult[] = [];
      const total = plan.items.length;
      let done = 0;

      const selectedHandles: FieldHandle[] = [];
      for (const item of plan.items) {
        if (!item.selected) continue;
        const handle = handles.get(item.fieldId);
        if (handle) selectedHandles.push(handle);
      }
      deps.undo?.capture(ctx.sessionId, selectedHandles);
      deps.counter.increment('fill_plan_confirmed');
      deps.onRuntimeEvent?.('PLAN_CONFIRMED', ctx.sessionId);

      for (const item of plan.items) {
        if (cancelled) {
          outcomes.push(skipOutcome(item, handles, 'user-unchecked'));
          continue;
        }
        if (!item.selected) {
          outcomes.push(skipOutcome(item, handles, item.skipReason));
          deps.counter.increment('field_skipped');
          done += 1;
          deps.onProgress?.(done, total);
          deps.onRuntimeEvent?.('PROGRESS', ctx.sessionId, done, total);
          continue;
        }
        const handle = handles.get(item.fieldId);
        if (!handle || !handle.isConnected()) {
          outcomes.push({
            fieldId: item.fieldId,
            status: 'failed',
            verified: false,
            code: 'E_FIELD_NOT_FOUND',
            failureReason: '控件已脱离页面',
            controlType: controlOf(handles, item.fieldId),
            attempts: 0,
            elapsedMs: 0,
          });
          deps.counter.increment('field_failed');
          done += 1;
          continue;
        }

        let result = await filler.fill(handle, item.value, ctx);
        const expected = result.value ?? item.value;
        const stable = await deps.waiter.waitFor(
          () => !result.verified || readDomValue(handle) === expected,
          AbortSignal.timeout(LIMITS.LINKAGE_TIMEOUT_MS),
        );
        if (!stable.ok && result.status === 'filled') {
          result = {
            ...result,
            status: 'failed',
            verified: false,
            code: 'E_LINKAGE_TIMEOUT',
            failureReason: '联动等待超时：控件值未稳定',
          };
        }
        outcomes.push(result);
        if (result.skipReason === 'low-confidence') {
          // Already counted as field_unknown during L2 inference.
        } else if (result.status === 'skipped' || isOutOfScope(result)) {
          deps.counter.increment('field_skipped');
        } else if (!isVerifiedSuccess(result)) {
          deps.counter.increment('field_failed');
        }
        // Uniqueness-validated fields are written serially and throttled.
        if (UNIQUENESS_TYPES.has(item.fieldType)) await yieldToMain();
        await yieldToMain();
        done += 1;
        deps.onProgress?.(done, total);
        deps.onRuntimeEvent?.('PROGRESS', ctx.sessionId, done, total);
      }

      // Linkage: after the base batches, fill newly mounted controls too.
      if (deps.rescan && deps.provider && !cancelled) {
        const known = new Set(plan.items.map((item) => item.fieldId));
        const deadline = startedAt + LIMITS.HARD_FILL_TIMEOUT_MS;
        for (let pass = 0; pass < 3 && !cancelled && performance.now() < deadline; pass += 1) {
          const fresh = deps.rescan().filter(
            (handle) =>
              !known.has(handle.descriptor.id) &&
              !handle.descriptor.skipReason &&
              handle.descriptor.inferredType !== 'unknown',
          );
          if (fresh.length === 0) break;
          for (const handle of fresh) {
            known.add(handle.descriptor.id);
            handles.set(handle.descriptor.id, handle);
            const value = await deps.provider.getValue(handle.descriptor, ctx);
            const result = await filler.fill(handle, value, ctx);
            outcomes.push(result);
            if (result.status === 'skipped' || isOutOfScope(result)) {
              deps.counter.increment('field_skipped');
            } else if (!isVerifiedSuccess(result)) {
              deps.counter.increment('field_failed');
            }
            await yieldToMain();
          }
        }
      }

      deps.counter.increment('fill_completed');
      deps.onRuntimeEvent?.('RESULT_READY', ctx.sessionId);
      return buildReport(ctx.sessionId, outcomes, startedAt);
    },
  };
}
