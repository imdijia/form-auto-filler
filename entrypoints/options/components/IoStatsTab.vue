<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Download, Upload, RotateCcw } from '@lucide/vue';
import { STORAGE_KEYS } from '../../../src/contracts';
import type { LocalCounterEvent } from '../../../src/contracts';
import { createBrowserStorage } from '../../../src/infra/storage';
import { createRuleStore } from '../../../src/config/rule-store';
import { readCounters, readCounterRecords } from '../../../src/config/counters';
import {
  previewImport, resetDocument, saveDocument, type ImportPreview,
} from '../../../src/config/rule-editor';

const storage = createBrowserStorage();
const raw = ref('');
const preview = ref<ImportPreview | null>(null);
const message = ref('');
const error = ref('');
const resetPending = ref(false);
const clearPending = ref(false);
const counters = ref<Record<LocalCounterEvent, number> | null>(null);
const lastAt = ref('');

const tiles = computed(() => {
  const c = counters.value;
  if (!c) return [];
  return [
    { label: '触发填充', value: c.fill_triggered },
    { label: '完成批次', value: c.fill_completed },
    { label: '推断字段', value: c.field_inferred },
    { label: '跳过', value: c.field_skipped },
    { label: '失败', value: c.field_failed },
    { label: '按标签生成', value: c.field_unknown },
    { label: '拾取器改绑', value: c.picker_rebind },
    { label: '规则漂移提示', value: c.rule_hash_drift },
    { label: '异常', value: c.error_occurred },
  ];
});

async function reloadCounters(): Promise<void> {
  counters.value = await readCounters(storage);
  const records = await readCounterRecords(storage);
  lastAt.value = Object.values(records)
    .map((record) => record?.lastAt ?? '')
    .filter(Boolean)
    .sort()
    .pop() ?? '';
}

async function exportRules(): Promise<void> {
  error.value = '';
  const text = await createRuleStore(storage).exportJson();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'form-auto-filler-rules.json';
  anchor.click();
  URL.revokeObjectURL(url);
  message.value = '已导出规则 JSON，不含诊断计数与任何页面数据';
}

async function validateImport(): Promise<void> {
  error.value = '';
  const result = await previewImport(storage, raw.value);
  if (!result.ok) {
    preview.value = null;
    error.value = '导入校验未通过：' + result.message;
    return;
  }
  preview.value = result.value;
}

async function applyImport(): Promise<void> {
  if (!preview.value) return;
  const result = await saveDocument(storage, preview.value.document);
  if (!result.ok) {
    error.value = result.message;
    return;
  }
  preview.value = null;
  error.value = '';
  message.value = '配置已保存到本机';
  await reloadCounters();
}

async function restoreDefaults(): Promise<void> {
  resetPending.value = false;
  await resetDocument(storage);
  message.value = '已恢复默认规则，配置已保存到本机';
}

async function clearCounters(): Promise<void> {
  clearPending.value = false;
  await storage.set(STORAGE_KEYS.COUNTERS, {});
  message.value = '本地统计已清空';
  await reloadCounters();
}

onMounted(() => void reloadCounters());
</script>

<template>
  <div>
    <div class="f-card">
      <h2 class="f-card__title">导入导出</h2>
      <p class="f-card__hint">
        导出内容只有规则、字典与生成器配置；不含诊断计数、字段取值与任何页面数据。
        导入前先给校验结果预览，确认后才写入。
      </p>
      <div class="f-actions">
        <button class="f-btn f-btn--primary" @click="exportRules()">
          <Download :size="16" :stroke-width="1.75" aria-hidden="true" /> 导出 JSON
        </button>
        <button class="f-btn" @click="resetPending = true">
          <RotateCcw :size="16" :stroke-width="1.75" aria-hidden="true" /> 恢复默认
        </button>
      </div>
      <div v-if="resetPending" class="f-notice f-notice--danger" style="margin-top: var(--space-3)">
        二次确认：恢复默认会覆盖本机别名、生成器参数与页面级修正。
        <button class="f-link" @click="restoreDefaults()">确认执行</button>
        <button class="f-link" @click="resetPending = false">取消</button>
      </div>

      <div class="f-divider"></div>
      <textarea
        v-model="raw" class="f-textarea" aria-label="粘贴规则 JSON"
        placeholder="粘贴规则 JSON 后先校验，再确认导入"
      ></textarea>
      <div class="f-actions" style="margin-top: var(--space-2)">
        <button class="f-btn" @click="validateImport()">
          <Upload :size="16" :stroke-width="1.75" aria-hidden="true" /> 校验并预览
        </button>
        <button class="f-btn f-btn--primary" :disabled="!preview" @click="applyImport()">确认导入</button>
      </div>
      <div v-if="preview" class="f-notice f-notice--info" style="margin-top: var(--space-2)">
        新增 {{ preview.added }} 条 · 覆盖 {{ preview.covered }} 条 · 冲突 {{ preview.conflicts }} 条
      </div>
      <div v-if="error" class="f-notice f-notice--danger">{{ error }}</div>
      <div v-if="message" class="f-inline-saved">{{ message }}</div>
    </div>

    <div class="f-card">
      <h2 class="f-card__title">累计本地诊断计数 · 仅存于本机 · 自安装/上次清空以来</h2>
      <p class="f-card__hint">
        仅统计次数与结果分类，不采集字段取值、姓名 / 身份证等敏感值、页面 URL 明文（仅用指纹 hash）、
        IP 与页面原始输入；全部存于本机，零网络上报。
      </p>
      <p class="f-card__hint">
        本区是累计计数（faf.counters.v1）；popup 的「本次结果」来自 faf.lastResult.v1，两者口径不同，不合并展示。
      </p>
      <div v-if="counters && tiles.some((tile) => tile.value > 0)" class="f-stats">
        <div v-for="tile in tiles" :key="tile.label" class="f-stat">
          <div class="f-stat__value">{{ tile.value.toLocaleString('zh-CN') }}</div>
          <div class="f-stat__label">{{ tile.label }}</div>
        </div>
      </div>
      <div v-else class="f-empty">尚无填充记录。完成一次填充后，这里只显示聚合次数。</div>
      <div v-if="lastAt" class="f-meta" style="margin-top: var(--space-2)">最近一次 {{ lastAt }}</div>
      <div class="f-actions" style="margin-top: var(--space-3)">
        <button class="f-btn f-btn--danger" @click="clearPending = true">清空本地统计</button>
      </div>
      <div v-if="clearPending" class="f-notice f-notice--danger" style="margin-top: var(--space-2)">
        二次确认：清空后累计计数不可恢复，规则与页面修正不受影响。
        <button class="f-link" @click="clearCounters()">确认执行</button>
        <button class="f-link" @click="clearPending = false">取消</button>
      </div>
    </div>
  </div>
</template>
