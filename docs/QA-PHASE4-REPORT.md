# QA Phase 4 质量报告 — 表单自动填充工具 v1

> 版本：**v1.1（最终质量裁决 · 含 A3 修复后产物完整性复核与 E2E 全量重跑）** · 日期：2026-11-09 · 负责人：QA 严过关
> 验收唯一依据：`docs/SPEC-v1.md` §9 / §11 / §12；EARS `docs/PRD-v1.md` §8 AC-1~AC-8；契约 `docs/contracts/*`；回读判据 `docs/ARCH-v1.md` §14.2；门禁 §12（12 条）+ §18（14 条）。
> 独立性：QA 未写业务实现代码，未修改 `src/`、`entrypoints/`、`wxt.config.ts`、`tsconfig.json`、根 `package.json`、`pnpm-lock.yaml`。E2E 执行器与依赖全部隔离在 `.e2e-tmp/`。
> 诚实边界：所有结论均来自本机真实命令输出与真实浏览器观察；**未执行的项目一律标为「未执行 / 部分」，不粉饰成通过**。
> **v1.1 变更（QA 主动发起）**：收口复核时发现 `entrypoints/popup/App.vue` 于 **15:01:07**（A3 修复）在首轮 E2E（14:58:01）与 v1.0 报告（14:56:28）之后被修改，首轮 42 条 E2E 证据对应的 `popup-Di5oKzOe.js` 已不是当前产物。QA **未复用旧证据**：15:08 全量重跑五条命令、15:15 按当前产物全量重跑 E2E（43 条，含新增 A3 行为判别断言）。详见 **§3.3**。本文所有 E2E 数字以 v1.1 为准。

---

## 0. 一句话裁决

**P0 缺陷 = 0；三条硬指标全部为 0；`105` 单测 + `43` 实机 E2E 断言全绿；两条门禁脚本 + `tsc --strict` + `vitest` + `build` 五条命令全部 exit 0（均已在当前源码上复跑）。**
**上线建议：有条件通过 —— 允许在白名单内测试环境发布 v1 试用；不通过商业生产交付（生产就绪总档 Bronze，未达 Silver）。**

---

## 1. 基线复核：上轮 3 项 blocking 逐项关闭判定

| ID | 上轮状态 | 本轮复核证据 | 判定 |
|----|----------|--------------|------|
| **QA-G01** | `pnpm build` 失败：`entrypoints/options/App.vue:8` 引用不存在的 `./components/IoStatsTab.vue` | `entrypoints/options/components/IoStatsTab.vue` 已补齐（7041 字节实体 Vue 组件，非移除引用、非注释绕过）；`App.vue:8` 引用保持不变；`pnpm build` 首轮实跑 `√ Finished in 3.978 s` / `Σ Total size: 323.08 kB` / exit 0（A3 修复后复跑为 323.11 kB，见 §3.3）；`.output/chrome-mv3/` 产出 13 个文件 | **关闭（真实修复）** |
| **QA-G02** | `pnpm check:contracts` → `MODULE_NOT_FOUND` | `scripts/check-contracts.mjs` 已落地；实跑 `CONTRACTS PASS: 6 mirrored files are byte-identical` / exit 0 | **关闭** |
| **QA-G03** | `pnpm check:guard` → `MODULE_NOT_FOUND` | `scripts/check-guard.mjs` 已落地；实跑 `GUARD PASS: 120 source files, zero blocked patterns` / exit 0 | **关闭** |
| **第 3 项（E2E + 3 硬指标）** | 未在真实 Chromium 验证 | 本轮在 **Microsoft Edge 157（Chromium，`--headless=new`）** 加载真实未打包 MV3 扩展，按当前构建产物实跑 **43 条断言（含 A3 回归 E2E-08c）** 全通过，三条硬指标全部实测为 0，详见 §3 / §3.3 / §4 | **关闭（含降级说明 §3.1）** |

> 补充核证：`.output/chrome-mv3/manifest.json` 实机读取 `permissions=["activeTab","scripting","storage"]`、`host_permissions` 不存在、`minimum_chrome_version="120"`、4 条 commands、CSP `script-src 'self' 'wasm-unsafe-eval'`；`chrome.permissions.getAll()` 实机返回 `origins: []`（无 `<all_urls>`）。

---

## 2. 全命令复跑真实输出（未修饰）

首轮复跑（v1.0 基线）：

```
$ node scripts/check-contracts.mjs
CONTRACTS PASS: 6 mirrored files are byte-identical                    (exit 0)

$ node scripts/check-guard.mjs
GUARD PASS: 120 source files, zero blocked patterns                    (exit 0)

$ pnpm exec tsc --noEmit --strict
(无输出，exit 0)

$ pnpm exec vitest run
 RUN  v5.1.0 D:/myTools/form-auto-filler
 ✓ tests/contract/contracts.test.ts (24)      ✓ tests/contract/ui-contract.test.ts (13)
 ✓ tests/unit/frontend-p0-loop.test.ts (1)    ✓ tests/compliance/gates.test.ts (14)
 ✓ tests/regression/ac6-allowlist-bypass.test.ts (3)
 ✓ tests/regression/ac4-pattern-anchor.test.ts (4)
 ✓ tests/regression/ac8-illegal-locator-strategy.test.ts (5)
 ✓ tests/unit/generator-legality.test.ts (9) ✓ tests/unit/controlled-assignment.test.ts (8)
 ✓ tests/unit/l2-inference.test.ts (6)       ✓ tests/unit/rule-store.test.ts (6)
 ✓ tests/unit/site-guard.test.ts (5)         ✓ tests/unit/limits.test.ts (7)
 Test Files  13 passed (13)
      Tests  105 passed (105)
   Duration  2.70s                                                      (exit 0)

$ pnpm build
WXT 0.21.5 / Vite 8.3.6
√ Built extension in 3.608 s   Σ Total size: 323.08 kB   (13 files)
√ Finished in 3.941 s                                                  (exit 0)
```

**15:08 收口复跑（v1.1，A3 修复后的当前源码）** —— 五条命令再次全量执行，全部 exit 0：

