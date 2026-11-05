# 安装、连接与升级

适用：DSH to Figma 0.4.0。具体菜单文字可能随宿主版本变化；先核对用户当前环境，不凭开发机器的绝对路径回答。

## 桌面版安装命令

macOS Desktop 的 `desktop` profile 由桌面应用管理。请使用应用内置 CLI 的完整路径，例如：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "file:/absolute/path/package.tgz"
```

应用位置和包路径以本机为准。若全局 `dsh` 报 `managed exclusively by the Electron application`，改用内置 CLI；不要删除或重建 desktop profile，也不要尝试绕过宿主管理。

## 第一次使用本地模式

1. 在 DSH 安装插件并启用其 **DSH to Figma** 组件。确认组件状态为运行中。
2. 打开关联了工作区的 DSH 会话。普通无工作区会话不能执行本地画布工具。
3. 对 DSH 说：“帮我连接 Figma。”DSH 通过 `figma_setup` 准备本机配对插件并返回 manifest 路径。
4. 在 Figma 桌面端打开目标文件，通过 Plugins → Development → Import plugin from manifest 选择该 manifest。首次导入一次即可。
5. 在目标文件运行 **DSH to Figma · Local**，看到“已连接”后保持窗口打开，回到 DSH 提需求。

没有必要让用户复制密钥。不要让用户上传配对 code.js 或 ZIP 排查问题。通用 ZIP 不含凭证，直接运行时可能显示等待配对，优先用 DSH 生成的本机版替换。

## 窗口上各项含义

- **本地连接 / 已连接**：当前配套窗口已连接到本机 DSH 桥接。文件行显示该窗口所处文件和编辑器类型。
- **暂停按钮**：暂停本地连接；再次点击恢复。执行中的操作需要先结束，暂停不是强制回滚。
- **设置按钮**：展开高级设置，包含版本、手动配对密钥和可选 Figma 文件链接。正常配对流程通常不用填写。
- **文件链接**：仅在编辑器未返回真实文件 key 时补充文件身份；不能覆盖编辑器提供的真实 key。填写链接不会打开文件、授予编辑权限或切换操作目标。
- **本地设计规范**：管理 Markdown 副本和默认规范。详见 `help-specs`。
- **关闭窗口**：停止该窗口的配套执行。重新打开可连接；关闭并不撤销已完成的画布修改。
- 名称前的 `</>` 是 Figma 本地 Development 插件的宿主标识。当前 manifest 不提供自定义图标字段；插件内容区的配图和 DSH 的插件图标是不同位置。不要为修改它擅自发布插件。

## 三种连接方式

| 方式 | 适合什么 | 注意 |
| --- | --- | --- |
| local（默认） | 在当前 Figma 文件中读取和编辑原生图层 | 同机运行配套插件；默认 Markdown 工作流在此模式生效 |
| desktop | 使用官方桌面 MCP 读取设计上下文与截图 | 在 Figma 开启官方桌面 MCP；不使用本地配套桥接，不能承诺画布写入 |
| remote | 使用实际获准的官方远程工具 | 单独 OAuth 与账号/客户端准入；Codex 能访问不代表 DSH 自动获准 |

改变配置中的 backend 后要重载/重启 DSH 插件。`figma_reconnect` 在当前官方模式刷新工具发现，不会代替配置切换。只有 local 使用默认本地端口 3055；不要混淆官方桌面服务端口 3845。

## 多文件与工作区

一个文件连接时，新 Work 会话可自动绑定它；多个文件同时连接时，应让 DSH 列出文件并明确选择。绑定过的文件断开后，插件不会悄悄改为另一个文件。工作区改变也需要重新确认目标。

断线重连后 `connectionId` 可能变化。先调用 `figma_status({compact:true})`：

- `documentBinding.lastSelected` 保留当前 Work 上次选择的文件信息；`state` 表示仍连接、已断开或工作区已改变。
- `documents[].bindingMatch = same-file-key` 表示与上次记录的文件 key 和编辑器相同，即使文件改名也可识别。
- `same-name-unverified` 仅表示名称和编辑器相同，文件身份尚未确认；同名文件可能有多个。缺少 key 时，可结合插件窗口中的文件、可选文件链接确认目标。
- 确认后调用 `figma_select_document` 传入新的连接 ID，再继续工作。状态查询不会自动重绑，也不会重放中断的操作。

记录只属于当前 Work 和本次插件运行；重启宿主或插件后不承诺保留。没有 Work 的状态查询不会展示其他会话的绑定信息。

本地开发配套插件已在 manifest 启用 Figma 官方 `enablePrivatePluginApi`，用于读取真实 `figma.fileKey`。更新后需关闭并重新运行 Figma 配套窗口；旧绑定若只记录了空 key，首次仍需选择一次以建立真实文件身份。以后重连由真实 key 匹配，DSH 可据此调用选择工具恢复，无需用户抄连接 ID。遇到多个相同 key 的连接或实际编辑器仍未提供 key 时，应确认目标，不按名称自动猜测。此配置适用于本地开发配套插件，不代表公开发布的 Community 插件自动获得同等 API 能力。

示例：“列出当前连接的 Figma 文件，只操作名为‘官网改版’的文件，其他文件不要改。”名称重复时要进一步确认。模型一旦取得节点 ID，应保留并复用，不要只按重名图层判断。

## 升级与旧版清理

1. 使用面向当前 DSH 宿主/profile 的新安装包更新。不同宿主或 home 的插件安装相互独立。
2. 重载 DSH 的插件组件，必要时重启宿主。仅磁盘包版本变新，不代表正在运行的代码已更新。
3. 让 DSH 调用 `figma_setup` 更新当前配对目录；在 Figma 关闭并重新运行 Local 插件。通常原 manifest 路径不变，不必重复注册。
4. 核对 DSH 运行版本和 Figma companionVersion。若仍旧，检查是否启动了旧的 Test/Workbench/其他 home 的 manifest。
5. 确定失效后再移除旧开发插件入口。保留当前配对目录和用户规范；不要为了升级删除整个 DSH home。

本地 `.tgz` 安装不应被承诺会自动升级。同名同版本包可能被包管理器缓存；开发包更新应验证安装文件内容，必要时用新的包路径重新安装。不要把缺少宿主注入的 peer 提示直接当成需要向 profile 安装整套 DSH 内核。

## 兼容性

0.4.0 保留放宽的声明：Node >=22，DSH engine 不锁定到单个 RC；Cordis 4.0.x、Schemastery 3.18.x，相关 DSH 包采用 `^0.2.0-0 || ^0.2.1-0 || ^0.2.2-0`。这接纳 0.2.x 稳定版及声明列出的 patch 元组预发布版本；npm 默认不接纳未列出的 0.2.3-rc 等预发布元组。开发测试版本的固定值不等于产品只支持该测试版本。

版本声明被接纳不等于所有组合都已实测。编辑器是否开放 Motion、Specs 等 API，还要查询实际能力。
