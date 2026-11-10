# QA 测试计划 — 表单自动填充工具 v1

> 版本：v1.1（Phase 2 测试设计交付 + Phase 3 并行复验） · 日期：2026-11-09 · 负责人：QA 严过关
> 状态：**单元 / 契约 / 合规 / 回归 104 例全绿、0 failed、0 skipped；实跑发现的 3 个缺陷已由前端真实修复并复验，已沉淀 3 份持久回归集。但 Phase 4 端到端门禁链路当前未就绪（`pnpm build` 与两个声明的门禁脚本失败，前端 #17 进行中）→ 上线建议「不通过」。**
> 验收唯一依据：`docs/SPEC-v1.md`（尤其 §9 验收标准 / §11 已知坑 / §12 端到端验证）；EARS 条款见 `docs/PRD-v1.md` §8 AC-1~AC-8；机器契约见 `docs/contracts/*`；回读判据见 `docs/ARCH-v1.md` §14.2，Phase 3 门禁见 §12（12 条）+ §18（14 条）。与三文档冲突时以 Spec 为准；ARCH §14–18 优先于正文 v1.0 冲突表述。
> 独立性声明：本轮 QA **只写测试与质量文档**，未写任何业务实现代码，未修改 `src/`、`entrypoints/`、`wxt.config.ts`、`tsconfig.json`。测试作者与实现作者解耦；合法性判定由 `tests/helpers/legality.ts` 中独立实现的 GB 11643 / 号段 / 日历 oracle 完成，不 import 实现的 `isValidIdCard`。
> 口径同步：本版吸收架构师高见远、设计师 2026-11-09 的权威指路（`ControlType` 5 类、`unknown` 哨兵、三层回读唯一判据、MUT-01 必过项、26 条门禁、三阈值权威、`E_UNSUPPORTED_CONTROL` 分母口径、离线图标），并全部落成可机器校验的断言。

---

## 0. 本轮实跑环境（真实输出，未修饰）

| 项 | 值 |
|----|----|
| 运行命令 | `pnpm exec vitest run`（连续复跑 2 次，结果一致） |
| 运行目录 | `D:/myTools/form-auto-filler/` |
| 运行时 | node v22.22.2 / pnpm 10.2.1 / vitest 5.1.0 / jsdom 31.0.0 |
| 最终输出 | `Test Files 12 passed (12)`；`Tests 104 passed (104)`；`Duration 2.74–2.85s` |
| failed / skipped | **0 / 0** |
| 断言总数 | 264 处 `expect(`（含循环体内多次执行），无快照、无 `expect(true)` |
| `pnpm exec tsc --noEmit --strict` | **通过**（exit 0）。注意 `tsconfig.json` 的 `include` 不含 `tests/**`，且不校验 `.vue` 内 import；**typecheck 通过 ≠ 构建通过** |
| `pnpm build` | **失败**（`UNRESOLVED_IMPORT`：`entrypoints/options/App.vue:8` 引用不存在的 `./components/IoStatsTab.vue`），见 §9.5 |
| `pnpm check:contracts` / `check:guard` | **失败**（`scripts/check-contracts.mjs` / `scripts/check-guard.mjs` 未产出，`scripts/` 为空目录），见 §9.5 |

> 后三项是**当前快照的 Phase 4 门禁阻断项，不是 QA 单元测试缺陷**。前端任务 #17 仍 `in_progress`；按 Spec §12 第 1 步与 ARCH §12 第 12 条，这三处不通过即不能进入 E2E。QA 不掩盖、也不把「进行中」粉饰成「通过」。

---

## 1. 测试策略

### 1.1 分层（金字塔）

| 层 | 范围 | 本轮产物 | 例数 |
|----|------|----------|------|
| 单元（大量） | 纯函数：L2 推断、20 类生成器、原生 setter、三层回读、RuleStore、SiteGuard、结构 hash、三阈值 | `tests/unit/*.test.ts`（6 文件） | 41 |
| 契约（门禁） | 20 类枚举三处一致、LIMITS、VerificationDetail 三层 slug、ErrorCode、SkipReason、rules.schema 安全约束；**ControlType 5 类 / unknown 哨兵 / 11 计数事件 / 六份契约字节一致 / UI 文案** | `tests/contract/contracts.test.ts` + `tests/contract/ui-contract.test.ts` | 37 |
| 合规（静态门禁） | emoji / 紫粉渐变 / AI 模板味 / 零外发 / 组件实例私有字段 / 裸 value 赋值 / 主按钮文案 / manifest 权限 / 依赖锁定 / **离线图标** / **禁宣称读 state** / **`f-control-type` 5 类** | `tests/compliance/gates.test.ts` | 14 |
| 回归（持久集） | 3 个已修复缺陷的常驻杀手用例 | `tests/regression/*.test.ts`（3 文件） | 12 |
| 集成 + E2E（少量） | AC-1~AC-8 用户旅程、端到端 8 步、3 条硬指标、**26 条 Phase 3 门禁** | 本文件 §3 / §4 / §4.1，Phase 4 在真实 Chromium 120+ 页面执行 | — |

### 1.2 纪律（对应知识库 `test-discipline.md` / `test-integrity-anti-gaming.md`）

- **先写测试**：Phase 2 与前端实现并行产出用例；用例从 Spec/EARS/契约反推，不复述实现假设。
- **黑盒优先**：断言输入 → 可观测输出；合法性由独立 oracle 判定，不绑私有实现。
- **不为覆盖率而覆盖率**：无快照、无 `expect(true)`、无永远为真的断言；每条断言都能在缺陷注入时变红。
- **反作弊**：不删测试、不弱化断言、不新增生效中的 `skip/xfail/.only`、不改框架配置与阈值。`TC-GEN-04` 专门断言「换种子必须产生不同数据集」，杀死「硬编码常量换绿」。
- **独立复核**：`verifier-critic-pattern.md` — 只标三类阻断（正确性缺陷 / 需求未满足 / 契约安全数据完整性破坏），风格偏好与未被要求的额外特性一律不进 blocking。
- **oracle 自检**：本轮唯一一次用例改动是把 `ac4-pattern-anchor.test.ts` 的正则 oracle 从 `new RegExp(pattern)` 改为 **HTML 隐式全串锚定** `^(?:...)$`。原因是未锚定的 `\d{6}` 会命中回退值 `A974369` 的子串，产生假绿；**该改动是收紧断言而非弱化**，且未改变任何期望值。

### 1.3 测试发现机制（防假绿）

`tests/helpers/load-contract.ts` 通过 Vite `import.meta.glob` **按导出名**发现实现模块（不硬编码文件名）：

| 状态 | 含义 | 行为 |
|------|------|------|
| `ready` | 找到契约导出 | 用例**真跑**，断言全量生效 |
| `missing` | 实现模块尚未产出 | 逐条 `it.skip`，理由写进用例名；**不计为通过** |
| `error` | 源码已产出但导出缺失/加载失败 | 额外注册一条**显式失败**用例，绝不静默 skip |

> 当前源码已全部产出，所有发现器均解析为 `ready`，故 `skipped = 0`。代码里保留的 `it.skip` 是**条件分支的声明**（Phase 2 已在报告中登记），当前无一条生效；这不是新引入的 skip，也不计入通过率。

---

## 2. 契约导出面（QA ↔ 前端）

> QA 初版按 `interfaces.ts` 预设了类名风格（`inferFieldType` / `RandomProvider` / `Filler` / `RuleStore` / `SiteGuard`）。前端实际采用工厂函数风格（`createXxx`）与 `GENERATORS` 映射，这是「入口只装配」的合理实现，**不违反任何锁定接口**。QA 主动把绑定改到真实公开导出，**未要求前端改名、未删弱任何一条断言**。

