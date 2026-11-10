# QA-V2 阶段二质量报告（升版 / 全量重跑）— 表单自动填充工具 v2

> 状态：**阶段二最终裁决（DEF-01 修复后全量重跑）**，由 QA 独立实跑，不采信前端自报
> 版本：**R2**（对应新冻结基线 2026-11-09 20:00）；R1（19:15 基线）已作废，仅作历史留痕
> 执行时间：2026-11-09 20:07–20:12　执行：测试工程师严过关（QA）
> 唯一范围依据：`docs/SPEC-v2.md`（**14 条 AC 定稿**，PM 2026-11-09 16:47 定点修正版）
> 冻结基线：team-lead 2026-11-09 20:00；裁决人：项目总监大湾区靓仔
> 证据文件：`.e2e-tmp/e2e-v2-result.json`、`.e2e-tmp/qa-v2-probe.json`
> 历史留痕（**已作废，不作裁决依据**）：`.e2e-tmp/archive-baseline-1915/`

---

## 0. 一句话回答（最高优先级，不得用「测试全绿」替代）

**问：一个全新安装、什么都不配置的人，能不能一次填满表单？**

**答：能一次触发就完成填充，但不是字面意义的「一个不落全填满」。**

实测（新冻结基线、全新干净 profile、零 storage 预置、单次 CDP Alt+Shift+F 手势）：弹窗内 **14 项成功写入、0 失败、9 项跳过**；13 个核心原生控件中 **11 个有值**，另 2 个（「所在单位」`f-org`、「诱饵字段」`f-decoy`）因推断置信度低于 0.6 被判「待绑定」跳过。该跳过是 `SPEC-v2.md` §3 降级行（L74）、**AC-V2-13（L132）**、§6「不做清单」（L154）**明确要求**的行为（宁可少填也不填错、不承诺 100% 全自动准确率），且已在诊断面板提供手动指定类型后单独补填的出口（实测补填成功）。相比 v1「默认空白名单全拒绝、13 个控件全空」，**D1 已由红转绿：开箱不可用的根因已消除**。

B1（「13 个核心控件必须全部写入」措辞与 14 条 AC 定稿口径冲突）已由 team-lead 裁决关闭，按 14 条 AC 口径验收；相关 5 条 FAIL 结案为 QA 断言口径假失败，原始 FAIL 保留不删不弱。

**本轮新增结论**：DEF-01（容器边界失守）已修复并全量重跑验证通过——可见但 0 可填控件的 dialog 现在仍是填充边界，容器外筛选项与普通文本框零写入，空状态文案正常出现。**P0 = 0、P1 = 0**。

---

## 1. 概览

| 指标 | R1（19:15 基线，已作废） | **R2（20:00 基线，本轮）** | 目标 | 判定 |
|------|--------------------------|---------------------------|------|------|
| 门禁命令 | 6 条 + 反作弊门全 exit 0 | **7 条 + 反作弊门 + 补充探针全 exit 0** | 全通过 | 通过 |
| `pnpm test` | 19 文件 / 159 例 | **20 文件 / 167 例全通过** | 全通过 | 通过（新增回归用例 8 例） |
| 真机 E2E | 60 条 / 50 PASS / 10 FAIL / blockingFailed 9 | **60 条 / 52 PASS / 8 FAIL / blockingFailed 7** | — | 见 §7 |
| 判定为产品缺陷的 FAIL | 2 条（DEF-01） | **0 条** | 0 | **通过** |
| V2-12a 容器外零写入 | FAIL `["global-filter","outside-text"]` | **PASS `[]`** | 零写入 | **由红转绿** |
| V2-12c 空状态文案 | FAIL `false` | **PASS `true`** | 出现 | **由红转绿** |
| B1 五条假失败 | 待裁决 | **按 14 条 AC 口径结案** | — | 已关闭 |
| **P0 缺陷** | 0 | **0** | 0 | **通过** |
| **P1 缺陷** | 1（DEF-01 未修复） | **0（DEF-01 已修复）** | 至少修复 80% | **通过（100%）** |
| P2 / 技术债 | 3 项 | 3 项（DEF-02/03/04，裁决不变） | Backlog | 记录 |
| 四条安全底线 | 全通过 | **全通过** | 一票否决 | 通过 |
| 三绑定证据漂移 | 0 | **0（新指纹三方一致）** | 0 | 通过 |
| 测试完整性反作弊 8 项 | 8 项通过 | **8 项通过（新增回归集可审计）** | 通过 | 通过 |
| 回归率（旧行为由绿转红） | 0 | **0** | 0 | 通过 |
| 返工次数 | 0 轮 | **1 轮（team-lead 裁决解冻，全量重跑）** | ≤ 3 | 通过 |
| 生产就绪总档 | Bronze | **Bronze**（取 7 维最低） | Silver 起步 | 未达商业级，见 §12 |

---

## 2. 新冻结基线复核与证据三绑定

### 2.1 新冻结基线（team-lead 20:00 提供，QA 独立复算，全部一致）

| 项 | 期望 | QA 实测 | 一致 |
|----|------|---------|------|
| 冻结时间 | 2026-11-09 20:00 | 复算时点 20:07，最后源码 mtime 19:55:03 | 是 |
| 源码指纹（125 文件） | `07fec8ada9667353060791c7ad4d24065bedce047809200dc087d88460d4c3d2` | 同值，文件数 125 | 是 |
| `filler.js` | `05e7fbe40b9562dd212557ab9347672a943e6bcc698627fa145618330ad8d125`，193034 B | 同值，193034 B | 是 |
| `manifest.json` | `5570ccda04073d4695c9f97492e8347851d73fbd6c51dbdc2a0d47371f69c889`（未变） | 同值 | 是 |
| `wxt.config.ts` | `fc9fe3e03d92693ce422bd5da35549715d126c0e4491867ed7df37175ef26012` | 同值 | 是 |
| `package.json` | `1e1e4b86ab61e89b007da8147a3b50c8ca29bcf0f5fd3f425409ff7852aab314` | 同值 | 是 |
| `vitest.config.ts` | `0ad49b05cdd868e194239fc7fdd493be077a85ea1d8e6205b697e5e9425584b4` | 同值 | 是 |
| `tsconfig.json` | `f2e9be24eb37c00e000101fb97e4f4bb1d3ccb5f0c95f5109c1238e8f148fb80` | 同值 | 是 |

