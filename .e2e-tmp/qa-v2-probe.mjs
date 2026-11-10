/**
 * QA v2 阶段二补充证据采集探针（三项如实核查 + 诊断语义 + AC-V2-14 补填撤销实测）。
 *
 * 边界：
 *   - 只读取 chrome.storage.local（get），绝不写入；
 *   - 不改产品源码、不改 e2e-v2.mjs 断言；
 *   - 与正式 E2E 同一份冻结产物 .output/chrome-mv3；
 *   - 全新干净 profile + CDP 真实手势，不预置任何前置状态。
 *
 * 本探针纳入 .e2e-tmp/check-e2e-integrity.mjs 反作弊门第 8 项扫描。
 * 输出：.e2e-tmp/qa-v2-probe.json
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const FIXTURES = resolve(HERE, 'fixtures');
const OUT = resolve(HERE, 'qa-v2-probe.json');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 18767;
const ORIGIN = ['http', '://localhost:', String(PORT)].join('');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  if ((req.url || '/').split('?')[0] === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(join(FIXTURES, 'main.html')));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const profile = resolve(HERE, 'profile-v2-probe');
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
await wait(2300);
const extId = context.serviceWorkers()[0]?.url().split('/')[2] ?? null;
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN }).catch(() => {});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(ORIGIN + '/main', { waitUntil: 'domcontentloaded' });
await wait(350);

/* 只读取扩展存储：优先 service worker，失败再退回 popup 页面上下文。 */
async function readStorage() {
  const sw = context.serviceWorkers()[0];
  if (sw) {
    try {
      const d = await sw.evaluate(async () => {
        try {
          const all = await chrome.storage.local.get(null);
          return { ok: true, keys: Object.keys(all), data: all };
        } catch (e) { return { ok: false, error: String(e) }; }
      });
      if (d?.ok) return { via: 'service-worker', ...d };
    } catch { /* SW terminated, fall through to popup */ }
  }
  const p = await context.newPage();
  try {
    await p.goto(['chrome-extension', '://', extId, '/popup.html'].join(''), { waitUntil: 'domcontentloaded' });
    await wait(400);
    const d = await p.evaluate(async () => {
      try {
        const all = await chrome.storage.local.get(null);
        return { ok: true, keys: Object.keys(all), data: all };
      } catch (e) { return { ok: false, error: String(e) }; }
    });
    return { via: 'popup', ...d };
  } finally { await p.close().catch(() => {}); }
}

const snap = () => page.evaluate(() => {
  const values = {};
  for (const el of document.querySelectorAll('input, select, textarea, [contenteditable]')) {
    if (el.id) values[el.id] = el.isContentEditable ? (el.textContent || '').trim() : el.value;
  }
  const root = document.getElementById('faf-shadow-root')?.shadowRoot ?? null;
  return {
    values,
    uiText: root?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? null,
  };
});

const storageBefore = await readStorage();
const before = await snap();

/* CDP 原生手势：Alt+Shift+F，modifiers 9。 */
await page.bringToFront();
const cdp = await context.newCDPSession(page);
await cdp.send('Input.dispatchKeyEvent', {
  type: 'rawKeyDown', modifiers: 9, key: 'F', code: 'KeyF',
  windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70,
});
await cdp.send('Input.dispatchKeyEvent', {
  type: 'keyUp', modifiers: 9, key: 'F', code: 'KeyF',
  windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70,
});
await cdp.detach();
await wait(3200);

const afterFill = await snap();
const storageAfter = await readStorage();

/* 展开逐字段诊断 + 复制诊断 JSON（剪贴板读取） */
await page.locator('#faf-shadow-root button:has-text("逐字段诊断")').first().click({ timeout: 5000 }).catch(() => {});
await wait(500);
await page.locator('#faf-shadow-root button:has-text("复制诊断")').first().click({ timeout: 5000 }).catch(() => {});
await wait(450);
const diagRaw = await page.evaluate(async () => {
  try { return await navigator.clipboard.readText(); } catch { return null; }
}).catch(() => null);
let diag = null;
let diagParseError = null;
try { diag = diagRaw ? JSON.parse(diagRaw) : null; } catch (e) { diagParseError = String(e); }
const items = Array.isArray(diag?.items) ? diag.items : (Array.isArray(diag) ? diag : []);
const nonFilled = items.filter((x) => x.status !== 'filled').map((x) => ({
  fieldId: x.fieldId, label: x.label, status: x.status, expected: x.expected,
  actualDom: x.actualDom, strategyId: x.strategyId,
  failureReason: x.failureReason ?? null, skipReason: x.skipReason ?? null,
}));

/* AC-V2-14：对「所在单位」跳过字段手动指定类型后单独补填。 */
const row = page.locator('#faf-shadow-root .f-diag-row, #faf-shadow-root [data-faf="diag-row"]')
  .filter({ hasText: '所在单位' }).first();
