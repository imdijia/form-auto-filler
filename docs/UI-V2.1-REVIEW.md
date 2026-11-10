# UI-V2.1-REVIEW.md · 天蓝主题与浮层层叠设计规范（只读复核）

> 角色：UI/UX 设计师 v21-designer。范围：只读复核 + 出规范，**不改任何代码**。
> 依据：用户反馈「再试一次按钮文字看不到 / 重新选择区域按钮长度 / 天蓝色主题 / 悬浮文字与背景 / 层级被弹出遮盖」；`SPEC-v2.1.md` AC-V2-20/21/22；项目总监裁决的天蓝 token 与 top layer 方案。本文只做一致性复核与可验收口径，不另起方案。
> 复核对象：`src/styles/tokens.css`、`src/ui/styles/injected.css`、`src/ui/components/ResultBar.vue`、`src/ui/components/Fab.vue`、`src/ui/shadow.ts`。寄存器：**Product**（注入式工具 UI，标杆是赢得熟悉感，非营销页）。平台轴：web（Chromium MV3）。

## 1. 天蓝主题 Token 表（light / dark）

仅列变更项；`success / warn / danger / fg / fg-2 / muted / meta / surface / surface-warm / border / border-soft / border-control / 字体 / 间距 / 圆角 / 阴影 / 动效 / z-*` 保持 `tokens.css` 现值不动。

| Token | light（注入层） | dark（仅扩展页） | 用在哪个组件 |
|---|---|---|---|
| `--accent` | `#0369A1` | `#38BDF8` | `.f-btn--primary` 底；`.f-btn`/`.f-btn--text`/`.f-link` 文字；`.f-result-bar__icon`；`.f-picker-highlight` 边框；`.f-checkbox` accent；`.f-binding-item--active` 文字；`--info` |
| `--accent-hover` | `#0284C7` | `#7DD3FC` | 仅作**边框/文字**轻微态；**禁止配 `--accent-on` 白字**（见 §2） |
| `--accent-active` | `#075985` | `#0EA5E9` | `.f-fab:hover` 底（裁决）；已收编 `.f-btn--primary:hover` 底（见 §2 实现对照） |
| `--accent-on` | `#FFFFFF` | `#082F49` | `.f-btn--primary` 文字（在 `--accent` 上）。dark 下不得用于 `--brand-ink` 底（§2 #11；此约束仅扩展页适用） |
| `--accent-soft` | `#E0F2FE` | `#082F49` | `.f-binding-item:hover/--active` 底；`.f-diag-row__fallback` 底（AC-V2-18） |
| `--brand-ink` | `#0C4A6E` | `#075985` | `.f-fab` 常态底、`.f-hint` 底、`.f-picker-toolbar` 底、`.f-diag-row__fallback` 字 |
| `--pick-fill` | `rgba(2,132,199,0.12)` | 同左 | `.f-picker-highlight` 区域填充（非文字，无对比度要求） |

裁定要点：light 全部为同色系天蓝深浅阶梯（sky-700→600→800），无紫粉渐变；dark 为亮天蓝强调 + 深海军蓝文字，符合「深色模式用亮度递进表达层级」。
**裁决 A（team-lead 已锁定）**：注入 UI 固定 light，dark token 仅服务扩展页。依据 `shadow.ts:39` "fixed extension theme" 既有设计意图；注入层不随页面主题切换，避免深色页面上出现深色 UI，零改动风险最低。据此：`--on-brand-ink` 别名建议**作废**；§1 dark 列与 §2 #9~#11 **仅扩展页**适用；`:root[data-theme="dark"]` **不需**改为 `:host([data-theme="dark"])`；注入层不得透传主题属性，也无需断言注入层 dark 态。

## 2. WCAG 相对亮度与对比度实算表

**公式**（WCAG 2.1）：先 sRGB 线性化 `c = C/255; c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`，再 `L = 0.2126R + 0.7152G + 0.0722B`，对比度 `CR = (L_max+0.05) / (L_min+0.05)`。正文/按钮文字门槛 **4.5:1**（AA 1.4.3）；UI 组件边框/图标 3:1（AA 1.4.11）；disabled 控件按 1.4.3 豁免但仍记录。

