/**
 * Phase 3 static gates. Read-only; no dependency is installed, no network is
 * used. Sources: SPEC-v1 §4/§8/§10/§11, ARCH-v1 §15.4/§17.1, UIUX-v1 §9.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROOTS = ['src', 'entrypoints'].map((dir) => join(ROOT, dir));
const SOURCE = /\.(?:ts|vue|css|html|json)$/;

function collect(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (SOURCE.test(entry.name)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap(collect);
const text = (file) => readFileSync(file, 'utf8');
const rel = (file) => relative(ROOT, file).replace(/\\/g, '/');
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

function hits(label, pattern, scope = files, options = {}) {
  const found = [];
  for (const file of scope) {
    const source = options.raw ? text(file) : strip(text(file));
    pattern.lastIndex = 0;
    if (pattern.test(source)) found.push(rel(file));
  }
  if (found.length > 0) problems.push(label + ' -> ' + found.join(', '));
}

hits('P0 emoji as functional icon', /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
hits('P0 outbound network API', /\bfetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket\b|new\s+EventSource\b|\.sendBeacon\s*\(/);
hits('P0 framework internals', /__vue__|__vueParentComponent|_reactInternalFiber|__reactProps\$/);
hits('P0 forbidden icon dependency', /lucide-vue-next/);
hits('P0 AI filler copy', /Welcome to|Lorem ipsum|Sign up today/i);
hits('P1 purple-pink gradient', /from-purple[\s\S]{0,40}to-pink|7C3AED[\s\S]{0,40}(?:A855F7|EC4899)/i);
hits('P0 old verification alias', /E_VERIFICATION_FAILED|FillOutcome/);
hits('P0 remote font or stylesheet', /(?:https?:\/\/)[^\s"']*\.(?:woff2?|ttf|css)|@import\s+url\(/i);

const fillFiles = files.filter((file) => /(?:^|\/)fill\//.test(rel(file)));
hits('P0 bare el.value = assignment in src/fill', /\.\s*value\s*=\s*[^=]/, fillFiles);

const uiFiles = files.filter((file) => /(?:^|\/)(?:ui|entrypoints)\//.test(rel(file)));
hits('AC-2 primary submit label', /['"`]\s*(?:提交|确定|保存并提交)\s*['"`]/, uiFiles);

const pure = files.filter((file) =>
  /\/(?:detection|data|fill|execution)\//.test(rel(file)) && rel(file).endsWith('.ts'),
);
hits('ARCH 5.2 dependency direction', /from\s+['"](?:vue|wxt\/browser)['"]|chrome\./, pure);

const colorFiles = files.filter(
  (file) => rel(file).endsWith('.css') && !rel(file).endsWith('src/styles/tokens.css'),
);
hits('P0 hardcoded hex outside tokens', /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/, colorFiles);

const long = files.filter((file) => text(file).split('\n').length > 300);
if (long.length > 0) problems.push('single file > 300 lines -> ' + long.map(rel).join(', '));

const pkg = JSON.parse(text(join(ROOT, 'package.json')));
if (pkg.dependencies?.['@lucide/vue'] !== '1.70.0') problems.push('icon library version drift');
if (pkg.dependencies?.['lucide-vue-next']) problems.push('forbidden icon dependency present');

const config = strip(text(join(ROOT, 'wxt.config.ts')));
if (!config.includes("['activeTab', 'scripting', 'storage']")) problems.push('manifest permission whitelist drift');
if (/host_permissions\s*:/.test(config)) problems.push('host_permissions must not be declared');
if (!config.includes("minimum_chrome_version: '120'")) problems.push('minimum_chrome_version drift');
const commandCount = (config.match(/suggested_key:/g) ?? []).length;
if (commandCount !== 4) problems.push('commands must be exactly 4, found ' + commandCount);

if (problems.length > 0) {
  for (const problem of problems) console.error('GUARD FAIL: ' + problem);
  process.exit(1);
}
console.log('GUARD PASS: ' + files.length + ' source files, zero blocked patterns');
