# 表单自动填充工具 - 技术架构 v1

> 状态：Phase 1 技术可行性与架构设计定稿（v1.1：已并入 team-lead 三项裁决、PM PRD-v1.1 与设计师 UIUX-v1.1 约束），待用户确认三文档后进入 Spec
> 日期：2026-11-09（v1.0 定稿） / 2026-11-09（v1.1 修订）
> 作者：高见远（首席架构师）
> 上游依据：`方案评估-表单自动填充工具.md` v0.3（3.1 / 3.2 / 6.1 节）
> 本轮范围：只做调研与架构设计，不写业务代码。本文件及 `docs/contracts/` 下文件均为契约声明，不是实现。

---

## 0. 结论摘要

1. **ISOLATED world 的 content script 读不到页面 Vue 组件实例**。`el.__vue__` / `el.__vueParentComponent` 一律 `undefined`。这是 MV3 的 DOM expando 隔离，不是配置问题，也不能通过加权限绕过。跨 world 共享的只有 DOM 结构、标准属性、`dataset`、DOM 事件、`window.postMessage`。
2. **`chrome.scripting.executeScript({ world: 'MAIN', files: [...] })` 可行**，Chrome 95+ 支持，需 `scripting` 权限 + `host_permissions` 或 `activeTab`。但 MAIN world 脚本**没有扩展 API**，必须经 `window.postMessage` -> ISOLATED world -> `chrome.runtime` 回传；且 MAIN world 受**页面 CSP** 约束，注入必须用打包好的静态文件，禁止内联脚本与 `eval`。
3. **Vue 3 生产构建默认不暴露 `__vueParentComponent`**（`__VUE_PROD_DEVTOOLS__` 默认 false）。叠加第 1 条，基线方案 6.1 里「Vue2 补 `el.__vue__`、Vue3 取 `__vueParentComponent`」这条精准填充通道在本形态下**双重不可行**，必须从 v1 主路径移除，降级为 P3 可选 SDK 钩子。
4. **填充主路径不需要 MAIN world**。原生 prototype setter + 派发 `input`/`change` 在 ISOLATED world 就能完成，且 ISOLATED world 的 `HTMLInputElement.prototype` 未被页面框架 patch，天然是干净原生 setter（见 2.5）。这大幅压低 v1 复杂度和权限申请。
5. **技术选型（规则 + 我选定的方案）**：在满足第 3 章 8 条可判定规则的候选中，我选定 **WXT 0.21.5 + Vue 3.5.45 + TypeScript 5.9.3 + Vite 8.3.6 + pnpm 10.2.1**；图标库按团队裁决正式锁定 **`@lucide/vue@1.70.0`**（唯一 SVG 图标来源，离线内联、不走 CDN，详见 3.4）。
6. **阻塞级警告**：`lucide-vue-next@1.0.0` 已被 npm 标记 deprecated，不能作为图标依赖；跨源 iframe、Ant Design Vue / Element Plus 的**完整**非原生控件适配、生产构建组件实例通道，均不可按「通用能力」承诺，见第 10 章。
7. **v1.1 裁决已落地（第 14-18 章优先于正文冲突表述）**：组件库 select / date-picker 最小适配集是 **P0 内建策略**，不是可插拔补丁；`FillResult.verified` 采用三层状态回读，未生效判失败（`E_READBACK_MISMATCH`）；联动判定改用 `MutationWaiter`，禁固定 `setTimeout`；架构中不存在任何外发 / 埋点 / 遥测模块。
8. **公共契约与阈值**：20 类字段类型以 `docs/contracts/field-types.json` 为唯一权威枚举；`CONFIDENCE_THRESHOLD = 0.6`（正式锁定）、`VIRTUAL_SCROLL_THRESHOLD = 100`、`MAX_FIELDS_PER_PAGE = 200`；`FieldDescriptor` 携带容器信息与 `inFormScope`，L1 显式排除表单容器外控件。

---

## 1. 证据基线与方法

### 1.1 本轮输入

| 输入 | 用途 |
|---|---|
| `方案评估-表单自动填充工具.md` v0.3 | 形态已锁定 A（Chrome/Edge MV3）、无后端、三层识别、DataProvider 预留 |
| `references/01-standards/spec-as-contract.md` | 版本锚定、out-of-scope、内嵌坑、端到端验证收尾 |
| `references/01-standards/context-engineering.md` | 证据即时检索、保留指针而非全文 |
| `references/01-standards/generated-code-failure-modes.md` | 依赖/接口存在性核验，防幻觉依赖 |
| `references/01-standards/code-organization.md` | 分层依赖、单文件 <= 300 行、入口只装配 |
| `references/architecture/mvp-stack.md` | 选型权重：学习成本/生态/部署成本/团队熟悉度优先 |
| `references/cost-models/development-costs.md` | 规模估算（桌面工具类 4-6 周、2-3 人月） |

### 1.2 联网核实方式

- 以 `developer.chrome.com` 官方文档为一级证据，`wxt.dev` 官方文档为二级，npm registry 原始 JSON 为版本事实，社区实测/源码片段为三级。
- `WebFetch` 直连 `developer.chrome.com` 三次均返回 `fetch failed`；官方段落改由 `WebSearch` 限定 `allowed_domains: developer.chrome.com` 取得原文。凡引用官方措辞处，附录 A 标注了原文来源与取得方式，不把检索摘要当成亲读全文。
- 版本一律取 `https://registry.npmjs.org/<pkg>/latest` 原始 JSON 的 `version` 字段，未凭印象填写。
- 本机工具链经 Bash 实测：目录内只有方案 md，无 `package.json`、无 `node_modules`；`node v22.22.2`、`pnpm 10.2.1`。

**证据等级标记**：`A` 官方文档原文 / `B` 官方 API 字段或源码片段、社区一致实测 / `C` 单一社区实践，需实现时复核。

---

## 2. MV3 真实约束核实（本轮第一优先级）

### 2.1 content script 能否读取页面 Vue 组件实例：不能

**结论：不能，且不可绕过（不改架构的话）。**

官方 content scripts 文档原文：content scripts 运行在 isolated world，「JavaScript variables in an extension's content scripts are not visible to the host page」，且「none of these (web page, content scripts, and any running extensions) can access the context and variables of the others」。DOM 是共享的，但页面 JS 挂在 DOM 元素上的 expando 属性属于页面 world 的 JS wrapper，不共享给 ISOLATED world。[A]

独立佐证：Chrome 扩展安全研究论文明确「content scripts cannot ... see, modify, or execute any custom properties or functions (so-called expando properties) on DOM elements」；StackOverflow 上 `elem.foo = 1` 在 content script 中读为 `undefined` 是标准现象。[B]

**跨 world 可见性矩阵（实现时按此表写，不要凭直觉）**

| 数据形态 | ISOLATED world 可见 | 说明 |
|---|---|---|
| DOM 结构、`id`/`class`/标准属性 | 可见 | `querySelector` 正常工作 |
| `data-*` 属性 / `dataset` | 可见 | 需要跨 world 传少量数据时用这个，不用 expando |
| DOM 事件 | 可见 | 双方监听器都能收到同一事件 |
| `window.postMessage` / `CustomEvent` | 可见 | 官方推荐的通信通道 |
| 页面 `window.xxx` 全局变量 | 不可见 | 例：`window.Vue`、`window.__VUE_DEVTOOLS_GLOBAL_HOOK__` |
| `el.__vue__` / `el.__vueParentComponent` / `el.__reactProps$xxx` | 不可见 | expando，一律 `undefined` |
| 页面 patch 过的 `HTMLInputElement.prototype` | 不可见 | ISOLATED world 有自己的原型 wrapper，见 2.5 |

**对产品的直接影响**：L1/L2 只能基于 DOM 文本与属性做推断，不能靠「问组件实例」拿字段名。`el.__vue__` 不可作为任何 v1 契约的一部分。

### 2.2 MAIN world 注入：可行，但有四个硬条件

**可行性结论 [A]**

| 项 | 结论 |
|---|---|
| API | `chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page-bridge.js'] })` |
| 最低版本 | `ExecutionWorld` 枚举与 `ScriptInjection.world` 均为 **Chrome 95+**；`RegisteredContentScript.world`（动态注册）为 **Chrome 102+**；`injectImmediately` 为 Chrome 102+。`chrome.scripting` API 本身 Chrome 88+ |
| 枚举值 | `"ISOLATED"`（默认）/ `"MAIN"` |
| 权限 | `permissions: ["scripting"]` **加上** `host_permissions`，或 `activeTab` 提供的临时主机权限。官方原文：「declare the "scripting" permission in the manifest plus the host permissions for the pages to inject scripts into」 |
| 帧 | `target.allFrames: true` 或 `frameIds`；二者不可同时给 |
| 注入内容 | `files`（扩展包内相对路径）或 `func` + `args`（`func` 会被序列化再反序列化，闭包丢失，`args` 必须 JSON 可序列化） |

**硬条件 1：MAIN world 脚本没有扩展 API。** WXT 官方 content scripts 文档原文：「Main world content scripts don't have access to the extension API」。[A] 因此 MAIN world 只做「读页面 JS 上下文」这件事，所有 `chrome.storage` / `chrome.runtime` 调用必须回 ISOLATED world 或 background。

**硬条件 2：通信链路必须是三段式，且要防伪造。**

```
MAIN world (page-bridge.js)
   |  window.postMessage({ channel, requestId, payload }, '*')
   v
ISOLATED world (content script)  <- 校验 event.source === window、channel、requestId
   |  chrome.runtime.sendMessage / port.postMessage
   v
background service worker -> popup / options
```

官方「与嵌入网页的通信」章节给出的范式就是 `window.addEventListener('message', e => { if (e.source !== window) return; if (e.data.type === 'FROM_PAGE') ... })`。[A] 官方 DevTools 扩展文档同时警告「this is not foolproof and the page can easily spoof messages if it wants to」。[A] 因此本项目规定：

- 消息必须带固定 `channel` 常量（如 `FAF_BRIDGE_V1`）与一次性 `requestId`，用 `crypto.randomUUID()` 生成并做待决请求配对；
- 只接受 `event.source === window` 且 `event.data` 为对象、字段白名单内的消息；
- **MAIN world 桥接不得接收任何敏感数据**（身份证、预设值），只回传结构化、可序列化的 DOM/组件元数据；
- `CustomEvent` + `detail` 作为备选通道（structured-cloneable），但页面同样可监听与伪造，安全等级不高于 `postMessage`。

**硬条件 3：MAIN world 受页面 CSP 约束。** 见 2.3。

**硬条件 4：WXT 下推荐的实现形态。** WXT 官方不推荐直接写 `world: 'MAIN'` 的 content script，而推荐 `defineUnlistedScript` 生成 `page-bridge.js` + content script 里 `injectScript('/page-bridge.js', { keepInDom: true })`，并在 `wxt.config.ts` 把该脚本列入 `web_accessible_resources`（`resources` + `matches` 两个字段，MV3 缺一不可）。理由是保留一个「父」content script 在 ISOLATED world，既能用扩展 API 又能双向通信。[A]

### 2.3 CSP：两个 CSP 不要搞混（高频踩坑）

| 执行环境 | 受谁的 CSP 管 | 允许值 / 禁止项 |
|---|---|---|
| ISOLATED world content script、popup、options、service worker | **扩展自己的 CSP** | MV3 `extension_pages` 的 `script-src` / `object-src` / `worker-src` 只允许 `'self'`、`'none'`、`'wasm-unsafe-eval'`（未打包扩展可额外放行 localhost）。禁止 `eval()`、`new Function()`、内联脚本、CDN 远程代码 [A] |
| MAIN world 脚本 | **宿主页面的 CSP** | 官方措辞（经检索引文取得）：「When a content script is injected into the main world, the CSP of the page applies」[B] |

**可判定结论**：

- `chrome.scripting.executeScript({ world: 'MAIN', files: [...] })` 注入的是扩展包内已编译文件，不是字符串求值，可避开 `unsafe-eval` 类限制；社区实测与 WXT 的 `injectScript` 方案都用这条路径。[B]
- `func` 形式注入的是序列化后反序列化的函数，**不等于** `eval('字符串')`，不受 `unsafe-eval` 拦截；但若在 `func` 内部动态创建 `<script>` 并写 `textContent`，属于内联脚本，会被页面 `script-src` 拒绝，报错形如 `Refused to execute inline script because it violates ...`。[B]
- 旧法 `<script src="chrome-extension://<id>/...">` 依赖 `web_accessible_resources`，且页面若不在 `script-src` 放行扩展 origin 仍会被拒。**本项目不采用**。
- **v1 硬约束**：MAIN world 只允许 `files` 注入；禁止内联脚本、`eval`、`new Function`、`setTimeout(string)`；禁止从远端加载规则库中的任何逻辑；规则库只许携带数据（字典、权重、正则字符串），正则一律用 `new RegExp(source)` 从字符串构造，不执行字符串代码。
- **降级**：MAIN world 注入失败或页面 CSP 拒绝时，必须静默回退到 ISOLATED world 的 DOM 主路径，并在诊断报告里记一条 `E_BRIDGE_UNAVAILABLE`，不阻断填充。

### 2.4 Vue 3 生产构建不暴露组件实例（第二重否决）

- Vue 3 的 `__vueParentComponent` 是挂在 DOM 元素上的开发期/devtools 辅助字段，受编译期开关 `__VUE_PROD_DEVTOOLS__` 控制，该开关**默认 false**；Vite 默认已注入该常量为 false。生产包里组件树与实例引用默认不可读，Vue DevTools 本身也会提示「production mode or explicitly disabled」。[B]
- Vue 2 的 `el.__vue__` 写在**组件根元素**上，模板内部的普通 `<input>` 不持有它；需向上遍历祖先且结果随组件库版本、Shadow DOM、异步组件变化，失败率高。[B]
- 这些字段都是**非公开内部实现**，随版本漂移，不能进契约。

**对基线方案 v0.3 的修正**：6.1 节「Vue2 补 `el.__vue__`、Vue3 取 `__vueParentComponent`」与 3.1 节「组件实例桥接」在浏览器扩展形态下不成立。理由叠加为两层：(a) ISOLATED world 读不到；(b) 即便切到 MAIN world，生产构建也默认没有。