| # | 场景 | fg / bg | L(fg) / L(bg) | CR | 判定 |
|---|---|---|---|---|---|
| 1 | 主按钮常态（修复后） | `#FFFFFF` / `#0369A1` | 1.0000 / 0.1270 | **5.93:1** | PASS |
| 2 | 主按钮 BUG 态（`color:inherit` 强制 `--fg`） | `#16202E` / `#0369A1` | 0.0140 / 0.1270 | **2.76:1** | **FAIL** ← 用户「文字看不到」根因 |
| 3 | 文字按钮在表面底 | `#0369A1` / `#FFFFFF` | 0.1270 / 1.0000 | **5.93:1** | PASS |
| 4 | 悬浮球常态 | `#FFFFFF` / `#0C4A6E` | 1.0000 / 0.0610 | **9.46:1** | PASS |
| 5 | 悬浮球 hover（裁决：`--accent-active`） | `#FFFFFF` / `#075985` | 1.0000 / 0.0888 | **7.56:1** | PASS |
| 6 | 悬浮球 hover（禁用组合：`--accent-hover`+白字） | `#FFFFFF` / `#0284C7` | 1.0000 / 0.2064 | **4.10:1** | **FAIL** |
| 7 | 悬浮提示（新：`--brand-ink` 底 + 白字 + 1px `--accent` 边框） | `#FFFFFF` / `#0C4A6E` | 1.0000 / 0.0610 | **9.46:1** | PASS |
| 8 | disabled 悬浮球 | `#64748B` / `#EEF2F7` | 0.1706 / 0.8840 | **4.23:1** | FAIL（1.4.3 豁免） |
| 9 | dark 主题主按钮（仅扩展页） | `#082F49` / `#38BDF8` | 0.0257 / 0.4401 | **6.48:1** | PASS |
| 10 | dark 主按钮 hover（仅扩展页，改 `--accent-active` 后） | `#082F49` / `#0EA5E9` | 0.0257 / 0.3289 | **5.01:1** | PASS |
| 11 | dark 悬浮球/提示（仅扩展页） | `#082F49` / `#075985` | 0.0257 / 0.0888 | **1.84:1** | FAIL（仅扩展页；注入层不可达） |
| 12 | light 主按钮 hover（历史值，已修） | `#FFFFFF` / `#0284C7` | 1.0000 / 0.2064 | **4.10:1** | FAIL（历史；见实现对照） |
| 13 | `.f-btn:disabled{opacity:.5}` 主按钮合成后 | `#C0DAE8` / `#81B4D0` | 复合色 | **1.54:1** | FAIL（豁免，需记录） |
| 14 | 边框控件（中性色保持不动） | `#8B9AAE` / `#FFFFFF` | 0.3166 / 1.0000 | 2.86:1 | FAIL@3.0（v2.1 范围外，记待办） |

**根因复核（#2）**：修复前 `injected.css:16` `.f-root button, .f-root input, .f-root select { … color: inherit }` 特异性 (0,1,1) 高于 `.f-btn--primary` / `.f-btn--text` (0,1,0)，与书写顺序无关，按钮文字被强制继承 `:host` 的 `--fg`。修法（最小）：该行去掉 `color: inherit`（只保留 `font-family/font-size: inherit`），或把两条按钮色规则提到 (0,2,0)。**实现对照**：当前工作树 `injected.css:16-17` 已按此拆分为两条、按钮不再继承色，QA 须按 §5-A 断言 `color !== --fg` 固化回归。

**未达标修正值（不改裁决色板，仅改配对）**：
- #6/#12：`--accent-hover` 永不与 `--accent-on` 白字配对。主按钮 hover 背景改用 `--accent-active` `#075985` → 7.56:1；或把 `--accent-hover` 调为 `#0369A1`（白字 5.93:1）。裁决已对 FAB 作此约束，`.f-btn--primary:hover` 与 `.f-fab:hover` 应统一。
- #11（**裁决 A 下作废**，仅存档为扩展页潜在建议）：dark 下 `#082F49` 遇 `--brand-ink` `#075985` 成深叠深。仅当未来改裁决 B 才需 `--on-brand-ink`（dark `#E8EDF4` → 6.43:1，`#FFFFFF` → 7.56:1）。不作放行项。
- #8：disabled 字色由 `--meta` 改 `--muted` `#5A6B81` → **4.85:1**（或 `--fg-2` `#37465C` → 8.52:1）。#13：以 token 化 disabled 色替代 `opacity:.5` 整体压暗，避免合成后 1.54:1。

