# DSH to Figma · 0.4.1

Read, create and edit Figma designs with natural language. The default local connection does not consume the official Figma MCP tool quota.

## Connect after installation

Send this to DSH:

> Connect me to Figma: call figma_setup to generate the paired local plugin and give me the full manifest.json path. Once I run it, use figma_status to verify the connection and both versions, then read my selected frame without modifying it.

1. Open a design file in Figma desktop first.
2. Choose **Plugins → Development → Import plugin from manifest…** and select the manifest provided by DSH.
3. Run **DSH to Figma · Local** in the target file. Keep its window open after it shows connected.
4. Select a reference frame and describe your task in DSH. When several files are connected, explicitly select the intended file.

DSH generates the Figma plugin from bundled code; no separate ZIP is needed. The usual manifest path is `~/.dsh/figma/companion/manifest.json`; use the actual path returned by the tool. Paired files contain a local credential: keep them private.

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

## Try a task

- “Read the selected settings page, make the primary button 40px high with an 8px radius, and show me a screenshot.”
- “Bind the selected frame as the design reference, then create a new page using its visual style.”
- “Unbind the previous reference and use my current selection instead.”
- “Export this frame as SVG and PNG into the current workspace.”

Bind and unbind through the companion's Design Reference section or through DSH. Changes reach the next model request without repeatedly injecting the full frame or specification.

## Updates and connection help

To upgrade, rerun `add dsh-to-figma@latest` through the matching host/profile. GitHub documentation revisions do not replace an already published npm version. After updating, ask DSH to run `figma_setup` again. Keep the imported folder in place, then close and rerun the Figma plugin. Use `figma_status` to verify matching versions: replacing the package does not replace an already running Figma instance.

If disconnected, check that both apps run on the same computer, the DSH component is running, and the Local plugin window remains open in the intended Figma file. Give DSH the error and ask it to read `help-connection` or `help-troubleshooting` through `figma_read_guide`.

[Documentation](https://github.com/Duoasa/DSH-to-Figma#readme) · [Demo article](https://x.com/double_asa/status/2120059438002561341) · [Report an issue](https://github.com/Duoasa/DSH-to-Figma/issues)
