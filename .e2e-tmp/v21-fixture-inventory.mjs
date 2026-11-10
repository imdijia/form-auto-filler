/**
 * v2.1 夹具结构清点（纯静态证据，非裁决）。只读取 fallback.html / overlay.html，
 * 用 jsdom 解析并输出控件 ID、类型、约束与哨兵值清单，供阶段二核对夹具未被改弱。
 * 用法：node .e2e-tmp/v21-fixture-inventory.mjs
 */
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, 'fixtures');
const OUT = resolve(HERE, 'fixtures-inventory-v21.json');
const FILES = ['fallback.html', 'overlay.html'];

const report = {
  kind: 'QA_V21_FIXTURE_INVENTORY',
  isV2Adjudication: false,
  notice: '静态结构清点，非 v2.1 裁决、不计入结论。',
  timestamp: new Date().toISOString(),
  files: [],
  duplicateKeys: [],
  violations: [],
};

for (const name of FILES) {
  const source = readFileSync(join(FIXTURES, name), 'utf8');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const dom = new JSDOM(source, { runScripts: 'dangerously' });
  const doc = dom.window.document;
  const controls = [...doc.querySelectorAll('input, select, textarea, [contenteditable]')]
    .map((el) => ({
      key: el.getAttribute('data-qa-id') || el.id || null,
      id: el.id || null,
      tag: el.tagName,
      type: el.getAttribute('type') || null,
      maxLength: el.getAttribute('maxlength'),
      pattern: el.getAttribute('pattern'),
      min: el.getAttribute('min'),
      max: el.getAttribute('max'),
      step: el.getAttribute('step'),
      placeholder: el.getAttribute('placeholder'),
      name: el.getAttribute('name'),
      ariaLabel: el.getAttribute('aria-label'),
      label: (() => {
        const lab = el.id ? doc.querySelector('label[for="' + el.id + '"]') : null;
        return lab ? (lab.textContent || '').trim() : '';
      })(),
      sentinel: el.getAttribute('value') || '',
      hiddenAttr: el.hasAttribute('hidden'),
      disabled: el.hasAttribute('disabled'),
      readOnly: el.hasAttribute('readonly'),
      inlineDisplayNone: /display\s*:\s*none/.test(el.getAttribute('style') || ''),
      inlineVisibilityHidden: /visibility\s*:\s*hidden/.test(el.getAttribute('style') || ''),
      inDialog: Boolean(el.closest('[role="dialog"]')),
    }));
  const keys = controls.map((c) => c.key).filter(Boolean);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  for (const d of dup) report.duplicateKeys.push(name + ':' + d);
  const qa = dom.window.__qa ?? null;
  report.files.push({
    name,
    sha256,
    bytes: Buffer.byteLength(source, 'utf8'),
    controlCount: controls.length,
    keyedControlCount: keys.length,
    qaCountersPresent: Boolean(qa && 'submitClicks' in qa && 'submitEvents' in qa),
    dialogCount: doc.querySelectorAll('[role="dialog"]').length,
    nativeDialogCount: doc.querySelectorAll('dialog').length,
    maskPresent: Boolean(doc.getElementById('z-mask')),
    controls,
  });
  const rules = [
    { id: 'external-url', re: /https?:\/\// },
    { id: 'remote-font', re: /@import\s+url\(|@font-face|\.woff2?|\.ttf|fonts\.googleapis/i },
    { id: 'external-tag', re: /<link\b|<script[^>]+src=|<img[^>]+src=/i },
    { id: 'emoji-icon', re: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u },
    { id: 'purple-pink-gradient', re: /from-purple[\s\S]{0,40}to-pink|7C3AED[\s\S]{0,40}(?:A855F7|EC4899)/i },
    { id: 'ai-filler-copy', re: /Welcome to|Lorem ipsum|Sign up today/i },
  ];
  for (const rule of rules) {
    if (rule.re.test(source)) report.violations.push(name + ':' + rule.id);
  }
  dom.window.close();
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('INVENTORY_FILE: ' + OUT);
console.log('files=' + report.files.length
  + ' duplicateKeys=' + report.duplicateKeys.length
  + ' violations=' + report.violations.length);
for (const f of report.files) {
  console.log('  ' + f.name + ': controls=' + f.controlCount
    + ' keyed=' + f.keyedControlCount
    + ' qaCounters=' + f.qaCountersPresent
    + ' dialogs=' + f.dialogCount
    + ' nativeDialogs=' + f.nativeDialogCount
    + ' mask=' + f.maskPresent);
}
if (report.duplicateKeys.length > 0 || report.violations.length > 0) process.exitCode = 1;