**替代方案**：保留 3.1 的「不配字段名只认字段类型」主路径；把「精准通道」改为 P3 的**项目内 SDK 钩子**（自研系统在 dev/test 环境主动挂 `window.__FORM_FILLER__ = { getFields, setValue }`，扩展检测到此钩子优先走它）。这是「页面主动暴露」而非「扩展偷偷读取」，双方都可控，且不依赖框架内部字段。该钩子与当前架构通过 `FillerStrategy` 注册表接入，识别层/执行层零改动。

### 2.5 原生 setter + input/change 事件的真实机制与坑

**机制（为什么 ISOLATED world 反而更适合）** [B]

React 的 `inputValueTracking` 在**元素实例**上用 `Object.defineProperty(node, 'value', { get, set })` 覆盖了 value 属性，`set` 里同步更新内部 `currentValue` tracker。原型的 `value` setter 仍是原生实现。若直接 `el.value = x`，tracker 被同步成 `x`，随后派发的 `input` 事件里 React 比较 tracker 与 DOM 值发现「没变」，`onChange` 不触发，组件 state 不更新。

正确顺序是：**取原型原生 setter 直接 `.call(el, value)`（绕过实例上的 tracker setter，让 tracker 停留在旧值）-> 派发冒泡 `input` -> 派发冒泡 `change` -> 必要时 `focus`/`blur`**。

ISOLATED world 的 `window.HTMLInputElement.prototype` 是它自己的 wrapper 原型，**页面框架的 patch 不会影响它**，所以从 ISOLATED world 取到的就是干净原生 setter，`.call(el, v)` 写入的是同一个底层 DOM 节点。DOM 事件跨 world 共享，页面 world 的监听器能收到 `dispatchEvent` 派发的事件。这两点合起来，意味着**填充主路径完全不需要 MAIN world 注入**。

**统一填充原语（v1 契约）**

```
setNativeValue(el, value):
  proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement    ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, String(value))
  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
```

**已知坑清单（写进 Spec，内嵌而非事后补）**

| # | 坑 | 表现 | 处置 |
|---|---|---|---|
| 1 | `textarea` 用错原型 | 用 `HTMLInputElement.prototype` 的 setter 调用 textarea 抛错 | 按 `tagName` 选原型 |
| 2 | checkbox / radio | 设 `value` 无效，必须改 `checked` | 用 `el.click()`，不要直接赋值 |
| 3 | 事件不冒泡 | React/Vue 在根节点委托，非冒泡事件收不到 | 一律 `bubbles: true` |
| 4 | `isTrusted === false` | 个别业务风控/自定义校验忽略合成事件 | 诊断报告标记；无可通用解法，只能人工复核 |
| 5 | Vue 2 `v-model.lazy` | 只监听 `change`，不监听 `input` | 两个事件都派发 |
| 6 | Vue 3 `v-model` 修饰符 `.number` / `.trim` | 生成值类型不符会被拒绝 | 生成前读 `type` / `pattern` / `maxlength` 约束 |
| 7 | React `number` 输入 | 中间态字符串会被 coercion 拒绝 | 一次写入完整值，不逐字符模拟 |
| 8 | `maxlength` 截断 | 生成值超长被截断，校验失败 | 生成器读 `maxLength` 作为硬上限 |
| 9 | 原生 `select` | 需值存在于 `option` 列表 | 先抓页面枚举池，再生成 |
| 10 | Ant Design Vue / Element Plus 的 select / date-picker / cascader | 根节点是 `div`，无原生 setter 可写 | 独立 `FillerStrategy`，见第 10 章；v1 只覆盖 2 库指定主版本 |
| 11 | 只读 date-picker | 输入只读，需按 `valueFormat` 生成字符串并 blur | 适配器提供 `format` 协商 |
| 12 | 远程唯一性校验 | 手机号/身份证失焦触发异步请求，批量填充会打爆测试环境 | 分批 + 限速 + `MutationObserver` 等待稳定，不并发触发所有校验 |
| 13 | `requestIdleCallback` 节流 | 后台标签可能被挂起 | 提供 `setTimeout` 回退，带超时上限 |
| 14 | IME / composition 事件 | 中文输入相关组件监听 `compositionstart/end` | v1 明确不支持这类组件，跳过并报告 |
| 15 | 值写入后框架回写旧值 | 说明事件没让 state 更新 | 填充后做「回读校验」：`el.value === value` 且状态未回退；失败进报告 |

**回读校验是硬要求**，防止「DOM 看起来填了、提交是空的」这类沉默逻辑错误。

### 2.6 manifest.json 关键字段（v1 具体取值）

| 字段 | v1 取值 | 依据 / 说明 |
|---|---|---|
| `manifest_version` | `3` | 官方唯一支持值 [A] |
| `permissions` | `["activeTab", "scripting", "storage"]` | `scripting` 为 `executeScript` 必需；`activeTab` 提供临时主机权限；`storage` 供规则库/配置持久化 [A] |
| `host_permissions` | 不声明（等价于不申请持久宽泛主机权限） | 见 5.1 与 ADR-002；若改用静态 content_scripts 则必须声明，代价是安装期权限警告 |
| `content_scripts` | v1 不静态声明 | 改为用户手势触发的按需 `executeScript` 注入，避免 `<all_urls>` |
| `background` | `{ "service_worker": "background.js", "type": "module" }` | MV3 service worker，无 DOM，不能用 `window` [A] |
| `action` | `default_popup` + `default_title` + `default_icon` | popup 是扩展自己的页面，可用 Vue |
| `commands` | 4 条自定义命令（F / G / H / P）+ 可选 `_execute_action` | 快捷键属于 activeTab 的合法用户手势 [A]；`_execute_action` 需同时存在 `action` [A]；4 条 id 与 16.2 逐字一致 |
| `options_ui` | `{ "page": "options.html", "open_in_tab": true }` | 与 `options_page` 二选一；`options_ui` 支持嵌入扩展管理页 [A] |
| `web_accessible_resources` | `[{ "resources": ["injected/page-bridge.js", ...], "matches": ["<all_urls>"] }]` | MV3 必须同时给 `resources` 与 `matches` [A]；只放通用桥接代码，不放密钥/敏感数据 |
| `content_security_policy` | `{ "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }` | 只允许 self/none/wasm-unsafe-eval [A] |
| `minimum_chrome_version` | `"120"` | 覆盖 `world: 'MAIN'`（95+）、动态注册（102+）并留出企业环境余量；Edge 对应 Chromium 120+ |

完整示例（代码块内一律 ASCII 直引号）：

```json
{
  "manifest_version": 3,
  "name": "Form Auto Filler",
  "version": "1.0.0",
  "description": "Fill test data into forms on test environments. Does not submit.",
  "minimum_chrome_version": "120",
  "permissions": ["activeTab", "scripting", "storage"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "Form Auto Filler",
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "32": "icons/32.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "commands": {
    "open-plan": {
      "suggested_key": { "default": "Alt+Shift+F", "mac": "Alt+Shift+F" },
      "description": "Open the fill plan preview"
    },
    "scope-current-form": {
      "suggested_key": { "default": "Alt+Shift+G", "mac": "Alt+Shift+G" },
      "description": "Limit detection to the current form"
    },
    "scope-current-row": {
      "suggested_key": { "default": "Alt+Shift+H", "mac": "Alt+Shift+H" },
      "description": "Limit detection to the focused form row"
    },
    "open-picker": {
      "suggested_key": { "default": "Alt+Shift+P", "mac": "Alt+Shift+P" },
      "description": "Open the field picker"
    }
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "web_accessible_resources": [
    {
      "resources": ["injected/page-bridge.js", "injected/picker.css"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  },
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

**站点白名单与权限是两层，不要混**：`activeTab` 决定「能不能注入」，业务白名单决定「注入后允不允许填」。v1 在填充前校验 `location.hostname`，**站点白名单是唯一授权者**：精确命中白名单条目（或 glob 匹配）才放行，空域名一律拒绝，不命中即拒绝并返回 `E_SITE_NOT_ALLOWED`、显示原因，默认只填不提交。环境标识（`test` / `uat` / `staging` 等）**只用于扩展已受信父域下的测试子域**：仅当 hostname 首段为完整环境标签、且其父域已在白名单内时才放行，**不得**独立放行任何仅含 `test` / `uat` 子串的域名（如 `test.example.com.evil.com` 这类子串绕过，QA-B01 已修复并补 5 个绕过向量回归用例）。实现见 `src/config/site-guard.ts` 的 `SiteGuard.assertAllowed`。

---

## 3. 技术选型

### 3.1 选型规则（专家团制定，可判定）

候选必须逐条判定，任意一条不通过即淘汰。权重沿用 MVP 选型矩阵：学习成本、生态成熟度、部署成本、团队熟悉度为高权重，扩展性为低权重。

| # | 规则 | 判定方式 |
|---|---|---|
| R1 | 产出原生 MV3，能控制 `manifest.json` 的每个字段（含 `world`、`commands`、`web_accessible_resources`、`content_security_policy`） | 能否直接写/覆盖 manifest，而非只能走框架约定 |
| R2 | 一等 TypeScript 支持，纯逻辑模块可与 UI 分离并独立打包 | 是否有 `.ts` 入口与类型生成 |
| R3 | 与团队既有 Vue 3 + pnpm 工具链兼容，不强制 React | 官方模板或 peerDependencies 明确支持 Vue 3 |
| R4 | 支持多入口（background / content / popup / options）与按需注入，能生成不进 manifest 的 unlisted script | 文档是否给出 `injectScript` / `registration: 'runtime'` 之类能力 |
| R5 | 所有逻辑随扩展包本地打包，不引入远程托管代码 | 符合 MV3 CSP 与商店政策 [A] |
| R6 | 可在 `docs/contracts/` 的 TS 接口不被框架绑架的前提下实现（无框架私有运行时耦合） | 纯逻辑层能否脱离框架单独测试 |
| R7 | 依赖在 npm registry 真实存在、有明确版本、未被 deprecated | 查 registry `version` / `deprecated` 字段 |
| R8 | 本机 Node / pnpm 满足其 `engines`，无需额外运行时 | 与 `node v22.22.2` / `pnpm 10.2.1` 比对 |

### 3.2 对比矩阵（4 方案，5 分制，加权总分）

权重：R1=3、R2=3、R3=3、R4=2、R5=2、R6=2、R7=2、R8=1，共 18。

| 规则(权重) | 原生 JS 无构建 | Vite + @crxjs/vite-plugin 3.0.0 | Plasmo 0.90.5 | WXT 0.21.5 |
|---|---|---|---|---|
| R1 manifest 完全可控 (3) | 5 | 4 | 3 | 5 |
| R2 TS 一等 (3) | 1 | 4 | 5 | 5 |
| R3 Vue 3 + pnpm 契合 (3) | 3 | 4 | 2 | 5 |
| R4 多入口 + 按需注入 (2) | 1 | 3 | 4 | 5 |
| R5 全本地打包 (2) | 5 | 5 | 4 | 5 |
| R6 纯逻辑层可解耦 (2) | 3 | 5 | 3 | 5 |
| R7 依赖真实未废弃 (2) | 5 | 5 | 5 | 5 |
| R8 本机 engines 满足 (1) | 5 | 5 | 5 | 5 |
| **加权总分 / 90** | **59** | **76** | **66** | **88** |

逐方案说明（含不选取的理由，均为可核实事实）：

- **原生 JS 无构建**：R2/R4 明显不足。20 类推断、规则库、调度器全是纯逻辑，没有类型与模块化会让单文件 <= 300 行与单元测试都难以执行。仅适合 0.5 天油猴可行性验证，不适合交付工程。
- **Vite + @crxjs/vite-plugin 3.0.0**：registry 确认已发 3.0.0 正式版，`peerDependencies.vite` 覆盖 `^3 || ^4 || ^5 || ^6 || ^7 || ^8`，不再是长期 beta。它是单 Vite 插件，manifest、多入口目录、按需注入、unlisted script 都要自行搭；对本项目这种「多入口 + 纯逻辑层 + UI 层」的结构，装配代码本身会变成需要维护的一层。R4 扣分。
- **Plasmo 0.90.5**：官方定位 React 优先、类 Next.js 文件路由、自带较多约定与抽象；registry 的 `dependencies` 里固定 `typescript: 5.8.2`、`@parcel/core 2.9.3`。团队是 Vue 3，R3 扣分；较厚抽象也让 R6 的纯逻辑解耦要多绕一层。
- **WXT 0.21.5**：Vite 驱动、框架无关、官方提供 `vue` 模板；`wxt.config.ts` 里直接写 manifest；`defineContentScript` 支持 `world`、`registration: 'runtime'`；官方 `injectScript` + `defineUnlistedScript` 正好对应 2.2 的 MAIN world 桥接；内置 `createShadowRootUi` 对应悬浮球/拾取器的样式隔离；`engines.node >= 22`，本机满足。[A]

### 3.3 我选定的方案（规则 + 选定，不写成「必须用 X」）

> 第 3.1 节的 8 条规则是专家团定的边界，任何满足规则的候选都可以进入实现。基于 3.2 的评分与团队现状，**我在本项目中选定 WXT 0.21.5**。若后续 R3（团队技术栈）或 R7（依赖状态）发生变化，按同一矩阵重新评分即可换方案，架构层（第 5-9 章）不依赖具体构建工具。

| 层 | 选定 | 版本 | 说明 |
|---|---|---|---|
| 扩展框架 | WXT | 0.21.5 | 多入口、manifest 可控、unlisted script、Shadow DOM UI |
| UI 框架 | Vue | 3.5.45 | 仅 popup / options / 拾取器 UI 使用；识别/填充/执行层不 import Vue |
| 语言 | TypeScript | 5.9.3 | 见 4.1 为何不用 latest 7.0.2 |
| 构建 | Vite | 8.3.6 | WXT peer 允许 `^6.3.4 || ^7 || ^8` |
| Vue SFC 插件 | @vitejs/plugin-vue | 6.0.10 | peer `vite ^5 || ^6 || ^7 || ^8`、`vue ^3.2.25 || ^3.6.0-rc.10` |
| 包管理 | pnpm | 10.2.1 | 本机实测；用 `pnpm-lock.yaml` 锁定 |
| 图标库 | @lucide/vue | 1.70.0 | 见 3.4 |

### 3.4 图标库锁定（P0 绝对规则，本文件唯一权威表述）

**全项目唯一 SVG 图标来源：`@lucide/vue@1.70.0`（ISC，未 deprecated，peer `vue >=3.0.1`）。**

裁决链：设计侧按行业基线推荐 Lucide（24x24 网格、stroke 1.75、currentColor、16/20/24px）-> team-lead 裁决「采用 Lucide 为全项目唯一图标库」-> 架构师在 Spec 正式锁定。**三份文档结论一致**：PRD §9 L181 已按 team-lead 裁决 5 硬锁定「Lucide 唯一图标库 / Vue 侧 `@lucide/vue@1.70.0` / SVG 随扩展离线内联打包不依赖 CDN / `lucide-vue-next` 禁入依赖 / 禁 emoji 功能图标 / 禁第二套图标库与自绘 SVG」；UIUX R9 同样硬锁定 `@lucide/vue@1.70.0` 并禁 `lucide-vue-next`；本节给出实现细节与许可证合规。三者在库名、版本、离线内联、禁 deprecated 包四项上完全一致，**不构成第二处选型**。

> **口径更正（v1.1 第 2 次修订）**：上一版此处的「PRD 按 PM 边界只写『具体选型由架构师在 ARCH-v1 锁定』，不写库名」已被 team-lead 裁决 5 覆盖，**作废**。三文档确认时按「PRD 已硬锁定、版本与 ARCH 一致」解读，不得按「PRD 未写库名」解读。该更正由 PM 回确认触发，已同步 team-lead。

尺寸规范、语义白名单、功能含义一律用文字描述的规则全部保留，设计侧不返工。

**依赖引入方式（写死，不得替换）**：

- 构建期从 `@lucide/vue` 具名导入（如 `import { ScanLine, Wand2, Settings2 } from '@lucide/vue'`），按图标名 tree-shake，不整包引入。产物是随扩展包打包的**离线内联 SVG**，运行时**不走 CDN、不发任何网络请求**（与 15.1 零外发一致），因此不受宿主页 CSP 影响。
- **许可证合规**：Lucide 为 ISC，允许再分发；发布包内保留 `node_modules/@lucide/vue/LICENSE`（或等效 `THIRD_PARTY_LICENSES.md` 条目）与版本号，不剥离版权声明。ISC 要求保留版权与许可声明，无 copyleft 传染，不要求开源扩展自身代码。
- 禁止 emoji 作为功能图标；禁止手写内联 SVG 与图标库混用（唯一的例外是扩展 brand logo，需单独审批并集中在 `src/ui/brand/`）；禁止第二套图标库；禁止图标字体；禁止远程图标 CDN 与远程字体（16.1）。
- 禁止紫色到粉色渐变配色方案；悬浮球、popup、options、拾取器统一使用设计师给出的 Token，架构层不指定具体色值。
- **依赖存在性核验结果**：`lucide-vue-next@1.0.0` 的 registry JSON 带 `"deprecated": "Package deprecated. Please use @lucide/vue instead."` [A]。任何 Spec 或代码里出现 `lucide-vue-next` 即判不合格，防止引入已废弃包。
- **Spec 表述归一（三文档分工）**：本节是**技术实现细节**的唯一权威——依赖引入方式、tree-shake、离线内联、ISC 许可证合规、CSP 影响、brand logo 例外、图标名以实际导出为准。PRD §9 L181 是**产品侧硬锁定结论**，UIUX R9 / §3.1 / §3.4 是**设计侧硬锁定结论**；二者都只声明「用哪一套、什么版本、怎么分发」且结论与本节一致，不另给第二套库名 / 版本 / 引入方式。§0 第 5 条、第 4.1 版本表、15.1 本地打包清单、§13 设计师行都只引用本节。PRD §15 L267 的「图标统一 SVG 图标库（选型见 ARCH-v1 3.4）」与 L181 指向同一结论、只是详略不同，不构成冲突；是否统一措辞由 PM / team-lead 决定，架构侧不等待该处。

---

## 4. 版本锚定与核实方法

### 4.1 版本表（registry 核实日期 2026-11-09）

| 包 | registry `latest` | 本项目锁定 | 锁定理由 |
|---|---|---|---|
| `wxt` | 0.21.5 | **0.21.5** | `engines.node >=22`，本机 22.22.2 满足；peer `vite ^6.3.4 || ^7 || ^8`、`typescript >=5.4` |
| `vue` | 3.5.45 | **3.5.45** | 团队既有 Vue 3 |
| `vite` | 8.3.6 | **8.3.6** | `engines.node ^20.19.0 || >=22.12.0` 满足 |
| `@vitejs/plugin-vue` | 6.0.10 | **6.0.10** | 与 Vite 8 / Vue 3.5 peer 兼容 |
| `typescript` | 7.0.2 | **5.9.3** | registry `dist-tags` 显示 `latest=7.0.2`、`rc=7.0.1-rc`、`beta=7.1.0-beta`；WXT peer 只要求 `>=5.4`，而 5.9.3 是已广泛验证的补丁版本。TS 7 是跨代版本，升级需单独验证，不进初版 |
| `@lucide/vue` | 1.70.0 | **1.70.0** | 唯一图标库 |
| `@crxjs/vite-plugin` | 3.0.0 | 不采用 | 对比矩阵用 |
| `plasmo` | 0.90.5 | 不采用 | 对比矩阵用 |
| `lucide-vue-next` | 1.0.0 | **禁止** | 已 deprecated |

**当前事实**：项目目录无 `package.json`、无 `node_modules`、`pnpm-lock.yaml`。上表「锁定」是**设计约束**，不是已安装事实。实现第一步必须 `pnpm install` 生成 lockfile，再执行下面的核验命令，把实际版本回填到 Spec。

### 4.2 核实命令（写进 Spec，实现时逐条执行）

```bash
# 1. 本机运行时
node -v                     # 期望 v22.22.2 或满足 >=22
pnpm -v                     # 期望 10.2.1

