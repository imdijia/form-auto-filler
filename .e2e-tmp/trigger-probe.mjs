/**
 * Phase 4 probe 3: determine which user-gesture path actually injects the
 * unlisted filler script into the active tab (activeTab permission).
 * Raw evidence only. Exits 0 always; prints a machine-readable SUMMARY.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 18765;
const ORIGIN = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA Form</title></head>
<body><div class="search-bar"><input id="global-search" type="search" placeholder="搜索关键字" aria-label="搜索"></div>
<div role="dialog" id="dlg"><h2>人员信息</h2><form id="qa-form">
<label for="name">姓名</label><input id="name" name="personName" type="text">
<label for="phone">手机号</label><input id="phone" name="phone" type="tel">
<button type="submit" id="submit-btn">保存</button>
</form></div>
<script>
window.__qa = { submitClicks: 0, submitEvents: 0, errors: [] };
document.getElementById('submit-btn').addEventListener('click', () => { window.__qa.submitClicks += 1; });
document.getElementById('qa-form').addEventListener('submit', (e) => { e.preventDefault(); window.__qa.submitEvents += 1; });
window.addEventListener('error', (e) => window.__qa.errors.push(String(e.message)));
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE_HTML);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const args = [
  `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
  '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
  '--no-default-browser-check', '--headless=new',
];
const profile = resolve(HERE, 'profile-trigger');
const context = await chromium.launchPersistentContext(profile, {
  executablePath: EDGE, headless: false, args, viewport: { width: 1280, height: 900 },
});
const result = {};
try {
  await wait(2500);
  const sw = context.serviceWorkers()[0];
  const extId = sw?.url().split('/')[2] ?? null;
  result.extId = extId;
  console.log('EXT_ID:', extId);

  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => console.log('PAGE_CONSOLE:', m.type(), m.text().slice(0, 180)));
  page.on('pageerror', (e) => console.log('PAGE_ERROR:', String(e).slice(0, 220)));
  await page.goto(`${ORIGIN}/form`, { waitUntil: 'domcontentloaded' });
  await page.locator('#name').focus();
  console.log('INITIAL_SHADOW:', await page.evaluate(() => Boolean(document.getElementById('faf-shadow-root'))));

  // Configure the allowlist via a real extension page (chrome.storage.local).
  const cfg = await context.newPage();
  await cfg.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  await cfg.evaluate(async () => {
    // @ts-ignore
    await chrome.storage.local.set({ 'faf.siteAllowlist.v1': ['localhost'] });
  });
  const stored = await cfg.evaluate(async () => {
    // @ts-ignore
    return (await chrome.storage.local.get('faf.siteAllowlist.v1'))['faf.siteAllowlist.v1'];
  });
  console.log('ALLOWLIST_STORED:', JSON.stringify(stored));
  const cmds = await cfg.evaluate(async () => {
    // @ts-ignore
    return await chrome.commands.getAll();
  });
  console.log('COMMANDS:', JSON.stringify(cmds));

  await page.bringToFront();

  const shadow = () => page.evaluate(() => Boolean(document.getElementById('faf-shadow-root'))).catch(() => false);

  // T1: Playwright keyboard accelerator
  await page.keyboard.press('Alt+Shift+F');
  await wait(1800);
  result.t1_keyboard = await shadow();
  console.log('T1_KEYBOARD:', result.t1_keyboard);

  // T2: CDP raw key event with Alt(1)+Shift(8) = 9
  if (!result.t1_keyboard) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 9, key: 'F', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 9, key: 'F', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
    await wait(1800);
    result.t2_cdp_key = await shadow();
    console.log('T2_CDP_KEY:', result.t2_cdp_key);
  }

  // T3: control message from a background extension page (active tab = test page)
  if (!result.t1_keyboard && !result.t2_cdp_key) {
    await page.bringToFront();
    await cfg.evaluate(() => {
      // @ts-ignore
      return chrome.runtime.sendMessage({ channel: 'FAF_CONTROL_V1', requestId: 'qa-t3', name: 'ping', payload: {} });
    });
    await wait(1500);
    result.t3_ping = await shadow();
    await cfg.evaluate(() => {
      // @ts-ignore
      return chrome.runtime.sendMessage({ channel: 'FAF_CONTROL_V1', requestId: 'qa-t3b', name: 'open-plan', payload: {} });
    });
    await wait(2000);
    result.t3_openplan = await shadow();
    console.log('T3_PING:', result.t3_ping, 'T3_OPENPLAN:', result.t3_openplan);
  }

  // T4: scripting.executeScript probe from extension page -> reveals activeTab grant
  await page.bringToFront();
  const scripting = await cfg.evaluate(async () => {
    // @ts-ignore
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      // @ts-ignore
      const r = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: () => (window.__qa ? 'page-ok' : 'no') });
      return { activeUrl: tabs[0]?.url, ok: true, value: r[0]?.result };
    } catch (e) {
      return { activeUrl: tabs[0]?.url, ok: false, error: String(e) };
    }
  }).catch((e) => ({ ok: false, error: String(e) }));
  console.log('SCRIPTING_PROBE:', JSON.stringify(scripting));
  result.scripting = scripting;

  result.panelText = await page.evaluate(() => {
    const host = document.getElementById('faf-shadow-root');
    return host?.shadowRoot?.textContent?.slice(0, 500) ?? null;
  }).catch(() => null);
  console.log('PANEL_TEXT:', JSON.stringify(result.panelText));
} catch (err) {
  result.fatal = String(err);
  console.log('FATAL:', String(err));
} finally {
  console.log('SUMMARY: ' + JSON.stringify(result));
  await context.close().catch(() => {});
  server.close();
}
