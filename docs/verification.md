# Verification / 验证

The public standalone package is `dsh-to-figma` **0.2.0**. It continues the local development implementation under the **DSH to Figma** name.

公开的独立包为 `dsh-to-figma` **0.2.0**，承接原本地开发实现，统一品牌为 **DSH to Figma**。

## 0.2.0 local onboarding / 本地接入改造

- Local is the package/schema/runtime default. Startup generates a stable, private paired companion directory and ZIP; public standalone packaging includes no credentials. / 包、配置与运行时默认使用 local，启动时生成稳定的本机私有配对目录及 ZIP；公开通用包不含凭证。
- Companion launch automatically connects; idle failures back off and retry. Handshake retries preserve the connection and active job. Lost operation acknowledgements block reconnect/replay. / 启动自动连接，空闲失败退避重试，重复握手保留连接与当前操作；执行结果确认丢失时停止重连及重放。
- One connected file auto-binds on first canvas use; multiple files and stale bindings require explicit selection. / 单文件首次自动绑定，多文件和失效绑定需要明确选择。
- Automated verification: **33 tests**, including private package permissions, generic ZIP contents, auto-connect/retry, no replay after lost result, document isolation and actual DSH attachment integration. / 33 项测试覆盖权限、打包、自动连接、重试、禁止重放、文档隔离与原生附件。
- New paired-companion real-editor acceptance: pending. DSH 0.2.1-rc.2 installed the new package, started the local bridge and generated its private companion successfully. / 新已配对插件实机验收待完成；DSH 0.2.1-rc.2 已安装新包，成功启动本地桥接并生成专用插件。

## Evidence and limits / 证据与边界

| Surface / 范围 | Status / 状态 |
| --- | --- |
| Unit and protocol suite / 单元与协议测试 | 33 tests: HTTP auth, routing, serialization, cancellation, recovery, assets, OAuth, official MCP transport and companion message/endpoint compatibility / 33 项，覆盖 HTTP 鉴权、路由、串行执行、取消、恢复、素材、OAuth、官方 MCP 传输及配套插件消息/地址兼容性 |
| Native DSH integration / 原生 DSH 集成 | Tested with 0.2.0-rc.2 and 0.2.1-rc.2 services, including the production entry, skills, tools, workspace scope and durable image attachments / 已用两版内核服务验证正式入口、Skill、工具、工作区边界与持久图像附件 |
| Desktop host installation / 桌面宿主安装 | Predecessor 0.1.2 installed through official DSH Desktop 0.2.1-rc.2 CLI; native UI reported running; loopback listener and unauthenticated 401 verified on 2026-10-18 / 前身 0.1.2 于 2026-10-18 经官方 CLI 安装，原生界面显示运行中，本机监听与未授权 401 检查通过 |
| Real Figma editor / 真实 Figma 编辑器 | Companion import, document-name handshake and authenticated local pairing verified on 2026-10-18 with the patched installed development companion. Maintainer screenshots demonstrate UI reconstruction with native layers; full readback/edit/export acceptance remains pending / 2026-10-18 已用修复后的已安装开发插件验证导入、文件名握手与带鉴权的本机配对。维护者截图展示了带原生图层的 UI 重建；完整读回、修改与导出仍待验收 |
| Fonts, FigJam and Slides / 字体、FigJam 与 Slides | Real editor and visual acceptance pending / 待实机与视觉验收 |
| Official desktop MCP / 官方桌面 MCP | Real metadata and screenshot calls passed in installed DSH Desktop 0.2.1-rc.2 without the companion; details below / 已在安装的 DSH Desktop 0.2.1-rc.2 中通过真实读取与截图验收，未运行配套插件，详见下方 |
| Official remote MCP / 官方远程 MCP | Discovery reached Figma; client registration returned HTTP 403 before user authorization. No remote canvas calls verified / 已到达 Figma 服务，客户端注册在用户授权前返回 HTTP 403，未验证任何远程画布调用 |

Automated Figma tests use a simulated Plugin API. A successful fixture screenshot is not proof of real Figma rendering. The desktop MCP acceptance and the maintainer-supplied editing example below are separate real-editor evidence.

自动化 Figma 测试使用模拟 Plugin API。fixture 截图成功不等于真实 Figma 渲染通过；下方桌面 MCP 验收和维护者提供的编辑案例是独立的实机证据。

## Official desktop MCP: real acceptance / 官方桌面 MCP 实机验收

**Date / 日期:** 2026-10-18. **Host / 宿主:** installed DSH Desktop 0.2.1-rc.2 on macOS. The installed development plugin was configured with `backend: desktop` and the app restarted. Its transport was already present in the installed 0.1.2 package; version 0.1.5 made desktop the default, while 0.2.0 returns to local mode with automatic pairing. A separate native-service run used the repository plugin with pinned 0.2.1-rc.2 services. These are real Figma calls, distinct from the automated fixtures.

实测使用 macOS 上已安装的 DSH Desktop 0.2.1-rc.2，将开发插件设为 `backend: desktop` 后重启。该传输能力已包含在安装的 0.1.2 包中；0.1.5 曾将桌面模式设为默认；0.2.0 改为带自动配对的本地模式。另一路验证使用仓库插件和锁定的 0.2.1-rc.2 原生服务。两路均调用真实 Figma，区别于自动化 fixture。

