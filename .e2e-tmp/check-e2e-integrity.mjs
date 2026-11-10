/**
 * 反作弊门第 8 项（v2 新增，P0 门禁）：E2E 不得预置 storage / 不得绕过 UI。
 *
 * 确定性静态校验，独立于 E2E 执行器，前端/QA 都改不动判定规则本身。
 * 形态参考 test-integrity-anti-gaming.md §2「一道作者改不动的确定性校验」。
 *
 * 扫描目标：.e2e-tmp/e2e-v2.mjs、.e2e-tmp/dry-run-infra.mjs、
 *          .e2e-tmp/qa-v2-probe.mjs（阶段二补充证据探针）与夹具 HTML。
 * 命中任一禁用模式，或缺少必需的干净 profile / 真实手势锚点，即 exit 1。
 * 本脚本检查的是执行器，不检查自身源码（避免自命中）。
 *
 * 用法：node .e2e-tmp/check-e2e-integrity.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXECUTORS = ['e2e-v2.mjs', 'dry-run-infra.mjs', 'qa-v2-probe.mjs',
  'dry-run-v21-infra.mjs'];
const FIXTURE_DIR = join(HERE, 'fixtures');
const problems = [];
const notes = [];

/* 任何「直接写 storage / 调内部状态构造前置条件」或「绕过 UI 直接驱动扩展」的形态 */
const FORBIDDEN = [
  { id: 'storage-write', desc: '写入扩展存储构造前置条件', re: /\b(?:chrome|browser)\.storage\.(?:local|sync|session)\.set\s*\(/ },
  { id: 'generic-storage-write', desc: '泛化的 storage.set 调用', re: /\.storage\.(?:local|sync|session)\.set\s*\(/ },
  { id: 'allowlist-preset', desc: '预置站点白名单键', re: /faf\.siteAllowlist/i },
  { id: 'exclusion-preset', desc: '预置排除/限制清单键', re: /faf\.(?:exclusion|restrict|deny|block)/i },
  { id: 'internal-state', desc: '调用扩展内部状态对象', re: /__faf_internal|window\.__FAF|faf\.internal|__FAF_STATE/i },
  { id: 'bypass-ui-runtime', desc: '绕过 UI 直接发 runtime 消息触发填充', re: /(?:chrome|browser)\.runtime\.sendMessage\s*\(/ },
  { id: 'bypass-ui-tabs', desc: '绕过 UI 直接发 tabs 消息触发填充', re: /chrome\.tabs\.sendMessage\s*\(/ },
  { id: 'bypass-ui-script', desc: 'executeScript 内写入 storage', re: /executeScript[\s\S]{0,160}storage/i },
  { id: 'options-as-precondition', desc: '把配置页当作前置构造入口', re: /options\.html[\s\S]{0,200}storage\.local\.set/i },
];

/* 必须从干净 profile + 真实 UI 手势进入，缺一即判定门禁不成立 */
const REQUIRED = [
  { id: 'persistent-context', desc: 'launchPersistentContext（可加载扩展的 profile）', re: /chromium\.launchPersistentContext\s*\(/ },
  { id: 'fresh-profile', desc: '运行前清空 user-data-dir', re: /rmSync\s*\(/ },
  { id: 'cdp-gesture', desc: 'CDP Input.dispatchKeyEvent（浏览器级加速器）', re: /Input\.dispatchKeyEvent/ },
  { id: 'load-extension', desc: '--load-extension', re: /--load-extension/ },
  { id: 'disable-extensions-except', desc: '--disable-extensions-except', re: /--disable-extensions-except/ },
  { id: 'headless-new', desc: '--headless=new', re: /--headless=new/ },
  { id: 'ui-click', desc: '真实 UI 点击（page locator / DOM click）', re: /\.click\s*\(|clickUi\s*\(/ },
];

function scanExecutor(name) {
  const file = join(HERE, name);
  if (!existsSync(file)) {
    notes.push(`SKIP ${name}：文件尚未创建（阶段二前可跳过）`);
    return;
  }
  const source = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    if (rule.re.test(source)) problems.push(`${name}: 命中禁用模式 ${rule.id} —— ${rule.desc}`);
  }
  for (const rule of REQUIRED) {
    if (!rule.re.test(source)) problems.push(`${name}: 缺少必需锚点 ${rule.id} —— ${rule.desc}`);
  }
  notes.push(`SCAN ${name}: ${source.split('\n').length} 行，禁用模式 0、必需锚点齐全`);
}

for (const name of EXECUTORS) scanExecutor(name);

/* 夹具：禁止外链资源、远程字体、完整协议 URL 字面、emoji 功能图标、紫粉渐变 */
if (existsSync(FIXTURE_DIR)) {
  const fixtureRules = [
    { id: 'external-url', desc: '完整协议 URL 字面', re: /https?:\/\// },
    { id: 'remote-font', desc: '远程字体 / 远程样式表', re: /@import\s+url\(|@font-face|\.woff2?|\.ttf|fonts\.googleapis/i },
    { id: 'external-tag', desc: '外链 link / script src / img src', re: /<link\b|<script[^>]+src=|<img[^>]+src=/i },
    { id: 'emoji-icon', desc: 'emoji 作功能图标', re: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u },
    { id: 'purple-pink-gradient', desc: '紫粉渐变', re: /from-purple[\s\S]{0,40}to-pink|7C3AED[\s\S]{0,40}(?:A855F7|EC4899)/i },
    { id: 'ai-filler-copy', desc: '空洞占位文案', re: /Welcome to|Lorem ipsum|Sign up today/i },
  ];
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.html')).sort();
  for (const f of files) {
    const source = readFileSync(join(FIXTURE_DIR, f), 'utf8');
    for (const rule of fixtureRules) {
      if (rule.re.test(source)) problems.push(`fixtures/${f}: 命中 ${rule.id} —— ${rule.desc}`);
    }
  }
  notes.push(`SCAN fixtures/: ${files.length} 个静态页面，零外链 / 零 emoji / 零紫粉渐变`);
} else {
  problems.push('fixtures/ 目录不存在');
}

for (const note of notes) console.log('CHECK ' + note);
if (problems.length > 0) {
  for (const p of problems) console.error('INTEGRITY FAIL: ' + p);
  console.error(`\n反作弊门第 8 项：阻断（${problems.length} 项）`);
  process.exit(1);
}
console.log('\nINTEGRITY PASS: 反作弊门第 8 项 —— 无 storage 预置、无绕过 UI、干净 profile、CDP 真实手势、夹具零外链');