# 2. registry 真实版本（防幻觉包名/版本）
pnpm view wxt version
pnpm view vue version
pnpm view vite version
pnpm view typescript version
pnpm view @lucide/vue version
pnpm view @lucide/vue deprecated    # 期望无输出

# 3. 已安装版本（以 lockfile + 实际 node_modules 为准，不以文档为准）
pnpm list --depth 0
node -p "require('./node_modules/wxt/package.json').version"
node -p "require('./node_modules/typescript/package.json').version"

# 4. 构建产物 manifest 必须由 WXT 生成后复核，不手写
pnpm build
cat .output/chrome-mv3/manifest.json

# 5. 浏览器侧
# chrome://extensions 打开开发者模式，加载 .output/chrome-mv3 为 unpacked
# chrome://version 复核 Chromium 版本 >= 120
```

**规则**：任何依赖版本变更必须先改本表再改 `package.json`；`pnpm-lock.yaml` 必须入库；禁止在代码里引用未在上表登记的包。

---

## 5. 分层架构与目录约束

### 5.1 分层 ASCII 图

```
+------------------------------------------------------------------+
| UI / ENTRY layer (WXT entrypoints)                                |
|   popup.vue  options.vue  picker UI (Shadow DOM)  background.ts    |
|   only: assemble, forward messages, render state                   |
+---------------------------+--------------------------------------+
                            | depends downward only
                            v
+------------------------------------------------------------------+
| EXECUTION layer                                                   |
|   FillPlanner -> FillExecutor -> FillReport                         |
|   batch scheduling, requestIdleCallback, MutationObserver wait      |
+---------------------------+--------------------------------------+
                            v
+------------------------------------------------------------------+
| FILL layer                                                        |
|   Filler + FillerStrategy registry                                  |
|   nativeSetter / select / datePicker / contentEditable / sdkHook    |
+---------------------------+--------------------------------------+
                            v
+------------------------------------------------------------------+
| DATA layer                                                        |
|   DataProvider (RandomProvider v1) + generators (20 types)          |
|   CompositeProvider, presets schema reserved                        |
+---------------------------+--------------------------------------+
                            v
+------------------------------------------------------------------+
| DETECTION layer                                                   |
|   L1 scan -> L2 infer -> L3 picker override                        |
|   FieldDescriptor (pure data, serializable)                        |
+---------------------------+--------------------------------------+
                            v
+------------------------------------------------------------------+
| CONFIG / INFRA layer                                              |
|   RuleStore (chrome.storage.local)  alias dictionary  site guard   |
|   JSON import/export  structure hash  logging (no sensitive values)|
+------------------------------------------------------------------+

CROSS-CUTTING (no upward dependency):
  site allowlist guard, error codes, Result<T>, diagnostic report,
  MAIN-world bridge (optional, P3), feature flags
```

**依赖铁律**（对应 `code-organization.md`）：

1. 依赖只能向下；下层禁止 import 上层。
2. UI/入口层只装配与转发，不写推断/生成/填充逻辑。
3. 纯逻辑层（detection / data / fill / execution）**禁止 import Vue、禁止 import `wxt/browser`、禁止访问 `chrome.*`**（只能通过注入的 `RuleStore` / `Logger` 端口），以便脱离扩展环境单测。
4. `FieldDescriptor` 是纯数据，跨进程传递；`FieldHandle`（持 `HTMLElement`）只在 content script 内存在，禁止放进 `chrome.runtime.sendMessage`。
5. 跨模块协作走对方的接口，不直连对方内部文件。
6. 单一职责、一文件一主导出、**单文件 <= 300 行**（不含空行注释）、入口文件 < 100 行且只装配、类型/Schema 独立成文件、`utils/` 只放纯函数。

### 5.2 目录结构与文件组织约束

```
src/
  entrypoints/                     # WXT 入口，只装配
    background.ts                  # < 100 行：注册 commands / action / 消息路由
    popup/                         # Vue UI
      index.html
      main.ts                      # < 100 行：挂载 App
      App.vue
      components/                  # 每组件单文件 <= 300 行
    options/
      index.html
      main.ts
      App.vue
      components/
    filler.content.ts              # ISOLATED world 主 content script，只装配
    page-bridge.ts                 # defineUnlistedScript，MAIN world，P3 可选
  ui/                              # 共享 Vue 组件（悬浮球、拾取器、计划预览）
    components/
    composables/
    brand/                         # 唯一允许非 Lucide 图形的位置
  detection/
    scan.ts                        # L1：枚举可填控件
    infer.ts                       # L2：打分主流程
    scoring/
      alias-dictionary.ts
      feature-weights.ts
      regex-features.ts
      option-enum.ts
    picker.ts                      # L3：人工修正入口
    field-descriptor.ts            # 纯数据构造
    field-handle.ts                # 运行时 element 包装
  data/
    provider.ts                    # DataProvider 接口 + CompositeProvider
    providers/
      random-provider.ts           # v1
    generators/                    # 20 类，一类一文件，每类 <= 300 行
      person-name.ts
      id-card.ts
      ...
    consistency.ts                 # 身份证/出生日期/性别一致性，固定种子
  fill/
    filler.ts
    native-setter.ts               # 统一填充原语
    strategies/
      native-input.ts
      native-select.ts
      ant-design-vue.ts
      element-plus.ts
      date-picker.ts
      sdk-hook.ts                  # P3
    readback.ts                    # 回读校验
  execution/
    fill-planner.ts
    fill-executor.ts
    batch-scheduler.ts
    mutation-waiter.ts
    fill-report.ts
  config/
    rule-store.ts                  # RuleStore 接口实现（chrome.storage.local 适配）
    site-guard.ts
    structure-hash.ts
    json-io.ts
  bridge/                          # P3：MAIN world <-> ISOLATED world
    channel.ts                     # channel 常量、requestId 配对、消息白名单
    page-bridge-client.ts
  contracts/                       # 纯类型，无实现，与 docs/contracts/ 同名文件一致
    types.ts
    rules.ts
    field.ts
    interfaces.ts
    index.ts                       # 只做 re-export，< 30 行
  utils/                           # 纯函数，无业务、无副作用
    hash.ts
    glob.ts
    text.ts

docs/
  ARCH-v1.md
  decisions/ADR-001.md ... ADR-003.md
  contracts/
    types.ts                       # 基础类型、20 类枚举、错误模型
    rules.ts                       # 规则库文档类型
    field.ts                       # FieldDescriptor / FieldHandle
    interfaces.ts                  # 六大模块接口（入口）
    field-types.json               # 20 类字段类型（机器可读）
    rules.schema.json              # JSON Schema draft 2020-12
```

**文件组织门禁（Windows Git Bash）**

```bash
# 单文件 <= 300 行
find src -type f \( -name '*.ts' -o -name '*.vue' \) -print0 \
  | xargs -0 wc -l | sort -rn \
  | awk '$1>300 && $2!="total" {print "OVER LIMIT:", $0}'

# 入口文件行数
wc -l src/entrypoints/background.ts src/entrypoints/filler.content.ts \
      src/entrypoints/popup/main.ts src/entrypoints/options/main.ts

