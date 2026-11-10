<div align="center">

![DSH to Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/readme-hero.gif)

<sub>DSH to Figma 0.3.5 · Title design and native animation</sub>

# DSH to Figma

**Read, create and edit Figma designs with natural language.**

Connect DeepSeek Harness to Figma and turn briefs, reference images and existing designs into editable canvas content.

[![npm](https://img.shields.io/npm/v/dsh-to-figma)](https://www.npmjs.com/package/dsh-to-figma)
[![Release](https://img.shields.io/github/v/release/Duoasa/DSH-to-Figma)](https://github.com/Duoasa/DSH-to-Figma/releases/latest)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · **English** · [日本語](README.ja.md)

[Install with a prompt](#install-with-a-prompt) · [Features](#features) · [In action](#in-action) · [Manual installation](#manual-installation)

</div>

**Local mode does not consume the official Figma MCP call quota.** DSH generates a paired Figma companion for your computer. Import it once, then run it to connect.

## 0.4.1

This version adds reference-image comparison, optional screenshots returned with edits, design-reference binding and change notifications, and recovery based on known execution state. Preserve appropriate layouts and editable structure; a successful screenshot export is not visual acceptance. See the [upgrade notes](docs/0.4.1-upgrade.md) and [visual quality notes](docs/0.4.1-visual-quality.md).

npm package: [`dsh-to-figma`](https://www.npmjs.com/package/dsh-to-figma). Install through your host's DSH plugin command; DSH generates and pairs the Figma companion locally.

## New in 0.3.5

| Feature | What you can do |
| --- | --- |
| Native motion | Create and edit keyframes, text entrances and animation styles; refine them in Figma’s timeline |
| Reconnect recovery | Identify reconnect candidates by native file identity, then confirm the target before resuming |
| Capability checks | Check what the current editor supports before an operation |
| Built-in help | Ask DSH about setup, usage or errors; it consults the relevant guide |
| UI and compatibility | Updated icon and compact UI; broad host compatibility without a single-RC lock |

Motion depends on APIs exposed by the editor. After a disconnect, confirm the target file again; interrupted operations are not replayed automatically.

Compatibility verified with DSH Desktop 0.2.1-rc.5 and 0.2.2-rc.1.

**Upgrading:** Update both the DSH package and Figma companion, run `figma_setup`, then close and reopen Local. Use `figma_status` to confirm that both the DSH plugin and companion report 0.4.1.

## Install with a prompt

Send this to the DSH host you currently use:

```text
Install or update DSH to Figma for me:
https://github.com/Duoasa/DSH-to-Figma

Follow the latest repository README:
1. Identify this host's CLI, profile and DSH_HOME from its configuration and running environment. Use its own CLI, preserve existing settings and other plugins, and ask only if the target cannot be determined.
2. Install dsh-to-figma@latest from npm, or dsh-to-figma@0.4.1 to pin this version. Do not use the standalone Figma ZIP as a DSH package.
3. Install or update through the host's native plugin --profile <current-profile> add dsh-to-figma@latest command, using local mode. Upgrade in place; address duplicate entries only if they actually exist.
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

The screenshots below were captured using a development build to demonstrate the workflow. Development version numbers shown in the screenshots do not represent released version numbers; refer to the feature descriptions in this README for the public release.

**DSH to Figma 0.3.5 supports the complete workflow demonstrated below.** Recreate a reference as editable layers, then add native animation with a follow-up request. The header GIF shows the result. Model: GPT-6-Astra High, November 4, 2026.

### 1. Share a reference, then ask for motion

> Recreate this image on the current Figma artboard.
>
> Make a Figma animation using this artboard.

![DSH conversation from reference recreation to animation](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/examples/v040-hero-conversation.png)

### 2. Keep editing native Figma layers

The 2172 × 724 artboard keeps text, logos, shapes and connectors as separate editable layers.

![Editable layers in Figma with the DSH to Figma companion connected](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/examples/v040-hero-editable.png)

### 3. Refine motion in the timeline

An 8-second loop with 32 tracks: staggered title entrances, floating tiles and a fade-out. The header GIF was exported from Figma.

![Hero animation and native keyframe timeline in Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/examples/v040-hero-motion.png)

## Advanced example: a stronger model for a complex UI

**Connecting DSH to a stronger model can help DSH to Figma handle more complex UI recreations with finer layout and detail.** The plugin provides canvas access; the model interprets the reference, breaks down the interface and builds the design step by step.

These screenshots come from actual use on November 3, 2026, with **GPT-6-Astra Max** displayed as the selected model in DSH. A screenshot of the tweakcn theme editor was supplied with this request:

> Recreate this UI on the Figma artboard currently open.

The result is a **2264 × 1308** Figma frame containing a theme editor, stock chart, transaction cards, activity feed and chat panel. Separate text layers and groups are visible in the Layers panel; the DSH response reports that the main UI's text, icons and charts remain editable.

![tweakcn UI recreated with GPT-6-Astra Max in DSH, with layers visible in Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/examples/advanced-model-ui-figma.png)

<details>
<summary>See the reference, instruction and response in DSH</summary>

![DSH conversation recreating a complex UI with GPT-6-Astra Max](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/examples/advanced-model-ui-conversation.png)

</details>

This example illustrates how a stronger model can be used for a complex UI task. Figma disconnected during the final review, leaving a few text-spacing adjustments unconfirmed; the design can be refined further on the canvas.

## Manual installation

Have DSH and Figma Desktop installed. The plugin requires Node.js 22+; standalone CLI environments must also meet the host requirement (currently Node.js 24.9+ for DSH 0.2.2-rc.1). Prefer the bundled runtime on Desktop. Installing the public package does not require an npm login.

**Install or update from npm:**

**macOS DSH Desktop:**

> **Use the full bundled CLI path below for Desktop.** A global `dsh` command may reject the `desktop` profile with `managed exclusively by the Electron application`. Switch to the bundled CLI; do not delete or recreate the desktop profile.

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add dsh-to-figma@latest
```

**Other DSH hosts:**

```sh
dsh plugin --profile <your-profile> add dsh-to-figma@latest
```

Replace the profile for other hosts. Use `@0.4.1` instead of `@latest` to pin this version. Plain `npm install` downloads the package but does not enable it in DSH.

After installation:

1. Confirm **DSH to Figma → Running** in DSH's plugin panel; restart the current host if needed.
2. Ask DSH to call `figma_setup`. Import the returned local `manifest.json` in Figma Desktop via **Plugins → Development → Import plugin from manifest…**.
3. Run the companion in the target Figma file, keep its window open, and ask DSH to call `figma_status` to check both versions and the connection. To update, repeat the installation command and close/reopen the Figma companion.

Alternatively, download an available `.tgz` and `SHA256SUMS` from [GitHub Releases](https://github.com/Duoasa/DSH-to-Figma/releases), verify the checksum, and replace the package name above with `"file:/absolute/path/downloaded-package.tgz"`. npm and GitHub Releases are published independently; check the version offered by each channel.

The usual workflow uses the companion generated by DSH. The standalone companion ZIP from a release is an alternative for manual pairing. Keep generated paired folders and ZIPs private because they contain local pairing credentials.

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