```
=== [1] check-contracts ===  CONTRACTS PASS: 6 mirrored files are byte-identical
=== [2] check-guard ===      GUARD PASS: 120 source files, zero blocked patterns
=== [3] tsc --noEmit --strict ===  (无输出，exit 0)
=== [4] vitest run ===
 Test Files  13 passed (13)      Tests  105 passed (105)   Duration  3.05s
=== [5] pnpm build ===
WXT 0.21.5 / Vite 8.3.6
√ Built extension in 3.227 s
  ├─ .output\chrome-mv3\chunks\popup-CsfsZAHo.js    11.42 kB
  └─ (共 13 个文件)
Σ Total size: 323.11 kB
√ Finished in 3.524 s
=== ALL FIVE COMMANDS EXIT 0 ===
```

> 连续第二次 `pnpm build` 同样产出 `popup-CsfsZAHo.js` / 323.11 kB —— 构建确定性核验通过，首轮 323.08 kB 与当前 323.11 kB 的差异由 A3 源码修改解释，非构建不确定性（§3.3）。

Vitest 机器可读反作弊证据（`--reporter=json`，exit 0）：

```json
{"numTotalTestSuites":35,"numPassedTestSuites":35,"numFailedTestSuites":0,
 "numPendingTestSuites":0,"numTotalTests":104,"numPassedTests":104,
 "numFailedTests":0,"numPendingTests":0,"numTodoTests":0}
```

> 上表为 Phase 2 基线（104 例）的 JSON 快照；本轮含前端新增 `frontend-p0-loop.test.ts` 后为 **105 例 / 13 文件**，`0 failed / 0 pending`。该新增文件 QA 已逐行复核：7 控件扫描 → 7 项 `verified=true`、三层证据全真、identity 一致性组，均为真实断言，无 `skip` / 无弱化 / 无同义复述。

---

## 3. 真实浏览器 E2E（实机证据）

### 3.1 环境与触发路径（含一次环境受限的诚实记录）

| 项 | 值 |
|----|----|
| 浏览器 | **Microsoft Edge 157.0.4341.42**，`--headless=new` |
| 本机 Chrome | 156.0.8078.80 —— **不可用**：Chrome ≥137 已移除 `--load-extension`（品牌 Chrome 安全变更），实测 `SERVICE_WORKERS: []`、`EXT_ID: null`；`--disable-features=DisableLoadExtensionCommandLineSwitch` 在 ≥142 亦失效 |
| CDP 替代尝试 | Chrome 156 的 `Extensions.loadUnpacked` 返回了 id，但 `Target.getTargets` / `context.serviceWorkers()` 均为空，扩展 SW 未启动 → 判定不可用 |
| 成功路径 | Edge + `--disable-extensions-except=<.output/chrome-mv3>` + `--load-extension=<...>` → `SERVICE_WORKERS: ["chrome-extension://dedjmmbbdpnfikcidkcleoepghfmnofg/background.js"]` |
| 扩展 ID | `dedjmmbbdpnfikcidkcleoepghfmnofg` |
| 当前产物 chunk | `popup-CsfsZAHo.js` / `options-D-m8jm3Q.js` / `result-CcLN8Ub_.js`（15:08 构建，E2E 请求日志实测一致） |
| 用户手势 | Playwright `page.keyboard.press('Alt+Shift+F')` **不触发浏览器级加速器**（实测 `AFTER_KEYBOARD_SHADOW: false`）；改用 CDP `Input.dispatchKeyEvent`（`rawKeyDown`+`keyUp`，`modifiers: 9` = Alt+Shift，`code: KeyF`）→ 真实触发 `open-plan` command 并注入 `filler.js`（`AFTER_CDP_KEY_SHADOW: true`） |
| 依赖隔离 | `.e2e-tmp/package.json` + 本地 `npm install playwright-core@1.65.0`（不下载浏览器）；**根 `package.json` / `pnpm-lock.yaml` 未被 QA 修改**（锁文件 mtime 12:35:45 未变；`test` / `test:watch` 脚本由 team-lead 于 14:27:18 合并） |
| 测试页 | `http://localhost:18765/` 本地 HTTP 服务，`/form`（21 控件）、`/react`（React 受控模拟）、`/format`（非默认 valueFormat） |
| 白名单 | 经真实扩展页 `options.html` 的 `chrome.storage.local.set('faf.siteAllowlist.v1', ['localhost'])` 配置 |
| 最终结果文件时间戳 | `2026-11-09T07:15:34.435Z`（本地 15:15:34）—— 晚于 A3 修复（15:01:07） |

> **降级说明**：SPEC-v1.md §12 第 2 步明确允许「Chrome/Edge 载入」，故 Edge 实机在验收范围内；但**品牌 Chrome 实机未覆盖**，列为 §8.2 尾项。Chrome 的 `--load-extension` 移除只影响自动化加载，不影响终端用户在 `chrome://extensions` 开发者模式「加载已解压的扩展程序」。

### 3.2 E2E 结果：`43 passed / 0 failed`（15:15 在当前构建产物上全量重跑）

结果文件：`.e2e-tmp/e2e-result.json`（含每条断言的 expected / actual / evidence）。首轮 42 条已被本次 43 条取代，原因见 §3.3。

