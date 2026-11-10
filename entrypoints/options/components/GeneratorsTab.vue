<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FIELD_META, GENERATOR_IDS } from '../../../src/contracts/field-metadata';
import type { RulesDocument } from '../../../src/contracts';
import { createBrowserStorage } from '../../../src/infra/storage';
import { readDocument, setGeneratorEnabled, setGeneratorParam } from '../../../src/config/rule-editor';

const storage = createBrowserStorage();
const document = ref<RulesDocument | null>(null);
const message = ref('');
const error = ref('');
const advanced = ref(false);
const formats = ref<Record<string, string>>({ date: 'YYYY-MM-DD', time: 'HH:mm' });

async function reload(): Promise<void> {
  const doc = await readDocument(storage);
  document.value = doc;
  formats.value = {
    date: String(doc.global.generators.date?.format ?? 'YYYY-MM-DD'),
    time: String(doc.global.generators.time?.format ?? 'HH:mm'),
  };
}

function enabled(key: string): boolean {
  return document.value?.global.generators[key]?.enabled !== false;
}

async function toggle(key: string, event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked;
  const result = await setGeneratorEnabled(storage, key, checked);
  if (!result.ok) error.value = result.message;
  else message.value = '配置已保存到本机';
  await reload();
}

async function updateFormat(key: string): Promise<void> {
  const value = formats.value[key] ?? '';
  const result = await setGeneratorParam(storage, key, 'format', value);
  if (!result.ok) error.value = result.message;
  else message.value = '配置已保存到本机';
  await reload();
}

onMounted(() => void reload());
</script>

<template>
  <div class="f-card">
    <h2 class="f-card__title">生成器</h2>
    <p class="f-card__hint">
      每类字段一行，停用后该类型不再生成随机值（仍可从页面枚举取值）。固定种子保证同一批数据可复现。
    </p>
    <div v-if="message" class="f-inline-saved">{{ message }}</div>
    <div v-if="error" class="f-notice f-notice--danger">{{ error }}</div>
    <div class="f-table">
      <div class="f-table__head"><span>字段类型</span><span>生成器</span><span>启用</span><span>参数</span></div>
      <div
        v-for="meta in FIELD_META" :key="meta.key" class="f-table__row"
        :style="{ opacity: enabled(meta.key) ? 1 : 0.55 }"
      >
        <span>{{ meta.label }}</span>
        <span class="f-meta f-mono">{{ GENERATOR_IDS[meta.key] }}</span>
        <span>
          <input
            class="f-switch" type="checkbox" :checked="enabled(meta.key)"
            :aria-label="'启用 ' + meta.label + ' 生成器'" @change="toggle(meta.key, $event)"
          />
          <span class="f-meta">{{ enabled(meta.key) ? '已启用' : '已停用' }}</span>
        </span>
        <span v-if="meta.key === 'date' || meta.key === 'time'" class="f-line">
          <input
            v-model="formats[meta.key]" class="f-input" style="max-width:120px"
            :aria-label="meta.label + ' 格式'" @change="updateFormat(meta.key)"
          />
        </span>
        <span v-else class="f-meta">默认参数</span>
      </div>
    </div>

    <div class="f-divider"></div>
    <button class="f-link" @click="advanced = !advanced">
      {{ advanced ? '收起高级参数' : '展开高级参数' }}
    </button>
    <div v-if="advanced" class="f-meta" style="margin-top: var(--space-2)">
      高级参数按字段类型归档在 faf.rules.v1 的 global.generators 中；金额、数量与百分比会尊重页面 min / max / step / pattern。
    </div>

    <div class="f-presets" aria-disabled="true" style="margin-top: var(--space-4)">
      预设字段值将在后续版本提供，当前始终使用随机生成。此区域为后续 DataProvider 扩展预留，不暴露可用入口。
    </div>
  </div>
</template>
