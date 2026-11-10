<script setup lang="ts">
import { computed, reactive } from 'vue';
import {
  CheckCircle2, RotateCcw, MousePointer2, ClipboardCopy, ChevronDown, X, Zap,
} from '@lucide/vue';
import type { UiActions, UiState } from '../../runtime/ui-state';
import type { FieldDiagnostic } from '../../execution/diagnostics';
import { BINDABLE_TYPES, controlLabel, errorLabel, fieldLabel, skipLabel } from '../control-labels';

const props = defineProps<{ state: UiState; actions: UiActions }>();

const filled = computed(() => props.state.report?.filled ?? 0);
const skipped = computed(() => props.state.report?.skipped ?? 0);
const failed = computed(() => props.state.report?.failed ?? 0);
const progress = computed(() =>
  props.state.filling
    ? '正在填充 ' + props.state.progressDone + ' / ' + props.state.progressTotal
    : '',
);
const hasReport = computed(() => props.state.report !== null);
/** AC-V2-12 / DEF-01: empty state means the run wrote nothing and nothing
    failed. `report.total` counts skipped controls too (a read-only dialog
    still yields plan items with skipReason), so total===0 is unreachable
    here; use the two observable counters instead. */
const noFillableControls = computed(() =>
  props.state.report !== null && filled.value === 0 && failed.value === 0,
);

function statusText(status: string): string {
  if (status === 'filled') return '成功';
  if (status === 'skipped') return '跳过';
  if (status === 'failed') return '失败';
  return '待填';
}

function toneOf(status: string): string {
  if (status === 'filled') return 'f-status--success';
  if (status === 'skipped') return 'f-status--muted';
  if (status === 'failed') return 'f-status--danger';
  return 'f-status--pending';
}

/** AC-V2-14: a per-row, in-memory type choice. It is NOT a saved binding;
    nothing leaves this component except the fieldId + chosen type. */
const manualTypes = reactive<Record<string, string>>({});

function manualTypeOf(item: FieldDiagnostic): string {
  return manualTypes[item.fieldId] ?? '';
}

function onManualTypeChange(item: FieldDiagnostic, event: Event): void {
  manualTypes[item.fieldId] = (event.target as HTMLSelectElement).value;
}

function onRefill(item: FieldDiagnostic): void {
  props.actions.refillField(item.fieldId, manualTypeOf(item));
}
</script>

