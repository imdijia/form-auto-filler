<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue';
import { LIMITS } from '../../contracts';
import type { FieldRow, UiActions, UiState } from '../../runtime/ui-state';
import { BINDABLE_TYPES, controlLabel, formatConfidence, skipLabel } from '../control-labels';
import FStatus from './FStatus.vue';

const props = defineProps<{ state: UiState; actions: UiActions }>();

const filter = ref('');
const excludedOpen = ref(false);
const unsupportedOpen = ref(false);
const unknownOpen = ref(true);
const scrollTop = ref(0);
const ROW_HEIGHT = 60;

const matches = (row: FieldRow): boolean => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return true;
  return [row.label, controlLabel(row.controlType), row.fieldType, row.value, row.readablePath]
    .join(' ')
    .toLowerCase()
    .includes(needle);
};

const fillRows = computed(() =>
  props.state.rows.filter((row) => row.group === 'fill' && matches(row)),
);
const unknownRows = computed(() =>
  props.state.rows.filter((row) => row.group === 'unknown' && matches(row)),
);
const unsupportedRows = computed(() =>
  props.state.rows.filter((row) => row.group === 'unsupported' && matches(row)),
);
const excludedRows = computed(() =>
  props.state.rows.filter((row) => row.group === 'excluded' && matches(row)),
);
const selectedCount = computed(() =>
  props.state.rows.filter((row) => row.group === 'fill' && row.selected).length,
);
const virtual = computed(() => fillRows.value.length >= LIMITS.VIRTUAL_SCROLL_THRESHOLD);
const startIndex = computed(() =>
  virtual.value ? Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - 5) : 0,
);
const endIndex = computed(() =>
  virtual.value ? Math.min(fillRows.value.length, startIndex.value + 25) : fillRows.value.length,
);
const visibleFillRows = computed(() => fillRows.value.slice(startIndex.value, endIndex.value));
const padTop = computed<CSSProperties>(() => ({
  height: (virtual.value ? startIndex.value * ROW_HEIGHT : 0) + 'px',
}));
const padBottom = computed<CSSProperties>(() => ({
  height: (virtual.value ? Math.max(0, fillRows.value.length - endIndex.value) * ROW_HEIGHT : 0) + 'px',
}));
const total = computed(() => props.state.rows.length);

function onScroll(event: Event): void {
  scrollTop.value = (event.target as HTMLElement).scrollTop;
}

