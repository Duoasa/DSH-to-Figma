# Local workflow tools — 0.4.1

These workflows are included in **0.4.1**. They use the paired local companion and workspace helpers; no official remote MCP access is required. Official MCP mode still exposes its discovered schemas unchanged. The local tool contracts below must not be applied to an official tool merely because its name matches.

Semantic reads and base canvas workflows need companion featureVersion 5; quality/recovery options need 6, and corrected comparison needs 7. Run `figma_setup`, then close and rerun the paired companion if status shows an older feature version. The four workspace tools (`project_index`, `project_match`, `project_mappings`, `local_recipes`) require an active Work workspace but no connected canvas. Other calls use the selected document; keep them sequential.

Replace example IDs, paths and revisions with values discovered in the current task. Read capability results and errors literally: a probe does not create a node, import a shader or test an encoder. Automated fixtures verify contracts; they do not establish real-editor rendering, font layout, animation playback or user visual acceptance.

## Semantic context and dependencies

Use the smallest relevant target. Opt into the semantic field projection when implementation context or component provenance is needed:

```json
{"nodeId":"12:34","semantic":true,"includeCss":true,"includeScreenshot":false,"dedupeStyles":true,"dedupeComponents":false,"depth":10,"maxNodes":500,"maxBytes":262144}
```

This example is for `get_design_context`; `get_figjam` and `get_component_context` also accept semantic options. Results carry `contextVersion`, `node`, `sharedStyles`, `coverage` and, when incomplete, a `sectionPlan`. The projection includes layout/constraints, text, paints/effects, variable modes/bindings, component properties/main-component identities and supported FigJam text/connectors/tables. `includeCss:true` requests CSS for descendants that expose the API. It does not generate production application code.

`coverage.complete` applies to `semantic-field-projection-v1`, not every possible Plugin API property. Follow truncation, omitted fields and field errors. Style references point into `sharedStyles`; never discard that table. Optional component deduplication emits explicit source/descendant-ID correspondence for identical serialized children. It is off by default and is unsuitable for direct baseline capture without expansion.

Read variables actually used under a target with `get_variable_defs`:

```json
{"nodeId":"12:34","depth":10,"maxNodes":500,"maxBytes":262144}
```

This scoped mode follows aliases and reports usages, collections, modes, resolutions and missing/error cases. Do not combine it with inventory filters such as `ids`, `collectionsOnly`, `modeIds`, query or pagination. Use the existing inventory mode separately when needed.

For explicit cross-page search, call `search_design_system` with actual page IDs:

```json
{"pageIds":["0:1","0:9"],"queries":[{"entity":"component","query":"Button"},{"entity":"variable","query":"color/primary"}],"maxNodes":1000,"maxBytes":262144}
```

Coverage is limited to the specified pages for components and local-file resources for variables/styles. With `pageIds`, supply `libraryCollectionKeys:["AVAILABLE_COLLECTION_KEY"]` to include variable descriptors from explicitly selected available libraries. Discover these actual collection keys with `get_libraries` first; the bounded local/library union reports coverage and does not import variables, resolve arbitrary library contents or search cloud component catalogs. Library access still depends on actual permission and editor access.

## Persistent design baselines

`design_diff` obtains its own complete semantic snapshot of the selected file/target. It disables component deduplication and saves baselines under `.figma/snapshots/`. Do not pass a model-written snapshot to the tool.

```json
{"nodeId":"12:34","action":"compare"}
```

If no baseline exists, the result requests explicit creation:

```json
{"nodeId":"12:34","action":"create"}
```

After reviewing actual added/removed/changed nodes and properties, accept the new baseline explicitly:

```json
{"nodeId":"12:34","action":"update","expectedRevision":"REVISION_FROM_PREVIOUS_RESULT"}
```

Creation never overwrites. Update requires the previous revision. Incomplete/oversized captures, file/node identity mismatches, damaged records and incompatible source/context-version/collection policies fail without replacing the baseline. Shared style changes participate in the diff. Budget changes are allowed only when the resulting capture is independently complete. Split a large design into complete target sections; a partial section is not a full-file baseline.

