# Setup and troubleshooting / 接入与排查

[中文 README](../README.md) · [English README](../README.en.md) · [日本語 README](../README.ja.md)

## Choose one backend / 选择一种后端

| Mode / 模式 | Connection / 连接 | Requirements / 条件 |
| --- | --- | --- |
| `local` (default / 默认) | Paired development plugin / 配对的开发插件 | Figma desktop + this companion, same machine / Figma 桌面与本插件在同一台机器 |
| `desktop` | `http://127.0.0.1:3845/mcp` | Enable the official desktop MCP server / 开启官方桌面 MCP |
| `remote` | `https://mcp.figma.com/mcp` | OAuth and eligible official client/account access / OAuth 与官方客户端、账号准入 |

Only the local backend uses port `3055` and `figma_select_document`. Official backends expose the server's actual schemas, resources and prompts; do not assume the local tool arguments apply to them.

只有本地后端使用 `3055` 与 `figma_select_document`。官方后端直接提供服务器实际的工具协议、资源与提示词，不能假定其参数和本地工具相同。

## Install and update / 安装与更新

Install the npm package through the current host's plugin manager. For macOS DSH Desktop:

通过当前宿主的插件管理命令安装 npm 包。macOS DSH Desktop 使用应用自带 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add dsh-to-figma@latest
```

For other hosts, use their own CLI and profile, for example:

其他宿主使用对应 CLI 和 profile，例如：

```sh
dsh plugin --profile web add dsh-to-figma@latest
```

Use `dsh-to-figma@0.4.1` to pin this version. Installing a public npm package does not require an npm account. Plain `npm install` downloads the package but does not activate it in DSH. Repeating the host's `add dsh-to-figma@latest` command updates an existing installation, including one previously installed from a local tarball.

固定本版可用 `dsh-to-figma@0.4.1`。安装公开 npm 包无需 npm 账号；普通 `npm install` 仅下载包，不会在 DSH 中启用。再次执行宿主的 `add dsh-to-figma@latest` 可更新现有安装，也适用于从本地安装包切换到 npm。

After installation, confirm the plugin is running in DSH, restart the host if needed, and ask DSH to call `figma_setup`. Import its generated local `manifest.json` in Figma Desktop, run the companion in the intended file, and call `figma_status` in DSH to confirm both versions and the connection. Keep the imported directory in place; close and rerun the Figma companion after each update. A successful package install alone does not verify a live Figma connection.

安装后，在 DSH 中确认插件运行，必要时重启宿主，再让 DSH 调用 `figma_setup`。在 Figma 桌面端导入返回的本机 `manifest.json`，在目标文件运行插件，再通过 DSH 的 `figma_status` 确认两端版本与连接。保留导入目录，每次升级后关闭并重新运行 Figma 插件。包安装成功本身不代表 Figma 已连接。

### Compatibility / 兼容范围

The plugin does not pin the DSH host version (`engines.dsh: "*"`). Its peer ranges admit DSH service releases throughout `0.2.x`, plus prereleases of `0.2.0`, `0.2.1` and `0.2.2`; Cordis `4.x`; and Schemastery `3.18.0` up to, but not including, `4.0.0`. npm prerelease matching is specific to the version tuple: a future `0.2.3-rc` is not automatically admitted by these ranges. Range admission is not a claim of testing every version; native integration is verified on DSH `0.2.1-rc.5` and `0.2.2-rc.1` with a simulated Figma runtime.

插件不锁定 DSH 宿主版本（`engines.dsh: "*"`）。peer 范围接受 DSH 服务的 `0.2.x` 正式版及 `0.2.0`、`0.2.1`、`0.2.2` 的预发布版、Cordis `4.x` 和 Schemastery `>=3.18.0 <4.0.0`。npm 按具体版本号匹配预发布版，因此未来的 `0.2.3-rc` 不会自动包含在内。范围放行不等于每个版本都已实测；原生集成已验证 DSH `0.2.1-rc.5` 与 `0.2.2-rc.1`，Figma 侧使用模拟运行时。

The plugin itself needs Node.js `>=22`; the host may require a newer version. DSH `0.2.2-rc.1` requires Node.js `>=24.9.0` for standalone CLI use. Desktop users should use the app's bundled CLI/runtime. These are installation constraints, with no added per-call checks or prompts.

插件自身要求 Node.js `>=22`，宿主可能要求更高版本。独立使用 DSH `0.2.2-rc.1` CLI 时需要 Node.js `>=24.9.0`；桌面用户优先使用应用自带 CLI 和运行时。这些仅为安装约束，不增加每次工具调用的检查或提示词。

### Source installation / 源码安装

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

## Official desktop MCP (optional) / 官方桌面 MCP（可选）

Open the target Design file in Figma desktop and enable the built-in desktop MCP. On the verified app, Cmd+K → MCP → Enable desktop MCP server produced the confirmation `http://127.0.0.1:3845/mcp`. Keep Figma open. No companion, pairing token or remote OAuth login is needed. See [Figma’s desktop requirements](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/) for eligible plans/seats.

在 Figma 桌面端打开目标 Design 文件并启用内置桌面 MCP。本次实测通过 Cmd+K → MCP → Enable desktop MCP server，出现 `http://127.0.0.1:3845/mcp` 提示。保持 Figma 打开即可，无需配套插件、配对密钥或远程 OAuth 登录。套餐与席位条件见 [Figma 官方说明](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)。

New installations default to local editing. To use official desktop reading instead, add/update this entry in your profile’s `cordis.patch.yml`, preserving other entries, then restart/reload DSH:

