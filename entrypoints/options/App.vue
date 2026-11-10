<script setup lang="ts">
import { computed, ref } from 'vue';
import { BookOpen, SlidersHorizontal, Layers, FileJson, ShieldCheck } from '@lucide/vue';
import AllowlistPanel from './components/AllowlistPanel.vue';
import AliasTab from './components/AliasTab.vue';
import GeneratorsTab from './components/GeneratorsTab.vue';
import PageRulesTab from './components/PageRulesTab.vue';
import IoStatsTab from './components/IoStatsTab.vue';

const tabs = [
  { key: 'aliases', label: '别名词典', icon: BookOpen },
  { key: 'generators', label: '生成器', icon: SlidersHorizontal },
  { key: 'pages', label: '页面规则', icon: Layers },
  { key: 'io', label: '导入导出与本地统计', icon: FileJson },
] as const;

type TabKey = (typeof tabs)[number]['key'];
const active = ref<TabKey>('aliases');
const views = {
  aliases: AliasTab,
  generators: GeneratorsTab,
  pages: PageRulesTab,
  io: IoStatsTab,
} as const;
const current = computed(() => views[active.value]);
</script>

<template>
  <div class="f-options">
    <div class="f-options__inner">
      <div class="f-options__head">
        <h1 class="f-options__title">配置与规则库</h1>
        <span class="f-meta">全部存于本机 · 无账号 · 无云同步 · 零网络上报</span>
      </div>

      <section class="f-safe">
        <div class="f-safe__title">
          <ShieldCheck :size="18" :stroke-width="1.75" aria-hidden="true" /> 站点清单（可选 · 默认关闭）
        </div>
        <p class="f-card__hint">
          v2 默认放行任意页面，一键全填不需要任何站点配置。此处清单仅作可选参考，
          不会被填充主流程读取，也不会阻止填充；数据只存本机，不会上传、无账号、无云同步。
          导出 JSON 不含诊断计数、字段取值与任何页面数据；默认只填不提交。
        </p>
        <AllowlistPanel />
      </section>

      <div class="f-layout">
        <nav class="f-nav" aria-label="配置分组">
          <button
            v-for="tab in tabs" :key="tab.key"
            :class="['f-nav__item', { 'f-nav__item--active': active === tab.key }]"
            :aria-current="active === tab.key ? 'page' : undefined"
            @click="active = tab.key"
          >
            <component :is="tab.icon" :size="16" :stroke-width="1.75" aria-hidden="true" />
            {{ tab.label }}
          </button>
        </nav>
        <main class="f-content">
          <component :is="current" />
        </main>
      </div>
    </div>
  </div>
</template>