## Project reuse and explicit mappings

`project_index` scans allowlisted workspace source/style/SVG files without executing code. It skips hidden/build/vendor directories and symlinks, caps files/bytes/depth/entries, and returns coverage plus export/name/literal evidence rather than source text. It is a heuristic index, not compiler analysis.

```json
{"query":"button","maxFiles":1000,"maxBytes":4194304}
```

`project_match` scans the project and loads its explicit mappings automatically:

```json
{"components":[{"id":"FIGMA_COMPONENT_KEY","name":"Button"}],"tokens":[{"id":"VariableID:1:2","name":"color/primary","value":"#315bff"}]}
```

Name/value candidates have evidence and ambiguity flags; they are not confirmed bindings. An explicit mapping with the same kind and exact input `id` takes precedence. `status:"mapped"` identifies this user choice, while `verified:false` still means rendered/semantic equivalence is unverified. `status:"stale-mapping"` requires repair; heuristic candidates never silently replace it.

Use `project_mappings` to record an explicit choice in `.figma/mappings/`:

```json
{"action":"set","kind":"component","figmaKey":"FIGMA_COMPONENT_KEY","sourcePath":"src/components/Button.tsx","exportName":"Button"}
```

Kinds are `component`, `token` and `icon`. Paths must name an allowed real workspace file. `{"action":"list"}` returns revisions and source-existence checks; overwrite/remove requires that record's `expectedRevision`. These records are separate from `get_local_component_links` / `set_local_component_links` stored on canvas nodes. Neither store publishes official Code Connect.

Confirm up to 50 explicit mappings in one request with `set_many`:

```json
{"action":"set_many","mappings":[{"kind":"component","figmaKey":"FIGMA_BUTTON_KEY","sourcePath":"src/components/Button.tsx","exportName":"Button"},{"kind":"icon","figmaKey":"FIGMA_ICON_KEY","sourcePath":"assets/arrow.svg"}]}
```

Every item is checked for identity, source confinement, duplicate keys, revisions and capacity before the first record is written. Existing records need their own `expectedRevision`. Single and bulk writers share a workspace lock. This is not a transaction: an external filesystem change or storage error can still interrupt the write phase. A runtime failure returns `ok:false`, confirmed `applied` records, the failed identity and its `writeOutcome`, plus `notAttempted` identities. Inspect the failed identity before retrying; successful earlier writes are retained. A workspace-lock conflict reports that no writes started. No canvas mutation, automatic undo or Code Connect publication occurs.

## Reusable local scripts

`local_recipes` stores inert source under `.figma/recipes/`:

```json
{"action":"save","name":"inspect-selection","description":"Return selected IDs","code":"return figma.currentPage.selection.map(node => node.id);"}
```

Use `list`, or `read` with the recipe name, to retrieve it. Save validates bounded JavaScript syntax and the normal script preflight. It does not run the script or validate every API call. Review returned source, adapt discovered target IDs and execute through bound `use_figma` with normal task metadata/readback. Overwrite/remove requires the latest `expectedRevision`; arbitrary filesystem paths are not accepted.

## Images, export settings and video

Replace one raster fill per target using `upload_assets`, preserving the existing image paint's crop/transform unless a new scale mode is explicitly requested:

```json
{"files":["assets/hero.png"],"nodeIds":["12:40"],"fillIndex":0}
```

Do not combine `nodeIds` with `parentId`. SVG remains editable vector import rather than raster fill replacement. Export settings and subtree extraction are explicit options on `download_assets`:

```json
{"nodeId":"12:34","respectExportSettings":true,"includeSvgAssets":true,"includeOriginalImages":true}
```

Follow returned node/image/file mappings. Asset batches remain bounded (12 MiB, up to 40 returned files in the extended route). `get_screenshot` accepts `maxDimension`; scale, dimensions and actual returned pixels still matter when evaluating detail.

`export_video` resolves the selected node's top-level Design frame and requests its native encoder:

