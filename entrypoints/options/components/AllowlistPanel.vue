<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Trash2 } from '@lucide/vue';
import { createBrowserStorage } from '../../../src/infra/storage';
import {
  addLocalDevSites,
  addSite,
  clearSites,
  normalizeSiteInput,
  readAllowlist,
  removeSite,
} from '../../../src/config/site-allowlist';

const storage = createBrowserStorage();
const sites = ref<string[]>([]);
const draft = ref('');
const message = ref('');
const error = ref('');
const pending = ref<{ kind: 'clear' } | { kind: 'remove'; host: string } | null>(null);

async function reload(): Promise<void> {
  sites.value = await readAllowlist(storage);
}

function inputValid(): boolean {
  return normalizeSiteInput(draft.value) !== null;
}

async function add(): Promise<void> {
  error.value = '';
  if (!inputValid()) {
    error.value = '请输入域名、通配域名或本机地址，例如 localhost、localhost:9003/、*.test.example.com';
    return;
  }
  sites.value = await addSite(storage, draft.value);
  draft.value = '';
  message.value = '配置已保存到本机';
}

async function addLocal(): Promise<void> {
  error.value = '';
  sites.value = await addLocalDevSites(storage);
  message.value = '已添加本机地址，所有端口通用';
}

function request(kind: 'clear'): void;
function request(kind: 'remove', host: string): void;
function request(kind: 'clear' | 'remove', host?: string): void {
  pending.value = kind === 'clear' ? { kind: 'clear' } : { kind: 'remove', host: host ?? '' };
}

async function confirmPending(): Promise<void> {
  const action = pending.value;
  pending.value = null;
  if (!action) return;
  if (action.kind === 'clear') {
    await clearSites(storage);
    sites.value = [];
    message.value = '站点清单已清空；一键全填不受影响';
  } else {
    sites.value = await removeSite(storage, action.host);
    message.value = '配置已保存到本机';
  }
}

onMounted(() => void reload());
</script>

<template>
  <div>
    <div class="f-notice">
      站点限制默认关闭，清单为空不影响一键全填。此处仅维护可选的域名参考清单，
      填充主流程不会读取它，也不会据此拦截任何页面。
    </div>
    <div class="f-safe__row">
      <input
        v-model="draft" class="f-input" style="flex:1;min-width:220px"
        placeholder="localhost:9003/ 或 test.example.com" aria-label="添加可选站点域名"
        @keydown.enter="add()"
      />
      <button class="f-btn f-btn--primary" @click="add()">
        <Plus :size="16" :stroke-width="1.75" aria-hidden="true" /> 添加站点
      </button>
      <button class="f-btn" @click="addLocal()">
        <Plus :size="16" :stroke-width="1.75" aria-hidden="true" /> 添加本机地址
      </button>
      <button class="f-btn f-btn--danger" :disabled="sites.length === 0" @click="request('clear')">
        <Trash2 :size="16" :stroke-width="1.75" aria-hidden="true" /> 清空清单
      </button>
    </div>
    <p class="f-card__hint">
      按域名匹配，不含协议与端口：填 <code>localhost</code> 后，本机任意端口都生效。
      也可直接粘贴浏览器地址栏里的完整地址（含协议、端口与路径），会自动提取域名。
      此清单不参与填充判定，仅作可选参考。
    </p>
    <div v-if="error" class="f-notice f-notice--danger">{{ error }}</div>
    <div v-if="message" class="f-inline-saved">{{ message }}</div>

    <div class="f-site-list">
      <span v-for="site in sites" :key="site" class="f-site">
        {{ site }}
        <button class="f-link" :aria-label="'移除 ' + site" @click="request('remove', site)">移除</button>
      </span>
    </div>

    <div v-if="pending" class="f-notice f-notice--danger" style="margin-top: var(--space-3)">
      <span v-if="pending.kind === 'clear'">二次确认：清空后此清单不再包含任何域名，不影响填充。</span>
      <span v-else>二次确认：移除 {{ pending.host }} 后清单中不再包含该域名，不影响填充。</span>
      <button class="f-link" @click="confirmPending()">确认执行</button>
      <button class="f-link" @click="pending = null">取消</button>
    </div>
  </div>
</template>
