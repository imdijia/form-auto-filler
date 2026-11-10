# QA-V2 测试计划 — 表单自动填充工具 v2.1

> 状态：**阶段一资产已就绪，未出裁决**。本文件只定义「怎么验」，不含任何 v2.1 产品级 verdict。
> 日期：2026-11-10　撰写：测试工程师严过关（QA）　裁决人：项目总监大湾区靓仔
> 唯一范围依据：`docs/SPEC-v2.1.md`（**22 条** EARS 验收标准，178 行定稿；AC-V2-13 全文修订、AC-V2-14 局部修订、新增 AC-V2-15~22）
> 视觉与层叠可机读判据依据：`docs/UI-V2.1-REVIEW.md`（WCAG 实算表 §2、按钮布局 §3、层叠 §4、断言建议 §5）
> 冲突规则：`SPEC-v2.md` / `QA-V2-REPORT.md`（R2） / 本文件旧版与 `SPEC-v2.1.md` 冲突时，**一律以 SPEC-v2.1.md 为准**。
> 阶段二产物：新结果文件 `.e2e-tmp/e2e-v21-result.json` + `docs/QA-V2-REPORT.md` 升版 R3（或新建 `docs/QA-V2.1-REPORT.md`，由 QA 在阶段二决定并在回传中说明）+ RoleVerdict。

---

## 0. 边界声明（本阶段不做什么）

本阶段只交付验收资产与一次基础设施 dry-run 记录：

- 不实跑 `e2e-v2.mjs` 做最终裁决；
- 不写 / 不升版 `docs/QA-V2-REPORT.md`；
- 不给 `verdict: pass / fail`；
- 不对 v2.1 产品行为下任何通过/失败结论。

**R2 历史证据完整性（项目总监裁决，必须遵守）**：

| 项 | 处置 |
|----|------|
| `docs/QA-V2-REPORT.md`（R2）与其中 10 条原始 FAIL | 保留不删不改，作为历史留痕 |
| `.e2e-tmp/e2e-v2-result.json` | 保留不删不改；已在 `.e2e-tmp/archive-baseline-1915/` 归档副本 |
| `.e2e-tmp/qa-v2-probe.json` / `archive-baseline-1915/*` | 保留不删不改 |
| R2 的 B1 结案（「13 全非空」5 条 FAIL 判为 QA 断言口径假失败） | **依据作废**（`SPEC-v2.1.md` §7.2 / §7.3）；原始 5 条 FAIL 不删不弱，升格为 v2.1 主判别依据 |
| v2.1 结果文件 | 改写到 **新文件** `.e2e-tmp/e2e-v21-result.json`（`e2e-v2.mjs` 的 `V21_RESULT_FILE`），绝不覆盖 R2 |
| DEF-04（manifest 4 条 commands description 仍 v1 英文） | **不纳入本轮**，列 v2.2；阶段二按 R2 的 P2 原样保留，不计本轮待修项 |

**已完成的资产自检（均非产品裁决）**：

| 自检项 | 结果 | 说明 |
|--------|------|------|
| 7 个夹具 HTML 的 jsdom 结构清点 | 通过 | 控件 `data-qa-id` 无重复、`__qa` 计数器齐全，见 `.e2e-tmp/fixtures-inventory-v21.json`（2 个新夹具 33 个控件，violations=0） |
| `node --check` 五个 `.mjs` 执行器 | 通过 | `e2e-v2.mjs` / `check-e2e-integrity.mjs` / `dry-run-infra.mjs` / `qa-v2-probe.mjs` / `dry-run-v21-infra.mjs` 语法无误 |
| `node .e2e-tmp/check-e2e-integrity.mjs` | **INTEGRITY PASS** | 反作弊门第 8 项：4 个执行器禁用模式 0、必需锚点齐全；7 个夹具零外链 / 零 emoji / 零紫粉渐变 |
| 新单测资产自检（`pnpm test` 全量） | **25 文件 / 228 例全绿**；其中 `v21-*.test.ts` **5 文件 61 例** + `v21-helpers.ts`（脚手架，0 用例）= 6 个 `v21-*` 文件 | 引用真实前端模块；此处为阶段一资产自检计数，阶段二按最终冻结产物如实重记 |
| 基础设施 dry-run | **4 项探针全部 available** | 见 §9；`isV2Adjudication: false`，明确标注非裁决 |

---

## 1. 为什么本轮验收方式必须彻底改（两次失效复盘）

v1 `docs/QA-PHASE4-REPORT.md` 报「43 passed / 0 failed、26 条门禁全绿」，用户实测「无法正常使用」。根因不在实现质量，而在**验收口径**：

| v1 证据 | 事实 | 后果 |
|---------|------|------|
| §3.1 白名单前置 | 通过 `chrome.storage.local.set('faf.siteAllowlist.v1', ['localhost'])` 直接写入 storage 构造前置状态 | E2E 绕过 UI，真实首次使用路径从未被测试 |
| §3.2 E2E-06 | 验证「移出白名单后拒绝填充」，即默认空白名单 = 默认全拒绝 | 用户开箱触发得到拒绝 |
| §3.2 E2E-03 | 预览阶段零写入，需第二次手势点「确认计划」 | 与「零配置一键全填」冲突 |
| AC-1 / AC-5 | 低置信度字段强制人工绑定后才继续 | 用户看到「没填满 / 填错」 |

**第二次教训（R2 → v2.1）**：R2 实测 P0=0 / P1=0 / Bronze、14 条 AC 逐条通过，但 13 个核心控件只有 11 个有值 —— 「所在单位」`f-org`、「诱饵字段」`f-decoy` 因 low-confidence 被判「待绑定」跳过。更须诚实记录：QA 曾把「13 个核心控件全非空」的 5 条 FAIL 按旧 AC 口径结案为「断言口径假失败」（B1）。**被结案的那 5 条恰恰是用户真实期望；错的是 AC 口径，不是 QA，也不是实现。** 测试越绿越证明口径错得一致。

**完成定义重置**：判定「可用」的标准是「用户一次手势后，除硬保护控件外是否还有可见控件留空」，不是「实现是否符合一份自洽的 AC 表」。

### 1.1 本轮红线（不可协商，v1 与 R2 两条教训叠加）

1. 起点必须是「全新安装、零配置、无任何 storage 预置、首次手势」。
2. E2E 禁止通过直接写 storage 或调用内部状态构造前置条件，必须从真实 UI 手势进入。
3. 判定「可用」的唯一起点是 **AC-V2-01 / AC-V2-15**；引擎层单测全绿只是必要条件，不是完成定义。
4. 四条安全底线（只填不提交、零外发、不写日志、不上传）继续作为一票否决项。
5. v1 完成定义（AC-1~8 + §12 端到端 + 26 条门禁）与 R2 的 B1 结案口径整体作废，不得复用其断言口径宣告 v2.1 可用。
6. **R2 的 `V2-01b` / `V2-02a` / `V2-02b` / `V2-05b` / `V2-11a` 五条原始断言一个字都不改、不删、不弱**；它们现在是正确期望，修复前（R2 产物）必红、修复后（v2.1 产物）必须真实转绿。

---

## 2. 依据与口径冲突登记

