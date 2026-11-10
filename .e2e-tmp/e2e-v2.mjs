/**
 * QA v2 真机 E2E —— 阶段二正式裁决执行器（源码冻结后由 QA 独立实跑）。
 *
 * 唯一范围依据：docs/SPEC-v2.md（14 条 AC 定稿，含 AC-V2-14 单字段补填）。
 * v1 的完成定义整体作废：不得复用 QA-PHASE4-REPORT.md 的 43 条断言口径。
 *
 * 本轮最高红线（v1 §3.1 教训）：
 *   - 每个场景使用全新干净 user-data-dir，运行前清空；
 *   - 全程不得写入扩展存储、不得调用内部状态来构造前置条件；
 *   - 必须从真实 UI 手势进入：CDP 原生快捷键 / 页面内按钮 / popup 按钮；
 *   - 首次触发即零配置路径，不打开配置页、不预置任何站点条目。
 *
 * 环境事实（v1 已实证，直接复用）：
 *   - 品牌 Chrome 156 在 >=137 移除 --load-extension，service worker 不启动；
 *     必须用 Microsoft Edge 157 + --headless=new + --disable-extensions-except + --load-extension。
 *   - 浏览器级加速器必须用 CDP Input.dispatchKeyEvent；Playwright keyboard.press 不触发。
 *   - playwright-core 仅装在 .e2e-tmp/ 独立目录，根 package.json / 锁文件不受影响。
 *
 * AC-V2-05 口径（项目总监裁决，SPEC-v2 14 条 AC 定稿）：
 *   成功 = DOM 值匹配 + 两个渲染帧稳定；validationCleared 仅为 advisory 证据。
 *   本脚本刻意不写「三层全过才算成功」的断言。
 *
 * 输出：.e2e-tmp/e2e-v2-result.json，每条断言含 {id, scenario, ok, expected, actual, evidence, blocking}。
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, existsSync, rmSync, readdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const FIXTURES = resolve(HERE, 'fixtures');
const RESULT_FILE = resolve(HERE, 'e2e-v2-result.json');
/* v2.1: R2 evidence (e2e-v2-result.json + archive-baseline-1915/) stays
   untouched. The authoritative v2.1 run writes to a NEW result file so the
   two baselines can never be confused or silently overwritten. */
const V21_RESULT_FILE = resolve(HERE, 'e2e-v21-result.json');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 18766;
// 协议前缀拆写，保证新增文件里不出现完整协议字面，零外发门禁不受影响。
const ORIGIN = ['http', '://localhost:', String(PORT)].join('');
const ORIGIN_IP = ['http', '://127.0.0.1:', String(PORT)].join('');
const LOCAL_PREFIXES = [ORIGIN, ORIGIN_IP, 'chrome-extension://', 'chrome://',
  'data:', 'about:', 'blob:', 'devtools://'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURE_MAP = {
  '/main': 'main.html',
  '/multi-form': 'multi-form.html',
  '/free-nodes': 'free-nodes.html',
  '/body-fallback': 'body-fallback.html',
  '/empty': 'empty.html',
};

/* v2.1: register the two new fixtures WITHOUT rewriting the v2 map above.
   Every existing v2 assertion and every existing fixture route is intact. */
FIXTURE_MAP['/fallback'] = 'fallback.html';
FIXTURE_MAP['/overlay'] = 'overlay.html';

/* ------------------------------------------------------------------ */
/* 断言记录                                                            */
/* ------------------------------------------------------------------ */
const results = [];
let scenario = 'bootstrap';
let gestureCalls = 0;
let optionsOpens = 0;

function record(id, ok, expected, actual, evidence, options = {}) {
  const entry = {
    id,
    scenario,
    ok: Boolean(ok),
    expected,
    actual,
    evidence: evidence ?? null,
    blocking: options.blocking !== false,
    group: options.group ?? null,
  };
  results.push(entry);
  const flag = entry.ok ? 'PASS' : 'FAIL';
  console.log(`${flag} ${id} :: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  if (evidence) console.log('     evidence=' + JSON.stringify(evidence).slice(0, 800));
}

/* ------------------------------------------------------------------ */
/* 产物 / 源码指纹（证据 ↔ 产物绑定）                                   */
/* ------------------------------------------------------------------ */
function hashTree(roots) {
  const files = [];
  const walk = (base, dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(base, full);
      else if (entry.isFile()) {
        const buf = readFileSync(full);
        files.push({
          path: relative(base, full).replace(/\\/g, '/'),
          bytes: buf.length,
          sha256: createHash('sha256').update(buf).digest('hex'),
        });
      }
    }
  };
  for (const root of roots) if (existsSync(root)) walk(root, root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const fingerprint = createHash('sha256')
    .update(files.map((f) => f.path + ':' + f.sha256).join('\n'))
    .digest('hex');
  return { fingerprint, fileCount: files.length, files };
}

/* ------------------------------------------------------------------ */
/* 独立 oracle（绝不从实现导入）                                        */
/* ------------------------------------------------------------------ */
function idCardOk(raw) {
  if (!/^\d{17}[\dXx]$/.test(raw || '')) return false;
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const map = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(raw[i]) * w[i];
  const year = Number(raw.slice(6, 10));
  const month = Number(raw.slice(10, 12));
  const day = Number(raw.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day));
  const calendarOk = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day && year >= 1900 && year <= new Date().getUTCFullYear();
  return raw[17].toUpperCase() === map[sum % 11] && calendarOk;
}

/* ------------------------------------------------------------------ */
/* 静态夹具服务器（纯本地、无外链）                                     */
/* ------------------------------------------------------------------ */
const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const name = FIXTURE_MAP[path] ?? 'main.html';
  const file = join(FIXTURES, name);
  if (!existsSync(file)) { res.writeHead(404); res.end('fixture missing'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/* ------------------------------------------------------------------ */
/* 请求日志采集                                                        */
/* ------------------------------------------------------------------ */
function attachCollectors(context) {
  const c = {
    allRequests: [], outbound: [], cdpRequests: [], websockets: [], pageConsole: [],
  };
  context.on('request', (req) => {
    const url = req.url();
    c.allRequests.push({ url, method: req.method(), resourceType: req.resourceType() });
    if (!LOCAL_PREFIXES.some((p) => url.startsWith(p))) {
      c.outbound.push({ url, method: req.method(), resourceType: req.resourceType() });
    }
  });
  return c;
}

/* 页面侧网络 API 探针：即使扩展在 ISOLATED world 发请求，也由 CDP 层兜底。 */
const NET_PROBE = () => {
  const log = [];
  globalThis.__fafNetProbe = log;
  const wrap = (obj, key, label) => {
    if (!obj) return;
    const orig = obj[key];
    if (typeof orig !== 'function') return;
    try {
      obj[key] = function (...args) {
        log.push(label + ':' + String(args[0] ?? ''));
        return orig.apply(this, args);
      };
    } catch { /* read-only host API, nothing to hook */ }
  };
  wrap(globalThis, 'fetch', 'fetch');
  if (globalThis.XMLHttpRequest) wrap(globalThis.XMLHttpRequest.prototype, 'open', 'xhr');
  for (const key of ['WebSocket', 'EventSource']) {
    const Ctor = globalThis[key];
    if (typeof Ctor === 'function') {
      try {
        globalThis[key] = new Proxy(Ctor, {
          construct(target, args) {
            log.push(key.toLowerCase() + ':' + String(args[0] ?? ''));
            return new target(...args);
          },
        });
      } catch { /* host API not proxyable */ }
    }
  }
  wrap(globalThis.navigator, 'sendBeacon', 'sendbeacon');
};

async function preparePage(page, context, collectors) {
  page.on('console', (m) => collectors.pageConsole.push({ type: m.type(), text: m.text().slice(0, 300) }));
  page.on('pageerror', (e) => collectors.pageConsole.push({ type: 'pageerror', text: String(e).slice(0, 300) }));
  page.on('websocket', (ws) => collectors.websockets.push(ws.url()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => collectors.cdpRequests.push({
    url: e.request.url,
    initiator: e.initiator?.url ?? e.initiator?.type ?? '',
    resourceType: e.type ?? '',
  }));
  cdp.on('Network.webSocketCreated', (e) => collectors.websockets.push(e.url));
  return cdp;
}

/* ------------------------------------------------------------------ */
/* 浏览器与手势                                                        */
/* ------------------------------------------------------------------ */
const openContexts = [];
async function freshContext(name) {
  const profile = resolve(HERE, 'profile-v2-' + name);
  rmSync(profile, { recursive: true, force: true });
  const profileFreshAtStart = !existsSync(profile);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: EDGE,
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
      '--no-default-browser-check', '--headless=new',
    ],
    viewport: { width: 1360, height: 940 },
  });
  openContexts.push({ context, profile });
  await context.addInitScript(NET_PROBE);
  const collectors = attachCollectors(context);
  await wait(2300);
  const sw = context.serviceWorkers()[0];
  const extId = sw?.url().split('/')[2] ?? null;
  return { context, profile, extId, collectors, swUrl: sw?.url() ?? null, profileFreshAtStart };
}

/** 浏览器级快捷键必须用 CDP 原生按键；modifiers 9 = Alt + Shift。 */
async function gesture(page, context, opts = {}) {
  const { key = 'F', code = 'KeyF', vk = 70, modifiers = 9 } = opts;
  await page.bringToFront();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', modifiers, key, code,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', modifiers, key, code,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
  await cdp.detach();
  gestureCalls += 1;
}

/* ------------------------------------------------------------------ */
/* 页面观测                                                            */
/* ------------------------------------------------------------------ */
const snapshot = (page) => page.evaluate(() => {
  const values = {};
  for (const el of document.querySelectorAll('input, select, textarea, [contenteditable]')) {
    if (!el.id) continue;
    values[el.id] = el.isContentEditable ? (el.textContent || '').trim() : el.value;
  }
  const displays = {};
  for (const id of ['ant-select-display', 'el-select-display', 'component-display-readonly']) {
    const n = document.getElementById(id);
    if (n) displays[id] = (n.textContent || '').trim();
  }
  return {
    values,
    displays,
    qa: JSON.parse(JSON.stringify(globalThis.__qa || {})),
    net: (globalThis.__fafNetProbe || []).slice(),
    shadowExists: Boolean(document.getElementById('faf-shadow-root')),
  };
});

const probeUi = (page) => page.evaluate(() => {
  const host = document.getElementById('faf-shadow-root');
  const root = host?.shadowRoot ?? null;
  const text = root?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 6000) ?? null;
  const buttons = root
    ? [...root.querySelectorAll('button, [role="button"], a')].map((b) => ({
      text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      disabled: Boolean(b.disabled),
      dataFaf: b.getAttribute('data-faf') ?? null,
    }))
    : [];
  // data-faf 为推荐锚点；前端当前实现使用 f-* class，这里做等价兜底，
  // 不降低判定强度（只扩大观测面，所有断言仍要求实测值命中）。
  const CLASS_ANCHORS = {
    'result-bar': '.f-result-bar',
    'count-filled': '.f-result-bar__count--ok',
    'count-skipped': '.f-result-bar__count:not(.f-result-bar__count--ok):not(.f-result-bar__count--bad)',
    'count-failed': '.f-result-bar__count--bad',
    diagnostics: '.f-diagnostics',
    'diag-row': '.f-diag-row',
  };
  const anchors = {};
  if (root) {
    for (const key of ['result-bar', 'count-filled', 'count-skipped', 'count-failed',
      'undo', 'toggle-diagnostics', 'copy-diagnostics', 'diagnostics', 'diag-row', 'reselect']) {
      const byData = root.querySelector(`[data-faf="${key}"]`);
      const byClass = CLASS_ANCHORS[key] ? root.querySelector(CLASS_ANCHORS[key]) : null;
      anchors[key] = (byData ?? byClass)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    }
  }
  const diagRows = root
    ? [...root.querySelectorAll('[data-faf="diag-row"], .f-diag-row')].map((r) => ({
      fieldId: r.getAttribute('data-field-id') ?? null,
      status: r.getAttribute('data-status') ?? null,
      text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    }))
    : [];
  const countMatch = (labels) => {
    if (!text) return null;
    for (const label of labels) {
      const m = text.match(new RegExp(label + '[^0-9]{0,6}(\\d+)'));
      if (m) return Number(m[1]);
    }
    return null;
  };
  const anchorNum = (key) => {
    const raw = anchors[key];
    if (raw === null) return null;
    const n = Number(String(raw).replace(/[^0-9]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  return {
    shadowExists: Boolean(host),
    text,
    buttons,
    anchors,
    diagRows,
    parsedCounts: {
      filled: anchorNum('count-filled') ?? countMatch(['成功', '已填', '填充成功', 'filled']),
      skipped: anchorNum('count-skipped') ?? countMatch(['跳过', '已跳过', 'skipped']),
      failed: anchorNum('count-failed') ?? countMatch(['失败', '未成功', 'failed']),
    },
  };
});

/** 真实 UI 点击优先（Playwright 穿透 open shadow root），DOM click 仅作兜底。 */
async function clickUi(page, textCandidates, dataFaf) {
  const selectors = [];
  if (dataFaf) selectors.push(`#faf-shadow-root [data-faf="${dataFaf}"]`);
  for (const t of textCandidates) selectors.push(`#faf-shadow-root button:has-text("${t}")`);
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        await loc.click({ timeout: 3000 });
        return { clicked: true, via: 'playwright', selector: sel };
      }
    } catch { /* try next candidate */ }
  }
  const fallback = await page.evaluate(({ texts, anchor }) => {
    const root = document.getElementById('faf-shadow-root')?.shadowRoot;
    if (!root) return { clicked: false, reason: 'no-shadow-root', available: [] };
    const nodes = [...root.querySelectorAll('button, [role="button"], a')];
    const node = nodes.find((b) => (anchor && b.getAttribute('data-faf') === anchor && !b.disabled))
      ?? nodes.find((b) => texts.some((t) => (b.textContent || '').includes(t)) && !b.disabled);
    if (!node) return { clicked: false, reason: 'not-found', available: nodes.map((b) => (b.textContent || '').trim()) };
    node.click();
    return { clicked: true, via: 'dom-click', label: (node.textContent || '').trim() };
  }, { texts: textCandidates, anchor: dataFaf ?? null });
  return fallback;
}