| 组 | 断言 | 实机证据（摘录） |
|----|------|------------------|
| 载入与权限 | E2E-00/01/01b/01c | SW 注册成功；`chrome.permissions.getAll()` → `permissions=["activeTab","storage","scripting"]`, `origins=[]`；manifest 4 条 commands 在 `chrome.commands.getAll()` 均可见 |
| 手势与注入 | E2E-02/02b/07/07b | 手势前 `#faf-shadow-root` 不存在；CDP 原生按键后存在；`page.reload()` 后消失，再次手势后恢复 |
| 预览不写值 | E2E-03/03b/03c | 计划面板 `共 21 项 · 待填 15 · 待绑定 2 · 已排除 3 · 超范围 0`，16 行含控件类型纯文本（输入框/下拉/文本域）；前后值快照完全一致；`submitClicks=0, submitEvents=0` |
| 填充合法性 | E2E-04/04b~04k | 15 项写入；身份证 `320102196810111475`（独立 GB11643 oracle 通过）；手机号 `18392772295`；日期 `1968-10-11` = 证件 7-14 位；性别 `男` = 第 17 位奇偶；学历 `博士` ∈ 页面 option；金额 `478.00` ∈ [10,1000] 且落在 0.5 栅格；备注 25 字 ≤ 30；失焦后 `.is-error` / `aria-invalid` 全清零；提交计数仍 0 |
| undo 闭环 | E2E-10/10b | 「撤销本次填充」可用，9 个核心控件全部恢复空值，提交计数仍 0 |
| 白名单拒绝 | E2E-06/06b/06c | 移出白名单后提示「当前页面不在测试站点白名单内，未执行任何填充」，确认按钮 `disabled=true`；值零变化；**强制移除 disabled 并触发确认处理器后仍不写入**（`confirm()` 内 `!state.allowed` 二次校验） |
| 误填防护 | E2E-05/05b | 容器外 `.search-bar` 搜索框、readonly、disabled、password 前后值均 `""`；分组「已排除 / 待绑定 / 超范围」可见 |
| 结果报告 | E2E-12/12b/13 | `faf.lastResult.v1` 实测 `{total:21, filled:15, skipped:4, failed:0, separate:2}`，现行可账恒等式 `15+4+0+2=21` 成立；`faf.counters.v1` 实测含 `field_unknown:10`、`field_skipped:6`、`first_core_action:1` 且与结果分键 |
| popup / 隔离 / A3 回归 | E2E-08/08b/**08c**/09/09b | 真实 `getAll()` 下 `open-picker` 未绑定 → 警告正确显示；**模拟 4 条用户命令全绑定 + `_execute_action` 空快捷键 → 警告消失**（E2E-08c，A3 修复的行为判别，见 §3.3）；宿主页控制台零扩展日志、零未捕获异常 |
| React 受控 | E2E-11/11b | `/react` 页模拟 React `inputValueTracking`（实例 setter 吞掉裸赋值）；原生 setter + 派发事件后 `payload="冯宁辉" === dom.value`，提交计数 0 |
| valueFormat | E2E-14 | `data-value-format="YYYY/MM/DD"` → 生成 `1968/10/11`，匹配 `^\d{4}/\d{2}/\d{2}$` |

### 3.3 产物完整性复核与 E2E 全量重跑（v1.1 新增，QA 主动发起）

**触发**：v1.0 报告与首轮 E2E 完成后，QA 收口复核发现构建产物 chunk 名不一致 —— 首轮 E2E 请求日志为 `chunks/popup-Di5oKzOe.js`，当前 `.output/chrome-mv3/chunks/` 为 `popup-CsfsZAHo.js`。**证据与产物不再对应，不能沿用。**

**取证（真实命令输出）**：

```
$ stat -c '%y  %s  %n' .e2e-tmp/e2e-result.json docs/QA-PHASE4-REPORT.md entrypoints/popup/App.vue
2026-11-09 14:56:28  29764  docs/QA-PHASE4-REPORT.md        (v1.0 报告)
2026-11-09 14:58:01  17838  .e2e-tmp/e2e-result.json        (首轮 42 条 E2E)
2026-11-09 15:01:07   7691  entrypoints/popup/App.vue       (唯一在 E2E 后被修改的源文件)

$ find src entrypoints tests scripts docs -type f -newermt '2026-11-09 14:58:01' ...
2026-11-09 15:01:07  entrypoints/popup/App.vue            (仅此一个文件)

$ git rev-parse --is-inside-work-tree
fatal: not a git repository                              (故改用 mtime + 产物内容哈希取证)
```

**根因**：前端在 E2E 之后修复了本报告 §8.3 的 advisory **A3** —— `App.vue:59-63` 的 `shortcutWarning` 判定由 `commands.some(item => !item.shortcut)` 改为 `commands.some(item => item.name !== '_execute_action' && !item.shortcut)`。源码变化导致 Vite 内容哈希改名（`popup-Di5oKzOe.js` → `popup-CsfsZAHo.js`）与体积 323.08 kB → 323.11 kB。**非构建不确定性**：连续两次 `pnpm build` 均为 `popup-CsfsZAHo.js` / 323.11 kB。

**处置（不粉饰、不复用旧证据）**：

1. **15:08** 全量重跑五条命令 → 全部 exit 0（输出见 §2 补记）。
2. 在 `.e2e-tmp/e2e.mjs` 新增 **E2E-08c 行为判别断言**：用 `addInitScript` 在 popup 文档启动前把 `chrome` / `browser` 的 `commands.getAll` 替换为「4 条用户命令全绑定 + `_execute_action` 空快捷键」，重载后断言不再出现「快捷键未生效」。旧逻辑必然误报 → 该断言能真正区分修复前后，**不是复述实现的同义测试**。
3. **15:15** 以干净 profile 在当前产物上全量重跑 E2E → **43 passed / 0 failed**；请求日志实测 `popup-CsfsZAHo.js`，与当前产物一致；三条硬指标仍全部为 0。

**E2E-08c 实机证据**：`patchFlags={chrome:true,browser:true}`、`shimIsChrome=false`（WXT shim 实际走 `globalThis.browser`，故两处均打桩）、`patchedCommands` 5 条（4 条用户命令均有快捷键、`_execute_action.shortcut=""`）、`warningShown=false`。同环境 E2E-08（真实 `getAll()`，`open-picker` 未绑定）仍正确显示警告 → 修复既消除了误报，也未吞掉真实降级提示。

**结论**：首轮 42 条证据已被 15:15 的 43 条证据取代；当前报告所有 E2E 数字与 `.e2e-tmp/e2e-result.json`（`timestamp=2026-11-09T07:15:34.435Z`）一致，且与当前构建产物哈希一致。**A3 由「待修」转为「已关闭并已实机回归验证」。**

---

## 4. 三条硬指标（一票否决项）—— 全部实测为 0