复算命令：`find entrypoints src -type f \( -name "*.ts" -o -name "*.vue" -o -name "*.css" -o -name "*.json" \) -exec sha256sum {} + | sort | sha256sum`。

### 2.2 解冻改动范围核验（只 2 个文件，与 team-lead 复核一致）

`find entrypoints src -type f -newermt '2026-11-09 19:15:00'` 实测：

```
2026-11-09 19:54:29.6934912000 src/detection/scope-selector.ts
2026-11-09 19:55:03.0026161000 src/ui/components/ResultBar.vue
```

其余冻结文件 mtime 未变。QA 逐行复核修复内容：

| 文件 | 行号 | 修复 |
|------|------|------|
| `src/detection/scope-selector.ts` | 138-151 | `rank(elements, document, allowEmpty = false)`，`.filter(entry => allowEmpty \|\| entry.count > 0)` |
| `src/detection/scope-selector.ts` | 163-199 | Tier 1 dialogs / Tier 2 forms 传 `allowEmpty=true`，且**前置到 `all` 计算之前**；存在即直接返回。Tier 3 `rank(containerCandidates(all, document), document)` 不传第三参（默认 false），LCA + tie-break + Tier 4 body 兜底代码未动 |
| `src/ui/components/ResultBar.vue` | 21-27 | `noFillableControls = report !== null && filled===0 && failed===0` |
| `src/ui/components/ResultBar.vue` | 108-113 | 空状态文案 `v-if="noFillableControls"`；通知链改 `v-if` / `v-else-if`，不再覆盖空状态 |

### 2.3 新三绑定（源码 ↔ 产物 chunk ↔ E2E 请求日志实际加载 chunk）

| 绑定环 | 证据 | 值 |
|--------|------|-----|
| A 源码 | 新基线 + build 后复算 + 全部实跑后复算 | `07fec8ad…`（均为同值；最后 mtime 仍 19:55:03） |
| B 产物 | `pnpm build` 后磁盘清单 | `filler.js` `05e7fbe4…` / `manifest.json` `5570ccda…` / `chunks/contracts-Cba9TCdK.js` `8a48e264…` / `chunks/popup-4OR6tzE-.js` `7e8cef1b…` / `chunks/options-Gq4pW37C.js` `ca86d6a6…` / `assets/contracts-CcCMGRrd.css` `813c5ee0…` |
| B' E2E 结果文件内产物哈希 | `e2e-v2-result.json` → `artifact.files[]` | `filler.js` `05e7fbe4…`（193034 B）、`manifest.json` `5570ccda…`、三个 chunk/css 与磁盘逐文件一致 |
| C 请求日志实际加载 | `V2-INFRA-02` | `requested = [popup-4OR6tzE-.js, contracts-Cba9TCdK.js, contracts-CcCMGRrd.css]`，`ghosts = []` |
| 采集链 | `V2-INFRA-03` | `contextRequests = 9`、`cdpRequests = 2` |
| 补充探针加载产物 | `qa-v2-probe.json` → `extFillerSha256` | `05e7fbe4…`（与新基线一致） |

**判定：新三绑定成立，证据漂移 = 0。** Vite chunk 名带内容哈希，文件名一致等价于内容一致，并已用逐文件 sha256 复核。

> 说明：`e2e-v2-result.json` 内 `artifact.fingerprint = 0abd3b0a…`（13 文件）、`source.fingerprint = a43db4f9…`（127 文件）是 E2E 脚本自带 `hashTree()` 合并算法，与 team-lead 的 `find | sort | sha256sum` 不同（后者只统计 4 类扩展名、125 文件），**数值不可直接比对**；三绑定主证据采用 team-lead 算法 + 逐文件 sha256。

### 2.4 旧基线证据作废与历史留痕

| 文件 | 处置 |
|------|------|
| 旧源码 `7106f3d9…` / 旧产物 `7f43163f…` | **作废**，不再引用为结论 |
| 旧 `e2e-v2-result.json`（60 条 / 10 FAIL） | 归档至 `.e2e-tmp/archive-baseline-1915/e2e-v2-result.json`（sha256 `51e91286…`，含原始 10 条 FAIL），**仅历史留痕，不作裁决依据** |
| 旧 `qa-v2-probe.json` | 归档 `e2107f39…`，同上 |
| 旧 `QA-V2-REPORT.md`（R1） | 归档 `56cad63f…`，同上 |
| 旧「19 文件 159 例」「50 PASS / 10 FAIL」等数字 | **一概不复用**，本轮按 20 文件 167 例 / 52 PASS 8 FAIL 如实记录 |

### 2.5 运行环境事实

- **该项目不是 git 仓库**（`git rev-parse` 返回 fatal），v1 基于 `git diff` 的反作弊检测不可用，改用 mtime + 文件哈希 + 断言计数快照实现等价检测（§5）。
- Edge 157 + `--headless=new` + `--disable-extensions-except` + `--load-extension`；快捷键用 CDP `Input.dispatchKeyEvent`（`rawKeyDown` + `keyUp`，`modifiers: 9`）。
- 每场景独立 `profile-v2-<name>`，运行前 `rmSync`、运行后删除；`antiCheat = {presetStorageWrites: 0, optionsPageOpens: 0, gestureCalls: 6, uiGestureOnly: true}`，`profileFreshAtStart: true`。全部实跑后复核无残留 `profile-v2-*` 目录。

---

## 3. 全量重跑实跑结果（7 条命令 + 补充探针，不复用旧数字）