```json
{"nodeId":"12:34","format":"MP4","fps":30,"quality":"HIGH"}
```

MP4/WebM support fps 12/24/30/60 and LOW/MEDIUM/HIGH quality. GIF supports fps 8/12/15/24/30 and optional `loopCount`, without quality. Encoding errors are preserved; a generic `exportAsync` method does not prove video support. The bridge serializes export, transfers up to 256 MiB in bounded chunks and saves a fresh `.figma/assets/<batch>/` file with size/hash metadata. A valid container signature is not proof of correct animation playback. Do not start duplicate exports after an uncertain outcome; inspect status and the destination first.

For recursive motion or limited code conversion:

```json
{"nodeId":"12:34","recursive":true,"maxNodes":500,"maxDepth":10,"codeFormat":"css"}
```

`get_motion_context` retains native data and reports conversion coverage. CSS supports selected manual translation/rotation/scale/opacity tracks and supported easing. Styles, triggers, ambiguous timelines, unconvertible fields and easing remain explicit unsupported cases. Apply candidate CSS to a dedicated motion wrapper, preserve resting transforms and follow the returned application notes. Test in the application and Figma player; screenshots do not verify timing.

## Editable diagrams and decks

`generate_diagram` operates in the connected **FigJam** file:

```json
{"nodes":[{"key":"start","label":"Start","shape":"terminal"},{"key":"check","label":"Ready?","shape":"decision"}],"edges":[{"from":"start","to":"check"}],"direction":"LR"}
```

Alternatively supply `{"mermaid":"flowchart LR\nA[Start] --> B{Ready?}\nB -->|Yes| C(Done)"}`. The subset accepts flowchart/graph LR/TB/TD, basic bracket/brace/parenthesis nodes and one `-->` edge per line, optionally with a label. Other Mermaid diagram types, styling, subgraphs and complex chains are not supported. Layout is deterministic; cyclic remainders produce a warning. Connectors remain bound to native nodes. This creates a new diagram, not an incremental graph reconciler.

`generate_deck` operates in an already open **Slides** file:

```json
{"slides":[{"title":"Problem","body":["What users need"],"notes":"Introduce the context."},{"title":"Plan","body":["Build","Validate"]}],"theme":{"background":"#FFFFFF","text":"#17202A","accent":"#315BFF","fontFamily":"Inter","fontStyle":"Regular"}}
```

Use up to 30 slides with up to 12 body paragraphs each. By default native `createSlide()` appends slides. An explicit `row` must already exist; new slides append after its existing columns. The workflow creates editable title/body/page-number layouts, writes notes when the editor exposes native `speakerNotes`, reports text overflow and returns created IDs. `NOTES_UNAVAILABLE` means supplied notes were not written; do not claim otherwise. It does not create a new cloud file, select a cloud template, implement a slide master or certify visual fit. Inspect representative slides and every reported overflow. Authoring errors include created IDs for recovery.

## Existing native shaders

Use `get_shaders` to discover exposed definitions, with `shaderIds`/pagination when needed. `list_file_shaders({nodeId,maxNodes})` reports existing usage and coverage in a subtree. These are not cloud source-code readers.

```json
{"nodeId":"12:40","shaderId":"DISCOVERED_SHADER_ID","slot":"fills","index":0,"properties":{}}
```

The example is for `apply_shader`. Use actual property-definition IDs and their supported value types. Slot/type validation precedes assignment; import itself can change the file resource state. If a later step fails after import, inspect that resource before retrying. No local shader source create/update service or generative-plugin authoring is supplied. Verify rendered output in the actual editor.

## Computed DOM import and browser capture

`import_dom_snapshot` accepts measured boxes relative to their parents:

```json
{"snapshot":{"name":"Example","width":640,"height":360,"children":[{"key":"heading","tag":"h1","bounds":{"x":24,"y":24,"width":592,"height":64},"text":"Hello","styles":{"fontFamily":"Inter","fontStyle":"Regular","fontSize":32,"color":"#17202A"},"children":[]}]}}
```