| 项 | 口径 |
|----|------|
| 唯一范围依据 | `docs/SPEC-v2.1.md` **22 条 AC**；与 `SPEC-v2.md` / R2 报告 / 本计划旧版冲突处以本文为准 |
| AC-V2-13（全文修订） | 生成器合法性前半句继续生效；**If 推断置信度 < 0.6 或 unknown，必须按 `label → placeholder → ariaLabel → nearbyText → name → elementId` 取语义词生成兜底值直接填入，不得跳过 / 留空 / 要求逐字段绑定**；不得硬猜类型或写入格式非法值 |
| AC-V2-14（局部修订） | 删除「低置信度 / unknown」这一跳过来源类别；诊断内手动指定类型单独补填**降为可选高级修正**，由 AC-V2-19 承接 |
| AC-V2-15~22（新增 8 条） | 兜底全填、语义词与去重与 maxlength、格式合法与 pattern、诊断「按标签生成」元数据、可选补填、天蓝主题与对比度、按钮等宽不截断、浮层压过页面弹窗 |
| 兜底口径澄清（team-lead 裁决） | ①「值含『我是』与标签语义」**只适用于文本类未识别字段**；number / date / time / email / select / checkbox 按 `SPEC-v2.1.md` §4.3 约束优先级「格式合法 > 语义词可辨识 > 模板字面一致」，**只断言格式合法与 DOM 值非空**，语义词改由诊断「按标签生成」标记承载。② 语义词全部取不到时统一「该字段」，不得用控件类型名。③ `FieldDiagnostic` 新增可选 `fallback: {source, semanticWord}`，`ResultBar.vue` 渲染 `data-faf="fallback"`。④ pattern 诊断原因统一「pattern 无法满足，未生成值」，`skipReason` 沿用既有 `'unsupported-control'`，**禁止断言新枚举值**。⑤ 前端仅允许改 `tests/contract/ui-contract.test.ts:110` 一处字面（`'待绑定'` → `'按标签生成'`），QA 不得动它 |
| L2 标记（team-lead 裁决） | 前端**不得**改 `src/detection/infer.ts` 的 `low-confidence` 标记；`tests/unit/l2-inference.test.ts:114` 应继续通过。v21 单测断言「plan item 的 `skipReason` 已清、`selected=true`」，**不**断言 descriptor 上不存在 low-confidence |
| AC-V2-20/21/22 口径 | 只写可观察结果（天蓝主题、对比度 ≥4.5:1、按钮等宽不换行不截断、浮层在 `dialog.showModal()` 之上可见可点）；实现路径由项目总监锁定为 popover top layer，SPEC 不写技术决策 |
| 图标 / 视觉 P0 | 禁 emoji 作功能图标、禁紫粉渐变、禁「Welcome to / Lorem ipsum / Sign up today」类空洞占位文案 |

---

## 3. 测试分层与资产清单

```
         /\        E2E 真机：.e2e-tmp/e2e-v2.mjs（干净 profile + CDP 手势 + 60 条 V21-* 断言）
        /E2E\      夹具：.e2e-tmp/fixtures/*.html（7 页，v2.1 新增 2 页）
       /------\
   /Integration\   请求日志 / 产物哈希 / 反作弊门静态校验 / 诊断 JSON 形状
  /-------------\
 /  Unit Tests  \   tests/unit/v21-*.test.ts（Vitest + jsdom，5 文件 61 例 + 1 helper）
/----------------\
```

### 3.1 v2.1 新增资产（本阶段全部新建，未改任何既有用例、未改任何 `src/**`）

| 任务 | 文件 | 用途 |
|------|------|------|
| A | `.e2e-tmp/fixtures/fallback.html` | 兜底主夹具：唯一可见 `role=dialog` 内 28 个控件，其中 12 个标签不命中任何别名（L2 必判 unknown）；覆盖 label / 仅 placeholder / 全空（该字段）/ maxlength=8 / 两个 pattern / number / date / email / select / textarea / contenteditable / 同名去重 / 2 个已识别回归字段；容器外 3 个哨兵；9 类硬保护控件；页面提交按钮与 `__qa` 计数器 |
| A | `.e2e-tmp/fixtures/overlay.html` | 层叠夹具：全屏 `z-index:2147483647` 遮罩（页面脚本持续重挂到 `documentElement` 末尾，保证普通层绘制顺序在扩展宿主之后）+ 两个原生 `<dialog>.showModal()`（可连续打开/关闭以验 MutationObserver 重提升）+ 页面可见输入框与真实 UI 按钮 |
| A | `.e2e-tmp/fixtures-inventory-v21.json` / `.e2e-tmp/v21-fixture-inventory.mjs` | 两个新夹具的 jsdom 结构清点证据与可复跑生成器（控件清单、哨兵值、哈希、零外链/零 emoji 校验） |
| B | `.e2e-tmp/e2e-v2.mjs` | **保留 R2 全部 60 条断言（55 条字面 + 5 条各场景动态 `*-INFRA-00`；对应 58 个既有 `record()` 调用点，含 1 个动态模板）与全部既有断言一字不改**；新增 60 条 `V21-*` 断言（含 AC-V2-22 的 `V21-22a~o` 15 条）、3 个新场景（S6-fallback / S7-overlay / S8-empty-v21）、8 个新探针与 WCAG / GB11643 独立 oracle、CDP 真实指针点击。新增夹具以两条 `FIXTURE_MAP[...] = ...` 语句注册，不改原 map 字面。核对方式：把归档 `archive-baseline-1915/e2e-v2-result.json` 的 60 个 id 逐条与脚本比对，55 个非 INFRA id 全部以字面存在，5 个 INFRA id 由 `record(\`${name}-INFRA-00 ...\`)` 模板覆盖，缺失 0 |
| B | `.e2e-tmp/e2e-v21-result.json` | v2.1 权威结果文件（阶段二生成）；R2 的 `e2e-v2-result.json` 保持不动 |
| C | `tests/unit/v21-helpers.ts` | QA 自有测试脚手架（descriptor 工厂 + 与生产同规则的 `deriveSeed` RNG + 锁定枚举表），非测试文件、0 用例 |
| C | `tests/unit/v21-fallback-text.test.ts` | 19 例：取值优先级、主体文案、随机后缀、同页去重、maxlength、pattern、number/date/time/email/select、硬保护、unknown 边界 |
| C | `tests/unit/v21-fill-planner.test.ts` | 9 例：plan item 对 unknown 变 selected 且清 low-confidence、descriptor 标记保留、硬跳过、pattern 失败沿用既有枚举、分批与计划形状回归 |
| C | `tests/unit/v21-diagnostics.test.ts` | 9 例：四类既有语义、`fallback` 元数据、现场 DOM 回读、pattern 原因文案、`{tool,generatedAt,items}` 包络 |
| C | `tests/unit/v21-ui-contract.test.ts` | 12 例：`data-faf="fallback"` 锚点契约、`fieldLabel` 文案、锁定枚举集合、L2 `low-confidence` 回归护栏、独立 WCAG oracle、P0 视觉静态扫描、hover 态真机 CR |
| C | `tests/unit/v21-common-fields.test.ts` | 12 例（P0 回归）：label 缺失但 placeholder 强命中 → `personName`/`phone`/`idCard`，断言 `inferredType` / `confidence>=0.6` / `fallbackValue===''` / 真实 provider 合法值；含「无特征 / 无别名 placeholder 仍 unknown」反向护栏，**不对 `scoreBreakdown.placeholder` 设上限** |
| D | `docs/QA-V2-TEST-PLAN.md` | 本文件（升 v2.1 版） |
| E | `.e2e-tmp/dry-run-v21-infra.mjs` / `.e2e-tmp/dry-run-v21-infra.json` | 基础设施 dry-run 脚本与记录（`isV2Adjudication: false`） |
| E | `.e2e-tmp/check-e2e-integrity.mjs` | 仅**新增** `dry-run-v21-infra.mjs` 到 `EXECUTORS` 扫描列表（第 8 项 8 个判定规则原文不变，属加强不属削弱） |

