/**
 * Form Auto Filler - shared value types v1.1.
 * Pure declarations only. No runtime imports. No upward dependency.
 * Counterpart of ARCH-v1.md sections 6.0, 6.1, 6.4, 6.6, 6.7, 14.2, 16.3, 17.
 * All string literals use ASCII quotes only.
 */

/* 7. Field types - authoritative enum, keep in sync with field-types.json */

export type FieldType =
  | 'personName'
  | 'gender'
  | 'idCard'
  | 'phone'
  | 'landline'
  | 'email'
  | 'date'
  | 'time'
  | 'region'
  | 'address'
  | 'organization'
  | 'school'
  | 'education'
  | 'jobTitle'
  | 'code'
  | 'amount'
  | 'quantity'
  | 'percentage'
  | 'dictEnum'
  | 'longText'
  | 'unknown';

/** The 20 real types. 'unknown' is a sentinel, NOT a generator target. */
export const FIELD_TYPES: readonly Exclude<FieldType, 'unknown'>[] = [
  'personName', 'gender', 'idCard', 'phone', 'landline', 'email',
  'date', 'time', 'region', 'address', 'organization', 'school',
  'education', 'jobTitle', 'code', 'amount', 'quantity', 'percentage',
  'dictEnum', 'longText',
] as const;

/** UI shows pure text: input / select / date / textarea / other. */
export type ControlType = 'input' | 'select' | 'date' | 'textarea' | 'other';

/* 6.0 Error model. E_READBACK_MISMATCH is the single cross-doc code for a
   failed three-layer readback (PRD AC-3, UIUX R13, ARCH 14.2). The failing
   layer is named in FillResult.failureReason, not by a second error code. */

export type ErrorCode =
  | 'E_FIELD_NOT_FOUND'
  | 'E_READONLY_OR_DISABLED'
  | 'E_UNSUPPORTED_CONTROL'
  | 'E_VALIDATION_REJECTED'
  | 'E_READBACK_MISMATCH'
  | 'E_PORTAL_NOT_FOUND'
  | 'E_VALUE_FORMAT_MISMATCH'
  | 'E_LINKAGE_TIMEOUT'
  | 'E_FIELD_LIMIT_EXCEEDED'
  | 'E_TIMEOUT'
  | 'E_SITE_NOT_ALLOWED'
  | 'E_BRIDGE_UNAVAILABLE'
  | 'E_RULE_SCHEMA_INVALID'
  | 'E_PROVIDER_FAILED';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string; detail?: Record<string, unknown> };

/** Never log raw idCard / phone / preset values. Field names and codes only. */
export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
}

export interface FillContext {
  sessionId: string;
  seed: number;
  siteKey: string;
  pageKey: string;
  /** Serialize explicitly at the chrome.runtime message boundary. */
  generated: ReadonlyMap<FieldType, string>;
  locale: 'zh-CN';
  now: string;
}

/* 6.1 FieldLocator: persisted hints only, never a rule primary key.
   css / xpath are forbidden (PRD section 12, UIUX section 4.5). */

export interface FieldLocator {
  strategy: 'labelText' | 'attr' | 'domPath' | 'rowAnchor';
  value: string;
  fallbacks: string[];
  scope: 'form' | 'dialog' | 'document';
  frame: 'top' | 'same-origin-iframe';
  anchorLabel?: string;
}

/* 6.7 Bridge message envelope (MAIN world <-> ISOLATED world, P3) */

export interface BridgeMessage {
  channel: 'FAF_BRIDGE_V1';
  requestId: string;
  op: string;
  payload: Record<string, unknown>;
}

/* 17.4 Skip reasons - every skipped row must carry exactly one */

export type SkipReason =
  | 'readonly'
  | 'disabled'
  | 'hidden'
  | 'file'
  | 'captcha'
  | 'outside-form'
  | 'search-or-filter'
  | 'has-value'
  | 'user-unchecked'
  | 'low-confidence'
  | 'rule-excluded'
  | 'unsupported-control'
  | 'field-limit-exceeded';

/* 14.2 State verification. ISOLATED world cannot read framework state
   objects, so frameworkStateMatched uses observable proxy evidence:
   after two render frames, the framework has NOT reverted the value. */

export interface VerificationDetail {
  domValueMatched: boolean;
  frameworkStateMatched: boolean;
  validationCleared: boolean;
  evidence: string[];
  checkedAt: string;
}

