# Assets and editable scene import

`upload_assets` reads only regular files contained in the current Work workspace, including realpath checks for symlinks. Supports PNG, JPEG, GIF, WebP and self-contained SVG. SVG becomes editable vector layers. Raster files become image-fill rectangles with original dimensions. Use a target parent ID to control placement. For fills on an existing node, use the imported image hash in a targeted `use_figma` script.

`download_assets` exports 1–20 selected/identified nodes as PNG, JPG, SVG or PDF. `includeOriginalImages` also extracts image-fill source bytes. The complete batch is limited to 12 MiB; reduce scale, subtree size or node count if necessary. Files are saved to a fresh `.figma/assets/<batch>/` directory, preserving existing files. The returned paths are deliverables; they do not by themselves prove the model has inspected the design.

`import_scene` imports explicit editable layers. A node has `type`, `props`, and optional `children`. Supported types: FRAME, TEXT, RECTANGLE, ELLIPSE, COMPONENT, SECTION, STICKY, SHAPE_WITH_TEXT. Properties use public Plugin API representations, including RGB 0–1 and structured fonts. Children are appended before sizing properties are applied. Up to 500 nodes per scene.

```json
{"nodes":[{"type":"FRAME","props":{"name":"Card","layoutMode":"VERTICAL","primaryAxisSizingMode":"AUTO","counterAxisSizingMode":"AUTO","itemSpacing":12,"paddingTop":24,"paddingBottom":24,"paddingLeft":24,"paddingRight":24},"children":[{"type":"TEXT","props":{"name":"Heading","fontName":{"family":"Inter","style":"Regular"},"fontSize":24,"characters":"Welcome"}}]}]}
```

Importing JSON is not HTML capture. For a webpage, inspect its real DOM/styles through host browser capabilities, then translate visible structure into this scene contract or `use_figma`. Do not claim hidden content, executable application code or unsupported CSS was automatically preserved. Official webpage capture and Code import retain their own schemas and account restrictions.
