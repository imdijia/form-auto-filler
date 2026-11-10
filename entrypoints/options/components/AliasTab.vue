<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search } from '@lucide/vue';
import { FIELD_META } from '../../../src/contracts/field-metadata';
import { createBrowserStorage } from '../../../src/infra/storage';
import { readDocument, setAliases } from '../../../src/config/rule-editor';

interface Row { key: string; label: string; aliases: string[] }

const storage = createBrowserStorage();
const rows = ref<Row[]>([]);
const query = ref('');
const editing = ref('');
const draft = ref('');
const message = ref('');
const error = ref('');

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return rows.value;
  return rows.value.filter((row) =>
    row.label.toLowerCase().includes(needle) ||
    row.key.toLowerCase().includes(needle) ||
    row.aliases.some((alias) => alias.toLowerCase().includes(needle)),
  );
});

async function reload(): Promise<void> {
  const doc = await readDocument(storage);
  rows.value = FIELD_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    aliases: [...(doc.global.aliasDictionary[meta.key] ?? meta.aliases)],
  }));
}

function start(row: Row): void {
  editing.value = row.key;
  draft.value = row.aliases.join(', ');
  error.value = '';
}

async function save(row: Row): Promise<void> {
  const list = draft.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  const result = await setAliases(storage, row.key, list);
  if (!result.ok) {
    error.value = result.message;
    return;
  }
  editing.value = '';
  message.value = '配置已保存到本机';
  await reload();
}

onMounted(() => void reload());
</script>

<template>
  <div class="f-card">
    <h2 class="f-card__title">别名词典</h2>
    <p class="f-card__hint">
      字段类型共 20 类，以 docs/contracts/field-types.json 为唯一权威。别名用逗号分隔，改动即时保存到本机。
    </p>
    <div class="f-line" style="margin-bottom: var(--space-3)">
      <Search :size="16" :stroke-width="1.75" aria-hidden="true" />
      <input v-model="query" class="f-input f-grow" placeholder="按字段类型或别名搜索" aria-label="搜索别名词典" />
    </div>
    <div v-if="message" class="f-inline-saved">{{ message }}</div>
    <div v-if="error" class="f-notice f-notice--danger">{{ error }}</div>

    <div class="f-table">
      <div class="f-table__head"><span>字段类型</span><span>别名</span><span>来源</span><span>操作</span></div>
      <div v-for="row in visible" :key="row.key" class="f-table__row">
        <span>{{ row.label }}</span>
        <template v-if="editing === row.key">
          <input v-model="draft" class="f-input" :aria-label="'编辑 ' + row.label + ' 的别名'" @keydown.enter="save(row)" />
        </template>
        <span v-else class="f-meta">{{ row.aliases.join('、') || '暂无别名' }}</span>
        <span class="f-meta">field-types.json</span>
        <span class="f-actions">
          <button v-if="editing === row.key" class="f-link" @click="save(row)">保存本行</button>
          <button v-else class="f-link" @click="start(row)">编辑别名</button>
        </span>
      </div>
    </div>
    <div v-if="visible.length === 0" class="f-empty">没有匹配的字段类型，换个关键词再试。</div>
  </div>
</template>