function onTypeChange(row: FieldRow, event: Event): void {
  props.actions.changeType(row.fieldId, (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <div class="f-panel">
    <div class="f-panel__head">
      <span class="f-panel__title">填充计划 · 当前页</span>
      <div class="f-panel__actions">
        <button class="f-btn f-btn--text" @click="actions.refresh()">重新识别</button>
        <button class="f-btn f-btn--text" @click="actions.closePlan()">关闭</button>
      </div>
    </div>

    <div class="f-panel__body" @scroll="onScroll">
      <div v-if="!state.allowed" class="f-empty">
        <div>{{ state.denyReason }}</div>
        <div class="f-empty__actions">
          <button class="f-link" @click="actions.openOptions()">查看白名单设置</button>
        </div>
      </div>

      <div v-else-if="state.loading" class="f-empty">
        <div class="f-skeleton"></div><div class="f-skeleton"></div><div class="f-skeleton"></div>
        <div>正在识别控件</div>
      </div>

      <div v-else-if="state.error" class="f-empty">
        <div>{{ state.error }}</div>
        <div class="f-empty__actions">
          <button class="f-link" @click="actions.refresh()">识别失败，点击重试</button>
        </div>
      </div>

      <template v-else>
        <div class="f-scope">
          <span class="f-scope__label">作用域：{{ state.scopeLabel }}</span>
          <button class="f-link" @click="actions.cycleScope()">切换作用域</button>
          <span class="f-meta">默认最窄档，避免误填搜索框与筛选框</span>
        </div>
        <div v-if="state.driftWarning" class="f-notice">
          {{ state.driftWarning }}
          <button class="f-link" @click="actions.refresh()">重新校验</button>
        </div>
        <div v-if="state.limitWarning" class="f-notice f-notice--danger">{{ state.limitWarning }}</div>

        <div class="f-summary">
          <span>共 <strong>{{ total }}</strong> 项</span>
          <span>待填 <strong>{{ selectedCount }}</strong></span>
          <span>按标签生成 <strong>{{ unknownRows.length }}</strong></span>
          <span>已排除 <strong>{{ excludedRows.length }}</strong></span>
          <span>超范围 <strong>{{ unsupportedRows.length }}</strong></span>
        </div>
        <div v-if="state.report" class="f-summary">
          <span>成功 <strong>{{ state.report.filled }}</strong></span>
          <span>跳过 <strong>{{ state.report.skipped }}</strong></span>
          <span>失败 <strong>{{ state.report.failed }}</strong></span>
          <span class="f-meta">仅填入，不提交</span>
        </div>
        <div v-if="state.filling" class="f-meta">正在填充 {{ state.progressDone }} / {{ state.progressTotal }}</div>

        <div class="f-toolbar">
          <button class="f-btn" @click="actions.selectAll()">全选</button>
          <button class="f-btn" @click="actions.invertSelection()">反选</button>
          <button class="f-btn" @click="actions.onlyPending()">仅看待填</button>
        </div>
        <input v-model="filter" class="f-filter" placeholder="搜索控件标签 / 控件类型 / 字段类型" aria-label="筛选计划行" />

        <div v-if="total === 0" class="f-empty">
          <div>当前作用域没有识别到可填控件。可切换作用域，或用可视化拾取器手动绑定。</div>
          <div class="f-empty__actions">
            <button class="f-link" @click="actions.cycleScope()">切换作用域</button>
            <button class="f-link" @click="actions.openPicker()">打开拾取器</button>
          </div>
        </div>

        <div v-if="fillRows.length > 0" class="f-table">
          <div class="f-row f-row--head">
            <span></span><span>页面控件</span><span>控件类型</span><span>推断字段类型</span><span>将填入的值</span>
          </div>
          <div :style="padTop"></div>
          <div v-for="row in visibleFillRows" :key="row.fieldId" class="f-row">
            <input
              type="checkbox" class="f-checkbox" :checked="row.selected" :disabled="state.filling"
              :aria-label="'选择 ' + row.label" @change="actions.toggleRow(row.fieldId)"
            />
            <span class="f-row__label" :title="row.label">{{ row.label || '未命名控件' }}</span>
            <span class="f-control-type">{{ controlLabel(row.controlType) }}</span>
            <span>
              <select class="f-select" :value="row.fieldType" :aria-label="'修改 ' + row.label + ' 的字段类型'" @change="onTypeChange(row, $event)">
                <option v-for="item in BINDABLE_TYPES" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
              <span class="f-row__conf">推断 {{ formatConfidence(row.confidence) }}</span>
            </span>
            <span class="f-row__value" :title="row.value">{{ row.value || '--' }}</span>
            <div class="f-row__status">
              <FStatus :status="row.status" :code="row.code" :skip-reason="row.skipReason" :reason="row.failureReason" />
              <button v-if="row.status === 'failed'" class="f-link" @click="actions.locate(row.fieldId)">定位到元素</button>
              <button v-if="row.status === 'failed'" class="f-link" @click="actions.openPicker()">重新拾取</button>
            </div>
          </div>
          <div :style="padBottom"></div>
        </div>

        <div v-if="unknownRows.length > 0" class="f-group">
          <button class="f-group__head" @click="unknownOpen = !unknownOpen">按标签生成 {{ unknownRows.length }} 项 · 语义未识别，按标签即时生成测试数据</button>
          <div v-if="unknownOpen" class="f-group__body">
            <div v-for="row in unknownRows" :key="row.fieldId" class="f-row">
              <span class="f-meta">?</span>
              <span class="f-row__label" :title="row.label">{{ row.label || '未命名控件' }}</span>
              <span class="f-control-type">{{ controlLabel(row.controlType) }}</span>
              <span>
                <select class="f-select" value="" :aria-label="'绑定 ' + row.label + ' 的字段类型'" @change="onTypeChange(row, $event)">
                  <option value="">绑定类型</option>
                  <option v-for="item in BINDABLE_TYPES" :key="item.key" :value="item.key">{{ item.label }}</option>
                </select>
              </span>
              <span class="f-row__value">--</span>
              <div class="f-row__status"><span class="f-status f-status--warn">按标签生成 · 置信度 {{ formatConfidence(row.confidence) }}</span></div>
            </div>
          </div>
        </div>

        <div v-if="unsupportedRows.length > 0" class="f-group">
          <button class="f-group__head" @click="unsupportedOpen = !unsupportedOpen">超范围控件 {{ unsupportedRows.length }} 项 · 不计入失败</button>
          <div v-if="unsupportedOpen" class="f-group__body">
            <div v-for="row in unsupportedRows" :key="row.fieldId" class="f-row">
              <span></span>
              <span class="f-row__label" :title="row.label">{{ row.label || '未命名控件' }}</span>
              <span class="f-control-type">{{ controlLabel(row.controlType) }}</span>
              <span class="f-meta">未纳入</span>
              <span class="f-row__value">--</span>
              <div class="f-row__status">
                <span class="f-status f-status--muted">跳过 · E_UNSUPPORTED_CONTROL · 控件超出 v1 适配范围</span>
                <button class="f-link" @click="actions.openPicker()">一键重新拾取</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="excludedRows.length > 0" class="f-group">
          <button class="f-group__head" @click="excludedOpen = !excludedOpen">已排除 {{ excludedRows.length }} 项 · 逐条可纳入</button>
          <div v-if="excludedOpen" class="f-group__body">
            <div v-for="row in excludedRows" :key="row.fieldId" class="f-row">
              <span></span>
              <span class="f-row__label" :title="row.label">{{ row.label || '未命名控件' }}</span>
              <span class="f-control-type">{{ controlLabel(row.controlType) }}</span>
              <span class="f-meta">{{ skipLabel(row.skipReason) }}</span>
              <span class="f-row__value">--</span>
              <div class="f-row__status">
                <FStatus status="skipped" :skip-reason="row.skipReason" />
                <button class="f-link" @click="actions.includeExcluded(row.fieldId)">纳入本次</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="f-panel__footer">
      <button class="f-btn" @click="actions.closePlan()">取消</button>
      <button class="f-btn f-btn--text" :disabled="!state.undoAvailable" @click="actions.undo()">撤销本次填充</button>
      <span class="f-meta">{{ state.undoReason }}</span>
      <button
        class="f-btn f-btn--primary" :disabled="state.filling || selectedCount === 0 || !state.allowed"
        @click="actions.confirm()"
      >
        {{ state.filling ? '正在填充 ' + state.progressDone + ' / ' + state.progressTotal : '填充 ' + selectedCount + ' 项' }}
      </button>
      <div class="f-panel__footer-note">仅填入，不提交；已有值默认保留</div>
    </div>
  </div>
</template>