# 契约文件同样受 300 行硬规则约束
wc -l docs/contracts/*.ts src/contracts/*.ts | sort -rn | awk '$1>300 && $2!="total" {print "OVER LIMIT:", $0}'

# 依赖方向：纯逻辑层不得出现 Vue / chrome / wxt/browser
grep -rnE "from ['\"](vue|wxt/browser)['\"]|chrome\." src/detection src/data src/fill src/execution
```

任一门禁不过即退回，不算通过 Phase 3。

v1.1 追加门禁见 15.4（零外发 / 隔离 / 权限白名单）、17.1（20 类枚举三处一致）与第 18 章（14 条端到端断言），Phase 3 一并执行，不另起第二套检查表。

### 5.3 注入策略对比与选定

| 策略 | 权限 | 常驻悬浮球 | 代价 |
|---|---|---|---|
| 静态 `content_scripts` + `matches: ["<all_urls>"]` | 需宽泛 `host_permissions`，安装期权限警告 | 支持 | 与「仅测试域名」冲突，企业策略易拦 |
| WXT `registration: 'runtime'` | 官方说明会把 `matches` 加入 `host_permissions` [A] | 支持 | 仍产生持久主机权限 |
| **用户手势触发按需注入（选定）** | `activeTab` + `scripting`，**不声明 `host_permissions`**，安装期无宽泛警告 | 注入后即常驻到页面卸载 | 首次使用必须按一次快捷键或点一次扩展图标 |

**选定第 3 种**。官方 activeTab 文档列出的合法用户手势包含「Executing a keyboard shortcut from the commands API」与「Executing an action」[A]，与本产品「人工触发、默认不自动提交」的形态一致。实现要点：WXT 中把 v1 主 content script 作为 unlisted script 打包，由 `background.ts` 在 `chrome.commands.onCommand` / `chrome.action.onClicked` 里调用 `chrome.scripting.executeScript({ target: { tabId }, files: [...] })` 注入（默认 ISOLATED world），不使用 WXT 的 `registration: 'runtime'`，避免自动写入 `host_permissions`。

**代价要如实告知用户**：页面刷新后扩展不会自动注入，需要再按一次快捷键；这是权限最小化的交换。若用户更看重「打开页面就常驻」，改用第 2 种策略并在白名单里显式列出测试域名；此时**分层与模块契约（第 5-9 章）不变**，但 2.6 manifest 字段、5.3 注入策略、ADR-002 决策四、15.2 权限白名单门禁、16.2 首次唤起步文案这 5 处必须定点修订，不能只改 PRD。

---

## 6. 内部模块契约（TS 接口）

完整机器可读声明按职责拆分在 `docs/contracts/` 下：`types.ts`（基础类型与 20 类枚举）、`rules.ts`（规则库文档类型）、`field.ts`（FieldDescriptor / FieldHandle）、`interfaces.ts`（六大模块接口入口）。依赖方向单向 `interfaces -> field -> rules -> types`，每份文件 <= 300 行。本节给出签名与设计约束，实现时以这四份文件为准。代码块内一律 ASCII 直引号。

### 6.0 公共类型与错误模型

```ts
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string; detail?: Record<string, unknown> };

export type ErrorCode =
  | 'E_FIELD_NOT_FOUND'
  | 'E_READONLY_OR_DISABLED'
  | 'E_UNSUPPORTED_CONTROL'
  | 'E_VALIDATION_REJECTED'
  | 'E_READBACK_MISMATCH'
  | 'E_PORTAL_NOT_FOUND'
  | 'E_VALUE_FORMAT_MISMATCH'
  | 'E_LINKAGE_TIMEOUT'
  | 'E_FIELD_LIMIT_EXCEEDED'
  | 'E_TIMEOUT'
  | 'E_SITE_NOT_ALLOWED'
  | 'E_BRIDGE_UNAVAILABLE'
  | 'E_RULE_SCHEMA_INVALID'
  | 'E_PROVIDER_FAILED';

export interface FillContext {
  sessionId: string;
  seed: number;
  siteKey: string;
  pageKey: string;
  generated: ReadonlyMap<FieldType, string>;
  locale: 'zh-CN';
  now: string;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
}
```

`Logger` 禁止接收或写入身份证、手机号、预设值等原始值，只记字段名/类型/结果码，避免敏感数据进日志。

### 6.1 FieldDescriptor（纯数据，可跨进程）

```ts
export type ControlType = 'input' | 'select' | 'date' | 'textarea' | 'other';

/** Human-readable incremental hint, NOT a rule primary key.
    css / xpath strategies are forbidden (section 17.5). */
export interface FieldLocator {
  strategy: 'labelText' | 'attr' | 'domPath' | 'rowAnchor';
  value: string;
  fallbacks: string[];
  scope: 'form' | 'dialog' | 'document';
  frame: 'top' | 'same-origin-iframe';
  anchorLabel?: string;
}

/** "人员信息 > 第 2 行 > 姓名", never a CSS selector or XPath. */
export interface ContainerInfo {
  kind: 'form' | 'dialog' | 'search' | 'table-toolbar' | 'standalone' | 'unknown';
  readablePath: string;
  inFormScope: boolean;
  isExcluded: boolean;
  excludeReason?: string;
  rowIndex?: number;
}

export interface FieldDescriptor {
  id: string;
  locator: FieldLocator;
  tagName: 'INPUT' | 'TEXTAREA' | 'SELECT' | 'CONTENTEDITABLE' | 'CUSTOM';
  inputType: string;
  controlType: ControlType;
  textFeatures: TextFeatures;
  constraints: FieldConstraints;
  enumOptions: string[];
  container: ContainerInfo;
  hasValue: boolean;
  inferredType: FieldType;
  confidence: number;
  scoreBreakdown: Record<string, number>;
  source: 'L1' | 'L2' | 'L3' | 'RULE';
  skipReason?: SkipReason;
}

export interface FieldHandle {
  descriptor: FieldDescriptor;
  element: HTMLElement;
  isConnected(): boolean;
}
```

**约束**：`FieldDescriptor` 不含 `HTMLElement`、函数、`Map`；可直接 JSON 序列化进 `chrome.runtime.sendMessage`。`FieldHandle` 只在 content script 内存活。`container` / `inFormScope` / `hasValue` / `controlType` 是 v1.1 新增，用于 PRD AC-6 防误填（17.4）与控件类型映射（17.6）；`SkipReason` 完整枚举见 17.4。完整定义以 `docs/contracts/field.ts` 与 `types.ts` 为准。

### 6.2 DataProvider（v1 唯一设计投资）

```ts
export interface DataProvider {
  readonly id: string;
  getValue(field: FieldDescriptor, ctx: FillContext): string | Promise<string>;
}

export interface CompositeProvider extends DataProvider {
  chain: readonly DataProvider[];
}

export interface ProviderRegistry {
  register(provider: DataProvider): void;
  resolve(ctx: FillContext): DataProvider;
}
```

- `getValue` 只依赖 `FieldDescriptor` 与 `FillContext`，**不认识页面、不认识 DOM、不认识 Filler**。
- 返回值必须是已满足 `constraints` 的字符串（长度、格式、枚举池），由生成器负责合法性。
- `FillContext.generated` 由执行层维护，保证同一条记录里身份证出生日期、性别、姓名一致。
- 新增 `PresetProvider` / `CsvProvider` 时：新增一个实现 + 在 `ProviderRegistry` 注册 + options 页一个表单；识别层、填充层、执行层零改动（见 ADR-003）。

### 6.3 FieldDetector

```ts
export interface DetectionContext {
  root: ParentNode;
  scope: 'form' | 'dialog' | 'document';
  rules: EffectiveRules;
  logger: Logger;
}

export interface FieldDetector {
  scan(ctx: DetectionContext): FieldHandle[];                       // L1
  infer(handles: FieldHandle[], ctx: DetectionContext): FieldDescriptor[]; // L2
  applyOverrides(fields: FieldDescriptor[], rules: EffectiveRules): FieldDescriptor[]; // L3
  detect(ctx: DetectionContext): FieldDescriptor[];
}
```

`scan` 过滤规则固定：hidden / disabled / readonly / `type=file` / `type=password` / 验证码 / 富文本 / 搜索框与筛选条件（后者可在计划预览里跳过）。置信度低于阈值时 `inferredType = 'unknown'` 并给出 `skipReason`，**不硬猜**。

### 6.4 Filler

```ts
export interface VerificationDetail {
  domValueMatched: boolean;
  frameworkStateMatched: boolean;
  validationCleared: boolean;
  evidence: string[];
  checkedAt: string;
}

/** Renamed from FillOutcome in v1.1. No alias. */
export interface FillResult {
  fieldId: string;
  status: 'filled' | 'skipped' | 'failed';
  verified: boolean;
  value?: string;
  code?: ErrorCode;
  failureReason?: string;
  verification?: VerificationDetail;
  skipReason?: SkipReason;
  controlType: ControlType;
  attempts: number;
  elapsedMs: number;
}

export interface FillerStrategy {
  readonly id: string;
  supports(handle: FieldHandle): boolean;
  fill(handle: FieldHandle, value: string, ctx: FillContext): Promise<FillResult>;
}

/** P0 built-in. Options live in a body-level portal, not the trigger subtree. */
export interface ComponentAdapter extends FillerStrategy {
  readonly library: 'ant-design-vue' | 'element-plus';
  readonly control: 'select' | 'date-picker';
}

export interface Filler {
  register(strategy: FillerStrategy): void;   // P2+ adapters only
  fill(handle: FieldHandle, value: string, ctx: FillContext): Promise<FillResult>;
}

export interface StateVerifier {
  verify(handle: FieldHandle, value: string, adapterId: string): Promise<VerificationDetail>;
}

export interface MutationWaiter {
  waitFor(predicate: () => boolean, signal?: AbortSignal): Promise<Result<void>>;
}
```

`Filler` 内部按 `supports` 优先级选策略，统一走 `native-setter.ts` 的 `setNativeValue`，末尾必经 `StateVerifier` 三层回读；任一失败返回 `verified=false` + `E_READBACK_MISMATCH`，`failureReason` 写明失败层。**6 个 P0 内建策略在入口装配期无条件注册、构造时校验**，`register()` 只对 P2 之后的新适配器开放（14.1）。联动稳定判定走 `MutationWaiter`，不用固定 `setTimeout`（14.3）。UI 成功态只能由 `verified === true` 驱动（14.2）。

### 6.5 RuleStore

```ts
export interface EffectiveRules {
  aliasDictionary: Readonly<Record<FieldType, readonly string[]>>;
  weights: Readonly<Record<string, number>>;
  generators: Readonly<Record<string, Record<string, unknown>>>;
  confidenceThreshold: number;
  pageOverrides: readonly FieldOverride[];
  presets: PresetsConfig;
}

export interface RuleStore {
  load(): Promise<RulesDocument>;
  getEffectiveRules(siteKey: string, pageKey: string): Promise<EffectiveRules>;
  savePageOverride(pageKey: string, override: FieldOverride): Promise<void>;
  removePageOverride(pageKey: string, locatorValue: string): Promise<void>;
  exportJson(): Promise<string>;
  importJson(raw: string): Promise<Result<RulesDocument>>;
}
```

`importJson` 必须先过 `rules.schema.json` 校验，失败返回 `E_RULE_SCHEMA_INVALID`，不允许半加载。规则库只存**例外修正**，不存全量字段清单。

### 6.6 FillPlanner

```ts
export interface PlanItem {
  fieldId: string;
  fieldType: FieldType;
  value: string;
  selected: boolean;
  skipReason?: string;
  batch: number;
  dependsOn: string[];
}

export interface FillPlan {
  sessionId: string;
  items: PlanItem[];
  batches: PlanItem[][];
  structureHash: string;
  driftDetected: boolean;
  createdAt: string;
}

export interface FillReport {
  sessionId: string;
  total: number;
  filled: number;
  skipped: number;
  failed: number;
  outcomes: FillResult[];
  elapsedMs: number;
}

export interface FillPlanner {
  plan(fields: FieldDescriptor[], rules: EffectiveRules, ctx: FillContext,
       provider: DataProvider): Promise<FillPlan>;
}
```

`driftDetected` 为 true 时，计划预览必须提示「规则可能失效，是否重新校验」，不允许静默按旧规则填。分批按依赖顺序：基础字段 -> 派发 change -> `MutationObserver` 等待联动稳定 -> 再填新增字段 -> 循环至稳定或超时。

### 6.7 补充接口（执行层与桥接层）

```ts
export interface FillExecutor {
  execute(plan: FillPlan, handles: Map<string, FieldHandle>,
          filler: Filler, ctx: FillContext): Promise<FillReport>;
  cancel(sessionId: string): void;
}

export interface BridgePort {
  readonly available: boolean;
  request<T>(op: string, payload: Record<string, unknown>,
             timeoutMs: number): Promise<Result<T>>;
}
```

`BridgePort.available` 为 false 时所有调用立即返回 `E_BRIDGE_UNAVAILABLE`，由调用方降级，不抛异常。

### 6.8 调用链（唯一合法数据流）

```
background (gesture) -> executeScript -> filler.content.ts
  -> FieldDetector.detect()            [detection]
  -> RuleStore.getEffectiveRules()     [config]
  -> FillPlanner.plan(provider)        [execution + data]
  -> popup 展示 FillPlan，用户勾选
  -> FillExecutor.execute()            [execution]
       -> Filler.fill()                [fill]
            -> setNativeValue + readback
  -> FillReport -> popup / options
```

---

## 7. 字段类型枚举（20 类）

机器可读版本：`docs/contracts/field-types.json`。`unknown` 是推断失败哨兵，**不计入 20 类**，用于「不硬猜」。

| # | key | 中文标签 | 生成器约束 | 常见别名（词典示例） | 正则/属性特征 |
|---|---|---|---|---|---|
| 1 | `personName` | 人名 | 中文姓名 2-4 字，不含数字 | 姓名、名字、联系人、申请人、经办人 | `autocomplete=name` |
| 2 | `gender` | 性别 | 页面 option 优先，回落 男/女 | 性别、男女 | 字典枚举 |
| 3 | `idCard` | 身份证 | 18 位，GB 11643 校验位，地区码与出生日期合法 | 身份证号、证件号码、公民身份号码、idCard | `maxlength=18`、`type=text` + 数字校验 |
| 4 | `phone` | 手机号 | 11 位，`1[3-9]` 号段 | 手机号码、联系电话、手机号、手机、联系方式 | `maxlength=11`、`type=tel` |
| 5 | `landline` | 座机 | 区号-号码，如 `010-12345678` | 座机、固定电话、办公电话 | `type=tel` + 含连字符 pattern |
| 6 | `email` | 邮箱 | ASCII local@domain | 邮箱、电子邮箱、Email、邮件地址 | `type=email` |
| 7 | `date` | 日期 | 按 `valueFormat` 生成，与 `idCard` 出生日期一致 | 出生日期、日期、生效日期、办理日期 | `type=date`、只读 + 日历图标 |
| 8 | `time` | 时间 | `HH:mm` 或 `HH:mm:ss` | 时间、时刻、办理时间 | `type=time` |
| 9 | `region` | 省市县 | 三级行政区划，页面字典优先 | 省市县、户籍所在地、籍贯、所属地区 | cascader 根节点 |
| 10 | `address` | 详细地址 | 街道门牌，长度 <= `maxLength` | 详细地址、住址、住宅、联系地址 | `textarea` 或长 `maxlength` |
| 11 | `organization` | 单位名称 | 中文机构名 + 后缀 | 所属单位、工作单位、单位名称、机构 | 可能为远程搜索 select |
| 12 | `school` | 学校 | 学校名 | 毕业院校、学校、就读院校 | 长文本 + 特定词典 |
| 13 | `education` | 学历/学位 | 页面 option 优先 | 学历、学位、最高学历、文化程度 | 字典枚举 |
| 14 | `jobTitle` | 职称/职务 | 页面 option 优先，回落短文本 | 职称、职务、岗位、专业技术职务 | 字典枚举 |
| 15 | `code` | 编号编码 | 按 `pattern`/`maxLength` 生成字母数字 | 编号、编码、证号、档案号、流水号 | `pattern` 存在 |
| 16 | `amount` | 金额 | 数值，2 位小数，符合 min/max/step | 金额、费用、资金、工资 | `type=number` + 小数 step |
| 17 | `quantity` | 数量 | 整数，符合 min/max/step | 数量、人数、件数、次数 | `type=number` + `step=1` |
| 18 | `percentage` | 百分比 | 0-100，按页面约定决定是否带 `%` | 比例、百分比、占比、完成率 | `max=100` |
| 19 | `dictEnum` | 字典枚举 | **只从页面 option / 下拉面板取真实值**，不自造 | 政治面貌、人才类别、状态、类型 | 非原生 select 根节点 |
| 20 | `longText` | 长文本备注 | 中文句子，长度 <= `maxLength` | 备注、说明、主要成果、成就、描述 | `textarea` |

**打分特征优先级**（L2）：`label` > `placeholder` > `name`/`id` > `aria-label` > 邻近节点文本 > 表单行结构 > 正则/属性特征。权重存规则库，不在代码里写死。低于 `confidenceThreshold`（建议初值 0.6）标 `unknown` 并在计划预览里列出，让用户点选绑定，**不静默填**。

**一致性约束**：`idCard` 的第 7-14 位必须与 `date`（出生日期）一致，第 17 位奇偶必须与 `gender` 一致；由 `data/consistency.ts` 在 `FillContext.generated` 上统一维护，不由各生成器各自决定。

---

## 8. 规则库 JSON Schema

完整 Schema：`docs/contracts/rules.schema.json`（JSON Schema draft 2020-12）。结构约定：

```
global (别名词典 / 权重 / 生成器配置 / presets)
  +-- sites[hostPattern] (站点级覆盖：专用字典、日期格式、单位枚举)
        +-- pages[] (页面级覆盖：URL 模式 + structureHash + 少量 FieldOverride)
