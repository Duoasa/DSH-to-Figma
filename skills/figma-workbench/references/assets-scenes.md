# Assets and editable scene import

`upload_assets` reads only regular files contained in the current Work workspace, including realpath checks for symlinks. Supports PNG, JPEG, GIF, WebP and self-contained SVG. SVG becomes editable vector layers. Raster files become image-fill rectangles with original dimensions. Use a target parent ID to control placement. For direct raster replacement, supply one `files` entry per target `nodeIds` entry and an optional `fillIndex`; existing crop/transform is retained unless a new `scaleMode` is requested. Do not combine target replacement with `parentId`. See [local workflows](local-workflows.md) for the extended contract.

`download_assets` exports 1–20 selected/identified nodes as PNG, JPG, SVG or PDF. `includeOriginalImages` also extracts image-fill source bytes. Opt into `respectExportSettings:true` to use existing node export settings and `includeSvgAssets:true` to extract bounded subtree vectors. Read the returned node/image/file mapping; explicit format/scale overrides remain deliberate. The complete batch is limited to 12 MiB; reduce scale, subtree size or node count if necessary. Files are saved to a fresh `.figma/assets/<batch>/` directory, preserving existing files. The returned paths are deliverables; they do not by themselves prove the model has inspected the design.

`import_scene` imports explicit editable layers. A node has `type`, `props`, and optional `children`. Supported types: FRAME, TEXT, RECTANGLE, ELLIPSE, COMPONENT, SECTION, STICKY, SHAPE_WITH_TEXT. Properties use public Plugin API representations, including RGB 0–1 and structured fonts. Children are appended before sizing properties are applied. Up to 500 nodes per scene.

```json
{"nodes":[{"type":"FRAME","props":{"name":"Card","layoutMode":"VERTICAL","primaryAxisSizingMode":"AUTO","counterAxisSizingMode":"AUTO","itemSpacing":12,"paddingTop":24,"paddingBottom":24,"paddingLeft":24,"paddingRight":24},"children":[{"type":"TEXT","props":{"name":"Heading","fontName":{"family":"Inter","style":"Regular"},"fontSize":24,"characters":"Welcome"}}]}]}
```

`import_scene` remains the explicit scene format. For measured DOM data, use `import_dom_snapshot`; for a user-specified HTTP(S) page, `capture_webpage` uses an isolated installed Chromium browser and imports a bounded computed DOM snapshot. These create fixed editable boxes/text and report unsupported styles, media and fonts; they do not preserve executable application behavior or responsive CSS. See [local workflows](local-workflows.md). Official capture/Code import retain their own schemas and account restrictions.

Native `export_video` uses the editor encoder for MP4/GIF/WebM when supported, transfers bytes in bounded chunks and saves under `.figma/assets/<batch>/`. Inspect the returned file and actual playback. Neither an exposed generic export method nor a fixture test proves that an editor can encode a particular animation.
