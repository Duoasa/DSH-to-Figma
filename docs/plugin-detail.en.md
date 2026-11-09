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

## Try a task

- “Read the selected settings page, make the primary button 40px high with an 8px radius, and show me a screenshot.”
- “Bind the selected frame as the design reference, then create a new page using its visual style.”
- “Unbind the previous reference and use my current selection instead.”
- “Export this frame as SVG and PNG into the current workspace.”

Bind and unbind through the companion's Design Reference section or through DSH. Changes reach the next model request without repeatedly injecting the full frame or specification.

## Updates and connection help

After upgrading the DSH package, ask DSH to run `figma_setup` again. Keep the imported folder in place, then close and rerun the Figma plugin. Use `figma_status` to verify matching versions: replacing the package does not replace an already running Figma instance.

If disconnected, check that both apps run on the same computer, the DSH component is running, and the Local plugin window remains open in the intended Figma file. Give DSH the error and ask it to read `help-connection` or `help-troubleshooting` through `figma_read_guide`.

[Full documentation and demos](https://github.com/Duoasa/DSH-to-Figma#readme) · [Report an issue](https://github.com/Duoasa/DSH-to-Figma/issues)