| # | 命令 | QA 实测输出 | exit |
|---|------|-------------|------|
| 1 | `pnpm typecheck` | `tsc --noEmit --strict`，无报错 | 0 |
| 2 | `node scripts/check-contracts.mjs` | `CONTRACTS PASS: 6 mirrored files are byte-identical` | 0 |
| 3 | `node scripts/check-guard.mjs` | `GUARD PASS: 127 source files, zero blocked patterns` | 0 |
| 4 | `pnpm test` | `Test Files 20 passed (20)` / `Tests 167 passed (167)` / Duration 3.86s；含新增 `tests/unit/v2-empty-dialog-boundary.test.ts (8 tests)` | 0 |
| 5 | `pnpm build` | `WXT 0.21.5` / `Built extension in 2.881 s` / `Total size: 337.87 kB` / `filler.js 193.03 kB` | 0 |
| 6 | `node .e2e-tmp/check-e2e-integrity.mjs` | `INTEGRITY PASS`（`e2e-v2.mjs` 920 行、`dry-run-infra.mjs` 165 行、`qa-v2-probe.mjs` 252 行，禁用模式 0、必需锚点齐全；5 夹具零外链 / 零 emoji / 零紫粉渐变） | 0 |
| 7 | `node .e2e-tmp/e2e-v2.mjs` | `SUMMARY: total=60 passed=52 failed=8 blockingFailed=7` | 0 |
| 8 | `node .e2e-tmp/qa-v2-probe.mjs` | 补充探针，结果写入 `qa-v2-probe.json`（`timestamp 2026-11-09T12:11:36.750Z`，`profileFreshAtStart=true`） | 0 |

**新增资产自检（非正式门禁）**：`pnpm exec vitest run tests/unit/v2-empty-dialog-boundary.test.ts` → `1 passed (1) / 8 passed (8) / 1.53s`，exit 0，用于确认回归用例可加载且判别断言成立。

**构建可复现性**：`pnpm build` 后 `filler.js` / `manifest.json` 哈希与新冻结基线逐字节一致，源码指纹未变；全部 8 条命令跑完后再次复算，源码 `07fec8ad…`、产物 `05e7fbe4…` 193034 B、最后源码 mtime 19:55:03 均未变 → 无「跑完再改源码」的证据漂移。

---

## 4. 改动影响分析（DEF-01 定点修复）

### 4.1 本次改动范围

| 类型 | 内容 | 文件 |
|------|------|------|
| 修改 | `rank()` 新增 `allowEmpty`，Tier 1/2 传 true，Tier 3 保持默认 false | `src/detection/scope-selector.ts:138-151` |
| 修改 | 可见 dialog / form 判定前置到 `all` 计算之前，存在即返回 | `src/detection/scope-selector.ts:163-181` |
| 修改 | 空状态判据由 `total===0` 改为 `filled===0 && failed===0`，通知链不再覆盖空状态 | `src/ui/components/ResultBar.vue:21-27, 108-113` |
| 新增（QA 资产） | 持久回归用例 8 例 | `tests/unit/v2-empty-dialog-boundary.test.ts` |

### 4.2 下游影响面与旧行为回归验证

| 旧行为 / 受影响面 | 风险 | 回归验证 | 结果 |
|-------------------|------|----------|------|
| Tier 1 可见 dialog 优先 | 高 | 单测 `v2-container-selection.test.ts` 8 例 + 新增回归用例 8 例；E2E S1-main dialog 跨 3 个非 form section 全覆盖 | 通过 |
| Tier 2 可见控件最多的 form | 高 | 单测 + E2E S2-multi-form（小 form 未动、容器外未动） | 通过 |
| Tier 3 LCA / Tier 4 body 兜底 | 高 | 新增回归用例「无任何 dialog/form 时 LCA 行为不变」+ E2E S3 / S4 | 通过 |
| 隐藏 dialog 不参与边界 | 中 | 新增回归用例 + 单测隐藏 dialog 回落 | 通过（修复未过度） |
| 空 dialog 场景容器外零写入 | 高（DEF-01 本体） | `V2-12a actual=[]`；新增回归用例 2 条判别器 | **由红转绿** |
| 空状态文案 | 中 | `V2-12c actual=true`；UI「当前区域没有可填的可见控件，可重新选择区域」 | **由红转绿** |
| AC-V2-06 / AC-V2-14 诊断数据源 | 高（team-lead 裁决保留 5 个 skipOutcome） | UI「成功 0 跳过 5 失败 0」、诊断 5 行仍在；`report.total = 5` 而非 0 | 通过（按裁决口径） |
| 正常场景不误显示空状态 | 中 | S1-main `filled=14`，结果条无空状态文案 | 通过 |
| 只填不提交 / 零外发 / 撤销 / 生成器合法性 | 高（安全底线） | `V2-04*`、`V2-08a~e`、`V2-07a/b`、`V2-13a~f` 全通过 | 通过 |

**回归率 = 0**（无旧行为由绿转红）。**解决率**：D1–D9 共 9 个判别目标全部达成；DEF-01 已修复并沉淀持久回归用例。

### 4.3 V2-12 判定口径（按 team-lead 裁决，未用 `report.total === 0`）

team-lead 裁决：`total = outcomes.length`，`#empty-dialog` 内 5 个受保护控件仍经 scan → plan.items → skipOutcome 进入 outcomes，故 `total === 0` 在此场景永不成立；强改 total 会破坏 AC-V2-06 / AC-V2-14 的诊断数据源。AC-V2-12 原文判据是「选定容器子树内**可填控件数为 0**」。

本报告采用并通过条件（全部实测）：

| 条件 | 实测 |
|------|------|
| 容器选定为 `#empty-dialog` | 新增回归用例 `expect(autoSelectRoot(document)).toBe(dialog)` 通过；E2E 容器外控件零写入 |
| 容器外 3 控件零写入 | `V2-12a actual = []` |
| `filled = 0` 且 `failed = 0` | UI「已填充 0 项，未提交 成功 0 跳过 5 失败 0」 |
| 空状态文案出现 | `V2-12c actual = true`，文本「当前区域没有可填的可见控件，可重新选择区域 暂无可撤销内容」 |
| 不报错、不提交 | `V2-12b {"errors":[],"pageerrors":0}`；`V2-12d {"submitClicks":0,"submitEvents":0}` |