In a Design file it creates editable frames/text, using the supported color/font/border/opacity/radius/clip subset. Imports are fixed layouts, not responsive CSS or runnable Code Layers. Unsupported properties and media boxes produce warnings; fonts may require a reported fallback and text overflow requires review.

`capture_webpage` captures a user-specified HTTP(S) page in a new isolated installed Chromium browser, then imports that snapshot:

```json
{"url":"http://localhost:3000","viewport":{"width":1440,"height":900}}
```

The helper discovers installed Chrome/Chromium/Edge (or `DSH_FIGMA_BROWSER_EXECUTABLE`); it never downloads a browser or borrows an existing signed-in profile. It bounds time, nodes/text and snapshot size, and returns capture/import diagnostics. Media, controls, SVG/canvas/iframes, shadow DOM, pseudo-elements, shadows, filters, transforms and responsive behavior are not fully transferred. A browser page can execute its own JavaScript; capture is for the specified page, not project-script execution. Check warnings and compare the rendered source with the imported frame.

## Controlled edits and operation recovery

Use `batch_edit` only for its supported, reversible field subset:

```json
{"ops":[{"type":"set_properties","nodeId":"12:40","properties":{"opacity":0.8},"expected":{"opacity":1}}]}
```

It allows at most 50 operations using `set_properties`, `set_text` or unbound solid `set_fills`. Property support is limited to name/visible/locked/opacity; x/y outside parent auto layout; width/height on fixed, childless frames/rectangles/ellipses; fixed-layout spacing/padding; and uniform corner radius. Text replacement requires fixed homogeneous text. Preflight validates all targets, captures values, checks expected state, loads existing text fonts and rechecks before writing. Instance internals, style/variable-linked fields, unsafe mixed/rich text and geometry with unsupported layout dependencies are rejected. Use ordinary reviewed `use_figma` for broader edits, with its nontransactional behavior understood.

Read `safeToRetryWithoutCanvasRead` on errors. A known controlled-tool validation failure may return true when no mutation began; correct that input without a redundant canvas reconciliation. Once the apply phase starts, inspect `batchResult.rollback` (restored IDs, failures and residue). Restoration covers captured fields, not all document/layout effects; no global undo is used. Inspect the affected objects before another mutation even if recovery reports complete.

Canvas results include an `operationId`. Query `operation_status` in the same Work and connected document:

```json
{"operationId":"RETURNED_OPERATION_ID","includeResult":true}
```

Status is bounded in-memory history, not a durable cross-restart journal. `resultStage:"native"` identifies the companion result; `resultStage:"host"` identifies final host processing such as a saved workspace file. Small completed results may be retained. For a completed native video export whose host transfer is still pending, `includeResult:true` claims that existing transfer once, saves it to the workspace and returns the processed result. Later reads reuse the saved result; they do not encode or save a duplicate. Private transfer handles stay hidden. An expired or unavailable transfer is reported and must not be mistaken for a saved file.

Status never retries a canvas job or proves a failed mutation did nothing. includeResult can clear only the uncertainty associated with its retained successful result; other unresolved writes stay protected. If the retained result does not resolve uncertainty, follow `reconcile` for scoped metadata or variable reads. Use `responseMode:"recovery"` for a compact complete-subtree inventory and check `recovery.cleared`; inspect relevant omitted properties as needed. Reconnect and explicitly select the intended document when required.


## Lightweight recovery and explicit tasks (0.4.1)

Normal successful calls add no diagnostic queries. On failure, use `failureClass`, `executionState`, `messageHuman`, `suggestedAction` and `reconcile`. Reasons and execution state are independent: a platform limit may follow earlier writes. `retryable` never means replay an unchanged partial script. Multiple/disconnected document errors include candidates; choose explicitly.

