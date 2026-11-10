<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Trash2 } from '@lucide/vue';
import { FIELD_LABELS } from '../../../src/contracts/field-metadata';
import type { RulesDocument } from '../../../src/contracts';
import { createBrowserStorage } from '../../../src/infra/storage';
import { readDocument, removePageRule } from '../../../src/config/rule-editor';
import { readSkeleton } from '../../../src/config/structure-hash';

interface PageRow {
  pageId: string;
  urlPattern: string;
  structureHash: string;
  detectedAt: string;
  drifted: boolean;
  overrides: Array<{ locatorValue: string; action: string; typeLabel: string }>;
}

const storage = createBrowserStorage();
const pages = ref<PageRow[]>([]);
const message = ref('');
const error = ref('');
const pending = ref<{ pageId: string; locatorValue: string } | null>(null);

async function reload(): Promise<void> {
  const document: RulesDocument = await readDocument(storage);
  const rows: PageRow[] = [];
  for (const page of document.pages) {
    const skeleton = await readSkeleton(storage, page.pageId);
    rows.push({
      pageId: page.pageId,
      urlPattern: page.urlPattern,
      structureHash: page.structureHash.slice(0, 8),
      detectedAt: page.detectedAt.slice(0, 10),
      drifted: Boolean(skeleton && skeleton.structureHash !== page.structureHash),
      overrides: page.overrides.map((item) => ({
        locatorValue: item.locator.value,
        action: item.action === 'setType' ? '改绑类型' : item.action === 'skip' ? '排除' : '预设值',
        typeLabel: item.fieldType ? (FIELD_LABELS[item.fieldType] ?? item.fieldType) : '未纳入',
      })),
    });
  }
  pages.value = rows;
}

async function confirmRemove(): Promise<void> {
  const action = pending.value;
  pending.value = null;
  if (!action) return;
  const result = await removePageRule(storage, action.pageId, action.locatorValue);
  if (!result.ok) error.value = result.message;
  else message.value = '配置已保存到本机';
  await reload();
}

onMounted(() => void reload());
</script>

<template>
  <div class="f-card">
    <h2 class="f-card__title">页面规则</h2>
    <p class="f-card__hint">
      只保存页面级增量修正。规则主键是页面指纹（URL 模式 + 归一化结构 hash），
      不展示静态选择器、正则或 XPath；此处只列用户读得懂的控件标签与修正结果。
    </p>
    <div v-if="message" class="f-inline-saved">{{ message }}</div>
    <div v-if="error" class="f-notice f-notice--danger">{{ error }}</div>

    <div v-if="pages.length === 0" class="f-empty">
      还没有页面级修正。用可视化拾取器改绑一个字段类型后，这里会按页面指纹归档一条增量规则。
    </div>

    <div v-for="page in pages" :key="page.pageId" class="f-card" style="margin-bottom: var(--space-3)">
      <div class="f-line f-line--between">
        <strong>{{ page.urlPattern }}</strong>
        <span :class="['f-status', page.drifted ? 'f-status--warn' : 'f-status--success']">
          {{ page.drifted ? '结构已变化，建议重校验' : '有效' }}
        </span>
      </div>
      <div class="f-meta f-mono">页面指纹 {{ page.pageId }} · 结构 {{ page.structureHash }} · {{ page.detectedAt }}</div>
      <div class="f-table" style="margin-top: var(--space-2)">
        <div class="f-table__head"><span>控件标签</span><span>修正</span><span>字段类型</span><span>操作</span></div>
        <div v-for="item in page.overrides" :key="item.locatorValue" class="f-table__row">
          <span>{{ item.locatorValue }}</span>
          <span class="f-meta">{{ item.action }}</span>
          <span>{{ item.typeLabel }}</span>
          <button class="f-link" @click="pending = { pageId: page.pageId, locatorValue: item.locatorValue }">
            <Trash2 :size="14" :stroke-width="1.75" aria-hidden="true" /> 移除
          </button>
        </div>
      </div>
    </div>

    <div v-if="pending" class="f-notice f-notice--danger">
      二次确认：移除这条页面级修正后，该控件会回到自动推断结果。
      <button class="f-link" @click="confirmRemove()">确认执行</button>
      <button class="f-link" @click="pending = null">取消</button>
    </div>
  </div>
</template>
