# Local execution contract

`use_figma({code: "…"})` runs an asynchronous body with `figma` and `dsh`. Use `return`, not `figma.closePlugin()`. Do not change the companion UI or its message handler. No cross-call JavaScript variables persist: pass IDs explicitly. The public Plugin API is authoritative: https://developers.figma.com/docs/plugins/api/figma/

Available convenience helpers are intentionally explicit:

- `figma.createAutoLayout('VERTICAL' | 'HORIZONTAL', props?)`: creates a native frame with hugging primary/counter axes.
- `node.set({...})`: applies properties and handles width/height through `resize` before other properties.
- `node.query('TEXT[name="Title"]')`: descendant type/name query. Supports `TYPE`, `*`, `[name="exact"]` and their combination; this is not a full CSS selector engine. The result array supports `.set(props)`.
- `await node.screenshot({scale?, quality?, contentsOnly?})`: adds an actual PNG result, at most four per operation. `quality` is `overview` or `detail`; explicit `scale` takes precedence.
- `dsh.color('#C4B5FD')`: RGB channels in 0–1.

There is no fake `placeholder` shimmer, cloud workspace, cloud generator or unpublished API added to the public Figma runtime.

```js
const parent = await figma.getNodeByIdAsync('12:34');
const card = figma.createAutoLayout('VERTICAL', {
  name: 'Account card', itemSpacing: 12,
  paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24
});
parent.appendChild(card);
const font = {family: 'Inter', style: 'Regular'};
await figma.loadFontAsync(font);
const title = figma.createText();
card.appendChild(title);
title.fontName = font;
title.fontSize = 24;
title.characters = 'Account';
return {id: card.id, titleId: title.id};
```

Verify exact font styles with filtered `list_fonts` queries rather than enumerating all fonts. For mixed text, collect fonts from `getRangeAllFontNames(0, characters.length)` and load each unique family/style once before modifying characters or ranges. Assign lineHeight and letterSpacing as unit/value objects. Reassign fills/strokes/effects arrays rather than mutating nested properties in place. Paint color is `{r,g,b}`; use paint opacity separately.

Combine related edits and structural readback in one script; return IDs, changed values and counts. Add one screenshot to that script only when needed for visual verification. Returning whole node objects or dumping the entire document increases context without proving the specific change.

Append before setting child `layoutSizingHorizontal/Vertical = 'FILL'`. HUG belongs on compatible auto-layout containers. Set width before wrapping text; use `textAutoResize='HEIGHT'` and a fixed horizontal dimension. Do not apply `characters` to containers or component-property definitions to a component variant when the parent set owns them.

Use `await figma.setCurrentPageAsync(page)` for dynamic-page access. Load a page before inspecting its children; `await page.loadAsync()` is available. Avoid loading all pages for a targeted edit. `getNodeByIdAsync`, font loads, variable/style lookups and exports must be awaited.

For instance relationships, use `await instance.getMainComponentAsync()`. The synchronous `instance.mainComponent` getter is unavailable with dynamic-page access and can fail even in an otherwise read-only script.