| Check / 检查 | Actual result / 实际结果 |
| --- | --- |
| Figma service / 服务 | Built-in desktop MCP enabled at `http://127.0.0.1:3845/mcp`; listener owned by Figma / Figma 内置服务监听 |
| Companion / 配套插件 | Not running; no listener on bridge port 3055 after DSH restart / 未运行，DSH 重启后桥接端口 3055 无监听 |
| Native status / 原生状态 | `backend: desktop`, `available: true`, 10 official tools, `bridgePort: null` |
| Metadata / 元数据 | `get_metadata` returned frame `1:4`, **DeepSeek Harness — Desktop UI**, **1440 × 900**, with Sidebar **324 × 900** and Main **1116 × 900** |
| Screenshot / 截图 | `get_screenshot` returned a **1024 × 640 WebP**, **37,226 bytes**, admitted as a native DSH image attachment / 成功进入原生图像附件存储 |
| Actual conversation / 实际对话 | Tool details inspected; screenshot displayed in installed DSH. Its attachment hash matched the separate native-service run / 已核对工具详情并显示图片，附件哈希与独立原生服务验证一致 |
| Canvas writes / 画布写入 | None performed. Official desktop MCP does not provide general canvas writing / 本次未写入，官方桌面 MCP 不提供通用画布写入 |

[Actual returned image / 实际返回截图](../assets/examples/desktop-mcp-screenshot.webp) · [Sanitized evidence / 脱敏验证记录](evidence/desktop-mcp-2026-10-18.json)

Reproduce with the intended file open: enable desktop MCP, configure/reload the DSH desktop backend, then in a Work conversation call `figma_status`, `mcp__figma__get_metadata` and `mcp__figma__get_screenshot` using that file’s frame node ID. Inspect the actual tool results and image attachment. IDs are file-scoped; do not reuse this example’s ID in a different file. Tool discovery alone does not verify the other eight tools, other plans, FigJam/Slides, reconnect stability or long-running use.

复现时打开目标文件，启用桌面 MCP，配置并重载 DSH 桌面后端，在 Work 会话依次调用上述三个工具并传入该文件的画板节点 ID，核对真实返回值及图片附件。节点 ID 属于文件内部标识，不应跨文件复用本例 ID。工具发现不能证明其余八个工具、其他套餐、FigJam / Slides、重连稳定性或长期运行均已通过。

## Official remote access attempt / 官方远程接入尝试

On 2026-10-18, OAuth discovery succeeded, but POST to `https://api.figma.com/v1/oauth/mcp/register` returned **403 Forbidden** for the DSH client. Retrying with an advertised client authentication method (`client_secret_post`) also returned 403. No authorization URL, user grant or tokens were obtained; remote reading, writing and screenshots were **not run**. The response did not provide a detailed rejection reason. Figma’s [official guide](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) restricts new clients to approved access and links a [client waitlist](https://form.asana.com/?d=10497086658021&k=kBG-ejRQTdY8x_H6a4vM3Q).

2026-10-18，OAuth 发现成功，但 DSH 客户端注册请求返回 **403 Forbidden**；采用服务器声明支持的 `client_secret_post` 认证方式重试仍为 403。未获得授权 URL、用户授权或令牌，远程读取、写入及截图**均未执行**。响应未提供更具体的拒绝原因。官方文档要求新客户端获批，并提供申请入口。错误诊断现在区分注册拒绝与需要登录，不输出敏感响应内容。

## Real example: screenshot to editable UI / 实机案例：从截图到可编辑 UI

On 2026-10-18 the maintainer supplied a [DSH request screenshot](../assets/examples/screenshot-to-ui-prompt.png) and a [Figma result screenshot](../assets/examples/screenshot-to-ui-figma.png). The request asks to recreate only the reference app UI on the selected frame. The Figma result shows a 1440 × 900 desktop UI with separate text, frame and vector layers, including the sidebar, conversation and message composer.

2026-10-18，维护者提供了 [DSH 请求截图](../assets/examples/screenshot-to-ui-prompt.png)和 [Figma 结果截图](../assets/examples/screenshot-to-ui-figma.png)。请求要求在选中画板上仅绘制参考应用 UI；结果展示了 1440 × 900 桌面界面，包含独立文字、Frame、矢量图层，以及侧边栏、对话和输入区。

The request screenshot shows a stopped conversation, not a completed tool trace. The result is visual evidence of this case, not proof of every intermediate tool call, pixel-perfect fidelity, screenshot export, or reconnect behavior.

请求截图中的对话状态为已停止，并非完整的已完成工具轨迹。结果图可作为本案例的视觉证据，不能据此推断每个中间工具调用、逐像素还原、截图导出或重连行为均已通过。

## 0.1.4 connection regression / 连接回归

Version 0.1.4 included the localhost manifest/UI endpoint and exact bridge Host allowlist, plus the Figma outer-window message fix. HTTP tests reject lookalike hosts and wrong ports. UI tests cover document metadata and operation results, reject unrelated message sources/origins, and check that the manifest permits the endpoint used by the UI.

0.1.4 版包含 localhost 清单/UI 地址、桥接 Host 精确白名单，以及 Figma 外层窗口消息修复。HTTP 测试拒绝仿冒主机名与错误端口；UI 测试覆盖文件信息与操作结果、拒绝无关消息来源，并检查清单允许 UI 使用的连接地址。

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
