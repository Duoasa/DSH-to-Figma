<div align="center">

![DSH to Figma](assets/readme-hero.gif)

<sub>Title design and animation made with DSH to Figma 0.4.0 development build (unreleased).</sub>

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

## New in 0.4.0 — unreleased

| Feature | What you can do |
| --- | --- |
| Native motion | Create and edit keyframes, text entrances and animation styles; refine them in Figma’s timeline |
| Local design specs | Import Markdown, then let DSH read, edit and export a stored copy |
| Default spec | Set one spec as the default for later designs; it persists across restarts until switched or cleared |
| Capability checks | Check what the current editor supports before an operation |
| Built-in help | Ask DSH about setup, usage or errors; it consults the relevant guide |
| UI and compatibility | Updated icon and spec panel; broad host compatibility without a single-RC lock |

Motion depends on APIs exposed by the editor. Local Markdown is separate from cloud Specs and does not overwrite the source file. The default-spec check enforces reading the current revision; review the resulting design.

**Upgrading:** Update both the DSH package and Figma companion, run `figma_setup`, then close and reopen Local. Version 0.4.0 is not published yet; installation instructions below still use the current release.

## Install with a prompt

Send this to the DSH host you currently use:

```text
Install or update DSH to Figma for me:
https://github.com/Duoasa/DSH-to-Figma

Follow the latest repository README:
1. Identify this host's CLI, profile and DSH_HOME from its configuration and running environment. Use its own CLI, preserve existing settings and other plugins, and ask only if the target cannot be determined.
2. Download the dsh-to-figma-<version>[-hotfix.N].tgz recommended in the release notes and SHA256SUMS from the latest stable GitHub Release. Verify SHA-256. Use the release package, not an assumed npm version or the standalone Figma ZIP.
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

**The title design and animation at the top of this README were made with DSH to Figma.** This example uses **DSH to Figma 0.4.0 development build (unreleased)** to recreate a reference as editable layers, then adds motion with a follow-up request. Model: GPT-6-Astra High, November 4, 2026.

### 1. Share a reference, then ask for motion

> Recreate this image on the current Figma artboard.
>
> Make a Figma animation using this artboard.

![DSH conversation from reference recreation to animation](assets/examples/v040-hero-conversation.png)

### 2. Keep editing native Figma layers

The 2172 × 724 artboard keeps text, logos, shapes and connectors as separate editable layers.

![Editable layers in Figma with the DSH to Figma companion connected](assets/examples/v040-hero-editable.png)

### 3. Refine motion in the timeline

An 8-second loop with 32 tracks: staggered title entrances, floating tiles and a fade-out. The header GIF was exported from Figma.

![Hero animation and native keyframe timeline in Figma](assets/examples/v040-hero-motion.png)

## Advanced example: a stronger model for a complex UI

**Connecting DSH to a stronger model can help DSH to Figma handle more complex UI recreations with finer layout and detail.** The plugin provides canvas access; the model interprets the reference, breaks down the interface and builds the design step by step.

These screenshots come from actual use on November 3, 2026, with **GPT-6-Astra Max** displayed as the selected model in DSH. A screenshot of the tweakcn theme editor was supplied with this request:

> Recreate this UI on the Figma artboard currently open.

The result is a **2264 × 1308** Figma frame containing a theme editor, stock chart, transaction cards, activity feed and chat panel. Separate text layers and groups are visible in the Layers panel; the DSH response reports that the main UI's text, icons and charts remain editable.

![tweakcn UI recreated with GPT-6-Astra Max in DSH, with layers visible in Figma](assets/examples/advanced-model-ui-figma.png)

<details>
<summary>See the reference, instruction and response in DSH</summary>

![DSH conversation recreating a complex UI with GPT-6-Astra Max](assets/examples/advanced-model-ui-conversation.png)

</details>

This example illustrates how a stronger model can be used for a complex UI task. Figma disconnected during the final review, leaving a few text-spacing adjustments unconfirmed; the design can be refined further on the canvas.

## Manual installation

Download the DSH package and `SHA256SUMS` from the [latest Release](https://github.com/Duoasa/DSH-to-Figma/releases/latest), verify the checksum, then use your host's CLI.

**macOS DSH Desktop:**

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:/absolute/path/dsh-to-figma-0.3.2-hotfix.1.tgz"
```

**Other DSH hosts:**

```sh
dsh plugin --profile <your-profile> add "file:/absolute/path/dsh-to-figma-0.3.2-hotfix.1.tgz"
```

Replace the path and profile. Prefer the desktop app's bundled CLI over an older global installation. Confirm **DSH to Figma → Running** in the plugin panel, then call `figma_setup`.

The usual workflow uses the companion generated by DSH. `DSH-to-Figma-companion-0.3.2.zip` is an alternative for manual pairing. Keep generated paired folders and ZIPs private because they contain local pairing credentials.

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