<template>
  <section class="f-result-bar" aria-label="填充结果">
    <div class="f-result-bar__main">
      <span class="f-result-bar__icon"><Zap :size="18" :stroke-width="1.75" aria-hidden="true" /></span>
      <div class="f-result-bar__summary">
        <div v-if="progress" class="f-result-bar__progress">{{ progress }}</div>
        <div v-if="state.error" class="f-result-bar__error">{{ state.error }}</div>
        <div v-if="hasReport" class="f-result-bar__counts">
          <span class="f-result-bar__count f-result-bar__count--ok">成功 <strong>{{ filled }}</strong></span>
          <span class="f-result-bar__count">跳过 <strong>{{ skipped }}</strong></span>
          <span class="f-result-bar__count f-result-bar__count--bad">失败 <strong>{{ failed }}</strong></span>
          <span class="f-meta">仅填入，不提交</span>
        </div>
        <div v-else-if="!progress && !state.error" class="f-meta">正在自动选定区域并识别可见控件</div>
      </div>
      <button class="f-result-bar__close" aria-label="关闭结果条" @click="actions.closeResult()">
        <X :size="16" :stroke-width="1.75" aria-hidden="true" />
      </button>
    </div>

    <div class="f-result-bar__actions">
      <button
        class="f-btn f-btn--text" :disabled="!state.undoAvailable || state.filling"
        @click="actions.undo()"
      >
        <RotateCcw :size="14" :stroke-width="1.75" aria-hidden="true" /> 撤销
      </button>
      <button class="f-btn f-btn--text" :disabled="state.filling" @click="actions.openPicker()">
        <MousePointer2 :size="14" :stroke-width="1.75" aria-hidden="true" /> 重新选择区域
      </button>
      <button
        class="f-btn f-btn--text" :disabled="state.filling || state.diagnostics.length === 0"
        @click="actions.toggleDiagnostics()"
      >
        <ChevronDown :size="14" :stroke-width="1.75" aria-hidden="true" />
        {{ state.diagnosticsOpen ? '收起诊断' : '逐字段诊断' }}
        <span class="f-meta">{{ state.diagnostics.length }}</span>
      </button>
      <button
        class="f-btn f-btn--text" :disabled="state.filling || state.diagnostics.length === 0"
        @click="actions.copyDiagnostics()"
      >
        <ClipboardCopy :size="14" :stroke-width="1.75" aria-hidden="true" /> 复制诊断 JSON
      </button>
      <button class="f-btn f-btn--primary f-btn--compact" :disabled="state.filling" @click="actions.openPlan()">
        <CheckCircle2 :size="14" :stroke-width="1.75" aria-hidden="true" /> 再填一次
      </button>
    </div>
    <div v-if="hasReport" class="f-result-bar__note">
      未识别字段已按标签生成测试数据，可在逐字段诊断中指定类型单独补填
    </div>
    <div v-if="noFillableControls" class="f-result-bar__note">
      当前区域没有可填的可见控件，可重新选择区域
    </div>
    <div v-if="state.refillNotice" class="f-result-bar__notice">{{ state.refillNotice }}</div>
    <div v-else-if="state.copyNotice" class="f-result-bar__notice">{{ state.copyNotice }}</div>
    <div v-else-if="state.undoReason" class="f-result-bar__note">{{ state.undoReason }}</div>

    <div v-if="state.diagnosticsOpen" class="f-diagnostics">
      <div class="f-diagnostics__head">
        <span>逐字段诊断 · 只在本机内存，复制后仅进剪贴板</span>
        <span class="f-meta">校验态仅作提示，不决定成败</span>
      </div>
      <div v-if="state.diagnostics.length === 0" class="f-meta">本次没有可展示的控件诊断</div>
      <div
        v-for="item in state.diagnostics" :key="item.fieldId" class="f-diag-row"
        :data-field-id="item.fieldId" :data-status="item.status"
      >
        <div class="f-diag-row__head">
          <span class="f-diag-label" :title="item.label">{{ item.label }}</span>
          <span :class="['f-status', toneOf(item.status)]">{{ statusText(item.status) }}</span>
          <span class="f-meta">{{ fieldLabel(item.fieldType) }} / {{ controlLabel(item.controlType) }}</span>
        </div>
        <div class="f-diag-grid">
          <span>期望值</span><span class="f-mono">{{ item.expected || '--' }}</span>
          <span>DOM 实际值</span><span class="f-mono">{{ item.actualDom || '--' }}</span>
          <span>策略 id</span><span class="f-mono">{{ item.strategyId }}</span>
          <span>原因</span><span>{{ item.failureReason }}</span>
        </div>
        <div v-if="item.code || item.skipReason" class="f-diag-row__tags">
          <span v-if="item.code" class="f-code">{{ item.code }} · {{ errorLabel(item.code) }}</span>
          <span v-if="item.skipReason" class="f-meta">{{ skipLabel(item.skipReason) }}</span>
          <span v-if="item.validationCleared === false" class="f-meta">页面仍有校验提示（仅提示）</span>
        </div>
        <div v-if="item.fallback" class="f-diag-row__tags">
          <span class="f-meta f-mono f-diag-row__locator" :title="item.fieldId">{{ item.fieldId }}</span>
          <span class="f-diag-row__fallback" data-faf="fallback">按标签生成 · 来源 {{ item.fallback.source }} · 语义词 {{ item.fallback.semanticWord }} · 填入 {{ item.expected }}</span>
        </div>
        <div v-if="item.status === 'skipped'" class="f-diag-row__refill">
          <span class="f-meta f-mono f-diag-row__locator" :title="item.fieldId">{{ item.fieldId }}</span>
          <select
            class="f-select" data-faf="manual-type" :value="manualTypeOf(item)"
            :aria-label="'指定 ' + item.label + ' 的字段类型'"
            @change="onManualTypeChange(item, $event)"
          >
            <option value="">选择字段类型</option>
            <option v-for="type in BINDABLE_TYPES" :key="type.key" :value="type.key">
              {{ fieldLabel(type.key) }}
            </option>
          </select>
          <button
            class="f-btn f-btn--compact" :disabled="state.filling || state.refilling"
            @click="onRefill(item)"
          >补填此字段</button>
        </div>
      </div>
    </div>
  </section>
</template>