**未触碰**：`entrypoints/**`、`src/**`、根 `package.json` / `pnpm-lock.yaml` / `vitest.config.ts` / `tsconfig.json`、`scripts/**`、`wxt.config.ts`、`docs/SPEC-v2.md` / `SPEC-v2.1.md` / `QA-V2-REPORT.md` / `UI-V2.1-REVIEW.md`、`tests/unit/` 下任何既有用例文件（含 `tests/contract/ui-contract.test.ts`）。`playwright-core` 1.65.0 仍只在 `.e2e-tmp/` 独立目录。

### 3.2 环境事实（v1 / R2 已实证，直接复用）

| 项 | 事实 |
|----|------|
| 浏览器 | **Microsoft Edge 157** + `--headless=new` + `--disable-extensions-except` + `--load-extension`。品牌 Chrome 156 在 ≥137 移除 `--load-extension`，service worker 不启动 |
| 快捷键 | 必须 CDP `Input.dispatchKeyEvent`（`rawKeyDown`+`keyUp`，`modifiers: 9` = Alt+Shift，`code: KeyF`）；Playwright `keyboard.press` 不触发浏览器级加速器 |
| 真实指针点击 | CDP `Input.dispatchMouseEvent`（`mouseMoved` + `mousePressed` + `mouseReleased`），**禁止 DOM `.click()` 兜底**，否则绕过命中测试无法证明浮层在最上层 |
| 依赖隔离 | `playwright-core` 只在 `.e2e-tmp/` 独立目录；根 `package.json` / `pnpm-lock.yaml` 不动 |
| profile | 每个场景独立 `profile-v2-<name>`，运行前 `rmSync` 清空，运行后删除；结果文件记录 `profileFreshAtStart` |
| 产物现状 | 阶段一 dry-run 时 `.output/chrome-mv3` 已被前端重建（v2.1 build，`filler.js` sha256 `296fa210…`），**R2 产物已不在工作树**；dry-run 只用当前产物验基础设施，明确标注非裁决。阶段二必须以新冻结基线重建并重算全部哈希 |

---

## 4. 22 条 AC → 测试用例映射

> 判别器 = 「修复前必然失败、修复后必然通过」的断言，不得写成恒真断言。
> E2E 断言 ID 与 `e2e-v2.mjs` 中 `record(id, ...)` 一一对应；`V2-*` 为 R2 既有断言（一字未改），`V21-*` 为 v2.1 新增断言。

