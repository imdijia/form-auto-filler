/**
 * Phase 4 real-browser E2E (QA-owned, read-only w.r.t. project source).
 *
 * Browser: Microsoft Edge 157 (Chromium) — branded Chrome 156 removed
 * `--load-extension` in Chrome >=137; Edge still supports it. The unpacked
 * MV3 build at .output/chrome-mv3 is loaded unchanged.
 *
 * Every assertion writes a {id, ok, expected, actual, evidence} record.
 * Nothing is reported as a pass unless it was actually observed.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXT = resolve(ROOT, '.output/chrome-mv3');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 18765;
const ORIGIN = `http://localhost:${PORT}`;
const PROFILE = resolve(HERE, 'profile-e2e');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA 表单页</title>
<style>.is-error{border:2px solid #d00!important}body{font-family:system-ui}</style></head><body>
<div class="search-bar"><label for="global-search">搜索</label>
  <input id="global-search" type="search" placeholder="搜索关键字" aria-label="搜索"></div>
<div role="dialog" id="dlg" aria-label="人员信息"><h2>人员信息</h2>
<form id="qa-form" novalidate>
  <div class="form-row"><label for="f-name">姓名</label><input id="f-name" name="personName" type="text"></div>
  <div class="form-row"><label for="f-idcard">身份证号</label><input id="f-idcard" name="idCard" type="text" maxlength="18" pattern="[0-9]{17}[0-9Xx]"></div>
  <div class="form-row"><label for="f-phone">手机号码</label><input id="f-phone" name="phone" type="tel" maxlength="11" pattern="1[3-9][0-9]{9}"></div>
  <div class="form-row"><label for="f-birth">出生日期</label><input id="f-birth" name="birth" type="text" placeholder="YYYY-MM-DD"></div>
  <div class="form-row"><label for="f-gender">性别</label><select id="f-gender" name="gender"><option value="">请选择</option><option value="男">男</option><option value="女">女</option></select></div>
  <div class="form-row"><label for="f-edu">学历</label><select id="f-edu" name="education"><option value="">请选择</option><option value="本科">本科</option><option value="硕士">硕士</option><option value="博士">博士</option></select></div>
  <div class="form-row"><label for="f-email">邮箱</label><input id="f-email" name="email" type="email"></div>
  <div class="form-row"><label for="f-amount">金额</label><input id="f-amount" name="amount" type="number" min="10" max="1000" step="0.5"></div>
  <div class="form-row"><label for="f-note">备注</label><textarea id="f-note" name="note" maxlength="30"></textarea></div>
  <div class="form-row"><label for="f-landline">固定电话</label><input id="f-landline" name="landline" type="tel"></div>
  <div class="form-row"><label for="f-address">详细地址</label><input id="f-address" name="address" type="text"></div>
  <div class="form-row"><label for="f-org">所在单位</label><input id="f-org" name="organization" type="text"></div>
  <div class="form-row"><label for="f-school">毕业院校</label><input id="f-school" name="school" type="text"></div>
  <div class="form-row"><label for="f-job">职位</label><input id="f-job" name="jobTitle" type="text"></div>
  <div class="form-row"><label for="f-code">邮政编码</label><input id="f-code" name="code" type="text" maxlength="6" pattern="[0-9]{6}"></div>
  <div class="form-row"><label for="f-qty">数量</label><input id="f-qty" name="quantity" type="number" min="1" max="10" step="1"></div>
  <div class="form-row"><label for="f-pct">百分比</label><input id="f-pct" name="percentage" type="number" min="0" max="100"></div>
  <div class="form-row"><label for="f-time">时间</label><input id="f-time" name="time" type="text"></div>
  <div class="form-row"><label for="f-readonly">只读编号</label><input id="f-readonly" type="text" readonly></div>
  <div class="form-row"><label for="f-disabled">禁用项</label><input id="f-disabled" type="text" disabled></div>
  <div class="form-row"><label for="f-pwd">密码</label><input id="f-pwd" type="password"></div>
  <button type="submit" id="submit-btn">保存</button>
</form></div>
<script>
window.__qa = { submitClicks: 0, submitEvents: 0, errors: [], blurInvalid: [] };
document.getElementById('submit-btn').addEventListener('click', () => { window.__qa.submitClicks += 1; });
document.getElementById('qa-form').addEventListener('submit', (e) => { e.preventDefault(); window.__qa.submitEvents += 1; });
window.addEventListener('error', (e) => window.__qa.errors.push(String(e.message)));
for (const el of document.querySelectorAll('#qa-form input, #qa-form select, #qa-form textarea')) {
  el.addEventListener('blur', () => {
    const bad = typeof el.checkValidity === 'function' && !el.checkValidity();
    el.classList.toggle('is-error', bad);
    el.setAttribute('aria-invalid', String(bad));
    if (bad) window.__qa.blurInvalid.push(el.id + ':' + el.value);
  });
}
</script></body></html>`;

const results = [];
function record(id, ok, expected, actual, evidence) {
  results.push({ id, ok: Boolean(ok), expected, actual, evidence });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} :: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  if (evidence) console.log('     evidence=' + JSON.stringify(evidence).slice(0, 700));
}

/** Independent GB 11643 oracle — never imported from the implementation. */
function idCardOk(raw) {
  if (!/^\d{17}[\dXx]$/.test(raw)) return false;
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const map = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(raw[i]) * w[i];
  const check = map[sum % 11];
  const year = Number(raw.slice(6, 10));
  const month = Number(raw.slice(10, 12));
  const day = Number(raw.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day));
  const calendarOk = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && year >= 1900 && year <= new Date().getUTCFullYear();
  return raw[17].toUpperCase() === check && calendarOk;
}