```

**顶层字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | integer, const `1` | 导入时先校验，不兼容直接拒绝 |
| `global.aliasDictionary` | `Record<FieldType, string[]>` | 中文别名词典，键必须是 20 类之一 |
| `global.weights` | `Record<string, number>` | 特征权重与 `confidenceThreshold` |
| `global.generators` | `Record<string, object>` | 每类生成器的参数（长度、格式、枚举） |
| `global.presets` | object | v1 schema 预留，UI 不暴露；空值表示走 RandomProvider |
| `sites` | `Record<hostPattern, SiteOverride>` | 站点级覆盖 |
| `pages` | `PageOverride[]` | 页面级覆盖，**只存增量修正** |

**`FieldOverride`**

| 字段 | 说明 |
|---|---|
| `locator` | `FieldLocator`，含 `strategy`、`value`、`fallbacks`、`scope`、`frame` |
| `action` | `setType` / `skip` / `forceValue`（`forceValue` v1 不启用，留给 PresetProvider） |
| `fieldType` | `action=setType` 时必填 |
| `note` | 人工备注，可空 |

**`PageOverride`**

| 字段 | 说明 |
|---|---|
| `pageId` | 稳定标识 |
| `urlPattern` | glob 或正则字符串（字符串，不是可执行代码） |
| `structureHash` | 归一化表单骨架的 hash，算法版本记在 `hashAlgorithm` |
| `hashAlgorithm` | 固定字符串，如 `form-skeleton-v1` |
| `detectedAt` | ISO 8601 |
| `overrides` | `FieldOverride[]`，只允许少数几条 |

**结构 hash 的稳定性要求**：归一化时剔除动态生成的 `id`、随机 class、Vue 的 `data-v-*`、时间戳、索引后缀；只保留标签序列、`type`、`name`、label 文本骨架。否则改版噪声会让规则天天误报失效。

**可执行代码禁令**：规则库只允许数据。正则以字符串存于 `pattern` 字段，运行时 `new RegExp(pattern)` 构造；禁止 `eval`、`new Function`、函数字符串、远程 URL 加载。MV3 扩展自身 CSP 也不允许这些。[A]

**最小示例**

```json
{
  "schemaVersion": 1,
  "global": {
    "aliasDictionary": {
      "phone": ["手机号码", "联系电话", "手机号", "手机", "联系方式"],
      "idCard": ["身份证号", "证件号码", "公民身份号码"]
    },
    "weights": {
      "label": 1.0,
      "placeholder": 0.7,
      "nameId": 0.5,
      "ariaLabel": 0.5,
      "nearbyText": 0.3,
      "regexFeature": 0.4,
      "confidenceThreshold": 0.6
    },
    "generators": {
      "date": { "format": "YYYY-MM-DD" },
      "amount": { "fractionDigits": 2 }
    },
    "presets": {
      "global": { "personName": "", "idCard": "" },
      "bySite": {},
      "byPage": {}
    }
  },
  "sites": {},
  "pages": [
    {
      "pageId": "p-example",
      "urlPattern": "https://*.test.example.com/person/add*",
      "hashAlgorithm": "form-skeleton-v1",
      "structureHash": "REPLACE_WITH_REAL_HASH",
      "detectedAt": "2026-11-09T00:00:00.000Z",
      "overrides": [
        {
          "locator": {
            "strategy": "labelText",
            "value": "人才类别",
            "fallbacks": ["#talentType"],
            "scope": "dialog",
            "frame": "top"
          },
          "action": "setType",
          "fieldType": "dictEnum",
          "note": ""
        }
      ]
    }
  ]
}
```

---

## 9. DataProvider 扩展点（v1 唯一设计投资）

基线方案 3.2 已定：`RandomProvider` 为 v1 实现，`PresetProvider`（固定姓名/身份证）、`CsvProvider`（导入）、`CompositeProvider`（优先级回落链）为后续。架构层补三条硬约束：

1. **填充引擎只依赖 `DataProvider.getValue(field, ctx)`**，不 import 任何具体 Provider。Provider 由 `ProviderRegistry` 在入口装配期注入，符合「入口只装配」。
2. **加 Provider 不改动识别层/填充层/执行层**：新增 `src/data/providers/<name>.ts` + 注册 + options 页表单。第 6 章所有接口签名不变。
3. **`presets` schema v1 就写进 `rules.schema.json`**，UI 先不暴露。空值表示未预设，走 `RandomProvider`。预设值含身份证等敏感信息，必须本地保存、不上传、不写日志、JSON 导出时默认脱敏。

**关于「本地加密」的如实说明**：`chrome.storage.local` 本身是隔离存储，**不是加密存储**。若确需加密，只能用 Web Crypto AES-GCM，而密钥仍保存在扩展包/存储中，能防「顺手打开 DevTools 看到明文」，不能防「拿到扩展文件的攻击者」。v1 不实现加密，改为：不上传、不写日志、导出可选脱敏、站点白名单 + 默认不提交。不要向用户承诺「加密存储」。

---

## 10. 技术不可行 / 高成本 / 风险清单（明确警告）

| # | 项 | 判定 | 证据 | 影响与处置 |
|---|---|---|---|---|
| 1 | ISOLATED world 直接读 `el.__vue__` / `__vueParentComponent` | **不可行** | [A] 官方 isolated world + expando 隔离 | 从 v1 契约中移除；L1/L2 只基于 DOM |
| 2 | 依靠 Vue 3 组件实例调 `emit` / `setFieldsValue` 做通用填充 | **不可行** | [B] 生产构建默认关闭 devtools 暴露 + 第 1 条 | 降为 P3 项目内 SDK 钩子；主路径走 DOM |
| 3 | MV3 中 `eval` / `new Function` / 远程托管代码 / 从 URL 加载规则逻辑 | **不可行** | [A] MV3 CSP 与商店政策 | 规则库纯数据；正则用字符串 + `new RegExp` |
| 4 | 不申请 `host_permissions` 却要求「页面打开即自动注入常驻悬浮球」 | **不可行**（权限模型互斥） | [A] activeTab 需用户手势 | 见 5.3：按需注入，首次需按一次快捷键；或改用显式站点白名单 |
| 5 | Ant Design Vue / Element Plus 的 select / date-picker / cascader 通用适配 | **高成本** | [B] 非原生控件无稳定公开 API，版本差异大 | v1 只覆盖 2 个库的指定主版本 + 2 类控件（select、date-picker）；其余跳过并在报告里给 `E_UNSUPPORTED_CONTROL` |
| 6 | 远程搜索 select（异步下拉）、字段联动显隐 | **高成本** | 基线方案 6.4 | `MutationObserver` + 超时上限 + 分批；不承诺 100% 联动成功 |
| 7 | 跨源 iframe 填充 | **高成本 / v1 不做** | [A] 帧级权限与独立注入 | v1 只做顶层帧 + 同源 iframe；跨源明确 out-of-scope |
| 8 | 严格 CSP 站点上的 MAIN world 通道 | **风险** | [B] MAIN world 受页面 CSP | 只用 `files` 注入；失败降级 ISOLATED 主路径并记 `E_BRIDGE_UNAVAILABLE` |
| 9 | `window.postMessage` 被页面伪造 | **风险** | [A] 官方 DevTools 文档明确警告 not foolproof | channel + requestId + `event.source === window` + 字段白名单；桥接不传敏感值 |
| 10 | 合成事件 `isTrusted=false` 被业务风控忽略 | **风险** | [C] | 回读校验 + 诊断报告标记，无通用解法 |
| 11 | 批量填充触发大量异步唯一性校验请求 | **风险** | 基线方案 3.1 | 分批 + 限速 + `requestIdleCallback`（带 `setTimeout` 回退）+ 单次总量上限 |
| 12 | 结构 hash 漂移误报 | **风险** | 基线方案 6.8 | 归一化剔除动态属性；漂移只提示重校验，不静默按旧规则填 |
| 13 | 「本地加密存储」的真实强度 | **风险（勿过度承诺）** | `chrome.storage.local` 非加密 | 见第 9 章；v1 不实现，改为不上传/不写日志/脱敏导出 |
| 14 | 中文别名覆盖导致零配置可用率虚高 | **风险** | 基线方案 3.1 目标 70-80% | 阈值低于 0.6 标 `unknown` 并列出，不硬猜；把修正成本压到点选 |
| 15 | 生成器输出「有值但不合法」（身份证校验位、枚举值不在页面字典） | **风险** | 基线方案 6.5 | 生成器读 `constraints` / `enumOptions`；非法不写入，返回 `E_VALIDATION_REJECTED` |

> PM 在 PRD-v1.1 §12 L227-231 新增的 4 条内嵌坑——合成事件 `isTrusted` 风控、异步唯一性校验打爆、结构 hash 漂移误报、加密过度承诺——分别对应本表 #10 / #11 / #12 / #13，架构侧处置已在上表给出，不另设第二套口径。#11 的限速细则见 14.3，#12 的防误报细则见 17.3，#13 的口径已由 PRD-v1.1 全量改为「不宣称加密存储 / 不上传 / 不写日志 / 导出可脱敏 / 默认不提交」。

---

## 11. 明确不做（v1 out-of-scope）

- 预设固定值（固定姓名、身份证）、Excel/CSV 导入指定数据：只留接口与 schema，不实现 UI 与 Provider。
- 自动提交、批量连续造数循环：只留开关位。
- 跨页面会话保持、团队共享规则库后端、云同步。
- 项目内 SDK 钩子（P3）、Playwright 联动。
- 验证码 / 滑块 / 文件上传 / 电子签名 / 富文本复杂内容 / 跨源 iframe。
- 生产环境写入、绕过登录与权限、改业务系统代码。
- 任何依赖 Vue/React 组件实例私有字段的填充通道。
- 任何远程托管代码、CDN 依赖、运行时 eval。
- 第二套图标库、emoji 功能图标、紫色到粉色渐变配色。

---

## 12. 端到端验证步骤（Spec 收尾即验收）

实现完成后必须跑通以下流程才算这份架构交付完成。

**准备**

```bash
pnpm install
pnpm list --depth 0                 # 版本与第 4.1 节一致
pnpm build
cat .output/chrome-mv3/manifest.json   # 复核 permissions / commands / options_ui / WAR
```

准备 3 个本地测试页：(A) 纯原生 `input`/`textarea`/`select`/checkbox；(B) Vue 3 + Ant Design Vue 的 `a-input` / `a-select` / `a-date-picker`；(C) React 受控 `input`。三页都含至少 20 个字段、一个 `readonly` 字段、一个 `disabled` 字段、一个搜索框。

**核心成功流**

1. `chrome://extensions` 开发者模式加载 `.output/chrome-mv3`；确认安装期**没有**「读取和更改所有网站上的数据」警告。
2. 打开 A 页，按 `Alt+Shift+F`（`commands` 手势），确认 content script 被 `executeScript` 注入。
3. 计划预览出现，字段数 >= 20，搜索框默认可跳过；勾选后执行填充。
4. 断言：所有可填字段 DOM 值与计划值一致；`readonly`/`disabled` 出现在 `skipped`；`FillReport.filled + skipped + failed === total`。
5. 在 C 页（React）额外断言：提交时 payload 包含填入值，不是空字符串；这是验证 native setter 绕过 valueTracker 的关键断言。
6. 在 B 页断言：`a-input` 与 `a-select`（指定主版本）被填充；`a-date-picker` 按 `valueFormat` 生成；超出 v1 适配范围的控件，其内部结果对象为 `FillResult.status='failed'` + `code='E_UNSUPPORTED_CONTROL'`（**仅为内部表示**），而结果面板、诊断报告、本地计数三处必须按该 code **单列为「超范围控件」分组**，不计入失败数、不占零配置可用率分母；内部 `failed` 状态与展示层「单列、不算失败」二者不矛盾（§17.6 / UIUX R15 / PRD-v1 §11 成功指标）。
7. 用同一种子连续填两次，断言 `idCard`/`date`/`gender` 一致且校验位正确。

**关键错误 / 边界流**

8. 在非白名单域名按快捷键：拒绝填充并提示 `E_SITE_NOT_ALLOWED`，不写入任何字段。
9. 导入一个 `schemaVersion: 999` 的规则 JSON：返回 `E_RULE_SCHEMA_INVALID`，原有规则不变（无半加载）。
10. 人为让 `page-bridge.js` 注入失败：填充仍完成，报告含 `E_BRIDGE_UNAVAILABLE`，无未捕获异常。
11. 单页 100 个字段：填充过程页面不卡死，分批生效，`requestIdleCallback` 不可用时 `setTimeout` 回退生效，总耗时有上限。
12. 门禁命令（5.2 节）全部通过：无 > 300 行文件、入口 < 100 行、纯逻辑层无 `vue`/`chrome.`/`wxt/browser` 引用。

