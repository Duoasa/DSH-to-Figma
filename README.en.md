<div align="center">

![DSH to Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/readme-hero.gif)

# DSH to Figma

**Read, create and edit Figma designs with natural language.**

[![npm](https://img.shields.io/npm/v/dsh-to-figma)](https://www.npmjs.com/package/dsh-to-figma)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · **English** · [日本語](README.ja.md)

[Prompt installation (recommended)](#install-with-a-prompt) · [npm installation](#install-from-npm) · [Features](#features) · [Demo](#demo)

</div>

Connect DeepSeek Harness to Figma. The local plugin is the default route, with official MCP connections available. Local mode does not consume official Figma MCP calls.

## Install with a prompt

**Prompt installation is recommended.** Let DSH handle installation and guide you through the connection. Send this to DSH:

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
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-to-figma@latest
```

**DSH CLI (web profile)**:

```sh
dsh plugin --profile web add dsh-to-figma@latest
```

Use `dsh-to-figma@0.4.1` to pin this version. No npm account is required; the DSH plugin manager installs and activates the package.

1. Enable **DSH to Figma** in DSH and run `figma_setup` to generate the companion.
2. In Figma Desktop, choose **Plugins → Development → Import plugin from manifest…** and select the returned `manifest.json`.
3. Run the plugin in the target file, keep its window open, and ask DSH to confirm the connection with `figma_status`.

To update, repeat the installation command, run `figma_setup`, then close and rerun the Figma plugin.

## Features

<table>
<tr>
<td width="50%" valign="top">
<h3>🎨 UI creation and layout</h3>
<ul>
<li><strong>Canvas reading</strong>: selections, pages, layers, text, dimensions, layout, styles and component context; queries by name, property and page.</li>
<li><strong>UI creation and editing</strong>: build from requirements, recreate screenshot references, derive pages from existing UI, and import native nodes or JSON scenes.</li>
<li><strong>Layout and interaction</strong>: Auto Layout, fixed sizing and positioning, constraints, overlays, layer locks and prototype interactions.</li>
<li><strong>Fonts and icons</strong>: font lookup, batch resolution and fallbacks, plus built-in vector icons.</li>
</ul>
</td>
<td width="50%" valign="top">
<h3>🧩 Design systems and references</h3>
<ul>
<li><strong>Components and design systems</strong>: components, sets, variants, instance properties and overrides; search and reuse components, styles and accessible team variable libraries.</li>
<li><strong>Variables and themes</strong>: create variables, add modes, set values and aliases, bind variables, and read dependencies and mode information.</li>
<li><strong>Design references</strong>: bind, replace and unbind specs or artboards; names and thumbnails in the plugin, with changes synchronized both ways with DSH.</li>
<li><strong>Design specifications</strong>: extract, save and edit local visual specifications; read and edit native Specs documents and comments when the editor exposes the API.</li>
</ul>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h3>🔍 Visual checks and assets</h3>
<ul>
<li><strong>Screenshots and reference comparison</strong>: optional image returns, size controls, side-by-side and overlay images, pixel/color differences, and key layout properties.</li>
<li><strong>Design diffs</strong>: save snapshots and baselines to compare later structure, style and content changes.</li>
<li><strong>Assets</strong>: image and SVG import, image-fill replacement, PNG/JPG/SVG/PDF export, original-image extraction, and node-to-file mappings.</li>
</ul>
</td>
<td width="50%" valign="top">
<h3>🎬 Motion and canvas types</h3>
<ul>
<li><strong>Native motion</strong>: keyframes, text animation, animation styles and timelines; motion reading and partial CSS conversion.</li>
<li><strong>Video export</strong>: MP4, GIF and WebM through the editor&#x27;s native export API.</li>
<li><strong>FigJam</strong>: read boards and create editable shapes, text and connectors from structured graphs or a Mermaid flowchart subset.</li>
<li><strong>Slides</strong>: editable slides, titles, body content, theme layouts and notes in the connected presentation.</li>
<li><strong>Shaders</strong>: discover available shaders, find their use in the file, and import/apply existing shaders.</li>
</ul>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h3>🛠️ Web, code and batch work</h3>
<ul>
<li><strong>Webpage import</strong>: capture pages with a local browser and convert supported DOM content into editable layers.</li>
<li><strong>Design to code</strong>: semantic design context, CSS and assets; project component, token and icon indexing, plus local component-to-code mappings.</li>
<li><strong>Code Layer reading</strong>: read the exposed external properties of existing Code Layers.</li>
<li><strong>Scripts and batches</strong>: canvas scripts, batch edits, local recipes, step-based tasks and checkpoint resumption.</li>
</ul>
</td>
<td width="50%" valign="top">
<h3>🔌 Connections and recovery</h3>
<ul>
<li><strong>Error recovery</strong>: structured errors and repair hints, operation status, write journals, idempotency, scoped inspection, and cleanup of eligible nodes created by failed operations.</li>
<li><strong>Connection and help</strong>: paired companion generation, document selection, reconnection, capability discovery, runtime status, call timing and bundled guides.</li>
<li><strong>MCP connections</strong>: official desktop and remote MCP, authentication, tool discovery, resources and prompts.</li>
</ul>
</td>
</tr>
</table>

## Documentation and contributions

[Setup and troubleshooting](docs/setup.md) · [Capabilities](CAPABILITIES.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/Duoasa/DSH-to-Figma/issues)

Thanks to [heeq666](https://github.com/heeq666) and [miztizm](https://github.com/miztizm) for feedback and contributions.

[MIT](LICENSE) · Copyright © 2026 Duoasa.

## Demo

[DSH to Figma 0.4.1 — UI creation and motion in Figma (X article, Chinese) ↗](https://x.com/double_asa/status/2120059438002561341)
