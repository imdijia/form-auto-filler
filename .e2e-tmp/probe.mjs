/**
 * Phase 4 probe: can a real Chromium load the unpacked MV3 extension and
 * accept a user-gesture command in headless mode?
 *
 * Read-only probe. Prints raw evidence; never claims a pass that did not happen.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = resolve(HERE, 'profile-probe');

const exe = process.env.QA_BROWSER === 'edge' ? EDGE : CHROME;
const headlessMode = process.env.QA_HEADLESS ?? 'new';

const args = [
  `--disable-extensions-except=${EXT}`,
  `--load-extension=${EXT}`,
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
];
if (headlessMode === 'new') args.push('--headless=new');

console.log(JSON.stringify({ exe, headlessMode, ext: EXT, args }, null, 2));

let context;
try {
  context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: exe,
    headless: false, // --headless=new is supplied explicitly above
    args,
    viewport: { width: 1280, height: 900 },
  });
} catch (err) {
  console.log('LAUNCH_FAILED: ' + String(err));
  process.exit(2);
}

try {
  // Give the MV3 service worker a moment to register.
  await new Promise((r) => setTimeout(r, 2500));
  const workers = context.serviceWorkers();
  console.log('SERVICE_WORKERS:', JSON.stringify(workers.map((w) => w.url())));
  const extId = workers[0]?.url().split('/')[2] ?? null;
  console.log('EXT_ID:', extId);

  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => console.log('PAGE_CONSOLE:', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', (e) => console.log('PAGE_ERROR:', String(e).slice(0, 300)));

  await page.goto('http://localhost:1/', { waitUntil: 'domcontentloaded' }).catch((e) => {
    console.log('NAV_NOTE:', String(e).slice(0, 160));
  });
  console.log('PAGE_URL:', page.url());

  // Strategy A: Playwright keyboard shortcut (browser-level accelerator).
  await page.keyboard.press('Alt+Shift+F');
  await new Promise((r) => setTimeout(r, 1800));
  console.log('AFTER_KEYBOARD_SHADOW:', await page.evaluate(() => Boolean(document.getElementById('faf-shadow-root'))).catch((e) => 'ERR:' + e));

  // Strategy B: CDP raw key event with Alt+Shift modifiers.
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 9, key: 'F', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 9, key: 'F', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
    await new Promise((r) => setTimeout(r, 1800));
    console.log('AFTER_CDP_KEY_SHADOW:', await page.evaluate(() => Boolean(document.getElementById('faf-shadow-root'))).catch((e) => 'ERR:' + e));
  } catch (e) {
    console.log('CDP_KEY_FAILED:', String(e).slice(0, 200));
  }

  // Strategy C: extension page -> runtime.sendMessage control('open-plan')
  if (extId) {
    try {
      const extPage = await context.newPage();
      await extPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
      const cmds = await extPage.evaluate(async () => {
        // @ts-ignore - chrome API available on extension pages
        const all = await chrome.commands.getAll();
        // @ts-ignore
        const perms = await chrome.permissions.getAll();
        return { commands: all, permissions: perms };
      });
      console.log('EXT_COMMANDS:', JSON.stringify(cmds.commands));
      console.log('EXT_PERMISSIONS:', JSON.stringify(cmds.permissions));
      await extPage.evaluate(() => {
        // @ts-ignore
        return chrome.runtime.sendMessage({
          channel: 'FAF_CONTROL_V1', requestId: 'qa-probe', name: 'open-plan', payload: {},
        });
      });
      await new Promise((r) => setTimeout(r, 2500));
      console.log('AFTER_RUNTIME_MSG_SHADOW:', await page.evaluate(() => Boolean(document.getElementById('faf-shadow-root'))).catch((e) => 'ERR:' + e));
      await extPage.close();
    } catch (e) {
      console.log('EXT_PAGE_FAILED:', String(e).slice(0, 300));
    }
  }

  // Strategy D: direct injection via scripting from an extension page (tests activeTab grant).
  if (extId) {
    try {
      const extPage = await context.newPage();
      await extPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
      const result = await extPage.evaluate(async () => {
        // @ts-ignore
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        try {
          // @ts-ignore
          const res = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: () => 1 + 1 });
          return { activeTabUrl: tabs[0].url, injected: true, result: res[0]?.result };
        } catch (err) {
          return { activeTabUrl: tabs[0].url, injected: false, error: String(err) };
        }
      });
      console.log('SCRIPTING_PROBE:', JSON.stringify(result));
      await extPage.close();
    } catch (e) {
      console.log('SCRIPTING_PAGE_FAILED:', String(e).slice(0, 300));
    }
  }
} finally {
  await context.close();
}
