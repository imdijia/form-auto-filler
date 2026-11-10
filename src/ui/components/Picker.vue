<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type CSSProperties } from 'vue';
import type { UiActions, UiState } from '../../runtime/ui-state';
import {
  DIALOG_SELECTOR, isVisibleContainer, visibleControlsIn,
} from '../../detection/scope-selector';

const props = defineProps<{ state: UiState; actions: UiActions }>();

interface HoverInfo {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  count: number;
}

const hover = ref<HoverInfo | null>(null);

const CANDIDATE_SELECTOR = [
  DIALOG_SELECTOR,
  'form',
  'section',
  '.ant-card',
  '.el-card',
  '[class*="form"]',
  '[class*="panel"]',
  '[class*="container"]',
].join(', ');

function fromOwnUi(event: Event): boolean {
  return event.composedPath().some(
    (node) => node instanceof HTMLElement && node.id === 'faf-shadow-root',
  );
}

/** Find the smallest meaningful container under the pointer, never the
    extension's own shadow host. */
function containerAt(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint(x, y);
  if (!element || element.id === 'faf-shadow-root') return null;
  const candidate = element.closest<HTMLElement>(CANDIDATE_SELECTOR);
  if (candidate && isVisibleContainer(candidate, document)) return candidate;
  let node: HTMLElement | null = element.parentElement;
  while (node && node !== document.body) {
    if (isVisibleContainer(node, document) && visibleControlsIn(node, document).length > 0) {
      return node;
    }
    node = node.parentElement;
  }
  return document.body;
}

function describe(element: HTMLElement): HoverInfo {
  const rect = element.getBoundingClientRect();
  const className = typeof element.className === 'string'
    ? element.className.trim().split(/\s+/)[0] ?? ''
    : '';
  const label = element.getAttribute('aria-label')
    ?? element.getAttribute('title')
    ?? (element.tagName.toLowerCase() + (className ? '.' + className : ''));
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    label,
    count: visibleControlsIn(element, document).length,
  };
}

function onMove(event: MouseEvent): void {
  if (props.state.filling) return;
  const element = containerAt(event.clientX, event.clientY);
  hover.value = element ? describe(element) : null;
}

function onClick(event: MouseEvent): void {
  if (fromOwnUi(event) || props.state.filling) return;
  const element = containerAt(event.clientX, event.clientY);
  if (!element) return;
  event.preventDefault();
  event.stopPropagation();
  hover.value = null;
  props.actions.fillRegion(element);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  hover.value = null;
  props.actions.closePicker();
}

onMounted(() => {
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
});
onUnmounted(() => {
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
});

const highlightStyle = computed<CSSProperties>(() => {
  const info = hover.value;
  if (!info) return {};
  return {
    left: info.left + 'px',
    top: info.top + 'px',
    width: info.width + 'px',
    height: info.height + 'px',
  };
});

const tooltipStyle = computed<CSSProperties>(() => {
  const info = hover.value;
  if (!info) return {};
  return {
    left: Math.max(8, Math.min(info.left, window.innerWidth - 272)) + 'px',
    top: Math.max(52, info.top + info.height + 8) + 'px',
  };
});
</script>

<template>
  <div v-if="hover" class="f-picker-highlight f-picker-highlight--region" :style="highlightStyle"></div>
  <div v-if="hover" class="f-picker-tooltip" :style="tooltipStyle">
    <div class="f-picker-tooltip__row">候选容器：{{ hover.label }}</div>
    <div class="f-picker-tooltip__row">可见控件：{{ hover.count }} 项</div>
    <div class="f-picker-tooltip__row">点击即以该容器为根一键全填</div>
  </div>

  <div class="f-picker-toolbar">
    <span class="f-picker-toolbar__title">重新选择区域 · 移动鼠标高亮容器 · 点击即填充 · Esc 退出</span>
    <button class="f-btn" @click="actions.closePicker()">退出</button>
  </div>
</template>