**未以 `report.total === 0` 作为通过条件**；E2E 的 `V2-12a` / `V2-12c` 断言本身也不依赖 total，故本轮无需按「断言口径错误」处理，两条均真实由红转绿。

---

## 5. 测试完整性反作弊门（8 项逐项）

| # | 检测项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | 测试文件 / 用例被删 | 通过 | `tests/unit/v2-*` 由 6 个增至 **7 个**（新增 `v2-empty-dialog-boundary.test.ts`），既有用例 mtime 仍为 11-09 17:03–17:07，未改动；`pnpm test` 收集 20 文件 167 例 |
| 2 | 断言数下降 | 通过 | `v2-*` 共 **92 处 `expect(`**（R1 为 79，新增 13），逐文件：18 / 13 / 0 / **13** / 18 / 18 / 12；无弱化、无硬编码实现输出 |
| 3 | 新增 skip / xfail / .only / focus | 通过 | 精确扫描 `ZERO_MATCHES_PRECISE` |
| 4 | 断言硬编码实现自己的输出 | 通过 | `V2-13a~f` 用独立 GB11643 oracle + 页面 option；新增回归用例基于 `autoSelectRoot` 真实返回值与 DOM 包含关系判定，非复述实现假设 |
| 5 | 测试框架配置篡改 | 通过 | `package.json` / `vitest.config.ts` / `tsconfig.json` / `wxt.config.ts` 四哈希与两版冻结基线均一致；`test` 脚本仍 `vitest run` |
| 6 | E2E 假绿 | 通过 | 60 条断言每条含 `{id, scenario, ok, expected, actual, evidence, blocking}`；8 条 FAIL 全部如实保留，无「解析失败即通过」 |
| 7 | 证据与产物一致性 | 通过 | 新三绑定见 §2.3；`V2-INFRA-02 ghosts=[]`；构建后与全部实跑后哈希均未变 |
| 8 | **E2E 不得预置 storage / 不得绕过 UI** | **通过** | `check-e2e-integrity.mjs` 实跑 `INTEGRITY PASS`（3 执行器 + 5 夹具，禁用模式 0、必需锚点齐全）；运行时 `presetStorageWrites=0`、`optionsPageOpens=0`、`uiGestureOnly=true` |

> 原始 FAIL 保留：R1 的 10 条 FAIL 完整保存在归档 `e2e-v2-result.json`（sha256 `51e91286…`）与归档 R1 报告中；R2 的 8 条 FAIL 完整保存在当前 `e2e-v2-result.json`，均不删不弱、未加 skip。

---

## 6. E2E 实跑与 D1–D9 判别器实测值（R2）

执行：`node .e2e-tmp/e2e-v2.mjs`，5 场景全部全新干净 profile、零预置、CDP 真实手势。`total=60 / passed=52 / failed=8 / blockingFailed=7`。

| 判别器 | 实测 actual | 判定 |
|--------|-------------|------|
| **D1** 零配置首次触发即填充 | `profileFreshAtStart=true`、`presetStorageWrites=0`、单次手势 → **14 成功 / 9 跳过 / 0 失败**；13 核心控件 11 非空，`f-org`/`f-decoy` 为 `low-confidence` 跳过；结果条「已填充 14 项，未提交」 | **通过（按 14 条 AC 口径，B1 已结案）** |
| **D2** dialog 跨非 form 子树全覆盖 | `#main-dialog` 下 12 控件 11 填入；`f-decoy` 在诊断 JSON 可定位（`f0-25-e177a7bb`, `skipReason: low-confidence`）；`V2-02c` 组件库显示节点变化；`V2-02d` 无预览/勾选/确认（空数组）；单测 Tier 1 判别 8 例全绿 | 通过 |
| **D3** Tier 3 最小公共祖先 | LCA 子树 7 控件 6 填入，容器外 `OUTSIDE-FREE-SENTINEL` 未变；main 场景容器外 3 控件未变；**新增：empty 场景容器外 3 控件亦零写入** | 通过 |
| **D4** Tier 2 可见控件最多的 form | 焦点 `#s-name`；大 form 6 控件 5 填入、小 form 2 控件保持空、容器外 3 控件未变 | 通过 |
| **D5** 单次手势、无白名单 / 预览 / 确认 | 手势差 = 1；违规文案 `[]`；白名单 / `E_SITE_NOT_ALLOWED` 命中 `false`；`optionsOpens=0` | 通过 |
| **D6** 校验态仅 advisory | `v2-validation-advisory.test.ts` 6 例全绿；单测 167/167；诊断 `firstField.evidence = [dom-value-match, rerender-stable, validation-clear, adapter:native-input, aria-invalid:false]`；`V2-05a` 策略 id `native-input` | 通过 |
| **D7** 诊断 JSON 四类语义 | `V2-06c` clipboard 可复制、`JSON.parse` 成功；26 字段；`V2-06d allFour=true`（`expected`/`actualDom`/`strategyId`/`failureReason` 齐全） | 通过 |
| **D8** 撤销闭环 | `V2-07a notRestored=[]`、`V2-07b` 提交计数 0/0；正常场景 `filled=14` 不误显示空状态 | 通过（单字段补填分支残留列 P2） |
| **D9** 诊断面板单独补填 | 12 个 `select[data-faf="manual-type"]` + 「补填此字段」；补充探针实测 `f-org` 由 `""` → `"冯宁辉"`、`changedOtherFields=[]`、UI「已单独补填「所在单位」，其余控件未改动」 | 通过 |
| **新增** DEF-01 回归判别器 | 持久回归用例 8 例全绿；E2E `V2-12a` 由 `["global-filter","outside-text"]` → `[]`、`V2-12c` 由 `false` → `true` | **由红转绿** |