| 能力 | 真实导出（glob） | 签名 | 依据 | 状态 |
|------|------------------|------|------|------|
| L1 扫描 | `scan`（`src/detection/**`） | `scan(ctx): ScanReport` | interfaces.ts FieldDetector.scan | 已接入 |
| L2 推断 | `infer`（`src/detection/**`） | `infer(handles, ctx): FieldDescriptor[]` | ARCH §5.2 infer.ts | 已接入 |
| 20 类生成器 | `GENERATORS`（`src/data/generators/**`） | `GENERATORS[type](input): string` | field-types.json 20 generator id | 已接入 |
| 一致性记录 | `createGeneratedRecord`（`src/data/**`） | `(seed) => GeneratedRecord` | SPEC §6 identity 组 | 已接入 |
| 固定种子 | `createRng`（`src/utils/**`） | `(seed) => Rng` | SPEC §6 B2 | 已接入 |
| 规则默认值 | `createDefaultRules`（`src/config/**`） | `() => RulesDocument` | rules.schema.json | 已接入 |
| 原生赋值 | `setNativeValue`（`src/fill/**`） | `(el, value) => void` | SPEC §11 已知坑 | 已接入 |
| 三层回读 | `createStateVerifier`（`src/fill/**`） | `verify(handle, value, adapterId): Promise<VerificationDetail>` | ARCH §14.2 | 已接入 |
| 填充装配 | `createFiller` + 6 个 P0 策略工厂（`src/fill/**`） | `createFiller(strategies): Filler` | ARCH §14.1 | 已接入 |
| 结果映射 | `verifyAndBuild`（`src/fill/**`） | `(handle, value, deps, start, adapterId) => Promise<FillResult>` | ARCH §14.2 | 已接入 |
| RuleStore | `createRuleStore`（`src/config/**`） | `(storage: StoragePort) => RuleStoreEx` | interfaces.ts RuleStore | 已接入 |
| 拾取器写入校验 | `validateFieldOverride`（`src/config/rule-validator.ts`） | `(raw) => string \| null` | rules.schema.json#FieldLocator | 已接入（QA-B03 修复） |
| 结构 hash | `computeStructureHash`（`src/config/**`） | `(root: ParentNode) => string` | rules.schema.json#PageOverride | 已接入 |
| SiteGuard | `createSiteGuard`（`src/config/**`） | `setAllowlist()` / `assertAllowed()` | interfaces.ts SiteGuard | 已接入 |
| FillPlanner | `createFillPlanner`（`src/execution/**`） | `(init).plan(fields, rules, ctx, provider)` | interfaces.ts FillPlanner | 已接入 |
| 阈值副本 | `LIMITS`（`src/contracts/**`） | 与 `docs/contracts/types.ts#LIMITS` 全字段相等 | ARCH §17.2 | 已接入 |
| 控件类型标签 | `CONTROL_TYPE_LABELS`（`src/contracts/field-metadata.ts`） | `Record<ControlType,string>`（5 类） | ARCH §17.6 / types.ts L42 | 已接入 |
| 可绑定类型 | `BINDABLE_TYPES` / `controlLabel` / `fieldLabel`（`src/ui/control-labels.ts`） | 20 类、不含 `unknown` | UIUX R12 / R15 | 已接入 |

机器可读版本：`tests/helpers/contract-surface.ts`。

---

## 3. AC-1 ~ AC-8 逐条测试用例

> 格式：Given（前置）/ When（步骤）/ Then（期望，全部为可观察行为）/ 自动化可行性。用例 ID 与 `tests/unit/*.test.ts` 中的 `TC-*` 对应。

### AC-1 全量扫描与预览不写值

- **Given** 白名单内 test/uat 页面，打开一个从未配置过的表单弹窗，含中文 label、原生 input、AntD Vue / Element Plus 的 select 与 date-picker、textarea、容器外搜索框、至少一个 v1 不支持控件。
- **When** 用户按填充快捷键（首次手势，content script 按需注入）。
- **Then** ① 出现填充计划预览（三列：页面控件 / 推断字段类型 / 将填入的值，**控件类型列是 `ControlType` 5 类纯文本**）；② 隐藏 / 禁用 / 只读 / 文件 / 密码 / 验证码控件被过滤；③ 作用域限定最近表单容器，容器外搜索框/筛选框被排除并给出跳过原因；④ 低置信度字段以 `unknown` 列出供点选绑定（`field_unknown` 计数 +1）；⑤ **此阶段无任何控件值变化、提交按钮未被点击**；⑥ 可填控件数为 0 时展示空状态而非报错；⑦ 页面刷新后需再次手势触发并有明确提示。
- **自动化**：单元可测（`TC-GUARD-04/05`、`TC-L2-03/04`、`C5-3`）；手势/注入/空状态/主按钮文案为 E2E + 静态门禁 `TC-GATE-11`。

### AC-2 确认计划后只填不提交

- **Given** 已生成预览计划，部分行被用户勾选跳过。
- **When** 用户确认计划。
- **Then** ① 仅 `selected` 行被写入；② **不点击任何提交/确定按钮，不触发表单提交**；③ 预览 / 结果 / popup 三处主按钮文案不得出现「提交 / 确定 / 保存并提交」，常驻「仅填入，不提交」；④ 每个控件写入后必须回读；⑤ 单控件失败不中断其余控件。
- **自动化**：`TC-GATE-11`（文案静态门禁）；提交计数与失败隔离为 E2E（硬指标见 §4、ARCH §12 #5）。

### AC-3 受控赋值与三层回读（核心）

- **Given** Vue/React 受控 input，或 v1 适配范围内 AntD Vue / Element Plus 的 select / date-picker。
- **When** 执行填充。
- **Then** ① 走 ISOLATED world DOM 主路径：原型原生 setter `.call(el, value)` + 冒泡 `input`/`change`；② **禁止**裸 `el.value = x`，**禁止**依赖 `__vue__` / `__vueParentComponent` / React 私有 props；③ 以 `FillResult.verified` + `VerificationDetail` 三层证据判定（**唯一判据，见 §5**）；④ 任一层失败 → `status='failed'` + `code='E_READBACK_MISMATCH'` + `failureReason` 写明失败层；⑤ 超范围控件记 `E_UNSUPPORTED_CONTROL`，**结果面板单列「超范围控件」分组、不计入失败、不占零配置可用率分母**；⑥ ant/el 下拉从 body 级 portal 找选项，日期按 `valueFormat`。
- **自动化**：`TC-FILL-01~06`、`TC-GATE-09/10/13` 真跑；portal / valueFormat / 兼容性矩阵为 E2E（ARCH §18 #2/#3/#9）。

### AC-4 生成值合法性

- **Given** 字段已归一化到 20 类之一。
- **When** 生成取值。
- **Then** ① 身份证 18 位 + GB11643 校验位 + 合法地区码 + 合法出生日期；② 手机号命中 `^1[3-9][0-9]{9}$`；③ 日期 = 身份证 7-14 位、性别 = 第 17 位奇偶、同种子同一条记录；④ 枚举值取自该页面可见 option 集合；⑤ 同种子多次生成完全一致、换种子必须不同；⑥ 金额/数量/百分比尊重 `min/max/step/pattern`；⑦ 违反约束的值不得写入。
- **自动化**：`TC-GEN-01~09` 真跑（200 种子 × 身份证/号段、50 种子 × 数值约束、独立 GB11643 oracle）+ 持久回归 `tests/regression/ac4-pattern-anchor.test.ts`（带 `^...$` 锚点 pattern，HTML 全串锚定 oracle）。

### AC-5 低置信度与结构漂移

- **Given** 某字段置信度 < 0.6，或页面结构 hash 与已存规则不匹配。
- **When** 生成计划 / 加载规则。
- **Then** ① 类型标 `unknown` 并在预览「待绑定」态列出供点选绑定，禁止硬猜或静默填值；`unknown` **不是 20 类之一、不是生成器目标、不可作为拾取器可绑定项**，单独计 `field_unknown`；② 结构 hash 漂移时提示「规则可能失效，是否重新校验」并给出元素定位，禁止静默沿用；③ 归一化剔除动态 `id` / 随机 class / `data-v-*` / 时间戳，避免误报。
- **自动化**：`TC-L2-03/05`、`TC-LIM-05`、`TC-RULE-01/02`、`C5-3` 真跑；漂移提示恰好一次为 E2E（ARCH §18 #8）。

### AC-6 白名单与表单作用域拒绝

- **Given** 当前域名不在白名单，或目标控件落在表单容器之外。
- **When** 触发填充。
- **Then** 拒绝填充并给出 `E_SITE_NOT_ALLOWED` 明确提示，**不写入任何值**；容器外控件搜索框/筛选框同样排除。**白名单是唯一授权者**，环境标识只能把「已受信父域」扩展到 test 样子域，不得让任意含 `test` 子串的域名通行。
- **自动化**：`TC-GUARD-01/02/03/04/05` 真跑 + 持久回归 `tests/regression/ac6-allowlist-bypass.test.ts`（`test.example.com.evil.com` / `latest.prod.com` 等 5 个绕过向量）。