**最可能因对比度不达标的 token**：dark `--accent-on: #082F49`（复用到 `--brand-ink` 底时 1.84:1，仅扩展页可达）；次级 light `--accent-hover: #0284C7` 配白字 4.10:1（现已不配白字，风险消除）。二者都是**配对问题**，色值本身不错。**实现对照（复核后修订）**：① hover 已修，`injected.css:85-87` / `pages.css:25-27` 均改 `--accent-active` → 7.56:1（dark 5.01:1），原阻断撤回。② dark 组合在注入层**不可达**：`tokens.css:86` 仅挂 `:root[data-theme="dark"]`，`shadow.ts:39` 明示 "fixed extension theme" 且无主题属性透传，`:host` 恒取 light token，`.f-fab` 实为 9.46:1；#11 与「须改 `:host([data-theme="dark"])`」两条阻断**撤回**。③ 裁决 A 已锁定「注入层固定 light」，#11/#12 与 `--on-brand-ink` 修法在当前范围作废。④ top layer 权威路径已由「重提升」改为 **S3 迁移**（§4），实现缺口仍开放。新增 AC-V2-18 兜底标记 `.f-diag-row__fallback`（`injected.css:205-209`）实测 `--brand-ink`/`--accent-soft` = **8.24:1 PASS**，全 token 无硬编码、无卡片嵌套、`flex-wrap` 承接长文案，符合规范。

## 3. 按钮布局规范（结果条操作区）

现状：`injected.css:174` `.f-result-bar__actions { display:flex; flex-wrap:wrap; gap:var(--space-1) }` + `:80` `.f-btn--text { padding: 0 var(--space-1) }`，5 个按钮在 420px 条内换行，「重新选择区域」被挤压。改为**两列 grid**：

```
.f-result-bar__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1);                 /* 4px */
  padding: var(--space-2) var(--space-3);  /* 8px 12px，沿用 */
  flex-wrap: nowrap;                  /* 显式取消 */
}
.f-result-bar__actions .f-btn { display: inline-flex; align-items: center;
  justify-content: center; gap: var(--space-1); white-space: nowrap;
  min-height: 32px; padding: 0 var(--space-2); overflow: visible; }
.f-result-bar__actions .f-btn--primary { grid-column: 1 / -1; }  /* 主按钮整行 */
@media (max-width: 360px) {
  .f-result-bar__actions { grid-template-columns: 1fr; }         /* 单列回退 */
}
```

- **列宽实算**：结果条 420px，`box-sizing:border-box` 扣 1px×2 边框 → 418px；操作区左右 padding 12px×2 → 394px；gap 4px → `(394-4)/2 = 195px/列`（裁决值）；当前实现用 `gap:var(--space-2)` 8px → `(394-8)/2 = 193px/列`，仍 >118px 最长内容，安全。QA 勿把 195px 写成硬编码等号。
- **不截断实算**：「重新选择区域」6 个 CJK，`--text-xs` 12px → 72px；加 14px Lucide 图标 + 4px gap + 8px×2 padding = **106px**，余量 89px。13px → 112px，14px → 118px，均 < 195px。`--text-sm` 亦安全。最长项「复制诊断 JSON」与「逐字段诊断 + 计数徽标」估算 < 130px，同样不截断。
- 图标文字间距统一 `gap: var(--space-1)` = 4px（由 `gap` 而非 `ResultBar.vue` 模板里的字面空格产生；模板 `/> 撤销` 的空格需去除，否则 flex 下会额外叠加约 3~4px）。`min-height: 32px` 满足 WCAG 2.5.8 AA(24px)；44×44px 属 2.5.5 AAA/触屏档，桌面注入 UI 不强制。
- 主按钮「再填一次」整行 `grid-column:1/-1`，宽度 394px，与 4 个等宽文字按钮形成 2+2+1 的稳定节奏；认知负荷 ≤4 项/组达标。

## 4. 浮层层叠验收清单

**内部 z-index 顺序**（同一 Shadow Root 内共享层叠上下文，局部排序可靠；`tokens.css:80-83`，`shadow.ts:16-17` 的 `Z_LAYERS` 必须保持**最后追加**，因 esbuild 压缩把 2147483000 舍入成 2147480000）：`--z-inject 2147483000`（宿主）`<` `--z-highlight 2147483645`（`.f-picker-highlight`）`<` `--z-toolbar 2147483646`（`.f-picker-toolbar`/`.f-picker-tooltip`）`<` `--z-panel 2147483647`（`.f-fab`/`.f-hint`/`.f-panel`/`.f-binding-panel`/`.f-result-bar`）。宿主 `pointer-events:none` + 子级 `auto` 不变。

