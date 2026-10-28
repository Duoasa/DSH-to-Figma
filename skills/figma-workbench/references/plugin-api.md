# Local figma-use contract (Codex Figma plugin 16.0.0 baseline)

Read this guide before writing Plugin API code. This implements the documented helper contract in the real Figma editor, not the private cloud executor. See `docs/figma-use-16-alignment.md` for exact differences. Use `figma_status` to verify companion featureVersion >= 3. Read `components-variables` as well for ANY component creation, and `figjam-slides` for those editors.

## Invocation and output

Start a task with `create_session({fileKey,description})`, using the exact fileKey from `figma_status`. Pass that UUID as `sessionId` with `use_figma({fileKey,sessionId,description,skillNames:"figma-workbench",code})`. `skillNames` records loaded guidance, not execution permissions. The local UUID records a DSH Work task, not a Figma cloud recording. Reuse across explicitly selected files. A mismatched fileKey or another Work session's UUID is rejected before dispatch. A private/local file without an exposed cloud key uses `local:<connectionId>`. Legacy `{code}` remains accepted for existing integrations.

Write a plain asynchronous JavaScript body: top-level `await` and `return`; NO extra IIFE. Console output is not tool output. Return all affected node, variable, collection, style and component IDs plus relevant counts/names/bounds. IDs persist; JavaScript variables do not. Do not call closePlugin or replace the companion UI/message handler. Scripts have no host filesystem APIs.

Every call starts on the FIRST page, including read-only calls. Re-select a known target with `await figma.setCurrentPageAsync(page)` at most once per call. The sync setter throws. `await page.loadAsync()` loads a non-active page for inspection. The local editor has one shared currentPage: keep calls sequential rather than copying the cloud parallel-page workflow.

## Query and QueryResult

`node.query(selector)` searches descendants, excluding the root itself. `node.matches(selector)` tests a single node. There is no global `figma.query()`.

Supported selectors:

- Types case-insensitive: `frame`, `TEXT`, `COMPONENT_SET`; `*` matches any type.
- Exact attributes: `[name="Card"]`, `[visible=true]`, `[opacity=0.5]`.
- String attributes: `[name*=Card]`, `[name^=Header]`, `[name$=Nav]`.
- Paths: `[fills.0.type=SOLID]`, `[fills.*.type=SOLID]`.
- Instances: `[mainComponent=12:34]`, `[mainComponent.name=Button]`.
- Relationships: `FRAME TEXT`, `FRAME > TEXT`, `TEXT + RECTANGLE`, `TEXT ~ FRAME`.
- Pseudo classes: `:first-child`, `:last-child`, `:nth-child(2)`, `:not(TEXT)`, `:is(FRAME,RECTANGLE)`, `:where(TEXT,ELLIPSE)`.
- IDs: `#12:34`, `12:34`, `#I12:34;56:78`, bare GUID; comma union deduplicates matches in traversal order.

QueryResult supports `length`, `first()` / `last()` (null if empty), `toArray()`, `each(fn)` (chainable), `map(fn)`, `filter(fn)` (QueryResult), `values(['id','name'])`, `set(props)` (chainable), `query(selector)` (deduplicated descendant queries), and `for...of`. Local numeric indexing remains available for older scripts. Unsupported selector syntax throws instead of silently broadening the search.

Dynamic-page instance matching uses public `getMainComponentAsync()` results. After `instance.setProperties()` changes a variant, call `await instance.getMainComponentAsync()` before matching its main component again. For another page, await `page.loadAsync()` first. Never use the native synchronous `instance.mainComponent` getter in scripts.

```js
const page=await figma.getNodeByIdAsync('12:34');
await figma.setCurrentPageAsync(page);
const card=page.query('FRAME[name="Account card"]').first();
if(!card)throw new Error('Expected account card is absent');
return card.query('TEXT[visible=true]').values(['id','characters']);
```

## Mutation and layout

