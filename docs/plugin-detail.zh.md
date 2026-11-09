# DSH to Figma · 0.4.1

用自然语言读取、创建和修改 Figma 设计。默认通过本机插件连接，不消耗官方 Figma MCP 调用额度。

## 安装后的第一步

DSH 端安装完成后，把下面这句话发给 DSH：

> 帮我连接 Figma：调用 figma_setup 生成本机配对插件，给我 manifest.json 的完整路径；我运行插件后，用 figma_status 确认连接和两端版本，再读取选中的画板，不修改设计。

1. 在 Figma 桌面端先打开一个设计文件。
2. 选择 **Plugins → Development → Import plugin from manifest…**，导入 DSH 给出的 `manifest.json`。
3. 在目标文件中运行 **DSH to Figma · Local**，看到「已连接」后保持插件窗口打开。
4. 选中参考画板，回到 DSH 描述你的需求。多个文件同时连接时，明确要操作哪一个。

Figma 插件由 DSH 从内置代码生成，不需要另下 ZIP。通常位于 `~/.dsh/figma/companion/manifest.json`，以工具返回的实际路径为准。配对文件含本机凭证，不要上传或分享。

## 可以直接这样说

- 「读取选中的设置页，把主按钮改为 40px 高、8px 圆角，完成后给我截图。」
- 「将选中的画板绑定为设计参考，再按同一套样式新建一个页面。」
- 「解绑当前参考，换成现在选中的画板。」
- 「导出这个画板的 SVG 和 PNG，保存到当前工作区。」

插件里的「设计参考」支持手动绑定和解绑，也可交给 DSH 操作。变更会同步到下一次模型请求，不会反复注入完整画板或规范内容。

## 升级与连接排查

升级 DSH 端安装包后，再让 DSH 调用 `figma_setup`，保留原导入目录，关闭并重新运行 Figma 插件。通过 `figma_status` 确认两端版本一致；只更新安装包不会替换 Figma 中正在运行的旧实例。

若没有连接，先确认两端在同一台电脑、DSH 插件组件正在运行、Figma 文件中的 Local 插件窗口保持打开。遇到问题，把错误交给 DSH，并让它读取 `figma_read_guide` 的 `help-connection` 或 `help-troubleshooting`。

[完整说明与实机演示](https://github.com/Duoasa/DSH-to-Figma#readme) · [反馈问题](https://github.com/Duoasa/DSH-to-Figma/issues)