| 硬指标 | 采集方式（实机） | 实测 | 结论 |
|--------|------------------|------|------|
| **误填次数 = 0** | 填充前/后逐控件值快照比对：容器外搜索框、readonly、disabled、password、`has-value`；诊断 `field_skipped` 分组 | **0**（4 个受保护控件前后均 `""`，`misfills=[]`） | ✅ 通过 |
| **自动提交次数 = 0** | 页面内 `#submit-btn` click 监听 + `#qa-form` submit 监听（含 React 页、format 页）；全程由扩展驱动 | **0**（`submitClicks=0, submitEvents=0`；popup 常驻「仅填入，不提交」） | ✅ 通过 |
| **外发请求数 = 0** | `context.on('request')` 全量计数 + CDP `Network.enable` / `Network.requestWillBeSent` initiator 追踪 + 静态门禁 `TC-GATE-08`（禁 fetch/XHR/WS/EventSource/sendBeacon）与 `TC-GATE-12`（禁 CDN/远程字体/远程 URL） | **0**（15:15 重跑观测 22 条请求，全部为 `http://localhost:18765/*` 与 `chrome-extension://<id>/*`；`outbound=[]`） | ✅ 通过 |

> 静态侧交叉印证：`check-guard.mjs` 120 源码文件零命中；`manifest.permissions` 仅 `activeTab/scripting/storage`、无 `host_permissions`；CSP 禁远程托管代码；`@lucide/vue@1.70.0` 随包内联。

---

## 5. P0 归零判定

| 来源 | P0 项 | 状态 |
|------|-------|------|
| Phase 2 缺陷台账 | **QA-B01 白名单被 `test` 子串绕过** | 修复 + `tests/regression/ac6-allowlist-bypass.test.ts` 5 个绕过向量 + 实机 E2E-06/06b/06c → **归零** |
| Phase 3 阻断 | `pnpm build` 失败 | 真实补齐组件，构建通过 → **归零** |
| 三条硬指标 | 误填 / 自动提交 / 外发 | 实机全部 0 → **无 P0** |
| 视觉 P0 规则 | emoji 功能图标 / 紫粉渐变 / AI 模板味 | `TC-GATE-05/06/07` + `check-guard.mjs` 120 文件零命中 → **无 P0** |
| 回读 P0 | 「脚本报绿、业务没生效」 | `TC-FILL-05`（MUT-01 必过项）真跑：`verified=false` / `E_READBACK_MISMATCH` / `failureReason` 含 `frameworkStateMatched` / 不计入成功数；契约 C3 锁定唯一三 slug 判据 → **无 P0** |
| 新增 P0 | 本轮 Phase 4 全量实跑（含 A3 修复后重跑） | **0** |

> **已知 P0 缺陷 = 0。** 但「P0 缺陷为 0」≠「P0 级门禁全部执行完」：`G18-09` 兼容性矩阵被 ARCH §18 标为 **P0 必过**，本轮未实机执行（见 §6 / §8.2），属**验证缺口**，不是已确认缺陷。这一点在上线建议中已计入。

---

## 6. 26 条 Phase 3 门禁逐条状态

图例：**✅ 实机通过** / **✅ 单测·静态通过** / **⚠️ 部分（含明确缺口）** / **⛔ 未执行** / **N/A 架构裁决废弃**

### ARCH §12（12 条）

| ID | 状态 | 证据 / 缺口 |
|----|------|-------------|
| G12-01 载入无宽泛权限警告 | ⚠️ | manifest 静态 + 实机 `chrome.permissions.getAll().origins=[]`（E2E-01）；**headless 无法目视 `chrome://extensions` 安装期警告文案**，以权限 API 替代 |
| G12-02 首次手势注入 | ✅ 实机 | E2E-02/02b（CDP 原生按键触发真实 command） |
| G12-03 预览 ≥20 字段、搜索框默认跳过 | ✅ 实机 | E2E-03 `共 21 项`、16 行；容器外搜索框未纳入且未写入（E2E-05） |
| G12-04 值一致 / skipped / 报告不变量 | ⚠️ | 值一致性与 skipped 实机通过（E2E-04b~04i / E2E-05）；**字面 `filled+skipped+failed===total` 不成立**（21 vs 19），因 v1.1 单列分组；现行可账恒等式 `15+4+0+2=21` 实机通过（E2E-12）。见 §8.3 advisory A1 |
| G12-05 React 提交 payload 非空 | ✅ 实机 | E2E-11 `payload="冯宁辉" === dom.value`（vanilla inputValueTracking 模拟，非真实 React 库） |
| G12-06 AntD/EL 组件 + valueFormat | ⛔ | 真实 AntD Vue 4.2.6 / Element Plus 2.14.8 组件页未实机；`valueFormat` 分支由 E2E-14 覆盖（`YYYY/MM/DD`） |
| G12-07 同种子一致 + 校验位 | ✅ 单测 + 实机 | `TC-GEN-01/03/04`；E2E-04c/d/e/f 一组实机通过；「连续填两次」未实机（单测已证可复现） |
| G12-08 非白名单拒绝 | ✅ 实机 | E2E-06/06b/06c |
| G12-09 schemaVersion 999 | ✅ 单测 | `TC-RULE-05` → `E_RULE_SCHEMA_INVALID`，原规则不变 |
| G12-10 page-bridge 注入失败降级 | **N/A** | SPEC-v1.md:151 裁决「组件实例通道作废，主路径固定 ISOLATED world DOM」；构建产物无 `page-bridge.js`，`E_BRIDGE_UNAVAILABLE` 为保留码。建议架构师把 §12 #10 标为已废弃（§8.3 A2） |
| G12-11 100 字段不卡死 / 分批 | ⚠️ | `TC-LIM-06/07` 单测 250→200 截断、120 项分批；实机 21 控件无卡顿，未做 100 控件 E2E / 耗时上限量测 |
| G12-12 门禁命令全通过 | ✅ | `check-contracts` / `check-guard` / `tsc` / `vitest` / `build` 五命令全绿（§2，含 15:08 复跑） |

### ARCH §18（14 条）