| AC | 要求摘要 | 单测用例 | E2E 断言 | 夹具 | 判别器 |
|----|----------|----------|----------|------|--------|
| **AC-V2-01** | 全新安装零配置首次触发即完成填充 | 契约存在性（container-selection） | `V2-01a`；**`V2-01b` 核心判别：13 个原生控件全部非空**；`V2-01c`；`V2-01d`；`V2-INFRA-01`；新增 `V21-INFRA-01/03` | main / fallback / overlay | **是**：R2 下 `f-org`/`f-decoy` 留空 → 必红；v2.1 兜底后必绿。**B1 结案作废，此条升格为主判别依据** |
| **AC-V2-02** | 扫描容器子树全部可见控件，一次填满 | 四级优先级 8 条 | `V2-02a`（**B1 五条之一**）；`V2-02b`（**B1 五条之一**）；`V2-02c~g`；`V21-15a` | main / multi-form / free-nodes / body-fallback / fallback | **是**：v1「只找最近 form」只命中诱饵 form 1 个控件 |
| **AC-V2-03** | 硬保护跳过；不填容器外控件 | visibility-filter / skip-controls 全组；`v21-fallback-text` 硬保护组 | `V2-03a/a2/b/c/d`；`V21-03a` 容器外三哨兵；`V21-03b` 9 类硬保护零写入 | main / free-nodes / fallback | **是**：Tier 3 兜底 body 会误填 `#outside-free-text`；兜底生成若误作用于硬保护控件即失败 |
| **AC-V2-04** | 永不点击提交、不触发 submit | — | `V2-04a/a-b/b/c`；`V21-04a`；`V2-ENTRY-01` | 全部 | 回归护栏 |
| **AC-V2-05** | 加固赋值序列、DOM 值匹配 + 两帧稳定，`validationCleared` 仅 advisory | assignment-retry 7 条；validation-advisory 6 条 | `V2-05a`；`V2-05b`（**B1 五条之一**）；`V2-05c` | main | **是**：v1 三层全过把已填字段判失败 |
| **AC-V2-06** | 失败/跳过字段可在诊断中定位 | `v21-diagnostics` 四类语义组 | `V2-06a/b/c/d`；`V21-18c/d` 诊断 JSON 可 parse、`{tool,generatedAt,items}` 与四类语义 | main / fallback | **是**：v1 无可复制诊断 JSON |
| **AC-V2-07** | 撤销恢复原值且不提交 | — | `V2-07a/b`；`V21-07a` 兜底值撤销后全部恢复 | main / fallback | **是**：零配置路径下 v1 根本没填充 |
| **AC-V2-08** | 零 fetch/XHR/WS/EventSource/sendBeacon、无远程字体、无日志 | `v21-diagnostics` 复制仅入剪贴板 | `V2-08a~e`；`V21-08a/b`；`V21-22j` | 全部 | 一票否决 |
| **AC-V2-09** | 单次手势、无白名单 / 预览 / 二次确认 | — | `V2-09a`；`V2-01c`；`V2-02d`；`V21-15b` 无「置信度不足/待绑定」 | main / fallback | **是**：v1 两次手势且默认拒绝 |
| **AC-V2-10** | 「重新选择区域」框选 Esc 零写入 | — | `V2-10a/b`；`V21-21a/b` 按钮布局 | main / fallback | 备选入口 |
| **AC-V2-11** | 默认放行，排除项可选 | — | `V2-11a`（**B1 五条之一**）；`V2-09a` | 全部 | **是**：v1 默认空白名单全拒绝 |
| **AC-V2-12** | 空状态文字、不报错、零写入 | container-selection 空容器；skip-controls 空状态；`v21-ui-contract` | `V2-12a~d`；`V21-12a` 空状态不出现绑定措辞 / 致命文案 | empty | 边界路径 |
| **AC-V2-13（修订）** | 生成器合法性 + unknown 按优先级兜底填入，不得跳过 / 留空 / 硬猜 | `v21-fallback-text` 19 例；`v21-fill-planner` 9 例；`v21-common-fields` 12 例 P0 回归；`v21-ui-contract` L2 护栏 | `V2-13a~f`（独立 oracle 全部保留）；`V21-15a`；`V21-16a~e` | main / fallback | **是**：R2 留空 2 个字段必然变红 |
| **AC-V2-14（修订）** | 跳过字段诊断可定位 + 手动指定类型单独补填，降为可选 | — | `V2-14a/b`；`V21-19a` | main / fallback | **是**：v1 无此入口 |
| **AC-V2-15** | 零配置一次手势，unknown 也生成兜底值直接填入，不得跳过 / 留空 / 阻塞 | `v21-fallback-text` unknown 边界组；`v21-fill-planner` unknown 选中组 | **`V21-15a` 15 个枚举控件 DOM 值全非空**；`V21-15b`；`V21-15c` filled ≥ 12；`V21-INFRA-01/03` | fallback | **是本轮最重要判别器**：R2 下 12 个未识别字段全空 → 必红；v2.1 后必绿。与 `V2-01b` 是同一主链路在不同夹具上的互补判别，不是恒真重复 |
| **AC-V2-16** | 值含语义词、守 maxlength、同页不重复；产品级范例「我是来源表测试数据」 | `v21-fallback-text` 优先级 / 主体文案 / 去重 / maxlength 组 | `V21-16a` 来源表；`V21-16b` 仅 placeholder；`V21-16c` 全空统一「该字段」；`V21-16d` maxlength=8；`V21-16e` 同名去重 | fallback | **是**：修复前这些字段全空 |
| **AC-V2-17** | 格式合法优先；pattern 无法满足才跳过且不阻塞 | `v21-fallback-text` pattern / 格式组；`v21-fill-planner` pattern 组；`v21-diagnostics` 原因文案 | `V21-17a` number；`b` date；`c` email；`d` select；`e` textarea/contenteditable；`f` 两个 pattern + 不阻塞；`V21-18f` 原因文案与既有枚举 | fallback | **是**：格式类字段只断言格式合法与值非空，不断言「我是」；修复前同样留空 |
| **AC-V2-18** | 诊断给出「按标签生成」标记 + 来源 + 语义词 + 填入值 + 元素定位 | `v21-diagnostics` 9 例；`v21-ui-contract` 12 例锚点契约 | `V21-18a` `data-faf="fallback"` 锚点（**缺失即失败**）；`V21-18b` 来源表语义词 + 最终值 + locator；`V21-18c/d` 包络与四类语义；`V21-18e` `fallback.source/semanticWord` | fallback | **是**：R2 无此锚点，缺失即失败，不删弱、不改恒真 |
| **AC-V2-19** | 手动补填为可选高级修正，不触发全表单重填 | `v21-diagnostics` 单字段形状 | `V21-19a`；`V2-14a/b` | fallback / main | 回归护栏 |
| **AC-V2-20** | 天蓝主题、按钮与悬浮层文字/背景对比度 ≥ 4.5:1、无紫粉渐变 | `v21-ui-contract` 独立 WCAG oracle（5.93 / 2.76 / 9.46 / 6.48 / 4.10）+ P0 静态扫描 | `V21-INFRA-04` oracle 反向校验；`V21-20a` 主按钮 CR≥4.5 且 `color !== hostColor`；`V21-20b` 天蓝通道 B>G>R + 无紫粉渐变；`V21-20c` 文字按钮/悬浮球/悬浮提示 CR≥4.5（节点缺失即失败） | fallback / overlay | **是**：修复前 `color:inherit` 主按钮 CR=2.76 → 必红 |
| **AC-V2-21** | 按钮等宽、文案完整、不换行、不截断、不重叠 | `v21-ui-contract` `.f-root button` 根因护栏 | `V21-21a` 两列 grid / nowrap / 单行 Range / 不截断；`V21-21b` 等宽 ≤1px 差、≥185px、不重叠、主按钮独占整行 | fallback | **是**：修复前 flex-wrap 挤压换行、文字被裁 |
| **AC-V2-22** | 浮层压过遮罩与 `dialog.showModal()`，可见可点 | `v21-ui-contract` P0 扫描 | `V21-22a` 遮罩有效；`b` 结果条/悬浮球渲染；`c` 悬浮提示存在；`d` dialog `:modal` 有效；`e` 宿主 `:popover-open` 且未降级；`f` 三处 `elementsFromPoint` 顺序 + `sr.elementFromPoint` 命中；`g` **CDP 真实指针点击**展开诊断；`h` 弹窗二重新提升；`i` 全关闭后仍压过遮罩；`j` 零外发 / 提交 0 / 无异常；**`k` 第三量（防 S6 放水）：`elementFromPoint(dlg-input-1 中心)` 独立命中页面弹窗内输入框**；**`l` 第四量：弹窗一 host 迁入 `dialog:modal` 后 `:popover-open` 补开为 true**；**`m` 第三量（S4）：弹窗二输入框仍命中**；**`n` 第四量（S4）：弹窗二迁移后 `:popover-open` 仍 true**；**`o` S5 归位：全关闭后 host 移回 `document.documentElement` 且 popover 保持** | overlay | **是**：普通层 z-index 必被遮罩盖住；`showModal()` top layer 下 z-index 完全无效。判定用 **Designer §4/§5-C 四量**——`fabHit` / `elementsFromPoint` 栈序 + `sr.elementFromPoint` + CDP 真实指针点击 / **`dialogInputHit`（第三量，区分 S3 与 S6）** / **迁移后 `:popover-open`（第四量）**。`V21-22f/g/h` 一字不改、不删、不弱；`k~o` 只增不减 |

**附加（非阻断）**：`V2-ENTRY-01` popup 文案；`V2-INFRA-00/02/03` 扩展加载、产物 chunk 一致性、请求日志采集；`V21-INFRA-01/03/04`。

---

## 5. 反作弊门（P0 门禁，8 项）

> 前 7 项沿用 v1 `QA-PHASE4-REPORT.md §9`，**第 8 项为 v2 新增**。v2.1 八项判定规则**原文不变**，仅把新建的 `dry-run-v21-infra.mjs` 纳入第 8 项扫描列表（加强，不削弱）。

| # | 检测项 | 检测方法 | 阻断阈值 |
|---|--------|----------|----------|
| 1 | 测试文件/用例被删 | 对比 `tests/` 目录清单与文件行数；本阶段只新增 `v21-` 前缀文件 | 任一既有测试文件被删除或行数骤减 → 阻断 |
| 2 | 断言数下降 | 对比开发前后 `expect(` / `assert` 数量 | 下降 → 阻断 |
| 3 | 新增 skip / xfail / .only / focus | 扫描 `tests/`；Vitest `numPendingTests` / `numTodoTests` | 新增 → 阻断 |
| 4 | 断言硬编码实现自己的输出 | 人工复核：身份证/号段/日期由 E2E 内独立 GB11643 oracle 与页面 option 判定，不从实现导入 | 断言值来自实现返回值而非 Spec 定义 → 阻断 |
| 5 | 测试框架配置篡改 | 核对 `vitest.config.ts`、根 `package.json` 的 `test` 脚本、覆盖率阈值、`pnpm-lock.yaml` mtime | 未经批准改动 → 阻断 |
| 6 | E2E 假绿 | 每条断言必须记录 `{id, ok, expected, actual, evidence}`；恒真断言、无条件通过的解析分支一律判无效 | 发现恒真断言或未观测即报绿 → 阻断 |
| 7 | 证据与产物一致性 | 产物 chunk 哈希 ↔ 请求日志；源码改动后必须全量重跑（见 §7） | 复用旧证据 / 证据漂移 → 阻断 |
| **8** | **E2E 不得预置 storage / 不得绕过 UI（新增）** | **确定性静态校验：`node .e2e-tmp/check-e2e-integrity.mjs`** | **命中任一项即阻断** |