**沉淀**：以上 12 条固化为回归用例；实现中发现的任何新坑先回写本文件第 2.5 / 第 10 章，再改代码（活规格）。

---

## 13. 跨角色约束同步

| 对象 | 已同步约束（v1.1） |
|---|---|
| 设计师 | 图标库正式锁定 `@lucide/vue@1.70.0`（离线内联、ISC、不走 CDN、无第二套；3.4 为唯一权威表述），尺寸 / 语义白名单 / 状态纯文本规则不变；`ControlType` 5 类映射见 17.6，cascader 与远程搜索 select 归「下拉」但 v1 不做；UI 成功态只能由 `FillResult.verified === true` 驱动（14.2）；undo 走同一赋值通道、不需要组件实例通道、失效置灰（16.4）；拾取器不暴露选择器、元素路径只在诊断报告折叠区（17.5）；`faf.counters.v1` 与配置 / 结果分键（15.1）；Shadow DOM / 固定主题 / 无外部字体 / popup 360x560 / 4 条 commands 见第 16 章 |
| PM | PRD-v1.1 已采纳全部口径；阈值**正式锁定 0.6**（17.2 / `LIMITS`），AC-5 已改为「0.6（已锁定：ARCH-v1 §17.2 / `LIMITS.CONFIDENCE_THRESHOLD`）」；`E_READBACK_MISMATCH` 为三文档唯一回读失败码、`field_unknown` 已进 `LocalCounterEvent`（11 事件）；PRD §9 L181 已按 team-lead 裁决 5 硬锁定 Lucide / `@lucide/vue@1.70.0`，与 3.4 一致（旧「PRD 不写库名」口径作废，见 3.4 更正）；权限交换已在 PRD §15 L270 完成拍板前交底（禁 `<all_urls>`、须显式白名单 pattern），若改选 `host_permissions` 常驻，架构需定点修订 2.6 / 5.3 / ADR-002 / 15.2+15.4 门禁 / 16.2，不能只改 PRD |
| 前端 | 第 5 章目录与依赖铁律、第 6 章四份契约、第 4 章版本锚定、3.4 图标库锁定；v1.1 新增 `UndoManager` / `StateVerifier` / `MutationWaiter` / `DiagnosticCounter`、`FillResult.verified`、6 个 P0 内建策略（14.1）、`E_READBACK_MISMATCH` 单码、17.2 阈值常量 |

---

## 14. v1.1 裁决落地：P0 核心链路与状态回读

> 第 14-18 章是 team-lead 三项裁决、PM PRD-v1.1 与设计师 UIUX-v1.1 的落地，优先级高于正文 v1.0 中与本节冲突的表述；正文保留作为决策留痕，冲突处一律以本章为准。

### 14.1 组件库最小适配集是 P0 核心链路，不是后期补丁

裁决：Ant Design Vue / Element Plus 的 `select` 与 `date-picker` 能填、且赋值后组件内部状态与校验态确实生效，从 P2 上提到 **P0**。完整适配（远程搜索下拉、级联选择器、跨页面会话保持）仍留 P2。

**架构落地**：`Filler` 的策略注册表对 P0 策略不是「可选插件」。入口装配期必须无条件注册以下 6 个内建策略，`Filler` 构造时校验，缺一个即抛错：

| 策略 id | 控件 | 归属 |
|---|---|---|
| `native-input` | 原生 input / textarea / checkbox / radio | P0 |
| `native-select` | 原生 select | P0 |
| `ant-design-vue-select` | `a-select` | P0 |
| `ant-design-vue-date-picker` | `a-date-picker` | P0 |
| `element-plus-select` | `el-select` | P0 |
| `element-plus-date-picker` | `el-date-picker` | P0 |

`FillerStrategy` 的 `register()` 只对 P2 之后的新适配器开放，不得用于装载 P0 策略。契约见 `docs/contracts/interfaces.ts` 的 `Filler` / `ComponentAdapter`。这样避免「先交一个只能填原生 input 的壳，再补适配器」的假交付。

**每个 P0 适配器必须实现四件事**：

1. **portal 级选项查找**：不假设下拉选项位于触发器 DOM 子树内。Ant Design issue #58161 确认 Select / DatePicker 是 body 级 portal。查找范围固定为 `document.body` 下的组件库 dropdown 容器（如 `.ant-select-dropdown` / `.ant-picker-dropdown` / `.el-select__popper` / `.el-picker__panel`），先定位可见面板再取 option。禁止 `trigger.querySelectorAll(...)`。
2. **`valueFormat` 协商**：日期按页面 `valueFormat` / `format` 生成字符串，不硬编码 `YYYY-MM-DD`。无法解析格式时返回 `E_VALUE_FORMAT_MISMATCH` 并计入失败，不猜一个格式写进去。
3. **赋值通道**：优先模拟点击触发器 -> 在 portal 面板中选中目标 option（触发组件自身的 change 回调）；只读输入场景才退化为原型原生 setter 写值 + `blur`。**禁止裸 `el.value = x`**。
4. **三层状态回读**：见 14.2，所有适配器共用同一个 `StateVerifier`，不得各自实现「我觉得填上了」。

超出 v1 适配范围的控件一律 `status='failed'`、`code='E_UNSUPPORTED_CONTROL'`，在诊断报告单列、给元素定位与「重新拾取」入口；**不计入成功，也不计入零配置可用率的分母**（PM PRD-v1.1 L205 的产品判断，计数口径见 15.1）。

### 14.2 `FillResult.verified`：三层回读，未生效判失败

裁决要求「填充后必须回读校验组件内部状态，未生效判失败而非成功」，`FillResult` 带 `verified` 字段与失败原因。契约见 `docs/contracts/types.ts` 的 `FillResult` / `VerificationDetail`。

**必须诚实说明的边界**：ISOLATED world 读不到 Vue / React 组件内部 state 对象（第 2.1 / 2.4 节已证）。因此「校验组件内部状态」采用**等价可观测证据**，而不是假装能读 state：

| 层 | 字段 | 判定方式 |
|---|---|---|
| 1 | `domValueMatched` | 原生控件 `el.value === value`；非原生控件读组合后的显示文本、隐藏 input、`aria-*` 中承载的值 |
| 2 | `frameworkStateMatched` | 派发 `change` 后等待**两个渲染帧**（`requestAnimationFrame`，不是固定 `setTimeout`）再回读，值未被框架用旧 state 覆盖。若被回滚，说明 state 没收到新值，等价于内部状态未更新 |
| 3 | `validationCleared` | `aria-invalid` 未置 true、相邻错误提示节点消失、控件容器无 `-error` / `is-error` 类；必填字段失焦后无红框 |

三者全为 true 才 `verified = true` 且 `status = 'filled'`。任一为 false 一律 `status = 'failed'`、`code = 'E_READBACK_MISMATCH'`，`failureReason` 写明是哪一层没过。**`E_READBACK_MISMATCH` 是三份文档共用的唯一回读失败码**（PRD AC-3、UIUX R13、本文件）；`types.ts` 不设第二个校验失败码，避免三处漂移，失败层由 `failureReason` 表达而不由错误码表达。

**禁止把「事件已派发」当作成功**，这正是 Chrome Autofill、Playwright `fill()`、TesterHome「脚本报绿业务没生效」的共同失效模式。对应设计师 UIUX-v1.1 新增 3：`FillExecutor.execute` 逐控件返回 `FillResult`，`FillReport.outcomes` 与计划行一一对应；**UI 的「成功」态只能由 `verified === true` 驱动**，不得由 `input` / `change` 已派发、`PROGRESS` 计数或任何中间态驱动。`verified === false` 一律渲染失败态。

`verification.evidence` 只记录可观测信号名（如 `aria-invalid:false`、`rerender-stable`），**不记录字段取值**。`attempts` 记录重试次数，重试上限 2 次，仍失败即判失败，不无限重试。

#### QA 验收判据（防止按「组件内部状态」字面误判）

team-lead 裁决原文含「回读校验组件内部状态」字样，但 PRD / UIUX 已核实**没有**对应的字面承诺：PRD AC-3 是「赋值后回读校验值与校验态已生效」，UIUX §7.3 明确「界面不宣称能读取组件内部状态」。为避免 Phase 3 QA 按字面要求「读到框架 state 对象」而误判，判据在此锁死：

- **唯一判据是 `FillResult.verified` 与其 `VerificationDetail` 三层证据**：`domValueMatched` / `frameworkStateMatched` / `validationCleared` 全为 true 才成功；任一 false 为 `E_READBACK_MISMATCH` + `failureReason` 写明失败层。QA **不得**把「展示或读取 Vue / React 组件内部 state 对象」列为通过条件。
- **命名契约固定**：三层字段名以 `docs/contracts/types.ts` 的 `VerificationDetail` 为准，PRD AC-3、UIUX 结果面板、诊断报告、测试用例一律使用这三个 slug，不另起中文别名或第二套命名。PM 若把等价判据写进 AC-3，措辞应与本节一致。
- **「两个渲染帧」是时序近似，不是直接读 state**：若页面在两帧之后才回滚，第 2 层会误判通过（ADR-004 负面代价）。因此第 18 章第 1 条变异测试是**必过项**而非可选回归；诊断报告保留 `verification.evidence` 信号名与人工标记入口，兜住这类漏检。
- **「未生效能被检出」是可观测要求，不是全知要求**：等价实现保证「脚本报绿、业务没生效」被判失败并计入报告，不承诺检出所有极端时序回滚。这条如实写进验收口径，不把近似说成 100%。

### 14.3 联动等待：禁固定 `setTimeout`，改 `MutationWaiter`

契约见 `docs/contracts/interfaces.ts` 的 `MutationWaiter.waitFor(predicate, signal)`。

- 用 `MutationObserver` 观察目标表单容器与 portal 容器，每次 mutation 后检查 predicate（新控件出现 / option 数 > 0 / loading 指示消失 / 校验态稳定）；配合 `AbortSignal` 与 `LINKAGE_TIMEOUT_MS = 3000` 的**超时兜底**。
- 超时返回 `E_LINKAGE_TIMEOUT` 并把该控件计入失败，不用「等 1000ms 大概好了」当稳定判据。
- `setTimeout` 在本架构中**只允许**作为 `requestIdleCallback` 不可用时的分批调度回退（让出主线程，第 2.5 节 #13），与联动稳定判定无关，两者不得混为一谈。
- 唯一性校验类字段（`idCard` / `phone` / `code`）串行写入并限速，避免集中派发打爆页面的异步唯一性校验（PRD AC-7、第 10 章 #11）。

### 14.4 页面侧兼容性锚点（registry 核实日期 2026-11-09）

PM 的 PRD §9 L176 要求架构师锁定具体版本与适配清单。**下表的包是宿主页可能使用的适配目标 / 测试矩阵锚点，不是扩展的 npm 依赖**——扩展不引入任何组件库，以免注入体积膨胀与 CSP 冲突。

| 页面侧目标 | 锁定版本 | 许可证 / peer | v1 适配范围 |
|---|---|---|---|
| Vue 3 | 3.5.45 | MIT | 原生受控 input / textarea 的 setter + input/change 通道；Vue 3 组件库见下两行 |
| Vue 2 | 2.7.16 | MIT，npm 已标记 deprecated「Vue 2 has reached EOL」 | **只保证原生受控控件**的 setter + input/change 通道（`v-model` 监听 input、`.lazy` 监听 change）；不保证 Vue 2 组件库的非原生控件 |
| Ant Design Vue | 4.2.6 | MIT，peer `vue >=3.2.0` | P0 最小适配：`a-select` / `a-date-picker` |
| Element Plus | 2.14.8 | MIT，peer `vue ^3.3.7` | P0 最小适配：`el-select` / `el-date-picker` |
| Element UI（Vue 2） | 2.15.14 | MIT，peer `vue ^2.5.17` | v1 **不适配**其非原生控件；识别为 `CUSTOM` 并跳过，计入 `E_UNSUPPORTED_CONTROL` |
| React | 不锁版本 | — | 只保证 native setter + `input`/`change` 通道；valueTracker 定义在元素实例上，原型 setter 仍是原生实现（第 2.5 节） |

**范围口径**：「兼容 Vue 2 / Vue 3 受控组件」指通用赋值通道在两代框架下都生效，不等于「兼容两代全部组件库的非原生控件」。第 18 章验证必须分别覆盖 Vue 3 + 两个组件库（P0）与 Vue 2 原生受控控件（回归）。

---

## 15. 零网络上报、权限最小化与内容脚本隔离门禁

### 15.1 零外发硬约束（team-lead 裁决 3、PRD §10）

架构中**不存在**埋点、遥测、上报、同步、账号或云模块。以下能力在 v1 及所有后续 Provider 中一律禁止：

`fetch()` / `XMLHttpRequest` / `WebSocket` / `EventSource` / `navigator.sendBeacon()` / 远程 `<script>` / 远程 CSS `@import` / 远程字体 / 图片外链 / `chrome.runtime.sendNativeMessage` / 任何第三方统计 SDK / 从远端加载规则库或字典。

所有资源（Lucide SVG、Noto Sans SC 子集、别名词典、规则 JSON）随扩展包本地打包。`chrome.scripting.executeScript({ files: [...] })` 注入的是扩展包内本地文件，不是网络请求，不违反本约束。

**本地诊断计数**：只落 `chrome.storage.local` 的 `faf.counters.v1`。事件为 PRD §10 L193-196 的 11 个 `{对象}_{动作}` 事件：`fill_triggered` / `fill_plan_confirmed` / `first_core_action` / `field_inferred` / `field_unknown` / `field_skipped` / `field_failed` / `picker_rebind` / `rule_hash_drift` / `fill_completed` / `error_occurred`，对应 `LocalCounterEvent`（`field_unknown` 为 PM 在 PRD-v1.1 新增，已同步进契约）。属性仅允许：字段类型 slug、控件类别、结果码、耗时、页面指纹 hash。**禁止**采集字段取值、姓名 / 身份证等敏感值、页面 URL 明文（只存 hash）、IP、页面原始输入内容。