新安装默认使用本地编辑模式。如需官方桌面读取模式，在 profile 的 `cordis.patch.yml` 中添加或更新以下入口，保留其他条目，再重载或重启 DSH：

```yaml
- id: dsh-figma
  config:
    backend: desktop
    desktopServerUrl: http://127.0.0.1:3845/mcp
```

Call `figma_status` in a Work conversation: expect `backend: desktop`, `available: true` and an actual server tool list. `documents: []` and `bridgePort: null` are normal. Call `figma_reconnect` if the server was enabled after DSH started. Use the target node ID from a selection link in the intended open file. Desktop mode supports reading and screenshots, not canvas writing. It never falls back to a companion automatically.

在 Work 会话调用 `figma_status`，应看到 `backend: desktop`、`available: true` 和服务器实际工具列表。`documents: []`、`bridgePort: null` 为正常状态。若启用 MCP 晚于 DSH 启动，调用 `figma_reconnect`。请在目标文件打开时使用选区链接中的节点 ID。桌面模式支持读取和截图，不支持画布写入，也不会自动回退到配套插件。

## Local companion (default) / 本地配套插件（默认）

DSH automatically prepares `<DSH_HOME>/figma/companion/manifest.json` and `<DSH_HOME>/figma/DSH-to-Figma-paired.zip` when the local backend starts. Use `figma_setup` in DSH to retrieve these paths without exposing credentials. For an existing profile with a desktop override, set:

DSH 本地模式启动后，自动生成上述 manifest 和本机专用 ZIP。在 DSH 中调用 `figma_setup` 即可获得路径，无需显示凭证。旧 profile 若保留桌面模式覆盖，修改为：

```yaml
- id: dsh-figma
  config:
    backend: local
    bridgePort: 3055
```

Restart/reload DSH. Import the generated manifest once through Figma Plugins → Development → Import plugin from manifest. Open the intended file and run **DSH to Figma · Local**. It connects automatically; keep the window open. The generated folder stays in place and is updated on DSH startup. ZIP copies extracted elsewhere do not update automatically.

重启或重载 DSH，通过 Figma 开发插件菜单首次导入生成的 manifest。在目标文件运行 **DSH to Figma · Local**，插件自动连接，保持窗口打开即可。生成目录位置稳定，每次 DSH 启动时更新；解压到其他位置的 ZIP 副本不会自动更新。

One connected document is bound automatically on first canvas use. Multiple connected documents require `figma_select_document`; a disconnected binding never silently changes targets. Empty documents means the companion is not connected yet. Idle disconnects retry automatically. If the connection breaks during an operation, reopen the companion and inspect the canvas before another write; no operation is replayed.

单个连接文档在首次画布调用时自动绑定。多个文档需要明确选择，断开的旧绑定不会自动转向其他文件。文档列表为空表示插件尚未连接。空闲断线会自动重试；执行中断线需重新打开插件并先检查画布，操作不会自动重放。

The generated directory and paired ZIP contain a local credential. They are private installation artifacts, not shareable release packages. The public standalone ZIP from `npm run package:companion` contains no credentials; it needs either a generated paired replacement or a token entered under Advanced.

已配对目录与 ZIP 含本机凭证，仅供本机安装，不可作为公开发行包分享。`npm run package:companion` 生成的通用独立 ZIP 不含凭证，需要替换为本机配对版，或在高级设置中手动输入密钥。

CLI fallback / CLI 备用方式：

```sh
node /absolute/path/to/plugin/cli.mjs setup --home /absolute/path/to/dsh-home
# Manual-token fallback only / 仅手动密钥备用方式：
node /absolute/path/to/plugin/cli.mjs pair --home /absolute/path/to/dsh-home
```

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
| No documents in local mode / 本地模式没有文档 | Run the paired companion generated by this DSH home; use figma_setup for its path / 运行这台 DSH 生成的已配对插件，调用 figma_setup 获取路径 |
| Work session required / 要求 Work 会话 | Open a conversation attached to a workspace / 使用已关联工作区的会话 |
| Choose document / 要求选择文档 | Call `figma_status`, then bind the intended `connectionId` / 获取状态后明确绑定目标文档 |
| Font error / 字体错误 | Query `list_fonts`; load each exact font before changing text / 先查询并加载准确字体样式，再修改文字 |
| Image unavailable / 图像不可用 | The selected model needs image-input support; exports may still be saved / 选择支持图像输入的模型，导出文件仍可能可用 |
| Timeout after write / 写入后超时 | Do not replay blindly; inspect metadata and the canvas first / 不要盲目重试，先检查元数据和画布 |
| Stuck script / 脚本卡住 | Close/reopen the companion, pair, bind and inspect; no automatic rollback / 关闭并重新打开配套插件，配对、绑定并检查；没有自动回滚 |
| `oauth_client_registration_forbidden` / 远程注册 403 | Registration was rejected before user authorization; an approved MCP client is needed. Desktop mode does not use remote OAuth / 用户授权前的客户端注册被拒绝，需要获批的 MCP 客户端；桌面模式不使用远程 OAuth |

`dsh-figma status` reads a saved bridge record. It does **not** prove the process is alive. Use the live `figma_status` tool and the host plugin status. A `401` from an unauthenticated loopback request is expected.

`dsh-figma status` 读取的是已保存记录，**不代表进程仍在运行**。应使用实时 `figma_status` 工具和宿主插件状态；未携带密钥的本机请求返回 `401` 属于预期行为。
