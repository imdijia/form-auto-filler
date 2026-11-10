/**
 * Static P0/P1 compliance gates.
 *
 * Group A runs for real TODAY (build config + dependency lock already exist).
 * Group B turns itself on automatically once src/ is produced by the frontend;
 * while src/ is absent every case is reported as skipped WITH the reason.
 * Nothing here is a snapshot or a tautology: each gate asserts zero hits of a
 * forbidden pattern, and the hit list is included in the failure output.
 *
 * Rules come from SPEC-v1 §4/§8/§10/§11, PRD-v1 §8 AC-2/§9, ARCH-v1 §15.4.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// wxt.config.ts uses srcDir: '.', so entrypoints/ lives at the project root
// while ARCH-v1 §5.2 puts pure logic under src/. Scan both families.
const SCAN_ROOTS = ['src', 'entrypoints', 'components', 'ui'].map((d) => join(ROOT, d));

function readRoot(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SOURCE_RE = /\.(?:ts|tsx|js|jsx|vue|html|css|scss)$/;

function collect(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (SOURCE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

const srcFiles = SCAN_ROOTS.flatMap(collect);
const srcExists = srcFiles.length > 0;
const t = srcExists ? it : it.skip;
const tag = srcExists ? '' : '[待接入] 前端 src/ 尚未产出，源码门禁待 Phase 4 自动启用 :: ';

/** Normalize Windows backslashes so path filters cannot silently match zero files. */
function rel(file: string): string {
  return file.replace(ROOT, '').replace(/\\/g, '/');
}

function hits(pattern: RegExp, files = srcFiles): string[] {
  const found: string[] = [];
  for (const file of files) {
    const clean = stripComments(readFileSync(file, 'utf8'));
    pattern.lastIndex = 0;
    if (pattern.test(clean)) found.push(rel(file));
  }
  return found;
}

describe('A. 构建配置与依赖锁定（立即真跑）', () => {
  it('TC-GATE-01 manifest 权限最小化：仅 activeTab/scripting/storage，无 host_permissions', () => {
    const clean = stripComments(readRoot('wxt.config.ts'));
    expect(clean).toContain("['activeTab', 'scripting', 'storage']");
    expect(clean).not.toMatch(/host_permissions\s*:/);
    expect(clean).toContain("minimum_chrome_version: '120'");
  });

  it('TC-GATE-02 版本锚定与禁用依赖：@lucide/vue 1.70.0，无 lucide-vue-next', () => {
    const pkg = JSON.parse(readRoot('package.json'));
    expect(pkg.dependencies['@lucide/vue']).toBe('1.70.0');
    expect(pkg.dependencies['lucide-vue-next']).toBeUndefined();
    expect(pkg.devDependencies.typescript).toBe('5.9.3');
    expect(pkg.devDependencies.vite).toBe('8.3.6');
    expect(pkg.devDependencies.wxt).toBe('0.21.5');
    expect(pkg.packageManager).toBe('pnpm@10.2.1');
  });

  it('TC-GATE-03 QA 测试依赖已在 devDependencies 中（前端合并清单机器校验）', () => {
    const pkg = JSON.parse(readRoot('package.json'));
    expect(pkg.devDependencies.vitest).toBeDefined();
    expect(pkg.devDependencies.jsdom).toBeDefined();
    expect(existsSync(join(ROOT, 'vitest.config.ts'))).toBe(true);
  });
});

