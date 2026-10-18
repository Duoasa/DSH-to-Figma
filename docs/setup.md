# Setup and troubleshooting / 接入与排查

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## Choose one backend / 选择一种后端

| Mode / 模式 | Connection / 连接 | Requirements / 条件 |
| --- | --- | --- |
| `local` | Paired development plugin / 配对的开发插件 | Figma desktop + this companion, same machine / Figma 桌面与本插件在同一台机器 |
| `desktop` (default / 默认) | `http://127.0.0.1:3845/mcp` | Enable the official desktop MCP server / 开启官方桌面 MCP |
| `remote` | `https://mcp.figma.com/mcp` | OAuth and eligible official client/account access / OAuth 与官方客户端、账号准入 |

Only the local backend uses port `3055` and `figma_select_document`. Official backends expose the server's actual schemas, resources and prompts; do not assume the local tool arguments apply to them.

只有本地后端使用 `3055` 与 `figma_select_document`。官方后端直接提供服务器实际的工具协议、资源与提示词，不能假定其参数和本地工具相同。

## Install and update / 安装与更新

Use an explicit profile and its host's CLI. For example, after cloning this repository:

使用明确的 profile 和对应宿主的 CLI。例如，克隆仓库后执行：

```sh
dsh plugin --profile web add "file:$PWD"
```

For DSH Desktop, use the CLI shipped inside that app. For Scoder, set its own `DSH_HOME` and use its matching CLI. Do not overwrite another client's home.

DSH Desktop 应使用应用自带 CLI；Scoder 应设置它自己的 `DSH_HOME` 并使用对应 CLI，不要覆盖其他客户端的 home。

After pulling an update, rerun the same `add file:…` command and check the component status. To remove from a web profile:

拉取更新后，再执行相同的 `add file:…`，确认组件状态。web profile 的卸载命令为：

```sh
dsh plugin --profile web remove dsh-to-figma
```

The CLI helper is named `dsh-figma` for compatibility. It may not be on your global PATH; invoke the installed `cli.mjs` with Node. `install` forwards to the native DSH package manager; supply `--profile` explicitly.

辅助命令保留 `dsh-figma` 名称以兼容原有流程。它不一定在全局 PATH 中，可通过 Node 调用安装目录中的 `cli.mjs`。`install` 会转发给原生 DSH 包管理器，请明确填写 `--profile`。

```sh
node /absolute/path/to/plugin/cli.mjs install \
  --home /absolute/path/to/dsh-home --profile web --cli /absolute/path/to/dsh
```

## Official desktop MCP (default) / 官方桌面 MCP（默认）

Open the target Design file in Figma desktop and enable the built-in desktop MCP. On the verified app, Cmd+K → MCP → Enable desktop MCP server produced the confirmation `http://127.0.0.1:3845/mcp`. Keep Figma open. No companion, pairing token or remote OAuth login is needed. See [Figma’s desktop requirements](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/) for eligible plans/seats.

在 Figma 桌面端打开目标 Design 文件并启用内置桌面 MCP。本次实测通过 Cmd+K → MCP → Enable desktop MCP server，出现 `http://127.0.0.1:3845/mcp` 提示。保持 Figma 打开即可，无需配套插件、配对密钥或远程 OAuth 登录。套餐与席位条件见 [Figma 官方说明](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)。

New installations default to desktop. To migrate an existing explicit local configuration, add/update this entry in your profile’s `cordis.patch.yml`, preserving other entries, then restart/reload DSH:

新安装默认使用桌面模式。已有显式 local 配置时，在 profile 的 `cordis.patch.yml` 中添加或更新以下入口，保留其他条目，再重载或重启 DSH：

```yaml
- id: dsh-figma
  config:
    backend: desktop
    desktopServerUrl: http://127.0.0.1:3845/mcp
```

Call `figma_status` in a Work conversation: expect `backend: desktop`, `available: true` and an actual server tool list. `documents: []` and `bridgePort: null` are normal. Call `figma_reconnect` if the server was enabled after DSH started. Use the target node ID from a selection link in the intended open file. Desktop mode supports reading and screenshots, not canvas writing. It never falls back to a companion automatically.

在 Work 会话调用 `figma_status`，应看到 `backend: desktop`、`available: true` 和服务器实际工具列表。`documents: []`、`bridgePort: null` 为正常状态。若启用 MCP 晚于 DSH 启动，调用 `figma_reconnect`。请在目标文件打开时使用选区链接中的节点 ID。桌面模式支持读取和截图，不支持画布写入，也不会自动回退到配套插件。

## Optional local companion / 可选本地配套插件

Choose `backend: local` explicitly and reload/restart the plugin. Only this mode starts the bridge on `127.0.0.1:3055` and supports our local canvas-writing tools.

显式选择 `backend: local` 后重载或重启插件。仅此模式启动 `127.0.0.1:3055` 桥接，并提供本插件的本地画布写入工具。

```sh
node /absolute/path/to/plugin/cli.mjs pair --home /absolute/path/to/dsh-home
```