- Optional `idempotencyKey` on mutations persists duplicate protection in the DSH home, scoped to Work/workspace/file. Same key must have the same payload (session description/UUID excluded). Retained success or error responses return without dispatch. Pending/unknown records never rerun. Maximum 1 MiB result per key and 1,000 keys per home; oversized results retain a blocking marker. Records survive restart and have no automatic expiry; do not delete history to recover uncertain work. Core calls without a key do not perform this disk I/O.
- `use_figma({journal:true})` returns a bounded observed node-proxy journal (up to 1,000 entries). It does not cover variable API calls, all helpers, asynchronous native side effects, or prove rollback. Controlled batch edits report attempted fields and restoration; scene/authoring tools report created IDs. Journal IDs are evidence, not proof of complete reconciliation.
- `create_variables({collectionId,modeId?,tokens:[{name,type,value}|{name,type,aliasOf}]})` creates tokens in an existing local collection. Aliases reference existing variables of the same type. No automatic aliasing by value and no automatic binding migration. Returns created variable IDs and per-value confirmation. Inspect failures with `get_variable_defs({collectionIds:[id],profile:"full",allVariables:true})`; a collections-only list is insufficient.
- `add_variable_modes({collectionId,names,forceRefresh?})` caches native quota failures for 60 seconds on that collection and current mode count. `get_variable_defs` collection records show observed `modesAllowed` or null and `canCreateVariable` unknown/unavailable. API exposure never proves write permission. forceRefresh discards the observation; reconnection/restart also clears it. Direct arbitrary scripts are not intercepted by this cache.

`run_steps` supports explicit steps, not automatic script splitting:

```json
{"action":"start","taskKey":"calendar-states-v1","maxSteps":1,"steps":[
  {"tool":"use_figma","args":{"code":"const n=figma.createFrame();return {id:n.id};"}},
  {"tool":"batch_edit","args":{"ops":[{"type":"set_properties","nodeId":{"$step":0,"path":["result","id"]},"properties":{"name":"Calendar states"}}]}}
]}
```

Save taskId/resumeToken. `status` is a host-only checkpoint read; `resume` with the latest token executes up to maxSteps untouched steps (default 1, max 10). Scope and original page must match; steps cannot switch away from that page. Completed step results stay in checkpoints for `$step` references; summaries are bounded. Up to 100 steps/task, 100 tasks/home, 2 MiB task input and 64 KiB per-step output. Return concise IDs. A failed/interrupted step stops the task, never restarts automatically. After reconciling effects, `resolve` with `resolution:"accept"` and a bounded `resolutionResult` records the adopted result; `resolution:"retry"` is allowed only for confirmed not-started failures and can take corrected `stepArgs`. Then resume with the new token. Partial creation needs explicit repair/acceptance, not retry. No arbitrary code rollback or exactly-once execution guarantee across crashes is claimed.

## 设计参考（0.4.1）

插件保留原连接区和底栏，新增默认收起的「设计参考」。选中一个画板、组件、分区或组，展开后点「绑定当前选区」；左侧显示名称与「解绑」，右侧显示小缩略图。规范引用只显示名称。绑定与解绑均可通过 DSH 操作。

- `set_design_reference({nodeId})` 绑定画板；缺省 nodeId 时要求当前恰好选中一个对象。
- `set_design_reference({kind:"spec",nodeId})` 引用规范画板/文字；也可传 `name` 和 `content` 保存最多 10000 字的命名规范。
- `get_design_reference()` 读取绑定；需要图片时显式传 `includePreview:true`。节点引用按 ID 跟随源对象，详细样式按需读其 nodeId。命名文本规范可再次 set 修改。
- `clear_design_reference()` 或 UI「解绑」只清除引用，不删除源画板或已生成页面。

绑定保存在当前文件的插件数据中，重开插件仍保留。改名后按 ID 识别；源对象删除后显示失效，不自动换成其他画板。打开栏目/显式读取时刷新源状态，正常操作不扫描画布。缩略图最大边 160px，仅展开或明确请求时导出。折叠不读取详细规范；`figma_status` 仅带上次已知的简短描述，不自动注入全文。不创建云端 Specs、不锁定历史快照，也不主动把规范同步应用到已生成 UI。

### 双向参考变更通知