| ID | 状态 | 证据 / 缺口 |
|----|------|-------------|
| **G18-01 MUT-01 事件派发后框架回滚** | ⚠️ | **单测必过项真跑通过**：`TC-FILL-05` 断言 `verified=false` / `status='failed'` / `E_READBACK_MISMATCH` / `failureReason` 含 `frameworkStateMatched` / 不计入成功数；**「UI 不显示成功态」未构造真实框架回滚页面实机验证**。两渲染帧是时序近似，架构只承诺可观测检出 + evidence/人工标记兜底，不承诺 100% |
| G18-02 portal 级下拉（选项在 body） | ⛔ | 未实机；6 个 P0 策略工厂已由 `TC-FILL-03/04` 单测接入 |
| G18-03 valueFormat / `E_VALUE_FORMAT_MISMATCH` | ⚠️ | E2E-14 实机 `YYYY/MM/DD → 1968/10/11`；无法解析格式的 `E_VALUE_FORMAT_MISMATCH` 分支未实机注入 |
| G18-04 MutationObserver 联动 / 超时 | ⛔ | 未实机；`E_LINKAGE_TIMEOUT` 与唯一性校验串行无实机证据 |
| G18-05 误填 0 / 自动提交 0 / 已排除分组 | ✅ 实机 | E2E-05 / HARD-1 / HARD-2 + popup「已排除」分组 |
| G18-06 零外发 / 权限 / 导出不含计数 | ✅ 实机 | HARD-3；`TC-GATE-01/08/12`；`TC-RULE-04` `exportJson` 不含 `faf.counters.v1` |
| G18-07 隔离性 | ⚠️ | 宿主页控制台零扩展日志、零未捕获异常实机通过（E2E-09/09b）；「单策略抛异常后其余继续填充」未实机注入 |
| G18-08 三阈值 / 漂移恰好一次 / unknown | ⚠️ | 250→200、120 虚拟滚动单测通过；`unknown` 待绑定态与 `field_unknown=10` 实机通过（E2E-13）；「增删一个控件漂移提示恰好一次」未实机 |
| **G18-09 兼容性矩阵（P0 必过）** | ⛔ | **本轮最大尾项**：Vue3 + AntD Vue 4.2.6 / Vue3 + Element Plus 2.14.8 / Vue2 2.7.16 原生受控 / 真实 React 组件库矩阵未实机；仅 vanilla 模拟 React 受控（E2E-11）与原生控件覆盖 |
| G18-10 20 类枚举三处一致 | ✅ 单测·静态 | `contracts.test.ts` C1、`ui-contract.test.ts` C5-3/4、六份契约字节一致；拾取器绑定后同 slug 回写未实机 |
| G18-11 undo 闭环 | ⚠️ | E2E-10/10b 实机 9 控件恢复 + 未提交；**非原生控件显示文本/隐藏 input 同步恢复、页面跳转后置灰「页面已变化，无法撤销」、storage 无快照**未实机 |
| G18-12 ControlType 5 类 / 超范围单列 | ✅ 实机 | E2E-03 计划行控件类型纯文本、E2E-05b 分组、popup「超范围控件 0 / 待绑定 2」单列；`ui-contract.test.ts` C5-2 断言 `f-control-type` 不含「超范围控件」 |
| G18-13 拾取器边界 | ⛔ | tooltip 仅 4 项、无选择器输入框、改绑 ≤3 次点击、元素路径只在诊断折叠区——未实机走查 |
| G18-14 图标与注入层 | ⚠️ | 构建产物 13 文件 323.11 kB、Lucide SVG 内联、无 CDN/远程字体（HARD-3 / `TC-GATE-02/12`）、Shadow DOM 实机（`#faf-shadow-root` + 内联 CSS）、4 条 commands 在 `getAll()` 可见；**`open-picker` 快捷键在 Edge 未绑定（3/4）**，popup 已给纯文本降级提示（E2E-08），且 A3 误报条件已修复并实机回归（E2E-08c）；popup 360×560 未实机量测（headless 以标签页打开，非真实 popup 尺寸） |

**汇总**：✅ 完整通过 **11** 条 · ⚠️ 部分 **9** 条 · ⛔ 未执行 **5** 条 · N/A **1** 条 = **26** 条。

---

## 7. 生产就绪记分卡（7 维 × 3 档，总档取最低）

| 维度 | 档位 | 证据 | 离下一档差什么 |
|------|------|------|----------------|
| 测试 + 回归 | **Silver** | 105 单测 / 13 文件、3 份持久回归集、43 实机 E2E（含 A3 行为判别）、0 failed / 0 pending、多轮复跑稳定（首轮 42 条 ×2、A3 修复后 43 条 ×1）；前端新增 smoke 已复核 | G18-09 P0 必过矩阵、G18-02/04/13 未实机；MUT-01 的 UI 成功态分支未实机 |
| 契约 | **Silver** | 20 类三处一致、`LIMITS` 0.6/100/200、`VerificationDetail` 三 slug、六份契约字节一致、`ControlType` 5 类全部机器断言 | ARCH §12 #4 旧字面不变量未同步（A1）、§12 #10 未标废弃（A2） |
| 安全 | **Silver** | 三条硬指标实机全 0；白名单绕过修复 + 5 向量回归 + 实机拒绝/强制点击负向探测；权限最小、零外发、CSP 禁远程代码 | 两渲染帧时序近似的诚实边界；无独立框架回滚实机页面 |
| 无障碍 | **未评（按 Bronze 计）** | 未做键盘可达 / 对比度 / 屏读走查 | 完整 a11y 走查 |
| 性能 | **Bronze** | 21 控件实机无卡顿；250→200 / 120 分批仅单测 | 100 字段 E2E、≤3s 耗时上限、Lighthouse / k6 |
| 可观测 | **Silver** | `faf.counters.v1` 实机含 11 事件中的 7 类、`faf.lastResult.v1` 分组可账、evidence 字段在契约中锁定 | 日志/指标校验、人工标记入口走查 |
| 发布安全 | **Bronze** | 构建可复现（连续两次同哈希）、扩展可加载、无渐进发布 | 渐进发布与回滚演练、品牌 Chrome 实机 |
| **总档（取最低）** | **Bronze** | **未达 Silver 不交付商业生产**（scorecard §7） | 优先补 无障碍 / 性能 / 发布安全 + G18-09 |

