/**
 * 基础设施 dry-run —— 非 v2 裁决、不计入结论。
 *
 * 目的：用当前 v1 产物验证三件环境事实是否可用，避免阶段二才踩环境坑：
 *   1. Edge 157 + --headless=new + --load-extension 能否加载 .output/chrome-mv3（service worker 注册）；
 *   2. CDP Input.dispatchKeyEvent 的浏览器级快捷键能否触发扩展注入；
 *   3. context.on('request') 与 CDP Network.requestWillBeSent 能否采集请求日志。
 *
 * 本脚本不对任何 v2 产品行为下通过/失败结论，也不产出 verdict。
 * 结果文件仅记录「可用 / 不可用 + 观测证据」。阶段二会另跑 e2e-v2.mjs 做正式裁决。
 *
 * 同样使用全新干净 profile、不预置任何扩展存储、不绕过 UI。
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 18767;
const ORIGIN = ['http', '://localhost:', String(PORT)].join('');
const PROFILE = resolve(HERE, 'profile-dryrun-infra');
const RESULT_FILE = resolve(HERE, 'dry-run-infra.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>基础设施探针页</title></head><body>
<div><label for="probe-input">探针输入</label><input id="probe-input" type="text"></div>
<button type="button" id="probe-button">页面按钮</button>
<script>
window.__qa = { clicks: 0 };
document.getElementById('probe-button').addEventListener('click', function () { window.__qa.clicks += 1; });
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE_HTML);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

rmSync(PROFILE, { recursive: true, force: true });
const profileFreshAtStart = !existsSync(PROFILE);

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EDGE,
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-default-browser-check', '--headless=new',
  ],
  viewport: { width: 1200, height: 800 },
});

const contextRequests = [];
const cdpRequests = [];
context.on('request', (req) => contextRequests.push({
  url: req.url(), method: req.method(), resourceType: req.resourceType(),
}));

const evidence = {
  profileFreshAtStart,
  extensionId: null,
  serviceWorkerUrl: null,
  shadowBeforeGesture: null,
  shadowAfterGesture: null,
  cdpKeyEventsDispatched: 0,
  contextRequestCount: 0,
  cdpRequestCount: 0,
  requestSample: [],
  uiClickCount: 0,
  note: 'v1 产物默认空白名单会拒绝填充，但注入由手势触发，shadow host 出现即证明手势链路可用；此项与 v2 产品行为无关。',
};

try {
  await wait(2300);
  const sw = context.serviceWorkers()[0];
  evidence.serviceWorkerUrl = sw?.url() ?? null;
  evidence.extensionId = sw?.url().split('/')[2] ?? null;

  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => cdpRequests.push({
    url: e.request.url, initiator: e.initiator?.url ?? e.initiator?.type ?? '',
  }));

  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await wait(300);
  await page.locator('#probe-button').click();
  evidence.uiClickCount = await page.evaluate(() => globalThis.__qa?.clicks ?? 0);
  await page.locator('#probe-input').focus();
  evidence.shadowBeforeGesture = await page.evaluate(
    () => Boolean(document.getElementById('faf-shadow-root')),
  );

  await page.bringToFront();
  const keyCdp = await context.newCDPSession(page);
  for (const type of ['rawKeyDown', 'keyUp']) {
    await keyCdp.send('Input.dispatchKeyEvent', {
      type, modifiers: 9, key: 'F', code: 'KeyF',
      windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70,
    });
    evidence.cdpKeyEventsDispatched += 1;
  }
  await keyCdp.detach();
  await wait(2200);
  evidence.shadowAfterGesture = await page.evaluate(
    () => Boolean(document.getElementById('faf-shadow-root')),
  );

  evidence.contextRequestCount = contextRequests.length;
  evidence.cdpRequestCount = cdpRequests.length;
  evidence.requestSample = contextRequests.slice(0, 10);
} catch (err) {
  evidence.executorError = String(err);
} finally {
  const infrastructure = {
    extensionLoaded: {
      available: Boolean(evidence.extensionId),
      observed: { extensionId: evidence.extensionId, serviceWorkerUrl: evidence.serviceWorkerUrl },
    },
    cdpGestureTriggered: {
      available: evidence.shadowBeforeGesture === false && evidence.shadowAfterGesture === true,
      observed: {
        shadowBeforeGesture: evidence.shadowBeforeGesture,
        shadowAfterGesture: evidence.shadowAfterGesture,
        cdpKeyEventsDispatched: evidence.cdpKeyEventsDispatched,
      },
    },
    requestLogCollected: {
      available: evidence.contextRequestCount > 0 && evidence.cdpRequestCount > 0,
      observed: {
        contextRequestCount: evidence.contextRequestCount,
        cdpRequestCount: evidence.cdpRequestCount,
        requestSample: evidence.requestSample,
      },
    },
  };
  const record = {
    kind: 'QA_V2_INFRA_DRY_RUN',
    isV2Adjudication: false,
    notice: '基础设施 dry-run：非 v2 裁决、不计入结论。仅记录三项环境可用性事实，不对任何 v2 产品行为下通过/失败判定。',
    timestamp: new Date().toISOString(),
    browser: 'Microsoft Edge 157 (Chromium), headless=new',
    extPath: EXT,
    profilePolicy: 'fresh user-data-dir, removed before launch',
    infrastructure,
    evidence,
  };
  writeFileSync(RESULT_FILE, JSON.stringify(record, null, 2));
  for (const [key, value] of Object.entries(infrastructure)) {
    console.log(`INFRA ${key}: available=${value.available} observed=${JSON.stringify(value.observed).slice(0, 500)}`);
  }
  console.log('DRY_RUN_FILE: ' + RESULT_FILE);
  console.log('NOTICE: 非 v2 裁决、不计入结论');
  await context.close().catch(() => {});
  rmSync(PROFILE, { recursive: true, force: true });
  server.close();
}