### 5.1 第 8 项细分判定（机器可判定，作者改不动）

| 子项 | 检测内容 | 实现 |
|------|----------|------|
| 8.1 | 执行器源码不得出现任何 `chrome/browser.storage.*.set(...)`、泛化 `storage.set(...)` | 正则静态扫描 4 个执行器 |
| 8.2 | 不得出现站点白名单键、排除清单键、内部状态对象（预置前置条件） | 正则静态扫描 |
| 8.3 | 不得绕过 UI 直接发 `runtime.sendMessage` / `tabs.sendMessage` / `executeScript` 写 storage 来驱动填充 | 正则静态扫描 |
| 8.4 | 每个场景必须全新干净 user-data-dir（运行前 `rmSync`，结果记录 `profileFreshAtStart`） | 静态锚点 + 运行时 `V2-INFRA-01` / `V21-INFRA-01/03` |
| 8.5 | 必须从真实 UI 手势进入：CDP `Input.dispatchKeyEvent` / 页面按钮 `.click()` / popup 按钮 | 静态必需锚点（缺一即门禁不成立） |
| 8.6 | 首次手势前不得打开 options 页、不得配置任何站点条目 | 运行时 `optionsOpens === 0` + 结果文件 `antiCheat` 字段 |
| 8.7 | 夹具零外链资源、零完整协议 URL 字面、零远程字体、零 emoji 功能图标、零紫粉渐变、零空洞占位文案 | 静态扫描 `fixtures/*.html`（7 页） |
| 8.8 | 结果文件必须含 `antiCheat.presetStorageWrites`、`uiGestureOnly`、`artifact.fingerprint`、`source.fingerprint` | 阶段二核对 |

> 阶段一实测：`check-e2e-integrity.mjs` 输出 **INTEGRITY PASS**，4 个执行器禁用模式 0、必需锚点齐全，7 个夹具零外链 / 零 emoji / 零紫粉渐变。
> 注意：`check-guard.mjs` 只扫 `src/` 与 `entrypoints/`，夹具 URL 仍采用拆写 / 相对路径，不削弱任何门禁规则。
> **v2.1 追加的反恒真护栏**：所有 `V21-*` 的 `actual` 必须来自 DOM 值 / computed style / UI 文本 / 请求日志实测；禁止「解析失败即通过」「未找到即通过」「计数为空即通过」。`V21-18a` 强制 `markers.length >= 1` 后才允许 `.every(...)`，避免空集恒真；`V21-22c` 把「悬浮提示节点存在」写成显式失败项；`V21-INFRA-04` 用第三方公布的 CR 值反向校验 WCAG 函数本身。

---

## 6. 判别断言清单（修复前必然失败 / 修复后必然通过）

| 判别器 | 修复前为何必红 | 修复后为何必绿 | 位置 |
|--------|----------------|----------------|------|
| D1 零配置首次触发即填充 | v1 默认空白名单 = 全拒绝 | 默认放行 + 一次手势直接写入 | `V2-01b` / `V2-11a` |
| D2 容器跨非 form 子树全覆盖 | v1「最近 form」只命中诱饵 form 1 个控件 | 自动选定 dialog，子树全填 | `V2-02a` / 单测 Tier 1 |
| D3 Tier 3 最小公共祖先 | 兜底 body 会连容器外普通文本框一起填 | 选 `#common-ancestor` | `V2-02f` / `V2-03c` |
| D4 Tier 2 可见控件最多的 form | 焦点在小 form 时选错 | 恒选大 form | `V2-02e` |
| D5 单次手势、无白名单/预览/确认 | v1 两次手势且默认拒绝 | 一次手势 + 无白名单文案 | `V2-01c` / `V2-02d` / `V2-09a` |
| D6 校验态仅 advisory | v1 三层全过把已填字段判失败 | 只看 DOM 值匹配 + 两帧稳定 | `v2-validation-advisory.test.ts` |
| D7 诊断 JSON 四类语义 | v1 无可复制诊断 JSON | 可复制、可 parse、每字段四类语义齐全 | `V2-06c/d` / `V21-18c/d` |
| D8 撤销闭环 | 零配置路径下 v1 根本没填充 | 恢复原值且提交计数 0 | `V2-07a` / `V21-07a` |
| D9 诊断面板单独补填 | v1 无入口 | 入口存在、跳过字段可定位 | `V2-14a/b` / `V21-19a` |
| **D10 R2 的 B1 五条升格** | R2 下 `f-org`/`f-decoy` 留空，5 条必红 | v2.1 兜底填满，5 条必须真实转绿；不得再援引 B1 结案豁免 | `V2-01b` / `V2-02a` / `V2-02b` / `V2-05b` / `V2-11a` |
| **D11 兜底全填（本轮主判别）** | 新夹具 12 个 unknown 字段在 R2 口径下 DOM 值全空 | 按 label/placeholder 生成并写入，15 个枚举控件全非空 | `V21-15a` / `V21-15c` |
| **D12 语义词与模板** | 修复前无值 | 「我是来源表测试数据」、仅 placeholder、全空「该字段」、maxlength、同名去重均可观测 | `V21-16a~e` |
| **D13 格式合法 + pattern** | 修复前格式类字段同样留空；非法值会污染 DOM | number/date/email/select/textarea/contenteditable 合法；pattern 无法满足者跳过且不阻塞其余 14 项 | `V21-17a~f` / `V21-18f` |
| **D14 AC-V2-18 诊断锚点** | R2 无 `data-faf="fallback"` 与 `fallback` 元数据 | 锚点、来源、语义词、填入值、fieldId 定位、四类既有语义与包络全可核对 | `V21-18a~f`（缺失即失败，不删弱） |
| **D15 主按钮文字色** | `.f-root button{color:inherit}` 特异性覆盖，CR=2.76 | 去 `color:inherit`，白字/天蓝底 CR=5.93，且 `color !== hostColor` | `V21-20a` / `V21-INFRA-04` |
| **D16 天蓝主题与三处对比度** | 深蓝低饱和 Token；悬浮层未验 | B>G>R 天蓝；文字按钮/悬浮球/悬浮提示 CR 全部 ≥4.5 | `V21-20b/c` |
| **D17 按钮等宽不截断** | flex-wrap 挤压换行、文案被裁 | 两列 grid、nowrap、单行 Range、等宽 ≤1px 差、不重叠 | `V21-21a/b` |
| **D18 浮层层叠** | 普通层 z-index 被 2147483647 遮罩盖住；`showModal()` top layer 下 z-index 完全无效 | 宿主跟随 `dialog:modal` 迁移（S3）+ 每次迁移后 `ensurePopover()` 补开；四量同时成立；S6（扩展自开 modal）因 `dialogInputHit=HTML` 被第三量否决 | `V21-22a~o`（`f/g/h` 不变；`k/m` 第三量防 S6；`l/n` 第四量防迁移降级；`o` S5 归位） |

**反恒真约束**：所有判别断言的 `actual` 必须来自页面 DOM / computed style / UI 文本 / 请求日志的实测值；任何「解析失败即通过」「未找到即通过」「计数为空即通过」的写法均判无效。

---

## 7. 证据 ↔ 产物哈希绑定（防证据漂移）

### 7.1 绑定字段（阶段二 `e2e-v21-result.json`）