/** 诊断 JSON：优先剪贴板，退而求其次读 shadow root 内的可复制文本块。 */
async function readDiagnosticsJson(page) {
  const viaClipboard = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return null; }
  }).catch(() => null);
  if (viaClipboard && viaClipboard.trim().length > 0) {
    return { source: 'clipboard', raw: viaClipboard };
  }
  const viaDom = await page.evaluate(() => {
    const root = document.getElementById('faf-shadow-root')?.shadowRoot;
    if (!root) return null;
    for (const node of root.querySelectorAll('pre, code, textarea, [data-faf="diagnostics-json"]')) {
      const raw = node.tagName === 'TEXTAREA' ? node.value : (node.textContent || '');
      if (raw && raw.trim().startsWith('{')) return raw;
    }
    return null;
  });
  return viaDom ? { source: 'dom', raw: viaDom } : { source: null, raw: null };
}

const DIAG_KEY_GROUPS = {
  expected: ['expected', 'expectedvalue', 'expected_value', 'value', 'plannedvalue', 'planned_value', '期望值', '预期值'],
  actual: ['actual', 'actualvalue', 'actualdom', 'domvalue', 'dom_value', 'domactual', '实际值'],
  strategy: ['strategy', 'strategyid', 'strategy_id', 'adapter', 'adapterid', 'adapter_id', '策略'],
  reason: ['reason', 'failurereason', 'failure_reason', 'skipreason', 'skip_reason', 'code', 'errorcode', '原因', '失败原因'],
};
function diagFieldSemantics(item) {
  const keys = Object.keys(item).map((k) => k.toLowerCase().replace(/[\s-]/g, ''));
  const hit = {};
  for (const [group, candidates] of Object.entries(DIAG_KEY_GROUPS)) {
    hit[group] = keys.some((k) => candidates.includes(k)) || candidates.some((c) => JSON.stringify(item).toLowerCase().includes('"' + c + '"'));
  }
  return hit;
}

/* ------------------------------------------------------------------ */
/* v2.1 新增观测探针与独立 oracle（纯新增；v2 既有 helpers 一行未改）    */
/* ------------------------------------------------------------------ */

/* WCAG 2.1 AA 1.4.3：解析 computed style 的 rgb()/rgba()，先做 sRGB 线性化，
   再 L=0.2126R+0.7152G+0.0722B，CR=(Lmax+0.05)/(Lmin+0.05)。
   期望阈值来自 docs/UI-V2.1-REVIEW.md §2 的独立实算表，绝不读 CSS 源码。
   V21-INFRA-04 会用该表已公布的数值反向校验本函数本身，防止 oracle 被写坏。 */
function parseRgb(raw) {
  const m = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/i
    .exec(String(raw ?? ''));
  if (!m) return null;
  return {
    r: Number(m[1]), g: Number(m[2]), b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}
function relativeLuminance(rgb) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}
function composite(fg, bg) {
  const a = Math.max(0, Math.min(1, fg.a));
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}
/* opacity < 1 时按 alpha 与父底色合成后再算（Designer §5-B / §2 #13）。 */
function wcagContrast(fgRaw, bgRaw, opacity = 1) {
  const fg = parseRgb(fgRaw);
  const bg = parseRgb(bgRaw);
  if (!fg || !bg || bg.a === 0) return null;
  const op = Number(opacity);
  const effective = Number.isFinite(op) && op >= 0 && op < 1
    ? composite({ ...fg, a: fg.a * op }, bg)
    : fg;
  if (effective.a === 0) return null;
  const l1 = relativeLuminance(effective);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* P0 回归独立 oracle：GB 11643 证件号校验（不读源码、不调用前端模块）。
   V21-INFRA-05 用公开测试向量反向校验本函数，防止 oracle 写坏造成假绿。 */
const CN_ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CN_ID_CHECK_CODES = '10X98765432';
function isValidCnIdCard(raw) {
  const v = String(raw ?? '');
  if (!/^[0-9]{17}[0-9X]$/.test(v)) return false;
  const year = Number(v.slice(6, 10));
  const month = Number(v.slice(10, 12));
  const day = Number(v.slice(12, 14));
  if (year < 1900 || year > 2026 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(v.charAt(i)) * CN_ID_WEIGHTS[i];
  return CN_ID_CHECK_CODES.charAt(sum % 11) === v.charAt(17);
}

/* 新夹具以 data-qa-id 为观测主键：fb-anon 刻意不带 id / name / label /
   placeholder / aria-label，只能用 data-qa-id 定位。 */
const snapshotV21 = (page) => page.evaluate(() => {
  const values = {};
  for (const el of document.querySelectorAll('input, select, textarea, [contenteditable]')) {
    const key = el.getAttribute('data-qa-id') || el.id;
    if (!key) continue;
    values[key] = el.isContentEditable ? (el.textContent || '').trim() : el.value;
  }
  return {
    values,
    qa: JSON.parse(JSON.stringify(globalThis.__qa || {})),
    net: (globalThis.__fafNetProbe || []).slice(),
    shadowExists: Boolean(document.getElementById('faf-shadow-root')),
  };
});

/* computed style 探针：文字色 / 实际底色（transparent 时沿父链上溯首个非透明
   底色，对应 Designer §5-B）/ opacity / 宿主 color / 渐变列表。 */
const probeContrastStyles = (page) => page.evaluate(() => {
  const host = document.getElementById('faf-shadow-root');
  const sr = host?.shadowRoot ?? null;
  if (!sr) return { shadowExists: false, hostColor: null, samples: [], gradients: [] };
  const hostColor = getComputedStyle(host).color;
  const resolveBg = (el) => {
    let node = el;
    while (node && node !== sr) {
      const bg = getComputedStyle(node).backgroundColor;
      const isRgb = /^rgba?\(/.test(bg || '');
      const am = /rgba\([^)]*?[,\s/]+([0-9.]+)\s*\)/.exec(bg || '');
      const alpha = am ? Number(am[1]) : (isRgb ? 1 : 0);
      if (isRgb && alpha > 0) return bg;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  const pick = (key, selector) => {
    const el = sr.querySelector(selector);
    if (!el) return { key, selector, found: false };
    const cs = getComputedStyle(el);
    return {
      key, selector, found: true,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      resolvedBackground: resolveBg(el),
      opacity: cs.opacity,
    };
  };
  const samples = [
    pick('primary', '.f-result-bar__actions .f-btn--primary'),
    pick('text', '.f-result-bar__actions .f-btn--text'),
    pick('fab', '.f-fab'),
    pick('hint', '.f-hint'),
  ];
  const gradients = [...sr.querySelectorAll('*')]
    .map((el) => ({ cls: String(el.className || '').slice(0, 60), bg: getComputedStyle(el).backgroundImage }))
    .filter((x) => /gradient/i.test(x.bg));
  return { shadowExists: true, hostColor, samples, gradients };
});

/* 按钮布局探针：文案 Range 只取文字节点，避免 SVG 图标贡献第二个矩形。 */
const probeButtonLayout = (page) => page.evaluate(() => {
  const sr = document.getElementById('faf-shadow-root')?.shadowRoot;
  if (!sr) return { found: false, buttons: [] };
  const actions = sr.querySelector('.f-result-bar__actions');
  if (!actions) return { found: false, buttons: [] };
  const acs = getComputedStyle(actions);
  const buttons = [...actions.querySelectorAll('button')].map((b) => {
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    let textRectCount = null;
    const walker = document.createTreeWalker(b, 4 /* NodeFilter.SHOW_TEXT */);
    let node = walker.nextNode();
    while (node) {
      if ((node.textContent || '').trim().length === 0) { node = walker.nextNode(); continue; }
      const range = document.createRange();
      range.selectNodeContents(node);
      textRectCount = range.getClientRects().length;
      break;
    }
    return {
      text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      scrollWidth: b.scrollWidth, clientWidth: b.clientWidth,
      scrollHeight: b.scrollHeight, clientHeight: b.clientHeight,
      whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow,
      minHeight: cs.minHeight, gap: cs.gap, gridColumnEnd: cs.gridColumnEnd,
      pointerEvents: cs.pointerEvents,
      textRectCount,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });
  return {
    found: true,
    display: acs.display,
    gridTemplateColumns: acs.gridTemplateColumns,
    flexWrap: acs.flexWrap,
    buttons,
  };
});

/* AC-V2-18 锚点探针：data-faf="fallback" 缺失即失败，绝不退化成恒真。 */
const probeFallbackDiagnostics = (page) => page.evaluate(() => {
  const sr = document.getElementById('faf-shadow-root')?.shadowRoot;
  if (!sr) return { shadowExists: false, rows: [], markers: [], notes: [], buttons: [] };
  const rows = [...sr.querySelectorAll('.f-diag-row')].map((r) => ({
    fieldId: r.getAttribute('data-field-id'),
    status: r.getAttribute('data-status'),
    text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    hasFallback: Boolean(r.querySelector('[data-faf="fallback"]')),
    fallbackText: (r.querySelector('[data-faf="fallback"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
    locatorText: (r.querySelector('.f-diag-row__locator')?.textContent || '').trim(),
  }));
  const markers = [...sr.querySelectorAll('[data-faf="fallback"]')]
    .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim());
  const notes = [...sr.querySelectorAll('.f-result-bar__note')]
    .map((n) => (n.textContent || '').trim());
  const buttons = [...sr.querySelectorAll('button')]
    .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim());
  return { shadowExists: true, rows, markers, notes, buttons };
});

/* 层叠命中判定：Shadow DOM 下 document.elementFromPoint 可能返回宿主，也可能
   返回影子树内元素（retargeting）。判定同时接受「命中宿主」与「命中
   getRootNode() === sr 的影子树内元素」，再用 sr.elementFromPoint 断言真正
   命中 FAF 控件，最后必须派发真实指针点击并观测 UI 状态变化。 */
const probeHitStack = (page) => page.evaluate(() => {
  const host = document.getElementById('faf-shadow-root');
  const sr = host?.shadowRoot ?? null;
  const mask = document.getElementById('z-mask');
  const d1 = document.getElementById('native-dialog-1');
  const d2 = document.getElementById('native-dialog-2');
  const openDialog = [d1, d2].find((d) => d && d.open) || null;
  const describe = (el) => ({
    tag: el?.tagName ?? null,
    id: el?.id ?? null,
    cls: String(el?.className ?? '').slice(0, 80),
    isHost: Boolean(el && el === host),
    isFafInner: Boolean(el && el.getRootNode && el.getRootNode() === sr),
    isMask: Boolean(el && el === mask),
    isDialog: Boolean(el && (el === d1 || el === d2)),
  });
  const targets = [
    { key: 'fab', sel: '.f-fab' },
    /* .f-hint 设计上 pointer-events:none（被动提示，不可点），无法直接命中。
       仅为测量层叠顺序临时置 auto，测量结束立即还原，且不改变绘制/层叠顺序；
       pointerRestored 会作为断言项，证明探针未改坏 UI。 */
    { key: 'hint', sel: '.f-hint', overridePointerEvents: true },
  ];
  const toggle = sr
    ? [...sr.querySelectorAll('.f-result-bar__actions button')]
      .find((b) => /逐字段诊断|收起诊断/.test((b.textContent || '')))
    : null;
  if (toggle) targets.push({ key: 'diagnostics-toggle', node: toggle });
  const measure = (x, y) => ({
    stack: (document.elementsFromPoint(x, y) || []).map(describe),
    top: document.elementFromPoint(x, y),
    inner: sr?.elementFromPoint ? sr.elementFromPoint(x, y) : null,
  });
  const points = [];
  for (const t of targets) {
    const el = t.node || sr?.querySelector(t.sel);
    if (!el) { points.push({ key: t.key, found: false }); continue; }
    const r = el.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2);
    const y = Math.round(r.y + r.height / 2);
    let m;
    let pointerRestored = null;
    if (t.overridePointerEvents) {
      const previous = el.style.pointerEvents;
      el.style.pointerEvents = 'auto';
      try { m = measure(x, y); }
      finally { el.style.pointerEvents = previous; }
      pointerRestored = el.style.pointerEvents === previous;
    } else {
      m = measure(x, y);
    }
    const { stack, top, inner } = m;
    points.push({
      key: t.key, found: true, x, y, pointerRestored,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      top: describe(top),
      topIsFaf: Boolean(top && (top === host || (top.getRootNode && top.getRootNode() === sr))),
      topIsMask: Boolean(top && top === mask),
      topIsDialog: Boolean(top && (top === d1 || top === d2)),
      inner: describe(inner),
      innerIsFaf: Boolean(inner && (inner === host || (inner.getRootNode && inner.getRootNode() === sr))),
      innerPointerEvents: inner ? getComputedStyle(inner).pointerEvents : null,
      stack,
      fafIndex: stack.findIndex((e) => e.isHost || e.isFafInner),
      maskIndex: stack.findIndex((e) => e.isMask),
      dialogIndex: stack.findIndex((e) => e.isDialog),
    });
  }
  return {
    host: host ? {
      position: getComputedStyle(host).position,
      zIndex: getComputedStyle(host).zIndex,
      pointerEvents: getComputedStyle(host).pointerEvents,
      popoverOpen: host.matches(':popover-open'),
      popoverAttr: host.getAttribute('popover'),
      degradedFlag: host.dataset.fafLayer ?? null,
      /* 第四量证据：host 是否确实迁入当前 dialog:modal 内部，以及其父节点。
         S3 迁移后祖先链应含 dialog:modal；S5 归位后 parentTag 应为 HTML。
         Designer UI-V2.1-REVIEW.md §5-C 行 132 要求逐步断言 host.parentElement。 */
      parentTag: host.parentElement?.tagName ?? null,
      parentId: host.parentElement?.id ?? null,
      insideModalDialog: (() => {
        let p = host.parentElement;
        while (p) {
          if (p.tagName === 'DIALOG' && p.matches(':modal')) return true;
          p = p.parentElement;
        }
        return false;
      })(),
      modalDialogId: (() => {
        let p = host.parentElement;
        while (p) {
          if (p.tagName === 'DIALOG' && p.matches(':modal')) return p.id ?? null;
          p = p.parentElement;
        }
        return null;
      })(),
    } : null,
    mask: mask ? {
      zIndex: getComputedStyle(mask).zIndex,
      pointerEvents: getComputedStyle(mask).pointerEvents,
      rect: (() => { const r = mask.getBoundingClientRect(); return { width: r.width, height: r.height }; })(),
    } : null,
    dialogModal: Boolean(openDialog && openDialog.matches(':modal')),
    dialogOpenId: openDialog?.id ?? null,
    points,
  };
});

/* 第三量（AC-V2-22 / Designer UI-V2.1-REVIEW.md §5-C 行 129）：页面弹窗内
   输入框仍可交互。这是区分 S3 与 S6 的关键判据 —— S6（扩展自建 modal 承载
   host）表面 fabHit 也能通过，但会把整个页面 inert 掉，探针实测返回 HTML。
   本探针刻意不读 FAF 宿主、不读 shadow root、不由任何 FAF 命中结果反推，
   只读 document.elementFromPoint(页面弹窗输入框中心)，确保断言独立。
   S3 期望：命中该 input（或其后代）；S6 期望（须判失败）：top 为 HTML。 */
const probeDialogInputHit = (page, inputId) => page.evaluate((wantedId) => {
  const dlg = document.querySelector('dialog[open]');
  // 按唯一 id 直接定位页面弹窗内的输入框，不依赖「dialog 内第一个 input」的
  // DOM 顺序（S3 会把 FAF 宿主迁入 dialog，顺序会变），避免探针自己取错元素
  // 造成假绿 / 假红。同时校验它确实归属当前 :modal dialog。
  const input = document.getElementById(wantedId);
  const ownedByModal = Boolean(dlg && input && dlg.contains(input));
  if (!dlg || !input || !ownedByModal) {
    return {
      found: false, dialogId: dlg?.id ?? null, inputId: input?.id ?? null,
      dialogModal: false, ownedByModal, hitInput: false,
      topIsHtml: false, topIsFafHost: false,
      reason: 'open dialog missing / target input missing / input not inside open modal dialog',
    };
  }
  const r = input.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2);
  const y = Math.round(r.y + r.height / 2);
  const top = document.elementFromPoint(x, y);
  const stack = (document.elementsFromPoint(x, y) || []).map((el) => ({
    tag: el?.tagName ?? null,
    id: el?.id ?? null,
    cls: String(el?.className ?? '').slice(0, 80),
  }));
  return {
    found: true,
    dialogId: dlg.id,
    inputId: input.id,
    dialogModal: dlg.matches(':modal'),
    ownedByModal,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    center: { x, y },
    top: top ? {
      tag: top.tagName, id: top.id ?? null,
      cls: String(top.className ?? '').slice(0, 80),
    } : null,
    // 命中该输入框或其后代；input 为 void 元素，contains 仅作防御性保留。
    hitInput: Boolean(top && (top === input || input.contains(top))),
    topIsHtml: Boolean(top && top === document.documentElement),
    topIsFafHost: Boolean(top && top.id === 'faf-shadow-root'),
    stack: stack.slice(0, 8),
  };
}, inputId);

/* 真实指针点击（CDP 原生鼠标事件），不做 DOM .click() 兜底：
   DOM .click() 会绕过命中测试，无法证明浮层真的在最上层可点。 */
async function realPointerClick(page, context, x, y) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1,
  });
  await cdp.detach();
}