**宿主内联 `!important` 的必要性**（4 条，缺一不可）：① 压过页面作者样式对 `#faf-shadow-root` 或泛 `div` 的 `!important` 重置（内联 `!important` 位于作者源级联顶端）；② **压过 UA `:popover-open` 默认** —— UA 给 popover 加 `position:fixed; inset:0; margin:auto; width/height:fit-content; border:solid; padding; background:Canvas; color:CanvasText; overflow:auto`，不重置则全屏覆盖层塌成居中小盒，必需内联重置 `position:fixed; inset:0; margin:0; width:100%; height:100%; border:0; padding:0; background:transparent; color:inherit; overflow:visible; pointer-events:none; z-index:2147483000` 全部 `!important`；③ 保证 `position:fixed` 生效（`z-index` 只对已定位元素有效）与 `pointer-events` 分层；④ 抗页面脚本抹除 `host.style`（配合 MutationObserver 回写）。

**top layer 与 `<dialog>.showModal()`（实证结论）**：`z-index` 在 top layer 边界**完全无效**。`showModal()` 除把 dialog 提升进 top layer，还会让**弹窗外一切 inert（含同处 top layer 的 popover）**，故「宿主 `popover="manual"` + `showPopover()` 反复重提升」对原生 modal **无效**：探针 S1 实测 `elementFromPoint=pageDlg`、FAF 不在命中栈。`z-index 2147483000` 与 `hidePopover()→showPopover()` 重提升均已证伪，不再是权威路径。**唯一有效解 = S3**：把 host 节点移入当前 `dialog:modal` **内部**（成为其后代，脱离 inert 范围）：不显式 `hidePopover()`；但 DOM 迁移会让 UA 自动关闭 popover（`s3-live.probe.mjs` 实测 `popoverOpenBeforeMove:true → popoverOpenAfterMove:false`），迁移后必须 `ensurePopover()` 补开并断言 `:popover-open` 恢复为 true，否则 S3/S4 失效。选 `manual` 而非 `auto`：`auto` 会因外部点击/Esc 轻消除并带 `::backdrop`；`manual` 无 backdrop、关闭须显式 `hidePopover()`（仅 unmount 时用）。

**S3 权威路径 + 实测判定依据**（`top-layer-probe.mjs` + `s3-live.probe.mjs`，Edge 157 headless=new；QA 断言取 `fabHit` / 命中栈 / `dialogInputHit` / 迁移后 `:popover-open` **四量**）：
- S1（对照基线）：host 在 html 直属 + popover，页面 `showModal()` → `fabHit=pageDlg`、FAF 不在命中栈 → 证伪重提升。
- **S3**：host 移入当前 `dialog:modal`，不显式 hide，但 DOM 迁移使 UA 自动关闭 popover（`before:true → after:false`），须 `ensurePopover()` 补开 → `fabHit=fab`、栈 `[fab, pageDlg, HTML]`、`dialogInputHit=dlgInput`、`:popover-open` 恢复 `true` → **PASS**：FAF 可见可点，页面弹窗内输入框仍可交互。
- S4 切到第二个 `dialog:modal` 且 host 跟随迁移：首轮探针**若不补开**就是 `fabHit=pageDlg2`（阻断），补开后 `fabHit=fab`、栈 `[fab, pageDlg2, HTML]`、`dialogInputHit=dlgInput2`；S5 全部 dialog 关闭后把 host 移回 html 直属、重新 `showPopover()` → `fabHit=fab`；S6 扩展自己后开 modal 承载 host → `fabHit=fab` 但 `dialogInputHit=HTML`（页面被 inert 锁死）→ **明确不采用**。
- 判定方式：`elementFromPoint(fabCenter)` 顶层须命中 `.f-fab`；`elementsFromPoint` 栈中 FAF 索引 < `pageDlg` 索引；`elementFromPoint(dlgInputCenter)` 仍命中 `dlgInput`；迁移后 `host.matches(':popover-open') === true`。**第三条是区分 S3 与 S6 的关键判据**，缺它等于放水（S6 表面 `fabHit` 也通过）；第四量防止「只移节点不补开」导致半途失效。