| 字段 | 来源 | 用途 |
|------|------|------|
| `artifact.fingerprint` / `artifact.files[]` | `.output/chrome-mv3/**` 全部文件 `sha256` 聚合 | 锁定本次实跑加载的扩展产物 |
| `source.fingerprint` / `source.files[]` | `src/**` + `entrypoints/**` 聚合 | 锁定实跑时的源码状态 |
| `scopeVersion` | `SPEC-v2.1 / 22 AC` | 明确本结果属于 v2.1 基线，不与 R2 混淆 |
| `antiCheat` | `presetStorageWrites` / `optionsPageOpens` / `gestureCalls` / `uiGestureOnly` | 第 8 项运行时证据 |
| `results[].evidence` | 每条断言的实测快照 | 可审计 |

### 7.2 三绑定一致性判定

1. **源码 ↔ 产物**：`pnpm build` 后重新计算 `artifact.fingerprint` 与 `source.fingerprint`，与结果文件一致。
2. **产物 chunk ↔ 请求日志实际加载**：`V2-INFRA-02` 从请求日志提取所有 `chunks/*.js` 与 `assets/*.css`，断言每个文件名都存在于当前磁盘产物（无幽灵 chunk），且至少观测到 1 个 chunk 请求。
3. **请求日志采集链**：`V2-INFRA-03` 要求 `context.on('request')` 与 CDP `Network.requestWillBeSent` 两条采集链均非空。
4. `V2-08a` / `V21-08a` / `V21-22j`：所有请求 URL 必须落在 `localhost:18766` / `127.0.0.1:18766` / `chrome-extension://` / `data:` / `about:` / `blob:` / `devtools://` 白名单内；`outbound` 必须为 0。
5. **R2 全部证据作废留档**：R2 的 `docs/QA-V2-REPORT.md`、`e2e-v2-result.json`、`qa-v2-probe.json` 及其三绑定哈希只作历史留痕，不得据其宣告 v2.1 可用；报告须写明「R2 证据已作废留档」。

### 7.3 源码冻结规则（v1 §3.3 教训，原文不改）

> **禁止「跑完 E2E → 写报告 → 又改源码」。**

1. 前端交付完成并自检通过后，由 team-lead 通知进入阶段二；
2. 阶段二的命令 + 反作弊门 + E2E 必须在**源码不再改动**的状态下一次连续执行；
3. 若 E2E 跑完后 `src/**` / `entrypoints/**` 任一文件再次变动（或 `pnpm build` 产生新 chunk 名），**旧结果文件立即作废**，必须重新构建并全量重跑，不得复用旧证据；
4. 报告中的 `artifact.fingerprint` / `source.fingerprint` 必须与结果文件、请求日志三者一致；
5. v1 曾出现 chunk 名由 `popup-Di5oKzOe.js` 变为 `popup-CsfsZAHo.js` 后按当前产物全量重跑 43 条的处理方式，本轮沿用。

---

## 8. 阶段二执行清单（team-lead 通知后才启动）

> **本阶段不执行以下任何一条命令作为最终裁决。**

```
# 1) 确定性门禁（顺序执行，全部 exit 0 才继续）
pnpm typecheck
node scripts/check-contracts.mjs
node scripts/check-guard.mjs
pnpm test                       # 按新增用例后的新文件数 / 用例数如实记录
pnpm build

# 2) 反作弊门第 8 项
node .e2e-tmp/check-e2e-integrity.mjs

# 3) 真机 E2E（每个场景全新干净 profile）
node .e2e-tmp/e2e-v2.mjs        # 产出 e2e-v21-result.json（不覆盖 R2）

# 4) 补充探针 / 清点
node .e2e-tmp/v21-fixture-inventory.mjs
# 核对 dry-run-v21-infra.json 的 computed style / hit test 观测原值

# 5) 核对
#    - artifact.fingerprint / source.fingerprint / 请求日志 chunk 三者一致
#    - 22 条 AC 逐条有对应断言且无恒真通过
#    - 新文件数与用例数（不得复用 R2 的「20 文件 167 例」与「60 条 / 52 passed」）
#    - R2 五条 B1 断言是否真实由红转绿（未转绿即产品缺陷，不得再援引 B1 豁免）
#    - 三项技术债如实核查（见 §12）
#    - P0 缺陷清单、回归集更新、改动影响分析、6 类失效模式核对
#    - 生产就绪记分卡 7 维 × 3 档

# 6) 产出
#    docs/QA-V2-REPORT.md 升 R3 或新建 docs/QA-V2.1-REPORT.md + RoleVerdict
```

### 8.1 阶段二必须补齐的报告章节

- 改动影响分析（改了什么 → 波及哪些旧行为 → 回归优先级）；
- 测试完整性反作弊 8 项结果（逐项结论 + 证据）；
- 回归率与解决率并列上报（回归率非零不判定完成）；
- 6 类生成式代码失效模式逐项核对；
- 生产就绪记分卡 7 维 × 3 档，总档取最低；
- P0 缺陷清单（含复现步骤）与每个 P0 沉淀为 `tests/regression/` 持久用例；
- 三项技术债如实核查，**不得写成完全满足**：本地埋点仍落 `chrome.storage.local`、补填撤销残留、manifest v1 文案（DEF-04 列 v2.2，本轮不计待修）；
- 上线建议（通过 / 不通过 + 生产就绪档位）+ RoleVerdict。

---

## 9. 基础设施 dry-run 记录（非 v2.1 裁决、不计入结论）

用 `.e2e-tmp/dry-run-v21-infra.mjs` 服务 `overlay.html` 夹具，以**当前工作树产物**跑一次，仅记录环境可用性事实：

| 项 | available | 观测证据 |
|----|-----------|----------|
| 扩展已加载（MV3 service worker） | `true` | `extensionId=dedjmmbbdpnfikcidkcleoepghfmnofg` |
| CDP 手势可触发 | `true` | `shadowBeforeGesture=false` → `shadowAfterGesture=true`，`cdpKeyEventsDispatched=2` |
| Shadow DOM computed style 探针可用 | `true` | `hostColor=rgb(22,32,46)`；主按钮 `rgb(255,255,255)` / `rgb(3,105,161)`；`.f-fab` 与 `.f-hint` 均 `rgb(255,255,255)` / `rgb(12,74,110)`；`hostPopoverOpen=true`、`zIndex=2147483647`、`position=fixed` |
| `elementFromPoint` / `elementsFromPoint` / `shadowRoot.elementFromPoint` 探针可用 | `true` | 两态校准：无弹窗时 `elementFromPoint` 命中宿主 `#faf-shadow-root`、`elementsFromPoint=[HOST, MASK, HTML]`、`sr.elementFromPoint` 命中影子树内 `svg`（`pointerEvents=auto`）；`dialog.showModal()` 后三者命中 `DIALOG#native-dialog-1`（`:modal=true`） |

结果文件：`.e2e-tmp/dry-run-v21-infra.json`（`isV2Adjudication: false`）。

> **此四项只证明探针与手势链路可用，不对任何 v2.1 产品行为下通过/失败结论，也不计入最终裁决。**
> 校准用途：无弹窗（仅全屏遮罩）态的返回形态就是 `V21-22i` 的达标形态，证明「命中顺序 + 影子树命中 + 真实指针点击」判据本身可满足，不是恒假断言。

### 9.1 层叠校准发现（重要，需 team-lead 在阶段二前裁决）