`node.set(props)` applies layoutMode FIRST, width/height through `resize()` SECOND, and remaining properties LAST. This preserves requested HUG/FILL sizing after resize. Returns the node. `figma.createAutoLayout(direction?, props?)` creates an auto-layout frame with both axes hugging content. Default direction HORIZONTAL; props may be the first argument.

```js
const row=figma.createAutoLayout({name:'Actions',itemSpacing:12});
row.set({width:320,layoutMode:'HORIZONTAL',layoutSizingHorizontal:'FIXED'});
const label=figma.createText();row.appendChild(label);
await figma.loadFontAsync({family:'Inter',style:'Regular'});
label.fontName={family:'Inter',style:'Regular'};
label.set({characters:'Continue',fontSize:16});
const placement=figma.currentPage.findPlacement({width:320,height:64});
if(placement)row.set({x:placement.x,y:placement.y});
return {createdNodeIds:[row.id,label.id],width:row.width};
```

Append before FILL; HUG applies only in compatible auto-layout contexts. `layoutSizing*`: FIXED/HUG/FILL; `*AxisSizingMode`: FIXED/AUTO. Resize before setting sizing. For wrapping text, give an explicit width and `textAutoResize='HEIGHT'`. Narrow type-specific properties first; optional chaining does not guard unsupported Figma getters. Description belongs on COMPONENT / COMPONENT_SET. A variant's component property definitions belong to its parent set.

Load current fonts before changing existing text, using `getStyledTextSegments(['fontName'])` or `getRangeAllFontNames`. Confirm exact styles with list_fonts; Inter `Semi Bold` is not `SemiBold`. For FONT_FAMILY variables load every relevant mode's font before binding/value changes/mode switching. Await every promise. Colors use 0–1 RGB; alpha belongs to paint opacity. Clone/change/reassign fills, strokes and effects; do not mutate returned arrays in place.

## Output helpers

- `await node.screenshot({scale?,contentsOnly?})`: inline PNG with name and dimensions/position. Default scale min(0.5, 1024 / longest edge); explicit scale bypasses that cap (local safety maximum 4). Up to four screenshots per operation, 8 MiB per image. Existing `quality` presets remain a local extension. The separate get_screenshot tool retains its legacy defaults.
- `figma.io.write('report.json', JSON.stringify(result))` or `figma.io.write('image.png', await node.exportAsync({format:'PNG'}))`: write string / Uint8Array outputs to the response. Host saves them under workspace `.figma/assets` and returns actual paths. Paths are logical names, never arbitrary host write paths; 20 files / 12 MiB combined.
- `node.tree({maxDepth?,maxChildren?,fields?})`: readable indented tree with property paths. Default depth 3, 50 children per node, 1500 visited nodes maximum. Formatting is a local implementation, not an official byte-for-byte tree serialization.
- `page.findPlacement({width,height})`: current page only. Uses native support if present, otherwise places to the right of existing content with an 80px gap; does not reproduce the private cloud placement optimizer.
- `node.placeholder=true/false`: tracks progress in the companion UI. No canvas shimmer is provided by the public API. Clear it in finally; remaining flags are cleared when the call exits, including failure. This state is per-call, not persistent canvas content.
- `dsh.color('#C4B5FD')`: retained local RGB convenience.

## Recovery

Read `safeToRetryWithoutCanvasRead` on a failed use_figma result. true means no user script ran (validation/compilation/pre-dispatch failure): correct and retry. false means execution may have changed the document: inspect affected nodes AND variables/components before changing anything. The local executor is nontransactional; it does not claim automatic rollback. An unknown outcome stays blocked until a full get_metadata read reconciles the canvas. Never blindly replay creation. If the same API error recurs, inspect that API definition and correct the root cause.

The public native API remains available where Figma exposes it. Cloud-only APIs, cloud file creation, cloud design-system search, Code Connect publication and server recording are not silently emulated. Official backends retain their own discovered schemas.
