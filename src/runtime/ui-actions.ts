import { buildReport, isOutOfScope } from '../execution/fill-report';
import { control, runtimeEvent } from '../infra/messages';
import { broadcastRuntimeEvent, sendControlToBackground } from '../infra/runtime';
import { copyDiagnosticsJson } from './diagnostics-copy';
import { runAutoFill } from './auto-fill';
import { refillSingleField } from './single-refill';
import type { UiActions } from './ui-state';
import type { RuntimeParts } from './assembly';
import type { PlanSession } from './plan-session';

/** Implements the injected UI contract. v2: a single trigger scans the
    auto-selected container and fills every visible control immediately.
    Nothing here asks for a preview, a checkbox or a confirmation; no submit
    button is ever clicked. */
export function createUiActions(parts: RuntimeParts, session: PlanSession): UiActions {
  const state = parts.state;
  let firstCoreAction = true;

  function trigger(root?: ParentNode): void {
    if (state.filling || state.refilling) return;
    parts.counter.increment('fill_triggered');
    if (firstCoreAction) {
      firstCoreAction = false;
      parts.counter.increment('first_core_action');
    }
    void runAutoFill(parts, session, root);
  }

  async function undo(): Promise<void> {
    const sessionId = parts.data.ctx.sessionId;
    const undoState = parts.undo.state(sessionId);
    if (!undoState.valid || undoState.items.length === 0) {
      state.undoAvailable = false;
      state.undoReason = '页面已变化，无法撤销';
      return;
    }
    const startedAt = performance.now();
    const results = await parts.undo.restore(sessionId, session.handles);
    const report = buildReport(sessionId, results, startedAt);
    const failures = results.filter((result) => !result.verified && !isOutOfScope(result));
    for (const row of state.rows) {
      if (row.status === 'filled') {
        row.status = 'pending';
        row.code = undefined;
        row.failureReason = undefined;
      }
    }
    state.undoAvailable = false;
    state.undoReason = failures.length > 0
      ? '有 ' + failures.length + ' 项未能恢复，请检查页面'
      : '已恢复本次填充前的值';
    state.fabHint = '已撤销本次填充，未提交';
    state.report = report;
    state.resultVisible = true;
    state.diagnostics = [];
    state.diagnosticsOpen = false;
    state.copyNotice = '';
    state.refillNotice = '';
    void broadcastRuntimeEvent(runtimeEvent('UNDO', sessionId));
  }

  return {
    openPlan(): void { trigger(); },
    closePlan(): void { state.planOpen = false; },
    refresh(): void { trigger(); },
    toggleRow(fieldId: string): void { session.toggleRow(fieldId); },
    selectAll(): void { session.selectAll(); },
    invertSelection(): void { session.invertSelection(); },
    onlyPending(): void { session.onlyPending(); },
    changeType(fieldId: string, fieldType: string): void {
      void session.changeType(fieldId, fieldType);
    },
    includeExcluded(fieldId: string): void { void session.includeExcluded(fieldId); },
    cycleScope(): void { void session.cycleScope(); },
    confirm(): void { trigger(); },
    undo(): void { void undo(); },
    openPicker(): void { state.pickerActive = true; },
    closePicker(): void { state.pickerActive = false; },
    fillRegion(root: Element): void {
      state.pickerActive = false;
      trigger(root);
    },
    toggleDiagnostics(): void { state.diagnosticsOpen = !state.diagnosticsOpen; },
    closeResult(): void {
      state.resultVisible = false;
      state.diagnosticsOpen = false;
      state.copyNotice = '';
      state.refillNotice = '';
    },
    copyDiagnostics(): void {
      void copyDiagnosticsJson(state.diagnostics).then((ok) => {
        state.copyNotice = ok
          ? '诊断 JSON 已复制到剪贴板'
          : '复制失败，请手动选择文本';
      });
    },
    refillField(fieldId: string, fieldType: string): void {
      void refillSingleField(parts, session, fieldId, fieldType);
    },
    bindControl(label: string, fieldType: string): void {
      void session.bindControl(label, fieldType);
    },
    undoLastBind(): void { void session.undoLastBind(); },
    locate(fieldId: string): void { session.locate(fieldId); },
    openOptions(): void { void sendControlToBackground(control('open-options')); },
  };
}