/** Renamed from FillOutcome in v1.1. No alias, to avoid frontend/QA drift. */
export interface FillResult {
  fieldId: string;
  status: 'filled' | 'skipped' | 'failed';
  verified: boolean;
  value?: string;
  code?: ErrorCode;
  failureReason?: string;
  verification?: VerificationDetail;
  skipReason?: SkipReason;
  controlType: ControlType;
  attempts: number;
  elapsedMs: number;
}

/* 6.6 Plan and report */

export interface PlanItem {
  fieldId: string;
  fieldType: FieldType;
  value: string;
  selected: boolean;
  skipReason?: SkipReason;
  batch: number;
  dependsOn: string[];
}

export interface FillPlan {
  sessionId: string;
  items: PlanItem[];
  batches: PlanItem[][];
  structureHash: string;
  driftDetected: boolean;
  createdAt: string;
}

export interface FillReport {
  sessionId: string;
  total: number;
  filled: number;
  skipped: number;
  failed: number;
  outcomes: FillResult[];
  elapsedMs: number;
}

/* 16.3 Runtime message channel (content -> background -> popup) */

export type RuntimeMessage =
  | { channel: 'FAF_RUNTIME_V1'; requestId: string; type: 'PLAN_READY'; payload: { sessionId: string } }
  | { channel: 'FAF_RUNTIME_V1'; requestId: string; type: 'PLAN_CONFIRMED'; payload: { sessionId: string } }
  | { channel: 'FAF_RUNTIME_V1'; requestId: string; type: 'PROGRESS'; payload: { done: number; total: number } }
  | { channel: 'FAF_RUNTIME_V1'; requestId: string; type: 'RESULT_READY'; payload: { sessionId: string } }
  | { channel: 'FAF_RUNTIME_V1'; requestId: string; type: 'UNDO'; payload: { sessionId: string } };

export const STORAGE_KEYS = {
  RULES: 'faf.rules.v1',
  LAST_PLAN: 'faf.lastPlan.v1',
  LAST_RESULT: 'faf.lastResult.v1',
  COUNTERS: 'faf.counters.v1',
  FAB_POSITION: 'faf.fabPosition.v1',
  SITE_ALLOWLIST: 'faf.siteAllowlist.v1',
} as const;

/* 15.1 Local diagnostic counters only. Zero network reporting. */

export type LocalCounterEvent =
  | 'fill_triggered'
  | 'fill_plan_confirmed'
  | 'first_core_action'
  | 'field_inferred'
  | 'field_unknown'
  | 'field_skipped'
  | 'field_failed'
  | 'picker_rebind'
  | 'rule_hash_drift'
  | 'fill_completed'
  | 'error_occurred';

export interface LocalCounterRecord {
  event: LocalCounterEvent;
  count: number;
  lastAt: string;
}

/* 16.4 Undo. In-memory session only: never persisted, never written to
   faf.counters.v1, never included in an exported rules JSON. An empty
   originalValue is a real snapshot and must be restorable. */

export interface UndoSnapshot {
  sessionId: string;
  fieldId: string;
  originalValue: string;
  controlType: ControlType;
  capturedAt: string;
}

export type UndoInvalidReason =
  | 'page-navigated'
  | 'dialog-closed'
  | 'element-detached'
  | 'structure-changed'
  | 'snapshot-missing';

export interface UndoState {
  readonly valid: boolean;
  readonly invalidReason?: UndoInvalidReason;
  readonly structureHash: string;
  readonly items: readonly UndoSnapshot[];
}

/* 17.2 Thresholds - single source of truth for UI, planner and executor */

export const LIMITS = {
  CONFIDENCE_THRESHOLD: 0.6,
  VIRTUAL_SCROLL_THRESHOLD: 100,
  MAX_FIELDS_PER_PAGE: 200,
  DRIFT_JACCARD_THRESHOLD: 0.85,
  DRIFT_CONSECUTIVE_SCANS: 2,
  DRIFT_REMIND_COOLDOWN_DAYS: 7,
  LINKAGE_TIMEOUT_MS: 3000,
  SINGLE_FIELD_TIMEOUT_MS: 50,
  TARGET_FILL_MS_20_50: 3000,
  HARD_FILL_TIMEOUT_MS: 15000,
  FILL_BATCH_SIZE: 20,
} as const;