---

## 7. FAIL 逐条裁决与 DEF-01 修复前后对比

### 7.1 R1 → R2 变化（原始 FAIL 保留）

| 断言 | R1（19:15） | **R2（20:00）** | 变化 |
|------|-------------|-----------------|------|
| `V2-12a 可填控件数为 0 时零写入` | **FAIL** `["global-filter","outside-text"]` | **PASS** `[]` | **转绿（DEF-01 修复）** |
| `V2-12c 结果条展示空状态文字提示` | **FAIL** `false` | **PASS** `true` | **转绿（DEF-01 修复）** |
| 其余 8 条 | FAIL | FAIL（不变） | 见 §7.2 |

`blockingFailed` 由 9 → 7，正好对应两条 blocking=true 的 V2-12 断言转绿。

### 7.2 R2 剩余 8 条 FAIL：全部结案，产品缺陷 = 0

| 断言 | 定性 | 处置 |
|------|------|------|
| `V2-01b` / `V2-02a` / `V2-02b` / `V2-05b` / `V2-11a` | **B1 类 QA 断言口径假失败**：以「13 个核心控件全非空」为观测指标，与 SPEC-v2 §3 L74 / AC-V2-13 L132 / §6 L154「低置信度必须跳过、宁可少填也不填错」冲突；诊断 JSON 坐实 `f-org`/`f-decoy` 为 `skipReason: low-confidence`、status 非 failed | **team-lead 已裁决关闭，按 14 条 AC 口径结案**；原始 FAIL 保留不删不弱 |
| `V2-02e` / `V2-02f` | QA 观测指标过严：容器选择实测正确（大 form 5/6、小 form 未动；LCA 6/7、容器外哨兵未变），仅 `-org` 低置信度跳过导致全非空判据失败 | 判别目标达成，记为 QA 资产问题，不计产品缺陷 |
| `V2-ENTRY-01`（`blocking: false`） | 断言全文匹配「提交」，误命中合规常驻说明「**仅填入，不提交**」；结果条按钮数组 `V2-04b` 实测无提交按钮 | 产品合规，记为 QA 断言文案过宽；未计入 `blockingFailed` |

**产品缺陷 FAIL = 0 条。**

---

## 8. team-lead 追加的三项如实核查（R2 重跑实测，裁决不变）

### 8.1 本地埋点残留 —— **AC-V2-08 部分满足**

干净 profile 实测（`qa-v2-probe.json`，`profileFreshAtStart=true`，读取通道 `service-worker`）：

| 时点 | `chrome.storage.local` 键 |
|------|---------------------------|
| 首次手势前 | `[]`（零键） |
| 一次填充后 | `["faf.counters.v1","faf.lastPlan.v1","faf.lastResult.v1","faf.rules.v1","faf.skeleton.v1"]`（5 个新键） |

`faf.counters.v1` 含 `field_inferred: 28` / `field_skipped: 12` / `field_unknown: 24` / `fill_triggered: 1` 等计数与 `lastAt`；`faf.lastResult.v1` 含 `outcomes/labels/sessionId` 等结果快照。源码证据：`src/runtime/auto-fill.ts:53,74`、`src/runtime/ui-actions.ts:21,24`、`src/execution/fill-executor.ts:86,96,114,138,140,169,171,178`，另 `plan-session.ts:111,129,239`、`plan-drift.ts:45`。

**结论（按 team-lead 裁决原文）**：**AC-V2-08 部分满足：零外发成立，但本地埋点计数与结果快照仍落 `chrome.storage.local`，与 SPEC-v2 §7.1「仅本次会话运行态展示，不落盘、不写日志、不上报」口径存在偏差**。零外发由 `V2-08a~e` 五条独立证明（outbound=0 / 页面侧网络 API=0 / 无远程字体 / 无 WebSocket / 无扩展日志与 pageerror）。**不判 P0**、列 **Silver 前必须清理的技术债（DEF-03）**、**严禁写成完全满足**。SPEC-v2 §7.1 L172 同时写明「`faf.counters.v1` 代码保留但不再是 v2 验收门禁」，故属口径偏差而非门禁违反。

### 8.2 补填与撤销 —— 已知限制 / P2，不判 P0

| 观测点 | R2 实测 |
|--------|---------|
| `f-org` 填充前 / 一键填充后 | `""` / `""`（低置信度跳过） |
| 单独补填后 | `"冯宁辉"`（补填生效） |
| 补填期间其余字段变化 | `changedOtherFields = []`（未触发全表单重填，AC-V2-14 满足） |
| 补填后 UI 提示 | 「已单独补填「所在单位」，其余控件未改动」 |
| 点撤销后 `f-org` | `"冯宁辉"`（**残留**，`residueAfterUndo = true`） |
| 点撤销后其余 7 个核心字段 | 全部 `restored: true` |
| 撤销后 UI 提示 | 「已恢复本次填充前的值」（与实际不完全一致） |

按 team-lead 裁决列为 **已知限制 / P2 改进（DEF-02），不判 P0**。

### 8.3 manifest 命令描述文案 —— 记录事实，不判 AC 违反

`manifest.json` 4 条 commands description 仍为 v1 英文：`Open the fill plan preview` / `Limit detection to the current form` / `Limit detection to the focused form row` / `Open the field picker`（`wxt.config.ts:30-45` 同值）。功能不违反 AC：`src/runtime/content-runtime.ts:32-35` 已把三个 legacy commands 路由到 `activeActions.openPlan()`，E2E 单次手势实测填充成功。按裁决**本轮不改**，列 **v2.1 清理项（DEF-04）**，不判 AC 违反。

---

## 9. 14 条 AC 逐条结论（R2）

