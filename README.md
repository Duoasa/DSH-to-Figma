<div align="center">

# DSH to Figma

**Bring Figma canvas tools into DeepSeek Harness.**

Read Figma designs and get screenshots through the official desktop MCP by default. No companion plugin needed. Optional local mode adds canvas editing.

[![Checks](https://github.com/Duoasa/DSH-to-Figma/actions/workflows/ci.yml/badge.svg)](https://github.com/Duoasa/DSH-to-Figma/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Stage](https://img.shields.io/badge/status-preview-orange)](docs/verification.md)

**English** · [简体中文](README.zh-CN.md)

[Quick start](#quick-start) · [Tools](#tools) · [Configuration](#configuration) · [Verification](docs/verification.md)

</div>

## Why DSH to Figma

- **Native DSH integration.** Tools, design skills and image attachments use the host's extension points. No agent-loop fork is required. Supported DSH cores: **0.2.0-rc.2** and **0.2.1-rc.2**.
- **Optional editable design work (`local`).** The companion executes public Figma Plugin API scripts inside the selected document. Create and update frames, text, auto layout, components, variants, styles and variables.
- **A design-to-code workflow.** Inspect the layer tree, layout, CSS and assets, then let the host agent implement them in the current workspace.
- **Visual feedback.** Receive canvas screenshots through DSH's native image attachment path. A text-only model receives an explicit diagnostic instead of a pretend visual review.
- **Official desktop MCP by default.** Connect to Figma’s built-in server without running a companion. Local companion editing and approved remote OAuth remain optional.

> **Verified on 2026-10-18:** the installed DSH Desktop **0.2.1-rc.2** read a real Figma frame and displayed its screenshot through the official desktop MCP, with no companion running. Desktop mode does **not** support canvas writing. Remote client registration returned **HTTP 403 before user authorization**, so remote read/write/screenshot access remains unverified. This independent integration does not claim full Codex feature parity. See the [verification record](docs/verification.md).

## Examples

### Read and screenshot with official desktop MCP (default)

In a DSH Work conversation, provide a link to a frame in the open Figma file:

> Use the official desktop MCP. Check figma_status, read this frame’s metadata, and return a screenshot. Do not modify the canvas.

The real run returned **10 official tools**, `backend: desktop`, `available: true`, and `bridgePort: null`. `get_metadata` read **DeepSeek Harness — Desktop UI**, node `1:4`, **1440 × 900**, including its Sidebar and Main layers. `get_screenshot` returned a **1024 × 640 WebP**, stored as a native DSH image attachment and displayed in the conversation. The image below is that actual MCP result; no canvas changes were made.

![Actual screenshot returned by official desktop MCP through DSH](assets/examples/desktop-mcp-screenshot.webp)

### Rebuild a screenshot as editable Figma UI (optional local mode)

This earlier writing example uses `backend: local` and the running companion; it is not a desktop MCP feature. Provide a reference screenshot in DSH, select the target frame in the connected Figma file, and describe what to draw:

> Recreate this UI on the frame I selected. Draw only the UI.

**1. Reference and instruction in DSH.** The request uses a screenshot of the DeepSeek Harness desktop app. The agent identifies the selected frame and plans a 1440 × 900 UI reconstruction without the surrounding desktop background.

![Reference screenshot and natural-language instruction in DSH](assets/examples/screenshot-to-ui-prompt.png)

**2. Editable result in Figma.** The result contains the sidebar, conversation area and message composer. Figma's layer panel shows separate text, frame and vector layers; the selected frame measures 1440 × 900. These elements can be selected and refined in Figma.

![Reconstructed desktop UI with native layers and a 1440 by 900 frame in Figma](assets/examples/screenshot-to-ui-figma.png)

These screenshots were supplied by the maintainer from an actual run on 2026-10-18. They demonstrate this screenshot-to-UI case; they are not a pixel-perfect comparison or verification of every tool and editor mode.

## How it works

```mermaid
flowchart LR
    A[DSH tools + skills] -->|default: desktop| B[Figma built-in MCP :3845]
    B --> C[Design reading + screenshots]
    A -. optional: local .-> D[Paired companion :3055]
    D --> E[Canvas editing]
    A -. optional: remote .-> F[Official remote MCP + approved OAuth]
```

The default connects to `http://127.0.0.1:3845/mcp`. Keep the Figma desktop app open with its built-in MCP enabled. No companion, pairing token or remote OAuth login is needed. Target the intended open file and supply a node ID or selection link; desktop tools operate in the desktop editor context. There is no automatic fallback to local or remote mode.

## Quick start

### 1. Install the DSH bundle

Prerequisites: Git, Node.js **24+** for development, a supported DSH host, and the Figma desktop app with access to the built-in desktop MCP. Figma’s [desktop requirements](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/) specify a Dev or Full seat on Professional, Education, Organization, Government or Enterprise. The plugin declares Node 22+; use the Node runtime required by your DSH host. Tested DSH cores: **0.2.0-rc.2** and **0.2.1-rc.2**.

This repository is the distribution source; **the package is not published to npm**. Clone it and install the local folder:

```sh
git clone https://github.com/Duoasa/DSH-to-Figma.git
cd DSH-to-Figma
dsh plugin --profile web add "file:$PWD"
```

Use your actual profile instead of `web`. The host package manager installs runtime dependencies; there is no build step for installation because the generated Figma companion is committed.

**Official macOS DSH Desktop:** use the desktop-bundled CLI for the reserved `desktop` profile. If your app is installed at this location:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:$PWD"
```

Adjust the app path for your installation. A separate globally installed `dsh` may be older and refuse to manage `desktop`. Alternatively, add the absolute local repository path in DSH's native plugin manager.

Open **Plugins → DSH to Figma** and confirm the component is **running**. Restart the host if it does not reload automatically. Installation success alone does not prove runtime health.

Use the CLI, profile and `DSH_HOME` belonging to the host with a compatible DSH core. Disable/remove any earlier development version of this plugin before enabling this package; duplicate versions share the same entry ID and local bridge port.

### 2. Enable Figma’s official desktop MCP

1. Open the intended Design file in Figma desktop.
2. Enable **desktop MCP server** in Dev Mode. In the verified app UI, **Cmd+K → “MCP” → Enable desktop MCP server** also worked.
3. Confirm Figma reports `http://127.0.0.1:3845/mcp`.
4. In a DSH **Work session with a workspace**, call `figma_status`. Expect `backend: desktop` and `available: true`; if needed, call `figma_reconnect` after enabling the server.

Do not import or run the companion for this workflow. `documents: []` and `bridgePort: null` are normal in desktop mode; `figma_select_document` is only for local mode.

### 3. Read a frame and get a screenshot

> Read the figma-workbench skill. Check figma_status, then read the metadata and get a screenshot of the frame at <Figma selection link>. Report its name, dimensions and main layers. Do not modify the canvas. If the model cannot receive images, say so explicitly.

For **canvas editing**, explicitly choose `backend: local` and follow the [companion setup](docs/setup.md#optional-local-companion--可选本地配套插件). For remote canvas writing, Figma client approval and successful OAuth are required; our remote registration attempt was rejected before user authorization.

## Tools

Default desktop mode dynamically exposes the official catalog. The verified run advertised **10 tools**; only `get_metadata` and `get_screenshot` were exercised against the real canvas. Discovery of the other tools does not prove their execution or account eligibility. Desktop has no `use_figma` canvas-writing tool.

Optional local mode registers **17 canvas tools** under `mcp__figma__…`, plus four setup/guidance tools.

| Workflow | Local tools |
| --- | --- |
| Canvas scripting | `use_figma`, `import_scene` |
| Inspection | `get_selection`, `list_fonts`, `get_metadata` |
| Visual/design context | `get_screenshot`, `get_design_context`, `get_figjam` |
| Design systems | `get_variable_defs`, `get_libraries`, `search_design_system`, `get_component_context` |
| Component/code references | `get_local_component_links`, `set_local_component_links` |
| Motion inspection | `get_motion_context` |
| Asset transfer | `upload_assets`, `download_assets` |
| Setup and guidance | `figma_status`, `figma_select_document`, `figma_read_guide`, `figma_reconnect` |

The bundled `figma-workbench` skill includes focused guides for canvas scripting, design-to-code, components/variables, assets/scenes, FigJam/Slides and official services. Local component links are plugin data, **not published Code Connect mappings**. Search covers the implemented local scope, not all cloud libraries. Public API scripting can target Design, FigJam and Slides; editor-specific acceptance is pending.

See [capability coverage](CAPABILITIES.md) for cloud-only features and contract differences.

## Configuration

Configure the `dsh-figma` entry through your host's native plugin configuration. These are **entry config fields**, not a complete profile patch:

| Field | Default | Purpose |
| --- | --- | --- |
| `backend` | `desktop` | `local`, `desktop` or `remote` |
| `bridgePort` | `3055` | Local companion bridge |
| `desktopServerUrl` | `http://127.0.0.1:3845/mcp` | Official desktop endpoint |
| `toolCallTimeoutMs` | `120000` | Tool timeout, 1–300 seconds |
| `oauthClientId` | empty | Approved remote OAuth client ID, when required |

Changing `bridgePort` also requires updating the companion UI endpoint and manifest `devAllowedDomains`. Keep `3055` unless you intentionally maintain that customization.

- **Desktop mode (default):** enable Figma’s desktop MCP server, then refresh with `figma_reconnect`. Existing installations with an explicit `backend: local` override must change it to `desktop` and reload/restart; upgrading does not override a user’s choice.
- **Remote mode:** use `dsh-figma login` and `backend: remote`. Official availability depends on Figma client approval, account, seat and server catalog. No Codex credentials are reused.
- **Disable:** use the native plugin manager, or launch the host with `DSH_FIGMA_DISABLED=1`.

[Detailed setup, OAuth and troubleshooting →](docs/setup.md)

## Data and execution boundaries

- The local bridge binds only loopback, checks Host/Origin and requires a pairing token on every request. Tokens are stored under `DSH_HOME/figma` with private filesystem permissions; the companion keeps the token only in memory.
- Figma scripts execute inside the editor through the public Plugin API. The DSH bundle itself runs with host process privileges, as other native plugins do.
- In optional local mode, document binding is explicit. Operations are ordered per document; unknown writes are never automatically replayed. Mutations are not transactional.
- Asset uploads must stay inside the Work workspace. Exports use fresh `.figma/assets/<batch>/` directories. Screenshots may be sent to your configured model provider as part of the conversation.
- OAuth credentials are stored in a private local file, **not encrypted with the OS keychain**. `dsh-figma logout` removes local credentials; revoke Figma app access separately to invalidate the grant server-side.

## Development

```sh
npm ci --ignore-scripts
npm run test:all
npm pack --ignore-scripts
```

`check` regenerates `companion/code.js` from its sources and validates syntax/package files. The tests cover HTTP authentication, document queues, cancellation/recovery, assets, OAuth, official MCP discovery, and actual DSH service/attachment integration. Figma API behavior in automated tests uses fixtures.

```text
index.mjs             Native DSH plugin entry
cli.mjs               Install, pairing and OAuth helper (dsh-figma)
lib/                  Bridge, tool catalog, assets and official transports
companion/            Figma development plugin; generated code.js is shipped
skills/               Agent workflow skill and focused references
test/                 Unit, protocol and native DSH integration tests
docs/                 Setup and verification details
```

For another installed runtime, see [verification instructions](docs/verification.md). Contributions and reproducible issues are welcome; include DSH version, backend and error text, and remove tokens and private design data.

## Credits and license

Built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), the [Figma Plugin API](https://developers.figma.com/docs/plugins/api/figma/) and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk).

README organization draws on community projects [dsh-context](https://github.com/bowenliang123/dsh-context), [dsh-plugin-shop](https://github.com/LivXue/dsh-plugin-shop) and [dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil). Their code and screenshots are not bundled here.

[MIT](LICENSE) · Copyright © 2026 Duoasa.
