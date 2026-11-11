<div align="center">

![DSH to Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/readme-hero.gif)

# DSH to Figma

**用自然语言读懂、创建和修改 Figma 设计。**

[![npm](https://img.shields.io/npm/v/dsh-to-figma)](https://www.npmjs.com/package/dsh-to-figma)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)

**简体中文** · [English](README.en.md) · [日本語](README.ja.md)

[提示词安装（推荐）](#提示词安装) · [npm 安装](#npm-安装) · [功能](#功能) · [实机演示](#实机演示)

</div>

连接 DeepSeek Harness 与 Figma，以本地插件为默认链路，保留官方 MCP 接入。本地模式不消耗官方 Figma MCP 调用额度。

## 提示词安装

**推荐使用提示词安装**，让 DSH 完成安装与连接引导。复制下面这段话发给 DSH：

```text
帮我安装或升级 DSH to Figma：
https://github.com/Duoasa/DSH-to-Figma

按仓库的 docs/setup.md，使用当前宿主的 CLI、profile 和 DSH_HOME，
安装 dsh-to-figma@latest，保留现有配置，使用 local 模式。
安装后调用 figma_setup，给我本机 manifest.json 的路径并指导导入 Figma。
若已安装，更新原目录并提醒我重新运行 Figma 插件，最后用 figma_status 确认连接。
```

## npm 安装

**macOS DSH Desktop** 使用应用自带 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-to-figma@latest
```

**DSH CLI（web profile）**：

```sh
dsh plugin --profile web add dsh-to-figma@latest
```

固定本版可用 `dsh-to-figma@0.4.1`。安装无需 npm 账号；使用 DSH 的插件管理命令完成安装与启用。

1. 在 DSH 中启用 **DSH to Figma**，让 DSH 调用 `figma_setup` 生成配套插件。
2. 在 Figma Desktop 选择 **Plugins → Development → Import plugin from manifest…**，导入返回的 `manifest.json`。
3. 在目标文件运行插件并保持窗口打开，让 DSH 调用 `figma_status` 确认连接。

升级使用同一条安装命令，再运行 `figma_setup`，关闭并重新运行 Figma 插件。

## 功能

<table>
<tr>
<td width="50%" valign="top">
<h3>🎨 UI 创作与布局</h3>
<ul>
<li><strong>画布读取</strong>：选区、页面、图层、文字、尺寸、布局、样式与组件上下文；按名称、属性和页面查询。</li>
<li><strong>UI 创建与编辑</strong>：根据需求生成页面、参考截图复刻 UI、复用现有页面衍生新界面；支持原生节点与 JSON 场景导入。</li>
<li><strong>布局与交互</strong>：Auto Layout、固定尺寸与定位、约束、叠层、图层锁定及原型交互。</li>
<li><strong>字体与图标</strong>：字体查询、批量匹配与回退，内置常用矢量图标。</li>
</ul>
</td>
<td width="50%" valign="top">
<h3>🧩 设计系统与参考</h3>
<ul>
<li><strong>组件与设计系统</strong>：组件、组件集、变体、实例属性和覆盖项；搜索并复用组件、样式与可访问的团队变量库。</li>
<li><strong>变量与主题</strong>：创建变量、增添模式、设置值与别名、绑定设计变量，读取依赖和模式信息。</li>
<li><strong>设计参考</strong>：绑定、换绑和解绑规范或画板；在插件中查看名称与缩略图，与 DSH 双向同步变更。</li>
<li><strong>设计规范</strong>：提取、保存和修改本地视觉规范；在编辑器提供接口时读写原生 Specs 文档与批注。</li>
</ul>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h3>🔍 视觉验证与素材</h3>
<ul>
<li><strong>截图与参考图对照</strong>：按需回图、尺寸控制、并排图、叠加图和像素/颜色差异；读取关键布局属性。</li>
<li><strong>设计变更对比</strong>：保存设计快照与基线，对照后续结构、样式及内容变化。</li>
<li><strong>素材导入导出</strong>：图片、SVG、图片填充替换；PNG、JPG、SVG、PDF 导出，原图提取及节点与文件映射。</li>
</ul>
</td>
<td width="50%" valign="top">
<h3>🎬 动效与多种画布</h3>
<ul>
<li><strong>原生动效</strong>：关键帧、文字动画、动画样式与时间线编辑；读取动效并将部分属性转换为 CSS。</li>
<li><strong>视频导出</strong>：通过编辑器原生接口导出 MP4、GIF、WebM。</li>
<li><strong>FigJam</strong>：读取白板，创建可编辑的形状、文字和连接线；支持结构化图表与 Mermaid 流程图子集。</li>
<li><strong>Slides</strong>：在当前演示文件中生成可编辑幻灯片、标题、正文、主题布局和备注。</li>
<li><strong>Shaders</strong>：发现可用 Shader、查询文件中的使用位置，导入并应用已有 Shader。</li>
</ul>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h3>🛠️ 网页、代码与批量操作</h3>
<ul>
<li><strong>网页导入</strong>：通过本机浏览器捕获网页，将支持的 DOM 内容转成可编辑图层。</li>
<li><strong>设计稿到代码</strong>：读取语义设计上下文、CSS 与素材；索引项目组件、Token 和图标，管理本地组件与代码映射。</li>
<li><strong>代码层读取</strong>：读取现有 Code Layers 的外部属性。</li>
<li><strong>脚本与批量操作</strong>：画布脚本、批量修改、本地脚本配方、分步任务与断点续跑。</li>
</ul>
</td>
<td width="50%" valign="top">
<h3>🔌 连接与恢复</h3>
<ul>
<li><strong>错误恢复</strong>：结构化错误与修复建议、操作状态、写入日志、幂等去重、局部核查及符合条件的失败新建节点清理。</li>
<li><strong>连接与帮助</strong>：生成配对插件、多文件选择、断线重连、能力查询、运行状态和调用耗时；内置使用指南。</li>
<li><strong>MCP 接入</strong>：官方桌面与远程 MCP 连接、授权与工具发现，以及资源和提示词访问。</li>
</ul>
</td>
</tr>
</table>

## 文档与贡献

[接入与排错](docs/setup.md) · [能力说明](CAPABILITIES.md) · [更新记录](CHANGELOG.md) · [反馈问题](https://github.com/Duoasa/DSH-to-Figma/issues)

感谢 [heeq666](https://github.com/heeq666) 与 [miztizm](https://github.com/miztizm) 的反馈和贡献。

[MIT](LICENSE) · Copyright © 2026 Duoasa.

## 实机演示

[DSH to Figma 0.4.1：两碗大米饭的钱，在 Figma 里画完 UI 还顺手做了动效 ↗](https://x.com/double_asa/status/2120059438002561341)
