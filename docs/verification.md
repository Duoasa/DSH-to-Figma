# Verification / 验证

The public standalone package is `dsh-to-figma` **0.1.3**. It continues the local `@scoder/dsh-plugin-figma` 0.1.2 implementation under the **DSH to Figma** name.

公开的独立包为 `dsh-to-figma` **0.1.3**，承接原本地开发包 `@scoder/dsh-plugin-figma` 0.1.2，统一品牌为 **DSH to Figma**。

## Evidence and limits / 证据与边界

| Surface / 范围 | Status / 状态 |
| --- | --- |
| Unit and protocol suite / 单元与协议测试 | 21 tests: HTTP auth, routing, serialization, cancellation, recovery, assets, OAuth and official MCP transport / 21 项，覆盖 HTTP 鉴权、路由、串行执行、取消、恢复、素材、OAuth 与官方 MCP 传输 |
| Native DSH integration / 原生 DSH 集成 | Tested with 0.2.0-rc.2 and 0.2.1-rc.2 services, including the production entry, skills, tools, workspace scope and durable image attachments / 已用两版内核服务验证正式入口、Skill、工具、工作区边界与持久图像附件 |
| Desktop host installation / 桌面宿主安装 | Predecessor 0.1.2 installed through official DSH Desktop 0.2.1-rc.2 CLI; native UI reported running; loopback listener and unauthenticated 401 verified on 2026-10-18 / 前身 0.1.2 于 2026-10-18 经官方 CLI 安装，原生界面显示运行中，本机监听与未授权 401 检查通过 |
| Real Figma editor / 真实 Figma 编辑器 | **Pending:** companion import, actual canvas reads/writes and screenshots / **待验证：** 配套插件导入、真实画布读写与截图 |
| Fonts, FigJam and Slides / 字体、FigJam 与 Slides | Real editor and visual acceptance pending / 待实机与视觉验收 |
| Official Figma service / 官方 Figma 服务 | SDK transport tested against a local protocol fixture; real client approval/OAuth/account/seat access pending / SDK 传输已通过本地协议 fixture 验证，真实客户端审批、OAuth、账号与席位权限待验 |

Automated Figma tests use a simulated Plugin API. A successful fixture screenshot is not proof of real Figma rendering. The current preview has no real-canvas demo screenshot for that reason.

自动化 Figma 测试使用模拟 Plugin API。fixture 截图成功不等于真实 Figma 渲染通过，因此当前预览版没有提供真实画布演示截图。

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