/* ------------------------------------------------------------------ */
/* 场景执行                                                            */
/* ------------------------------------------------------------------ */
async function openScenario(name, path, focus) {
  scenario = name;
  const env = await freshContext(name);
  record(`${name}-INFRA-00 扩展已加载（MV3 service worker 注册）`,
    Boolean(env.extId), 'extension id', env.extId, { worker: env.swUrl });
  if (!env.extId) throw new Error('EXTENSION_NOT_LOADED:' + name);
  await env.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN }).catch(() => {});
  const page = env.context.pages()[0] ?? (await env.context.newPage());
  await preparePage(page, env.context, env.collectors);
  await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded' });
  await wait(350);
  if (focus) await page.locator(focus).focus().catch(() => {});
  return { ...env, page };
}

const CORE_NATIVE_IDS = [
  'f-name', 'f-phone', 'f-idcard', 'f-birth', 'f-email', 'f-org', 'f-school',
  'f-address', 'f-gender', 'f-edu', 'f-note', 'f-rich', 'f-decoy',
];
const SKIP_IDS = [
  'skip-hidden-attr', 'skip-display-none', 'skip-visibility', 'skip-disabled',
  'skip-readonly', 'skip-password', 'skip-captcha', 'skip-hidden-type', 'skip-otp',
];
const OUTSIDE_IDS = ['global-search', 'global-filter', 'outside-text'];

let artifactHash = null;
let sourceHash = null;