---

## 8. 遗留风险、降级项与 Advisory

### 8.1 阻断级（0 项）
无。已知 P0 缺陷全部归零，三条硬指标全部为 0。

### 8.2 上线前必须补齐的尾项（不阻断测试环境试用，阻断商业生产）

| # | 尾项 | 级别 | 依据 |
|---|------|------|------|
| T1 | **G18-09 兼容性矩阵实机**：Vue3 + AntD Vue 4.2.6、Vue3 + Element Plus 2.14.8（P0 必过）、Vue2 2.7.16 原生受控、真实 React 受控输入提交 payload | **P0 门禁** | ARCH §18 #9 |
| T2 | G18-02 portal 级下拉、G18-04 `MutationObserver` 联动与 `E_LINKAGE_TIMEOUT`、G18-13 拾取器边界实机 | P1 门禁 | ARCH §18 #2/#4/#13 |
| T3 | 无障碍（键盘/对比度/屏读）、性能（100 字段 E2E / ≤3s / Lighthouse）、发布安全（渐进发布 + 回滚演练） | 记分卡短板 | scorecard §5/§7 |
| T4 | 品牌 Chrome 实机复核（Chrome for Testing 或 `chrome://extensions` 手动加载），补齐 Edge 之外的证据 | 环境降级 | §3.1 |
| T5 | G18-01 的「UI 不显示成功态」实机分支、G18-11 非原生控件 undo 与页面跳转失效态 | P1 门禁 | ARCH §18 #1/#11 |

### 8.3 Advisory（非阻断，记入 Backlog）

- **A1｜ARCH §12 #4 文档口径过时**：文档仍写 `FillReport.filled + skipped + failed === total`，实测 `total=21, filled=15, skipped=4, failed=0`（差 2 为 `low-confidence` 单列组）。`src/execution/fill-report.ts` 按 §17.6 / UIUX R15 故意把单独分组排除在三个计数器外，`ResultPanel.vue` 用 5 组对账，`report.total` 在任何 UI/运行时都**未作分母**（grep 确认仅 `progress.total` 使用同名概念）。建议架构师把该行改为 `filled + skipped + failed + 单独分组 === total`。**不是数据缺陷**。
- **A2｜ARCH §12 #10 已失效**：SPEC-v1.md:151 裁决「组件实例通道作废」，构建产物无 `page-bridge.js`，`E_BRIDGE_UNAVAILABLE` 为保留码。建议把该门禁标为「已由裁决废弃」。
- **A3｜popup 降级提示误报条件 —— ✅ 已关闭（15:01:07 修复，15:15 实机回归）**：`entrypoints/popup/App.vue:59-63` 现为 `commands.some(item => item.name !== '_execute_action' && !item.shortcut)`，已把 `chrome.commands.getAll()` 恒含的空快捷键 `_execute_action` 排除。QA 新增 **E2E-08c 行为判别**：4 条用户命令全绑定时 `warningShown=false`；同时 E2E-08 在真实 `open-picker` 未绑定时仍显示提示 —— 误报消除且真实降级未被吞掉。原 P2 advisory 关闭，全过程见 §3.3。
- **A4｜`open-picker` 快捷键在 Edge 未绑定**：manifest 声明 4 条 suggested keys，实机 `getAll()` 为 `open-plan=Alt+Shift+F` / `scope-current-form=Alt+Shift+G` / `scope-current-row=Alt+Shift+H` / `open-picker=(unbound)`。ARCH §16.2 要求的纯文本降级提示已实机验证生效（E2E-08），故 G18-14 判「部分」而非失败（P2）。
- **A5｜白名单失效时已打开的计划面板不自动收起**：E2E-06 实测提示正确、确认按钮 `disabled=true`、强制触发处理器仍不写入（`confirm()` 内二次校验 `state.allowed`），无写入风险；仅面板视觉残留（P2）。
- **A6｜ARCH §2.6 与 §12 #6 已由架构师同步完毕**：本轮复查确认 L261 已改为「白名单唯一授权者」并写明 QA-B01 修复，§12 #6 已改为「内部 `failed` 仅为表示、展示层单列不算失败」——上轮两项 advisory **已关闭**。
- **A7｜`.e2e-tmp/` 为 QA 临时目录**：含 `playwright-core` 依赖、执行器与结果 JSON。项目当前无 `.gitignore`、非 git 仓库；纳入版本库前请忽略该目录或删除，避免把测试依赖误当交付物。**该目录须保留至本轮裁决被接收**，内含 43 条断言全证据。
- **A8｜Phase 2 遗留 advisory 仍在**：`generateGender` 与 `record.gender` 依赖同 seed RNG 调用顺序的隐式耦合；`tsconfig.json` 的 `include` 不含 `tests/**/*.ts`（Vitest 走 esbuild 不做类型检查）。二者均不阻断。
- **A9｜源码在测试完成后仍可变更（流程建议）**：本轮出现「E2E 跑完 → 报告写完 → 又有源码提交（15:01 A3 修复）」的时序。项目当前非 git 仓库，QA 只能靠 mtime + 产物内容哈希发现证据漂移。建议纳入版本库并在放行前冻结一次 commit hash，把「证据 ↔ 产物哈希 ↔ commit」三者绑定，避免下一轮再次出现旧证据冒充当前结论。本轮已通过 §3.3 全量重跑闭环。

---

## 9. 测试完整性反作弊门（P0 门禁）