describe('B. 源码门禁（src/ 产出后自动真跑）', () => {
  t(`${tag}TC-GATE-04 记录门禁作用域：src/ 存在且已收集到源码文件`, () => {
    expect({ srcExists, fileCount: srcFiles.length }).toEqual({ srcExists: true, fileCount: expect.any(Number) });
    expect(srcFiles.length).toBeGreaterThan(0);
  });

  t(`${tag}TC-GATE-05 【P0】禁止 emoji 作为功能图标`, () => {
    const emoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect({ rule: 'no-emoji-icon', hits: hits(emoji) }).toEqual({ rule: 'no-emoji-icon', hits: [] });
  });

  t(`${tag}TC-GATE-06 【P1】禁止紫色到粉色渐变`, () => {
    const gradient = /purple[\s\S]{0,40}pink|7C3AED[\s\S]{0,40}(?:A855F7|EC4899)|from-purple[\s\S]{0,40}to-pink/i;
    expect({ rule: 'no-purple-pink-gradient', hits: hits(gradient) }).toEqual({
      rule: 'no-purple-pink-gradient',
      hits: [],
    });
  });

  t(`${tag}TC-GATE-07 【P1】禁止空洞 AI 模板占位文案`, () => {
    const filler = /Welcome to|Lorem ipsum|Sign up today/i;
    expect({ rule: 'no-ai-filler-copy', hits: hits(filler) }).toEqual({ rule: 'no-ai-filler-copy', hits: [] });
  });

  t(`${tag}TC-GATE-08 【P0 安全硬指标】零外发：禁 fetch/XHR/WebSocket/EventSource/sendBeacon`, () => {
    const outbound = /\bfetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket\b|new\s+EventSource\b|\.sendBeacon\s*\(/;
    expect({ rule: 'zero-outbound', hits: hits(outbound) }).toEqual({ rule: 'zero-outbound', hits: [] });
  });

  t(`${tag}TC-GATE-09 【P0】禁止依赖 Vue/React 组件实例私有字段`, () => {
    const internals = /__vue__|__vueParentComponent|_reactInternalFiber|__reactProps\$/;
    expect({ rule: 'no-framework-internals', hits: hits(internals) }).toEqual({
      rule: 'no-framework-internals',
      hits: [],
    });
  });

  // Scope-aware gates: an empty scan scope is reported as a skip with the
  // reason, never as a silent pass (and never as a spurious failure while
  // the corresponding implementation directory has not been produced yet).
  const fillFiles = srcFiles.filter((f) => /(?:^|\/)fill\//.test(rel(f)));
  const fillT = fillFiles.length > 0 ? it : it.skip;
  const fillTag = fillFiles.length > 0 ? '' : '[待接入] src/fill/ 尚未产出，赋值门禁待 Phase 4 自动启用 :: ';

  fillT(`${fillTag}TC-GATE-10 【P0】src/fill 下禁止裸 el.value = 赋值`, () => {
    const bareValue = /\.\s*value\s*=\s*[^=]/;
    expect({ rule: 'no-bare-value-assignment', scopedFiles: fillFiles.length, hits: hits(bareValue, fillFiles) }).toEqual({
      rule: 'no-bare-value-assignment',
      scopedFiles: expect.any(Number),
      hits: [],
    });
  });

  const uiFiles = srcFiles.filter((f) => /(?:^|\/)(?:ui|entrypoints)\//.test(rel(f)));
  const uiT = uiFiles.length > 0 ? it : it.skip;
  const uiTag = uiFiles.length > 0 ? '' : '[待接入] UI 源码尚未产出，文案门禁待 Phase 4 自动启用 :: ';

  uiT(`${uiTag}TC-GATE-11 【AC-2】三处主按钮文案不得出现「提交 / 确定 / 保存并提交」`, () => {
    const bannedLabel = /['"`]\s*(?:提交|确定|保存并提交)\s*['"`]/;
    expect({ rule: 'no-submit-primary-label', hits: hits(bannedLabel, uiFiles) }).toEqual({
      rule: 'no-submit-primary-label',
      hits: [],
    });
  });

  // ARCH-v1 §18 #14 / §13: @lucide/vue@1.70.0 is bundled OFFLINE and inlined.
  // No CDN, no remote font, no remote script/style URL may appear in shipped
  // source. Complements TC-GATE-08 (outbound APIs) for *declarative* requests.
  t(`${tag}TC-GATE-12 【P0 零外发补充】图标离线内联：源码无 CDN / 远程字体 / 远程 URL`, () => {
    const remote = /https?:\/\/|@import\s+url\s*\(|fonts\.googleapis|cdn\.|unpkg\.com|jsdelivr/i;
    expect({ rule: 'offline-inline-icons', scopedFiles: srcFiles.length, hits: hits(remote) }).toEqual({
      rule: 'offline-inline-icons',
      scopedFiles: expect.any(Number),
      hits: [],
    });
  });

  // ARCH-v1 §14.2 / UIUX-v1 §4.6 L690: ISOLATED world cannot read framework
  // state objects. The UI must never claim that it does, and success copy must
  // be driven only by FillResult.verified + the three observable layers.
  t(`${tag}TC-GATE-13 【P0 正确性】UI 文案不得宣称读取 Vue / React 组件内部 state 对象`, () => {
    const claim = /读取.{0,12}组件.{0,12}(?:state|状态)|组件内部状态|读到组件内部状态|已读取 Vue|已读取 React/;
    expect({ rule: 'no-state-object-claim', hits: hits(claim) }).toEqual({
      rule: 'no-state-object-claim',
      hits: [],
    });
  });

  // ARCH-v1 §17.6 / UIUX R15: `ControlType` is 5 orthogonal classes.
  // 「超范围控件」 is a result-panel handling GROUP, never a control type value
  // and never inside an `f-control-type` cell.
  t(`${tag}TC-GATE-14 【P1】f-control-type 单元格不得出现「超范围控件」`, () => {
    const bad = /<span class="f-control-type">[^<]*超范围控件/;
    expect({ rule: 'control-type-5-classes', hits: hits(bad) }).toEqual({
      rule: 'control-type-5-classes',
      hits: [],
    });
  });
});
