/**
 * v2.1 基础设施 dry-run —— 非 v2.1 裁决、不计入结论。
 *
 * 目的（只验证环境事实，不对任何产品行为下通过/失败判定）：
 *   1. Edge 157 + --headless=new + --load-extension 能否加载 .output/chrome-mv3（MV3 service worker）；
 *   2. CDP Input.dispatchKeyEvent 的浏览器级快捷键能否触发扩展注入；
 *   3. Shadow DOM 内 getComputedStyle 探针是否可用（AC-V2-20 对比度断言的前提）；
 *   4. document.elementFromPoint / elementsFromPoint / shadowRoot.elementFromPoint
 *      三种命中探针是否可用（AC-V2-22 层叠断言的前提）。
 *
 * 同样使用全新干净 user-data-dir、运行前后清理；全程不预置任何扩展存储、
 * 不调用内部状态、不绕过 UI。结果文件 isV2Adjudication: false。
 * 本脚本被 .e2e-tmp/check-e2e-integrity.mjs 纳入第 8 项反作弊门的扫描范围。
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 18768;
const ORIGIN = ['http', '://localhost:', String(PORT)].join('');
const PROFILE = resolve(HERE, 'profile-dryrun-v21-infra');
const RESULT_FILE = resolve(HERE, 'dry-run-v21-infra.json');
const FIXTURE = readFileSync(join(HERE, 'fixtures', 'overlay.html'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Node 侧对比度计算：只用于把真机 computed style 原值换算成 CR 记录，
   不参与任何产品判定，也不是正式裁决执行器里的 oracle。 */
const parseRgb = (raw) => {
  const m = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(String(raw ?? ''));
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : null;
};
const wcagCr = (fgRaw, bgRaw) => {
  const fg = parseRgb(fgRaw);
  const bg = parseRgb(bgRaw);
  if (!fg || !bg) return null;
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (x) => 0.2126 * lin(x.r) + 0.7152 * lin(x.g) + 0.0722 * lin(x.b);
  const a = L(fg), b = L(bg);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 1000) / 1000;
};
const hexToRgbForNode = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
};

/* 命中探针：在 FAB 中心同时记录三种 API 的返回形态。只记录观测原值，
   不做任何产品级判定；用于校准 e2e-v2.mjs 的 AC-V2-22 断言口径。 */
const hitProbe = (page, dialogId) => page.evaluate((dlgId) => {
  const host = document.getElementById('faf-shadow-root');
  const sr = host?.shadowRoot ?? null;
  const fab = sr?.querySelector('.f-fab') ?? null;
  const dlg = dlgId ? document.getElementById(dlgId) : null;
  if (!sr || !fab) return { available: false, reason: 'no-shadow-root-or-fab' };
  const r = fab.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2);
  const y = Math.round(r.y + r.height / 2);
  const describe = (el) => ({
    tag: el?.tagName ?? null,
    id: el?.id ?? null,
    cls: String(el?.className ?? '').slice(0, 60),
    isHost: Boolean(el && el === host),
    isFafInner: Boolean(el && el.getRootNode && el.getRootNode() === sr),
    isMask: Boolean(el && el === document.getElementById('z-mask')),
    isDialog: Boolean(el && el === dlg),
  });
  const top = document.elementFromPoint(x, y);
  const stack = document.elementsFromPoint(x, y) || [];
  const inner = sr.elementFromPoint ? sr.elementFromPoint(x, y) : null;
  return {
    available: typeof sr.elementFromPoint === 'function' && top !== null,
    point: { x, y },
    elementFromPoint: describe(top),
    elementsFromPointCount: stack.length,
    elementsFromPoint: stack.slice(0, 8).map(describe),
    shadowRootElementFromPoint: describe(inner),
    innerPointerEvents: inner ? getComputedStyle(inner).pointerEvents : null,
    innerTag: inner?.tagName ?? null,
    dialogModal: Boolean(dlg && dlg.matches(':modal')),
    dialogOpen: Boolean(dlg && dlg.open),
    maskZIndex: getComputedStyle(document.getElementById('z-mask')).zIndex,
    hostPopoverOpen: host.matches(':popover-open'),
    hostPointerEvents: getComputedStyle(host).pointerEvents,
    fabPointerEvents: getComputedStyle(fab).pointerEvents,
    fabRect: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
}, dialogId);