const refill = { attempted: false };
if (await row.count() > 0) {
  refill.rowText = (await row.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null;
  const sel = row.locator('select').first();
  if (await sel.count() > 0) {
    const options = await sel.evaluate((s) => [...s.options].map((o) => ({
      value: o.value, text: (o.textContent || '').trim(),
    }))).catch(() => []);
    refill.options = options.slice(0, 30);
    const pick = options.find((o) => o.value && o.value.length > 0);
    if (pick) {
      await sel.selectOption(pick.value).catch((e) => { refill.selectError = String(e); });
      await wait(250);
      const btn = row.locator('button:has-text("补填此字段")').first();
      if (await btn.count() > 0) {
        await btn.click({ timeout: 5000 }).catch((e) => { refill.clickError = String(e); });
        refill.attempted = true;
        refill.selectedOption = pick;
      }
    }
  }
}
await wait(2200);
const afterRefill = await snap();
const changedOtherFields = Object.keys(afterRefill.values)
  .filter((k) => k !== 'f-org' && afterRefill.values[k] !== afterFill.values[k]);

/* 撤销本次填充 */
await page.locator('#faf-shadow-root button:has-text("撤销")').first().click({ timeout: 5000 }).catch(() => {});
await wait(2800);
const afterUndo = await snap();

const uiTextAll = [afterFill.uiText, afterRefill.uiText, afterUndo.uiText].join(' ');
const uiHints = ['补填', '撤销', '快照', '仅本次会话', '无法撤销', '未纳入', '单独']
  .filter((w) => uiTextAll.includes(w));

let manifestCommands = null;
try {
  manifestCommands = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')).commands ?? null;
} catch (e) { manifestCommands = String(e); }

const result = {
  kind: 'QA_V2_SUPPLEMENTAL_PROBE',
  isV2Adjudication: true,
  notice: '阶段二补充证据采集：三项如实核查 + 诊断全量语义 + AC-V2-14 补填撤销实测。仅 get 读取 chrome.storage.local，未写入任何 storage；未绕过 UI；全新干净 profile + CDP 真实手势。',
  timestamp: new Date().toISOString(),
  profileFreshAtStart,
  extId,
  extFillerSha256: createHash('sha256').update(readFileSync(join(EXT, 'filler.js'))).digest('hex'),
  storage: {
    beforeFill: storageBefore,
    afterFill: storageAfter,
    keysBefore: storageBefore.keys ?? [],
    keysAfter: storageAfter.keys ?? [],
    newKeys: (storageAfter.keys ?? []).filter((k) => !(storageBefore.keys ?? []).includes(k)),
  },
  diagnostics: {
    parsed: Boolean(diag),
    fieldCount: items.length,
    nonFilledCount: nonFilled.length,
    nonFilled,
    firstField: items[0] ?? null,
    parseError: diagParseError,
  },
  values: {
    before: before.values, fill: afterFill.values,
    refill: afterRefill.values, undo: afterUndo.values,
  },
  refill: {
    ...refill,
    orgBefore: before.values['f-org'] ?? null,
    orgAfterFill: afterFill.values['f-org'] ?? null,
    orgAfterRefill: afterRefill.values['f-org'] ?? null,
    orgAfterUndo: afterUndo.values['f-org'] ?? null,
    residueAfterUndo: Boolean(
      (afterUndo.values['f-org'] ?? '') && (afterUndo.values['f-org'] ?? '') !== (before.values['f-org'] ?? ''),
    ),
    otherFieldsAfterUndo: CORE_SAMPLE_DIFF(afterUndo.values, before.values),
    changedOtherFields,
  },
  ui: {
    afterFill: afterFill.uiText,
    afterRefill: afterRefill.uiText,
    afterUndo: afterUndo.uiText,
    hints: uiHints,
  },
  manifestCommands,
};
writeFileSync(OUT, JSON.stringify(result, null, 2));

function CORE_SAMPLE_DIFF(after, original) {
  const ids = ['f-name', 'f-phone', 'f-idcard', 'f-email', 'f-school', 'f-address', 'f-note'];
  return Object.fromEntries(ids.map((id) => [id, {
    before: original[id] ?? null, after: after[id] ?? null,
    restored: (after[id] ?? '') === (original[id] ?? ''),
  }]));
}

console.log(JSON.stringify({
  storage: {
    viaBefore: storageBefore.via, viaAfter: storageAfter.via,
    keysBefore: result.storage.keysBefore, keysAfter: result.storage.keysAfter,
    newKeys: result.storage.newKeys, afterData: storageAfter.data,
  },
  diagnostics: { parsed: Boolean(diag), fieldCount: items.length, nonFilledCount: nonFilled.length, nonFilled: nonFilled.slice(0, 8) },
  refill: result.refill,
  uiHints,
  uiAfterUndo: afterUndo.uiText?.slice(0, 500),
  manifestCommands,
}, null, 2));

await context.close().catch(() => {});
rmSync(profile, { recursive: true, force: true });
server.close();
