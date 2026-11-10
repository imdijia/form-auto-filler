/**
 * Form Auto Filler - internal module contracts v1.1 (entry point).
 * Pure declarations only. No implementation, no runtime imports.
 *
 * Types are split by responsibility to keep every file under 300 lines:
 *   types.ts       -> shared value types, field type enum, error model, limits
 *   rules.ts       -> rule store document types
 *   field.ts       -> FieldDescriptor / FieldHandle / ContainerInfo
 *   interfaces.ts  -> the six module contracts (this file)
 *
 * Dependency direction is one way only:
 *   interfaces -> field -> rules -> types
 *
 * Counterpart of ARCH-v1.md section 6 and sections 14-17.
 * All string literals use ASCII quotes only.
 */

import type {
  FillContext,
  Result,
  FillResult,
  FillPlan,
  FillReport,
  VerificationDetail,
  LocalCounterEvent,
  UndoState,
} from './types';
import type {
  FieldDescriptor,
  FieldHandle,
  DetectionContext,
} from './field';
import type {
  EffectiveRules,
  RulesDocument,
  FieldOverride,
} from './rules';

/* 6.2 DataProvider - the only v1 design investment */

export interface DataProvider {
  readonly id: string;
  getValue(field: FieldDescriptor, ctx: FillContext): string | Promise<string>;
}

export interface CompositeProvider extends DataProvider {
  chain: readonly DataProvider[];
}

export interface ProviderRegistry {
  register(provider: DataProvider): void;
  resolve(ctx: FillContext): DataProvider;
}

/* 6.3 FieldDetector */

export interface FieldDetector {
  scan(ctx: DetectionContext): FieldHandle[];
  infer(handles: FieldHandle[], ctx: DetectionContext): FieldDescriptor[];
  applyOverrides(fields: FieldDescriptor[], rules: EffectiveRules): FieldDescriptor[];
  detect(ctx: DetectionContext): FieldDescriptor[];
}

/* 6.4 Filler. P0 strategies are built-in and mandatory, not opt-in plugins:
   native-input, native-select, ant-design-vue-select,
   ant-design-vue-date-picker, element-plus-select, element-plus-date-picker.
   The constructor must assert all six are present (ARCH section 14.1).
   register() is only for adapters added after P2. */

export interface FillerStrategy {
  readonly id: string;
  supports(handle: FieldHandle): boolean;
  /** Return verified=false + E_READBACK_MISMATCH when any readback layer fails.
      Never report success just because input/change events were dispatched. */
  fill(handle: FieldHandle, value: string, ctx: FillContext): Promise<FillResult>;
}

/** P0 built-in component adapter. Options live in a body-level portal. */
export interface ComponentAdapter extends FillerStrategy {
  readonly library: 'ant-design-vue' | 'element-plus';
  readonly control: 'select' | 'date-picker';
}

export interface Filler {
  register(strategy: FillerStrategy): void;
  fill(handle: FieldHandle, value: string, ctx: FillContext): Promise<FillResult>;
}

/* 14.2 Three-layer readback. Never treat "event dispatched" as success. */

export interface StateVerifier {
  verify(
    handle: FieldHandle,
    value: string,
    adapterId: string,
  ): Promise<VerificationDetail>;
}

/* 14.3 Linkage stability: MutationObserver + predicate, no fixed setTimeout. */

export interface MutationWaiter {
  waitFor(predicate: () => boolean, signal?: AbortSignal): Promise<Result<void>>;
}

/* 6.5 RuleStore */

export interface RuleStore {
  load(): Promise<RulesDocument>;
  getEffectiveRules(siteKey: string, pageKey: string): Promise<EffectiveRules>;
  savePageOverride(pageKey: string, override: FieldOverride): Promise<void>;
  removePageOverride(pageKey: string, locatorValue: string): Promise<void>;
  exportJson(): Promise<string>;
  importJson(raw: string): Promise<Result<RulesDocument>>;
}

/* 6.6 FillPlanner */

export interface FillPlanner {
  plan(
    fields: FieldDescriptor[],
    rules: EffectiveRules,
    ctx: FillContext,
    provider: DataProvider,
  ): Promise<FillPlan>;
}

/* 6.7 Execution and bridge */

export interface FillExecutor {
  execute(
    plan: FillPlan,
    handles: Map<string, FieldHandle>,
    filler: Filler,
    ctx: FillContext,
  ): Promise<FillReport>;
  cancel(sessionId: string): void;
}

export interface BridgePort {
  readonly available: boolean;
  request<T>(
    op: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Result<T>>;
}

/* 15.1 Local counters only. No network reporting module exists. */

export interface DiagnosticCounter {
  increment(event: LocalCounterEvent): void;
  snapshot(): Readonly<Record<LocalCounterEvent, number>>;
  clear(): void;
}

/* 16.4 Undo. Snapshots live only in this content-script session. Restore
   goes through the SAME FillerStrategy that filled the control, so a
   select/date-picker restores its component state instead of only writing
   a hidden input. No component instance channel is used. */

export interface UndoManager {
  capture(sessionId: string, handles: readonly FieldHandle[]): UndoState;
  state(sessionId: string): UndoState;
  restore(
    sessionId: string,
    handles: Map<string, FieldHandle>,
  ): Promise<readonly FillResult[]>;
  invalidate(sessionId: string, reason: 'page-navigated' | 'dialog-closed'): void;
}

/* Cross-cutting port, implemented in config/ only */

export interface SiteGuard {
  assertAllowed(hostname: string, url: string): Result<void>;
}