### AC-7 联动稳定与分批调度

- **Given** 填充过程中某字段触发联动新增控件或异步加载下拉。
- **When** 继续执行。
- **Then** ① 等待联动稳定后再填新增控件（`MutationObserver` + predicate + `AbortSignal` + 3000ms 兜底），**不得用固定 `setTimeout` 判断稳定**；② 分批派发让出主线程并限速；③ 页面不卡顿、不打爆异步唯一性校验；④ 超时记 `E_LINKAGE_TIMEOUT`，其余控件不受影响。
- **自动化**：`TC-LIM-06/07`（250 控件截断 / 120 项分批）真跑；联动与页面卡顿为 E2E（ARCH §18 #4）。

### AC-8 拾取器只存增量

- **Given** 用户在拾取器把某控件改绑为另一字段类型。
- **When** 保存改绑。
- **Then** ① 只新增一条按页面指纹（URL 模式 + 归一化结构 hash）归档的增量规则；② 不覆盖全局别名词典；③ 不生成全量字段映射表；④ 导出 JSON 不含诊断计数；⑤ 禁用 CSS/XPath 作主键，规则内禁可执行代码；⑥ **写入前即校验**，非法 `locator.strategy` 不得落盘，导出-导入必须自洽。
- **自动化**：`TC-RULE-03/04/05/06`、契约 `C4` 真跑 + 持久回归 `tests/regression/ac8-illegal-locator-strategy.test.ts`。

---

## 4. 端到端 8 步验证清单（SPEC-v1 §12 / PRD-v1 §14）

| 步 | 操作 | 断言 | 自动化 | 当前状态 |
|----|------|------|--------|----------|
| 1 | `pnpm install` → `tsc --noEmit --strict` → `pnpm build` → `pnpm exec vitest run` | 全部通过 | CI | **阻断**：typecheck / vitest 通过，`pnpm build` 失败（见 §9.5） |
| 2 | Chromium 120+ 载入 `.output/chrome-mv3` 未打包扩展；options 加入一个 test/uat 白名单域名 | 安装期**无**「读取和更改所有网站上的数据」宽泛权限警告；manifest permissions 仅 `activeTab/scripting/storage`；无 `host_permissions` | 静态门禁 `TC-GATE-01` + 人工 | 静态通过，E2E 待执行 |
| 3 | 打开从未配置过的表单弹窗（中文 label、原生 input、AntD Vue 或 Element Plus select/date-picker、textarea、容器外搜索框、至少一个 unsupported 控件），记录填充前控件数 | 控件清单与页面一致 | 人工 + 计数 | 待执行 |
| 4 | 按快捷键 → 出现填充计划预览 | 此时**无任何值变化**、提交按钮未被点击、低置信度以 `unknown` 列出（AC-1/2/5）；刷新后需再次触发 | E2E | 待执行 |
| 5 | 确认计划 | 值全部写入、失焦即时校验无红框、提交按钮仍未点击；逐项核对身份证校验位 / 号段 / 日期与性别一致 / 枚举命中 option；同种子重复结果一致（AC-2/3/4）；unsupported 控件带 `E_UNSUPPORTED_CONTROL` **单列** | E2E + `TC-GEN-*` | 单测通过，E2E 待执行 |
| 6 | 错误流：域名移出白名单 / 无可填控件页 / 改绑一个字段类型 | 拒绝填充且提示 `E_SITE_NOT_ALLOWED`；空状态；只新增一条页面级增量规则（AC-6/1/8） | E2E + `TC-GUARD-*` / `TC-RULE-*` | 单测通过，E2E 待执行 |
| 7 | 联动/改版流：触发联动下拉；增删控件改变结构 hash | 新增字段在稳定后被填且页面不卡顿；提示「规则可能失效」不静默沿用（AC-7/5） | E2E + `TC-RULE-01` | 单测通过，E2E 待执行 |
| 8 | 完成判定 | AC-1~8 全通过 + **误填 0 + 自动提交 0 + 外发请求 0** + 失败项可一键定位到元素 | 门禁总闸 | 未达成（step 1 阻断） |

### 三条硬指标（Spec §9 补三条硬判据 / PRD §11）