Figma UI 与 DSH 工具的绑定/换绑/解绑共用文件内状态。插件 UI 将小型描述同步到本机桥接；DSH 的操作结果也立即同步回 UI。通知通过宿主动态上下文在下一次模型请求前刷新，明确新参考替代旧参考，或已解绑、不再沿用旧规则。不会中断已发出的模型请求或正在执行的画布操作。

通知仅含文件身份、参考名称/类型、节点 ID、版本和一句使用规则；不含截图、完整 UI 或规范正文。正常步骤只读取内存中的当前文档描述，不调工具、不扫描画布；宿主将变化的上下文记录到会话，未变的快照不重复追加。多个文档按当前 Work 绑定隔离；断开或工作区改变时不沿用旧状态。消息序号阻止迟到心跳把新绑定覆盖回旧绑定。旧宿主无动态上下文接口时使用同样简短的当前状态提示词段落。

设计参考栏目保持原结构：左侧线性图标与名称，右侧线性展开箭头，展开时箭头向上。

## Visual verification, fonts and cleanup (comparison: 7; other options: 6)

```js
// A new frame ID need not be known before creation.
use_figma({code:'const frame=figma.createFrame(); /* ... */ return {frameId:frame.id}',verify:{resultPath:'frameId',layout:true}})
compare({nodeId:'12:34',reference:{path:'reference.png'},crop:{x:0,y:0,width:1440,height:900},regions:[{name:'panel',nodeId:'12:35',referenceBounds:{x:1200,y:0,width:240,height:900}}]})
```

`reference` accepts exactly one workspace `path` or current Work message `attachmentId`. Comparison uses the local companion iframe. The left image is the reference, right is the actual render; the second image overlays them at 50%. Alignment is uniform-width and top-left, never stretched. Region rectangles use original reference-image pixel coordinates, including the crop offset. Explicit region mapping reports bounds differences in Figma units and candidate properties; auto-layout offsets may require parent spacing/sizing changes. Sampled CIE76 differences and projected edges are diagnostics, not semantic recognition or automatic visual acceptance. Font rasterization can contribute differences. Do not invent reference regions or claim a pixel match from a numeric score alone.

`verify` is optional. If drawing succeeds but verification fails, retain the returned IDs and retry verification alone, never the creation script. `readOnly:true` runs a restricted read-only interpreter: a read failure cannot introduce a write barrier, but does not clear earlier uncertain writes.

`resolve_fonts({specs:[{family:"Inter",style:"Medium"},{semantic:"mono"}],allowFallback:true})` resolves up to 50 requests against available fonts with explicit fallback/missing results. It caches availability briefly; use `forceRefresh:true` after installing fonts. It does not load fonts or prove glyph coverage. `figma.icon(name,{size,color})` creates one of the bundled Feather icons; use supported names or import custom SVG.

Opt into `trackCreated:true` for creation batches where failed-subtree cleanup is useful. On failure, `cleanup` reports availability and the operation ID. `rollback({operationId})` only accepts a failed operation owned by the current Work/file. It removes recorded disposable subtrees only after scoped change observation and native JSON snapshot checks. Existing edits, variables, components/dependencies and untracked children are never claimed restored. Later normal scripts invalidate receipts conservatively; intervening edits, lost evidence, page changes or expired receipts cause skips. Receipts are bounded and expire after ten minutes. Cleanup itself does not establish that the original operation’s other changes are reconciled; follow the returned inspection guidance. It is explicit and is never run automatically.

Normal writes do not run image analysis, record cleanup snapshots or scan the whole document. An execution result, an image-returned result, and visual acceptance remain separate.

`verify.layout:true` observes only the verified target plus up to 19 direct children. Coverage is explicit; `behaviorValidation:"not-tested"` and `layoutAcceptance:"not-established"` distinguish property evidence from behavior checks. It reports fixed/flow sizing, constraints, positioning and locks without grading a technique. Layout read failure preserves successful drawing and returned screenshots; screenshot failure can retain layout observations. Comparison-region advice preserves intended fixed/anchored/overlay/flow behavior; it never auto-restructures or unlocks layers.
