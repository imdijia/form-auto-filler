# Spec - 表单自动填充工具 v1（初版）

> 生成日期：2026-11-09
> 基于：PRD-v1.1 + ARCH-v1 v1.1 + UIUX-v1 v1.1 + 方案评估 v0.4
> 状态：**已锁定**。权限模型按 A（activeTab）默认推进；用户改选 B 时按第 13 节变更。
> 本文件是开发、测试、验收的唯一依据。与三文档冲突时以本文件为准。

---

## 1. 产品定义

- 一句话：Chrome/Edge MV3 扩展，在内部政务/OA 测试页面一键把任意未见过的表单填入合法中文假数据。
- 目标用户：内部系统前端开发者兼自测者，以及同团队 QA/实施人员。
- 核心问题：不同页面、不同表单、字段各不相同且输入框多，无法为任一表单预建字段清单；手输慢且易触发即时校验。

## 2. MVP 范围（锁定，不在此列的一律不做）

| 编号 | 能力 | 验收摘要 |
|------|------|----------|
| A1 | L1 全量控件扫描 | 不预设数量位置；过滤 hidden/disabled/readonly/file/password/captcha；限定最近表单容器；含同源 iframe |
| A2 | L2 中文优先字段类型推断 | 20 类 + unknown 哨兵；别名/加权打分/正则特征/页面 option 枚举；置信度 < 0.6 不硬猜 |
| B1 | 20 类合法假数据生成器 | 身份证 GB11643 校验位、11 位号段、日期与性别和证件位一致、枚举取页面 option |
| B2 | 固定种子可复现 | 同种子同页面数据集完全一致 |
| C1 | 受控赋值引擎 + 组件库最小适配 | 6 个 P0 内建策略；原生 setter + 冒泡 input/change；赋值后三层回读 |
| C2 | 一键填充 + 填充计划预览 | 默认只填不提交；预览可逐项勾选跳过 |
| C3 | 安全护栏 | 站点白名单 + 环境标识 + 只填不提交 + 零外发 + 权限最小化 |
| P1（同属 v1，顺序靠后） | A3 可视化拾取器 / A4 页面指纹规则库 / C4 诊断报告 / C5 动态联动与分批调度 | 推断错可点选改绑；规则只存增量；成功/跳过/失败可定位 |

## 3. 明确不做（锁定）

| 不做 | 原因 |
|------|------|
| 预设固定值（姓名、身份证等） | 初版范围；已预留 `DataProvider` 与 `presets` schema，v1.1 加 |
| Excel/CSV 导入指定数据 | v1.2 `CsvProvider` |
| 自动提交 / 批量连续造数 | 政务系统误提交不可逆；保留开关位，UI 不暴露 |
| 跨页面会话 / 多步骤连续录入 | 初版先把单页闭环做扎实 |
| 组件实例精准填充 | MV3 ISOLATED world 不共享 expando；降为 P3 页面主动暴露 SDK 钩子 |
| 团队共享后端 / 云同步 / 账号 | 无后端形态；政务内网数据不出本机 |
| 为单个表单建全量字段映射表 | 与「字段每页不同」根本冲突，永久不做 |
| 验证码/滑块、文件上传、电子签名、富文本复杂内容、绕过登录、生产环境写入 | 非填充问题且涉合规，永久不做 |
| cascader、远程搜索 select、跨源 iframe | v1 返回 `E_UNSUPPORTED_CONTROL`，诊断报告一键重新拾取 |
| 100% 全自动准确率承诺 | 目标零配置可用率 70-80% |

## 4. 技术架构（锁定，版本锚定）

| 层 | 技术 | 版本 |
|----|------|------|
| 扩展框架 | WXT | 0.21.5 |
| 前端 | Vue | 3.5.45 |
| 语言 | TypeScript | 5.9.3（不升 7.x） |
| 构建 | Vite | 8.3.6 |
| 包管理 | pnpm | 10.2.1 |
| 图标 | `@lucide/vue` | 1.70.0（唯一 SVG 来源，ISC，离线内联） |