| 硬指标 | 定义 | 采集方式 | 通过线 |
|--------|------|----------|--------|
| **误填次数 = 0** | 搜索框 / 筛选框 / 密码 / 验证码 / 只读 / 禁用 / 隐藏 / 已有值 / 表单容器外控件被写入的次数 | 填充前快照 + 填充后逐控件比对；诊断报告 `skipReason` 分组；本地计数 `field_skipped` | 严格 0，非 0 即 P0 |
| **自动提交次数 = 0** | 扩展主动点击提交/确定按钮或触发 `form.submit()` / `requestSubmit()` 的次数 | 提交按钮点击监听 + `submit` 事件监听 + 网络面板写请求 | 严格 0，非 0 即 P0 |
| **外发请求数 = 0** | `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / `sendBeacon` / 远程字体 / CDN / 统计 SDK / 远端规则库产生的请求 | 浏览器 Network 面板（禁用缓存、清空后重跑）+ 静态门禁 `TC-GATE-08`（API）与 `TC-GATE-12`（声明式远程资源）+ `exportJson()` 不含 `faf.counters.v1` | 严格 0，非 0 即 P0 |

> 三条均为**一票否决**：任意一条非零，Phase 4 直接判不通过，不接受「偶发」「内网不算」等豁免。

### 4.1 Phase 3 门禁 26 条（ARCH §12 的 12 条 + §18 的 14 条）

> 架构师口径：第 12 章 12 条 + 第 18 章 14 条 = **26 条 Phase 3 门禁**，全部固化；下表给出每条的自动化归属与对应用例。`E2E` 表示必须在真实 Chromium 页面执行，**不可用单测替代**。

| ID | 来源 | 断言摘要 | 归属 | 对应用例 |
|----|------|----------|------|----------|
| G12-01 | ARCH §12 #1 | 载入 `.output/chrome-mv3`，安装期无宽泛权限警告 | E2E + `TC-GATE-01` | step 2 |
| G12-02 | ARCH §12 #2 | A 页按 `Alt+Shift+F`，content script 被 `executeScript` 注入 | E2E | step 4 |
| G12-03 | ARCH §12 #3 | 计划预览出现，字段数 ≥ 20，搜索框默认可跳过 | E2E | step 4 |
| G12-04 | ARCH §12 #4 | 可填字段 DOM 值 = 计划值；readonly/disabled 在 skipped；`filled+skipped+failed === total` | E2E | step 5 |
| G12-05 | ARCH §12 #5 | **React 受控输入提交 payload 非空**（验证 native setter 绕过 valueTracker） | E2E | `TC-FILL-02` 单测 + 兼容性矩阵 |
| G12-06 | ARCH §12 #6 | B 页 `a-input`/`a-select` 被填、`a-date-picker` 按 `valueFormat`；不支持控件带 `E_UNSUPPORTED_CONTROL` | E2E | ARCH §18 #3 / #9；**文案冲突见 §9.6** |
| G12-07 | ARCH §12 #7 | 同种子连续填两次，`idCard`/`date`/`gender` 一致且校验位正确 | 单测 + E2E | `TC-GEN-01/03/04` |
| G12-08 | ARCH §12 #8 | 非白名单域名拒绝 `E_SITE_NOT_ALLOWED`，不写入任何字段 | 单测 + E2E | `TC-GUARD-03` + `ac6` 回归 |
| G12-09 | ARCH §12 #9 | 导入 `schemaVersion: 999` → `E_RULE_SCHEMA_INVALID`，原有规则不变（无半加载） | 单测 | `TC-RULE-05` |
| G12-10 | ARCH §12 #10 | `page-bridge.js` 注入失败 → 填充仍完成，报告 `E_BRIDGE_UNAVAILABLE`，无未捕获异常 | E2E | 隔离性（G18-07） |
| G12-11 | ARCH §12 #11 | 单页 100 字段不卡死，分批生效，`requestIdleCallback` 回退，总耗时有上限 | 单测 + E2E | `TC-LIM-06/07` |
| G12-12 | ARCH §12 #12 | 门禁命令全通过：无 > 300 行文件、入口 < 100 行、纯逻辑层无 `vue`/`chrome.`/`wxt/browser` | CI 脚本 | **当前失败，见 §9.5** |
| G18-01 | ARCH §18 #1 | **MUT-01 必过项**：事件已派发但框架两帧后回滚 → `verified=false` / `status='failed'` / `E_READBACK_MISMATCH` / `failureReason` 指向 `frameworkStateMatched` / 不计入成功数 / UI 不显示成功态 | 单测（前 5 项）+ E2E（UI 成功态） | `TC-FILL-05`（必过项） |
| G18-02 | ARCH §18 #2 | portal 级下拉：面板挂 body 而非触发器子树时仍能选中目标 option | E2E | 兼容性矩阵 |
| G18-03 | ARCH §18 #3 | `valueFormat` 非默认格式按格式产出；无法解析 → `E_VALUE_FORMAT_MISMATCH`，不猜格式写入 | E2E | `TC-GEN-09`（格式生成单测） |
| G18-04 | ARCH §18 #4 | `MutationObserver` 延迟挂载新字段也能等到并填充，**不用固定 `setTimeout`**；超时 `E_LINKAGE_TIMEOUT` 且其余不受影响；唯一性校验串行，无请求风暴 | E2E | `TC-LIM-06/07` |
| G18-05 | ARCH §18 #5 | 搜索框/筛选框/已有值/只读/禁用/密码/验证码写入次数全 0；自动提交 0；「已排除 N 项」可见且逐条可纳入 | E2E | `TC-GUARD-*` + 三硬指标 |
| G18-06 | ARCH §18 #6 | 网络面板外发请求 0；§15.4 三条门禁通过；manifest 权限白名单通过；导出 JSON 不含 `faf.counters.v1` | E2E + 静态 | `TC-GATE-01/08/12`、`TC-RULE-04` |
| G18-07 | ARCH §18 #7 | 宿主页控制台零扩展日志；页面全局对象无扩展注入属性；单策略抛异常后宿主页仍可交互且其余字段继续填充 | E2E | — |
| G18-08 | ARCH §18 #8 | 250 控件截断到 200；120 计划项启用虚拟滚动；增删一个控件漂移提示**恰好一次**且给出重新校验入口；低置信度标 `unknown` 进入待绑定态并计 `field_unknown` | 单测 + E2E | `TC-LIM-06/07`、`TC-L2-03`、`C5-3` |
| G18-09 | ARCH §18 #9 | 兼容性矩阵：Vue3 + AntD Vue 4.2.6、Vue3 + Element Plus 2.14.8（P0 必过）；Vue2 2.7.16 原生受控回归；React 提交 payload 非空；Vue2 非原生控件 `E_UNSUPPORTED_CONTROL` 单列 | E2E | — |
| G18-10 | ARCH §18 #10 | 20 类 slug 在 `field-types.json` / `types.ts` / `rules.schema.json` 三处一致；拾取器绑定后按同一 slug 回写 | 单测 | `contracts.test.ts` C1、`C5-3` |
| G18-11 | ARCH §18 #11 | undo 闭环：填充前快照含空值；撤销后 DOM 值与三层证据一致；非原生控件显示文本与隐藏 input 同步恢复；页面跳转/弹窗关闭后 `UndoState.valid=false`、按钮置灰、文案「页面已变化，无法撤销」；storage 与计数无快照数据 | E2E | — |
| G18-12 | ARCH §18 #12 | 逐行显示 `ControlType` 5 类纯文本；cascader / 远程搜索 select 归「下拉」但单列 `E_UNSUPPORTED_CONTROL`，不占分母；字段类型与控件类型两列互不覆盖 | 单测 + E2E | `ui-contract.test.ts` C5-1/2、`TC-GATE-14` |
| G18-13 | ARCH §18 #13 | 拾取器 tooltip 只含 4 项友好信息、无路径/选择器/正则；无选择器输入框；改绑 ≤ 3 次点击；元素路径只在诊断报告失败项折叠区且可一键定位/复制 | E2E | — |
| G18-14 | ARCH §18 #14 | 构建产物 Lucide SVG 随包内联、无 CDN 与远程字体请求；注入 UI 在 Shadow DOM 内、固定主题；popup 实测 360×560；4 条 commands 与 `chrome.commands.getAll()` 一致；占用冲突给纯文本降级提示 | 构建 + E2E | `TC-GATE-02/12`（源码侧） |

---

## 5. 唯一回读判据（强制声明，防止 Phase 4 误判）

> **唯一判据是 `FillResult.verified === true`，且由 `docs/contracts/types.ts` 的 `VerificationDetail` 三层可观测证据共同支撑：**
> **`domValueMatched` / `frameworkStateMatched` / `validationCleared` 三项全为 true 才算成功；任一为 false 一律 `status='failed'` + `code='E_READBACK_MISMATCH'` + `failureReason` 写明失败层。**

1. **三个 slug 固定取自 `docs/contracts/types.ts` 的 `VerificationDetail`（L127-133）**，PRD AC-3、UIUX 结果面板、诊断报告、测试用例一律使用这三个名字，**不另起中文别名、不设第二套命名**。契约测试 `tests/contract/contracts.test.ts` 用源码正则精确校验该 interface 的布尔字段集合，防止漂移。
2. **禁止把「展示或读取 Vue / React 组件内部 state 对象」列为通过条件。** MV3 ISOLATED world 不共享 DOM expando，Vue 3 生产构建不暴露 `__vueParentComponent`；`frameworkStateMatched` 的判定方式是「派发 `change` 后等待两个渲染帧再回读，值未被框架用旧 state 覆盖」，这是**可观测代理证据**，不是字面读取 state 对象。UI 文案同样不得宣称读到 state（`TC-GATE-13`）。
3. **禁止把「事件已派发」「DOM 值已写入」「PROGRESS 计数」「input/change 已触发」当作成功**——这正是 Chrome Autofill / Playwright `fill()` / TesterHome「脚本报绿、业务没生效」的共同失效模式。UI 成功态只能由 `verified === true` 驱动。
4. **`E_READBACK_MISMATCH` 是三份文档共用的唯一回读失败码**；失败层由 `failureReason` 表达，不新增第二个校验失败码（`contracts.test.ts` C3 断言 `ErrorCode` 中 READBACK/VERIFY/STATE 类只有这一个）。
5. `verification.evidence` 只记录可观测信号名（如 `aria-invalid:false`、`rerender-stable`），**不记录字段取值**；重试上限 2 次，仍失败即判失败。
6. **诚实边界**：两渲染帧是时序近似，**不承诺 100% 检出所有极端时序回滚**；若页面在两帧之后才回滚，第 2 层可能误判通过。因此 §6 的 MUT-01 是**必过项而非可选回归**，诊断报告保留 `verification.evidence` 信号名与人工标记入口兜底。架构只承诺「可观测检出 + evidence/人工标记兜底」，QA 不把近似说成 100%。

### 5.1 权威口径锁定表（架构师 / 设计师 2026-11-09 同步，全部已落成断言）

| 口径 | 权威位置 | 机器校验 |
|------|----------|----------|
| `ControlType` **恰好 5 类**：`input`/`select`/`date`/`textarea`/`other` → 「输入框/下拉/日期/文本域/其他」 | `docs/contracts/types.ts` **L42**（非 L622）；`ARCH-v1.md` §17.6 **L1368** | `ui-contract.test.ts` C5-1/2、`TC-GATE-14` |
| `UIUX-v1.md` 文首 R1–R8 是**修订历史留痕**，不是现行规则；R1 的「4 类」是 v1.1 当时表述 | UIUX §0 索引表头 + R15 / §4.2 / §9.1 第 9 条 | `ui-contract.test.ts` C5-1 第 3 例 |
| `unknown` 是低置信度哨兵：**不是 20 类之一、不是生成器目标、不可作为拾取器可绑定项**；低于阈值进「待绑定」态并计 `field_unknown` | `field-types.json` sentinel；ARCH §17.2；PRD §11 | `contracts.test.ts` C1、`ui-contract.test.ts` C5-3 |
| `E_UNSUPPORTED_CONTROL` 是**结果面板单列处置分组**：不混进失败、不占零配置可用率分母；「超范围控件」绝不在 `f-control-type` 里 | PRD-v1.md:205；ARCH §17.6；UIUX §4.2/§4.6 | `ui-contract.test.ts` C5-2、`TC-GATE-14` |
| 三阈值 `0.6 / 100 / 200` 权威在 `docs/contracts/types.ts#LIMITS`；`field-types.json#confidenceThresholdDefault` 只是镜像默认值 | ARCH §17.2 | `contracts.test.ts` C2、`limits.test.ts` |
| `LocalCounterEvent` 恰好 **11 个**，含 `field_unknown`；与配置/结果严格分键 | `docs/contracts/types.ts` L201-212 | `ui-contract.test.ts` C5-3 |
| `docs/contracts/*` 与 `src/contracts/*` **六份文件逐字节一致** | 架构师只读合规检查结论 | `ui-contract.test.ts` C5-4 |
| 图标 `@lucide/vue@1.70.0` **离线内联、不走 CDN**；禁 emoji 功能图标、禁紫粉渐变 | ARCH §3.4 / §13 / §18 #14 | `TC-GATE-02/05/06/12` |
| 三个正交维度互不混用：`FieldType`（20 类 + unknown）、`ControlType`（5 类）、处置状态（成功/跳过/超范围/失败） | ARCH §17.6 / UIUX R15 | `ui-contract.test.ts` C5-2/3 |

