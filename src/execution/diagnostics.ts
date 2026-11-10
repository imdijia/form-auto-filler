/** Per-field diagnosis for the v2 result bar. Built in memory only: it is
    never persisted, never logged and never sent anywhere. */

import type {
  ControlType, ErrorCode, FieldType, SkipReason,
  FillPlan, FillReport, FillResult, FieldHandle, PlanItem,
} from '../contracts';
import { readDomValue } from '../fill/native-setter';
import { FALLBACK_PATTERN_FAIL_REASON, resolveSemanticSource } from '../data/generators/fallback-text';

export interface FieldDiagnostic {
  readonly fieldId: string;
  readonly label: string;
  readonly fieldType: FieldType;
  readonly controlType: ControlType;
  readonly expected: string;
  readonly actualDom: string;
  readonly strategyId: string;
  readonly status: string;
  readonly code?: ErrorCode;
  readonly failureReason?: string;
  readonly skipReason?: SkipReason;
  readonly validationCleared?: boolean;
  readonly evidence: readonly string[];
  /** AC-V2-18: additive only. The four existing semantics (expected /
      actualDom / strategyId / failureReason) and the {tool,generatedAt,items}
      copy envelope are unchanged. */
  readonly fallback?: { readonly source: string; readonly semanticWord: string };
}

function strategyOf(result: FillResult | undefined): string {
  const evidence = result?.verification?.evidence ?? [];
  const adapter = evidence.find((entry) => entry.startsWith('adapter:'));
  if (adapter) return adapter.slice('adapter:'.length);
  if (result?.code === 'E_UNSUPPORTED_CONTROL') return 'generic-native';
  return 'none';
}

function reasonOf(result: FillResult | undefined, skipReason?: string): string {
  if (result?.failureReason) return result.failureReason;
  if (result?.skipReason) return '跳过：' + result.skipReason;
  if (skipReason) return '跳过：' + skipReason;
  return '已写入并通过两帧回读';
}

/** One diagnostic row. Both the whole-report builder and the AC-V2-14
    single-field refill use this, so the JSON shape can never drift between
    the initial result and a later refill. `actualDom` is read from the live
    handle, never from the report, so a refill shows the value on the page. */
export function buildSingleDiagnostic(
  item: PlanItem,
  result: FillResult | undefined,
  handle: FieldHandle | undefined,
  label: string,
): FieldDiagnostic {
  let actualDom = '';
  if (handle?.isConnected()) {
    try {
      actualDom = readDomValue(handle);
    } catch {
      actualDom = '';
    }
  }
  // Runtime-only planner annotation: the label-derived fallback could not
  // satisfy field.constraints.pattern. One field failing never blocks others.
  const fallbackFailed =
    (item as PlanItem & { fallbackFailure?: boolean }).fallbackFailure === true;
  // AC-V2-18: recompute from the live descriptor, using the SAME resolver as
  // the generator. Additive metadata; no logic is duplicated here.
  let fallback: FieldDiagnostic['fallback'];
  if (item.fieldType === 'unknown' && item.value.length > 0 && handle) {
    const resolved = resolveSemanticSource(handle.descriptor);
    fallback = { source: resolved.source, semanticWord: resolved.word };
  }
  return {
    fieldId: item.fieldId,
    label,
    fieldType: item.fieldType,
    controlType: result?.controlType ?? 'other',
    expected: item.value,
    actualDom,
    strategyId: strategyOf(result),
    status: result?.status ?? 'skipped',
    code: result?.code,
    failureReason: fallbackFailed
      ? FALLBACK_PATTERN_FAIL_REASON
      : reasonOf(result, item.skipReason),
    skipReason: result?.skipReason ?? item.skipReason,
    validationCleared: result?.verification?.validationCleared,
    evidence: [...(result?.verification?.evidence ?? [])],
    fallback,
  };
}

/** label / field type / expected value / DOM actual value / strategy id /
    failure reason - everything the collapsed diagnosis needs. */
export function buildDiagnostics(
  plan: FillPlan,
  report: FillReport,
  handles: ReadonlyMap<string, FieldHandle>,
  labels: Readonly<Record<string, string>>,
): FieldDiagnostic[] {
  const outcomes = new Map(report.outcomes.map((entry) => [entry.fieldId, entry]));
  return plan.items.map((item) => buildSingleDiagnostic(
    item,
    outcomes.get(item.fieldId),
    handles.get(item.fieldId),
    labels[item.fieldId] ?? item.fieldId,
  ));
}