禁止入依赖：`lucide-vue-next`（npm 已 deprecated）。本机实测 node v22.22.2 / pnpm 10.2.1；版本为设计约束，实现前用 `pnpm view <pkg> version` 复核。
页面侧锚点 `ant-design-vue 4.2.6` / `element-plus 2.14.8` 等是**宿主页测试矩阵目标**，不是扩展 npm 依赖。
权限白名单 `["activeTab", "scripting", "storage"]`，无 `host_permissions`，`minimum_chrome_version = 120`；4 条 commands F/G/H/P。

## 5. 模块契约（锁定）

依赖单向：`interfaces -> field -> rules -> types`。`FieldDescriptor` 是纯数据可 JSON 序列化（不含 HTMLElement/函数/Map），`FieldHandle` 只在 content script 内存活。`FieldDescriptor` 必带 `ContainerInfo` / `inFormScope` / `hasValue` / `controlType`。

六组接口：`FieldDetector` / `DataProvider` / `Filler` / `RuleStore` / `FillPlanner` / `FillExecutor`，另 `SiteGuard` / `BridgePort`（v1 不启用 MAIN world）。

- `DataProvider.getValue(field, ctx)` 只依赖 `FieldDescriptor + FillContext`；v1 仅 `RandomProvider`，后续 `PresetProvider` / `CsvProvider` / `CompositeProvider` 只需新增一个文件 + 注册，不改识别/填充/执行三层。
- 6 个 P0 内建策略在入口装配期无条件注册，Filler 构造期缺一即抛错；`register()` 仅对 P2+ 开放：`native-input` / `native-select` / `ant-design-vue-select` / `ant-design-vue-date-picker` / `element-plus-select` / `element-plus-date-picker`。
- `FillResult.verified` 三层回读：`domValueMatched` / `frameworkStateMatched` / `validationCleared`，任一失败 `status='failed'` + `E_READBACK_MISMATCH` + `failureReason` 写明失败层。**事件已派发不算成功**。
- `MutationWaiter`（MutationObserver + predicate + AbortSignal + 3000ms 兜底）替代固定 `setTimeout` 判断联动稳定；`setTimeout` 仅作 `requestIdleCallback` 分批回退。
- 联动等待、portal 级选项查找（不假设选项在触发器子树内）、`valueFormat` 协商为适配器强制约束。

## 6. 数据结构（锁定）

**20 类字段类型**唯一权威：`docs/contracts/field-types.json`（slug + 中文名 + 生成器 id），`unknown` 是哨兵不是生成器目标。身份一致性组 `identity = { idCard, date, gender, personName }`：身份证 7-14 位匹配日期、第 17 位奇偶匹配性别、同种子属同一条记录。

**三阈值**（权威在 `docs/contracts/types.ts#LIMITS` 与 `rules.schema.json#weights`）：`CONFIDENCE_THRESHOLD 0.6` / `VIRTUAL_SCROLL_THRESHOLD 100` / `MAX_FIELDS_PER_PAGE 200`。`field-types.json` 的 `confidenceThresholdDefault` 只是镜像，非权威。

**规则库**：`global / site / page` 三级，按 `URL 模式 + 归一化结构 hash` 归档，**只存增量修正**（拾取器改绑）；`FieldLocator` 禁用 CSS/XPath 作主键；规则内禁可执行代码；结构 hash 漂移提示重校验，不静默沿用。JSON 可导入导出，导出不含诊断计数。

**`presets` schema 预留**（初版写入 schema、UI 置灰不暴露）：`presets.global / bySite / byPage`，空值回落 RandomProvider。含身份证等敏感值，不上传、不写日志。

## 7. 页面清单（锁定，只有 5 处）