---

## 6. 变异测试清单（mutation-guided 加固）

> 每条变异体必须存在一条「注入缺陷后变红」的杀手测试；注入后全绿即说明断言为空，补到能杀掉为止。

| ID | 变异体（畏惧缺陷） | 注入方式 | 杀手断言 | 必过 | 对应用例 |
|----|-------------------|----------|----------|------|----------|
| **MUT-01** | **事件已派发但值被框架回滚**（ARCH §18 #1 最关键） | 受控输入在两渲染帧后用旧 state 回写值；测试中通过可观测 DOM 代理注入（首次读为新值、二次读为旧值），事件照常派发 | `verified === false` / `status === 'failed'` / `code === 'E_READBACK_MISMATCH'` / `failureReason` 含 `frameworkStateMatched` / 不计入成功数（单测）；**UI 不显示成功态为 E2E 断言，单测不代跑、不谎报已覆盖** | **是** | `TC-FILL-05` + G18-01 E2E |
| MUT-02 | 把原生 setter 换成裸 `el.value = x` | 覆写元素实例 `value` setter 模拟 React inputValueTracking | 实例 setter 调用次数 = 0，原型 getter 读回新值 | 是 | `TC-FILL-02`、`TC-GATE-10` |
| MUT-03 | 三层证据任一层被强制置 true | 用受控 `StateVerifier` 分别返回单层 false | 每层都映射为 `E_READBACK_MISMATCH` 且 `failureReason` 指向该 slug | 是 | `TC-FILL-04` ×3 |
| MUT-04 | 低置信度字段硬猜 | 无特征字段 / 阈值从 0.6 改 0.8 | `inferredType === 'unknown'` 且 `skipReason === 'low-confidence'` | 是 | `TC-L2-03`、`TC-LIM-05`、`C5-3` |
| MUT-05 | 生成器硬编码常量换绿 | 换种子 | 不同种子产生不同数据集 | 是 | `TC-GEN-04` |
| MUT-06 | 身份证校验位/地区码/出生日期算错 | 200 个种子 | 独立 GB11643 oracle 全通过 | 是 | `TC-GEN-01` |
| MUT-07 | 枚举值硬造集合外值 | 50 个种子 × 5 类 | 生成值 ∈ 页面 option 集合 | 是 | `TC-GEN-05` |
| MUT-08 | 数值越界 / 脱离 step 栅格 | 50 个种子 | inRange + onLattice + 小数位 | 是 | `TC-GEN-06/07/08` |
| MUT-09 | 结构 hash 把动态 id/class 计入导致误报 | 改 id / class / data-v-* / 时间戳 | hash 不变；增删不同控件则变化 | 是 | `TC-RULE-01/02` |
| MUT-10 | 规则库写入全量字段映射 / 导出夹带计数 | 改绑一次 | `pages.length === 1`、`overrides.length === 1`、导出 JSON 无 `faf.counters.v1` | 是 | `TC-RULE-03/04` |
| MUT-11 | 白名单用子串匹配 / 绕过 | `test.example.com.evil.com` | `E_SITE_NOT_ALLOWED` | 是 | `TC-GUARD-03` + `ac6-allowlist-bypass` 回归 |
| MUT-12 | 超范围控件被判成功 | cascader / 远程搜索 select | `E_UNSUPPORTED_CONTROL` + `verified === false` | 是 | `TC-FILL-06` |
| MUT-13 | 单页超量不截断 / 计划不分批 | 250 控件 / 120 计划项 | `handles.length === 200`、`truncated === true`；`batches.length > 1` 且单批 ≤ 20 | 是 | `TC-LIM-06/07` |
| MUT-14 | 用固定 `setTimeout` 判断联动稳定 | 延迟挂载新字段 | 仍等到并填充；超时记 `E_LINKAGE_TIMEOUT` | 是 | E2E（G18-04） |
| MUT-15 | 主按钮出现「提交」/ 引入 emoji 图标 / 紫粉渐变 / 外发请求 | 静态注入 | 零命中 | 是 | `TC-GATE-05/06/07/08/11/12` |
| MUT-16 | `pattern` 带 `^...$` 锚点时回退到 `record.code` | `^[A-Z]{2}\d{4}$` | HTML 全串锚定校验通过，且回退值本身不可能通过（4 pattern × 30 种子） | 是 | `ac4-pattern-anchor` 回归 |
| MUT-17 | 拾取器把 `css`/`xpath` 主键写进规则库 | `savePageOverride` 传非法 strategy | 抛 `E_RULE_SCHEMA_INVALID`、不落盘；合法改绑仍可导出-导入往返 | 是 | `ac8-illegal-locator-strategy` 回归 |
| MUT-18 | `ControlType` 退回 4 类 / 「超范围控件」混进控件类型列 / `unknown` 变可绑定项 | 改枚举或 UI 模板 | 5 类精确一致、`f-control-type` 零命中、`BINDABLE_TYPES` 恰好 20 | 是 | `ui-contract.test.ts` C5-1/2/3、`TC-GATE-14` |

---

## 7. 指标口径

### 7.1 零配置可用率（PRD §11 / Spec §9）

```
零配置可用率 = 首次填充无需拾取修正即正确填入的控件数
              ------------------------------------------------
              v1 适配范围内「且可填」的控件数（分母）

分母排除项（必须单列统计，不计入分母、不污染指标）：
  - E_UNSUPPORTED_CONTROL：cascader / 远程搜索 select / 跨源 iframe / 富文本 / IME composition 类
  - hidden / disabled / readonly / file / password / captcha
  - outside-form / search-or-filter / has-value（保护已有值）
  - 用户主动勾选跳过（user-unchecked）
  - field-limit-exceeded（超过 200 的截断项）
```

- 目标区间 **70–80%（下限 ≥ 70%）**，在 ≥ 3 个从未配置过的真实政务/OA 页面上取平均。
- **`E_UNSUPPORTED_CONTROL` 单列统计、不进失败项、不占成功率分母**（PRD-v1.md:205 的产品判断）。`FillResult.status='failed' + code='E_UNSUPPORTED_CONTROL'` 是内部结果对象；**结果面板按 code 单列为「超范围控件」分组**，两者不矛盾（见 §9.6 的文档措辞冲突）。
- `unknown` 低置信度字段**必须走点选绑定**，不硬猜、不静默填值；单独计 `field_unknown`（11 个本地计数事件之一），已绑定项计入下一次填充的分子，不回填进首次零配置指标。
- **不承诺 100% 全自动准确率**（Spec §3 明确不做）。
- cascader / 远程搜索 select 的 `controlType` 仍是 `select`（显示「下拉」），只是因超 v1 范围进入单列分组，不改变控件类型枚举。

### 7.2 其它指标

