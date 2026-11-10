/**
 * One-off real-browser probe: local dev allowlist on port 9003.
 * Independent of e2e.mjs so the QA 43-assertion evidence file stays untouched.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9003;
const ORIGIN = `http://localhost:${PORT}`;
const PROFILE = resolve(HERE, 'profile-localdev');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (id, ok, expected, actual) => {
  results.push({ id, ok, expected, actual });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} :: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
};

const HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>本地项目</title></head><body>
<form id="demo"><h2>人员信息</h2>
<div><label for="f-name">姓名</label><input id="f-name" name="name" type="text"></div>
<div><label for="f-phone">手机号</label><input id="f-phone" name="phone" type="tel"></div>
</form>
<script>window.__qa = { submitClicks: 0, submitEvents: 0 };
document.getElementById('demo').addEventListener('submit', () => window.__qa.submitEvents++);</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
rmSync(PROFILE, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EDGE,
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-default-browser-check', '--headless=new',
  ],
  viewport: { width: 1360, height: 940 },
});

try {
  await wait(2500);
  const sw = context.serviceWorkers()[0];
  const extId = sw?.url().split('/')[2] ?? null;
  if (!extId) throw new Error('EXTENSION_NOT_LOADED');

  const cfg = await context.newPage();
  await cfg.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  const readList = () => cfg.evaluate(async () => {
    // @ts-ignore
    return (await chrome.storage.local.get('faf.siteAllowlist.v1'))['faf.siteAllowlist.v1'] ?? [];
  });
  const setList = (v) => cfg.evaluate(async (list) => {
    // @ts-ignore
    await chrome.storage.local.set({ 'faf.siteAllowlist.v1': list });
  }, v);

  // 1. Empty allowlist, then the one-click local button.
  await setList([]);
  await cfg.reload({ waitUntil: 'domcontentloaded' });
  await cfg.getByRole('button', { name: /添加本机地址/ }).click();
  await wait(400);
  const afterButton = await readList();
  check('LOCAL-01 一键添加本机地址写入 3 个回环域名',
    JSON.stringify(afterButton) === JSON.stringify(['localhost', '127.0.0.1', '[::1]']),
    ['localhost', '127.0.0.1', '[::1]'], afterButton);

  // 2. Pasting the exact project URL must normalize to a single host entry.
  await setList([]);
  await cfg.reload({ waitUntil: 'domcontentloaded' });
  await cfg.getByRole('textbox', { name: '添加测试站点域名' }).fill(`${ORIGIN}/form?x=1`);
  await cfg.getByRole('button', { name: '添加站点' }).click();
  await wait(400);
  const afterPaste = await readList();
  check('LOCAL-02 粘贴完整本地地址自动提取域名',
    JSON.stringify(afterPaste) === JSON.stringify(['localhost']), ['localhost'], afterPaste);

  // 3. Real page on port 9003 with the one-click allowlist must be fillable.
  await setList(['localhost', '127.0.0.1', '[::1]']);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/form`, { waitUntil: 'domcontentloaded' });
  await page.locator('#f-name').focus();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 9, key: 'F', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 9, key: 'F', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
  await cdp.detach();
  await wait(2600);
  const panel = await page.evaluate(() => {
    const root = document.getElementById('faf-shadow-root')?.shadowRoot;
    if (!root) return null;
    return {
      hint: root.querySelector('.f-hint')?.textContent?.trim() ?? null,
      confirmDisabled: root.querySelector('.f-btn--primary')?.disabled ?? null,
      rows: root.querySelectorAll('.f-table .f-row:not(.f-row--head)').length,
      values: [...document.querySelectorAll('input')].map((e) => e.value),
    };
  });
  check('LOCAL-03 9003 端口页面放行且预览阶段零写入',
    Boolean(panel && panel.rows > 0 && panel.confirmDisabled === false
      && !/不在测试站点白名单/.test(panel.hint ?? '')
      && panel.values.every((v) => v === '')),
    'rows>0, confirm enabled, no deny hint, no writes', panel);

  const submit = await page.evaluate(() => window.__qa);
  check('LOCAL-04 预览阶段未发生自动提交', submit.submitClicks === 0 && submit.submitEvents === 0,
    { submitClicks: 0, submitEvents: 0 }, submit);
} finally {
  const summary = { timestamp: new Date().toISOString(), total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  writeFileSync(resolve(HERE, 'local-dev-probe.json'), JSON.stringify(summary, null, 2));
  console.log(`SUMMARY: total=${summary.total} passed=${summary.passed} failed=${summary.failed}`);
  await context.close();
  server.close();
  rmSync(PROFILE, { recursive: true, force: true });
}