dry-run 追加了三项**纯浏览器行为观测**（`infrastructure.calibrationOnly`，`observationOnly: true`，正式裁决执行器 `e2e-v2.mjs` 不含相关代码、不据此构造通过条件）：

| 观测 | 结果 | 含义 |
|------|------|------|
| `dialog.showModal()` 打开后对 FAF 宿主执行 `hidePopover()` + `showPopover()` 重新提升 | `repromoted=true`、`hostPopoverOpen=true`，但 `elementFromPoint` 仍为 `DIALOG`、`elementsFromPoint=[DIALOG, HTML]` | 重新进入 top layer **不能**让宿主在 modal dialog 之下变为可命中 |
| 弹窗先于手势打开（扩展在弹窗之后注入） | 同上，`elementFromPoint=DIALOG`、FAF 宿主不在命中栈 | 与进入顺序无关，不是时序问题 |
| 同点新建 ① 普通 `z-index:2147483647` div ② `popover="manual"` 并 `showPopover()` ③ 第二个 `<dialog>` 并 `showModal()` | ① / ② 均**不在**命中栈；③ `elementFromPoint` 命中 `qa-calib-own-modal` | 原生 `showModal()` 会让弹窗之外的一切内容（含 top layer popover）inert；**只有另一个 modal dialog 才能压过并接收指针** |

结论（**基础设施事实，非产品裁决**）：

1. 用户诉求里的「全屏高 z-index 遮罩」是**可满足**的：当前产物的 FAF popover 在该态确实位于命中栈首位。
2. 「`<dialog>.showModal()` 之上仍可见且可点击」**不是当前锁定的 popover 方案能满足的**：浏览器 inertness 使弹窗外任何元素（含重新提升的 popover）都无法被 `elementFromPoint` 命中。但观测 ③ 证明该要求**存在可实现路径**（扩展自身以 modal dialog 形态进入 top layer），因此 `V21-22f/g/h` **不是不可满足的恒假断言**，而是对实现的真实判别。
3. QA **不自行削弱**这三条断言。**team-lead 已裁决 (A) 保持严格**（不选 B）：`V21-22f/g/h` 一字不改、不删、不弱，阶段二必须真实转绿，不得豁免；Designer 原先建议的 `hidePopover()→showPopover()` 重提升经真机实证无效，已改文档，**唯一权威路径为 S3**（host 跟随 `dialog:modal` 迁移 + 每次迁移后 `ensurePopover()` 补开）。若阶段二该态仍红，按 22 条 AC 正式计 P0，不得援引 R2 的 B1 结案豁免。
4. **补强判据（阶段一收口新增，只增不减）**：S6（扩展自建 modal 承载 host）表面 `fabHit=fab` 也能骗过 `V21-22f`，但会把页面整个 inert 掉，实测 `dialogInputHit=HTML`。故新增 `V21-22k/m` 独立读取 `elementFromPoint(页面弹窗内输入框中心)`，期望命中该输入框（Designer §5-C 行 129/132 第三量）；新增 `V21-22l/n` 独立读取迁移后 `host.matches(':popover-open') === true`（第四量，防 UA 自动关闭 popover 后未补开）；`V21-22o` 断言 S5 归位。以上均不由 `fabHit` 反推、不用「元素存在」代替。

> 本发现已随阶段一交付 `SendMessage` 报给 team-lead；dry-run 全程 `isV2Adjudication: false`，不构成阶段二结论。

---

## 10. 可机读判据（对比度 / 层叠 / 布局）与判定方式

### 10.1 对比度（AC-V2-20）

- 计算函数写在 `e2e-v2.mjs` 内（WCAG 2.1：sRGB 线性化 → `L=0.2126R+0.7152G+0.0722B` → `CR=(Lmax+0.05)/(Lmin+0.05)`），**读真实 `getComputedStyle`，不读 CSS 源码**。
- 文字按钮 `background-color` 为 `transparent` 时沿 `parentElement` 上溯首个非透明底色（`.f-result-bar` → `--surface`）；`opacity<1` 先按 alpha 与父底色合成再算。
- 阈值：文字 ≥4.5；`V21-INFRA-04` 用 `UI-V2.1-REVIEW.md §2` 已公布的 5.93 / 2.76 / 9.46 反向校验函数本身，防止 oracle 写坏造成假绿。
- 主按钮额外断言 `color !== getComputedStyle(host).color`（固化 `color:inherit` 根因回归）；天蓝主题断言主按钮底色 `B > G > R`。
- 扫 shadow root 内全部元素的 `backgroundImage`，禁止紫→粉渐变（P0）。

### 10.2 层叠（AC-V2-22）

判定链（**Designer §5-C 四量**同时成立；`V21-22f/g/h` 原判据一字不改，以下 6/7/8 为阶段一收口只增不减的补强，禁止以「元素存在」代替「在最上层」，禁止由 `fabHit` 反推第三/四量）：

1. 压力源有效性：`#z-mask` computed `zIndex=2147483647` / `position=fixed` / `pointerEvents=auto` 且覆盖整视口；`dialog.matches(':modal') === true`；宿主 `host.matches(':popover-open') === true`、`zIndex >= 2147483000`、`dataset.fafLayer !== 'degraded'`。
2. `document.elementsFromPoint(x,y)` 从上到下排序，FAF 宿主 / 影子树内元素索引必须 **小于** 遮罩与 dialog 索引；`document.elementFromPoint(x,y)` 不得为遮罩或 dialog。
3. `shadowRoot.elementFromPoint(x,y)` 必须命中 FAF 影子树元素且 `pointerEvents !== 'none'`。
4. **真实指针点击**：CDP `Input.dispatchMouseEvent` 在「逐字段诊断」按钮中心派发，断言 `.f-diagnostics` 由无到有；DOM `.click()` 不作兜底（会绕过命中测试）。
5. 反向用例：关闭弹窗一 → 打开弹窗二 → 再全部关闭，重复 2~3，验证 MutationObserver 跟随迁移。
6. **第三量（防 S6 放水，`V21-22k/m`）**：`probeDialogInputHit` 独立读取 `document.elementFromPoint(页面弹窗内输入框中心)`，期望命中该输入框或其后代，且 `top` 不得为 `HTML` 根元素（S6 实测值）、不得为 FAF 宿主。该探针**不读** FAF 宿主 / shadow root、不由 `hitOk` 或 `fabHit` 反推。S3 下 `dialogInputHit=dlgInput` 通过，S6 下返回 `HTML` 失败。
7. **第四量（迁移补开，`V21-22l/n`）**：独立读取 `host.matches(':popover-open') === true`，并要求 `insideModalDialog === true` / `modalDialogId` 为当前 `dialog:modal`（host 祖先链含 modal）。前端真机发现：把 `:popover-open` 的 host `appendChild` 到 `dialog:modal` 时 Edge 157 会**自动关闭 popover**（`true→false`），`ensurePopover()` 必须补开；S4 不补开即 `fabHit=pageDlg2`。
8. **S5 归位（`V21-22o`）**：全部 dialog 关闭后 `host.parentElement` 须回到 `document.documentElement`（`parentTag=HTML`）、`insideModalDialog=false`，且 `:popover-open` 仍为 true。

**Shadow DOM 命中判定说明**：扩展 UI 在 `#faf-shadow-root` 的 open shadow root 内，`document.elementFromPoint` 可能返回宿主（retargeting）也可能返回影子树内元素。判定同时接受「`el === host`」与「`el.getRootNode() === shadowRoot`」，并配合 `shadowRoot.elementFromPoint` 与真实指针点击。`.f-hint` 设计上 `pointer-events:none`（被动提示），仅为测量层叠顺序临时置 `auto`、测量后立即还原，`pointerRestored` 作为断言项证明探针未改坏 UI。