| 指标 | 目标 | 采集 |
|------|------|------|
| 合法性通过率 | ≥ 95%（身份证/手机号/日期/枚举被页面即时校验判合法占比） | E2E 逐字段检查红框 + `TC-GEN-*` |
| 单表单填充耗时 | 20–50 控件 ≤ 3s，单控件 ≤ 50ms，无可感知卡顿 | `fill_completed` 耗时 + E2E |
| 修正成本 | 一次类型改绑 ≤ 3 次点击，且只存增量 | 拾取器走查 + `TC-RULE-03` |
| 改版可感知 | 结构 hash 变化后 100% 给出「规则可能失效」提示，且**恰好一次** | `TC-RULE-01` + G18-08 E2E |
| 权限与交互 | 安装期无宽泛权限警告；首次手势/刷新后重新触发均有提示 | `TC-GATE-01` + 安装走查 |

---

## 8. 质量门禁与缺陷定义

### 8.1 缺陷分级与上线策略

| 级别 | 定义 | 本产品具体例子 | 上线策略 |
|------|------|----------------|----------|
| **P0 致命** | 阻塞核心流程、产品不可用、或破坏安全/数据完整性硬边界 | 无法登录式的主流程不通；三层回读失效导致「报绿但没生效」；**误填/自动提交/外发任一非零**；**emoji 作为 UI 功能图标**；非白名单域名被放行；`pnpm build` 失败 | **必须全部归零才能上线，无例外** |
| **P1 严重** | 影响体验或契约完整性但不阻塞核心填充 | 紫色→粉色渐变；空洞 AI 模板文案；错误提示不友好；规则库主键污染；pattern 锚点不兼容 | 至少修复 80% |
| **P2 一般** | 视觉瑕疵、偶发问题 | 按钮对齐偏差、偶发 500 | 记录 Backlog |

**阻断范围（verifier 护栏）**：只标 ①正确性缺陷 ②需求/验收标准未满足 ③契约/安全/数据完整性破坏。**不标**风格偏好、与需求无关的「还能更优雅」、未被要求的额外特性、为覆盖率而覆盖率。

### 8.2 测试完整性反作弊门（P0 门禁）

Phase 4 拿到开发 diff 后，逐项执行；发现任一即阻断，等同未完成。

| # | 作弊类型 | 检测方法 | 本轮结果 |
|---|----------|----------|----------|
| 1 | 测试文件/用例被删 | `git diff --name-status HEAD~1 -- 'tests/' '**/*.test.*' \| grep '^D'`；测试行数骤减 | 无删除；本轮**新增** 3 个回归文件 + 1 个契约文件 + 3 条静态门禁 |
| 2 | 保留测试断言数下降 | 对比前后 `expect(` 调用数 | 264 处，只增不减；唯一改动是收紧 oracle（§1.2） |
| 3 | 新增 skip/xfail/.only | `grep -rn 'skip\|xfail\|\.only\|focus' tests/` 与基线对比 | **0 条生效中的 skip**；条件分支 `it.skip` 为 Phase 2 已登记机制，当前全部解析为 `ready` |
| 4 | 断言硬编码实现自己的输出 | 人工审查断言值来自 Spec/独立 oracle | 身份证/号段/日期由独立 oracle 判定；`ac4` 回归额外断言「回退值不可能命中 pattern」，防止自证 |
| 5 | 测试框架配置篡改 | `git diff vitest.config.ts package.json` 检查 `scripts.test` / coverage 阈值 / exclude 变更 | QA 未改 `vitest.config.ts`；`package.json` 仅由 `pnpm add -D vitest jsdom` 追加两项 devDependency，`scripts` 未动 |

> 本项目当前非 git 仓库（`git status` 返回 `fatal: not a git repository`），diff 类门禁在 Phase 4 前需由 team-lead 先纳入版本库；**在此之前以本轮提交的测试文件哈希/行数快照作为基线**（见 §11 产物清单）。

### 8.3 静态合规门禁（`tests/compliance/gates.test.ts`，14 条全部真跑、零命中）

`TC-GATE-01` manifest 权限最小化 / `02` 版本锚定与禁 `lucide-vue-next` / `03` QA 依赖在位 / `04` 门禁作用域非空 / **05 emoji 功能图标（P0）** / `06` 紫粉渐变（P1） / `07` AI 模板味（P1） / **08 零外发 API（P0）** / **09 组件实例私有字段（P0）** / **10 裸 `el.value =` 赋值（P0）** / `11` 主按钮文案禁令（AC-2） / **12 离线图标：无 CDN/远程字体/远程 URL（P0）** / **13 UI 禁宣称读组件 state（P0）** / **14 `f-control-type` 不含「超范围控件」（P1）**。

### 8.4 skip 清零门禁

- Phase 2 允许 `missing` 状态用例 skip，但**必须在用例名与质量报告中写明原因**；skip **不计入通过率**。
- Phase 4 门禁：`pnpm exec vitest run` 输出中 `skipped` 必须为 **0**，且 `failed` 必须为 **0**；否则不判完成。
- 本轮实跑 `skipped = 0`、`failed = 0`（连续两次复跑一致）。

### 8.5 生产就绪记分卡（Phase 2/3 快照，7 维 × 3 档，总档取最低）

| 维度 | 当前档 | 证据 |
|------|--------|------|
| 测试 + 回归 | **Silver** | 104 例真跑 / 0 failed / 0 skipped / 两次复跑稳定；3 个缺陷各有持久回归集；但 E2E 26 条门禁尚未在真实页面执行 |
| 契约 | **Silver** | 20 类三处一致、LIMITS 锁定、`VerificationDetail` 三层 slug、六份契约字节一致、ControlType 5 类全有机器断言；但 ARCH §2.6 / §12 #6 仍有旧口径文字 |
| 安全 | **Bronze** | 白名单绕过已修复并回归；零外发静态门禁通过；但 3 条硬指标（误填/自动提交/外发）尚未在真实 Chromium 网络面板验证 |
| 无障碍 | 未评 | 待 Phase 4 键盘/对比度/屏读走查 |
| 性能 | **Bronze** | 阈值与分批单测通过；Lighthouse / k6 / 100 字段 E2E 未执行 |
| 可观测 | **Bronze** | 11 个计数事件契约通过；日志/指标/evidence 人工标记入口未验证 |
| 发布安全 | **Bronze** | `pnpm build` 当前失败；未做渐进发布与回滚演练 |
| **总档** | **Bronze** | **未达 Silver 不交付商业生产** |

### 8.6 改动影响分析模板（每次测试前必做）

```markdown
## 改动影响分析
### 本次改动范围
- 修改文件 / 函数 / 接口 / 改动类型（新增·修改·删除·重构）
### 下游影响面
- 直接调用方 / 共享状态（chrome.storage.local、规则缓存、FillContext.generated）
- 旧行为风险面：逐条列 高/中/低
### 回归测试优先级
1. 高风险旧行为 → 必测   2. 中风险 → 应测   3. 低风险 → 抽测
```

### 8.7 Phase 4 流程（对齐系统测试流程）

1. 拿到开发 diff → **改动影响分析**（§8.6） → **反作弊门**（§8.2）
2. **冒烟测试**：`pnpm build` + 载入扩展 + 一次填充（30 分钟内跑通，不通直接打回）
3. **功能测试**：AC-1~8 逐条 Happy / 异常 / 边界 / 权限 / 状态（加载中 / 空数据 / 失败+重试）
4. **回归测试**：受影响旧行为由绿转红数必须为 **0**；`tests/regression/` 全跑
5. **失效模式核对**（6 类）：Happy-path 偏差 / 沉默逻辑错误 / 幻觉依赖接口 / 缺失系统上下文 / 性能盲区 / 静默缺失 import
6. **26 条 Phase 3 门禁**（§4.1）+ **3 条硬指标**（§4）
7. **生产就绪评级**（§8.5）+ 质量报告 + 缺陷清单 + 回归集更新
8. 每个 P0 缺陷修复后**必须**沉淀为 `tests/regression/<缺陷名>.test.ts` 持久回归用例，只增不轻易删

---

## 9. 当前实跑结果与缺陷台账

### 9.1 真实输出（未修饰，最终基线）

