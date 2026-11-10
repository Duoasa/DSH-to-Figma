<div align="center">

![DSH to Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/readme-hero.gif)

# DSH to Figma

**Read, create and edit Figma designs with natural language.**

[![npm](https://img.shields.io/npm/v/dsh-to-figma)](https://www.npmjs.com/package/dsh-to-figma)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · **English** · [日本語](README.ja.md)

[Features](#features) · [Demo](#demo) · [Install with a prompt](#install-with-a-prompt) · [Install from npm](#install-from-npm)

</div>

Connect DeepSeek Harness to Figma. The local plugin is the default route, with official MCP connections available. Local mode does not consume official Figma MCP calls.

## Features

- **Canvas reading**: selections, pages, layers, text, dimensions, layout, styles and component context; queries by name, property and page.
- **UI creation and editing**: build from requirements, recreate screenshot references, derive pages from existing UI, and import native nodes or JSON scenes.
- **Layout and interaction**: Auto Layout, fixed sizing and positioning, constraints, overlays, layer locks and prototype interactions.
- **Components and design systems**: components, sets, variants, instance properties and overrides; search and reuse components, styles and accessible team variable libraries.
- **Variables and themes**: create variables, add modes, set values and aliases, bind variables, and read dependencies and mode information.
- **Design references**: bind, replace and unbind specs or artboards; names and thumbnails in the plugin, with changes synchronized both ways with DSH.
- **Design specifications**: extract, save and edit local visual specifications; read and edit native Specs documents and comments when the editor exposes the API.
- **Fonts and icons**: font lookup, batch resolution and fallbacks, plus built-in vector icons.
- **Screenshots and reference comparison**: optional image returns, size controls, side-by-side and overlay images, pixel/color differences, and key layout properties.
- **Design diffs**: save snapshots and baselines to compare later structure, style and content changes.
- **Assets**: image and SVG import, image-fill replacement, PNG/JPG/SVG/PDF export, original-image extraction, and node-to-file mappings.
- **Native motion**: keyframes, text animation, animation styles and timelines; motion reading and partial CSS conversion.
- **Video export**: MP4, GIF and WebM through the editor's native export API.
- **FigJam**: read boards and create editable shapes, text and connectors from structured graphs or a Mermaid flowchart subset.
- **Slides**: editable slides, titles, body content, theme layouts and notes in the connected presentation.
- **Shaders**: discover available shaders, find their use in the file, and import/apply existing shaders.
- **Webpage import**: capture pages with a local browser and convert supported DOM content into editable layers.
- **Design to code**: semantic design context, CSS and assets; project component, token and icon indexing, plus local component-to-code mappings.
- **Code Layer reading**: read the exposed external properties of existing Code Layers.
- **Scripts and batches**: canvas scripts, batch edits, local recipes, step-based tasks and checkpoint resumption.
- **Error recovery**: structured errors and repair hints, operation status, write journals, idempotency, scoped inspection, and cleanup of eligible nodes created by failed operations.
- **Connection and help**: paired companion generation, document selection, reconnection, capability discovery, runtime status, call timing and bundled guides.
- **MCP connections**: official desktop and remote MCP, authentication, tool discovery, resources and prompts.

## Demo

[DSH to Figma 0.4.1 — UI creation and motion in Figma (X article, Chinese) ↗](https://x.com/double_asa/status/2120059438002561341)

## Install with a prompt

Send this to DSH:

```text
Install or update DSH to Figma for me:
https://github.com/Duoasa/DSH-to-Figma

Follow docs/setup.md using this host's CLI, profile and DSH_HOME.
Install dsh-to-figma@latest, preserve existing settings, and use local mode.
Run figma_setup, give me the local manifest.json path, and guide me through importing it into Figma.
For an existing installation, update the same directory and remind me to rerun the Figma plugin.
Finally, confirm the connection with figma_status.
```

## Install from npm

**macOS DSH Desktop** — use the bundled CLI:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add dsh-to-figma@latest
```

**Other DSH hosts** — use the matching CLI and profile:

```sh
dsh plugin --profile <your-profile> add dsh-to-figma@latest
```

Use `dsh-to-figma@0.4.1` to pin this version. No npm account is required; the DSH plugin manager installs and activates the package.

1. Enable **DSH to Figma** in DSH and run `figma_setup` to generate the companion.
2. In Figma Desktop, choose **Plugins → Development → Import plugin from manifest…** and select the returned `manifest.json`.
3. Run the plugin in the target file, keep its window open, and ask DSH to confirm the connection with `figma_status`.

To update, repeat the installation command, run `figma_setup`, then close and rerun the Figma plugin.

## Documentation and contributions

[Setup and troubleshooting](docs/setup.md) · [Capabilities](CAPABILITIES.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/Duoasa/DSH-to-Figma/issues)

Thanks to [heeq666](https://github.com/heeq666) and [miztizm](https://github.com/miztizm) for feedback and contributions.

[MIT](LICENSE) · Copyright © 2026 Duoasa.