**`showModal()` 的浏览器约束**：见 §9.1。原生 modal dialog 会令弹窗外内容 inert，`elementsFromPoint` 不返回它们；因此第 1~8 条在 `showModal()` 态是否成立，取决于实现是否以 S3（host 跟随 `dialog:modal` 迁移 + 迁移后补开 popover）进入 top layer，而不是取决于 z-index 或重复重提升。**team-lead 已裁决 A 保持严格**：QA 不因为这条约束而放宽判据；阶段二 `V21-22f/g/h` 及新增 `k~o` 若仍红，按 22 条 AC 正式计 P0，不得豁免。

### 10.3 按钮布局（AC-V2-21）

- `.f-result-bar__actions` computed `display=grid`、`gridTemplateColumns` 恰好 2 个轨道（不硬编码 195px）、`flexWrap=nowrap`。
- 每个按钮 `scrollWidth <= clientWidth+1`、`scrollHeight <= clientHeight+1`、`whiteSpace=nowrap`、`textOverflow !== 'ellipsis'`；对按钮**文字节点**建 `Range`，`getClientRects().length === 1`（SVG 图标不计入，避免假多矩形）。
- 4 个文字按钮 `getBoundingClientRect().width` 两两差 ≤1px 且 ≥185px；主按钮宽度 ≥ 最窄文字按钮 ×1.8；任意两按钮矩形不相交；`textContent` 含完整「重新选择区域」「复制诊断 JSON」。

### 10.4 诊断兜底锚点（AC-V2-18，前端已落盘契约）

前端 `v21-frontend` 同步的锚点契约，QA 只做**可观察断言**，不复制实现：

- 标记节点：`.f-diag-row__fallback[data-faf="fallback"]`，**仅**在 `fieldType === 'unknown' && value.length > 0` 时渲染；文本逐字含「按标签生成 · 来源 {source} · 语义词 {word} · 填入 {expected}」。
- `source` 允许集合（锁死，出现集合外值即失败）：`label | placeholder | ariaLabel | nearbyText | name | elementId | default`；`default` 时 `word = 该字段`。
- 同一行必须保留元素定位：`.f-diag-row[data-field-id]` 与行内 `.f-diag-row__locator`（`fieldId` 文本）。`data-status`、`.f-select[data-faf="manual-type"]`、「补填此字段」「再填一次」「重新选择区域」「逐字段诊断」既有锚点一个不动。
- 复制出的诊断 JSON 中兜底项携带 `fallback.source` / `fallback.semanticWord`；四类既有语义 `expected / actualDom / strategyId / failureReason` 与 `{tool,generatedAt,items}` 包络一个不少。
- `pattern` 无法满足项：`value=''`、`selected=false`、`skipReason='unsupported-control'`（**沿用既有枚举，禁止新增**）、诊断原因逐字「pattern 无法满足，未生成值」，且同批其余控件继续填入。
- `unknown` 的 `low-confidence` 只在 **PlanItem** 层清除；L2 descriptor 仍保留（`src/detection/infer.ts` 未改），因此 `tests/unit/l2-inference.test.ts:114` 仍是回归护栏。QA 的 `v21-fill-planner.test.ts` 只断言 `item.skipReason === undefined && item.selected === true`，**不断言 descriptor 上不存在该标记**。
- 旧状态词「待绑定 / 置信度不足 / 未参与填充」在源码与构建产物中 0 命中；`V21-15b` / `V21-12a` 断言 UI 文本不得出现前两者，且必须出现「按标签生成」说明。
- **固定种子口径**：前端自证 seed 4821 下「来源表」→ `我是来源表测试数据·36`、「诱饵字段」→ `我是诱饵字段测试数据·25`（按 `field.id` 派生）。QA **不把这两个确定值写进断言**：断言只校验 SPEC 定义的语义结构（`我是{语义词}测试数据·NN`、同页不重复、长度约束），避免「断言硬编码实现自己的输出」（反作弊规则 4）。`v21-diagnostics.test.ts` 里的 `SOURCE_VALUE` 是测试自有夹具输入，已改为中性字面并注明用途。

---

## 11. 门禁与边界（本阶段已遵守）

- 未改 `entrypoints/**`、`src/**`、根配置、`scripts/**`、`wxt.config.ts`；
- 未改 `docs/SPEC-v2.md` / `SPEC-v2.1.md` / `QA-V2-REPORT.md` / `UI-V2.1-REVIEW.md`；
- 未改 `tests/unit/` 下任何既有用例文件，只新建 `v21-` 前缀文件（4 个测试文件 + 1 个 helper）；
- 未改 `tests/contract/ui-contract.test.ts:110`（前端已按 team-lead 批准自行同步，QA 未碰）；
- 未改 `check-e2e-integrity.mjs` 的 8 项判定规则，只把新 dry-run 脚本加入扫描列表（加强）；
- 夹具无外链资源、无远程字体、无完整协议 URL 字面、无 emoji、无紫粉渐变、无空洞占位文案；
- 执行器与 dry-run 全程无 storage 预置、无内部状态调用、无绕过 UI 的消息注入；
- `e2e-v2.mjs` 的既有 58 个 `record()` 调用点（对应 R2 的 60 条断言结果行）与全部既有断言一字未改；新增内容全部为追加。

---

## 12. 待办（阶段二前需确认）

| 项 | 说明 | 责任方 |
|----|------|--------|
| 源码冻结通知 | team-lead 通知后 QA 才进入阶段二；本阶段已 idle 等待 | team-lead |
| 新文件数 / 用例数 | 阶段二 `pnpm test` 按**新增后**的实际输出记录（现为 20 个既有 `.test.ts` + 4 个 `v21-*.test.ts` = 24 个测试文件，另 1 个 helper；新用例 49 条）。**不得复用 R2 的「20 文件 167 例」与 E2E「60 条 / 52 passed」** | QA |
| AC-V2-18 锚点 | 前端 `ResultBar.vue` 已含 `data-faf="fallback"`、`FieldDiagnostic.fallback` 已落地，`V21-18a~f` 为「缺失即失败」判别器；若阶段二前有改动，判别器不删弱、不改恒真 | 前端 / QA |
| AC-V2-22 实现阻断项 | `docs/UI-V2.1-REVIEW.md §2/§4` 列的 dark `--accent-on` on `--brand-ink`、`.f-btn--primary:hover` 白字 4.10:1、`:root[data-theme="dark"]` 在 Shadow DOM 不生效、Observer 未 `hidePopover()→showPopover()` 重提升等，均为设计侧标记的放行阻断项。阶段二以实测为准，QA 不预判、不放宽断言 | 前端 / QA |
| 三项技术债 | 本地埋点仍落 storage、补填撤销残留、manifest v1 文案 —— 阶段二如实核查，不得写成完全满足；DEF-04 列 v2.2 不入本轮 | QA |
| AC-V2-11 显式排除项分支 | 本轮 E2E 只测「默认放行」；若补测必须走真实 UI 操作，禁止任何预置 | QA / team-lead |
| 品牌 Chrome 实机 | v1 列为尾项；Edge 实机在验收范围内 | team-lead |