```
$ pnpm exec vitest run
 RUN  v5.1.0 D:/myTools/form-auto-filler

 ✓ tests/contract/ui-contract.test.ts (13 tests) 26ms
 ✓ tests/contract/contracts.test.ts (24 tests) 17ms
 ✓ tests/regression/ac4-pattern-anchor.test.ts (4 tests) 24ms
 ✓ tests/regression/ac6-allowlist-bypass.test.ts (3 tests) 7ms
 ✓ tests/unit/generator-legality.test.ts (9 tests) 58ms
 ✓ tests/compliance/gates.test.ts (14 tests) 248ms
 ✓ tests/regression/ac8-illegal-locator-strategy.test.ts (5 tests) 13ms
 ✓ tests/unit/l2-inference.test.ts (6 tests) 16ms
 ✓ tests/unit/rule-store.test.ts (6 tests) 30ms
 ✓ tests/unit/controlled-assignment.test.ts (8 tests) 38ms
 ✓ tests/unit/site-guard.test.ts (5 tests) 91ms
 ✓ tests/unit/limits.test.ts (7 tests) 194ms

 Test Files  12 passed (12)
      Tests  104 passed (104)
   Start at  13:17:11
   Duration  2.80s (environment 79%, transform 10%, tests 6%, import 5%, worker 1%)
```

连续第二次复跑：`Test Files 12 passed (12)` / `Tests 104 passed (104)` / `Duration 2.74s`。

机器可读反作弊证据（`pnpm exec vitest run --reporter=json --outputFile=...`，exit 0）：

```json
{"numTotalTestSuites":35,"numPassedTestSuites":35,"numFailedTestSuites":0,"numPendingTestSuites":0,
 "numTotalTests":104,"numPassedTests":104,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0}
```

`numPendingTests = 0` / `numTodoTests = 0` 证明没有任何生效中的 skip 或 todo 混入绿灯。

**通过亮点**（均为真断言，非快照）：200 种子身份证 GB11643 全通过、200 种子手机号号段全通过、identity 一致性组 20 种子全通过、固定种子可复现且反硬编码、5 类枚举 50 种子不越界、数值 min/max/step 全通过、L2 20 类别名全命中、三层回读全 true→verified / 单层失败→`E_READBACK_MISMATCH` / **MUT-01 变异必过项通过**、结构 hash 稳定与归一化、只存增量、导出不含计数、`E_RULE_SCHEMA_INVALID`、L1 误填防护、250 控件截断 200、120 项分批、契约 37 条、静态合规 14 条零命中、持久回归 12 条。

### 9.2 缺陷台账（3 条均已由前端真实修复并复验）

> 首轮实跑（`73 passed / 3 failed`）暴露以下 3 条缺陷。QA **未改任何实现**；前端在并行开发中修复。QA 逐文件复核了修复后的源码，确认是**真实实现修复而非绕过验证**：QA 测试文件 mtime 均早于修复后的 `src/` 文件（例：`tests/unit/site-guard.test.ts` 12:59:53 < `src/config/site-guard.ts` 13:08:07），且断言原文未变。三条均已转绿并沉淀持久回归集。

| ID | 级别 | 描述 | 违反条款 | 修复证据 | 回归集 | 状态 |
|----|------|------|----------|----------|--------|------|
| **QA-B01** | **P0** | `SiteGuard.assertAllowed` 以「白名单命中 **OR** 含 test/uat 等环境标识」放行，任意含 `test` 子串的域名（如 `test.example.com.evil.com`、`latest.prod.com`）即使不在白名单也被允许填充 | PRD-v1.md:149 AC-6；SPEC-v1.md:104-108；PRD-v1.md:175 | `src/config/site-guard.ts:9`（白名单为唯一授权者）、`:17-19`（`labelsOf` 按域名段切分，不再子串匹配）、`:35-44`（`markerExtendsAllowlist` 只把已受信父域扩展到 test 样子域）、`:58-59`（空域名拒绝）、`:67`（拒绝码） | `tests/regression/ac6-allowlist-bypass.test.ts`（5 个绕过向量 + 正常路径 + 空域名） | **已修复 / 已复验 / 已沉淀** |
| **QA-B02** | P1 | `code` 生成器不尊重带 `^...$` 锚点的标准 HTML `pattern`：`fromPattern` 遇锚点返回 null，回退到 `record.code`，产出不匹配 pattern 的值 | field-types.json `code.constraints.respectPattern=true`；SPEC-v1.md:73；PRD-v1.md:147 AC-4 | `src/data/generators/shared.ts:66-71`（剥离 `^` / `$` 后再 tokenize）；`code.ts` 不变 | `tests/regression/ac4-pattern-anchor.test.ts`（4 锚点 + 2 无锚点 pattern × 30 种子 + 回退值不可能命中的判别断言） | **已修复 / 已复验 / 已沉淀** |
| **QA-B03** | P1 | `RuleStore.savePageOverride`（拾取器改绑写入路径）不校验 `locator.strategy`，`css`/`xpath` 主键可落盘；导出的 JSON 随后会被自身的 `importJson` 以 `E_RULE_SCHEMA_INVALID` 拒绝 | PRD-v1.md:225；`rules.schema.json:127-139`；SPEC-v1.md:77 | `src/config/rule-validator.ts:105-107` 新增 `validateFieldOverride`（复用 `checkOverride`）；`src/config/rule-store.ts:105-110` 在写入前调用并抛 `E_RULE_SCHEMA_INVALID` | `tests/regression/ac8-illegal-locator-strategy.test.ts`（css/xpath 拒绝 + 不落盘 + 合法改绑往返 + 其它非法 shape） | **已修复 / 已复验 / 已沉淀** |

> 三条均落在「正确性缺陷 / 需求未满足 / 契约安全数据完整性破坏」三类阻断内，不含风格偏好。
> **单元层面 P0 已归零**；但整体上线仍不通过，原因见 §9.5。

### 9.3 回归集沉淀（每个 P0/P1 缺陷一份持久用例，只增不轻易删）

| 文件 | 对应缺陷 | 例数 | 关键杀手断言 |
|------|----------|------|--------------|
| `tests/regression/ac6-allowlist-bypass.test.ts` | QA-B01 | 3 | `test.example.com.evil.com` / `latest.prod.com` / `mytest.attacker.cn` / `test.evil.com` / `uat.notwhitelisted.com` 全部 `E_SITE_NOT_ALLOWED`；白名单内 `uat.test.example.com` 仍放行 |
| `tests/regression/ac4-pattern-anchor.test.ts` | QA-B02 | 4 | 4 个 `^...$` pattern × 30 种子全通过 HTML 全串锚定校验；回退值 `record.code` 不可能命中（防自证假绿） |
| `tests/regression/ac8-illegal-locator-strategy.test.ts` | QA-B03 | 5 | `css`/`xpath` 均抛 `E_RULE_SCHEMA_INVALID` 且不落盘；合法改绑 `exportJson → importJson` 往返 `ok:true` |

### 9.4 Advisory（非阻断，记入待办）

- `generateGender` 与 `record.gender` 的一致性当前依赖「同 seed 同 RNG 调用顺序」的隐式耦合（两者都消费第一个 `next()`，故 20 种子实测全通过）。建议显式使用 `record.gender` 或与其对齐的 option 选择，避免 `deriveSeed` / 调用顺序调整后静默破坏 AC-4 一致性组。
- `tsconfig.json` 的 `include` 不含 `tests/**/*.ts`，Vitest 走 esbuild 转译不做类型检查；建议前端合并 `tests/**/*.ts` 到 typecheck（advisory，不阻断）。另注意 `tsc` 不校验 `.vue` 内 import，故 §9.5 的构建失败未被 typecheck 捕获。
- 前端 `package.json` 已含 `check:contracts` / `check:guard` 脚本，但 `scripts/` 目录为空；QA 的契约测试与之功能重叠但不冲突，建议合并为同一门禁入口避免重复维护。

### 9.5 Phase 4 门禁阻断项（当前快照，前端 #17 进行中）

