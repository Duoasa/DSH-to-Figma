<div align="center">

![DSH to Figma](assets/readme-hero.png)

# DSH to Figma

**Read, create and edit Figma designs with natural language.**

Connect DeepSeek Harness to Figma and turn briefs, reference images and existing designs into editable canvas content.

[![Release](https://img.shields.io/github/v/release/Duoasa/DSH-to-Figma)](https://github.com/Duoasa/DSH-to-Figma/releases/latest)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · **English** · [日本語](README.ja.md)

[Install with a prompt](#install-with-a-prompt) · [Features](#features) · [In action](#in-action) · [Manual installation](#manual-installation)

</div>

**Local mode does not consume the official Figma MCP call quota.** DSH generates a paired Figma companion for your computer. Import it once, then run it to connect.

## Install with a prompt

Send this to the DSH host you currently use:

```text
Install or update DSH to Figma for me:
https://github.com/Duoasa/DSH-to-Figma

Follow the latest repository README:
1. Identify this host's CLI, profile and DSH_HOME from its configuration and running environment. Use its own CLI, preserve existing settings and other plugins, and ask only if the target cannot be determined.
2. Download dsh-to-figma-<version>.tgz and SHA256SUMS from the latest stable GitHub Release. Verify SHA-256. Use the release package, not an assumed npm version or the standalone Figma ZIP.
3. Install or update through the host's native plugin --profile <current-profile> add command, using local mode. Upgrade in place; address duplicate entries only if they actually exist.
4. Confirm that the plugin component is running and its tools are available. If a host restart is required, tell me and continue setup afterward.
5. Run figma_setup and give me the full path to the generated paired manifest.json. Guide me to import and run DSH to Figma · Local in Figma Desktop. For an existing installation, update the same folder and rerun the companion. Do not display pairing credentials or upload paired files.
6. Once I open the target Figma file and run the companion, use figma_status to check both versions and the connection. Confirm the target if several files are connected, then read my selected artboard and return a screenshot without editing the design.
```

In Figma Desktop, choose **Plugins → Development → Import plugin from manifest…** and select the generated manifest. Run **DSH to Figma · Local** in your target file and keep its window open.

The usual path is `~/.dsh/figma/companion/manifest.json`; use the exact path returned by `figma_setup`. Update both plugins together. Keep the imported folder in place and close/reopen the companion after an update.

## Features

| Task | Workflow |
| --- | --- |
| Understand an existing design | Read selections, layers, text, dimensions, layout, styles and screenshots |
| Start from a brief or reference | Create native frames, text, vectors and auto layout, then refine them |
| Edit in batches | Change copy, colors, typography, spacing, corners and layout; locate layers by name, properties or hierarchy |
| Build a design system | Create and edit components, variants, instance properties, styles, variables, modes, aliases and bindings |
| Turn designs into code | Let DSH combine design context, assets and your existing project to implement or revise frontend pages |
| Deliver assets | Import images/SVG; export PNG, JPG, SVG and PDF; save script-generated files |
| Work across document types | Organize FigJam diagrams, Slides content and prototype interactions |

Try prompts such as:

> Make the primary buttons in this artboard 40px tall with an 8px corner radius, then show me a screenshot.

> Reuse the existing color variables and button components to create a light dashboard with auto layout.

> Add hover and disabled variants to this button and bind their colors to semantic variables.

> Rebuild this reference image on a new artboard with editable text and layout.

> Implement this artboard in the current project, reusing existing components and exporting the required assets.

The plugin connects the model to the canvas and tools. Continue refining the result through conversation or edit it directly in Figma.

## In action

A continuous workflow from October 19, 2026: inspect an existing dark interface, create a light version on a new artboard, then explore a terminal style.

### 1. Inspect the selected artboard

> Can you see the artboard I selected?

DSH returns the artboard name, node ID, 1440 × 900 dimensions, layer structure and screenshot.

![DSH returns the selected artboard and its structure](assets/examples/read-selected-artboard.png)

### 2. Create a light version while keeping the original

> Turn this UI into light mode on a new artboard.

The original remains in place. The light version has editable text, sidebar and message-area layers.

![Dark original and editable light version in Figma](assets/examples/light-mode-figma.png)

<details>
<summary>See the instruction and response in DSH</summary>

![Creating the light version in DSH](assets/examples/light-mode-conversation.png)

</details>

### 3. Explore a terminal style

> Turn the light UI into a terminal-style design on another new artboard.

A dark background, green accents and monospaced text create another direction while preserving the earlier versions.

![Terminal-style design and editable layers in Figma](assets/examples/terminal-style-figma.png)

<details>
<summary>See the instruction and response in DSH</summary>

![Creating the terminal-style version in DSH](assets/examples/terminal-style-conversation.png)

</details>

## Manual installation

Download the DSH package and `SHA256SUMS` from the [latest Release](https://github.com/Duoasa/DSH-to-Figma/releases/latest), verify the checksum, then use your host's CLI.

**macOS DSH Desktop:**

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:/absolute/path/dsh-to-figma-0.3.0.tgz"
```

**Other DSH hosts:**

```sh
dsh plugin --profile <your-profile> add "file:/absolute/path/dsh-to-figma-0.3.0.tgz"
```

Replace the path and profile. Prefer the desktop app's bundled CLI over an older global installation. Confirm **DSH to Figma → Running** in the plugin panel, then call `figma_setup`.

The usual workflow uses the companion generated by DSH. `DSH-to-Figma-companion-0.3.0.zip` is an alternative for manual pairing. Keep generated paired folders and ZIPs private because they contain local pairing credentials.

## Connection and configuration

The default `local` backend connects DSH and the companion through a local service. A single file is selected automatically; select the target explicitly when several are connected.

| Setting | Default | Purpose |
| --- | --- | --- |
| `backend` | `local` | `local`, `desktop` or `remote` |
| `bridgePort` | `3055` | Local connection port |
| `toolCallTimeoutMs` | `120000` | Tool call timeout in milliseconds |
| `desktopServerUrl` | `http://127.0.0.1:3845/mcp` | Desktop MCP address |
| `oauthClientId` | Empty | Remote login client configuration |

Change these in the host's plugin settings. See [setup details](docs/setup.md).

If tools disappear after an upgrade, check the host, profile and plugin panel, then reload or restart DSH. Also close and rerun the Figma companion. Include both plugin versions and the error when reporting a problem.

## Development and contributions

```sh
npm ci --ignore-scripts
npm run test:all
npm run package:companion
npm pack --ignore-scripts
```

The source includes the DSH entry point, connection bridge, Figma companion and workflow skill. Contributions and reproducible issue reports are welcome.

Thanks to [heeq666](https://github.com/heeq666) and [miztizm](https://github.com/miztizm) for host compatibility feedback and contributions.

Built with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), the [Figma Plugin API](https://developers.figma.com/docs/plugins/) and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk).

[MIT](LICENSE) · Copyright © 2026 Duoasa.
