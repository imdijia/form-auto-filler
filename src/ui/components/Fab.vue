<script setup lang="ts">
import { Zap } from '@lucide/vue';

defineProps<{
  allowed: boolean;
  collapsed: boolean;
  hint: string;
}>();

const emit = defineEmits<{
  open: [];
  menu: [];
}>();
</script>

<template>
  <div v-if="hint" class="f-hint">{{ hint }}</div>
  <button
    class="f-fab"
    :class="{ 'f-fab--collapsed': collapsed, 'f-fab--disabled': !allowed }"
    :disabled="!allowed"
    :aria-label="allowed ? '一键全填当前区域的所有可见控件' : '当前不可用'"
    title="一键全填 · 右键进入重新选择区域"
    @click="emit('open')"
    @contextmenu.prevent="emit('menu')"
  >
    <template v-if="collapsed">F</template>
    <Zap v-else :size="20" :stroke-width="1.75" aria-hidden="true" />
  </button>
</template>