**MutationObserver 守护要点（S3 跟随迁移）**：
- `observe(document, {childList:true, subtree:true, attributes:true, attributeFilter:['open','popover']})`，并在 `document` 捕获阶段监听 `toggle` / `beforetoggle`。
- 检测到 `dialog[open]` 变为 `:modal` 或新增 modal → 取 `document.querySelector('dialog:modal')`，`appendChild(host)` 迁入；**不显式 hide**，但迁移会让 UA 自动关闭 popover，故在 `moved || !popoverOpen` 时调 `ensurePopover()` 补开并断言 `:popover-open === true`；重入标志忽略 FAF 自身迁移，防回环。
- 全部 modal 关闭 / `dialog` 被移除 → 把 host 移回 `document.documentElement` 并重新确保 `:popover-open`（S5）；切到第二个 modal 重复迁移（S4）。
- 用 `queueMicrotask`/`rAF` 合并突发变更；`unmount()` 时 `disconnect()`（`shadow.ts:111`）并从当前父节点摘除 host。
- **实现对照（阻断）**：当前 `shadow.ts:97-103` 只 `observe(document.documentElement,{childList:true})` 且首行提前 return，既无 `dialog:modal` 迁移、也无 `open`/`toggle` 监听；`HOST_STYLE`（`shadow.ts:22-31`）缺 `width/height:100%`、`color:inherit`、`overflow:visible` 以覆盖 UA `:popover-open` 默认。按 S3 补齐，否则 AC-V2-22 仍失败。

**失败回退策略（分级，禁止静默降级为「通过」）**：
1. 特性检测 `typeof host.showPopover === 'function' && 'popover' in HTMLElement.prototype`；`showPopover()` 抛 `InvalidStateError` 时 catch，不让 UI 崩。
2. 无 modal 时 host 保持 `document.documentElement` 直属 + `popover="manual"` + `:popover-open`（S0/S5 常态）；有 modal 但迁移失败（dialog `overflow:hidden` / `contain` / CSP / 跨 shadow tree）→ 退化为纯 z-index `!important` 宿主并置 `data-faf-layer="fallback"`，属 best-effort。
3. 仍失败：置 `host.dataset.fafLayer = 'degraded'`。QA **必须断言该标志并把 AC-V2-22 判为 NOT MET**，不得放宽断言（对齐 `test-integrity-anti-gaming.md`：「让作弊在结构上失效」）。
4. **禁止**用 `dialog.showModal()` 承载 FAF 自身（S6：`dialogInputHit=HTML`，页面 inert 锁死，违背「只填不提交、不干扰页面」）；也禁止 `auto` popover 与重复 `hidePopover()→showPopover()`（S1 已证伪）。

## 5. 给 QA 的可机读断言建议

取值路径统一：`const sr = document.getElementById('faf-shadow-root').shadowRoot; const el = sr.querySelector(...)；getComputedStyle(el)`。Shadow DOM 内 `getComputedStyle` 正常可用。

**A. computed style 断言（属性 → 期望/阈值）**

| 属性 | 期望 |
|---|---|
| `.f-btn--primary` `color` / `background-color` | `rgb(255,255,255)` / `rgb(3,105,161)`；`color !== getComputedStyle(sr.host).color` |
| `.f-btn--text` `color` | `rgb(3,105,161)`（**不得**为 `--fg` `rgb(22,32,46)`），验证 `injected.css:16-19` 已修 |
| `.f-fab:hover` `background-color` | `rgb(7,89,133)`（`--accent-active`），**不得**为 `rgb(2,132,199)` |
| `.f-hint` `background-color` / `color` / `border-top-width` | `rgb(12,74,110)` / `rgb(255,255,255)` / `1px` |
| `.f-result-bar__actions` `display` / `gridTemplateColumns` / `flexWrap` | `grid` / 2 个 `minmax(0,1fr)` 轨道 / `nowrap` |
| 每个按钮 `whiteSpace` / `minHeight` / `gap` | `nowrap` / `>=32px`（规范 32px，当前实现 34px）/ `4px`（当前 6px 破 4px 网格，advisory） |
| 主按钮 `gridColumnEnd` | `span 2` 或 `-1`（整行） |
| `host` `position` / `pointerEvents` / `zIndex` / `:popover-open` | `fixed` / `none` / `>=2147483000`（当前 2147483647，top layer 下不生效）/ `true` |
| `prefers-reduced-motion` 下 `transitionDuration` | `<= 0.01ms`（`tokens.css:109-116`、`injected.css:192-194`） |