| 界面 | 形态 | 核心职责 |
|------|------|----------|
| 悬浮球 / 快捷键 | content script，Shadow DOM | 单击只打开填充计划预览，**绝不直接填充**；非白名单域名禁用态纯文本提示 |
| 填充计划预览 | 页内右侧抽屉 | 三列映射表「页面控件 / 推断字段类型 / 将填入的值」+ 控件类型纯文本标签 + 逐项勾选跳过 + 跳过原因枚举 |
| popup | 360x560 | 选数据集与种子、打开计划、看上次成功/跳过/失败明细 |
| options | 4 Tab | 别名词典 / 生成器 / 页面规则 / 导入导出与本地统计；顶部站点白名单安全区；预设值区置灰预留 |
| 可视化拾取器 | 顶部常驻工具条 | hover 低饱和深蓝描边、就近 tooltip、点选绑定字段类型、Esc 退出、Ctrl+Z 撤销，改绑 <= 3 次点击 |

诊断报告**不新增第 6 个界面**，作为状态载体并入填充计划结果态与 popup 明细；保留 3 个验收点：超范围控件单列 `E_UNSUPPORTED_CONTROL`、`unknown` 可点选绑定、失败一键定位到元素。

## 8. 设计 Token（锁定）

- 主色 `--accent #1D4E89`，`--brand-ink #163A66`，`--bg #F5F7FA`，`--surface #FFFFFF`；语义色 `success #1F7A4D` / `warn #9A6B12` / `danger #B3261E`，均为低饱和。hex 只出现在 `:root`。
- 字体：Noto Sans SC + Source Sans 3/Lexend + JetBrains Mono（slug、种子、kbd）。**注入层不加载任何外部字体**，固定扩展自身主题、不跟随宿主页，Shadow DOM 隔离。
- 图标：`@lucide/vue@1.70.0` 单一库，16/20/24px，stroke 1.75，离线内联，禁 emoji 作功能图标。
- 状态标签**只用纯文本 + 语义色 + 字重 510**，零图标、零色块、零胶囊。控件类型标签 `输入框 / 下拉 / 日期 / 文本域 / 其他` 同样纯文本、不用颜色区分。
- 组件前缀 `f-`；动效 <= 200ms，`cubic-bezier(0.2, 0, 0, 1)`，禁弹跳缓动。
- 主按钮文案禁令：预览 / 结果 / popup 三处主按钮不得出现「提交 / 确定 / 保存并提交」；常驻「仅填入，不提交」。

## 9. 验收标准（锁定，QA 唯一依据）

沿用 PRD-v1.1 的 AC-1 ~ AC-8（EARS 格式），补三条硬判据：

- AC-3 等价实现：ISOLATED world **读不到 Vue/React state 对象**，以「三层可观测证据 + 两渲染帧回滚检测」作为「回读校验值与校验态已生效」的等价实现；禁止按字面「读取组件内部 state 对象」验收，禁止把「事件已派发」当成功。
- 零配置可用率分母只算 v1 适配范围内且可填的控件；超范围控件按 `E_UNSUPPORTED_CONTROL` 单列，不计入 70-80% 目标。
- 安全硬指标：误填次数 = 0、自动提交次数 = 0、外发请求数 = 0。

## 10. 边界与约束

- 仅 Chrome/Edge Chromium 120+；断网可用；不污染页面全局对象、不刷控制台、扩展异常不阻塞被测页。
- 性能：20-50 控件从触发到完成 <= 3s，单控件赋值 <= 50ms；分批 + `requestIdleCallback` 让出主线程。
- 首次填充需用户手势（快捷键/悬浮球/action），**页面刷新后需再次触发**；悬浮球不是打开页面即常驻。
- `chrome.storage.local` 是隔离存储不是加密存储：不上传、不写日志、导出可脱敏、默认不提交，**不宣称加密存储**。
- 零外发：禁 fetch / XHR / WebSocket / EventSource / sendBeacon / 远程字体 / 统计 SDK / 远端规则库；诊断计数只落 `faf.counters.v1`，与配置/结果严格分键，`exportJson()` 不含计数。
- undo：填充前快照原值、内存会话不落盘；恢复复用 Filler 的 ISOLATED world DOM 通道 + 同一 P0 适配器反向恢复，**不依赖组件实例**；页面跳转后快照失效，按钮置灰说明。

## 11. 内嵌已知坑（锁定）