| # | 检测项 | 结果 | 详情 |
|---|--------|------|------|
| 1 | 测试文件/用例被删 | ✅ | 无删除；本轮新增 `tests/unit/frontend-p0-loop.test.ts`（前端产出，QA 已复核为真实断言）；回归集 3 文件、契约 2 文件、单元 6 文件、合规 1 文件全部保留 |
| 2 | 断言数下降 | ✅ | 264+ 处 `expect(` 只增不减；Phase 2 唯一 oracle 改动为收紧（HTML 全串锚定），期望值未变 |
| 3 | 新增 skip/xfail/.only | ✅ | `numPendingTests=0`、`numTodoTests=0`；代码中的条件 `it.skip` 为 Phase 2 已登记发现机制，当前全部解析为 `ready` |
| 4 | 断言硬编码实现自己的输出 | ✅ | 身份证/号段/日期由 `tests/helpers/legality.ts` 独立 oracle 判定；`ac4` 回归额外断言「回退值不可能命中 pattern」防自证；E2E 的 GB11643 oracle 亦为独立实现 |
| 5 | 框架配置篡改 | ✅ | `vitest.config.ts` 未改；根 `package.json` 的 `test` / `test:watch` 由 team-lead 合并（mtime 14:27:18），QA 未写；`pnpm-lock.yaml` mtime 12:35:45 未变 |
| 6 | E2E 假绿 | ✅ | 43 条断言每条记录 expected/actual/evidence；多轮干净 profile 复跑一致；失败过的 3 条（E2E-06 / E2E-08 / E2E-12）均先取精确证据再判定为「断言/环境设定问题」或「文档口径冲突」，**没有通过删断言换绿**；新增 E2E-08c 为修复前后可区分的行为判别器 |
| 7 | 证据与产物一致性 | ✅ | 检测到 E2E 后 `App.vue` 被修改、chunk 名由 `popup-Di5oKzOe.js` 变为 `popup-CsfsZAHo.js` 后，**未复用旧证据**，按当前产物全量重跑 43 条并新增 A3 判别断言；结果文件时间戳 15:15 与产物哈希一致（§3.3） |

---

## 10. 改动影响分析（Phase 4）

### 本次改动范围
- 前端 #17 完成交付：补齐 `IoStatsTab.vue`、新增 `scripts/*.mjs` 三条门禁脚本、新增 `tests/unit/frontend-p0-loop.test.ts`、根 `package.json` 合并 `test`/`test:watch`。
- 前端后续修复：**15:01:07 `entrypoints/popup/App.vue` A3（过滤 `_execute_action`）** —— 发生在首轮 E2E 与 v1.0 报告之后，是本轮 §3.3 全量重跑的直接原因。
- QA 本轮只新增：`.e2e-tmp/`（执行器 + 结果 + E2E-08c）、`docs/QA-PHASE4-REPORT.md`（v1.1）。未改任何业务实现。

### 下游影响面
- 高风险旧行为：白名单授权（`site-guard.ts`）→ 实机 E2E-06/06b/06c 回归通过；受控赋值与三层回读 → 实机 15 项全写入且无红框、React 页 payload 非空；`FillReport` 计数 → 实机分组可账。
- 中风险：undo、valueFormat、popup 降级（含 A3 修复后的正反两向实机验证）、Shadow DOM 注入 → 均有实机断言。
- 低风险：诊断计数分键、结果面板分组 → 实机读取 `faf.counters.v1` / `faf.lastResult.v1` 验证。
- 共享状态：`chrome.storage.local` 的 `faf.siteAllowlist.v1` / `faf.lastResult.v1` / `faf.counters.v1` / `faf.lastPlan.v1`，实机均无外发、无计数混入导出。

### 回归率
**0** —— 105 单测（含 3 份持久回归集）+ 43 E2E（含 A3 修复后重跑）全部由红转绿后保持绿，无旧行为由绿转红。

---

## 11. 失效模式核对（6 类）

| 失效模式 | 结果 | 证据 |
|----------|------|------|
| Happy-path 偏差 | ✅ 已覆盖 | E2E-03b/03c 预览零写入、E2E-04j 失焦无红框、E2E-06c 强制点击仍不写入 |
| 沉默逻辑错误 | ✅ 已覆盖 | `TC-FILL-04` 三层逐层失败映射、E2E-12 报告可账、A1 主动发现文档口径不一致、A3 修复的行为判别断言 |
| 幻觉依赖接口 | ✅ 已覆盖 | `check-contracts` 六份契约字节一致；`import.meta.glob` 按导出名发现，源码存在但导出缺失即显式失败 |
| 缺失系统上下文 | ✅ 已覆盖 | 真实 MV3 扩展 + `activeTab` + `scripting.executeScript` + ISOLATED world Shadow DOM 实机（非 jsdom 模拟） |
| 性能盲区 | ⚠️ 部分 | 21 控件无卡顿；100 字段 / Lighthouse / k6 未执行（T3） |
| 静默缺失 | ✅ 已覆盖 | `probeInjected` / 命令降级 / popup 纯文本提示实机验证；G12-10 已判定 N/A 并留档 |

---

## 12. 上线建议

> **【有条件通过】允许在「白名单内测试环境」发布 v1 试用；【不通过】商业生产交付。**

**支持上线的证据**
1. **P0 缺陷 = 0**（QA-B01 修复+5 向量回归+实机拒绝；G01/G02/G03 全部关闭）。
2. **三条一票否决硬指标实机全部为 0**：误填 0 / 自动提交 0 / 外发请求 0。
3. `105` 单测 + `43` 实机 E2E 全绿，`0 failed / 0 pending`；`check-contracts` / `check-guard` / `tsc --strict` / `pnpm build` 全部 exit 0（15:08 在当前源码上复跑）。
4. SPEC §12 的 6 项必测全部实机覆盖，且额外覆盖 undo、React 受控 payload、valueFormat、刷新后需再次手势、报告可账、隔离性。
5. 反作弊门 7 项全通过，回归率 0。
6. 检测到 E2E 完成后源码仍有改动（A3 修复）时，主动按当前产物重跑 E2E 并新增行为判别断言，**未用旧证据冒充当前结论**（§3.3）。

**不放行商业生产的理由**
1. 生产就绪总档 **Bronze**（记分卡规则：总档取最低；商业级最低线 Silver）。短板为无障碍未评、性能 Bronze、发布安全 Bronze。
2. `G18-09` 被 ARCH §18 明确标为 **P0 必过**的兼容性矩阵（Vue3 + AntD Vue 4.2.6 / Element Plus 2.14.8 / Vue2 / 真实 React）**未实机执行**——是验证缺口，不能当作通过。
3. 5 条门禁未执行、9 条部分通过（§6），其中 portal 下拉、联动超时、拾取器边界、非原生 undo 属于核心组件库适配面。
4. 实机浏览器为 Edge 157，品牌 Chrome 156 因 `--load-extension` 移除未能实机（§3.1 降级说明），需补 Chrome for Testing 复核。