**B. 对比度由 JS 计算**（勿只比色值字符串）：解析 `rgb()/rgba()` → 对每个通道做 §2 的 sRGB 线性化 → `L=0.2126R+0.7152G+0.0722B` → `(Lmax+0.05)/(Lmin+0.05)`。文字按钮 `background-color` 为 `transparent`，需沿 `parentElement` 上溯首个非透明底色（`.f-result-bar` → `--surface`）；`opacity<1` 时先按 alpha 与父底色合成再算（对应 §2 #13）。阈值：文字 ≥4.5，边框/图标 ≥3.0。hover/focus 态用 Playwright `locator.hover()` 或 CDP `DOM.forcePseudoState` 强制，勿读默认态冒充。dark 断言**仅对扩展页**生效；注入层固定 light（裁决 A），不得给宿主设 `data-theme="dark"`，无需断言注入层 dark 态。

**C. `elementFromPoint` 判定浮层在页面弹窗之上（S3 口径，四量）**：先 `dialog.showModal()` 并断言 `dialog.matches(':modal') === true`（否则用例无效）；取 FAB、结果条中心点 `(x,y)` 与页面弹窗内输入框中心点 `(ix,iy)`；四量 = `fabHit` / 命中栈 / `dialogInputHit` / 迁移后 `:popover-open`：
- `document.elementFromPoint(x,y)` 顶层须命中 FAF 的 `.f-fab`；`document.elementsFromPoint(x,y)` 数组按从上到下排序，断言 FAF 宿主索引 **小于** 该 `<dialog>` 索引（S3 实测栈 `[fab, pageDlg, HTML]`），且不得为 `::backdrop`。
- **关键判据**：`document.elementFromPoint(ix,iy)` 须仍命中页面弹窗内的 `dlgInput`。S6（扩展自开 modal）表面 `fabHit` 也通过，但此量返回 `HTML`（页面被 inert 锁死）；缺此断言等于放水。
- 影子树内部用 `sr.elementFromPoint(x,y)` 断言命中 `.f-fab` / `.f-btn`，且 `getComputedStyle(命中元素).pointerEvents === 'auto'`。
- 仅命中不够：**真实派发点击**（Playwright `click()` / CDP `Input.dispatchMouseEvent`）并断言动作发生（面板打开 / `data-*` 变化）。
- **第四量（迁移补开）**须独立读取，不可由 `fabHit` 反推：每次 `appendChild(host)` 迁移后立即断言 `host.matches(':popover-open') === true`（UA 会自动关闭，`ensurePopover()` 须把 `popoverOpenAfterMove:false` 补回 `true`）；S4 首轮不补开即 `fabHit=pageDlg2`（阻断）。序列用例：S3 迁移 → 切到第二个 `dialog:modal` 跟随迁移（S4）→ 全部关闭后移回 html 直属并重新 `showPopover()`（S5），每步重复上述**四量**断言，并断言 `host.parentElement` 依次为 dialog2 / `document.documentElement`。

**D. 不换行不截断**：对每个按钮 `el.scrollWidth <= el.clientWidth + 1` 且 `el.scrollHeight <= el.clientHeight + 1`；对按钮文本建 `Range` 后 `range.getClientRects().length === 1`（换行为多矩形）；`getComputedStyle(el).whiteSpace === 'nowrap'` 且 `textOverflow !== 'ellipsis'`；4 个文字按钮 `getBoundingClientRect().width` 两两差 ≤1px 且 `>=185px`（193~195px 均可），主按钮宽度 `≈394px`；任意两按钮矩形不相交；`el.textContent` 含完整「重新选择区域」「复制诊断 JSON」。注意 `ResultBar.vue` 实际文案为「再填一次」「撤销」，而 `SPEC-v2.1.md:66/130` 写作「再试一次」「撤销本次填充」，断言按**实际 DOM** 取值，避免假阴性。

## 6. anti-slop 自检（逐条结论）