| AC | R1 结论 | **R2 结论** | 实测依据 |
|----|---------|-------------|----------|
| AC-V2-01 全新安装零配置首次触发即完成填充 | 通过（口径待裁决） | **通过（B1 已结案）** | 干净 profile、零预置、单次 CDP 手势 → 14 成功 / 0 失败 |
| AC-V2-02 扫描容器子树全部可见控件 | 通过 | **通过** | dialog 跨 3 个非 form section + 诱饵 form 全覆盖；四级优先级单测 8 例 + 回归 8 例全绿 |
| AC-V2-03 跳过类不写值 / 不填容器外搜索框与筛选项 | 部分满足 | **通过** | main / multi-form / free-nodes 场景 9 类跳过控件与容器外控件全部未变；**empty 场景修复后 `V2-12a actual=[]`，容器外筛选项与普通文本框零写入** |
| AC-V2-04 只填不提交、三处主按钮文案 | 通过 | **通过** | 所有场景 `submitClicks=0` / `submitEvents=0`；按钮数组无提交按钮；常驻「仅填入，不提交」 |
| AC-V2-05 加固赋值 / 重试 / advisory | 通过 | **通过** | 单测 7 + 6 例全绿；诊断含 `strategyId: native-input` 与 `dom-value-match` / `rerender-stable` |
| AC-V2-06 失败/跳过字段可定位 | 通过 | **通过** | 26 诊断行、17 类跳过标记；诊断 JSON 可复制可 parse、四类语义齐全；空场景 5 个 skipOutcome 仍保留 |
| AC-V2-07 撤销恢复原值且不提交 | 通过 | **通过（主流程）** | `V2-07a notRestored=[]`；单字段补填后撤销残留列 P2（§8.2） |
| AC-V2-08 零外发 / 不写日志 / 不上传 | 部分满足 | **部分满足（不变）** | 网络层 5 条断言全 PASS；本地埋点计数与结果快照仍落 `chrome.storage.local` |
| AC-V2-09 单次手势、无白名单 / 预览 / 二次确认 | 通过 | **通过** | 手势差 = 1；违规文案 `[]`；白名单命中 `false`；`optionsOpens=0` |
| AC-V2-10 框选 hover 不写值、Esc 零写入 | 通过 | **通过** | `V2-10a/b` 快照差异为空数组 |
| AC-V2-11 默认放行所有页面 | 通过 | **通过** | 未配置排除清单即完成 14 项填充 |
| AC-V2-12 可填控件数为 0 时空状态、不报错、零写入 | **未满足** | **通过（DEF-01 已修复）** | `V2-12a []`、`V2-12b` 无异常、`V2-12c true`、`V2-12d` 提交 0/0；`filled=0 && failed=0`；按 team-lead total 语义裁决，**未用 `report.total===0`** |
| AC-V2-13 生成器合法性、低置信度跳过 | 通过 | **通过** | `V2-13a~f` 6 条独立 oracle 全通过；诊断 3 个 `low-confidence` 跳过项计入诊断、不硬猜 |
| AC-V2-14 诊断面板单独补填、不触发全表单重填 | 通过 | **通过** | 入口 12 个 select + 补填按钮；实测补填生效、`changedOtherFields=[]`、UI 明确提示 |

---

## 10. 缺陷清单与 P0 判定

### P0 缺陷：**0 个**　　P1 缺陷：**0 个**（DEF-01 已修复，由 1 归零）

- 核心流程可用（D1 红转绿）；四条安全底线全部通过；团队级 P0 规则（emoji 功能图标 / 紫粉渐变 / 空洞文案）由 `check-guard` 127 源文件零命中 + 夹具扫描零命中保证；无数据丢失、无自动提交、无外发。

| ID | 级别 | 描述 | 状态 |
|----|------|------|------|
| **DEF-01** | P1 → **已修复** | 可见但 0 可填控件的 dialog 被 `rank()` 的 `count>0` 丢弃，Tier 3 从全页聚合导致误填容器外筛选项与普通文本框、空状态文案不触发（AC-V2-12 / AC-V2-03） | **已修复并验证**：`scope-selector.ts:138-151,163-199` + `ResultBar.vue:21-27,108-113`；`V2-12a []` / `V2-12c true`；持久回归用例落地 |
| DEF-02 | P2 | 单字段补填未纳入撤销快照，撤销后该字段残留；撤销后全局提示与实际不完全一致 | 已知限制，裁决不判 P0 |
| DEF-03 | P2 / Silver 前技术债 | 本地埋点计数与结果快照落 `chrome.storage.local`，与 SPEC-v2 §7.1 口径偏差 | 裁决不判 P0、**严禁写成完全满足** |
| DEF-04 | P2 / v2.1 | manifest 4 条 commands description 仍为 v1 英文 | 裁决本轮不改、不判 AC 违反 |
| QA-01 | QA 资产 | B1 五条断言以「13 全非空」为观测指标，与 14 条 AC 定稿冲突 | **B1 已结案**，原始 FAIL 保留 |
| QA-02 | QA 资产 | `V2-ENTRY-01` 断言全文匹配「提交」误命中合规说明 | `blocking:false`，原始 FAIL 保留 |

### 回归集更新（本轮已落地）

| 新增回归用例 | 对应缺陷 | 文件路径 | 内容 |
|--------------|----------|----------|------|
| `Regression DEF-01：可见空 dialog 不得误填容器外控件` | DEF-01 | `tests/unit/v2-empty-dialog-boundary.test.ts`（sha256 `87ede3ee…`） | 8 例 / 13 处 `expect(`：判别前提（容器外确存在可见控件）、`autoSelectRoot` 必须选中 `#empty-dialog`、dialog 内可填控件数为 0、容器外 3 控件不在边界内、隐藏 dialog 不参与边界、正常 dialog 不回归、空 form 边界、Tier 3 LCA 行为不变 |

自检 `8 passed (8)`，全量 `pnpm test` 收集 20 文件 167 例全通过。修复前该用例的 2 条判别器必然红（旧实现返回 `.search-bar`），修复后转绿。

---

## 11. 生成式代码 6 类失效模式核对