**放行条件（进入商业生产前必须完成）**：§8.2 的 T1~T5 全部闭环，并把总档提升到 **Silver 及以上**后重新出具 Phase 4 裁决。

> **P0 缺陷不归零，不上线。没有例外。** 本轮 P0 已归零，但商业生产还差 Silver 门槛——不把「测试环境能用」说成「商业级可交付」。

---

## 13. 产物清单（可寻址）

| 产物 | 路径 |
|------|------|
| 本质量报告（v1.1） | `D:/myTools/form-auto-filler/docs/QA-PHASE4-REPORT.md` |
| Phase 2 测试计划（v1.1） | `D:/myTools/form-auto-filler/docs/QA-TEST-PLAN.md` |
| E2E 执行器（含 E2E-08c A3 行为判别断言） | `D:/myTools/form-auto-filler/.e2e-tmp/e2e.mjs` |
| E2E 机器可读结果（43 条断言全证据，`timestamp=2026-11-09T07:15:34.435Z`） | `D:/myTools/form-auto-filler/.e2e-tmp/e2e-result.json` |
| 环境探测记录（Chrome 受限 / Edge 可用 / 手势路径） | `.e2e-tmp/probe.mjs`、`probe2.mjs`、`trigger-probe.mjs` |
| 独立 E2E 依赖清单 | `.e2e-tmp/package.json`（`playwright-core@1.65.0`，无浏览器下载） |
| 构建产物 | `D:/myTools/form-auto-filler/.output/chrome-mv3/`（13 文件 / 323.11 kB / `popup-CsfsZAHo.js`） |
| 单元 / 契约 / 合规 / 回归测试 | `D:/myTools/form-auto-filler/tests/`（13 文件 / 105 例） |

复现命令：

```bash
cd D:/myTools/form-auto-filler
node scripts/check-contracts.mjs && node scripts/check-guard.mjs
pnpm exec tsc --noEmit --strict && pnpm exec vitest run && pnpm build
cd .e2e-tmp && node e2e.mjs      # Edge 157 + --headless=new，结果写 e2e-result.json（43 条）
```

---

## 14. 增量变更留痕：本地开发白名单输入归一化（2026-11-09 15:38，项目总监追加）

**背景**：用户询问「站点白名单安全区」语义及本地项目 `localhost:9003` 如何配置。核查发现真实缺陷——`AllowlistPanel.vue` 原输入校验正则强制至少一个点，`localhost` 与完整本地地址均无法通过界面添加；QA 的 E2E 是绕过 UI 直接写 `chrome.storage.local` 才配上 `localhost`。

**变更范围（4 改 1 增，均为输入层，不改契约与安全模型）**

| 文件 | 变更 |
|------|------|
| `src/config/site-allowlist.ts` | 新增 `normalizeSiteInput()`（粘贴完整地址 -> 提取 hostname、端口丢弃、允许无点主机名与回环地址、glob 仅允许前导 `*.`、拒绝 userinfo / 非 http(s) 协议 / 全站通配 `*`）；新增 `addLocalDevSites()` 一键写入 `localhost` / `127.0.0.1` / `[::1]`；`addSite()` 改走归一化 |
| `entrypoints/options/components/AllowlistPanel.vue` | 校验改用 `normalizeSiteInput`；新增「添加本机地址」按钮；补「按域名匹配、端口无关、可粘贴完整地址」说明 |
| `entrypoints/options/App.vue` | 安全区说明补本地项目配置指引 |
| `tests/unit/site-allowlist.test.ts` | 新增 9 例：URL 归一化、无点主机名、glob 限制、危险输入拒绝、写入路径、一键添加幂等、AC-6 不削弱（空白名单仍全拒绝、本机条目不外溢到不可信域名） |

**未改**：`site-guard.ts` 授权逻辑、`SiteGuard` 契约、AC-6、三条硬指标、26 条门禁定义、QA 43 条 E2E 断言集。零外发门禁 `TC-GATE-12` 曾命中源码里的 `http://` 示例字面，处理方式是**改文案与把 URL 解析前缀拆写**，未削弱门禁规则本身。

**复跑证据（当前源码 / 当前产物，全部实跑）**

| 命令 | 结果 |
|------|------|
| `pnpm exec tsc --noEmit --strict` | exit 0 |
| `node scripts/check-contracts.mjs` | `CONTRACTS PASS: 6 mirrored files are byte-identical` |
| `node scripts/check-guard.mjs` | `GUARD PASS: 120 source files, zero blocked patterns` |
| `pnpm exec vitest run` | `Test Files 14 passed (14)` / `Tests 114 passed (114)`（原 105 + 新增 9） |
| `pnpm build` | exit 0，`Σ Total size: 324.76 kB`，`chunks/options-CtYacatK.js` |
| `cd .e2e-tmp && node e2e.mjs` | `SUMMARY: total=43 passed=43 failed=0`；请求日志实测 `options-CtYacatK.js`，与当前产物一致 |
| `cd .e2e-tmp && node probe-local-dev.mjs` | `SUMMARY: total=4 passed=4 failed=0`（9003 端口实机） |

**新增实机探测 4 条**（`.e2e-tmp/probe-local-dev.mjs` / `local-dev-probe.json`，独立 profile，不改 QA 原 43 条证据文件）：一键按钮写入 3 个回环域名、粘贴 `localhost:9003/form?x=1` 完整地址归一为 `localhost`、9003 端口页面预览 2 行且确认按钮可用且零写入、预览阶段零自动提交。三条一票否决硬指标在 43 条 E2E 中复测仍全为 0。

**结论**：本次变更不影响 §12 的「有条件通过 / 不通过商业生产」裁决；生产就绪总档仍为 Bronze，T1~T5 尾项不变。证据与产物哈希已按 §3.3 规矩同步刷新。