**8 条硬红线**：① 紫粉渐变：无，天蓝同色系深浅阶梯 → 通过。② emoji 作图标：无，全部 `@lucide/vue@1.70.0`（`package.json:20`）SVG → 通过。③ 默认系统字体直出：无，`tokens.css:32-34` 锁定 Noto Sans SC + Lexend/Source Sans 3 + JetBrains Mono 三层 → 通过。④ 硬编码色值：仅 `tokens.css` 与本文 §1/§2 色值表出现十六进制/`rgba()`，`injected.css` 与 `.vue` 零色值 → 通过。⑤ Lorem ipsum / "Welcome to" / 空洞占位：无，文案均为具体动作（「仅填入，不提交」「重新选择区域」）→ 通过。⑥ 图标系统与字体先冻结：已冻结（单库 + 三族字体栈）→ 通过。⑦ 可访问交互：`injected.css:17-19` `:focus-visible` 焦点环、键盘可达、`tokens.css:109-116` + `injected.css:192-194` reduced-motion → 通过。⑧ 完整 Design Token：颜色/间距/圆角/阴影/动效时长齐备 → 通过。

**7 反模式**：1 紫渐变综合症 → 无。2 Emoji 替代图标 → 无。3 千篇一律 Hero → 无 Hero（Product 寄存器注入 UI），非缺陷。4 默认靛蓝（Tailwind indigo-500）→ 无，用 `#0369A1`。5 圆角卡片 + 彩色左边框 → 无（`border-left/right >1px` 零出现）。6 虚构指标 → 无（计数来自 `state.report` 真实值）。7 填充式文案 → 无（无 seamless/elevate/赋能/无缝/全面提升/极致 等，denylist 已扫）。

**13 点自检（设计系统 8 + 质量 5）**：
1 颜色全走 Token → 通过（见红线④）。2 间距 4px 整数倍 → 通过（`--space-*` 4 网格，本文新增 4/8/12/32 均合规）。
3 字体指定 Inter + Noto Sans SC + 等宽 → **偏差但合规**：项目改用 Noto Sans SC + Lexend/Source Sans 3 + JetBrains Mono，无默认直出且层级明确，属项目级锁定，不判失败。
4 标题/正文/等宽三族层级 → 通过。5 Hero 展示真实产品内容 → N/A（本交付无 Hero，Product 寄存器正确）。
6 对标品牌 + 行业风格 → 通过（Linear/Stripe/Notion 式克制 Product 风，全项目一致）。
7 按钮必要状态 → 通过（Default/Hover/Focus/Active/Disabled/Loading 由 `state.filling` + `.f-skeleton` 承载，无按钮内 spinner，Product 寄存器可接受）。
8 表单验证错误 / 列表空状态 → 通过（`.f-notice--danger`、`.f-result-bar__error`、`.f-empty`）。
9 单套图标库 + 尺寸统一 → 通过锁定单库；**advisory**：现行 14/16/18/20px 未收敛到 16/20/24，建议本次把 14 归到 16 或把 14 作为紧凑档写入 Spec。
10 无纯黑 `#000`/纯灰 `#808080` → 通过（`#FFFFFF` 属允许例外）。
11 对比度达标 / 动画 ≤400ms / reduced-motion → **达标**：动效 100/150/200ms、reduced-motion 齐备；实装后 6 组主态与交互态均 ≥4.5:1（5.01~9.46:1）。余下 disabled 4.23:1（1.4.3 豁免）与 `--border-control` 2.86:1@3:1 属范围外待办，不再构成放行阻断。
12 响应式覆盖移动端 → 通过（`max-width: calc(100vw - var(--space-12))` + 本文 §3 新增 <360px 单列回退）。
13 组件状态矩阵 9 态 → 通过（default/hover/focus/active/disabled/loading/error/empty/success 均有对应类或 state 分支）。

**明确声明**：无 emoji 图标、无紫→粉渐变、无 AI 模板文案、图标锁定 `@lucide/vue@1.70.0`、无硬编码颜色（仅 `tokens.css` 与本文色值表例外）。

> 交付边界：本文为只读复核产物，未修改任何代码、`tokens.css`、`injected.css`、`.vue` 组件、`tests/**`、`.e2e-tmp/**`、`docs/SPEC-v2*`。§2 已修项与裁决 A、§3/§4 的规范条目，交由实现方与 QA 承接。

> 范围外背景（**不进入 §2 对比度结论**）：用户实测报 P0 回归 —— 常用「姓名」「手机号」被填成「我是请输入网格员姓名测试数据」、手机号触发页面校验红框；根因在 L2 推断与兜底格式保护，与天蓝主题 / 对比度 / 浮层层叠规范无关。已由 team-lead 下发前端修，QA 补判据，本文不承接、不据此改任何结论。