/** Vanilla emulation of a React controlled input with inputValueTracking:
 * a plain `el.value = x` assignment is swallowed by the instance setter and
 * never reaches component state; only the dispatched input/change event does.
 * This is the ARCH §12 #5 / §18 #9 payload assertion. */
const REACT_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA React 受控页</title></head><body>
<div role="dialog" id="dlg"><h2>人员信息</h2><form id="qa-form" novalidate>
  <div class="form-row"><label for="react-name">姓名</label><input id="react-name" name="personName" type="text"></div>
  <button type="button" id="check-payload">检查提交载荷</button><span id="payload-out"></span>
  <button type="submit" id="submit-btn">保存</button>
</form></div>
<script>
window.__qa = { submitClicks: 0, submitEvents: 0, errors: [], payload: null };
let state = '';
const el = document.getElementById('react-name');
const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
Object.defineProperty(el, 'value', {
  configurable: true,
  get() { return proto.get.call(this); },
  set(_v) { /* React controlled input: direct DOM assignment is ignored */ }
});
el.addEventListener('input', () => { state = proto.get.call(el); });
el.addEventListener('change', () => { state = proto.get.call(el); });
document.getElementById('check-payload').addEventListener('click', () => {
  window.__qa.payload = state;
  document.getElementById('payload-out').textContent = state;
});
document.getElementById('submit-btn').addEventListener('click', () => { window.__qa.submitClicks += 1; });
document.getElementById('qa-form').addEventListener('submit', (e) => { e.preventDefault(); window.__qa.submitEvents += 1; });
</script></body></html>`;

/** G18-03: non-default valueFormat must drive the generated date string. */
const FORMAT_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA valueFormat 页</title></head><body>
<div role="dialog" id="dlg"><h2>人员信息</h2><form id="qa-form" novalidate>
  <div class="form-row"><label for="fmt-name">姓名</label><input id="fmt-name" name="personName" type="text"></div>
  <div class="form-row"><label for="fmt-date">出生日期</label>
    <input id="fmt-date" name="birth" type="text" data-value-format="YYYY/MM/DD" placeholder="YYYY/MM/DD"></div>
</form></div>
<script>window.__qa = { submitClicks: 0, submitEvents: 0, errors: [] };</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url.startsWith('/react') ? REACT_HTML
    : req.url.startsWith('/format') ? FORMAT_HTML : PAGE_HTML);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const outbound = [];
const allRequests = [];
const pageConsole = [];
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

let cdpNet;
try {
  context.on('request', (req) => {
    const url = req.url();
    allRequests.push(url);
    const isLocal = url.startsWith(`${ORIGIN}/`) || url.startsWith('chrome-extension://')
      || url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')
      || url.startsWith('devtools://');
    if (!isLocal) outbound.push({ url, method: req.method(), resourceType: req.resourceType() });
  });

  await wait(2500);
  const sw = context.serviceWorkers()[0];
  const extId = sw?.url().split('/')[2] ?? null;
  record('E2E-00 扩展已加载（MV3 service worker 注册）', Boolean(extId), 'chrome-extension id', extId, { worker: sw?.url() ?? null });
  if (!extId) throw new Error('EXTENSION_NOT_LOADED');

  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => pageConsole.push({ type: m.type(), text: m.text().slice(0, 300) }));
  page.on('pageerror', (e) => pageConsole.push({ type: 'pageerror', text: String(e).slice(0, 300) }));

  // CDP Network evidence for extension-initiated requests.
  cdpNet = await context.newCDPSession(page);
  const cdpRequests = [];
  await cdpNet.send('Network.enable');
  cdpNet.on('Network.requestWillBeSent', (e) => {
    cdpRequests.push({ url: e.request.url, initiator: e.initiator?.url ?? e.initiator?.type ?? '' });
  });

  const cfg = await context.newPage();
  await cfg.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  const perms = await cfg.evaluate(async () => {
    // @ts-ignore
    return await chrome.permissions.getAll();
  });
  record('E2E-01 安装期无宽泛权限：无 host_permissions / 无 <all_urls>',
    Array.isArray(perms.origins) && perms.origins.length === 0,
    'origins=[]', perms.origins, { permissions: perms.permissions, origins: perms.origins });

  const commands = await cfg.evaluate(async () => {
    // @ts-ignore
    return await chrome.commands.getAll();
  });
  const declared = ['open-plan', 'scope-current-form', 'scope-current-row', 'open-picker'];
  const bound = commands.filter((c) => declared.includes(c.name) && c.shortcut);
  record('E2E-01b manifest 4 条 commands 均在 getAll() 中可见',
    declared.every((n) => commands.some((c) => c.name === n)),
    declared, commands.map((c) => `${c.name}=${c.shortcut || '(unbound)'}`), null);

  await cfg.evaluate(async () => {
    // @ts-ignore
    await chrome.storage.local.set({ 'faf.siteAllowlist.v1': ['localhost'] });
  });
  const storedAllowlist = await cfg.evaluate(async () => {
    // @ts-ignore
    return (await chrome.storage.local.get('faf.siteAllowlist.v1'))['faf.siteAllowlist.v1'];
  });
  record('E2E-01c 白名单配置为 localhost（options 存储通道）',
    JSON.stringify(storedAllowlist) === '["localhost"]', '["localhost"]', storedAllowlist, null);

  const snapshot = () => page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.id) out[el.id] = el.value;
    }
    return { values: out, qa: window.__qa, errorClasses: [...document.querySelectorAll('.is-error')].map((e) => e.id) };
  });

  /** The only reliable user-gesture path in headless: CDP raw key with Alt+Shift. */
  async function gesture(key = 'F', code = 'KeyF', vk = 70) {
    await page.bringToFront();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 9, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 9, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await cdp.detach();
  }
  const shadowExists = () => page.evaluate(() => Boolean(document.getElementById('faf-shadow-root'))).catch(() => false);
  const panelState = () => page.evaluate(() => {
    const root = document.getElementById('faf-shadow-root')?.shadowRoot;
    if (!root) return null;
    const panel = root.querySelector('.f-panel');
    const primary = root.querySelector('.f-btn--primary');
    const hint = root.querySelector('.f-hint');
    const rows = [...root.querySelectorAll('.f-table .f-row:not(.f-row--head)')].map((r) => ({
      label: r.querySelector('.f-row__label')?.textContent?.trim() ?? '',
      control: r.querySelector('.f-control-type')?.textContent?.trim() ?? '',
      type: r.querySelector('.f-select')?.value ?? '',
      value: r.querySelector('.f-row__value')?.textContent?.trim() ?? '',
    }));
    return {
      panelOpen: Boolean(panel),
      summary: root.querySelector('.f-summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      panelText: panel?.innerText?.replace(/\s+/g, ' ').slice(0, 700) ?? null,
      confirmLabel: primary?.textContent?.trim() ?? null,
      confirmDisabled: primary?.disabled ?? null,
      hint: hint?.textContent?.trim() ?? null,
      rows,
    };
  });

  await page.goto(`${ORIGIN}/form`, { waitUntil: 'domcontentloaded' });
  await page.locator('#f-name').focus();
  const beforeGesture = await snapshot();
  record('E2E-02 首次手势前未注入（无 shadow host，页面无扩展痕迹）',
    (await shadowExists()) === false, false, await shadowExists(), null);

  await gesture();
  await wait(2600);
  record('E2E-02b 用户手势（Alt+Shift+F / CDP 原生按键）后注入成功',
    await shadowExists(), true, await shadowExists(), null);

  const afterPlan = await panelState();
  const valuesAtPlan = await snapshot();
  record('E2E-03 打开计划预览：面板可见且列出控件',
    Boolean(afterPlan?.panelOpen && afterPlan.rows.length > 0),
    'panelOpen=true, rows>0',
    { panelOpen: afterPlan?.panelOpen, rows: afterPlan?.rows.length },
    { summary: afterPlan?.summary, rows: afterPlan?.rows });
  record('E2E-03b 预览阶段所有控件值零变化',
    JSON.stringify(valuesAtPlan.values) === JSON.stringify(beforeGesture.values),
    'identical snapshots', { added: Object.keys(valuesAtPlan.values).filter((k) => valuesAtPlan.values[k] !== beforeGesture.values[k]) }, null);
  record('E2E-03c 预览阶段提交按钮未被点击 / 表单未提交',
    valuesAtPlan.qa.submitClicks === 0 && valuesAtPlan.qa.submitEvents === 0,
    { submitClicks: 0, submitEvents: 0 },
    { submitClicks: valuesAtPlan.qa.submitClicks, submitEvents: valuesAtPlan.qa.submitEvents }, null);

  // Confirm the plan through the real UI button inside the open shadow root.
  const primary = page.locator('#faf-shadow-root .f-btn--primary');
  let clicked = false;
  try {
    await primary.click({ timeout: 6000 });
    clicked = true;
  } catch {
    clicked = await page.evaluate(() => {
      const b = document.getElementById('faf-shadow-root')?.shadowRoot?.querySelector('.f-btn--primary');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    });
  }
  record('E2E-04 确认计划按钮可点击（真实 Shadow DOM 交互）', clicked, true, clicked,
    { confirmLabel: afterPlan?.confirmLabel, disabled: afterPlan?.confirmDisabled });

  await wait(4200);
  const afterFill = await snapshot();
  const v = afterFill.values;

  record('E2E-04b 值已写入（9 个目标控件非空）',
    ['f-name', 'f-idcard', 'f-phone', 'f-birth', 'f-gender', 'f-edu', 'f-email', 'f-amount', 'f-note']
      .every((k) => typeof v[k] === 'string' && v[k].length > 0),
    '9 non-empty', Object.fromEntries(['f-name', 'f-idcard', 'f-phone', 'f-birth', 'f-gender', 'f-edu', 'f-email', 'f-amount', 'f-note'].map((k) => [k, v[k]])), null);

  record('E2E-04c 身份证 18 位 + GB11643 校验位 + 合法出生日期（独立 oracle）',
    idCardOk(v['f-idcard']), true, idCardOk(v['f-idcard']), { idCard: v['f-idcard'] });
  record('E2E-04d 手机号命中 ^1[3-9][0-9]{9}$',
    /^1[3-9][0-9]{9}$/.test(v['f-phone'] ?? ''), true, /^1[3-9][0-9]{9}$/.test(v['f-phone'] ?? ''), { phone: v['f-phone'] });
  const birthFlat = String(v['f-birth'] ?? '').replace(/\D/g, '');
  const idBirth = String(v['f-idcard'] ?? '').slice(6, 14);
  record('E2E-04e 日期 = 身份证 7-14 位',
    birthFlat === idBirth, idBirth, birthFlat, { date: v['f-birth'], idCard: v['f-idcard'] });
  const parity = Number(String(v['f-idcard'] ?? '')[16]) % 2;
  const genderExpected = parity === 1 ? '男' : '女';
  record('E2E-04f 性别 = 身份证第 17 位奇偶',
    v['f-gender'] === genderExpected, genderExpected, v['f-gender'], { parity, idCard: v['f-idcard'] });
  record('E2E-04g 枚举值来自页面 option 集合（学历 / 性别）',
    ['本科', '硕士', '博士'].includes(v['f-edu']) && ['男', '女'].includes(v['f-gender']),
    'page options', { education: v['f-edu'], gender: v['f-gender'] }, null);
  const amount = Number(v['f-amount']);
  record('E2E-04h 金额尊重 min/max/step',
    Number.isFinite(amount) && amount >= 10 && amount <= 1000 && Math.abs((amount - 10) / 0.5 - Math.round((amount - 10) / 0.5)) < 1e-9,
    'in [10,1000] on 0.5 lattice', { amount: v['f-amount'] }, null);
  record('E2E-04i 备注尊重 maxlength=30 且含中文',
    (v['f-note'] ?? '').length <= 30 && /[\u4e00-\u9fa5]/.test(v['f-note'] ?? ''),
    'len<=30 && chinese', { note: v['f-note'], len: (v['f-note'] ?? '').length }, null);

  // Blur every filled control: page-side instant validation must not raise a red frame.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#qa-form input, #qa-form select, #qa-form textarea')) el.dispatchEvent(new FocusEvent('blur'));
  });
  await wait(400);
  const afterBlur = await snapshot();
  record('E2E-04j 失焦即时校验无红框（aria-invalid / .is-error 均清零）',
    afterBlur.errorClasses.length === 0 && afterBlur.qa.blurInvalid.length === 0,
    { errorClasses: [], blurInvalid: [] },
    { errorClasses: afterBlur.errorClasses, blurInvalid: afterBlur.qa.blurInvalid }, null);
  record('E2E-04k 填充后提交按钮仍未被点击 / 表单未提交',
    afterBlur.qa.submitClicks === 0 && afterBlur.qa.submitEvents === 0,
    { submitClicks: 0, submitEvents: 0 },
    { submitClicks: afterBlur.qa.submitClicks, submitEvents: afterBlur.qa.submitEvents }, null);

  // G12-04: read the persisted FillReport from the real extension storage.
  const storedReport = await cfg.evaluate(async () => {
    // @ts-ignore
    const r = (await chrome.storage.local.get('faf.lastResult.v1'))['faf.lastResult.v1'];
    if (!r) return null;
    const separate = (r.outcomes ?? []).filter((o) =>
      o.skipReason === 'low-confidence' || o.skipReason === 'unsupported-control'
      || o.code === 'E_UNSUPPORTED_CONTROL').length;
    return { total: r.total, filled: r.filled, skipped: r.skipped, failed: r.failed,
      separate, outcomes: r.outcomes?.length ?? null };
  });
  record('E2E-12 G12-04 FillReport 现行分组可账：filled+skipped+failed+单独分组 === total',
    Boolean(storedReport)
      && storedReport.filled + storedReport.skipped + storedReport.failed + storedReport.separate === storedReport.total,
    'reconciles to total', storedReport, null);
  // Informational: the literal v1.0 invariant in ARCH §12 #4 no longer holds
  // because §14-18 / UIUX R15 introduced separate disposition groups.
  record('E2E-12b ARCH §12 #4 旧字面不变量 filled+skipped+failed===total 的实测值（信息项）',
    true, 'informational',
    { literalSum: storedReport ? storedReport.filled + storedReport.skipped + storedReport.failed : null,
      total: storedReport?.total ?? null,
      note: 'v1.0 wording; separate groups intentionally excluded from the 3 counters' }, null);
  const counters = await cfg.evaluate(async () => {
    // @ts-ignore
    return (await chrome.storage.local.get('faf.counters.v1'))['faf.counters.v1'] ?? null;
  });
  record('E2E-13 本地诊断计数存在且与结果分键（faf.counters.v1）',
    counters !== null && typeof counters === 'object',
    'counters object present', counters, null);

  // G18-11 undo closed loop (DOM value restore + no submit).
  const undoClicked = await page.evaluate(() => {
    const root = document.getElementById('faf-shadow-root')?.shadowRoot;
    const b = [...(root?.querySelectorAll('button') ?? [])]
      .find((x) => (x.textContent ?? '').includes('撤销本次填充'));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  await wait(2600);
  const afterUndo = await snapshot();
  const filledIds = ['f-name', 'f-idcard', 'f-phone', 'f-birth', 'f-gender', 'f-edu', 'f-email', 'f-amount', 'f-note'];
  record('E2E-10 undo 闭环：撤销按钮可用且已填控件恢复为空值',
    undoClicked && filledIds.every((k) => (afterUndo.values[k] ?? '') === (beforeGesture.values[k] ?? '')),
    'undo=true, all 9 restored',
    { undoClicked, notRestored: filledIds.filter((k) => afterUndo.values[k] !== beforeGesture.values[k]) }, null);
  record('E2E-10b undo 后提交计数仍为 0',
    afterUndo.qa.submitClicks === 0 && afterUndo.qa.submitEvents === 0,
    { submitClicks: 0, submitEvents: 0 },
    { submitClicks: afterUndo.qa.submitClicks, submitEvents: afterUndo.qa.submitEvents }, null);

  const protectedIds = ['global-search', 'f-readonly', 'f-disabled', 'f-pwd'];
  const misfills = protectedIds.filter((id) => (afterFill.values[id] ?? '') !== (beforeGesture.values[id] ?? ''));
  record('E2E-05 误填 0：容器外搜索框 / readonly / disabled / password 全部未写入',
    misfills.length === 0, [], misfills,
    Object.fromEntries(protectedIds.map((id) => [id, { before: beforeGesture.values[id], after: afterFill.values[id] }])));
  record('E2E-05b 结果面板「超范围 / 已排除 / 待绑定」分组可见（控件类型 5 类纯文本）',
    (afterPlan?.summary ?? '').includes('已排除') && (afterPlan?.summary ?? '').includes('超范围'),
    'group labels present', afterPlan?.summary, null);

  // Step 6: remove the domain from the allowlist -> must refuse with a hint.
  await cfg.evaluate(async () => {
    // @ts-ignore
    await chrome.storage.local.set({ 'faf.siteAllowlist.v1': [] });
  });
  const beforeDeny = await snapshot();
  await gesture();
  await wait(1800);
  const denyPanel = await panelState();
  const afterDeny = await snapshot();
  // NOTE: the plan panel from step 4 is still open. AC-6 requires "refuse +
  // explicit hint + zero writes", not "close an already-open panel". The
  // safety contract is: deny hint shown AND confirm button disabled.
  record('E2E-06 域名移出白名单后拒绝填充并给出明确提示（确认按钮置灰）',
    Boolean(denyPanel?.hint && /白名单|仅测试域名/.test(denyPanel.hint)) && denyPanel?.confirmDisabled === true,
    'deny hint + confirm disabled',
    { hint: denyPanel?.hint, panelOpen: denyPanel?.panelOpen, confirmDisabled: denyPanel?.confirmDisabled }, null);
  record('E2E-06b 拒绝后所有控件值零变化',
    JSON.stringify(afterDeny.values) === JSON.stringify(beforeDeny.values),
    'identical snapshots',
    Object.keys(afterDeny.values).filter((k) => afterDeny.values[k] !== beforeDeny.values[k]), null);
  // Negative / defence-in-depth probe: force-invoke the confirm handler even
  // though the button is disabled. state.allowed must still block the write.
  await page.evaluate(() => {
    const b = document.getElementById('faf-shadow-root')?.shadowRoot?.querySelector('.f-btn--primary');
    if (b) { b.removeAttribute('disabled'); b.click(); }
  });
  await wait(1500);
  const afterForced = await snapshot();
  record('E2E-06c 强制触发确认处理器后仍不写入（动作层二次校验 state.allowed）',
    JSON.stringify(afterForced.values) === JSON.stringify(beforeDeny.values),
    'identical snapshots',
    Object.keys(afterForced.values).filter((k) => afterForced.values[k] !== beforeDeny.values[k]), null);

  // Step 2: refresh -> injection is gone -> gesture required again.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(600);
  record('E2E-07 页面刷新后注入失效（需再次手势）',
    (await shadowExists()) === false, false, await shadowExists(), null);
  await cfg.evaluate(async () => {
    // @ts-ignore
    await chrome.storage.local.set({ 'faf.siteAllowlist.v1': ['localhost'] });
  });
  await page.locator('#f-name').focus();
  await gesture();
  await wait(2200);
  record('E2E-07b 刷新后再次手势可重新注入并打开计划',
    await shadowExists(), true, await shadowExists(), null);

  // Popup fallback text for unbound shortcuts (ARCH 16.2 / G18-14).
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await wait(600);
  // Opening a new tab makes IT the active tab, so popup.load() saw the
  // extension URL and rendered the "非白名单" branch. Bring the test page to
  // front and reload the popup so load() reads the real localhost tab.
  await page.bringToFront();
  await popup.reload({ waitUntil: 'domcontentloaded' });
  await wait(1600);
  const popupText = await popup.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 700));
  const unbound = commands.filter((c) => declared.includes(c.name) && !c.shortcut).map((c) => c.name);
  record('E2E-08 快捷键未绑定时 popup 给出纯文本降级提示',
    unbound.length === 0 || /快捷键未生效/.test(popupText),
    unbound.length === 0 ? 'all bound' : 'plain-text warning',
    { unbound, popupHasWarning: /快捷键未生效/.test(popupText), envBranch: /非白名单域名/.test(popupText) ? 'denied' : 'allowed' },
    { popupText });
  // Advisory evidence: getAll() always contains _execute_action with an empty
  // shortcut, so a naive `commands.some(!shortcut)` would warn even when all
  // four user commands are bound. Capture the exact condition.
  record('E2E-08b 降级提示判定是否误把 _execute_action 计入（信息项，不判失败）',
    true, 'informational',
    { executeActionShortcut: commands.find((c) => c.name === '_execute_action')?.shortcut ?? null,
      userCommandsUnbound: unbound }, null);
  await popup.close();

  // Regression for advisory A3 (popup/App.vue fixed at 15:01, AFTER the first
  // E2E run): `chrome.commands.getAll()` always contains `_execute_action`
  // with an empty shortcut. The old naive `commands.some(!shortcut)` would
  // render "快捷键未生效" even when all four user commands are bound. Simulate
  // exactly that state: 4 user commands bound, `_execute_action` still empty.
  // A pass is a real discriminator (old code -> warning shown -> fail).
  const popup2 = await context.newPage();
  await popup2.addInitScript(() => {
    const fake = [
      { name: '_execute_action', description: '', shortcut: '' },
      { name: 'open-plan', description: '', shortcut: 'Alt+Shift+F' },
      { name: 'scope-current-form', description: '', shortcut: 'Alt+Shift+G' },
      { name: 'scope-current-row', description: '', shortcut: 'Alt+Shift+H' },
      { name: 'open-picker', description: '', shortcut: 'Alt+Shift+J' },
    ];
    const getAll = () => Promise.resolve(fake);
    const patch = (root) => {
      const api = root && root.commands;
      if (!api) return false;
      try { api.getAll = getAll; } catch { /* read-only native API */ }
      try {
        Object.defineProperty(api, 'getAll', {
          configurable: true, writable: true, value: getAll,
        });
      } catch { /* read-only native API */ }
      return api.getAll === getAll;
    };
    globalThis.__qaPatch = { chrome: patch(globalThis.chrome), browser: patch(globalThis.browser) };
  });
  await popup2.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await popup2.reload({ waitUntil: 'domcontentloaded' });
  await wait(1600);
  const patchState = await popup2.evaluate(async () => {
    const api = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
    const list = await api.commands.getAll();
    return {
      shimIsChrome: api === globalThis.chrome,
      patchFlags: globalThis.__qaPatch,
      list: list.map((c) => ({ name: c.name, shortcut: c.shortcut })),
    };
  });
  const popup2Text = await popup2.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const userNames = ['open-plan', 'scope-current-form', 'scope-current-row', 'open-picker'];
  const allUserBound = userNames.every((n) => Boolean(patchState.list.find((c) => c.name === n)?.shortcut));
  const execActionEmpty = patchState.list.find((c) => c.name === '_execute_action')?.shortcut === '';
  const warningShown = /快捷键未生效/.test(popup2Text);
  record('E2E-08c A3 回归：4 条用户命令全绑定且 _execute_action 空快捷键时不显示降级提示',
    allUserBound && execActionEmpty && !warningShown,
    'all 4 user commands bound + _execute_action empty -> no warning',
    { patchedCommands: patchState.list, shimIsChrome: patchState.shimIsChrome,
      patchFlags: patchState.patchFlags, warningShown },
    { popup2Text: popup2Text.slice(0, 300) });
  await popup2.close();

  // Three hard metrics.
  const finalQa = (await snapshot()).qa;
  record('HARD-1 误填次数 = 0', misfills.length === 0, 0, misfills.length, null);
  record('HARD-2 自动提交次数 = 0',
    finalQa.submitClicks === 0 && finalQa.submitEvents === 0, 0,
    { submitClicks: finalQa.submitClicks, submitEvents: finalQa.submitEvents }, null);
  const extInitiated = [];
  cdpNet.on('Network.requestWillBeSent', () => {}); // keep listener alive
  record('HARD-3 扩展外发请求数 = 0',
    outbound.length === 0, 0, outbound.length,
    { outbound, totalRequestsObserved: allRequests.length, sample: allRequests.slice(0, 12) });

  // Isolation: no extension log leaked into host page console.
  const hostLogs = pageConsole.filter((c) => /FAF|background|filler|extension/i.test(c.text));
  record('E2E-09 宿主页控制台无扩展日志', hostLogs.length === 0, 0, hostLogs.length,
    { pageConsole: pageConsole.slice(0, 10) });
  record('E2E-09b 宿主页无未捕获异常', pageConsole.filter((c) => c.type === 'pageerror').length === 0,
    0, pageConsole.filter((c) => c.type === 'pageerror').length,
    { pageErrors: pageConsole.filter((c) => c.type === 'pageerror').slice(0, 5) });

  // G12-05 / G18-09: React-style controlled input. A plain `el.value = x`
  // is swallowed by the instance setter; only the native prototype setter +
  // dispatched input/change event updates component state (payload).
  await page.goto(`${ORIGIN}/react`, { waitUntil: 'domcontentloaded' });
  await wait(500);
  await page.locator('#react-name').focus();
  await gesture();
  await wait(2600);
  const reactPlan = await panelState();
  const reactConfirmed = await page.evaluate(() => {
    const b = document.getElementById('faf-shadow-root')?.shadowRoot?.querySelector('.f-btn--primary');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  await wait(3200);
  await page.locator('#check-payload').click();
  const reactState = await page.evaluate(() => ({
    dom: document.getElementById('react-name')?.value ?? '',
    payload: window.__qa.payload,
    submitClicks: window.__qa.submitClicks,
    submitEvents: window.__qa.submitEvents,
  }));
  record('E2E-11 React 受控输入：原生 setter + 派发事件使提交 payload 非空且与 DOM 一致',
    Boolean(reactConfirmed) && typeof reactState.payload === 'string'
      && reactState.payload.length > 0 && reactState.payload === reactState.dom,
    'payload non-empty === dom value',
    reactState,
    { planRows: reactPlan?.rows?.length, panelOpen: reactPlan?.panelOpen });
  record('E2E-11b React 页未发生自动提交',
    reactState.submitClicks === 0 && reactState.submitEvents === 0,
    { submitClicks: 0, submitEvents: 0 },
    { submitClicks: reactState.submitClicks, submitEvents: reactState.submitEvents }, null);

  // G18-03: non-default valueFormat drives the generated date string.
  await page.goto(`${ORIGIN}/format`, { waitUntil: 'domcontentloaded' });
  await wait(500);
  await page.locator('#fmt-name').focus();
  await gesture();
  await wait(2500);
  const formatConfirmed = await page.evaluate(() => {
    const b = document.getElementById('faf-shadow-root')?.shadowRoot?.querySelector('.f-btn--primary');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  await wait(3000);
  const formatValues = await page.evaluate(() => ({
    name: document.getElementById('fmt-name')?.value ?? '',
    date: document.getElementById('fmt-date')?.value ?? '',
  }));
  record('E2E-14 G18-03 非默认 valueFormat（YYYY/MM/DD）生成值按格式产出',
    formatConfirmed && /^\d{4}\/\d{2}\/\d{2}$/.test(formatValues.date),
    'YYYY/MM/DD', formatValues, null);
} catch (err) {
  record('E2E-FATAL 执行器异常', false, 'no exception', String(err), { stack: String(err?.stack ?? '').slice(0, 900) });
} finally {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const summary = {
    browser: 'Microsoft Edge 157 (Chromium), headless=new',
    extPath: EXT,
    timestamp: new Date().toISOString(),
    total: results.length, passed, failed,
    hardMetrics: Object.fromEntries(results.filter((r) => r.id.startsWith('HARD-')).map((r) => [r.id, { ok: r.ok, actual: r.actual }])),
    results,
  };
  writeFileSync(resolve(HERE, 'e2e-result.json'), JSON.stringify(summary, null, 2));
  console.log(`\nSUMMARY: total=${summary.total} passed=${passed} failed=${failed}`);
  console.log('RESULT_FILE: ' + resolve(HERE, 'e2e-result.json'));
  await context.close().catch(() => {});
  server.close();
}
