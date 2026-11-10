import type { FillReport } from '../contracts';
import { writeLastResult } from '../config/session-store';
import { buildDiagnostics } from '../execution/diagnostics';
import { autoSelectRoot } from '../detection/scope-selector';
import { runtimeEvent } from '../infra/messages';
import { broadcastRuntimeEvent } from '../infra/runtime';
import type { RuntimeParts } from './assembly';
import type { PlanSession } from './plan-session';

/**
 * v2 one-shot fill (SPEC-v2 B):
 *   auto/selected container -> scan every visible control -> generate ->
 *   fill immediately -> compact result bar.
 * No allowlist, no plan preview, no per-row selection, no confirmation.
 */
export async function runAutoFill(
  parts: RuntimeParts,
  session: PlanSession,
  root?: ParentNode,
): Promise<void> {
  const state = parts.state;
  if (state.filling || state.refilling) return;
  const chosen = root ?? autoSelectRoot(document);
  parts.setContainerRoot(chosen);

  state.error = '';
  state.filling = true;
  state.resultVisible = true;
  state.diagnosticsOpen = false;
  state.diagnostics = [];
  state.copyNotice = '';
  state.refillNotice = '';
  state.progressDone = 0;

  try {
    await session.refresh();
    const plan = session.plan;
    if (!plan) throw new Error('FAF: plan unavailable');

    // v2: every control with a generated value is filled. No user checkboxes.
    // v2.1: an unknown field with a label-derived value is a real fill, so the
    // low-confidence tag must not leak into the diagnosis as a skip reason.
    for (const item of plan.items) {
      if (item.value.length > 0) {
        item.selected = true;
        if (item.skipReason === 'user-unchecked' || item.skipReason === 'low-confidence') {
          item.skipReason = undefined;
        }
      }
    }
    state.progressTotal = plan.items.length;

    const report: FillReport = await parts.executor.execute(
      plan, session.handles, parts.filler, parts.data.ctx,
    );
    session.applyReport(report);
    await writeLastResult(parts.storage, report, session.labels());

    state.diagnostics = buildDiagnostics(
      plan, report, session.handles, session.labels(),
    );
    const undoState = parts.undo.state(parts.data.ctx.sessionId);
    state.undoAvailable = undoState.valid && undoState.items.length > 0;
    state.undoReason = state.undoAvailable
      ? '本次会话内可撤销'
      : (undoState.invalidReason ? '页面已变化，无法撤销' : '暂无可撤销内容');
    state.fabHint = '已填充 ' + report.filled + ' 项，未提交';

    // The executor emits RESULT_READY before storage is written; emit once
    // more afterwards so a popup refreshing in the same tick sees the new
    // report instead of the previous session's result.
    void broadcastRuntimeEvent(
      runtimeEvent('RESULT_READY', parts.data.ctx.sessionId),
    );
  } catch {
    state.error = '填充失败，点击悬浮球重试';
    state.fabHint = '本次未执行填充';
    parts.counter.increment('error_occurred');
  } finally {
    state.filling = false;
  }
}
