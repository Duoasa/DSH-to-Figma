<div align="center">

![DSH to Figma](assets/readme-hero.png)

# DSH to Figma

**用自然语言读懂、创建和修改 Figma 设计。**

连接 DeepSeek Harness 与 Figma，把需求、参考图和设计稿变成可以继续编辑的画布。

[![Release](https://img.shields.io/github/v/release/Duoasa/DSH-to-Figma)](https://github.com/Duoasa/DSH-to-Figma/releases/latest)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)
[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-已收录-brightgreen)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/Duoasa__DSH-to-Figma.yml)

**简体中文** · [English](README.en.md) · [日本語](README.ja.md)

[提示词安装](#安装把下面这段话发给-dsh) · [能做什么](#能做什么) · [实机演示](#实机演示) · [手动安装](#手动安装)

</div>

**本地模式不消耗官方 Figma MCP 调用额度。** DSH 会自动生成本机已配对的 Figma 插件，首次导入一次，之后运行即可连接。

## 安装：把下面这段话发给 DSH

推荐直接让 DSH 完成下载、校验和安装。打开当前使用的 DSH，复制发送：

```text
帮我安装或升级 DSH to Figma：
https://github.com/Duoasa/DSH-to-Figma

请按仓库最新 README 完成以下操作：
1. 从当前宿主配置和运行环境确认对应的 CLI、profile 与 DSH_HOME，使用这个宿主的 CLI。保留其他插件和现有配置；只有无法确定安装目标时才问我。
2. 从 GitHub 最新正式 Release 获取 dsh-to-figma-<版本>.tgz 和 SHA256SUMS，核对 SHA-256。使用 Release 安装包，不要猜测 npm 包版本，也不要把独立 Figma ZIP 当成 DSH 安装包。
3. 通过宿主原生 plugin --profile <当前 profile> add 命令安装或升级，使用 local 模式。若已有旧版，原位升级；仅在确认有重复入口时处理重复项。
4. 检查插件组件是否运行、工具是否可用。需要重启宿主时告诉我，重启后继续完成连接。
5. 调用 figma_setup，给我本机已配对插件 manifest.json 的完整路径，指导我在 Figma 桌面端导入并运行 DSH to Figma · Local。已导入过则更新原目录，关闭旧插件后重新运行。不要显示配对密钥或上传已配对文件。
6. 等我打开目标 Figma 文件并运行插件后，调用 figma_status，确认两端版本和连接状态。多文件时确认目标，再读取我选中的画板并返回截图；这一步不修改已有设计。
```

首次连接时，在 Figma 桌面端选择 **Plugins → Development → Import plugin from manifest…**，导入 DSH 给出的 `manifest.json`。在目标文件中运行 **DSH to Figma · Local**，保持插件窗口打开即可。

通常路径为 `~/.dsh/figma/companion/manifest.json`，以 `figma_setup` 返回的路径为准。升级后，两端插件需要同步更新；保留原导入目录，关闭并重新运行 Figma 插件。

## 能做什么

| 需求 | 使用方式 |
| --- | --- |
| 读懂已有设计 | 读取选中画板、图层结构、文字、尺寸、布局、样式与截图 |
| 从需求或参考图开始 | 创建原生画板、文字、矢量和自动布局，继续细化设计 |
| 调整与批量修改 | 修改文案、颜色、字号、间距、圆角和布局，按名称、属性或层级定位图层 |
| 组件与设计系统 | 创建和修改组件、变体、实例属性、样式、变量、模式及别名，绑定设计变量 |
| 设计稿到代码 | 让 DSH 结合画板信息、素材和当前项目生成或调整前端页面 |
| 素材交付 | 导入图片和 SVG，导出 PNG、JPG、SVG、PDF，保存脚本生成的文件 |
| FigJam、Slides 与交互 | 结合目标文件类型，组织图形、连接线、演示内容和原型交互 |

你可以直接这样说：

> 读取选中的设置页，把主按钮统一为 40px 高、8px 圆角，调整后给我截图。

> 复用已有颜色变量和按钮组件，新建一个浅色仪表盘，用自动布局组织内容。

> 为这个按钮补充悬停和禁用状态，并把颜色绑定到对应的语义变量。

> 参考这张截图，在新画板中重建界面，文字和布局保留为可编辑图层。

> 读取这个画板，在当前项目中实现页面，复用项目已有组件，并把所需素材导出到资源目录。

插件负责连接画布与工具，具体设计方案由你使用的模型结合需求完成。可以继续通过对话修改，也可以回到 Figma 手动调整。

## 实机演示

下面是一组连续操作：读取现有深色界面，在新画板中生成浅色版，再继续探索终端风格。截图来自 2026 年 10 月 19 日的实际使用。

### 1. 读取选中的画板

> 现在能看到我选中的画板吗？

DSH 返回画板名称、节点 ID、1440 × 900 的尺寸、图层结构和截图，确认接下来操作的目标。

![DSH 读取选中画板并返回结构与截图](assets/examples/read-selected-artboard.png)

### 2. 保留原稿，新建浅色版本

> 把这个 UI 改成浅色模式，放在一个新画板里。

深色原稿保留，浅色版放到独立画板。Figma 左侧仍能看到文字、侧边栏、消息区等图层，可以继续选择和编辑。

![Figma 中并列保留的深色原稿与浅色改版](assets/examples/light-mode-figma.png)

<details>
<summary>查看 DSH 中的指令与返回结果</summary>

![在 DSH 对话中生成浅色版本](assets/examples/light-mode-conversation.png)

</details>

### 3. 继续探索终端风格

> 给这个浅色模式的 UI 改成终端风格的设计，放在一个新的画板。

在新的画板中调整为深色背景、绿色强调色和等宽文字，保留之前的版本，方便来回比较。

![Figma 中的终端风格设计与可编辑图层](assets/examples/terminal-style-figma.png)

<details>
<summary>查看 DSH 中的指令与返回结果</summary>

![在 DSH 对话中继续生成终端风格版本](assets/examples/terminal-style-conversation.png)

</details>

## 手动安装

从 [最新 Release](https://github.com/Duoasa/DSH-to-Figma/releases/latest) 下载 DSH 安装包与 `SHA256SUMS`，校验后使用当前宿主的 CLI 安装。

**macOS DSH Desktop：**

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:/绝对路径/dsh-to-figma-0.3.0.tgz"
```

**其他 DSH 宿主：**

```sh
dsh plugin --profile <你的-profile> add "file:/绝对路径/dsh-to-figma-0.3.0.tgz"
```

把路径和 profile 替换为实际值。桌面版优先使用应用自带 CLI，避免调用另一份旧版全局 `dsh`。安装后在插件面板确认 **DSH to Figma → 运行中**，再让 DSH 调用 `figma_setup` 完成配对。

DSH 会生成已经配对的 Figma 插件，日常安装不需要额外下载 ZIP。Release 中的 `DSH-to-Figma-companion-0.3.0.zip` 是手动配对备用包。DSH 在本机生成的已配对目录与 ZIP 含配对凭证，请保留在本机；Release 中的通用 ZIP 不含凭证。

## 连接与配置

默认使用 `local` 模式：DSH 与 Figma 配套插件通过本机服务连接。单文件连接后自动选用，多文件时明确选择操作目标。

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `backend` | `local` | 选择 `local`、`desktop` 或 `remote` |
| `bridgePort` | `3055` | 本地连接端口 |
| `toolCallTimeoutMs` | `120000` | 单次工具调用超时，单位毫秒 |
| `desktopServerUrl` | `http://127.0.0.1:3845/mcp` | 桌面 MCP 地址 |
| `oauthClientId` | 空 | 远程登录所需的客户端配置 |

通过宿主插件管理器调整配置。[详细接入与配置说明](docs/setup.md)。

如果升级后未发现工具，先确认正在使用正确的宿主和 profile，检查插件面板，再重载或重启 DSH。Figma 端也要关闭旧插件后重新运行。反馈问题时请附上两端版本和错误信息。

## 开发与贡献

```sh
npm ci --ignore-scripts
npm run test:all
npm run package:companion
npm pack --ignore-scripts
```

源码包括 DSH 插件入口、连接桥接、Figma companion 和工作流 Skill。欢迎提交改进建议或可复现的问题。

感谢 [heeq666](https://github.com/heeq666) 与 [miztizm](https://github.com/miztizm) 对宿主兼容性的反馈和贡献。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[Figma Plugin API](https://developers.figma.com/docs/plugins/) 和 [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) 构建。

[MIT](LICENSE) · Copyright © 2026 Duoasa.
