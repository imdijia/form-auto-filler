<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorCode, SkipReason } from '../../contracts';
import { errorLabel, skipLabel, statusLabel } from '../control-labels';

const props = defineProps<{
  status: 'pending' | 'filled' | 'skipped' | 'failed';
  reason?: string;
  code?: ErrorCode;
  skipReason?: SkipReason;
}>();

const tone = computed(() => {
  switch (props.status) {
    case 'filled': return 'f-status--success';
    case 'skipped': return 'f-status--muted';
    case 'failed': return 'f-status--danger';
    default: return 'f-status--pending';
  }
});

const detail = computed(() =>
  [
    props.reason ?? '',
    props.code ? errorLabel(props.code) : '',
    props.skipReason ? skipLabel(props.skipReason) : '',
  ].filter((part) => part.length > 0).join(' · '),
);
</script>

<template>
  <span :class="['f-status', tone]">{{ statusLabel(status) }}</span>
  <span v-if="detail" class="f-status__reason">{{ detail }}</span>
</template>