const server = http.createServer((req, res) => {
  if ((req.url || '/').split('?')[0] === '/favicon.ico') {
    res.writeHead(204); res.end(); return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(FIXTURE);
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
  viewport: { width: 1360, height: 940 },
});

const evidence = {
  kind: 'QA_V21_INFRA_DRY_RUN',
  isV2Adjudication: false,
  notice: '基础设施 dry-run：非 v2.1 裁决、不计入结论。仅记录四项环境可用性事实与观测原值，不对任何 v2.1 产品行为下通过/失败判定。',
  timestamp: new Date().toISOString(),
  browser: 'Microsoft Edge 157 (Chromium), headless=new',
  extPath: EXT,
  profilePolicy: 'fresh user-data-dir, removed before and after launch',
  fixture: '.e2e-tmp/fixtures/overlay.html',
  profileFreshAtStart,
  extensionId: null,
  serviceWorkerUrl: null,
  shadowBeforeGesture: null,
  shadowAfterGesture: null,
  cdpKeyEventsDispatched: 0,
  dialogOpenedViaUiClick: false,
  computedStyleProbe: null,
  hitTestProbeBeforeDialog: null,
  hitTestProbe: null,
  /* 以下两项仅用于校准 AC-V2-22 断言是否可满足，属浏览器行为观测，
     不是产品判定。正式裁决执行器 e2e-v2.mjs 绝不调用 hidePopover/showPopover。 */
  hitTestProbeAfterRepromotion: null,
  hitTestProbeDialogBeforeGesture: null,
  inertnessCalibration: null,
  hoverContrastProbe: null,
  extensionPagesProbe: null,
  executorError: null,
};

try {
  await wait(2300);
  const sw = context.serviceWorkers()[0];
  evidence.serviceWorkerUrl = sw?.url() ?? null;
  evidence.extensionId = sw?.url().split('/')[2] ?? null;

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await wait(350);
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
  await wait(3200);
  evidence.shadowAfterGesture = await page.evaluate(
    () => Boolean(document.getElementById('faf-shadow-root')),
  );

  /* 探针 3：Shadow DOM 内 computed style（只记录原值，不做阈值判定）。 */
  evidence.computedStyleProbe = await page.evaluate(() => {
    const host = document.getElementById('faf-shadow-root');
    const sr = host?.shadowRoot ?? null;
    if (!sr) return { available: false, reason: 'no-shadow-root' };
    const pick = (key, selector) => {
      const el = sr.querySelector(selector);
      if (!el) return { key, found: false };
      const cs = getComputedStyle(el);
      return {
        key, found: true, color: cs.color, backgroundColor: cs.backgroundColor,
        opacity: cs.opacity, whiteSpace: cs.whiteSpace, minHeight: cs.minHeight,
      };
    };
    return {
      available: true,
      hostColor: getComputedStyle(host).color,
      hostZIndex: getComputedStyle(host).zIndex,
      hostPosition: getComputedStyle(host).position,
      hostPopoverOpen: host.matches(':popover-open'),
      samples: [
        pick('primary', '.f-result-bar__actions .f-btn--primary'),
        pick('text', '.f-result-bar__actions .f-btn--text'),
        pick('fab', '.f-fab'),
        pick('hint', '.f-hint'),
      ],
    };
  });

  /* 探针 3b（真机 hover 态校准）：用 Playwright locator.hover() 真实悬停后
     再读 computed style，验证 :hover 背景确实与默认态不同、且鼠标移开后复原。
     只记录观测原值与换算 CR，不下任何产品结论。 */
  const readPrimary = () => page.evaluate(() => {
    const sr = document.getElementById('faf-shadow-root')?.shadowRoot;
    const el = sr?.querySelector('.f-result-bar__actions .f-btn--primary');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { color: cs.color, backgroundColor: cs.backgroundColor, opacity: cs.opacity };
  });
  const hoverProbe = { observationOnly: true, default: await readPrimary(), hover: null,
    restored: null, hoverError: null };
  try {
    await page.locator('#faf-shadow-root .f-result-bar__actions .f-btn--primary')
      .first().hover({ timeout: 4000 });
    hoverProbe.hover = await readPrimary();
  } catch (e) { hoverProbe.hoverError = String(e); }
  await page.mouse.move(1, 1);
  hoverProbe.restored = await readPrimary();
  hoverProbe.defaultCr = hoverProbe.default
    ? wcagCr(hoverProbe.default.color, hoverProbe.default.backgroundColor) : null;
  hoverProbe.hoverCr = hoverProbe.hover
    ? wcagCr(hoverProbe.hover.color, hoverProbe.hover.backgroundColor) : null;
  hoverProbe.backgroundChanged = Boolean(hoverProbe.default && hoverProbe.hover
    && hoverProbe.default.backgroundColor !== hoverProbe.hover.backgroundColor);
  hoverProbe.restoredOk = Boolean(hoverProbe.default && hoverProbe.restored
    && hoverProbe.default.backgroundColor === hoverProbe.restored.backgroundColor);
  evidence.hoverContrastProbe = hoverProbe;

  /* 探针 4a：仅全屏遮罩、无 top layer 弹窗时的命中形态（校准基线）。 */
  evidence.hitTestProbeBeforeDialog = await hitProbe(page, 'native-dialog-1');

  /* 探针 4b：打开页面原生 dialog（真实 UI 点击）后的 top layer 命中形态。 */
  await page.locator('#open-dialog-1').click({ timeout: 5000 });
  evidence.dialogOpenedViaUiClick = true;
  await wait(500);
  evidence.hitTestProbe = await hitProbe(page, 'native-dialog-1');

  /* 探针 4c（纯浏览器行为校准，仅本 dry-run 使用）：dialog 已打开后对宿主做
     一次 hidePopover/showPopover 重新提升，测量「后进入 top layer」能否压过
     先打开的 modal dialog，以及 modal dialog 是否让宿主 inert。
     正式裁决执行器 e2e-v2.mjs 不含这两行，也不据此构造任何通过条件。 */
  const repromotion = await page.evaluate(() => {
    const host = document.getElementById('faf-shadow-root');
    let repromoted = false;
    let error = null;
    try {
      if (typeof host.hidePopover === 'function' && typeof host.showPopover === 'function') {
        host.hidePopover();
        host.showPopover();
        repromoted = host.matches(':popover-open');
      }
    } catch (e) { error = String(e); }
    return { repromoted, error, popoverOpen: host.matches(':popover-open') };
  });
  await wait(200);
  evidence.hitTestProbeAfterRepromotion = {
    observationOnly: true,
    ...repromotion,
    hit: await hitProbe(page, 'native-dialog-1'),
  };

  /* 探针 4d（纯浏览器行为校准）：在全新页面上先用真实 UI 点击打开 dialog，
     再触发 CDP 快捷键手势，测量「弹窗先于扩展注入」时的层叠形态。 */
  const page2 = await context.newPage();
  await page2.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await wait(300);
  await page2.locator('#open-dialog-1').click({ timeout: 5000 });
  await wait(300);
  await page2.bringToFront();
  const keyCdp2 = await context.newCDPSession(page2);
  for (const type of ['rawKeyDown', 'keyUp']) {
    await keyCdp2.send('Input.dispatchKeyEvent', {
      type, modifiers: 9, key: 'F', code: 'KeyF',
      windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70,
    });
  }
  await keyCdp2.detach();
  await wait(3200);
  evidence.hitTestProbeDialogBeforeGesture = {
    observationOnly: true,
    dialogOpenedBeforeGesture: true,
    hit: await hitProbe(page2, 'native-dialog-1'),
  };

  /* 探针 4e（纯浏览器语义校准）：在 modal dialog 已打开时，新建三类元素并
     在 FAB 中心测量命中，用于区分「top layer 绘制顺序」与「modal dialog
     使外部内容 inert」两种原因。只观测、不下结论、不留任何页面持久状态。 */
  evidence.inertnessCalibration = await page.evaluate(() => {
    const host = document.getElementById('faf-shadow-root');
    const sr = host?.shadowRoot ?? null;
    const fab = sr?.querySelector('.f-fab') ?? null;
    if (!fab) return { available: false, reason: 'no-fab' };
    const r = fab.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2);
    const y = Math.round(r.y + r.height / 2);
    const mk = (id, style) => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;left:' + (x - 20) + 'px;top:' + (y - 20) +
        'px;width:40px;height:40px;pointer-events:auto;z-index:2147483647;' + style;
      el.textContent = id;
      return el;
    };
    const plain = mk('qa-calib-plain', 'background:rgb(200,0,0);');
    const pop = mk('qa-calib-popover', 'background:rgb(0,160,0);');
    pop.setAttribute('popover', 'manual');
    document.body.appendChild(plain);
    document.body.appendChild(pop);
    let popShown = false;
    let popError = null;
    try { pop.showPopover(); popShown = pop.matches(':popover-open'); }
    catch (e) { popError = String(e); }
    const describe = (el) => el ? { tag: el.tagName, id: el.id, cls: String(el.className || '') } : null;
    const top = document.elementFromPoint(x, y);
    const stack = (document.elementsFromPoint(x, y) || []).slice(0, 8).map(describe);
    const dialog = document.getElementById('native-dialog-1');
    /* 再看「扩展自己用 showModal() 开一个 modal dialog」是否可命中：决定
       AC-V2-22 的「可见且可点击」是否存在可实现路径。 */
    let ownModalHit = null;
    let ownModalError = null;
    let ownModal = null;
    try {
      ownModal = document.createElement('dialog');
      ownModal.id = 'qa-calib-own-modal';
      ownModal.style.cssText = 'position:fixed;left:' + (x - 20) + 'px;top:' + (y - 20) +
        'px;width:40px;height:40px;margin:0;padding:0;background:rgb(0,0,200);';
      ownModal.textContent = 'own-modal';
      document.body.appendChild(ownModal);
      ownModal.showModal();
      const t = document.elementFromPoint(x, y);
      ownModalHit = t ? { tag: t.tagName, id: t.id } : null;
    } catch (e) { ownModalError = String(e); }
    finally {
      try { ownModal?.close(); } catch { /* measurement cleanup */ }
      try { ownModal?.remove(); } catch { /* measurement cleanup */ }
    }
    const observations = {
      available: true,
      point: { x, y },
      dialogModal: Boolean(dialog && dialog.matches(':modal')),
      hostPopoverOpen: host.matches(':popover-open'),
      syntheticPopoverShown: popShown,
      syntheticPopoverError: popError,
      ownModalHit,
      ownModalError,
      elementFromPoint: describe(top),
      elementsFromPoint: stack,
      syntheticPlainInStack: stack.some((e) => e && e.id === 'qa-calib-plain'),
      syntheticPopoverInStack: stack.some((e) => e && e.id === 'qa-calib-popover'),
      fafHostInStack: stack.some((e) => e && e.id === 'faf-shadow-root'),
      dialogInStack: stack.some((e) => e && e.id === 'native-dialog-1'),
    };
    try { pop.hidePopover(); } catch { /* measurement cleanup */ }
    plain.remove();
    pop.remove();
    return observations;
  });

  /* 探针 5（主题裁决 A 附带核查，纯观测）：扩展页 popup / options 是否真的
     存在「--brand-ink 底 + --accent-on 字」的组件组合；并在 light / dark
     两态下用 locator.hover() 真机读主按钮 hover 态 computed style 固化 CR。
     只做测量，不改扩展状态、不构造填充前置条件、不下产品结论。 */
  const extBase = ['chrome-extension', '://', evidence.extensionId].join('');
  const scanTheme = (pageRef) => pageRef.evaluate(() => {
    const root = document.documentElement;
    const tokens = (k) => getComputedStyle(root).getPropertyValue(k).trim();
    const btn = document.querySelector('.f-btn--primary');
    const cs = btn ? getComputedStyle(btn) : null;
    const brandInk = tokens('--brand-ink');
    const accentOn = tokens('--accent-on');
    const hexToRgb = (h) => {
      const m = /^#([0-9a-f]{6})$/i.exec(h);
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
    };
    const brandRgb = hexToRgb(brandInk);
    const accentOnRgb = hexToRgb(accentOn);
    const combos = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return s.backgroundColor === brandRgb && s.color === accentOnRgb;
    }).slice(0, 8).map((el) => ({ tag: el.tagName,
      cls: String(el.className || '').slice(0, 60),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }));
    return {
      theme: root.getAttribute('data-theme') || 'light',
      tokens: { brandInk, accentOn, accent: tokens('--accent'),
        accentActive: tokens('--accent-active') },
      primaryFound: Boolean(btn),
      primaryColor: cs?.color ?? null,
      primaryBackground: cs?.backgroundColor ?? null,
      brandInkAsBackgroundPlusAccentOnText: combos,
      combinationCount: combos.length,
    };
  });
  const themeProbe = { observationOnly: true, verdict: 'observation-only', pages: {} };
  for (const name of ['popup', 'options']) {
    const p = await context.newPage();
    try {
      await p.goto(extBase + '/' + name + '.html', { waitUntil: 'domcontentloaded' });
      await wait(700);
      const lightDefault = await scanTheme(p);
      let lightHover = null;
      let hoverError = null;
      try {
        if (lightDefault.primaryFound) {
          await p.locator('.f-btn--primary').first().hover({ timeout: 4000 });
          lightHover = await scanTheme(p);
          await p.mouse.move(1, 1);
        }
      } catch (e) { hoverError = String(e); }
      await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await wait(120);
      const darkDefault = await scanTheme(p);
      let darkHover = null;
      try {
        if (darkDefault.primaryFound) {
          await p.locator('.f-btn--primary').first().hover({ timeout: 4000 });
          darkHover = await scanTheme(p);
          await p.mouse.move(1, 1);
        }
      } catch (e) { hoverError = hoverError || String(e); }
      const cr = (s) => s && s.primaryColor && s.primaryBackground
        ? wcagCr(s.primaryColor, s.primaryBackground) : null;
      themeProbe.pages[name] = {
        lightDefault, lightHover, darkDefault, darkHover, hoverError,
        cr: {
          lightDefault: cr(lightDefault), lightHover: cr(lightHover),
          darkDefault: cr(darkDefault), darkHover: cr(darkHover),
        },
        brandInkPlusAccentOnTokenCr:
          wcagCr(hexToRgbForNode(darkDefault.tokens.accentOn),
            hexToRgbForNode(darkDefault.tokens.brandInk)),
      };
    } catch (e) {
      themeProbe.pages[name] = { error: String(e) };
    }
    await p.close().catch(() => {});
  }
  evidence.extensionPagesProbe = themeProbe;
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
    computedStyleProbe: {
      available: evidence.computedStyleProbe?.available === true,
      observed: evidence.computedStyleProbe,
    },
    hitTestProbeBeforeDialog: {
      available: evidence.hitTestProbeBeforeDialog?.available === true,
      observed: evidence.hitTestProbeBeforeDialog,
    },
    hitTestProbe: {
      available: evidence.hitTestProbe?.available === true,
      observed: evidence.hitTestProbe,
    },
    /* 纯观测，不参与任何 available 判定，也不构成产品结论。 */
    calibrationOnly: {
      afterRepromotion: evidence.hitTestProbeAfterRepromotion,
      dialogBeforeGesture: evidence.hitTestProbeDialogBeforeGesture,
      inertness: evidence.inertnessCalibration,
      hoverContrast: evidence.hoverContrastProbe,
      extensionPages: evidence.extensionPagesProbe,
    },
  };
  writeFileSync(RESULT_FILE, JSON.stringify({ ...evidence, infrastructure }, null, 2));
  for (const [key, value] of Object.entries(infrastructure)) {
    if (key === 'calibrationOnly') continue; /* 纯观测项不参与 available 判定 */
    console.log(`INFRA ${key}: available=${value.available}`);
  }
  console.log('CALIBRATION_ONLY: afterRepromotion / dialogBeforeGesture / inertness（观测原值，非裁决）');
  console.log('DRY_RUN_FILE: ' + RESULT_FILE);
  console.log('NOTICE: 非 v2.1 裁决、不计入结论');
  await context.close().catch(() => {});
  rmSync(PROFILE, { recursive: true, force: true });
  server.close();
}