| 失效模式 | R1 | **R2** | 详情 |
|----------|----|--------|------|
| Happy-path / 错误处理偏差 | 通过 | **通过** | 边界分支（空 dialog）已补齐并有用例覆盖 |
| **沉默逻辑错误** | 发现 1 处（DEF-01） | **已修复并有持久回归保护** | `scope-selector.ts:139` 对空 dialog 的静默丢弃已改为 Tier 1/2 `allowEmpty=true`；新增回归用例把该失效模式固化进单测，下次重构再犯即红 |
| 幻觉依赖 / 接口 | 通过 | **通过** | typecheck / contracts / build 三重门全绿；`autoSelectRoot` 与 `visibleControlsIn` 真实存在且被回归用例调用 |
| 缺失系统上下文 | 通过（有偏差） | **通过（有偏差）** | MV3 ISOLATED world、零外发、无 host_permissions、只填不提交均按约束实现；本地 storage 落盘属 §8.1 口径偏差 |
| 性能盲区 | 通过（未做容量验证） | **通过（未做容量验证）** | build 2.881s、E2E 单场景 2.6–3.2s 内完成、无 N+1；未做压测，记为 Bronze 短板 |
| 静默缺失 import / 未用结果 | 通过 | **通过** | `tsc --strict` / `vitest run` / `wxt build` 三重门全绿；E2E 无 pageerror |

---

## 12. 生产就绪记分卡（7 维 × 3 档，总档取最低）

| 维度 | 档位 | 证据 |
|------|------|------|
| 测试 + 回归 | **Bronze** | 独立测试作者、真机 E2E 60 条、D1–D9、反作弊门 8 项、回归率 0、**DEF-01 已沉淀持久回归用例**；但项目非 git 仓库、回归集未进 CI 门禁、无 pass^k |
| 契约 | **Silver** | `check-contracts` 6 份镜像逐字节一致；容器自动选择契约与诊断 JSON shape 对齐 |
| 安全 | **Bronze** | 零外发 / 只填不提交 / 无上传全通过；AC-V2-08 部分满足（本地落盘偏差） |
| 无障碍 | **Bronze** | 未做对比度 / 焦点 / 语义 AA 自动扫描与屏读走查 |
| 性能 | **Bronze** | 无 N+1、关键路径可用；未做容量 / 压测 / 预算守恒 |
| 可观测 | **Bronze** | 逐字段诊断 JSON 与结果条（本机内存、仅剪贴板）；无结构化日志 / SLI / SLO |
| 发布安全 | **Bronze** | 可回退（撤销）；无渐进发布、无回滚预案演练 |
| **总档（取最低）** | **Bronze** | **未达 Silver，不交付商业生产**；Bronze = 最低可上线（内部工具 / demo 形态） |

**离 Silver 差哪几项（按优先级）**：① 回归集进 CI 门禁与 pass^k；② DEF-03 清理本地埋点落盘，闭合 AC-V2-08；③ 无障碍 AA 扫描 + 屏读走查；④ 热点路径性能预算与容量验证；⑤ 可观测口径与「不写日志」底线的显式设计；⑥ 渐进发布 / 回滚预案演练。

---

## 13. 上线建议与 RoleVerdict

### 13.1 上线建议

**本轮 v2 验收通过（PASS）。** 依据：**P0 = 0、P1 = 0**（DEF-01 已修复并由红转绿，且沉淀持久回归用例）、核心可用性达成（D1）、四条安全底线全过、新三绑定无漂移、反作弊门 8 项通过、回归率 0、七条命令 + 补充探针全 exit 0。

**限制**：生产就绪总档仍为 **Bronze**（7 维最低档），未达 Silver，**不交付商业生产**；DEF-02/03/04 三项 P2 / 技术债按 team-lead 裁决保留，DEF-03 严禁写成完全满足。Bronze 对应「最低可上线 / 内部工具形态」，本轮放行不等于商业级交付。

### 13.2 RoleVerdict

