<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import {
  Zap, MousePointer2, RotateCcw, Settings2, RefreshCw, Keyboard, ShieldCheck,
} from '@lucide/vue';
import type { FillReport } from '../../src/contracts';
import { createBrowserStorage } from '../../src/infra/storage';
import { control, isRuntimeMessage, type CommandName } from '../../src/infra/messages';
import {
  nextSeed, readLastResult, readResultLabels, readSettings, writeSettings,
} from '../../src/config/session-store';
import ResultPanel from './components/ResultPanel.vue';

const storage = createBrowserStorage();
const loading = ref(true);
const loadError = ref('');
const envLabel = '默认放行任意页面 · 零配置';
const seed = ref(4821);
const report = ref<FillReport | null>(null);
const labels = ref<Record<string, string>>({});
const progress = ref<{ done: number; total: number } | null>(null);
const shortcutWarning = ref('');
const undoAvailable = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const [settings, last, labelMap, commands] = await Promise.all([
      readSettings(storage),
      readLastResult(storage),
      readResultLabels(storage),
      browser.commands.getAll(),
    ]);
    seed.value = settings.seed;
    report.value = last ?? null;
    labels.value = { ...labelMap };
    undoAvailable.value = Boolean(last && last.filled > 0);
    shortcutWarning.value = commands.some(
      (item) => item.name !== '_execute_action' && !item.shortcut,
    )
      ? '快捷键未生效，请在扩展快捷键设置中修改'
      : '';
  } catch {
    loadError.value = '读取本地配置失败，点击重试';
  } finally {
    loading.value = false;
  }
}

async function send(
  name: CommandName,
  payload: Record<string, unknown> = {},
  close = false,
): Promise<void> {
  await browser.runtime.sendMessage(control(name, payload));
  if (close) window.close();
}

function fill(): void { void send('open-plan'); }
function pickRegion(): void { void send('open-picker', {}, true); }
function undo(): void { if (undoAvailable.value) void send('undo'); }

async function changeSeed(): Promise<void> {
  const next = nextSeed(seed.value);
  await writeSettings(storage, { seed: next });
  seed.value = next;
  await send('refresh-plan', { seed: next });
}

async function openOptions(): Promise<void> {
  await browser.runtime.openOptionsPage();
  window.close();
}

function onMessage(message: unknown): void {
  if (!isRuntimeMessage(message)) return;
  if (message.type === 'PROGRESS') {
    progress.value = { done: message.payload.done, total: message.payload.total };
    return;
  }
  progress.value = null;
  void load();
}

onMounted(() => {
  // Opening the popup is a user gesture: it grants activeTab and lets the
  // background inject the unlisted script so the floating ball is resident.
  void browser.runtime.sendMessage(control('ping'));
  browser.runtime.onMessage.addListener(onMessage);
  void load();
  // v2: clicking the toolbar icon opens this popup; that single gesture is
  // the one-shot fill trigger. The panel stays open for result / undo /
  // the optional region picker.
  void browser.runtime.sendMessage(control('open-plan'));
});
onUnmounted(() => browser.runtime.onMessage.removeListener(onMessage));
</script>

<template>
  <div class="f-popup">
    <div class="f-popup__head">
      <span class="f-title">表单填充</span>
      <span class="f-env">{{ envLabel }}</span>
    </div>

    <div class="f-popup__body">
      <div v-if="loading">
        <div class="f-skeleton"></div><div class="f-skeleton"></div><div class="f-skeleton"></div>
      </div>
      <div v-else-if="loadError" class="f-empty">
        <div>{{ loadError }}</div>
        <div class="f-empty__actions"><button class="f-link" @click="load()">重新读取本地配置</button></div>
      </div>

      <template v-else>
        <div v-if="shortcutWarning" class="f-notice">
          {{ shortcutWarning }}
          <button class="f-link" @click="openOptions()">打开扩展设置</button>
        </div>

        <div class="f-section">
          <div class="f-section__title">数据集</div>
          <div class="f-dataset">
            <span class="f-dataset__name">随机生成</span>
            <span class="f-grow"></span>
            <span class="f-meta f-mono">本次种子 {{ seed }} · 可复现</span>
            <button class="f-link" @click="changeSeed()">
              <RefreshCw :size="14" :stroke-width="1.75" aria-hidden="true" /> 换一组
            </button>
          </div>
          <div class="f-meta">固定种子生成同一批数据；换一组会以新数据重新填充当前区域。</div>
        </div>

        <div class="f-section f-actions">
          <button class="f-btn f-btn--primary f-btn--block" @click="fill()">
            <Zap :size="16" :stroke-width="1.75" aria-hidden="true" /> 一键全填当前区域
          </button>
          <button class="f-btn" @click="pickRegion()">
            <MousePointer2 :size="16" :stroke-width="1.75" aria-hidden="true" /> 重新选择区域
          </button>
        </div>

        <div class="f-section">
          <div class="f-section__title">本次结果</div>
          <div v-if="progress" class="f-meta">正在填充 {{ progress.done }} / {{ progress.total }}</div>
          <div v-if="!report" class="f-empty">
            <div>打开本面板时已自动填充一次；若页面刚加载完成，点上方按钮再填一次。</div>
            <div class="f-empty__actions"><button class="f-btn f-btn--primary" @click="fill()">一键全填</button></div>
          </div>
          <template v-else>
            <ResultPanel :report="report" :labels="labels" />
            <div class="f-line f-line--between" style="margin-top: var(--space-2)">
              <button class="f-btn f-btn--text" :disabled="!undoAvailable" @click="undo()">
                <RotateCcw :size="14" :stroke-width="1.75" aria-hidden="true" /> 撤销本次填充
              </button>
              <span class="f-meta">仅本次会话内有效；页面变化后不可撤销</span>
            </div>
          </template>
        </div>
      </template>
    </div>

    <div class="f-popup__footer">
      <button class="f-link" @click="openOptions()">
        <ShieldCheck :size="14" :stroke-width="1.75" aria-hidden="true" /> 限制站点（可选）
      </button>
      <span><Keyboard :size="14" :stroke-width="1.75" aria-hidden="true" /> <span class="f-kbd">Alt+Shift+F</span> 一键全填</span>
    </div>
  </div>
</template>