**计数与配置 / 结果严格分键**（设计师 UIUX-v1.1 新增 5）：`faf.counters.v1` 是独立顶层键，只存 `LocalCounterRecord { event, count, lastAt }` 聚合数字；配置类 `faf.rules.v1` / `faf.siteAllowlist.v1` / `faf.fabPosition.v1` 与结果类 `faf.lastPlan.v1` / `faf.lastResult.v1` 不得与计数混存。`RuleStore.exportJson()` 导出的 JSON **不含计数**；options 只展示聚合纯文本数字 + 一键清空（`DiagnosticCounter.clear()`），不展示任何维度明细；导出脱敏口径见第 9 章。`E_UNSUPPORTED_CONTROL` 走 `field_skipped` + `skipReason='unsupported-control'` 单列统计，不混入成功率分母。

### 15.2 权限最小化（PRD §9 / §12）

| 类别 | 集合 |
|---|---|
| 允许（v1 唯一清单） | `activeTab`、`scripting`、`storage` |
| 禁止 | `debugger`、`proxy`、`tabs`、`webRequest`、`webRequestBlocking`、`cookies`、`history`、`bookmarks`、`<all_urls>` 形式的 `host_permissions`、任何 `optional_permissions` 外发能力 |

Automa 申请 10 项权限、风险评分 89 是反面参照。第 2.6 节的 manifest 示例即按此清单写死；构建产物 `manifest.json` 必须过白名单校验。

### 15.3 内容脚本隔离（PRD §9 / §12）

1. 所有注入 UI 挂在独立 Shadow DOM 根容器下（详见第 16 章），不改宿主页 DOM 结构，只加兄弟 overlay。
2. **不写页面全局对象**：禁止 `window.__FAF_* = ...` 之类挂载。跨 world 只能走第 2.2 节的 `postMessage` 通道，且只发消息、不挂全局。
3. **不向宿主页控制台输出任何日志或警告**：`console.*` 只允许出现在扩展自有页（popup / options / background）的 `Logger` 实现中；content script 与注入 UI 层禁止 `console.*`。
4. **扩展异常不得阻塞被测页面**：content script 顶层与每个 `FillerStrategy.fill()` 都要有错误隔离，单控件失败不中断其余填充；不允许未捕获异常冒泡到宿主页。
5. 不注入全局样式、不加载外部字体、不覆盖宿主页原型或全局方法。

### 15.4 门禁命令（并入第 5.2 节统一执行）

```bash
# 零外发：源码中不得出现网络 API 调用（注释里的官方文档 URL 除外，需人工确认）
grep -rnE "(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(" src --include='*.ts' --include='*.vue' || echo "NO_NETWORK_API: PASS"

# 隔离：content script 与注入 UI 不得输出控制台日志、不得写页面全局
grep -rnE "console\.|window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=" src/entrypoints/filler.content.ts src/ui || echo "ISOLATION: PASS"

# 权限白名单：只允许 activeTab / scripting / storage
pnpm build
node -e "const m=require('./.output/chrome-mv3/manifest.json');const ok=['activeTab','scripting','storage'];const bad=(m.permissions||[]).filter(p=>!ok.includes(p));if(bad.length||m.host_permissions?.length){console.error('PERMISSION_VIOLATION',bad,m.host_permissions);process.exit(1)}console.log('PERMISSIONS: PASS')"
```

---

## 16. UI 注入层契约与消息通道

> 与 `UIUX-v1.md` §2.4 / §2.5 / §3 / §4.1-4.6 / §7 对齐。设计 Token 归设计师，本节只锁工程约束。

### 16.1 Shadow DOM、层级与主题

| 项 | 契约 |
|---|---|
| 根容器 | WXT `createShadowRootUi` 生成的独立 Shadow DOM 根，类名 / 组件名一律 `f-` 前缀 |
| z-index | 注入根 `2147483000`；拾取器高亮 `2147483645`；拾取器工具条 / tooltip `2147483646`；计划预览抽屉 / 绑定面板 `2147483647` |
| overlay | 拾取器高亮层 `pointer-events: none`，不改宿主页元素样式，避免触发联动重渲染 |
| 主题 | 注入层固定使用**扩展自身主题**的实色 surface，不读取也不跟随宿主页配色；靠 `--elev-raised` 阴影拉开层级。宿主页深底时仍可读 |
| 字体 | 注入层**不加载任何外部字体文件**，用系统字体栈回退；仅 popup / options 打包本地 Noto Sans SC 子集（本地文件，非 CDN，`font-display: swap`） |
| popup | 宽 360px、高不超过 560px（MV3 硬上限 800x600）；填充计划预览走**页内右侧抽屉**（380-420px 宽，`min(72vh, 640px)`），不塞进 popup |

### 16.2 快捷键与冲突降级

`manifest.commands` 固定 4 条（与第 2.6 节 manifest 示例逐字一致）：

| command | suggested_key | 作用域 |
|---|---|---|
| `open-plan` | `Alt+Shift+F` | 打开填充计划预览（主路径） |
| `scope-current-form` | `Alt+Shift+G` | 仅识别当前表单作用域 |
| `scope-current-row` | `Alt+Shift+H` | 仅识别当前焦点字段所在表单行 |
| `open-picker` | `Alt+Shift+P` | 进入可视化拾取器 |

`Esc` 不注册为 command，由 content script 键盘监听兜底关闭浮层 / 退出拾取器。启动时用 `chrome.commands.getAll()` 校验 `suggested_key` 是否真正生效；被宿主页或其他扩展占用时，popup 顶部给纯文本「快捷键未生效，请在扩展快捷键设置中修改」+ 文字链接，**不静默失败**。

**与按需注入的调和（消解 UIUX §4.1 / §7.1 的字面冲突）**：UIUX 说悬浮球是「常驻入口」，ADR-002 决策四说 `activeTab` 需用户手势才注入。二者不矛盾——**注入后**悬浮球与面板常驻到页面卸载；**首次**必须按上述 4 条快捷键之一、点 popup 主按钮，或点扩展图标触发注入，页面刷新后需再次触发。设计侧的「首次唤起步」已在跨角色同步中确认。

### 16.3 content script 与 popup 的消息通道

popup 生命周期短（关闭即销毁），而 content script 在页面存活期间持续运行，因此**结果与计划必须落本地 storage**，不能只靠 runtime 消息。

- 通道：`content script -> chrome.runtime.sendMessage -> background 中继 -> popup`，消息信封为 `RuntimeMessage`（`channel: 'FAF_RUNTIME_V1'` + `requestId` + `type` + `payload`），类型见 `docs/contracts/types.ts`。类型固定 5 种：`PLAN_READY` / `PLAN_CONFIRMED` / `PROGRESS` / `RESULT_READY` / `UNDO`。
- 存储键（`STORAGE_KEYS`）：配置 `faf.rules.v1` / `faf.fabPosition.v1` / `faf.siteAllowlist.v1`；结果 `faf.lastPlan.v1` / `faf.lastResult.v1`；计数 `faf.counters.v1`。**三类互不混存**（15.1）。
- popup 打开时从 `faf.lastPlan.v1` / `faf.lastResult.v1` 读取「本次结果」，不发起任何网络请求。
- `PROGRESS` 只带 `{ done, total }`，驱动「正在填充 7 / 18」纯文本，不带动效。
- `RESULT_READY` 的载荷只有 `sessionId`，明细从 `faf.lastResult.v1` 读，避免把 `FillResult` 数组塞进消息边界。

### 16.4 undo 快照（回答设计师新增 1）

**结论：原生 setter + 冒泡 `input` / `change` 足够，不需要组件实例通道。** 撤销与填充是同一条通道——把快照原值用原型原生 setter 写回、派发 `input` / `change`、再走一次 `StateVerifier` 回读。理由见第 2.5 节与 ADR-002 决策一：ISOLATED world 的原型 setter 是未被框架 patch 的干净实现，React valueTracker 定义在元素实例上，Vue 2 `v-model` 监听 `input`、`.lazy` 监听 `change`。组件实例通道在 v1 明确不可行（第 2.1 / 2.4 节），**不得**用于 undo。

**一处必须区分**：非原生控件不能只对隐藏 input 写回原值，否则组件内部 state 与显示文本会不一致。`UndoManager.restore()` 必须走**当初填充它的同一个 `FillerStrategy`**（select 恢复原 option、date-picker 按原 `valueFormat` 恢复字符串），并同样回读校验；契约见 `docs/contracts/interfaces.ts` 的 `UndoManager` 与 `types.ts` 的 `UndoSnapshot` / `UndoState`。

| 项 | 契约 |
|---|---|
| 快照内容 | 计划内每个控件的原值（含空字符串，空值是有效快照）、`controlType`、`fieldId`、采集时间；**不采控件之外的页面数据** |
| 存储 | **仅 content script 内存会话**，不落 `chrome.storage.local`、不写入 `faf.counters.v1`、不进导出 JSON |
| 有效性 | 全部 `FieldHandle.isConnected()` 为真、当前 `structureHash` 与采集时一致、所属表单容器仍在 |
| 失效 | 页面跳转 / 弹窗关闭 / 元素脱离 DOM / 结构漂移 -> `UndoState.valid = false` + `invalidReason`；UI 撤销按钮置灰并给纯文本「页面已变化，无法撤销」，**不假装可撤销** |
| 保护 | 已有值且被 `skipReason='has-value'` 保留的控件不进快照，撤销不改动它们 |

---

## 17. 权威枚举、阈值与 L1 排除规则

### 17.1 20 类字段类型：唯一权威枚举

**唯一机器可读来源：`docs/contracts/field-types.json`；`docs/contracts/types.ts` 的 `FieldType` 与其逐项一致。** 拾取器绑定面板（UIUX §4.5）、PRD 生成器（B1）、填充计划预览行、`RuleStore.aliasDictionary` 的键，**一律以此表为准，禁止另起别名或改名**。命名不一致会直接导致「拾取器绑定后计划行无法回写」。

| slug（代码标识，ASCII） | 中文名（UI 展示） | 生成器 id |
|---|---|---|
| `personName` | 人名 | `chinese-person-name` |
| `gender` | 性别 | `page-enum-or-gender` |
| `idCard` | 身份证 | `gb11643-id-card` |
| `phone` | 手机号 | `cn-mobile` |
| `landline` | 座机 | `cn-landline` |
| `email` | 邮箱 | `ascii-email` |
| `date` | 日期 | `formatted-date` |
| `time` | 时间 | `formatted-time` |
| `region` | 省市县 | `admin-region` |
| `address` | 详细地址 | `chinese-address` |
| `organization` | 单位名称 | `chinese-organization` |
| `school` | 学校 | `chinese-school` |
| `education` | 学历/学位 | `page-enum-or-education` |
| `jobTitle` | 职称/职务 | `page-enum-or-short-text` |
| `code` | 编号编码 | `pattern-code` |
| `amount` | 金额 | `decimal-number` |
| `quantity` | 数量 | `integer-number` |
| `percentage` | 百分比 | `percentage` |
| `dictEnum` | 字典枚举 | `page-enum-only` |
| `longText` | 长文本备注 | `chinese-sentence` |

`unknown` 是推断失败哨兵，**不属于 20 类，不是生成器目标**，不可作为拾取器可绑定项；低于阈值时在计划预览给独立「待绑定」态（UIUX R12），并单独计 `field_unknown`。控件类型另有 `ControlType`（`input` / `select` / `date` / `textarea` / `other`），UI 上映射为纯文本「输入框 / 下拉 / 日期 / 文本域 / 其他」，与字段类型是**两个正交维度**，不可混用。

**一致性门禁**：`field-types.json` / `types.ts` / `rules.schema.json` 三处 20 个 slug 必须逐项一致；生成器 id 以 `field-types.json` 的 `generator` 字段为准，本表与 JSON 已核对一致（附录 A E17）。另：`field-types.json` 的 `confidenceThresholdDefault: 0.6` 是**镜像默认值，不是阈值权威**（已在其 `confidenceThresholdAuthority` 字段显式声明）；本文件是字段类型枚举的权威，阈值权威为 `types.ts` 的 `LIMITS.CONFIDENCE_THRESHOLD` 与 `rules.schema.json` 的 `weights.confidenceThreshold`。三者数值必须一致，Phase 3 门禁一并校验。

### 17.2 三个阈值与配套常量（`LIMITS`）

| 阈值 | 值 | 判定与理由 |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | `0.6`（**正式锁定**） | 唯一权威来源 `LIMITS.CONFIDENCE_THRESHOLD` 与 `rules.schema.json` 的 `weights.confidenceThreshold`，PRD AC-5 同值。低于此值标 `unknown` 并列出待确认，不硬猜 |
| `VIRTUAL_SCROLL_THRESHOLD` | `100` | 计划项 `>= 100` 启用虚拟滚动（UIUX §4.2 按 100 项设计）；小于 100 直接渲染 |
| `MAX_FIELDS_PER_PAGE` | `200` | 单页可填控件软上限，与 UIUX §6「整页模式控件数超 200 时提示缩小作用域」一致。超出则截断、报告 `E_FIELD_LIMIT_EXCEEDED` 并提示缩小作用域，不静默丢弃 |

配套常量：`DRIFT_JACCARD_THRESHOLD = 0.85`、`DRIFT_CONSECUTIVE_SCANS = 2`、`DRIFT_REMIND_COOLDOWN_DAYS = 7`、`LINKAGE_TIMEOUT_MS = 3000`、`SINGLE_FIELD_TIMEOUT_MS = 50`、`TARGET_FILL_MS_20_50 = 3000`、`HARD_FILL_TIMEOUT_MS = 15000`、`FILL_BATCH_SIZE = 20`。性能口径对齐 PRD §9（20-50 控件 <= 3s、单控件 <= 50ms）。

### 17.3 结构 hash 漂移判定（回答设计师的「过灵敏会误报」）

**不用单一相似度阈值刷屏，采用双层判定 + 防抖**：

1. **主判定（精确、优先）**：对该 `pageKey` 已登记的每条 `FieldOverride.locator` 验证本次扫描是否仍能**唯一命中**。命中率 < 100% 即判漂移。**没有 override 的新页面（零配置直接填）不触发漂移提示**，只记录新 hash。
2. **辅判定（结构）**：归一化表单骨架（`form-skeleton-v1`，剔除动态 `id`、随机 class、`data-v-*`、时间戳、索引后缀）的 Jaccard 相似度 `< 0.85`，且**连续 2 次扫描**都低于阈值才判漂移。单帧的异步挂载、骨架屏、无关区域渲染都不会触发。
3. **防抖**：同一 `pageKey` 在一次页面会话内只提示一次；`detectedAt` 距今 < 7 天不重复刷同一条提示。

