import { LIMITS } from '../contracts';
import type {
  FieldDescriptor, FieldHandle, FillPlan, FillReport, FieldType, SkipReason,
} from '../contracts';
import { createFillPlanner } from '../execution/fill-planner';
import { isOutOfScope, isVerifiedSuccess } from '../execution/fill-report';
import { buildTypeOverride } from '../detection/picker';
import { resolveDrift } from './plan-drift';
import { writeLastPlan } from '../config/session-store';
import type { ScopeMode } from '../config/session-store';
import { groupOf, type FieldRow, type UiState } from './ui-state';
import type { RuntimeParts } from './assembly';

/** Excluded rows the user may opt into. Protected controls stay excluded:
    forcing them would be a mis-fill (PRD AC-6, ARCH 17.4). */
const INCLUDABLE = new Set<SkipReason>([
  'has-value', 'outside-form', 'search-or-filter', 'user-unchecked',
  'rule-excluded', 'field-limit-exceeded',
]);

interface BindEntry {
  readonly label: string;
  readonly locatorValue: string;
}

function labelOf(field: FieldDescriptor): string {
  return field.textFeatures.label ||
    field.textFeatures.placeholder ||
    field.textFeatures.name ||
    field.textFeatures.elementId ||
    '未命名控件';
}

function toRow(field: FieldDescriptor, plan: FillPlan | null): FieldRow {
  const item = plan?.items.find((entry) => entry.fieldId === field.id);
  return {
    fieldId: field.id,
    label: labelOf(field),
    controlType: field.controlType,
    fieldType: field.inferredType,
    value: item?.value ?? '',
    confidence: field.confidence,
    selected: item?.selected ?? false,
    skipReason: item?.skipReason ?? field.skipReason,
    readablePath: field.container.readablePath,
    group: groupOf(field),
    status: 'pending',
  };
}

export interface PlanSession {
  readonly plan: FillPlan | null;
  readonly handles: Map<string, FieldHandle>;
  readonly fields: readonly FieldDescriptor[];
  readonly state: UiState;
  refresh(): Promise<void>;
  setScope(mode: ScopeMode, rowOnly: boolean): Promise<void>;
  cycleScope(): Promise<void>;
  setSeed(seed: number): Promise<void>;
  toggleRow(fieldId: string): void;
  selectAll(): void;
  invertSelection(): void;
  onlyPending(): void;
  includeExcluded(fieldId: string): Promise<void>;
  changeType(fieldId: string, fieldType: string): Promise<void>;
  bindControl(label: string, fieldType: string): Promise<void>;
  undoLastBind(): Promise<void>;
  applyReport(report: FillReport): void;
  labels(): Record<string, string>;
  locate(fieldId: string): void;
}