1. Import the printed `companion/manifest.json` through Figma’s Plugins → Development → Import plugin from manifest. / 在 Figma 开发插件菜单导入命令输出的 manifest。
2. Run DSH to Figma, paste the pairing token only into its UI, and connect. Keep it running. Never paste the token into chat or public evidence. / 运行配套插件，仅在其 UI 中粘贴密钥并连接，保持运行，不要把密钥发到聊天或公开证据中。
3. In a DSH Work session, call `figma_status` and explicitly select the intended `connectionId` with `figma_select_document`. / 在 Work 会话获取状态并明确绑定目标文档。
4. Inspect, edit, read back and screenshot. On an uncertain write result, inspect before retrying. / 按检查、编辑、读回、截图的顺序操作；写入结果未知时先检查再重试。

## OAuth / 远程授权

Run the helper from the installed package with the same home as the host:

在安装目录中运行辅助命令，home 必须与宿主一致：

```sh
node /absolute/path/to/plugin/cli.mjs login --home /absolute/path/to/dsh-home
# If Figma issued an approved client ID / 如果 Figma 已提供获批 client ID:
node /absolute/path/to/plugin/cli.mjs login \
  --home /absolute/path/to/dsh-home --client-id APPROVED_CLIENT_ID
```

Open the printed authorization URL. The callback defaults to `http://127.0.0.1:3056/callback`; a registered client must allow that URI. When using `--client-id`, configure the same `oauthClientId` in the plugin. Select `backend: remote` and restart/reload the plugin; `figma_reconnect` refreshes discovery in an already active official backend.

打开命令输出的授权地址。回调默认是 `http://127.0.0.1:3056/callback`，已注册客户端必须允许此 URI。使用 `--client-id` 时，插件配置中的 `oauthClientId` 应保持一致。设置 `backend: remote` 后重启或重载插件；已处于官方后端时，可用 `figma_reconnect` 刷新工具发现。

The CLI validates state and PKCE through the SDK. Auth state is independent of Codex and stored under `<DSH_HOME>/figma`. Tokens are protected by filesystem permissions, not OS keychain encryption. Approval/account restrictions can still prevent login or tool access. See [Figma's official guide](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/).

CLI 使用 SDK 处理 state 与 PKCE。授权状态独立于 Codex，保存于 `<DSH_HOME>/figma`，依靠文件权限保护，并非系统钥匙串加密。客户端审批或账号限制仍可能阻止登录或工具访问，详见 [Figma 官方指南](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)。

```sh
node /absolute/path/to/plugin/cli.mjs logout --home /absolute/path/to/dsh-home
```

Logout removes local credentials. Reconnect/restart to close existing sessions; revoke access in Figma to invalidate the server-side grant.

退出会删除本地凭证。重连或重启以关闭既有连接；要撤销服务器端授权，请在 Figma 中撤销应用访问。

## Diagnose a connection / 排查连接

| Symptom / 现象 | Action / 操作 |
| --- | --- |
| Installed but no tools / 已安装但没有工具 | Check **Plugins → DSH to Figma → running**; verify core version and active profile, restart if necessary / 检查组件运行状态、内核版本和当前 profile，必要时重启 |
| Desktop unavailable / 桌面不可用 | Open Figma, enable its built-in MCP at :3845 and call `figma_reconnect`; do not start the companion / 打开 Figma 并启用 :3845 内置 MCP，再调用重连；无需启动配套插件 |
| `bridge_port_in_use` | Another host may own `3055`; disable the duplicate bridge / 另一宿主可能占用端口，请禁用重复桥接 |
| No documents in local mode / 本地模式没有文档 | Keep the Figma companion open and connected using the same home's token / 保持配套插件打开，并使用同一 home 的密钥 |
| Work session required / 要求 Work 会话 | Open a conversation attached to a workspace / 使用已关联工作区的会话 |
| Choose document / 要求选择文档 | Call `figma_status`, then bind the intended `connectionId` / 获取状态后明确绑定目标文档 |
| Font error / 字体错误 | Query `list_fonts`; load each exact font before changing text / 先查询并加载准确字体样式，再修改文字 |
| Image unavailable / 图像不可用 | The selected model needs image-input support; exports may still be saved / 选择支持图像输入的模型，导出文件仍可能可用 |
| Timeout after write / 写入后超时 | Do not replay blindly; inspect metadata and the canvas first / 不要盲目重试，先检查元数据和画布 |
| Stuck script / 脚本卡住 | Close/reopen the companion, pair, bind and inspect; no automatic rollback / 关闭并重新打开配套插件，配对、绑定并检查；没有自动回滚 |
| `oauth_client_registration_forbidden` / 远程注册 403 | Registration was rejected before user authorization; an approved MCP client is needed. Desktop mode does not use remote OAuth / 用户授权前的客户端注册被拒绝，需要获批的 MCP 客户端；桌面模式不使用远程 OAuth |

`dsh-figma status` reads a saved bridge record. It does **not** prove the process is alive. Use the live `figma_status` tool and the host plugin status. A `401` from an unauthenticated loopback request is expected.

`dsh-figma status` 读取的是已保存记录，**不代表进程仍在运行**。应使用实时 `figma_status` 工具和宿主插件状态；未携带密钥的本机请求返回 `401` 属于预期行为。
