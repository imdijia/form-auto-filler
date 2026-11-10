<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { UiActions, UiState } from '../../runtime/ui-state';
import Fab from './Fab.vue';
import PlanPanel from './PlanPanel.vue';
import Picker from './Picker.vue';
import ResultBar from './ResultBar.vue';

const props = defineProps<{ state: UiState; actions: UiActions }>();

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (props.state.pickerActive) props.actions.closePicker();
  else if (props.state.planOpen) props.actions.closePlan();
  else if (props.state.resultVisible) props.actions.closeResult();
}

onMounted(() => document.addEventListener('keydown', onKeyDown));
onUnmounted(() => document.removeEventListener('keydown', onKeyDown));
</script>

<template>
  <div class="f-root">
    <Fab
      :allowed="state.allowed" :collapsed="state.fabCollapsed" :hint="state.fabHint"
      @open="actions.openPlan()" @menu="actions.openPicker()"
    />
    <ResultBar v-if="state.resultVisible" :state="state" :actions="actions" />
    <PlanPanel v-if="state.planOpen" :state="state" :actions="actions" />
    <Picker v-if="state.pickerActive" :state="state" :actions="actions" />
  </div>
</template>
