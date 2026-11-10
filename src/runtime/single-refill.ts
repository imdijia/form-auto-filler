/**
 * AC-V2-14: refill exactly ONE skipped field from the diagnostics panel.
 *
 * Hard boundaries:
 *   - no re-detection, no refresh(), no planner.plan(), no whole-form run;
 *   - no savePageOverride() (a manual type here is a one-off, not a binding);
 *   - exactly one generated value and one write through the shared Filler,
 *     which already runs the native assignment sequence + two-frame readback;
 *   - no other field, no other plan item and no undo snapshot is modified;
 *   - nothing is persisted, logged or sent.
 */
import type { FieldType, PlanItem, SkipReason } from '../contracts';
import { buildReport, isOutOfScope, isVerifiedSuccess } from '../execution/fill-report';
import { buildSingleDiagnostic } from '../execution/diagnostics';
import type { RuntimeParts } from './assembly';
import type { PlanSession } from './plan-session';

/** Protected controls must never be written, even on an explicit request
    (PRD AC-6 / AC-V2-03). They stay listed in the diagnosis with a reason. */
const PROTECTED = new Set<SkipReason>([
  'readonly', 'disabled', 'hidden', 'file', 'captcha',
]);

export async function refillSingleField(
  parts: RuntimeParts,
  session: PlanSession,
  fieldId: string,
  fieldType: string,
): Promise<void> {
  const state = parts.state;
  if (state.filling || state.refilling) return;
  if (!fieldType || fieldType === 'unknown') {
    state.refillNotice = '请先为该字段指定类型';
    return;
  }

  const handle = session.handles.get(fieldId);
  const field = session.fields.find((entry) => entry.id === fieldId);
  if (!handle || !field || !handle.isConnected()) {
    state.refillNotice = '控件已脱离页面，无法补填';
    return;
  }
  if (field.skipReason && PROTECTED.has(field.skipReason)) {
    state.refillNotice = '只读、隐藏、文件与验证码类控件不能补填';
    return;
  }

  state.refilling = true;
  state.refillNotice = '';
  try {
    // infer() returns handle.descriptor by reference, so mutating this field
    // also updates the descriptor the Filler reads. In-memory only: the next
    // full fill rebuilds every descriptor from scratch via session.refresh().
    field.inferredType = fieldType as Exclude<FieldType, 'unknown'>;
    field.confidence = 1;
    field.source = 'RULE';
    if (field.skipReason === 'low-confidence') delete field.skipReason;

    const value = await parts.data.provider.getValue(field, parts.data.ctx);
    if (value.length === 0) {
      state.refillNotice = '该类型当前没有可用取值，请先在生成器设置中启用';
      return;
    }

    // ONE write. No executor.execute(): that would walk every plan item and
    // rescan for linkage, i.e. a forbidden whole-form refill.
    const result = await parts.filler.fill(handle, value, parts.data.ctx);
    const label = session.labels()[fieldId] ?? fieldId;
    const item: PlanItem = {
      fieldId,
      fieldType: field.inferredType,
      value,
      selected: true,
      batch: 0,
      dependsOn: [],
    };
    const diagnostic = buildSingleDiagnostic(item, result, handle, label);
    state.diagnostics = state.diagnostics.map((entry) =>
      entry.fieldId === fieldId ? diagnostic : entry,
    );

    // Recount from the FULL outcome list instead of hand-editing +/-1:
    // low-confidence / out-of-scope are separate groups, so a manual
    // increment would silently disagree with buildReport().
    const previous = state.report;
    if (previous) {
      const outcomes = previous.outcomes.map((entry) =>
        entry.fieldId === fieldId ? result : entry,
      );
      state.report = buildReport(previous.sessionId, outcomes, performance.now());
    }

    const row = state.rows.find((entry) => entry.fieldId === fieldId);
    if (row) {
      row.fieldType = field.inferredType;
      row.value = value;
      row.selected = true;
      row.group = 'fill';
      row.status = isVerifiedSuccess(result)
        ? 'filled'
        : (result.status === 'skipped' || isOutOfScope(result) ? 'skipped' : 'failed');
      row.code = result.code;
      row.failureReason = result.failureReason;
      row.skipReason = result.skipReason;
    }

    state.refillNotice = isVerifiedSuccess(result)
      ? '已单独补填「' + label + '」，其余控件未改动'
      : '补填未通过回读，请查看该字段诊断';
  } catch {
    state.refillNotice = '补填失败，请重试或重新选择区域';
  } finally {
    state.refilling = false;
  }
}