命中后计划预览顶部给 `--warn` 纯文本「结构已变化，建议重校验」，**不静默沿用旧规则**（PRD AC-5 / AC-8）。人为增删一个控件应当恰好提示一次，这是第 18 章的验证断言。

### 17.4 L1 容器信息与防误填排除规则（PRD AC-6 硬指标）

`FieldDescriptor` 增加 `container: ContainerInfo`、`hasValue: boolean`、`controlType: ControlType`（见 `docs/contracts/field.ts`）。L1 扫描必须返回每个控件所属的最近表单容器，并显式排除容器外的控件：

| 信号 | 处理 |
|---|---|
| 最近容器 | `<form>` / `[role="dialog"]` / `.ant-modal` / `.el-dialog`；记录 `container.kind = form \| dialog` 与 `inFormScope = true` |
| `[role="search"]`、表格工具栏容器 | `kind = search \| table-toolbar`，`inFormScope = false`，默认排除 |
| `type=search` | 排除 |
| placeholder / label / aria-label 含「搜索 / 查询 / 筛选 / 关键字」 | 排除 |
| name / id 含 `search` / `keyword` / `filter` / `query` | 排除 |
| 控件已有值 | `hasValue = true`，默认不覆盖（`skipReason = 'has-value'`），需显式「覆盖已有值」开关才纳入 |
| 表单容器之外 | `inFormScope = false`，排除，原因 `outside-form` |

作用域三档「当前弹窗 / 当前表单 / 整页」，**默认最窄档**（UIUX §4.2 第 1 层防线）。排除项必须出现在计划预览「已排除 N 项」分组，逐条给排除原因与「纳入本次」入口，**不静默忽略**。这直接对应 PRD §11「误填次数 = 0」硬指标。

`SkipReason` 完整枚举（与 UIUX §4.2 的跳过原因一一对应）：`readonly` / `disabled` / `hidden` / `file` / `captcha` / `outside-form` / `search-or-filter` / `has-value` / `user-unchecked` / `low-confidence` / `rule-excluded` / `unsupported-control` / `field-limit-exceeded`。每条跳过行必须带其中一项，不允许只写「跳过」。

### 17.5 规则主键：禁止静态 CSS / XPath；拾取器不暴露选择器

PRD §12 明确「禁止用静态 CSS / XPath 路径作规则主键」，UIUX §4.5 也要求界面不展示选择器 / 正则 / XPath。据此修订第 6.1 节与 `rules.schema.json`：

- `FieldLocator.strategy` 收窄为 `labelText` / `attr` / `domPath` / `rowAnchor`，**移除 `css` 与 `xpath`**。运行时定位靠 `FieldHandle.element` 直接持有 DOM 节点，不需要持久化选择器。
- 规则的**主键是页面指纹**（`urlPattern` + `structureHash`），`FieldLocator` 只是人可读的增量定位提示，不是主键、不展示给用户编辑。
- `ContainerInfo.readablePath` 是人类可读位置，格式为「所属表单 > 所在行 > 控件标签」（如「人员信息 > 第 2 行 > 姓名」），**不是 CSS 选择器 / XPath / DOM 路径**（`docs/contracts/field.ts` 已写死注释）。
- 拾取器 tooltip 只显示 4 项（控件标签 / 控件类型 / 推断类型与置信度 / 所属位置），不暴露元素路径；绑定面板只给 20 类字段类型的中文列表 + 搜索，**不给任何选择器输入框**，改绑 <= 3 次点击（PRD §11）。
- 元素路径**只允许**出现在诊断报告失败项的折叠区，供开发者一键定位与复制（设计师 UIUX-v1.1 新增 4）。这是唯一允许出现路径的位置。

### 17.6 控件类型映射（回答设计师新增 2）

`ControlType` 是 UI 展示用的 5 类正交枚举，L1 扫描必须返回。映射表按「显示形态」归类，不按库名：

| 控件 | `ControlType` | UI 纯文本 | v1 处置 |
|---|---|---|---|
| 原生 input（text / tel / email / number）、只读日期输入 | `input` | 输入框 | P0 `native-input` |
| 原生 textarea、contenteditable 纯文本 | `textarea` | 文本域 | P0 `native-input` |
| 原生 select | `select` | 下拉 | P0 `native-select` |
| Ant Design Vue `a-select` / Element Plus `el-select` | `select` | 下拉 | P0 组件适配器 |
| Ant Design Vue `a-date-picker` / Element Plus `el-date-picker` | `date` | 日期 | P0 组件适配器，按 `valueFormat` 生成 |
| Ant Design Vue `a-cascader` / Element Plus `el-cascader` | `select` | 下拉 | **v1 不做**，`E_UNSUPPORTED_CONTROL` 单列 |
| 远程搜索 select（`a-select` show-search / `el-select` remote） | `select` | 下拉 | **v1 不做**，`E_UNSUPPORTED_CONTROL` 单列 |
| checkbox / radio / switch / 上传 / 签名 / 富文本 | `other` | 其他 | 富文本等 v1 不做；checkbox / radio 走 `el.click()` 原语 |
| 无法识别的自定义控件 | `other` | 其他 | `E_UNSUPPORTED_CONTROL` |

采纳设计师的暂定归类：cascader 与远程搜索 select 都归「下拉」，**但归类不等于纳入 v1 适配范围**——二者按 PRD L132 明确不做，只在结果面板以「下拉」+ `E_UNSUPPORTED_CONTROL` 单列呈现，不混进失败项（UIUX R13）。字段类型（`FieldType`）与控件类型（`ControlType`）是两个维度，预览行必须分别展示，不可互相覆盖。

---

## 18. 修订后的端到端验证补充（对齐 PRD AC-1 至 AC-8）

第 12 章的 12 条仍全部执行，另加以下 14 条断言（对应本次裁决与两份 v1.1 文档）：

1. **AC-2 / AC-3 变异测试（最关键）**：构造一个「事件已派发但框架 state 未更新」的页面（例如受控输入被组件在下一次 render 回写旧值）。断言 `FillResult.verified === false`、`status === 'failed'`、`code === 'E_READBACK_MISMATCH'`、`failureReason` 指向 `frameworkStateMatched`，且**不计入成功数**；同时断言 UI 不显示成功态。这条专门防「脚本报绿、业务没生效」。
2. **portal 级下拉**：把 Select / DatePicker 面板挂到 body 而非触发器子树，断言 P0 适配器仍能选中目标 option。
3. **valueFormat**：日期控件给出非默认格式时，断言生成值按该格式产出；格式无法解析时断言 `E_VALUE_FORMAT_MISMATCH`，不猜格式写入。
4. **AC-7 联动**：人为用 `MutationObserver` 延迟挂载新字段，断言不用固定 `setTimeout` 也能等到并填充；联动超时时断言 `E_LINKAGE_TIMEOUT` 且其余控件不受影响；唯一性校验字段串行写入，页面不出现请求风暴。
5. **AC-6 误填**：搜索框 / 筛选框 / 已有值 / 只读 / 禁用 / 密码 / 验证码 的写入次数全部为 0；自动提交次数为 0；「已排除 N 项」分组可见且可逐条纳入。
6. **零外发**：浏览器网络面板断言外发请求数 = 0；第 15.4 节三条门禁全部通过；`manifest.permissions` 白名单校验通过；导出 JSON 不含 `faf.counters.v1` 内容。
7. **隔离性**：宿主页控制台零扩展日志；页面全局对象无扩展注入属性；人为让一个策略抛异常后宿主页仍可交互且其余字段继续填充。
8. **阈值**：单页 250 个控件时断言截断到 200 并提示缩小作用域；计划项 120 条时断言启用虚拟滚动；人为增删一个控件后断言漂移提示**恰好出现一次**且给出重新校验入口；低置信度字段标 `unknown` 并进入待绑定态、计 `field_unknown`。
9. **兼容性矩阵**：分别跑 Vue 3 + Ant Design Vue 4.2.6、Vue 3 + Element Plus 2.14.8（P0 必过）、Vue 2.7.16 原生受控控件（回归）、React 受控输入（提交 payload 非空）。Vue 2 组件库非原生控件按 `E_UNSUPPORTED_CONTROL` 跳过并出现在诊断报告。
10. **20 类枚举一致性**：脚本校验 `field-types.json` / `types.ts` / `rules.schema.json` 三处的 20 个 slug 完全一致、生成器 id 与 17.1 表一致；拾取器绑定任一类后断言计划行按同一 slug 回写。
11. **undo 闭环**：填充前快照含空值；撤销后断言 DOM 值、三层可观测证据（DOM 值一致 / 两个渲染帧后未被框架回滚 / 校验态已清除）与原值一致；对 `a-select` / `el-select` / `a-date-picker` / `el-date-picker` 断言显示文本与隐藏 input 同步恢复；页面跳转或弹窗关闭后断言 `UndoState.valid === false`、按钮置灰、文案为「页面已变化，无法撤销」；断言 storage 与计数里没有快照数据。
12. **控件类型与结果列**：预览与结果面板逐行显示 `ControlType` 纯文本；cascader / 远程搜索 select 归类为「下拉」但单列 `E_UNSUPPORTED_CONTROL`，不占成功率分母；字段类型与控件类型两列互不覆盖。
13. **拾取器边界**：tooltip 只含 4 项友好信息且不含任何路径 / 选择器 / 正则；绑定面板无选择器输入框，改绑 <= 3 次点击；元素路径只在诊断报告失败项折叠区出现且可一键定位 / 复制。
14. **图标与注入层**：构建产物断言 Lucide SVG 随包内联、无 CDN 与远程字体请求；注入 UI 在 Shadow DOM 内、固定主题；popup 实测 360x560；4 条 commands 与 `chrome.commands.getAll()` 一致；占用冲突时给出纯文本降级提示。

以上 14 条与第 12 章 12 条合并为 Phase 3 门禁；验证暴露的问题沉淀为回归用例，新坑回写第 2.5 节与第 10 章。

---

## 附录 A：证据索引

| # | 来源 | 取得方式 | 支撑结论 | 等级 |
|---|---|---|---|---|
| E1 | `developer.chrome.com/docs/extensions/develop/concepts/content-scripts` | WebSearch 限定官方域取得原文（WebFetch 直连失败） | isolated world 定义、DOM 共享、postMessage 范式、content scripts 可直接用的 API、`world` 字段 | A |
| E2 | `developer.chrome.com/docs/extensions/reference/scripting/` | WebSearch 限定官方域 | `scripting` 权限 + host_permissions/activeTab、`ExecutionWorld` Chrome 95+、`ScriptInjection` 各字段 Chrome 版本、allFrames/frameIds | A |
| E3 | `developer.chrome.com/docs/extensions/reference/manifest` | WebSearch 限定官方域 | 全部 manifest 键的定义、`manifest_version: 3` 唯一支持值 | A |
| E4 | `developer.chrome.com/docs/extensions/develop/migrate/improve-security` | WebSearch 限定官方域 | MV3 CSP 允许值、禁远程托管代码、禁 eval/new Function | A |
| E5 | `developer.chrome.com/docs/extensions/develop/concepts/activeTab` | WebSearch 限定官方域 | 用户手势清单含 commands 快捷键；activeTab 临时授予主机权限、安装期无警告 | A |
| E6 | `developer.chrome.com/docs/extensions/mv2/reference/commands` | WebSearch 限定官方域 | `_execute_action` 与 `commands` 示例 | A |
| E7 | `wxt.dev/guide/essentials/content-scripts` | WebSearch 限定官方域 | MAIN world 无扩展 API、`injectScript` + `defineUnlistedScript` 推荐、`web_accessible_resources` 写法 | A |
| E8 | `wxt.dev/guide/directory-structure/entrypoints/content-scripts.html` | WebSearch 限定官方域 | `world` / `registration: 'runtime'` 选项及 runtime 会把 matches 加入 host_permissions | A |
| E9 | `registry.npmjs.org/{wxt,vue,vite,typescript,@lucide/vue,@vitejs/plugin-vue,@crxjs/vite-plugin,plasmo,lucide-vue-next}/latest` | WebFetch 原始 JSON | 第 4.1 节全部版本、`engines`、peerDependencies、`lucide-vue-next` deprecated | A |
| E10 | `registry.npmjs.org/-/package/typescript/dist-tags` | WebFetch 原始 JSON | `latest=7.0.2`、`rc=7.0.1-rc`、`beta=7.1.0-beta` | A |
| E11 | StackOverflow 31507490 / 78458309、Bremen 大学扩展安全论文 | WebSearch | DOM expando 属性不跨 world 共享 | B |
| E12 | Vue 3 bundler build feature flags（`__VUE_PROD_DEVTOOLS__` 默认 false）、Vue DevTools issue 190 | WebSearch | 生产构建不暴露组件实例字段 | B |
| E13 | React `inputValueTracking` 源码片段（dev.to / 极客时间）、mockfill / browsermcp / creativeworksofknowledge 实测 | WebSearch | tracker 定义在元素实例、原生 setter + 冒泡 input 的必要性、textarea/checkbox 差异 | B |
| E14 | moderok.dev 引 Chrome 文档「When a content script is injected into the main world, the CSP of the page applies」、StackOverflow 70949491 / 19191679 | WebSearch | MAIN world 受页面 CSP、`files` 注入可用、内联脚本被拒 | B |
| E15 | 本机 Bash 实测 | 命令输出 | 目录现状、node v22.22.2、pnpm 10.2.1 | A |
| E16 | `registry.npmjs.org/{ant-design-vue,element-plus,vue@2,element-ui}/latest` | WebFetch 原始 JSON | 14.4 页面侧兼容锚点、许可证与 peer 依赖；`vue@2.7.16` deprecated 标记 | A |
| E17 | 本地三文档交叉核对（`PRD-v1.md` / `UIUX-v1.md` / `docs/contracts/*`） | Grep 输出 | `E_READBACK_MISMATCH` 归一、20 类 slug 与生成器 id 一致、`field_unknown` 计数事件、UIUX R9 已写死 `@lucide/vue@1.70.0` | A |

> 凡 `B` / `C` 级结论，实现阶段必须用第 12 章的端到端验证复核；复核结果回写本文件，被证伪的条目显式修正而不是删除留痕。
