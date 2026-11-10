import { reactive } from 'vue';
import type { ControlType, ErrorCode, FieldType, FillReport, SkipReason } from '../contracts';
import type { FieldDiagnostic } from '../execution/diagnostics';

export type RowGroup = 'fill' | 'unknown' | 'unsupported' | 'excluded';
export type RowStatus = 'pending' | 'filled' | 'skipped' | 'failed';

export interface FieldRow {
  fieldId: string;
  label: string;
  controlType: ControlType;
  fieldType: FieldType;
  value: string;
  confidence: number;
  selected: boolean;
  skipReason?: SkipReason;
  readablePath: string;
  group: RowGroup;
  status: RowStatus;
  code?: ErrorCode;
  failureReason?: string;
}

export interface UiState {
  /** v2: always true. The allowlist is an optional, non-blocking setting. */
  allowed: boolean;
  denyReason: string;
  loading: boolean;
  error: string;
  planOpen: boolean;
  fabCollapsed: boolean;
  fabHint: string;
  rows: FieldRow[];
  driftWarning: string;
  limitWarning: string;
  scopeLabel: string;
  seed: number;
  filling: boolean;
  progressDone: number;
  progressTotal: number;
  report: FillReport | null;
  undoAvailable: boolean;
  undoReason: string;
  pickerActive: boolean;
  bindCount: number;
  shortcutWarning: string;
  /** Compact result bar (v2 F). */
  resultVisible: boolean;
  diagnosticsOpen: boolean;
  diagnostics: FieldDiagnostic[];
  copyNotice: string;
  /** AC-V2-14: a single-field refill is in flight (separate from a whole
      form fill, so it never shows the "N / M" progress text). */
  refilling: boolean;
  refillNotice: string;
}

export interface UiActions {
  /** v2: one trigger performs the whole fill. Kept the legacy name so the
      four manifest commands and the floating ball stay wired. */
  openPlan(): void;
  closePlan(): void;
  refresh(): void;
  toggleRow(fieldId: string): void;
  selectAll(): void;
  invertSelection(): void;
  onlyPending(): void;
  changeType(fieldId: string, fieldType: string): void;
  includeExcluded(fieldId: string): void;
  cycleScope(): void;
  /** v2: idempotent one-shot fill; no selection or confirmation step. */
  confirm(): void;
  undo(): void;
  /** v2: region picker (optional advanced entry). */
  openPicker(): void;
  closePicker(): void;
  fillRegion(root: Element): void;
  toggleDiagnostics(): void;
  closeResult(): void;
  copyDiagnostics(): void;
  /** AC-V2-14: refill ONE skipped field with a manually chosen type. Must
      not re-run detection / planning / the whole form, and must not persist
      a binding rule or touch any other field. */
  refillField(fieldId: string, fieldType: string): void;
  bindControl(label: string, fieldType: string): void;
  undoLastBind(): void;
  locate(fieldId: string): void;
  openOptions(): void;
}

export function createUiState(): UiState {
  return reactive<UiState>({
    allowed: true,
    denyReason: '',
    loading: false,
    error: '',
    planOpen: false,
    fabCollapsed: false,
    fabHint: '',
    rows: [],
    driftWarning: '',
    limitWarning: '',
    scopeLabel: '自动选定区域',
    seed: 4821,
    filling: false,
    progressDone: 0,
    progressTotal: 0,
    report: null,
    undoAvailable: false,
    undoReason: '填充后可撤销',
    pickerActive: false,
    bindCount: 0,
    shortcutWarning: '',
    resultVisible: false,
    diagnosticsOpen: false,
    diagnostics: [],
    copyNotice: '',
    refilling: false,
    refillNotice: '',
  }) as UiState;
}

export function groupOf(field: {
  inferredType: FieldType;
  skipReason?: SkipReason;
}): RowGroup {
  if (field.skipReason === 'unsupported-control') return 'unsupported';
  if (field.inferredType === 'unknown' && field.skipReason === 'low-confidence') return 'unknown';
  if (field.skipReason && field.skipReason !== 'low-confidence') return 'excluded';
  if (field.inferredType === 'unknown') return 'unknown';
  return 'fill';
}
