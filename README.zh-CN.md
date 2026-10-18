<div align="center">

# DSH to Figma

**把 Figma 画布能力接入 DeepSeek Harness。**

默认通过 Figma 官方桌面 MCP 读取设计和获取截图，无需运行配套插件；可选本地模式支持编辑画布。

[![Checks](https://github.com/Duoasa/DSH-to-Figma/actions/workflows/ci.yml/badge.svg)](https://github.com/Duoasa/DSH-to-Figma/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Stage](https://img.shields.io/badge/status-preview-orange)](docs/verification.md)

[English](README.md) · **简体中文**

[快速开始](#快速开始) · [工具列表](#工具列表) · [配置](#配置) · [验证记录](docs/verification.md)

</div>

## 为什么使用 DSH to Figma

- **原生 DSH 插件。** 工具、设计 Skill 和图像附件均使用宿主扩展机制，无需修改 Agent 主循环；支持 **0.2.0-rc.2** 与 **0.2.1-rc.2** 版 DSH 内核。
- **可选的画布编辑（`local`）。** 配套 Figma 插件在选定文档中执行公开 Plugin API，创建和修改 Frame、文字、自动布局、组件、变体、样式与变量。
- **从设计到代码。** 读取图层结构、布局、CSS 与素材，让宿主 Agent 在当前工作区中实现界面。
- **视觉反馈。** 画布截图通过 DSH 原生图像附件机制传递。模型不支持图像时明确报告限制，不会假装完成视觉检查。
- **默认使用官方桌面 MCP。** 直接连接 Figma 内置服务，无需运行配套插件；本地配套插件编辑和获批后的远程 OAuth 接入作为可选模式。

> **2026-10-18 实测通过：** 已安装的 DSH Desktop **0.2.1-rc.2** 通过官方桌面 MCP 读取真实 Figma 画板，并在对话中显示截图，全程未运行配套插件。桌面模式**不支持画布写入**。远程客户端注册在用户授权前返回 **HTTP 403**，因此远程读写与截图仍未验证。本项目为独立集成，不宣称完整复刻 Codex 能力。详见[验证记录](docs/verification.md)。

## 使用示例

### 官方桌面 MCP 读取与截图（默认）

在 DSH Work 会话中，提供当前 Figma 文件内目标画板的链接：

> 使用官方桌面 MCP，先检查 figma_status，再读取这个画板的元数据并返回截图，不要修改画布。

实测发现 **10 个官方工具**，状态为 `backend: desktop`、`available: true`、`bridgePort: null`。`get_metadata` 成功读取 **DeepSeek Harness — Desktop UI**，节点 `1:4`，尺寸 **1440 × 900**，以及 Sidebar、Main 等内部图层。`get_screenshot` 返回 **1024 × 640 WebP**，进入 DSH 原生图片附件存储，并在实际对话中显示。下图就是该次 MCP 返回的图片；验收没有修改画布。

![DSH 通过官方桌面 MCP 实际获取的画板截图](assets/examples/desktop-mcp-screenshot.webp)

### 从参考截图重建可编辑的 Figma 界面（可选本地模式）

此早期写入案例使用 `backend: local` 并运行配套插件，不属于官方桌面 MCP 的能力。在 DSH 中提供参考截图，在已连接的 Figma 文件中选中目标画板，再用自然语言描述绘制要求：

> 把这个 UI 绘制在我选中的画板上，注意只绘制 UI。

**1. 在 DSH 中提供参考图与指令。** 本例使用 DeepSeek Harness 桌面应用截图。Agent 识别选中的画板，计划按 1440 × 900 重建应用界面，并去除外围桌面背景。

![在 DSH 中提供参考截图和自然语言绘制指令](assets/examples/screenshot-to-ui-prompt.png)

**2. 在 Figma 中得到可编辑结果。** 画布呈现了侧边栏、对话区和消息输入区。左侧图层面板展示了独立的文字、Frame 和矢量图层，选中画板的尺寸为 1440 × 900，可以继续选择和调整其中的元素。

![Figma 中重建的桌面界面、原生图层及 1440 × 900 画板](assets/examples/screenshot-to-ui-figma.png)

以上截图由维护者提供，来自 2026-10-18 的实际运行，展示了这次从截图到 UI 的案例；不代表逐像素一致性或所有工具、编辑器模式均已验收。

## 工作原理

```mermaid
flowchart LR
    A[DSH 工具与 Skill] -->|默认 desktop| B[Figma 内置 MCP :3845]
    B --> C[读取设计与截图]
    A -. 可选 local .-> D[配对插件 :3055]
    D --> E[画布编辑]
    A -. 可选 remote .-> F[官方远程 MCP 与获批 OAuth]
```

默认连接 `http://127.0.0.1:3845/mcp`。保持 Figma 桌面应用打开并启用内置 MCP 即可，无需配套插件、配对密钥或远程 OAuth 登录。请打开目标文件并提供节点 ID 或选区链接；桌面工具使用桌面编辑器中的文件上下文。连接失败时不会自动切换到本地或远程模式。

## 快速开始

### 1. 安装 DSH 插件

准备 Git、用于开发的 **Node.js 24+**、兼容的 DSH 宿主，以及可使用内置桌面 MCP 的 Figma 桌面应用。[官方条件](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)为 Professional、Education、Organization、Government 或 Enterprise 套餐中的 Dev 或 Full 席位。插件声明 Node 22+，实际请使用宿主要求的 Node 版本。已测试的 DSH 内核为 **0.2.0-rc.2** 和 **0.2.1-rc.2**。

当前通过 GitHub 源码分发，**尚未发布到 npm**。克隆仓库后安装本地目录：

```sh
git clone https://github.com/Duoasa/DSH-to-Figma.git
cd DSH-to-Figma
dsh plugin --profile web add "file:$PWD"
```

将 `web` 换成实际使用的 profile。运行时依赖由宿主包管理器安装；仓库已包含生成后的 Figma 插件入口，安装时无需构建。

**官方 macOS DSH Desktop：** 使用桌面应用自带的 CLI 管理保留的 `desktop` profile。如果应用位于下方路径：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:$PWD"
```

应用路径不同时请相应调整。全局安装的另一份 `dsh` 可能版本较旧，且拒绝管理 `desktop`。也可以在 DSH 原生插件管理器中添加仓库的绝对路径。

打开 **插件 → DSH to Figma**，确认组件显示**运行中**。未自动重载时重启宿主。安装命令成功不等于插件已正常运行。

请使用兼容 DSH 内核宿主对应的 CLI、profile 和 `DSH_HOME`。如果已安装此插件的早期开发版本，请先禁用或移除，再启用当前包；重复版本使用相同的入口 ID 和桥接端口。

### 2. 启用 Figma 官方桌面 MCP

1. 在 Figma 桌面端打开目标 Design 文件。
2. 在 Dev Mode 中启用 **desktop MCP server**。本次实测也可通过 **Cmd+K → 搜索“MCP” → Enable desktop MCP server** 开启。
3. 确认 Figma 提示服务地址为 `http://127.0.0.1:3845/mcp`。
4. 在具有工作区的 DSH **Work 会话**中调用 `figma_status`，应返回 `backend: desktop`、`available: true`；如果先启动了 DSH，再启用 Figma MCP，调用 `figma_reconnect` 即可重新发现工具。

这条流程不需要导入或运行配套插件。桌面模式下 `documents: []`、`bridgePort: null` 属于正常状态；`figma_select_document` 仅用于本地模式。

### 3. 读取画板并获取截图

> 读取 figma-workbench Skill。检查 figma_status，然后读取这个画板链接对应节点的元数据并获取截图：<Figma 选区链接>。报告画板名称、尺寸和主要图层，不要修改画布。如果模型无法接收图片，请明确说明。

需要**编辑画布**时，显式设置 `backend: local`，按[配套插件接入说明](docs/setup.md#optional-local-companion--可选本地配套插件)操作。远程画布写入需要 Figma 客户端准入及成功的 OAuth 授权；本次远程尝试在用户授权前即被拒绝。

## 工具列表

默认桌面模式动态提供官方工具目录。本次实测发现 **10 个工具**，其中 `get_metadata` 与 `get_screenshot` 已在真实画布上执行；发现其他工具不代表它们均已实测或当前账号具有所有权限。桌面模式没有 `use_figma` 画布写入工具。

可选本地模式提供 **17 个画布工具**，名称前缀为 `mcp__figma__…`，另有 4 个配对与指南工具。

| 工作流 | 本地工具 |
| --- | --- |
| 画布脚本 | `use_figma`、`import_scene` |
| 结构检查 | `get_selection`、`list_fonts`、`get_metadata` |
| 截图与设计上下文 | `get_screenshot`、`get_design_context`、`get_figjam` |
| 设计系统 | `get_variable_defs`、`get_libraries`、`search_design_system`、`get_component_context` |
| 组件与代码引用 | `get_local_component_links`、`set_local_component_links` |
| 动效信息 | `get_motion_context` |
| 素材传输 | `upload_assets`、`download_assets` |
| 配对与指南 | `figma_status`、`figma_select_document`、`figma_read_guide`、`figma_reconnect` |

内置 `figma-workbench` Skill，并附带画布脚本、设计转代码、组件与变量、素材与场景、FigJam / Slides、官方服务等专项指南。本地组件引用保存在插件数据中，**不等同于发布 Code Connect 映射**。设计系统搜索按实际实现覆盖本地范围，不是全云端搜索。公开 API 脚本可面向 Design、FigJam 和 Slides；各编辑器的实机验收仍待完成。

云端专属能力及工具协议差异见[能力矩阵](CAPABILITIES.md)。

## 配置

通过宿主原生插件配置设置 `dsh-figma` 入口。下表是**入口 config 字段**，不是完整的 profile patch：

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `backend` | `desktop` | `local`、`desktop` 或 `remote` |
| `bridgePort` | `3055` | 本机配套插件桥接端口 |
| `desktopServerUrl` | `http://127.0.0.1:3845/mcp` | 官方桌面 MCP 地址 |
| `toolCallTimeoutMs` | `120000` | 工具超时，范围 1–300 秒 |
| `oauthClientId` | 空 | 需要时填写已获批的远程 OAuth client ID |

修改 `bridgePort` 时，还必须同步修改配套插件 UI 地址及 manifest 的 `devAllowedDomains`。没有明确需求时，保持 `3055`。

- **桌面模式（默认）：** 开启 Figma 桌面 MCP 服务，再调用 `figma_reconnect` 刷新。旧安装若显式配置了 `backend: local`，需要改成 `desktop` 后重载或重启；升级不会覆盖用户已有选择。
- **远程模式：** 通过 `dsh-figma login` 登录，设置 `backend: remote`。能力取决于 Figma 客户端审批、账号、席位和服务器实际工具列表，不复用 Codex 凭证。
- **禁用：** 使用宿主插件管理器，或设置环境变量 `DSH_FIGMA_DISABLED=1` 后启动宿主。

[详细接入、OAuth 和故障排查 →](docs/setup.md)

## 数据与执行边界

- 本地服务仅监听 loopback，检查 Host / Origin，每个请求都需要配对密钥。密钥保存在 `DSH_HOME/figma` 下，使用私有文件权限；Figma 插件仅在内存中保存它。
- Figma 脚本通过公开 Plugin API 在编辑器中执行。DSH 插件本身与其他原生插件一样，以宿主进程权限运行。
- 可选本地模式下，目标文档必须明确绑定，同一文档操作串行执行；结果未知的写入不会自动重放。画布修改不是事务。
- 素材上传不能超出当前 Work 工作区，导出写入全新的 `.figma/assets/<batch>/` 目录。截图作为对话内容，可能发送给你配置的模型提供方。
- OAuth 凭证保存在私有本地文件中，**没有使用系统钥匙串加密**。`dsh-figma logout` 删除本地凭证；如需让服务器授权失效，还要在 Figma 中撤销应用访问。

## 开发

```sh
npm ci --ignore-scripts
npm run test:all
npm pack --ignore-scripts
```

`check` 会从源文件重新生成 `companion/code.js`，检查语法和包内容。测试覆盖 HTTP 鉴权、文档队列、取消与恢复、素材、OAuth、官方 MCP 发现，以及真实 DSH 服务与附件集成。自动化中的 Figma API 使用模拟 fixture。

```text
index.mjs             原生 DSH 插件入口
cli.mjs               安装、配对与 OAuth 辅助命令（dsh-figma）
lib/                  桥接、工具目录、素材和官方传输
companion/            Figma 开发插件，包含生成后的 code.js
skills/               工作流 Skill 与专项指南
test/                 单元、协议与原生 DSH 集成测试
docs/                 接入与验证说明
```

使用其他已安装内核的方式见[验证说明](docs/verification.md)。欢迎提交改进与可复现的问题；请附上 DSH 版本、backend 和错误信息，并删除密钥及私人设计数据。

## 致谢与许可

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[Figma Plugin API](https://developers.figma.com/docs/plugins/api/figma/) 和 [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) 构建。

README 结构参考社区项目 [dsh-context](https://github.com/bowenliang123/dsh-context)、[dsh-plugin-shop](https://github.com/LivXue/dsh-plugin-shop) 和 [dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil)，本仓库未打包它们的代码或截图。

[MIT](LICENSE) · Copyright © 2026 Duoasa.