| 坑 | 修法 |
|----|------|
| 裸 `el.value = x` 不更新受控状态 | 原生 prototype setter + 冒泡 input/change + 回读校验 |
| 「脚本报绿、业务没生效」 | `verified` 三层回读，失败 `E_READBACK_MISMATCH` 并定位 |
| AntD Select/DatePicker 是 body 级 portal | portal 级选项查找；日期按 `valueFormat`；不假设选项在触发器子树内 |
| 固定 `setTimeout` 判断联动稳定 | `MutationWaiter` |
| 中文假数据库给固话/无身份证生成器 | 自建 20 类生成器，中文姓名/地址/单位，GB11643 校验位 |
| 每页配置一份规则 / 选择器改版失效 | 零配置推断 + 页面指纹只存增量 + 结构 hash 漂移提示 |
| 误填搜索框/筛选框 | 表单容器作用域 + `inFormScope` + 预览显式排除 + 保护已有值 |
| 集中派发事件卡死页面 | 分批 + 让出主线程 |
| 申请宽泛权限引发安装警告 | `activeTab` 最小权限；若改 B 必须显式列测试域名，禁 `<all_urls>` |

## 12. 端到端验证步骤

1. `pnpm install` -> `pnpm --package=typescript@5.9.3 dlx tsc --noEmit --strict` -> `pnpm build` 全部通过。
2. Chrome/Edge 载入 `dist/` 未打包扩展，安装期断言**无宽泛权限警告**；options 里把一个 test/uat 域名加入白名单。
3. 打开从未配置过的表单弹窗（中文 label、原生 input、Ant Design Vue 或 Element Plus 的 select 与 date-picker、textarea、表单容器外搜索框），记录填充前控件数。
4. 按快捷键 -> 断言出现填充计划预览、此时无任何值变化、提交按钮未被点击（AC-1/2）。
5. 确认计划 -> 断言值全部写入、失焦即时校验无红框、提交按钮仍未点击；逐项核对身份证校验位、号段、日期与性别一致、枚举命中 option；同种子重复结果一致（AC-2/3/4）。
6. 错误流：域名移出白名单 -> 拒绝填充并提示（AC-6）；无可填控件页 -> 空状态；改绑一个字段类型 -> 只增一条页面级增量规则（AC-8）。
7. 联动/改版流：触发联动下拉 -> 新增字段在稳定后被填且页面不卡顿（AC-7）；增删控件改变结构 hash -> 提示「规则可能失效」，不静默沿用（AC-5）。
8. 完成判定：AC-1~8 全通过 + 误填 0 + 自动提交 0 + 外发请求 0 + 失败项可一键定位到元素。

## 13. 裁决与变更记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-11-09 | 形态 A 浏览器扩展 MV3 | 不改业务代码、跨页面复用、表单越多边际成本越低 |
| 2026-11-09 | 不做字段级硬编码，改通用字段类型推断 | 用户明确不同页面不同表单字段 |
| 2026-11-09 | 初版不做预设字段信息，但预留 `DataProvider` / `presets` | 用户明确后续可能加固定姓名、身份证 |
| 2026-11-09 | 组件实例通道作废，主路径固定 ISOLATED world DOM | MV3 不共享 expando；Vue3 生产构建不暴露私有字段 |
| 2026-11-09 | 组件库最小适配从 P2 上提 P0 | 政务表单主体是非原生控件，初版不支持即不可用 |
| 2026-11-09 | 接受三层可观测证据 + 两帧回滚检测为回读等价实现 | ISOLATED world 无法字面读取框架 state 对象 |
| 2026-11-09 | 图标库硬锁 Lucide / `@lucide/vue@1.70.0` | 三文档归一；`lucide-vue-next` 已 deprecated |
| 2026-11-09 | 禁止宣称「加密存储」 | `chrome.storage.local` 是隔离存储 |
| 2026-11-09 | 权限模型按 A（activeTab）默认推进 | 用户未反对；B 需改架构 5 处且禁 `<all_urls>` |

若用户改选 B，须定点修订：ARCH §2.6 manifest、§5.3 注入策略、ADR-002 决策四、§15.2/15.4 权限门禁、§16.2 首次唤起步；PRD 第 1/7/9/14 节；两边同步后再更新本 Spec。
