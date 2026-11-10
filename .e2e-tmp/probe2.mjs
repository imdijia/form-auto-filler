/**
 * Phase 4 probe 2: Chrome 156 removed --load-extension (Chrome >=137).
 * Try (A) CDP Extensions.loadUnpacked on Chrome, (B) --load-extension on Edge,
 * (C) CDP Extensions.loadUnpacked on Edge. Print raw evidence only.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function attempt(label, exe, mode) {
  const args = [
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-default-browser-check', '--headless=new',
  ];
  if (mode === 'flag') {
    args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  } else {
    args.push('--enable-unsafe-extension-debugging');
  }
  const profile = resolve(HERE, `profile-${label}`);
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: exe, headless: false, args,
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    console.log(`${label}: LAUNCH_FAILED ${String(err).slice(0, 240)}`);
    return false;
  }
  try {
    let loaded = null;
    if (mode === 'cdp') {
      const browser = context.browser();
      if (!browser) throw new Error('no browser handle');
      const cdp = await browser.newBrowserCDPSession();
      try {
        const res = await cdp.send('Extensions.loadUnpacked', { path: EXT });
        loaded = res;
        console.log(`${label}: Extensions.loadUnpacked -> ${JSON.stringify(res)}`);
      } catch (err) {
        console.log(`${label}: Extensions.loadUnpacked FAILED ${String(err).slice(0, 260)}`);
      }
    }
    await wait(2500);
    const targets = await context.browser()?.newBrowserCDPSession().then(async (s) => {
      const r = await s.send('Target.getTargets');
      await s.detach();
      return r.targetInfos.filter((t) => t.type === 'service_worker' || t.type === 'background_page').map((t) => t.url);
    }).catch((e) => ['TARGET_QUERY_FAILED: ' + String(e).slice(0, 120)]);
    const workers = context.serviceWorkers().map((w) => w.url());
    console.log(`${label}: TARGETS=${JSON.stringify(targets)} WORKERS=${JSON.stringify(workers)} LOADED=${JSON.stringify(loaded)}`);
    return workers.length > 0 || targets.some((t) => t.includes('chrome-extension://'));
  } finally {
    await context.close().catch(() => {});
  }
}

const results = {};
results.chrome_cdp = await attempt('chrome-cdp', CHROME, 'cdp');
results.edge_flag = await attempt('edge-flag', EDGE, 'flag');
results.edge_cdp = await attempt('edge-cdp', EDGE, 'cdp');
console.log('SUMMARY: ' + JSON.stringify(results));