```yaml
verdict: pass
blocking: []                       # B1 已由 team-lead 关闭；B2 DEF-01 已修复并全量重跑验证
advisory:
  - DEF-02 P2：单字段补填后撤销残留 + 撤销提示与实际不完全一致
  - DEF-03 P2 / Silver 前技术债：AC-V2-08 部分满足（本地埋点落盘偏差），严禁写成完全满足
  - DEF-04 P2 / v2.1：manifest 4 条 commands description 仍为 v1 英文，功能已由 content-runtime.ts:32-35 路由
  - QA-01 / QA-02：QA 自有断言口径与文案过宽，B1 五条按 14 条 AC 口径结案；原始 FAIL 全部保留不删不弱
  - 生产就绪总档 Bronze，未达 Silver，不交付商业生产
  - R1（19:15 基线）证据全部作废，仅归档留痕
evidence:
  frozen_baseline_r2:
    frozen_at: "2026-11-09 20:00"
    source_fingerprint: 07fec8ada9667353060791c7ad4d24065bedce047809200dc087d88460d4c3d2   # 125 files
    filler_js_sha256: 05e7fbe40b9562dd212557ab9347672a943e6bcc698627fa145618330ad8d125        # 193034 bytes
    manifest_sha256: 5570ccda04073d4695c9f97492e8347851d73fbd6c51dbdc2a0d47371f69c889
    changed_files_after_1915: ["src/detection/scope-selector.ts @19:54:29", "src/ui/components/ResultBar.vue @19:55:03"]
  commands:
    typecheck: exit 0
    check-contracts: "CONTRACTS PASS: 6 mirrored files are byte-identical" exit 0
    check-guard: "GUARD PASS: 127 source files, zero blocked patterns" exit 0
    pnpm-test: "20 passed (20) / 167 passed (167) / 3.86s" exit 0
    pnpm-build: "2.881 s / 337.87 kB / filler.js 193.03 kB" exit 0
    check-e2e-integrity: "INTEGRITY PASS (3 executors + 5 fixtures, 0 forbidden)" exit 0
    e2e-v2: "total=60 passed=52 failed=8 blockingFailed=7" exit 0
    qa-v2-probe: exit 0
    regression_selfcheck: "1 passed (1) / 8 passed (8) / 1.53s" exit 0
  three_binding:
    requested_chunks: [popup-4OR6tzE-.js, contracts-Cba9TCdK.js, contracts-CcCMGRrd.css]
    ghosts: []
    context_requests: 9
    cdp_requests: 2
    e2e_artifact_files_filler_js: 05e7fbe40b9562dd212557ab9347672a943e6bcc698627fa145618330ad8d125
    probe_ext_filler_sha256: 05e7fbe40b9562dd212557ab9347672a943e6bcc698627fa145618330ad8d125
    source_fingerprint_after_all_runs: 07fec8ada9667353060791c7ad4d24065bedce047809200dc087d88460d4c3d2
  def01_fixed:
    V2-12a: "R1 FAIL [global-filter, outside-text] -> R2 PASS []"
    V2-12c: "R1 FAIL false -> R2 PASS true"
    empty_state_ui: "已填充 0 项，未提交 成功 0 跳过 5 失败 0 ... 当前区域没有可填的可见控件，可重新选择区域 暂无可撤销内容"
    total_semantics: "filled=0 && failed=0；report.total=5（5 个 skipOutcome 保留），未以 total===0 为通过条件"
    regression_file: "tests/unit/v2-empty-dialog-boundary.test.ts (8 tests, 13 expects, sha256 87ede3ee…)"
  d1_actual: "14 filled / 9 skipped / 0 failed; 11 of 13 core controls non-empty; f-org & f-decoy low-confidence skipped per AC-V2-13"
  file_refs:
    - "docs/SPEC-v2.md:74,132,154 (低置信度跳过口径)"
    - "src/detection/scope-selector.ts:138-151,163-199 (DEF-01 修复)"
    - "src/ui/components/ResultBar.vue:21-27,108-113 (空状态判据与文案)"
    - "src/runtime/auto-fill.ts:53,74 / src/runtime/ui-actions.ts:21,24 / src/execution/fill-executor.ts:86,96,114,138,140,169,171,178 (本地埋点)"
    - "src/runtime/content-runtime.ts:32-35 (legacy commands 路由)"
    - "wxt.config.ts:30-45 (manifest v1 文案)"
  anti_cheat: "presetStorageWrites=0, optionsPageOpens=0, gestureCalls=6, uiGestureOnly=true, profileFreshAtStart=true"
  p0_count: 0
  p1_count: 0
  regression_rate: 0
  rerun_rounds: 1
  readiness_tier: Bronze
```

---

## 14. 证据文件与哈希清单（R2）

| 文件 | sha256 | 说明 |
|------|--------|------|
| `.e2e-tmp/e2e-v2.mjs` | `e29f7dca935df16458941cd75a383d1fbed6b2e9ae41c2e4f3c6b28cba9a9428` | 正式 E2E 执行器（920 行、59 处 `record(`，本轮未改） |
| `.e2e-tmp/check-e2e-integrity.mjs` | `c5c3de5e6985bf23e2160ba195484178ad3c2912442557303cffe093a6ced285` | 反作弊门第 8 项（扫描 3 执行器 + 5 夹具，本轮未改） |
| `.e2e-tmp/qa-v2-probe.mjs` | `2b1573ee1e7dc7d9cd83a178a2d0e109c674fe67b8c427b575545ab20c7ae3b9` | 补充探针（只 `get` 不 `set`，本轮未改） |
| `.e2e-tmp/e2e-v2-result.json` | `e31e3bb7ff3593ba25a883ae55574da8b9404c5602c1e568f91961c9a98078ba` | R2 60 条断言逐条证据 + 新产物/源码哈希 |
| `.e2e-tmp/qa-v2-probe.json` | `7e8f207f00cb6c60ff6f518099b8839213971defa225f51e0b6f439d600bba0c` | R2 三项如实核查实测 |
| `tests/unit/v2-empty-dialog-boundary.test.ts` | `87ede3ee0c21041000c4e2be7289e2e617f20987161a27478eab749189b72b77` | 新增持久回归用例（8 例） |
| `docs/QA-V2-REPORT.md` | 本文件（R2） | 升版最终报告 |

归档留痕（**已作废，不作裁决依据**）：`.e2e-tmp/archive-baseline-1915/QA-V2-REPORT.md` `56cad63f…`、`e2e-v2-result.json` `51e91286…`（含原始 10 条 FAIL）、`qa-v2-probe.json` `e2107f39…`。

---

## 15. 边界与合规声明

- 重跑全程**未修改** `entrypoints/**`、`src/**`、`wxt.config.ts`、根 `package.json` / `pnpm-lock.yaml` / `vitest.config.ts` / `tsconfig.json`、`docs/SPEC-v2.md`、`tests/unit/` 既有任何用例文件；只**新建** `tests/unit/v2-empty-dialog-boundary.test.ts`。
- E2E 与补充探针全程**零 storage 预置、零内部状态预置、零绕过 UI**；补充探针仅用 `chrome.storage.local.get(null)` 读取取证。反作弊门第 8 项保持有效（扫描 3 执行器，只增不减）。
- 源码重新冻结后**未再改动**：全部 8 条命令跑完复核，源码指纹 `07fec8ad…`、产物 `05e7fbe4…`、最后源码 mtime 19:55:03 均未变。
- 旧基线（19:15）全部指纹与证据**作废**，不复用、不引用为本轮结论；R1 原始 10 条 FAIL 归档留痕保留。
- 报告 **§0 直接回答**「一个全新安装、什么都不配置的人，能不能一次填满表单」，未用「测试全绿 / 门禁通过」替代；如实披露 2 个 low-confidence 字段与 3 项 P2 / 技术债。
- V2-12 按 team-lead total 语义裁决判定，**未以 `report.total === 0` 为通过条件**；B1 五条假失败按 14 条 AC 口径结案。