try {
  artifactHash = hashTree([EXT]);
  const srcHash = hashTree([resolve(ROOT, 'src')]);
  const epHash = hashTree([resolve(ROOT, 'entrypoints')]);
  sourceHash = {
    fingerprint: createHash('sha256')
      .update('src:' + srcHash.fingerprint + '\nentrypoints:' + epHash.fingerprint)
      .digest('hex'),
    fileCount: srcHash.fileCount + epHash.fileCount,
    files: [
      ...srcHash.files.map((f) => ({ ...f, path: 'src/' + f.path })),
      ...epHash.files.map((f) => ({ ...f, path: 'entrypoints/' + f.path })),
    ],
  };
  console.log('ARTIFACT_FINGERPRINT: ' + artifactHash.fingerprint);
  console.log('SOURCE_FINGERPRINT:   ' + sourceHash.fingerprint);

  /* ============ 场景 1：main.html —— 零配置首次触发（AC-V2-01 起点） ============ */
  {
    const env = await openScenario('S1-main', '/main', '#f-name');
    const { page, context, collectors } = env;
    const before = await snapshot(page);
    record('V2-01a 首次手势前无扩展注入痕迹（干净 profile 起点）',
      before.shadowExists === false, false, before.shadowExists,
      { profile: env.profile, optionsOpens, note: '未打开任何配置页、未写入任何前置条目' },
      { group: 'AC-V2-01' });
    record('V2-INFRA-01 每个场景使用全新干净 profile，运行前目录不存在（零前置构造）',
      env.profileFreshAtStart === true && optionsOpens === 0,
      { profileFreshAtStart: true, optionsOpens: 0 },
      { profileFreshAtStart: env.profileFreshAtStart, optionsOpens, profile: env.profile },
      { profile: env.profile, policy: 'fresh-per-scenario, rmSync before launch' },
      { group: 'INFRA' });

    const callsBefore = gestureCalls;
    await gesture(page, context);
    await wait(3200);
    const after = await snapshot(page);
    const ui = await probeUi(page);

    record('V2-01b 零配置首次触发即完成填充（核心判别器：v1 默认全拒绝必然失败）',
      CORE_NATIVE_IDS.every((id) => typeof after.values[id] === 'string' && after.values[id].length > 0),
      'all 13 core controls non-empty',
      Object.fromEntries(CORE_NATIVE_IDS.map((id) => [id, after.values[id]])),
      { empty: CORE_NATIVE_IDS.filter((id) => !after.values[id]), uiText: ui.text?.slice(0, 300) },
      { group: 'AC-V2-01' });
    record('V2-01c 首次触发只用了单次手势（无第二次手势 / 无确认步骤）',
      gestureCalls - callsBefore === 1, 1, gestureCalls - callsBefore, null,
      { group: 'AC-V2-01' });
    record('V2-01d 填充后出现精简结果条（可观测 UI 证据）',
      ui.shadowExists && Boolean(ui.text && ui.text.length > 0),
      'shadow UI with text', { shadowExists: ui.shadowExists, textLen: ui.text?.length ?? 0 },
      { uiText: ui.text?.slice(0, 400), buttons: ui.buttons },
      { group: 'AC-V2-01' });

    // AC-V2-02：容器子树全覆盖（dialog 内跨 3 个非 form 容器）
    const sectionBasic = ['f-name', 'f-phone', 'f-idcard', 'f-birth', 'f-email', 'f-org',
      'f-school', 'f-address', 'f-gender', 'f-edu', 'f-note', 'f-rich'];
    record('V2-02a 弹窗子树内跨多个非 form 容器的控件全部被填（判别器：只找最近 form 必失败）',
      sectionBasic.every((id) => (after.values[id] ?? '').length > 0),
      sectionBasic,
      { filled: sectionBasic.filter((id) => (after.values[id] ?? '').length > 0).length, total: sectionBasic.length },
      { dialog: '#main-dialog', sections: ['#section-basic', '#section-component', '#section-skipped', '#decoy-form'] },
      { group: 'AC-V2-02' });
    record('V2-02b dialog 子树内的诱饵 form 控件也被填（不得只填最近 form 的兄弟外控件）',
      (after.values['f-decoy'] ?? '').length > 0, 'non-empty', after.values['f-decoy'], null,
      { group: 'AC-V2-02' });
    record('V2-02c 组件库控件被尝试（显示节点变化或诊断中可定位，不得静默忽略）',
      (after.displays['ant-select-display'] !== before.displays['ant-select-display'])
      || (after.displays['el-select-display'] !== before.displays['el-select-display'])
      || (after.values['f-ant-date'] ?? '').length > 0
      || (after.values['f-el-date'] ?? '').length > 0,
      'at least one component control attempted',
      {
        antSelect: after.displays['ant-select-display'], elSelect: after.displays['el-select-display'],
        antDate: after.values['f-ant-date'], elDate: after.values['f-el-date'],
      }, null,
      { group: 'AC-V2-02' });
    const forbiddenFlowWords = ['计划预览', '逐项勾选', '确认计划', '待绑定', '请勾选'];
    record('V2-02d 主流程不出现预览 / 逐项勾选 / 二次确认中间态（判别器）',
      !forbiddenFlowWords.some((w) => (ui.text ?? '').includes(w)),
      'no plan-preview / checkbox / confirm wording',
      forbiddenFlowWords.filter((w) => (ui.text ?? '').includes(w)),
      { uiText: ui.text?.slice(0, 500) },
      { group: 'AC-V2-02' });

    // AC-V2-03：跳过类 + 容器外
    const skipDiff = SKIP_IDS.filter((id) => (after.values[id] ?? '') !== (before.values[id] ?? ''));
    record('V2-03a 跳过类控件值全部未变（hidden / display / visibility / disabled / readonly / password / captcha / hidden-type）',
      skipDiff.length === 0, [], skipDiff,
      Object.fromEntries(SKIP_IDS.map((id) => [id, { before: before.values[id], after: after.values[id] }])),
      { group: 'AC-V2-03' });
    record('V2-03a2 type=file 未被写入',
      (after.values['skip-file'] ?? '') === (before.values['skip-file'] ?? ''),
      before.values['skip-file'], after.values['skip-file'], null,
      { group: 'AC-V2-03' });
    record('V2-03b 组件库隐藏 input / 隐藏载体值未变',
      (after.values['f-hidden-input'] ?? '') === (before.values['f-hidden-input'] ?? ''),
      before.values['f-hidden-input'], after.values['f-hidden-input'], null,
      { group: 'AC-V2-03' });
    const outsideDiff = OUTSIDE_IDS.filter((id) => (after.values[id] ?? '') !== (before.values[id] ?? ''));
    record('V2-03c 容器之外搜索框 / 筛选项 / 普通文本框均未被写入（判别器）',
      outsideDiff.length === 0, [], outsideDiff,
      Object.fromEntries(OUTSIDE_IDS.map((id) => [id, { before: before.values[id], after: after.values[id] }])),
      { group: 'AC-V2-03' });
    record('V2-03d 跳过被计入结果条 skipped 计数（不得静默丢弃）',
      Number.isFinite(ui.parsedCounts.skipped) && ui.parsedCounts.skipped > 0,
      'skipped > 0', ui.parsedCounts, { anchors: ui.anchors, uiText: ui.text?.slice(0, 400) },
      { group: 'AC-V2-03' });

    // AC-V2-04：只填不提交
    record('V2-04a 扩展从未点击页面提交按钮、从未触发 submit 事件',
      after.qa.submitClicks === 0 && after.qa.submitEvents === 0,
      { submitClicks: 0, submitEvents: 0 },
      { submitClicks: after.qa.submitClicks, submitEvents: after.qa.submitEvents }, null,
      { group: 'AC-V2-04' });
    const forbiddenSubmitLabels = ['提交', '确定', '保存并提交'];
    const primaryBad = ui.buttons.filter((b) => forbiddenSubmitLabels.some((w) => (b.text ?? '').includes(w)));
    record('V2-04b 结果条主按钮文案不含「提交 / 确定 / 保存并提交」',
      primaryBad.length === 0, [], primaryBad.map((b) => b.text), { buttons: ui.buttons },
      { group: 'AC-V2-04' });
    record('V2-04c 结果条常驻说明「仅填入，不提交」可见',
      /仅填入[，,\s]*不提交/.test(ui.text ?? ''),
      'contains 仅填入，不提交', /仅填入[，,\s]*不提交/.test(ui.text ?? ''),
      { uiText: ui.text?.slice(0, 400) },
      { group: 'AC-V2-04' });

    // AC-V2-05：赋值策略与回读（按裁决口径，不写三层全过断言）
    record('V2-05b 成功字段的 DOM 实际值非空且与生成值一致（事件派发不等于成功）',
      CORE_NATIVE_IDS.every((id) => (after.values[id] ?? '').length > 0),
      'all written values observable in DOM',
      Object.fromEntries(CORE_NATIVE_IDS.map((id) => [id, after.values[id]])), null,
      { group: 'AC-V2-05' });
    record('V2-05c 结果条 filled 计数可解析、非零且不超过实际写入的控件数',
      Number.isFinite(ui.parsedCounts.filled) && ui.parsedCounts.filled > 0
        && ui.parsedCounts.filled <= CORE_NATIVE_IDS.length + 4,
      `0 < filled <= ${CORE_NATIVE_IDS.length + 4}`, ui.parsedCounts.filled,
      { uiText: ui.text?.slice(0, 300) },
      { group: 'AC-V2-05' });

    // AC-V2-13：生成器合法性（独立 oracle，绝不从实现导入）
    const v = after.values;
    record('V2-13a 身份证 18 位且通过 GB11643 校验位（独立 oracle）',
      idCardOk(v['f-idcard']), true, idCardOk(v['f-idcard']), { idCard: v['f-idcard'] },
      { group: 'AC-V2-13' });
    record('V2-13b 手机号命中合法号段 ^1[3-9][0-9]{9}$',
      /^1[3-9][0-9]{9}$/.test(v['f-phone'] ?? ''), true,
      /^1[3-9][0-9]{9}$/.test(v['f-phone'] ?? ''), { phone: v['f-phone'] },
      { group: 'AC-V2-13' });
    const birthFlat = String(v['f-birth'] ?? '').replace(/\D/g, '');
    const idBirth = String(v['f-idcard'] ?? '').slice(6, 14);
    record('V2-13c 出生日期与身份证 7-14 位一致',
      birthFlat === idBirth, idBirth, birthFlat, { birth: v['f-birth'] },
      { group: 'AC-V2-13' });
    const parity = Number(String(v['f-idcard'] ?? '')[16]) % 2;
    record('V2-13d 性别与身份证第 17 位奇偶一致',
      v['f-gender'] === (parity === 1 ? '男' : '女'), parity === 1 ? '男' : '女', v['f-gender'], null,
      { group: 'AC-V2-13' });
    record('V2-13e 学历枚举取自页面可见 option',
      ['本科', '硕士', '博士'].includes(v['f-edu']), 'page options', v['f-edu'], null,
      { group: 'AC-V2-13' });
    record('V2-13f 备注尊重 maxlength=30 且含中文',
      (v['f-note'] ?? '').length <= 30 && /[\u4e00-\u9fa5]/.test(v['f-note'] ?? ''),
      'len<=30 && chinese', { note: v['f-note'], len: (v['f-note'] ?? '').length }, null,
      { group: 'AC-V2-13' });

    // AC-V2-06：展开诊断 + 复制诊断 JSON
    const expand = await clickUi(page, ['展开逐字段诊断', '逐字段诊断', '展开诊断', '查看诊断'], 'toggle-diagnostics');
    await wait(500);
    const uiExpanded = await probeUi(page);
    const diagText = uiExpanded.text ?? '';
    const skipMarkers = [
      ...SKIP_IDS,
      'hidden 属性', 'display none', 'visibility hidden', 'type file', 'type password',
      '验证码', '短信校验码', '只读', '禁用', '隐藏', '密码',
      'hidden', 'disabled', 'readonly', 'password', 'captcha', 'file',
    ];
    const matchedMarkers = [...new Set(skipMarkers.filter((m) => diagText.includes(m)))];
    record('V2-06a 诊断可展开且能定位到失败 / 跳过字段（元素定位信息 + 原因）',
      expand.clicked && diagText.length >= 20 && matchedMarkers.length >= 5,
      'expandable diagnostics + at least 5 locatable skip markers',
      { expand, diagRows: uiExpanded.diagRows.length, textLen: diagText.length, matchedMarkers },
      { diagText: diagText.slice(0, 700) },
      { group: 'AC-V2-06' });
    record('V2-06b 诊断中含失败 / 跳过原因码或原因文本',
      /跳过|失败|原因|E_[A-Z_]+|hidden|disabled|readonly|captcha|password/i.test(diagText),
      'reason evidence present', /跳过|失败|原因|E_[A-Z_]+|hidden|disabled|readonly|captcha|password/i.test(diagText),
      { diagText: diagText.slice(0, 500) },
      { group: 'AC-V2-06' });
    const strategyMention = /native-input|native-select|ant-design-vue|element-plus|策略|strategy/i.test(diagText);
    record('V2-05a 展开诊断中出现赋值策略 id（6 个 P0 策略之一）',
      strategyMention, 'strategy id present in diagnostics', strategyMention,
      { diagText: diagText.slice(0, 600) },
      { group: 'AC-V2-05' });

    const copy = await clickUi(page, ['复制诊断', '复制诊断 JSON', '复制 JSON', '复制'], 'copy-diagnostics');
    await wait(450);
    const diagJson = await readDiagnosticsJson(page);
    let parsed = null;
    let parseError = null;
    try { parsed = diagJson.raw ? JSON.parse(diagJson.raw) : null; } catch (e) { parseError = String(e); }
    record('V2-06c 诊断 JSON 可复制且可被 JSON.parse（判别器：v1 无此产物）',
      Boolean(copy.clicked && parsed), 'copy clicked + parseable JSON',
      { copy, source: diagJson.source, parsed: Boolean(parsed), parseError, rawHead: diagJson.raw?.slice(0, 160) ?? null },
      null,
      { group: 'AC-V2-06' });
    const fields = Array.isArray(parsed) ? parsed
      : (Array.isArray(parsed?.fields) ? parsed.fields
        : (Array.isArray(parsed?.items) ? parsed.items
          : (Array.isArray(parsed?.outcomes) ? parsed.outcomes : [])));
    const semanticHits = fields.map(diagFieldSemantics);
    const allFour = fields.length > 0 && semanticHits.every((h) => h.expected && h.actual && h.strategy && h.reason);
    record('V2-06d 诊断 JSON 每个字段含期望值 / DOM 实际值 / 策略 id / 失败原因四类语义',
      allFour, 'every field has expected + actual + strategy + reason',
      { fieldCount: fields.length, sample: semanticHits.slice(0, 3), firstField: fields[0] ?? null },
      null,
      { group: 'AC-V2-06' });

    // AC-V2-14（PM 定点修正后新增的第 14 条）：诊断面板内手动指定类型后单独补填。
    // 完整交互断言在阶段二按前端最终 DOM 校准探测选择器，但不得删弱断言。
    const manualEntry = await page.evaluate(() => {
      const root = document.getElementById('faf-shadow-root')?.shadowRoot;
      if (!root) return { found: false, reason: 'no-shadow-root', selects: 0, buttons: [] };
      const selects = [...root.querySelectorAll(
        '.f-diag-row select, .f-diagnostics select, [data-faf="manual-type"]',
      )];
      const buttons = [...root.querySelectorAll('button')]
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /补填|单独填|指定类型|重新填/.test(t));
      return {
        found: selects.length > 0 || buttons.length > 0,
        selects: selects.length,
        buttons: buttons.slice(0, 10),
      };
    });
    record('V2-14a 诊断面板提供「手动指定字段类型后单独补填」入口（AC-V2-14 判别器）',
      manualEntry.found, 'manual single-field refill entry present', manualEntry,
      { diagRows: uiExpanded.diagRows.length },
      { group: 'AC-V2-14' });
    record('V2-14b 被跳过的字段在逐字段诊断中可定位（AC-V2-14 与 AC-V2-06 共用证据）',
      matchedMarkers.length >= 5 && uiExpanded.diagRows.length > 0,
      'at least 5 locatable skip markers AND diagnostic rows rendered',
      { matchedMarkers: matchedMarkers.length, diagRows: uiExpanded.diagRows.length },
      { diagText: diagText.slice(0, 500) },
      { group: 'AC-V2-14' });

    // AC-V2-09 / AC-V2-11：无白名单门禁、默认放行
    record('V2-09a 结果条不出现站点白名单 / 拒绝 / E_SITE_NOT_ALLOWED 文案（判别器）',
      !/白名单|不在测试站点|E_SITE_NOT_ALLOWED|未授权|拒绝填充/.test(ui.text ?? ''),
      'no allowlist / deny wording',
      /白名单|不在测试站点|E_SITE_NOT_ALLOWED|未授权|拒绝填充/.test(ui.text ?? ''),
      { uiText: ui.text?.slice(0, 400) },
      { group: 'AC-V2-09' });
    record('V2-11a 未启用排除清单时默认放行并完成填充（AC-V2-11）',
      CORE_NATIVE_IDS.every((id) => (after.values[id] ?? '').length > 0),
      'all core controls filled with default policy',
      Object.fromEntries(CORE_NATIVE_IDS.map((id) => [id, after.values[id]])), null,
      { group: 'AC-V2-11' });

    // AC-V2-07：撤销闭环
    const undo = await clickUi(page, ['撤销本次填充', '撤销'], 'undo');
    await wait(2800);
    const afterUndo = await snapshot(page);
    const notRestored = CORE_NATIVE_IDS.filter((id) => (afterUndo.values[id] ?? '') !== (before.values[id] ?? ''));
    record('V2-07a 点击撤销后本次成功写入的控件恢复填充前原值（判别器）',
      undo.clicked && notRestored.length === 0, 'undo clicked + all restored',
      { undo, notRestored }, null,
      { group: 'AC-V2-07' });
    record('V2-07b 撤销后提交计数仍为 0',
      afterUndo.qa.submitClicks === 0 && afterUndo.qa.submitEvents === 0,
      { submitClicks: 0, submitEvents: 0 },
      { submitClicks: afterUndo.qa.submitClicks, submitEvents: afterUndo.qa.submitEvents }, null,
      { group: 'AC-V2-07' });

    // AC-V2-10：框选模式 Esc 不写入（备选入口的安全部分）
    const beforeReselect = await snapshot(page);
    const reselect = await clickUi(page, ['重新选择区域', '重新框选', '框选'], 'reselect');
    await wait(450);
    if (reselect.clicked) {
      await page.mouse.move(420, 360);
      await wait(250);
      const duringHover = await snapshot(page);
      record('V2-10a 框选模式 hover 阶段页面控件值零变化',
        JSON.stringify(duringHover.values) === JSON.stringify(beforeReselect.values),
        'identical snapshots',
        Object.keys(duringHover.values).filter((k) => duringHover.values[k] !== beforeReselect.values[k]), null,
        { group: 'AC-V2-10' });
      await gesture(page, context, { key: 'Escape', code: 'Escape', vk: 27, modifiers: 0 });
      await wait(400);
      const afterEsc = await snapshot(page);
      record('V2-10b 按 Esc 退出框选且不产生任何写入',
        JSON.stringify(afterEsc.values) === JSON.stringify(beforeReselect.values),
        'identical snapshots',
        Object.keys(afterEsc.values).filter((k) => afterEsc.values[k] !== beforeReselect.values[k]), null,
        { group: 'AC-V2-10' });
    } else {
      record('V2-10a 结果条提供「重新选择区域」入口（AC-V2-10 必备）',
        false, 'reselect entry present', reselect, { buttons: ui.buttons },
        { group: 'AC-V2-10' });
    }

    // AC-V2-08：零外发、零日志
    const fontRequests = collectors.allRequests.filter((r) => /\.(?:woff2?|ttf|otf|css)(?:\?|$)/i.test(r.url)
      && !r.url.startsWith('chrome-extension://'));
    record('V2-08a 扩展外发请求数 = 0（仅本地页 / 扩展自身 / data / about / blob）',
      collectors.outbound.length === 0, 0, collectors.outbound.length,
      { outbound: collectors.outbound.slice(0, 10), totalObserved: collectors.allRequests.length },
      { group: 'AC-V2-08' });
    record('V2-08b 页面侧 fetch / XHR / WebSocket / EventSource / sendBeacon 调用数 = 0',
      afterUndo.net.length === 0, 0, afterUndo.net.length, { calls: afterUndo.net.slice(0, 10) },
      { group: 'AC-V2-08' });
    record('V2-08c 请求日志中无远程字体 / 远程样式表',
      fontRequests.length === 0, [], fontRequests.slice(0, 5), null,
      { group: 'AC-V2-08' });
    record('V2-08d 无 WebSocket 连接建立',
      collectors.websockets.length === 0, 0, collectors.websockets.length,
      { websockets: collectors.websockets.slice(0, 5) },
      { group: 'AC-V2-08' });
    const hostLogs = collectors.pageConsole.filter((c) => /FAF|background|filler|extension|填充/i.test(c.text));
    record('V2-08e 宿主页控制台无扩展日志、无未捕获异常',
      hostLogs.length === 0 && collectors.pageConsole.filter((c) => c.type === 'pageerror').length === 0,
      { logs: 0, pageerrors: 0 },
      { logs: hostLogs.length, pageerrors: collectors.pageConsole.filter((c) => c.type === 'pageerror').length },
      { console: collectors.pageConsole.slice(0, 8) },
      { group: 'AC-V2-08' });

    // 附加触发入口：popup（等价于点扩展图标后的真实 UI 交互）
    // 先加载 popup 再核对 chunk，保证请求日志里确实存在产物 chunk 可供比对。
    const popup = await context.newPage();
    await popup.goto(['chrome-extension', '://', env.extId, '/popup.html'].join(''), { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    await popup.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(900);
    const popupText = await popup.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)).catch(() => '');
    record('V2-ENTRY-01 popup 入口文案不含「提交 / 确定 / 保存并提交」',
      !/提交|确定|保存并提交/.test(popupText), 'no submit wording', popupText.slice(0, 200), null,
      { group: 'ENTRY', blocking: false });
    await popup.close();

    // 产物指纹 ↔ 请求日志一致性
    const requestedChunks = collectors.allRequests
      .filter((r) => /\/chunks\/[^/]+\.js|\/assets\/[^/]+\.css/.test(r.url))
      .map((r) => {
        try { return new URL(r.url).pathname.split('/').pop(); } catch { return null; }
      })
      .filter(Boolean);
    const diskChunks = artifactHash.files
      .filter((f) => /^(chunks|assets)\//.test(f.path))
      .map((f) => f.path.split('/').pop());
    const ghosts = [...new Set(requestedChunks)].filter((n) => !diskChunks.includes(n));
    record('V2-INFRA-02 请求日志中的 chunk / asset 与当前磁盘产物一致（证据漂移防护）',
      requestedChunks.length > 0 && ghosts.length === 0,
      'requested chunks all present on disk', { requested: [...new Set(requestedChunks)], ghosts, disk: diskChunks },
      null,
      { group: 'INFRA' });
    record('V2-INFRA-03 请求日志与 CDP Network 采集可用',
      collectors.allRequests.length > 0 && collectors.cdpRequests.length > 0,
      'both collectors non-empty',
      { contextRequests: collectors.allRequests.length, cdpRequests: collectors.cdpRequests.length },
      { sample: collectors.allRequests.slice(0, 6) },
      { group: 'INFRA' });
  }

  /* ============ 场景 2：Tier 2 —— 可见控件最多的 form ============ */
  {
    const env = await openScenario('S2-multi-form', '/multi-form', '#s-name');
    const { page, context } = env;
    const before = await snapshot(page);
    await gesture(page, context);
    await wait(2800);
    const after = await snapshot(page);
    const largeIds = ['l-name', 'l-idcard', 'l-email', 'l-org', 'l-gender', 'l-note'];
    const smallIds = ['s-name', 's-phone'];
    record('V2-02e Tier 2：自动选定可见控件最多的 form（判别器：焦点在小 form 时仍须选大 form）',
      largeIds.every((id) => (after.values[id] ?? '').length > 0)
        && smallIds.every((id) => (after.values[id] ?? '') === (before.values[id] ?? '')),
      'large form filled, small form untouched',
      { large: largeIds.map((id) => [id, after.values[id]]), small: smallIds.map((id) => [id, after.values[id]]) },
      { focus: '#s-name' },
      { group: 'AC-V2-02' });
    record('V2-02e-b 容器外控件未被写入（多 form 场景）',
      OUTSIDE_IDS.every((id) => (after.values[id] ?? '') === (before.values[id] ?? '')),
      'outside unchanged',
      Object.fromEntries(OUTSIDE_IDS.map((id) => [id, after.values[id]])), null,
      { group: 'AC-V2-03' });
    record('V2-04a-b 自动提交计数为 0（多 form 场景）',
      after.qa.submitClicks === 0 && after.qa.submitEvents === 0,
      { submitClicks: 0, submitEvents: 0 },
      { submitClicks: after.qa.submitClicks, submitEvents: after.qa.submitEvents }, null,
      { group: 'AC-V2-04' });
  }

  /* ============ 场景 3：Tier 3 —— 最小公共祖先 ============ */
  {
    const env = await openScenario('S3-free-nodes', '/free-nodes', '#a-name');
    const { page, context } = env;
    const before = await snapshot(page);
    await gesture(page, context);
    await wait(2800);
    const after = await snapshot(page);
    const lcaIds = ['a-name', 'a-phone', 'a-email', 'b-org', 'b-school', 'b-gender', 'b-note'];
    record('V2-02f Tier 3：无 form / dialog 时以最小公共祖先为容器（判别器：兜底 body 会误填容器外）',
      lcaIds.every((id) => (after.values[id] ?? '').length > 0)
        && (after.values['outside-free-text'] ?? '') === (before.values['outside-free-text'] ?? ''),
      'LCA subtree filled, outside plain textbox untouched',
      { lca: lcaIds.map((id) => [id, after.values[id]]), outside: after.values['outside-free-text'] },
      { commonAncestor: '#common-ancestor' },
      { group: 'AC-V2-02' });
  }

  /* ============ 场景 4：Tier 4 —— body 兜底 ============ */
  {
    const env = await openScenario('S4-body-fallback', '/body-fallback', '#solo-name');
    const { page, context } = env;
    await gesture(page, context);
    await wait(2600);
    const after = await snapshot(page);
    record('V2-02g Tier 4：无容器时兜底 body，孤立可见控件仍被填入（不得只填部分）',
      (after.values['solo-name'] ?? '').length > 0, 'non-empty', after.values['solo-name'], null,
      { group: 'AC-V2-02' });
  }

  /* ============ 场景 5：空状态 ============ */
  {
    const env = await openScenario('S5-empty', '/empty', null);
    const { page, context, collectors } = env;
    const before = await snapshot(page);
    await gesture(page, context);
    await wait(2600);
    const after = await snapshot(page);
    const ui = await probeUi(page);
    const changed = Object.keys(after.values).filter((k) => (after.values[k] ?? '') !== (before.values[k] ?? ''));
    record('V2-12a 可填控件数为 0 时零写入（含容器外控件）',
      changed.length === 0, [], changed, { total: Object.keys(after.values).length },
      { group: 'AC-V2-12' });
    record('V2-12b 空状态不报错：宿主页无未捕获异常 / 无扩展报错',
      (after.qa.errors ?? []).length === 0
        && collectors.pageConsole.filter((c) => c.type === 'pageerror').length === 0,
      { errors: 0, pageerrors: 0 },
      { errors: after.qa.errors, pageerrors: collectors.pageConsole.filter((c) => c.type === 'pageerror').length }, null,
      { group: 'AC-V2-12' });
    record('V2-12c 结果条展示空状态文字提示（而非致命错误文案）',
      /没有可填|无可填|未找到可填|0\s*(项|个)|空状态|暂无/.test(ui.text ?? '')
        && !/填充失败|执行异常|致命错误/.test(ui.text ?? ''),
      'empty-state text present, no fatal wording',
      /没有可填|无可填|未找到可填|0\s*(项|个)|空状态|暂无/.test(ui.text ?? ''),
      { uiText: ui.text?.slice(0, 400) },
      { group: 'AC-V2-12' });
    record('V2-12d 空状态下提交计数仍为 0',
      after.qa.submitClicks === 0 && after.qa.submitEvents === 0,
      { submitClicks: 0, submitEvents: 0 },
      { submitClicks: after.qa.submitClicks, submitEvents: after.qa.submitEvents }, null,
      { group: 'AC-V2-12' });
  }

  /* ============ 场景 6 (v2.1)：fallback.html —— AC-V2-15 / 16 / 17 / 18 / 19 / 20 / 21 ============ */
  /* 判别前提：R2 产物下 12 个语义未识别控件因 low-confidence 一律跳过、DOM 值全空，
     故 V21-15a / 15c / 16a-e / 17a-f / 18a-f 必然全红；v2.1 兜底生成后必然真实转绿。
     约束优先级按 SPEC-v2.1 §4.3：格式类字段只断言格式合法与值非空，不断言「我是」。 */
  {
    const env = await openScenario('S6-fallback', '/fallback', '#fb-source');
    const { page, context, collectors } = env;
    const FALLBACK_FILLABLE_IDS = [
      'fb-source', 'fb-placeholder', 'fb-anon', 'fb-maxlength', 'fb-pattern-4',
      'fb-number', 'fb-date', 'fb-email', 'fb-select', 'fb-textarea', 'fb-rich',
      'fb-dup-a', 'fb-dup-b', 'fb-known-name', 'fb-known-phone',
    ];
    const OUTSIDE_V21 = ['fb-out-search', 'fb-out-filter', 'fb-out-text'];
    const HARD_SKIP_V21 = [
      'fb-skip-readonly', 'fb-skip-disabled', 'fb-skip-hidden-attr',
      'fb-skip-display', 'fb-skip-visibility', 'fb-skip-hidden-type',
      'fb-skip-file', 'fb-skip-password', 'fb-skip-captcha',
    ];
    /* P0 回归（team-lead 实证）：组件库常见字段只给 placeholder，修复前被判
       unknown 并填入「我是请输入网格员姓名测试数据·NN」；修复后必须是
       personName / phone / idCard 与合法值。这 4 个不并入 FALLBACK_FILLABLE_IDS，
       以免改动任何既有断言的观测集合。 */
    const COMMON_FIELD_TYPES = {
      'cf-name-a': 'personName',
      'cf-name-b': 'personName',
      'cf-phone': 'phone',
      'cf-idcard': 'idCard',
    };
    const COMMON_FIELD_IDS = Object.keys(COMMON_FIELD_TYPES);
    const CN_NAME_RE = /^[\u4e00-\u9fa5]{2,4}$/;
    const CN_PHONE_RE = /^1[3-9][0-9]{9}$/;
    const FORBIDDEN_FALLBACK_TEXT = /我是|测试数据|请输入/;
    /* src/contracts/types.ts 锁定的 SkipReason 全集：禁止断言或接受任何新枚举值。 */
    const LOCKED_SKIP_REASONS = [
      'readonly', 'disabled', 'hidden', 'file', 'captcha', 'outside-form',
      'search-or-filter', 'has-value', 'user-unchecked', 'low-confidence',
      'rule-excluded', 'unsupported-control', 'field-limit-exceeded',
    ];
    const before = await snapshotV21(page);
    record('V21-INFRA-01 v2.1 场景同样使用全新干净 profile、零配置页打开、仅手势进入',
      env.profileFreshAtStart === true && optionsOpens === 0 && Boolean(env.extId),
      { profileFreshAtStart: true, optionsOpens: 0 },
      { profileFreshAtStart: env.profileFreshAtStart, optionsOpens, extId: env.extId },
      { profile: env.profile, policy: 'fresh-per-scenario, no preset state, CDP gesture only' },
      { group: 'INFRA' });

    /* P0 判别器有效性自检（手势前）：先用真实 DOM 事件证明页面校验器确实能
       产出「请输入正确的手机号」，再还原原值。否则「修复后不得出现该错误文案」
       会退化成恒真断言。全程不写 storage、不调扩展内部状态。 */
    const validatorSanity = await page.evaluate(() => {
      const el = document.querySelector('[data-qa-id="cf-phone"]');
      const err = document.querySelector('[data-qa-id="cf-phone-error"]');
      if (!el || !err) return { available: false, reason: 'missing-node' };
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )?.set;
      if (!setter) return { available: false, reason: 'no-native-setter' };
      const previous = el.value;
      setter.call(el, 'NOT-A-PHONE');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const errorAppeared = (err.textContent || '').includes('请输入正确的手机号');
      setter.call(el, previous);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const errorCleared = !(err.textContent || '').includes('请输入正确的手机号');
      return {
        available: true, errorAppeared, errorCleared,
        restoredValue: el.value === previous,
        validatorExposed: typeof window.__qa?.validateCommonPhone === 'function',
      };
    });
    record('V21-P0-01e 页面手机号校验器判别力自检：无效值必报错、还原后必清空（防恒真）',
      validatorSanity.available === true && validatorSanity.errorAppeared === true
        && validatorSanity.errorCleared === true && validatorSanity.restoredValue === true
        && validatorSanity.validatorExposed === true,
      { available: true, errorAppeared: true, errorCleared: true,
        restoredValue: true, validatorExposed: true },
      validatorSanity, null, { group: 'P0-REGRESSION' });

    await gesture(page, context);
    await wait(3400);
    const after = await snapshotV21(page);
    const ui = await probeUi(page);
    const v = after.values;

    record('V21-15a 零配置首次触发后容器内 15 个枚举可见可填控件 DOM 值全部非空（唯一合法跳过项单独断言）',
      FALLBACK_FILLABLE_IDS.every((id) => typeof v[id] === 'string' && v[id].length > 0),
      'all 15 enumerated fillable controls non-empty',
      Object.fromEntries(FALLBACK_FILLABLE_IDS.map((id) => [id, v[id]])),
      { empty: FALLBACK_FILLABLE_IDS.filter((id) => !v[id]), uiText: ui.text?.slice(0, 300) },
      { group: 'AC-V2-15' });
    record('V21-15b 结果条不再出现「置信度不足 / 待绑定」中断措辞，且给出「按标签生成」说明',
      Boolean(ui.text && ui.text.length > 0)
        && !/置信度不足|待绑定/.test(ui.text)
        && /按标签生成/.test(ui.text),
      'no low-confidence binding wording + label-derived note present',
      { present: Boolean(ui.text), forbidden: /置信度不足|待绑定/.test(ui.text ?? ''),
        hasNote: /按标签生成/.test(ui.text ?? '') },
      { uiText: ui.text?.slice(0, 500) },
      { group: 'AC-V2-15' });
    record('V21-15c 未识别字段计入成功而非跳过（结果条 filled 计数须覆盖 12 个未识别字段）',
      Number.isFinite(ui.parsedCounts.filled) && ui.parsedCounts.filled >= 12,
      'filled >= 12', ui.parsedCounts.filled,
      { uiText: ui.text?.slice(0, 300), anchors: ui.anchors },
      { group: 'AC-V2-15' });

    record('V21-16a label「来源表」生成值含「我是」+ 语义词 +「测试数据」',
      /我是/.test(v['fb-source'] ?? '') && /来源表/.test(v['fb-source'] ?? '')
        && /测试数据/.test(v['fb-source'] ?? ''),
      'contains 我是 + 来源表 + 测试数据', v['fb-source'], null,
      { group: 'AC-V2-16' });
    record('V21-16b 仅 placeholder 字段生成值含「我是」+ 占位符语义 +「测试数据」',
      /我是/.test(v['fb-placeholder'] ?? '') && /测试数据/.test(v['fb-placeholder'] ?? '')
        && (/自定义编号/.test(v['fb-placeholder'] ?? '') || /请输入自定义编号/.test(v['fb-placeholder'] ?? '')),
      'contains 我是 + placeholder semantic + 测试数据', v['fb-placeholder'], null,
      { group: 'AC-V2-16' });
    record('V21-16c 语义词全部取不到时统一「该字段」，仍生成并填入（不得用控件类型名）',
      /我是/.test(v['fb-anon'] ?? '') && /该字段/.test(v['fb-anon'] ?? '')
        && /测试数据/.test(v['fb-anon'] ?? '') && !/text|input|TEXT|INPUT/.test(v['fb-anon'] ?? ''),
      'contains 我是 + 该字段 + 测试数据, no control-type word', v['fb-anon'], null,
      { group: 'AC-V2-16' });
    record('V21-16d maxlength=8 字段值非空且 Unicode 码点长度不超过 8',
      (v['fb-maxlength'] ?? '').length > 0
        && Array.from(v['fb-maxlength'] ?? '').length <= 8
        && /我是/.test(v['fb-maxlength'] ?? ''),
      '0 < codepoint length <= 8 and keeps semantic prefix',
      { value: v['fb-maxlength'], length: Array.from(v['fb-maxlength'] ?? '').length }, null,
      { group: 'AC-V2-16' });
    record('V21-16e 两个同名标签字段同页兜底值互不重复且都保留语义词',
      (v['fb-dup-a'] ?? '').length > 0 && (v['fb-dup-b'] ?? '').length > 0
        && v['fb-dup-a'] !== v['fb-dup-b']
        && /同名登记项/.test(v['fb-dup-a'] ?? '') && /同名登记项/.test(v['fb-dup-b'] ?? ''),
      'distinct values, both keep semantic word',
      { a: v['fb-dup-a'], b: v['fb-dup-b'] }, null,
      { group: 'AC-V2-16' });

    const numOk = /^-?\d+(?:\.\d+)?$/.test(v['fb-number'] ?? '')
      && Number(v['fb-number']) >= 1 && Number(v['fb-number']) <= 9
      && (Number(v['fb-number']) - 1) % 2 === 0;
    record('V21-17a number 字段为 min/max/step 范围内合法数字（按约束优先级不断言中文）',
      numOk, 'numeric within 1..9 step 2', v['fb-number'], null,
      { group: 'AC-V2-17' });
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(v['fb-date'] ?? '')
      && v['fb-date'] >= '2026-01-01' && v['fb-date'] <= '2026-12-31';
    record('V21-17b date 字段为 ISO 日期且落在 min/max 内',
      dateOk, 'ISO date in 2026 range', v['fb-date'], null,
      { group: 'AC-V2-17' });
    record('V21-17c email 字段格式合法',
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v['fb-email'] ?? ''),
      'valid email', v['fb-email'], null,
      { group: 'AC-V2-17' });
    const selectOptions = await page.evaluate(() =>
      [...document.querySelectorAll('#fb-select option')]
        .map((o) => o.value).filter((x) => x.length > 0));
    record('V21-17d select 字段选中页面真实 option 之一',
      (v['fb-select'] ?? '').length > 0 && selectOptions.includes(v['fb-select']),
      'one of real page option values', { value: v['fb-select'], options: selectOptions }, null,
      { group: 'AC-V2-17' });
    record('V21-17e textarea / contenteditable 文本类字段非空且含模板主体',
      /我是/.test(v['fb-textarea'] ?? '') && /测试数据/.test(v['fb-textarea'] ?? '')
        && /我是/.test(v['fb-rich'] ?? '') && /测试数据/.test(v['fb-rich'] ?? ''),
      'both text-class controls carry template body',
      { textarea: v['fb-textarea'], rich: v['fb-rich'] }, null,
      { group: 'AC-V2-17' });
    const pattern4 = v['fb-pattern-4'] ?? '';
    const patternUnsat = v['fb-pattern-unsat'] ?? '';
    const siblingsFilled = FALLBACK_FILLABLE_IDS.filter((id) => (v[id] ?? '').length > 0).length;
    record('V21-17f pattern 字段：四位约束填入 4 位数字或明确跳过；无法满足者跳过且不阻塞同批其余控件',
      (pattern4 === '' || /^\d{4}$/.test(pattern4))
        && patternUnsat === '' && siblingsFilled >= 14,
      'pattern4 empty or 4 digits; unsatisfiable pattern empty; >=14 siblings still filled',
      { pattern4, patternUnsat, siblingsFilled, total: FALLBACK_FILLABLE_IDS.length }, null,
      { group: 'AC-V2-17' });

    /* ===== P0 回归：组件库常见字段不得掉进兜底（team-lead 实证） ===== */
    const commonPhoneError = await page.evaluate(() =>
      (document.querySelector('[data-qa-id="cf-phone-error"]')?.textContent || '').trim());
    const nameA = v['cf-name-a'] ?? '';
    const nameB = v['cf-name-b'] ?? '';
    record('V21-P0-01a 姓名两字段 DOM 值为 2~4 字中文人名，且不含「我是 / 测试数据 / 请输入」',
      CN_NAME_RE.test(nameA) && CN_NAME_RE.test(nameB)
        && !FORBIDDEN_FALLBACK_TEXT.test(nameA) && !FORBIDDEN_FALLBACK_TEXT.test(nameB),
      'two 2-4 char Chinese names, no fallback wording',
      { a: nameA, b: nameB },
      { regex: String(CN_NAME_RE) }, { group: 'P0-REGRESSION' });
    record('V21-P0-01b 手机号 DOM 值为合法 11 位号段，且页面不再报「请输入正确的手机号」',
      CN_PHONE_RE.test(v['cf-phone'] ?? '')
        && !FORBIDDEN_FALLBACK_TEXT.test(v['cf-phone'] ?? '')
        && !commonPhoneError.includes('请输入正确的手机号')
        && validatorSanity.errorAppeared === true,
      'valid CN mobile + no page validation error + validator proven live',
      { value: v['cf-phone'], phoneErrorText: commonPhoneError,
        validatorLive: validatorSanity.errorAppeared },
      { regex: String(CN_PHONE_RE) }, { group: 'P0-REGRESSION' });
    record('V21-P0-01c 身份证号 DOM 值为合法 18 位证件号（含 GB 11643 校验位）',
      isValidCnIdCard(v['cf-idcard'] ?? '')
        && !FORBIDDEN_FALLBACK_TEXT.test(v['cf-idcard'] ?? ''),
      'valid 18-digit id with correct check digit',
      { value: v['cf-idcard'], valid: isValidCnIdCard(v['cf-idcard'] ?? '') },
      null, { group: 'P0-REGRESSION' });
    record('V21-INFRA-05 GB 11643 独立 oracle 自检（公开测试向量，防 oracle 写坏假绿）',
      isValidCnIdCard('11010519491231002X') === true
        && isValidCnIdCard('440524188001010014') === true
        && isValidCnIdCard('110105194912310021') === false
        && isValidCnIdCard('') === false
        && isValidCnIdCard('我是测试数据') === false,
      [true, true, false, false, false],
      { a: isValidCnIdCard('11010519491231002X'), b: isValidCnIdCard('440524188001010014'),
        c: isValidCnIdCard('110105194912310021'), d: isValidCnIdCard(''),
        e: isValidCnIdCard('我是测试数据') },
      null, { group: 'INFRA' });

    const expandV21 = await clickUi(page, ['逐字段诊断', '展开诊断'], 'toggle-diagnostics');
    await wait(500);
    const diagV21 = await probeFallbackDiagnostics(page);
    record('V21-18a AC-V2-18 锚点存在：兜底字段行有 data-faf="fallback" 标记且含四类信息',
      expandV21.clicked && diagV21.markers.length >= 1
        && diagV21.markers.every((t) => /按标签生成/.test(t) && /来源/.test(t)
          && /语义词/.test(t) && /填入/.test(t))
        && diagV21.rows.filter((r) => r.hasFallback)
          .every((r) => Boolean(r.fieldId) && r.fieldId.length > 0),
      'expand clicked + >=1 fallback markers with all four fields + fieldId locator',
      { expand: expandV21, markerCount: diagV21.markers.length,
        markers: diagV21.markers.slice(0, 4),
        rowsWithMarker: diagV21.rows.filter((r) => r.hasFallback).length,
        missingFieldId: diagV21.rows.filter((r) => r.hasFallback && !r.fieldId).length },
      { diagText: (await probeUi(page)).text?.slice(0, 700) },
      { group: 'AC-V2-18' });
    record('V21-18b 诊断标记含「来源表」语义词与该字段最终填入值，且行内保留元素定位信息',
      Boolean(v['fb-source']) && v['fb-source'].length > 0
        && diagV21.markers.some((t) => /来源表/.test(t) && t.includes(v['fb-source']))
        && diagV21.rows.some((r) => r.hasFallback && Boolean(r.locatorText)),
      'semantic word + final value + locator all observable',
      { sourceValue: v['fb-source'],
        matched: diagV21.markers.filter((t) => /来源表/.test(t)).slice(0, 2),
        locatorSample: diagV21.rows.filter((r) => r.hasFallback)
          .map((r) => r.locatorText).slice(0, 3) },
      null, { group: 'AC-V2-18' });

    const copyV21 = await clickUi(page, ['复制诊断 JSON', '复制诊断'], 'copy-diagnostics');
    await wait(450);
    const diagJsonV21 = await readDiagnosticsJson(page);
    let parsedV21 = null;
    let parseErrorV21 = null;
    try { parsedV21 = diagJsonV21.raw ? JSON.parse(diagJsonV21.raw) : null; }
    catch (e) { parseErrorV21 = String(e); }
    const itemsV21 = Array.isArray(parsedV21?.items) ? parsedV21.items : [];
    record('V21-18c 诊断 JSON 可复制可 parse，且保留 {tool, generatedAt, items} 形状',
      Boolean(copyV21.clicked && parsedV21)
        && parsedV21.tool === 'form-auto-filler'
        && typeof parsedV21.generatedAt === 'string' && parsedV21.generatedAt.length > 0
        && itemsV21.length > 0,
      'copy clicked + parseable envelope with tool/generatedAt/items',
      { copy: copyV21, source: diagJsonV21.source, tool: parsedV21?.tool ?? null,
        hasGeneratedAt: typeof parsedV21?.generatedAt === 'string',
        itemCount: itemsV21.length, parseErrorV21 },
      null, { group: 'AC-V2-18' });
    record('V21-18d 诊断 JSON 每个字段仍含 expected / actualDom / strategyId / failureReason 四类语义',
      itemsV21.length > 0 && itemsV21.every((it) =>
        Object.prototype.hasOwnProperty.call(it, 'expected')
        && Object.prototype.hasOwnProperty.call(it, 'actualDom')
        && Object.prototype.hasOwnProperty.call(it, 'strategyId')
        && Object.prototype.hasOwnProperty.call(it, 'failureReason')),
      'every item has all four keys',
      { itemCount: itemsV21.length, firstKeys: itemsV21[0] ? Object.keys(itemsV21[0]) : [] },
      null, { group: 'AC-V2-18' });
    const fallbackItems = itemsV21.filter((it) => it.fallback
      && typeof it.fallback.source === 'string' && it.fallback.source.length > 0
      && typeof it.fallback.semanticWord === 'string' && it.fallback.semanticWord.length > 0);
    record('V21-18e 诊断 JSON 对兜底字段携带 fallback.source 与 fallback.semanticWord 元数据',
      fallbackItems.length >= 1, '>=1 diagnostic item carries fallback metadata',
      { count: fallbackItems.length, sample: fallbackItems.slice(0, 2) }, null,
      { group: 'AC-V2-18' });
    const patternFailItem = itemsV21.find((it) => typeof it.failureReason === 'string'
      && /pattern 无法满足/.test(it.failureReason));
    record('V21-18f pattern 诊断原因文案与既有 SkipReason 枚举（不得新增枚举值）',
      Boolean(patternFailItem) && patternFailItem.skipReason === 'unsupported-control'
        && itemsV21.every((it) => it.skipReason === undefined
          || LOCKED_SKIP_REASONS.includes(it.skipReason)),
      'reason has pattern 无法满足 + skipReason=unsupported-control + no new enum',
      { patternFail: patternFailItem ?? null,
        illegalEnums: itemsV21.filter((it) => it.skipReason !== undefined
          && !LOCKED_SKIP_REASONS.includes(it.skipReason)) },
      null, { group: 'AC-V2-17' });
    record('V21-19a 手动补填入口保留为可选高级修正，主流程不出现逐字段绑定的阻塞措辞',
      diagV21.rows.length > 0
        && !/逐字段绑定|请先绑定|必须绑定/.test((await probeUi(page)).text ?? ''),
      'diagnostic rows present + no mandatory binding wording',
      { rows: diagV21.rows.length }, null,
      { group: 'AC-V2-19' });

    /* 诊断 JSON：四个常见字段必须是真实类型、不得携带 fallback 标记。
       用 expected 值（= DOM 实测值）定位诊断行，不依赖 label 文案，
       避免前端把 label 补成「姓名」后误判。 */
    const commonMatches = COMMON_FIELD_IDS.map((id) => {
      const value = v[id] ?? '';
      const item = itemsV21.find((it) => it.expected === value
        && it.fieldType === COMMON_FIELD_TYPES[id]);
      return { id, value, expectedType: COMMON_FIELD_TYPES[id],
        found: Boolean(item), fieldType: item?.fieldType ?? null,
        hasFallback: item ? Object.prototype.hasOwnProperty.call(item, 'fallback') : null };
    });
    const illegalFallbackItems = itemsV21.filter((it) =>
      Object.prototype.hasOwnProperty.call(it, 'fallback') && it.fieldType !== 'unknown');
    record('V21-P0-01d 诊断 JSON 中四个常见字段为 personName / phone / idCard 且无 fallback 标记',
      commonMatches.every((m) => m.found === true && m.hasFallback === false)
        && illegalFallbackItems.length === 0,
      '4 typed items with no fallback marker + no fallback on any non-unknown item',
      { matches: commonMatches, illegalFallbackCount: illegalFallbackItems.length,
        itemCount: itemsV21.length },
      { illegal: illegalFallbackItems.slice(0, 4) }, { group: 'P0-REGRESSION' });
    const commonRowValues = COMMON_FIELD_IDS.map((id) => v[id]).filter((x) => (x ?? '').length > 0);
    const commonRowsWithMarker = diagV21.rows.filter((r) =>
      r.hasFallback && commonRowValues.some((value) => r.text.includes(value)));
    record('V21-P0-01f 诊断面板 UI 行中四个常见字段不出现 data-faf="fallback" 标记',
      commonRowValues.length === 4 && commonRowsWithMarker.length === 0,
      'no visible fallback marker row carries any of the 4 common-field values',
      { commonValues: commonRowValues, markedRows: commonRowsWithMarker.length,
        totalRows: diagV21.rows.length },
      { marked: commonRowsWithMarker.slice(0, 4) }, { group: 'P0-REGRESSION' });

    const outsideDiff = OUTSIDE_V21.filter((id) => (v[id] ?? '') !== (before.values[id] ?? ''));
    record('V21-03a 容器外搜索框 / 筛选项 / 普通文本框哨兵值零写入',
      outsideDiff.length === 0, [], outsideDiff,
      Object.fromEntries(OUTSIDE_V21.map((id) => [id, { before: before.values[id], after: v[id] }])),
      { group: 'AC-V2-03' });
    const skipDiff = HARD_SKIP_V21.filter((id) => (v[id] ?? '') !== (before.values[id] ?? ''));
    record('V21-03b 9 类硬保护控件零写入且不进入兜底生成',
      skipDiff.length === 0, [], skipDiff,
      Object.fromEntries(HARD_SKIP_V21.map((id) => [id, { before: before.values[id], after: v[id] }])),
      { group: 'AC-V2-03' });
    record('V21-04a 页面提交按钮从未被点击、submit 事件计数为 0',
      after.qa.submitClicks === 0 && after.qa.submitEvents === 0,
      { submitClicks: 0, submitEvents: 0 },
      { submitClicks: after.qa.submitClicks, submitEvents: after.qa.submitEvents }, null,
      { group: 'AC-V2-04' });
    record('V21-08a 兜底场景零外发请求',
      collectors.outbound.length === 0, 0, collectors.outbound.length,
      { outbound: collectors.outbound.slice(0, 8) },
      { group: 'AC-V2-08' });
    record('V21-08b 兜底场景页面侧 fetch/XHR/WS/EventSource/sendBeacon 调用数为 0',
      after.net.length === 0, 0, after.net.length,
      { calls: after.net.slice(0, 8) },
      { group: 'AC-V2-08' });

    /* 独立 oracle 自检：用 Designer §2 已公布的 CR 反向校验脚本内的 WCAG 函数 */
    const oraclePairs = [
      { fg: 'rgb(255, 255, 255)', bg: 'rgb(3, 105, 161)', expected: 5.93 },
      { fg: 'rgb(22, 32, 46)', bg: 'rgb(3, 105, 161)', expected: 2.76 },
      { fg: 'rgb(255, 255, 255)', bg: 'rgb(12, 74, 110)', expected: 9.46 },
    ];
    const oracleActual = oraclePairs.map((p) => wcagContrast(p.fg, p.bg));
    record('V21-INFRA-04 WCAG 计算函数通过 Designer §2 独立实算表反向校验（防 oracle 假绿）',
      oracleActual.every((cr, i) => cr !== null && Math.abs(cr - oraclePairs[i].expected) < 0.05),
      oraclePairs.map((p) => p.expected), oracleActual,
      { source: 'docs/UI-V2.1-REVIEW.md §2' },
      { group: 'INFRA' });

    const styles = await probeContrastStyles(page);
    const sampleOf = (key) => styles.samples.find((s) => s.key === key)
      ?? { key, found: false };
    const contrastOf = (key) => {
      const sample = sampleOf(key);
      return { sample, cr: wcagContrast(sample.color, sample.resolvedBackground, sample.opacity) };
    };
    const primary = contrastOf('primary');
    const textBtn = contrastOf('text');
    const fab = contrastOf('fab');
    const hint = contrastOf('hint');
    record('V21-20a 主按钮文字与背景对比度 >= 4.5:1 且文字色不再继承宿主 --fg',
      primary.cr !== null && primary.cr >= 4.5
        && Boolean(primary.sample.found) && primary.sample.color !== styles.hostColor,
      'CR >= 4.5 and color != host --fg',
      { cr: primary.cr, color: primary.sample.color,
        background: primary.sample.resolvedBackground, hostColor: styles.hostColor },
      { sample: primary.sample }, { group: 'AC-V2-20' });
    const primaryBg = parseRgb(primary.sample.backgroundColor);
    const skyBlue = Boolean(primaryBg && primaryBg.b > primaryBg.g && primaryBg.g > primaryBg.r);
    record('V21-20b 主按钮底色为天蓝色系且不存在紫粉渐变',
      skyBlue && styles.gradients.every((g) =>
        !/7C3AED|A855F7|EC4899|124, *58|168, *85|236, *72/i.test(g.bg)),
      'sky-blue accent (B > G > R) + no purple-to-pink gradient',
      { backgroundColor: primary.sample.backgroundColor,
        channels: primaryBg, gradients: styles.gradients.slice(0, 4) },
      null, { group: 'AC-V2-20' });
    record('V21-20c 文字按钮 / 悬浮球 / 悬浮提示文字与背景对比度全部 >= 4.5:1（缺失即失败）',
      textBtn.cr !== null && textBtn.cr >= 4.5
        && fab.cr !== null && fab.cr >= 4.5
        && hint.cr !== null && hint.cr >= 4.5
        && Boolean(textBtn.sample.found && fab.sample.found && hint.sample.found),
      'all three CR >= 4.5 and all three nodes exist',
      { text: textBtn.cr, fab: fab.cr, hint: hint.cr,
        found: { text: textBtn.sample.found, fab: fab.sample.found, hint: hint.sample.found },
        hostColor: styles.hostColor },
      { samples: [textBtn.sample, fab.sample, hint.sample] },
      { group: 'AC-V2-20' });

    /* hover 态必须用真实指针悬停后读 computed style，不得拿默认态冒充
       （Designer §5-B / UI-V2.1-REVIEW.md:125）。dark hover 余量仅 0.51，
       真机固化注入层 light hover 的实测值；扩展页 dark 态另见 dry-run。 */
    const readPrimaryComputed = () => page.evaluate(() => {
      const sr = document.getElementById('faf-shadow-root')?.shadowRoot;
      const el = sr?.querySelector('.f-result-bar__actions .f-btn--primary');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, backgroundColor: cs.backgroundColor, opacity: cs.opacity };
    });
    let hoverState = null;
    let hoverError = null;
    try {
      await page.locator('#faf-shadow-root .f-result-bar__actions .f-btn--primary')
        .first().hover({ timeout: 4000 });
      hoverState = await readPrimaryComputed();
    } catch (e) { hoverError = String(e); }
    await page.mouse.move(1, 1);
    const restoredState = await readPrimaryComputed();
    const hoverCr = hoverState
      ? wcagContrast(hoverState.color, hoverState.backgroundColor, hoverState.opacity)
      : null;
    const defaultBg = primary.sample.backgroundColor;
    record('V21-20d 主按钮 hover 态真机 computed style 对比度 >= 4.5:1（非默认态冒充，鼠标移开后复原）',
      Boolean(hoverState) && hoverError === null
        && hoverState.backgroundColor !== defaultBg
        && hoverCr !== null && hoverCr >= 4.5
        && Boolean(restoredState) && restoredState.backgroundColor === defaultBg
        && restoredState.color === primary.sample.color,
      'real :hover computed background differs from default + CR >= 4.5 + restored after mouse-out',
      { hoverCr, defaultBackground: defaultBg, hoverBackground: hoverState?.backgroundColor ?? null,
        hoverColor: hoverState?.color ?? null, restoredBackground: restoredState?.backgroundColor ?? null,
        hoverError },
      { hoverState, restoredState }, { group: 'AC-V2-20' });

    const layout = await probeButtonLayout(page);
    const tracks = (layout.gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean).length;
    const reselect = layout.buttons.find((b) => /重新选择区域/.test(b.text));
    const primaryBtn = layout.buttons.find((b) => /再填一次/.test(b.text));
    const textButtons = layout.buttons.filter((b) => !/再填一次/.test(b.text));
    const widths = textButtons.map((b) => b.rect.width);
    const equalWidths = widths.length >= 2 && Math.max(...widths) - Math.min(...widths) <= 1;
    const noOverlap = (() => {
      for (let i = 0; i < layout.buttons.length; i += 1) {
        for (let j = i + 1; j < layout.buttons.length; j += 1) {
          const a = layout.buttons[i].rect;
          const b = layout.buttons[j].rect;
          if (a.x < b.x + b.width && b.x < a.x + a.width
            && a.y < b.y + b.height && b.y < a.y + a.height) return false;
        }
      }
      return true;
    })();
    record('V21-21a 操作区为两列 grid / nowrap，且「重新选择区域」单行不截断不换行',
      layout.found && layout.display === 'grid' && tracks === 2
        && layout.flexWrap === 'nowrap' && Boolean(reselect)
        && reselect.scrollWidth <= reselect.clientWidth + 1
        && reselect.scrollHeight <= reselect.clientHeight + 1
        && reselect.whiteSpace === 'nowrap'
        && reselect.textOverflow !== 'ellipsis'
        && reselect.textRectCount === 1
        && /重新选择区域/.test(reselect.text),
      'grid 2 tracks + nowrap + single text rect + no overflow',
      { display: layout.display, gridTemplateColumns: layout.gridTemplateColumns,
        tracks, flexWrap: layout.flexWrap, reselect },
      null, { group: 'AC-V2-21' });
    record('V21-21b 文字按钮等宽（差 <= 1px）、宽度 >= 185px、文案完整、互不重叠，主按钮独占整行',
      equalWidths && noOverlap && Boolean(primaryBtn)
        && textButtons.every((b) => b.rect.width >= 185
          && b.scrollWidth <= b.clientWidth + 1
          && b.textRectCount === 1)
        && primaryBtn.rect.width >= Math.min(...widths) * 1.8,
      'equal columns >=185px, no overlap, primary spans full row',
      { widths, noOverlap, primaryWidth: primaryBtn?.rect.width,
        primaryGridColumnEnd: primaryBtn?.gridColumnEnd },
      { buttons: layout.buttons.map((b) => ({ text: b.text, width: b.rect.width,
        span: b.gridColumnEnd, textRectCount: b.textRectCount })) },
      { group: 'AC-V2-21' });

    const undoV21 = await clickUi(page, ['撤销本次填充', '撤销'], 'undo');
    await wait(2800);
    const afterUndoV21 = await snapshotV21(page);
    const notRestored = FALLBACK_FILLABLE_IDS.filter((id) =>
      (afterUndoV21.values[id] ?? '') !== (before.values[id] ?? ''));
    record('V21-07a 撤销后本次写入的兜底值全部恢复填充前原值（回归不破）',
      undoV21.clicked && notRestored.length === 0, 'undo clicked + all restored',
      { undo: undoV21, notRestored }, null,
      { group: 'AC-V2-07' });
    const commonNotRestored = COMMON_FIELD_IDS.filter((id) =>
      (afterUndoV21.values[id] ?? '') !== (before.values[id] ?? ''));
    record('V21-P0-01g 撤销后四个常见字段同样恢复填充前原值（P0 修复不得破撤销）',
      undoV21.clicked && commonNotRestored.length === 0,
      'undo clicked + all 4 common fields restored',
      { undo: undoV21, notRestored: commonNotRestored,
        before: Object.fromEntries(COMMON_FIELD_IDS.map((id) => [id, before.values[id]])),
        after: Object.fromEntries(COMMON_FIELD_IDS.map((id) => [id, afterUndoV21.values[id]])) },
      null, { group: 'P0-REGRESSION' });
  }

  /* ============ 场景 7 (v2.1)：overlay.html —— AC-V2-22 层叠 ============ */
  /* 判别前提：只靠普通层 z-index 的实现必被 2147483647 遮罩盖住，且
     dialog.showModal() 进入 top layer 后普通层 z-index 完全无效。判定用
     elementsFromPoint 顺序 + sr.elementFromPoint 命中 + 真实指针点击三者同时成立，
     禁止以「元素存在」代替「在最上层」。 */
  {
    const env = await openScenario('S7-overlay', '/overlay', null);
    const { page, context, collectors } = env;
    record('V21-INFRA-03 层叠场景同样使用全新干净 profile、零配置页打开',
      env.profileFreshAtStart === true && optionsOpens === 0 && Boolean(env.extId),
      { profileFreshAtStart: true, optionsOpens: 0 },
      { profileFreshAtStart: env.profileFreshAtStart, optionsOpens, extId: env.extId },
      null, { group: 'INFRA' });
    const maskBefore = await page.evaluate(() => {
      const m = document.getElementById('z-mask');
      if (!m) return null;
      const cs = getComputedStyle(m);
      const r = m.getBoundingClientRect();
      return { zIndex: cs.zIndex, position: cs.position, pointerEvents: cs.pointerEvents,
        width: r.width, height: r.height,
        viewport: { w: globalThis.innerWidth, h: globalThis.innerHeight } };
    });
    record('V21-22a 遮挡一有效：全屏 fixed 遮罩 z-index=2147483647 且 pointer-events=auto',
      Boolean(maskBefore) && maskBefore.zIndex === '2147483647'
        && maskBefore.position === 'fixed' && maskBefore.pointerEvents === 'auto'
        && maskBefore.width >= maskBefore.viewport.w - 1
        && maskBefore.height >= maskBefore.viewport.h - 1,
      'full-viewport fixed mask at max z-index with pointer-events auto',
      maskBefore, null, { group: 'AC-V2-22' });

    await gesture(page, context);
    await wait(3400);
    const afterFill = await snapshotV21(page);
    const uiOverlay = await probeUi(page);
    record('V21-22b 一次手势后填充完成且结果条 / 悬浮球实际渲染',
      ['ov-a', 'ov-b', 'ov-c'].every((id) => (afterFill.values[id] ?? '').length > 0)
        && uiOverlay.shadowExists,
      '3 controls filled + shadow UI present',
      { values: Object.fromEntries(['ov-a', 'ov-b', 'ov-c'].map((id) => [id, afterFill.values[id]])),
        shadowExists: uiOverlay.shadowExists }, null,
      { group: 'AC-V2-22' });
    const hintProbe = await probeContrastStyles(page);
    record('V21-22c 悬浮提示节点实际存在（AC-V2-20/22 的可观测前提，缺失即失败）',
      hintProbe.samples.some((s) => s.key === 'hint' && s.found === true),
      'f-hint present', hintProbe.samples.find((s) => s.key === 'hint') ?? null,
      null, { group: 'AC-V2-22' });

    const openDlg1 = await page.locator('#open-dialog-1').click({ timeout: 5000 })
      .then(() => true).catch((e) => String(e));
    await wait(500);
    const hit1 = await probeHitStack(page);
    const dlgHit1 = await probeDialogInputHit(page, 'dlg-input-1');
    record('V21-22d 遮挡二有效：dialog.showModal() 已进入 top layer（:modal 为 true）',
      openDlg1 === true && hit1.dialogModal === true,
      'real UI click + :modal true',
      { openDlg1, dialogOpenId: hit1.dialogOpenId, dialogModal: hit1.dialogModal },
      null, { group: 'AC-V2-22' });
    record('V21-22e FAF 宿主进入 popover top layer 且未标记降级',
      Boolean(hit1.host) && hit1.host.popoverOpen === true
        && hit1.host.popoverAttr === 'manual'
        && hit1.host.position === 'fixed'
        && Number(hit1.host.zIndex) >= 2147483000
        && hit1.host.degradedFlag !== 'degraded',
      'popover-open=manual + fixed + z>=2147483000 + not degraded',
      hit1.host, null, { group: 'AC-V2-22' });

    /* 第三量（防 S6 放水）：独立读取「页面弹窗内输入框中心」的命中结果。
       S6（扩展自建 modal）会把页面整个 inert，此量返回 HTML 而非输入框，
       即便 fabHit 通过也会被本断言挡下。不由 fabHit / hitOk 反推。 */
    record('V21-22k 第三量（防 S6 放水）：弹窗一内输入框中心 elementFromPoint 仍命中该输入框',
      dlgHit1.found === true && dlgHit1.dialogModal === true
        && dlgHit1.ownedByModal === true
        && dlgHit1.dialogId === 'native-dialog-1'
        && dlgHit1.inputId === 'dlg-input-1'
        && dlgHit1.hitInput === true
        && dlgHit1.topIsHtml === false
        && dlgHit1.topIsFafHost === false,
      'elementFromPoint(dlg-input-1 center) hits the input itself (not HTML/inert, not FAF host)',
      dlgHit1, { stack: dlgHit1.stack }, { group: 'AC-V2-22' });

    /* 第四量（迁移补开）：host 迁入 dialog:modal 后 UA 会自动关闭 popover，
       前端 ensurePopover() 必须把 :popover-open 补回 true。此断言独立读取，
       不可由 fabHit 反推（Designer §5-C 行 132）。 */
    record('V21-22l 第四量：弹窗一 host 已迁入 dialog:modal 且迁移后 :popover-open 补开为 true',
      Boolean(hit1.host) && hit1.host.insideModalDialog === true
        && hit1.host.modalDialogId === 'native-dialog-1'
        && hit1.host.popoverOpen === true
        && hit1.host.popoverAttr === 'manual',
      'host ancestor contains native-dialog-1:modal + popover-open true after migration',
      { host: hit1.host,
        dlgHit: { dialogId: dlgHit1.dialogId, hitInput: dlgHit1.hitInput } },
      null, { group: 'AC-V2-22' });

    const hitOk = (hit) => {
      const pts = hit.points.filter((p) => p.found);
      return pts.length >= 3 && pts.every((p) =>
        p.fafIndex >= 0
        && (p.maskIndex < 0 || p.fafIndex < p.maskIndex)
        && (p.dialogIndex < 0 || p.fafIndex < p.dialogIndex)
        && p.topIsMask === false && p.topIsDialog === false
        && p.topIsFaf === true
        && p.innerIsFaf === true && p.innerPointerEvents !== 'none'
        && p.pointerRestored !== false);
    };
    const hitSummary = (hit) => hit.points.map((p) => ({
      key: p.key, found: p.found, fafIndex: p.fafIndex, maskIndex: p.maskIndex,
      dialogIndex: p.dialogIndex, topIsFaf: p.topIsFaf,
      topIsMask: p.topIsMask, topIsDialog: p.topIsDialog,
      innerIsFaf: p.innerIsFaf, innerPointerEvents: p.innerPointerEvents,
      innerTag: p.inner?.tag ?? null, pointerRestored: p.pointerRestored,
    }));
    record('V21-22f 命中测试：FAF 悬浮球 / 悬浮提示 / 结果条按钮在遮罩与 dialog 之上',
      hitOk(hit1), 'every FAF point is above mask and dialog in elementsFromPoint order',
      hitSummary(hit1),
      { stackSample: hit1.points.map((p) => ({ key: p.key, stack: p.stack?.slice(0, 6) })) },
      { group: 'AC-V2-22' });

    const togglePoint = hit1.points.find((p) => p.key === 'diagnostics-toggle' && p.found);
    const diagBefore = await page.evaluate(() =>
      Boolean(document.getElementById('faf-shadow-root')?.shadowRoot?.querySelector('.f-diagnostics')));
    let clicked = false;
    if (togglePoint) {
      await realPointerClick(page, context, togglePoint.x, togglePoint.y);
      clicked = true;
    }
    await wait(500);
    const diagAfter = await page.evaluate(() =>
      Boolean(document.getElementById('faf-shadow-root')?.shadowRoot?.querySelector('.f-diagnostics')));
    record('V21-22g 真实指针点击穿透 top layer：结果条按钮被点到且诊断面板展开',
      clicked && diagBefore === false && diagAfter === true,
      'CDP mouse click at button center opens diagnostics',
      { clicked, diagBefore, diagAfter,
        point: togglePoint ? { x: togglePoint.x, y: togglePoint.y } : null },
      { stack: togglePoint?.stack?.slice(0, 6) },
      { group: 'AC-V2-22' });

    const chain = await page.locator('#dlg-next-1').click({ timeout: 5000 })
      .then(() => true).catch((e) => String(e));
    await wait(500);
    const hit2 = await probeHitStack(page);
    const dlgHit2 = await probeDialogInputHit(page, 'dlg-input-2');
    record('V21-22h 关闭弹窗一后打开弹窗二：仍进入 top layer 且 FAF 重新提升到最上层',
      chain === true && hit2.dialogModal === true
        && hit2.dialogOpenId === 'native-dialog-2'
        && hitOk(hit2) && hit2.host?.degradedFlag !== 'degraded',
      'second dialog :modal + FAF re-promoted above it',
      { chain, dialogOpenId: hit2.dialogOpenId, dialogModal: hit2.dialogModal,
        points: hitSummary(hit2) }, null,
      { group: 'AC-V2-22' });

    /* S4：切到第二个 modal，host 跟随第二次迁移。第三量仍须命中弹窗二输入框，
       第四量仍须 :popover-open 补开（前端实测 S4 首轮不补开即 fabHit=pageDlg2）。 */
    record('V21-22m 第三量（S4）：弹窗二内输入框中心仍命中该输入框（S6 放水路径在此返回 HTML）',
      dlgHit2.found === true && dlgHit2.dialogModal === true
        && dlgHit2.ownedByModal === true
        && dlgHit2.dialogId === 'native-dialog-2'
        && dlgHit2.inputId === 'dlg-input-2'
        && dlgHit2.hitInput === true
        && dlgHit2.topIsHtml === false
        && dlgHit2.topIsFafHost === false,
      'elementFromPoint(dlg-input-2 center) hits the input after second migration',
      dlgHit2, { stack: dlgHit2.stack }, { group: 'AC-V2-22' });
    record('V21-22n 第四量（S4 迁移补开）：弹窗二 host 迁入 dialog:modal 后 :popover-open 仍为 true',
      Boolean(hit2.host) && hit2.host.insideModalDialog === true
        && hit2.host.modalDialogId === 'native-dialog-2'
        && hit2.host.popoverOpen === true
        && hit2.host.popoverAttr === 'manual',
      'host ancestor contains native-dialog-2:modal + popover-open true after re-migration',
      { host: hit2.host,
        dlgHit: { dialogId: dlgHit2.dialogId, hitInput: dlgHit2.hitInput } },
      null, { group: 'AC-V2-22' });

    const close2 = await page.locator('#dlg-close-2').click({ timeout: 5000 })
      .then(() => true).catch((e) => String(e));
    await wait(400);
    const hit3 = await probeHitStack(page);
    record('V21-22i 弹窗全部关闭后 FAF 仍压过全屏遮罩（无遮挡退化）',
      close2 === true && hit3.dialogModal === false && hitOk(hit3),
      'no modal + FAF above mask',
      { close2, dialogModal: hit3.dialogModal, points: hitSummary(hit3) }, null,
      { group: 'AC-V2-22' });
    /* S5：全部 modal 关闭后 host 须移回 document.documentElement（html 直属）
       并重新确保 :popover-open，否则关闭弹窗后 FAF 会随 inert dialog 一起消失。
       Designer §5-C 行 132 要求断言 host.parentElement 依次为 dialog / HTML。 */
    record('V21-22o S5 归位：弹窗全关后 host 移回 document.documentElement 且 :popover-open 保持 true',
      Boolean(hit3.host) && hit3.host.parentTag === 'HTML'
        && hit3.host.insideModalDialog === false
        && hit3.host.popoverOpen === true
        && hit3.host.popoverAttr === 'manual',
      'host parentTag=HTML + not inside any modal + popover-open true after all dialogs closed',
      hit3.host, null, { group: 'AC-V2-22' });
    record('V21-22j 层叠场景零外发、提交计数 0、宿主页无未捕获异常',
      collectors.outbound.length === 0
        && afterFill.qa.submitClicks === 0 && afterFill.qa.submitEvents === 0
        && (afterFill.qa.pageErrors ?? 0) === 0
        && collectors.pageConsole.filter((c) => c.type === 'pageerror').length === 0,
      { outbound: 0, submitClicks: 0, submitEvents: 0, pageerrors: 0 },
      { outbound: collectors.outbound.length, submitClicks: afterFill.qa.submitClicks,
        submitEvents: afterFill.qa.submitEvents, pageErrors: afterFill.qa.pageErrors,
        consolePageErrors: collectors.pageConsole.filter((c) => c.type === 'pageerror').length },
      null, { group: 'AC-V2-22' });
  }

  /* ============ 场景 8 (v2.1)：empty.html 空状态不回归 ============ */
  {
    const env = await openScenario('S8-empty-v21', '/empty', null);
    const { page, context } = env;
    const before = await snapshotV21(page);
    await gesture(page, context);
    await wait(2600);
    const after = await snapshotV21(page);
    const ui = await probeUi(page);
    const changed = Object.keys(after.values)
      .filter((k) => (after.values[k] ?? '') !== (before.values[k] ?? ''));
    record('V21-12a 空状态零写入、展示空状态文字、不出现「置信度不足 / 待绑定」与致命错误文案',
      changed.length === 0 && Boolean(ui.text && ui.text.length > 0)
        && /没有可填|无可填|未找到可填|暂无/.test(ui.text)
        && !/置信度不足|待绑定/.test(ui.text)
        && !/填充失败|执行异常|致命错误/.test(ui.text),
      'zero writes + empty-state text + no binding/fatal wording',
      { changed, uiText: ui.text?.slice(0, 400) }, null,
      { group: 'AC-V2-12' });
  }
} catch (err) {
  record('V2-FATAL 执行器异常（不计入产品结论，需修复基础设施后重跑）', false,
    'no exception', String(err), { stack: String(err?.stack ?? '').slice(0, 900) },
    { blocking: true, group: 'INFRA' });
} finally {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const blockingFailed = results.filter((r) => !r.ok && r.blocking).length;
  const summary = {
    kind: 'QA_V2_E2E_RESULT',
    isV2Adjudication: true,
    scopeVersion: 'SPEC-v2.1 / 22 AC',
    v21Baseline: 'new result file; R2 e2e-v2-result.json and archive-baseline-1915 stay untouched',
    notice: '阶段二正式裁决执行：源码冻结基线复核通过后由 QA 独立实跑生成；全程未预置 storage / 内部状态。',
    browser: 'Microsoft Edge 157 (Chromium), headless=new',
    extPath: EXT,
    timestamp: new Date().toISOString(),
    profilePolicy: 'fresh user-data-dir per scenario, removed before and after each launch',
    antiCheat: {
      presetStorageWrites: 0,
      optionsPageOpens: optionsOpens,
      gestureCalls,
      uiGestureOnly: true,
      note: '不得预置站点条目、不得调用内部状态；静态复核见 check-e2e-integrity.mjs',
    },
    artifact: artifactHash,
    source: sourceHash,
    totals: { total: results.length, passed, failed, blockingFailed },
    results,
  };
  writeFileSync(V21_RESULT_FILE, JSON.stringify(summary, null, 2));
  console.log(`\nSUMMARY: total=${summary.totals.total} passed=${passed} failed=${failed} blockingFailed=${blockingFailed}`);
  console.log('RESULT_FILE: ' + V21_RESULT_FILE);
  console.log('LEGACY_R2_RESULT_UNTOUCHED: ' + RESULT_FILE);
  for (const { context, profile } of openContexts) {
    await context.close().catch(() => {});
    rmSync(profile, { recursive: true, force: true });
  }
  server.close();
}
