# Verification / 验证

The public standalone package is `dsh-to-figma` **0.1.4**. It continues the local development implementation under the **DSH to Figma** name.

公开的独立包为 `dsh-to-figma` **0.1.4**，承接原本地开发实现，统一品牌为 **DSH to Figma**。

## Evidence and limits / 证据与边界

| Surface / 范围 | Status / 状态 |
| --- | --- |
| Unit and protocol suite / 单元与协议测试 | 23 tests: HTTP auth, routing, serialization, cancellation, recovery, assets, OAuth, official MCP transport and companion message/endpoint compatibility / 23 项，覆盖 HTTP 鉴权、路由、串行执行、取消、恢复、素材、OAuth、官方 MCP 传输及配套插件消息/地址兼容性 |
| Native DSH integration / 原生 DSH 集成 | Tested with 0.2.0-rc.2 and 0.2.1-rc.2 services, including the production entry, skills, tools, workspace scope and durable image attachments / 已用两版内核服务验证正式入口、Skill、工具、工作区边界与持久图像附件 |
| Desktop host installation / 桌面宿主安装 | Predecessor 0.1.2 installed through official DSH Desktop 0.2.1-rc.2 CLI; native UI reported running; loopback listener and unauthenticated 401 verified on 2026-10-18 / 前身 0.1.2 于 2026-10-18 经官方 CLI 安装，原生界面显示运行中，本机监听与未授权 401 检查通过 |
| Real Figma editor / 真实 Figma 编辑器 | Companion import, document-name handshake and authenticated local pairing verified on 2026-10-18 with the patched installed development companion. Maintainer screenshots demonstrate UI reconstruction with native layers; full readback/edit/export acceptance remains pending / 2026-10-18 已用修复后的已安装开发插件验证导入、文件名握手与带鉴权的本机配对。维护者截图展示了带原生图层的 UI 重建；完整读回、修改与导出仍待验收 |
| Fonts, FigJam and Slides / 字体、FigJam 与 Slides | Real editor and visual acceptance pending / 待实机与视觉验收 |
| Official Figma service / 官方 Figma 服务 | SDK transport tested against a local protocol fixture; real client approval/OAuth/account/seat access pending / SDK 传输已通过本地协议 fixture 验证，真实客户端审批、OAuth、账号与席位权限待验 |

Automated Figma tests use a simulated Plugin API. A successful fixture screenshot is not proof of real Figma rendering. The real-editor example below is separate, maintainer-supplied evidence.

自动化 Figma 测试使用模拟 Plugin API。fixture 截图成功不等于真实 Figma 渲染通过；下方实机案例是维护者单独提供的证据。

## Real example: screenshot to editable UI / 实机案例：从截图到可编辑 UI

On 2026-10-18 the maintainer supplied a [DSH request screenshot](../assets/examples/screenshot-to-ui-prompt.png) and a [Figma result screenshot](../assets/examples/screenshot-to-ui-figma.png). The request asks to recreate only the reference app UI on the selected frame. The Figma result shows a 1440 × 900 desktop UI with separate text, frame and vector layers, including the sidebar, conversation and message composer.

2026-10-18，维护者提供了 [DSH 请求截图](../assets/examples/screenshot-to-ui-prompt.png)和 [Figma 结果截图](../assets/examples/screenshot-to-ui-figma.png)。请求要求在选中画板上仅绘制参考应用 UI；结果展示了 1440 × 900 桌面界面，包含独立文字、Frame、矢量图层，以及侧边栏、对话和输入区。

The request screenshot shows a stopped conversation, not a completed tool trace. The result is visual evidence of this case, not proof of every intermediate tool call, pixel-perfect fidelity, screenshot export, or reconnect behavior.

请求截图中的对话状态为已停止，并非完整的已完成工具轨迹。结果图可作为本案例的视觉证据，不能据此推断每个中间工具调用、逐像素还原、截图导出或重连行为均已通过。

## 0.1.4 connection regression / 连接回归

The release includes the localhost manifest/UI endpoint and exact bridge Host allowlist, plus the Figma outer-window message fix. HTTP tests reject lookalike hosts and wrong ports. UI tests cover document metadata and operation results, reject unrelated message sources/origins, and check that the manifest permits the endpoint used by the UI.

本版包含 localhost 清单/UI 地址、桥接 Host 精确白名单，以及 Figma 外层窗口消息修复。HTTP 测试拒绝仿冒主机名与错误端口；UI 测试覆盖文件信息与操作结果、拒绝无关消息来源，并检查清单允许 UI 使用的连接地址。

Manual pairing reproduction: import the installed companion manifest in Figma desktop, run it in a test Design file, paste the same host's existing pairing token, and click Connect. Confirm the document name, Disconnect button and connected status. Keep the companion open. This verifies pairing only, not canvas operations.

手动配对复现：在 Figma 桌面端导入已安装插件的清单，在测试 Design 文件中运行，粘贴同一宿主已有的配对密钥并连接。核对文件名、断开按钮和已连接状态，保持插件打开。此检查仅证明配对成功，不代表画布操作已验收。

## Reproduce / 复现

```sh
npm ci --ignore-scripts
npm run test:all
```

The native test uses the repository's pinned development dependencies by default. To test against an existing runtime, both the plugin and test services must resolve to that runtime (one Cordis service graph). One way is to unpack `npm pack` output into a temporary directory, link its `node_modules` to that runtime, and use:

原生测试默认使用仓库锁定的开发依赖。若测试其他已安装内核，插件和测试服务必须解析到同一内核，保持单一 Cordis 服务图。可将 `npm pack` 的包解压至临时目录，把其 `node_modules` 链接到目标内核，然后执行：

```sh
DSH_FIGMA_TEST_RUNTIME=/absolute/runtime \
DSH_FIGMA_TEST_ENTRY=/absolute/unpacked/package/index.mjs \
node test/native.mjs
```

No model calls or real Figma account calls are made by these tests. Use the Node version required by the selected DSH runtime.

这些测试不调用模型或真实 Figma 账号。请使用对应 DSH 内核要求的 Node 版本。

## Real-editor acceptance / 实机验收

When ready to connect the companion, use a dedicated test file:

准备接通配套插件时，在独立测试文件中执行：

1. Import and pair; confirm the file name in `figma_status`. / 导入、配对，在状态中核对文件名。
2. Bind explicitly; read page metadata. / 明确绑定，读取页面结构。
3. Create a frame and text; record returned IDs. / 创建 Frame 与文字，记录 ID。
4. Read them back, change the text/fill, and verify the new values. / 读回内容，修改文字与填充，再核对值。
5. Export a screenshot and inspect the actual image and native layers. / 导出截图，检查真实图片与原生图层。
6. Disconnect/reconnect and verify a fresh binding is required. / 断开、重连，验证必须重新绑定。

Record actual outcomes, host/editor versions and failures. Remove credentials and private document details from any shared evidence.

如实记录结果、宿主与编辑器版本及失败情况；共享证据前删除密钥与私人文档信息。