export function createPlanSession(parts: RuntimeParts): PlanSession {
  const state = parts.state;
  let currentPlan: FillPlan | null = null;
  let currentHandles = new Map<string, FieldHandle>();
  let currentFields: FieldDescriptor[] = [];
  let driftConsecutive = 0;
  let driftReminded = false;
  const bindHistory: BindEntry[] = [];

  async function detectAndPlan(): Promise<void> {
    const fields = parts.detector.detect(parts.detectionContext());
    const handles = parts.detector.lastScan?.handles ?? [];
    currentHandles = new Map(handles.map((handle) => [handle.descriptor.id, handle]));
    currentFields = fields;

    const driftOutcome = await resolveDrift(
      parts, fields.map(labelOf), driftConsecutive, driftReminded,
    );
    driftConsecutive = driftOutcome.consecutive;
    driftReminded = driftOutcome.reminded;
    state.driftWarning = driftOutcome.drift ? '结构已变化，建议重校验' : '';

    const planner = createFillPlanner({
      structureHash: driftOutcome.structureHash,
      driftDetected: driftOutcome.drift,
    });
    const plan = await planner.plan(fields, parts.rules, parts.data.ctx, parts.data.provider);
    currentPlan = plan;
    await writeLastPlan(parts.storage, plan);

    const previous = new Map(state.rows.map((row) => [row.fieldId, row.selected]));
    state.rows = fields.map((field) => {
      const row = toRow(field, plan);
      const wasSelected = previous.get(row.fieldId);
      if (wasSelected !== undefined && row.group === 'fill') row.selected = wasSelected;
      return row;
    });
    for (const field of fields) {
      parts.counter.increment(field.inferredType === 'unknown' ? 'field_unknown' : 'field_inferred');
    }
    state.limitWarning = parts.detector.lastScan?.truncated
      ? '控件数超过 ' + LIMITS.MAX_FIELDS_PER_PAGE + ' 项，已截断，请缩小作用域'
      : '';
  }

  async function refresh(): Promise<void> {
    if (!state.allowed) {
      state.rows = [];
      return;
    }
    state.loading = true;
    state.error = '';
    try {
      await detectAndPlan();
    } catch {
      state.error = '识别失败，点击重试';
      parts.counter.increment('error_occurred');
    } finally {
      state.loading = false;
    }
  }

  function rowOf(fieldId: string): FieldRow | undefined {
    return state.rows.find((row) => row.fieldId === fieldId);
  }

  async function saveOverride(field: FieldDescriptor, key: string): Promise<void> {
    if (key === 'unknown' || !key) return;
    const override = buildTypeOverride(field, key as Exclude<FieldType, 'unknown'>);
    await parts.ruleStore.savePageOverride(parts.page.pageKey, override);
  }

  return {
    get plan(): FillPlan | null { return currentPlan; },
    get handles(): Map<string, FieldHandle> { return currentHandles; },
    get fields(): readonly FieldDescriptor[] { return currentFields; },
    state,
    refresh,

    async setScope(mode: ScopeMode, rowOnly: boolean): Promise<void> {
      await parts.setScope(mode, rowOnly);
      await refresh();
    },

    async cycleScope(): Promise<void> {
      const order: ScopeMode[] = ['dialog', 'form', 'document'];
      const current = order.indexOf(
        state.scopeLabel === '整页' ? 'document' : state.scopeLabel === '当前表单' ? 'form' : 'dialog',
      );
      await this.setScope(order[(current + 1) % order.length] ?? 'dialog', false);
    },

    async setSeed(seed: number): Promise<void> {
      await parts.setSeed(seed);
      await refresh();
    },

    toggleRow(fieldId: string): void {
      const row = rowOf(fieldId);
      if (row && row.group === 'fill') row.selected = !row.selected;
    },

    selectAll(): void {
      for (const row of state.rows) {
        if (row.group === 'fill') row.selected = true;
      }
    },

    invertSelection(): void {
      for (const row of state.rows) {
        if (row.group === 'fill') row.selected = !row.selected;
      }
    },

    onlyPending(): void {
      for (const row of state.rows) {
        if (row.group === 'fill') row.selected = row.status === 'pending';
      }
    },

    async includeExcluded(fieldId: string): Promise<void> {
      const row = rowOf(fieldId);
      const field = currentFields.find((entry) => entry.id === fieldId);
      if (!row || !field) return;
      if (field.skipReason && !INCLUDABLE.has(field.skipReason)) {
        state.limitWarning = '只读、隐藏、文件与验证码类控件不能纳入填充';
        return;
      }
      delete field.skipReason;
      row.skipReason = undefined;
      row.group = 'fill';
      row.selected = true;
      const item = currentPlan?.items.find((entry) => entry.fieldId === fieldId);
      if (item) {
        const value = await parts.data.provider.getValue(field, parts.data.ctx);
        item.value = value;
        row.value = value;
        if (value.length === 0) {
          // A disabled generator or an enum with no page options must never
          // be written as an empty string after the user opts in.
          item.selected = false;
          item.skipReason = 'rule-excluded';
          row.selected = false;
          row.skipReason = 'rule-excluded';
          row.group = 'excluded';
          state.limitWarning = '没有可用取值，请先在「生成器」页启用该类型';
          return;
        }
        item.selected = true;
        item.skipReason = undefined;
      }
    },

    async changeType(fieldId: string, fieldType: string): Promise<void> {
      const field = currentFields.find((entry) => entry.id === fieldId);
      if (!field || !fieldType || fieldType === 'unknown') return;
      await saveOverride(field, fieldType);
      await refresh();
    },

    async bindControl(label: string, fieldType: string): Promise<void> {
      const field = currentFields.find((entry) => labelOf(entry) === label);
      if (!field || !fieldType || fieldType === 'unknown') return;
      await saveOverride(field, fieldType);
      bindHistory.push({ label, locatorValue: field.locator.value });
      state.bindCount = bindHistory.length;
      parts.counter.increment('picker_rebind');
      await refresh();
    },

    async undoLastBind(): Promise<void> {
      const entry = bindHistory.pop();
      if (!entry) return;
      await parts.ruleStore.removePageOverride(parts.page.pageKey, entry.locatorValue);
      state.bindCount = bindHistory.length;
      await refresh();
    },

    applyReport(report: FillReport): void {
      for (const row of state.rows) {
        const outcome = report.outcomes.find((entry) => entry.fieldId === row.fieldId);
        if (!outcome) continue;
        if (isVerifiedSuccess(outcome)) row.status = 'filled';
        else if (outcome.status === 'skipped' || isOutOfScope(outcome)) row.status = 'skipped';
        else row.status = 'failed';
        row.code = outcome.code;
        row.failureReason = outcome.failureReason;
        row.skipReason = outcome.skipReason ?? row.skipReason;
      }
      state.report = report;
    },

    labels(): Record<string, string> {
      return Object.fromEntries(currentFields.map((field) => [field.id, labelOf(field)]));
    },

    locate(fieldId: string): void {
      const handle = currentHandles.get(fieldId);
      if (!handle || !handle.isConnected()) return;
      const element = handle.element;
      element.scrollIntoView({ block: 'center' });
      const previous = element.style.outline;
      element.style.outline = '2px solid currentColor';
      window.setTimeout(() => {
        if (element.isConnected) element.style.outline = previous;
      }, 2000);
    },
  };
}