| ID | 命令 | 真实输出 | 判定 |
|----|------|----------|------|
| QA-G01 | `pnpm build` | `[UNRESOLVED_IMPORT] Could not resolve './components/IoStatsTab.vue' in entrypoints/options/App.vue:8`；`ELIFECYCLE Command failed with exit code 1` | 违反 Spec §12 第 1 步「`pnpm build` 全部通过」→ **P0 阻断（待前端 #17 完成后复验）** |
| QA-G02 | `pnpm check:contracts` | `MODULE_NOT_FOUND`（`scripts/check-contracts.mjs` 不存在，`scripts/` 为空目录） | 违反 ARCH §12 #12「门禁命令全部通过」→ **阻断（待实现）** |
| QA-G03 | `pnpm check:guard` | `MODULE_NOT_FOUND`（`scripts/check-guard.mjs` 不存在） | 同上 → **阻断（待实现）** |

> 这三项是**工程链路状态**，不是 QA 测试缺陷，也不属于「风格/额外特性」类误报；按 Spec §12 与 ARCH §12 #12 属于需求未满足。前端 #17 仍 `in_progress`，QA 不代为补写实现、不修改 `entrypoints/`，只如实上报并等待复验。

### 9.6 文档口径冲突（Advisory，需 team-lead 组织定点同步）

| # | 冲突 | 权威裁决依据 | 建议 |
|---|------|--------------|------|
| 1 | `ARCH-v1.md:261`（§2.6）仍写「是否命中白名单**或**含 `test` / `uat` 环境标识」，而实现与 PRD AC-6 已按「白名单唯一授权者」落地 | Spec 是唯一验收依据；PRD AC-6；ARCH §14 优先条款 | 架构师把 §2.6 的「或」改为「白名单命中，环境标识仅用于把已受信父域扩展到 test 样子域」，与 `site-guard.ts` 一致。**代码已正确，只需同步文档** |
| 2 | `ARCH-v1.md` §12 #6 写「不支持的控件出现在 `failed` 且带 `E_UNSUPPORTED_CONTROL`」，而 §17.6 / UIUX R15 / PRD:205 要求「单列、不计入失败、不占分母」 | ARCH §14 声明「第 14–18 章优先于正文 v1.0 冲突表述」；UIUX §4.2/§4.6 | 把 §12 #6 的 `failed` 措辞改为「结果面板单列超范围控件分组」；明确 `FillResult.status='failed'` 是内部结果对象、面板按 code 单列，二者不矛盾 |
| 3 | `UIUX-v1.md` 文首 R1 的「控件类型 4 类」 | 设计师已加历史留痕标注；现行以 R9–R15 / §4.2 / 契约为准 | **无需改动**，QA 已在 `ui-contract.test.ts` C5-1 断言该标注存在，防止后续误取旧值 |

> 按架构师「若测试暴露契约本身有缺口，直接告诉我改契约」的邀请，QA 遵守 team-lead「只与 team-lead 通信」的指令，不直连架构师/设计师，统一由 team-lead 转派。

### 9.7 上线建议

**不通过。** 依据：

1. ✅ 单元 / 契约 / 合规 / 回归 **104 例全绿、0 failed、0 skipped**，单元层面 P0 已归零，3 个缺陷真实修复并沉淀回归集；
2. ❌ `pnpm build` 失败（缺失 `IoStatsTab.vue`），Spec §12 第 1 步未通过；
3. ❌ 两个声明的门禁脚本不存在，ARCH §12 #12 未通过；
4. ❌ 26 条 Phase 3 门禁中的 E2E 项与 3 条硬指标（误填 0 / 自动提交 0 / 外发 0）尚未在真实 Chromium 页面验证；
5. ❌ 生产就绪总档 **Bronze**（未达 Silver 不交付商业生产）。

> 待前端 #17 完成后，QA 复跑 `pnpm build` + `pnpm exec vitest run` + 26 条 E2E 门禁，再出 Phase 4 质量报告与最终裁决。**P0 缺陷不归零，不上线。没有例外。**

---

## 10. 与前端工程文件的差异合并清单

> team-lead 指令：不直接覆盖前端文件。以下为**实际差异**，请前端合并时逐项确认；QA 未修改 `src/`、`entrypoints/`、`wxt.config.ts`、`tsconfig.json`。

| 文件 | 差异 | 处理方式 |
|------|------|----------|
| `package.json` | `devDependencies` 追加 `"vitest": "^5.1.0"`、`"jsdom": "^31.0.0"`（由 `pnpm add -D vitest jsdom` 追加，**原有 name/scripts/dependencies/devDependencies 全部保留**） | 保留；如需锁版本请与 SPEC §4 版本锚定策略一并复核 |
| `package.json` | `scripts` **未改动** | 请前端合并：`"test": "vitest run"`、`"test:watch": "vitest"`（QA 未直接写入，避免覆盖）。当前 `check:contracts` / `check:guard` 指向不存在的 `scripts/*.mjs`，请一并补齐或移除 |
| `pnpm-lock.yaml` | 由上述安装自动更新 | 保留，勿手工回滚 |
| `vitest.config.ts` | **新增**，QA 所有；刻意不合并 `wxt.config.ts`（WXT 管构建、Vitest 管测试） | 保留；前端新增 `vite.config.ts` 时勿覆盖本文件 |
| `tests/**` | **新增**，QA 所有（helpers / contract / unit / compliance / regression） | 保留；用例名与断言不得删改，见 §8.2 |
| `docs/QA-TEST-PLAN.md` | **新增**，本文件 | 保留 |

当前 `package.json` 关键片段（供核对）：

```json
"scripts": { "dev": "wxt", "build": "wxt build", "zip": "wxt zip", "postinstall": "wxt prepare", "typecheck": "tsc --noEmit --strict", "check:contracts": "node scripts/check-contracts.mjs", "check:guard": "node scripts/check-guard.mjs" },
"dependencies": { "@lucide/vue": "1.70.0", "vue": "3.5.45" },
"devDependencies": { "@wxt-dev/module-vue": "1.0.3", "jsdom": "^31.0.0", "typescript": "5.9.3", "vite": "8.3.6", "vitest": "^5.1.0", "wxt": "0.21.5" }
```

---

## 11. 产物清单（可寻址）

| 产物 | 路径 | 例数 |
|------|------|------|
| Vitest 配置 | `D:/myTools/form-auto-filler/vitest.config.ts` | — |
| 契约导出面 | `D:/myTools/form-auto-filler/tests/helpers/contract-surface.ts` | — |
| 测试发现器（防假绿状态机） | `D:/myTools/form-auto-filler/tests/helpers/load-contract.ts` | — |
| 纯数据夹具 | `D:/myTools/form-auto-filler/tests/helpers/fixtures.ts` | — |
| 独立合法性 oracle | `D:/myTools/form-auto-filler/tests/helpers/legality.ts` | — |
| 契约一致性测试 | `D:/myTools/form-auto-filler/tests/contract/contracts.test.ts` | 24 |
| 正交维度 / UI 展示契约测试 | `D:/myTools/form-auto-filler/tests/contract/ui-contract.test.ts` | 13 |
| L2 推断 | `D:/myTools/form-auto-filler/tests/unit/l2-inference.test.ts` | 6 |
| 生成器合法性 | `D:/myTools/form-auto-filler/tests/unit/generator-legality.test.ts` | 9 |
| 受控赋值与三层回读 | `D:/myTools/form-auto-filler/tests/unit/controlled-assignment.test.ts` | 8 |
| RuleStore / 结构 hash | `D:/myTools/form-auto-filler/tests/unit/rule-store.test.ts` | 6 |
| SiteGuard / 误填防护 | `D:/myTools/form-auto-filler/tests/unit/site-guard.test.ts` | 5 |
| 三阈值 | `D:/myTools/form-auto-filler/tests/unit/limits.test.ts` | 7 |
| 静态合规门禁 | `D:/myTools/form-auto-filler/tests/compliance/gates.test.ts` | 14 |
| 回归：AC-6 白名单绕过 | `D:/myTools/form-auto-filler/tests/regression/ac6-allowlist-bypass.test.ts` | 3 |
| 回归：AC-4 pattern 锚点 | `D:/myTools/form-auto-filler/tests/regression/ac4-pattern-anchor.test.ts` | 4 |
| 回归：AC-8 非法主键 | `D:/myTools/form-auto-filler/tests/regression/ac8-illegal-locator-strategy.test.ts` | 5 |
| 本质量文档 | `D:/myTools/form-auto-filler/docs/QA-TEST-PLAN.md` | — |
| **合计** | 12 个测试文件 | **104** |
