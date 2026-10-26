# Figma to application code

1. Locate the smallest useful frame with summary metadata, then get its detailed context and one screenshot. The local result contains a native node tree and `getCSSAsync()` values; it does not claim to reproduce Figma's cloud-generated React output. Later structural reads should use `includeScreenshot:false` until a new image is needed.
2. Inspect the project's actual framework, components, tokens and conventions. Map design semantics into them instead of pasting absolute coordinates or introducing a new framework.
3. Read only the relevant variable definitions, modes, component context and local component links to preserve intent. Filter and page discovery results, then follow explicit IDs for details. Official Code Connect mappings are only available when the official backend supplies those tools.
4. Export real assets with `download_assets`. Use SVG for vectors and original image bytes for photo fills when appropriate. Do not draw a guessed logo or replace provided images with emoji. Exports land in `.figma/assets/<batch>/`.
5. Implement responsive constraints, semantic elements, accessible names and keyboard behavior in code. Translate auto layout into flex/grid when appropriate. Preserve deliberate overlaps rather than forcing everything into cards.
6. Compare rendered application output with the design screenshot using the host's available preview tools. Do not claim a visual match from compilation alone.

For native SwiftUI, map reusable Figma components into Views and state, typography into actual platform styles/custom fonts, and auto layout into stacks, grids and alignment. Assess dynamic type and safe areas. Do not assume a Figma pixel-perfect fixed frame is the desired behavior on every device.

Local component-to-code links use node plugin data. They are useful to DSH across sessions but are not published Code Connect. Name them accurately in delivery.
