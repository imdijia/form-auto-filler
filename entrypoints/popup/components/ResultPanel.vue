<script setup lang="ts">
import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { FillReport, FillResult } from '../../../src/contracts';
import { isOutOfScope, isVerifiedSuccess } from '../../../src/execution/fill-report';
import { control } from '../../../src/infra/messages';
import { controlLabel, errorLabel, skipLabel } from '../../../src/ui/control-labels';
import { ChevronDown } from '@lucide/vue';

const props = defineProps<{
  report: FillReport;
  labels: Readonly<Record<string, string>>;
}>();

const open = ref<Record<string, boolean>>({});

interface Group {
  key: string;
  title: string;
  tone: string;
  items: FillResult[];
}

const groups = computed<Group[]>(() => {
  const all = props.report.outcomes;
  return [
    { key: 'filled', title: '成功', tone: 'success', items: all.filter(isVerifiedSuccess) },
    {
      key: 'skipped', title: '跳过', tone: 'muted',
      items: all.filter((item) => item.status === 'skipped' &&
        !isOutOfScope(item) && item.skipReason !== 'low-confidence'),
    },
    { key: 'unknown', title: '按标签生成（未识别字段）', tone: 'warn',
      items: all.filter((item) => item.skipReason === 'low-confidence') },
    { key: 'out', title: '超范围控件', tone: 'muted', items: all.filter(isOutOfScope) },
    {
      key: 'failed', title: '失败', tone: 'danger',
      items: all.filter((item) => !isVerifiedSuccess(item) && item.status !== 'skipped' && !isOutOfScope(item)),
    },
  ];
});

function toggle(key: string): void {
  open.value = { ...open.value, [key]: !open.value[key] };
}

function labelOf(item: FillResult): string {
  return props.labels[item.fieldId] ?? item.fieldId.slice(0, 12);
}

function reasonOf(item: FillResult): string {
  if (isOutOfScope(item)) return '控件超出 v1 适配范围';
  if (item.failureReason) return item.failureReason;
  if (item.skipReason) return skipLabel(item.skipReason);
  if (item.code) return errorLabel(item.code);
  return '三层回读均通过';
}

async function send(name: 'locate' | 'open-picker', fieldId?: string): Promise<void> {
  await browser.runtime.sendMessage(control(name, fieldId ? { fieldId } : {}));
  window.close();
}
</script>

<template>
  <div class="f-result">
    <div class="f-summary">
      <span>成功 <strong>{{ report.filled }}</strong></span>
      <span>跳过 <strong>{{ report.skipped }}</strong></span>
      <span>失败 <strong>{{ report.failed }}</strong></span>
      <span class="f-meta">仅填入，不提交</span>
    </div>
    <div v-for="group in groups" :key="group.key" class="f-result-group">
      <button class="f-result-group__head" @click="toggle(group.key)">
        <span>{{ group.title }} {{ group.items.length }}</span>
        <ChevronDown :size="16" :stroke-width="1.75" aria-hidden="true" />
      </button>
      <template v-if="open[group.key]">
        <div v-if="group.items.length === 0" class="f-meta">本组暂无条目</div>
        <div v-for="item in group.items" :key="item.fieldId" class="f-result-item">
          <div class="f-result-item__label" :title="labelOf(item)">{{ labelOf(item) }}</div>
          <span class="f-control-type">{{ controlLabel(item.controlType) }}</span>
          <div :class="['f-status', 'f-status--' + group.tone]">{{ group.title }}</div>
          <span v-if="item.code" class="f-code">{{ item.code }}</span>
          <div class="f-meta">{{ reasonOf(item) }}</div>
          <div v-if="group.key === 'failed' || group.key === 'out'" class="f-actions">
            <button class="f-link" @click="send('locate', item.fieldId)">定位到元素</button>
            <button class="f-link" @click="send('open-picker')">重新拾取</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
