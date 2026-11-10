# Capability coverage — 0.4.1

The local catalog registers **43 tools**, including four workspace-only tools, plus five connection/help tools. Local Plugin API execution is the default. Official desktop/remote MCP retains dynamic tool discovery, original schemas, resources, prompts and OAuth; local features do not require remote approval.

This is a feature and API-boundary reference, not a verification checklist. See the [local workflow guide](skills/figma-workbench/references/local-workflows.md) for parameters and examples. The [Codex tool inventory](codex-tool-baseline.json) is a historical snapshot, not a current equivalence score.

| Capability | Local implementation and boundary | Official MCP mode |
| --- | --- | --- |
| Canvas scripting | `use_figma`: native nodes, styles, flexible layout, components and variables; optional sessions bootstrap within the bound Work/file; optional restricted read-only scripts | Original advertised tool |
| References and visual specifications | File-owned frame or named-text references; bind/change/unbind in Figma or DSH; on-demand thumbnail/content and compact change notices before the next model request. Native Specs require an exposed editor API. | Advertised Specs/reference services |
| Fonts and icons | Font listing and batch resolution with explicit fallbacks; 27 bundled Feather vectors; no bundled font files or automatic glyph guarantee | Original advertised tools |
| Visual verification | Optional `use_figma.verify`, node screenshots, reference comparison with side-by-side/overlay images and explicit region measurements; bounded layout observations, no automatic visual acceptance | Original advertised tools |
| Design/component/FigJam context | Opt-in semantic projection: descendant layout, style references, text, component provenance, variable modes and FigJam-specific fields; bounded coverage and section plans | Original schemas/results |
| Variables and design-system search | Create values or explicit aliases, add modes, read dependencies and observed quota limits; scoped search for local components/styles/variables and accessible variable libraries. No local mode-order editing. | Advertised cloud/library search |
| Design-to-code | Semantic context, CSS on request, asset mappings and workspace reuse; the host implements and verifies application code | Advertised design context and code services |
| Persistent design comparison | `design_diff`: file/node-bound baselines, explicit create/update, revision checks and capture-policy compatibility; incomplete captures rejected | Only when advertised |
| Project reuse | Bounded component/token/SVG index and evidence-based candidates; explicit mappings take precedence; stale sources are reported | Advertised Code Connect services |
| Local mappings | Workspace `.figma/mappings/` records and existing node plugin-data links are separate local stores; neither publishes Code Connect | Original mapping/suggestion contracts |
| Local recipes | Save/list/read/remove JavaScript source in `.figma/recipes/`; syntax/preflight validation, no host execution | No assumption of a matching service |
| Assets and screenshots | Raster/SVG import, targeted image-fill replacement, export settings, bounded subtree SVG/original-image extraction and node/file mappings; screenshot size controls | Original upload/download/screenshot contracts |
| Motion and video | Recursive native reads; limited CSS conversion with unsupported cases reported; MP4/GIF/WebM export through the editor's native encoder and chunked workspace transfer | Advertised motion/export tools |
| FigJam diagrams | Structured graphs or a limited Mermaid flowchart subset become editable shapes and bound connectors in an open FigJam file | Advertised diagram service |
| Slides | Title/body/notes/theme layouts in an open Slides file, with overflow warnings and returned node IDs | Advertised deck/file services |
| Webpage → canvas | Isolated installed-browser capture and computed DOM import; fixed editable boxes/text, explicit unsupported-style/media warnings | Advertised capture/import services |
| Shaders | Discover native definitions, locate file usage, import/apply an existing shader with validated parameters when APIs are exposed | Advertised source-library create/read/update services |
| Controlled batch edits | Preflight, limited property/text/fill operations and best-effort field restoration; not a document transaction | Original advertised behavior |
| Operation recovery | Structured reason/state/action, scoped status with retained results, optional persistent idempotency keys and partial write journals; affected-resource reconciliation and eligible failed-created-node cleanup, no general transaction | Original run/status contracts |
| Explicit step tasks | Caller-defined steps, bounded checkpoints and resume tokens; never automatically split arbitrary scripts or replay partially failed steps | Original advertised task tools |
| Code Layers | Existing `CODE_INSTANCE` nodes are opaque: exposed identity/geometry/visibility only; no internal source or child access. Screenshot/export only when the node exposes a working export API. Local creation is unavailable when the native constructor is absent. Code Blocks and editable DOM imports are different features. | `send_code_to_figma` only if actually advertised and authorized; no cloud dependency added |
| New cloud files, Code/Make, generative plugins, image generation, Weave and publication | These cloud resources/services are not implemented by the local upgrade | Dynamic pass-through when actually advertised and authorized |
| Resources, prompts and help | Bundled user-help and technical guides, including the new local workflow reference | MCP resources/templates/read and prompts/list/get |

## Compatibility and availability

- Corrected `compare` requires companion **featureVersion 7**.
- Optional verification, restricted read-only scripts, font resolution and failed-node cleanup require **6**.
- Semantic reads and base canvas workflows require **5**; capability/motion reads require **4**; core scripts remain compatible with **3**.
- Product/package/companion versions remain **0.4.1**; featureVersion is a protocol gate, not a product version.
- `project_index`, `project_match`, `project_mappings` and `local_recipes` need a current Work workspace but no connected canvas.

When a feature reports an old companion, run `figma_setup`, then close and rerun the paired plugin. Reuse valid status/capability evidence; refresh only for the target API when needed. The selected editor, exposed APIs, fonts and account permissions determine availability. A capability read is not proof of successful writes or visual acceptance. See [setup](docs/setup.md) for host compatibility and installation.

## Operational boundaries

- One document binds automatically only when it is the sole connection. Multiple documents, a disconnected binding or a workspace change require explicit selection. Reconnect hints never switch targets or replay operations.
- Local `use_figma` follows the [Codex Figma 17 contract alignment](docs/figma-use-17-alignment.md), with local environment differences. Calls preserve the current editor page and selection; explicitly switch only when the intended target requires it. Operations on one document remain sequential.
- Scripts and authoring operations can partially mutate the document. Follow `reconcile`, checking retained operation results before reading affected resources. Known no-write failures add no barrier and never clear prior uncertainty. `batch_edit` restores only its captured field subset; opt-in failed-node cleanup is conservative. Neither invokes global undo or replays creation.
- Semantic `coverage.complete` describes the documented field projection, not every possible Plugin API property. Exported CSS and project matches are candidates requiring application/rendered verification.
- Workspace baselines, mappings and recipes reject symlinked stores and silent overwrite. They remain local files, not official Figma cloud resources.
- Official MCP access is preserved, not asserted. Use its actual discovered catalog and account errors. Task-based server execution, sampling, embedded host panels and interactive elicitation are not silently emulated.
- “Local” describes the Plugin API/host route, not a promise that Figma, library access or host model inference works offline. No cloud Figma service was added to implement these workflows.

Official reference points: [Plugin API](https://developers.figma.com/docs/plugins/api/figma/), [manifest](https://developers.figma.com/docs/plugins/manifest/), [MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/), [remote installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/).

## Lightweight verification and recovery

`bounds:"node"` uses the node rectangle (outside shadows/strokes excluded); `bounds:"render"` includes the native effect extent and reports the subject offset. Reference crops must describe the same chosen rectangle. Export dimensions are checked against native bounds; the small raster-rounding allowance is not a visual acceptance tolerance. Images retain aspect ratio, no automatic registration/stretching.

`get_metadata({nodeId,profile:"full",depth:10,responseMode:"recovery"})` returns node identity, parent, bounds, layout mode and text snippets after existing full-response completeness checks. Shortened fields are explicit; detailed paints, text runs, bindings and component properties remain available through normal scoped reads. The inventory does not prove which operation created a node or validate omitted properties. Incomplete reads and variable-resource barriers remain protected. Normal metadata responses are unchanged.

Common literal icon-name errors and proven-node `strokeDashes` assignments fail in the existing parse before dispatch. Dynamic errors retain partial-write semantics with actionable diagnostics. No new always-on canvas scans, screenshots, model calls or dependencies.

## Local tool inventory

- **Canvas and context**: `create_session`, `use_figma`, `get_selection`, `get_metadata`, `get_screenshot`, `get_design_context`, `get_figjam`, `get_component_context`, `get_capabilities`.
- **Design system and references**: `list_fonts`, `resolve_fonts`, `get_variable_defs`, `get_libraries`, `search_design_system`, `create_variables`, `add_variable_modes`, `get_design_reference`, `set_design_reference`, `clear_design_reference`.
- **Assets, motion and authoring**: `upload_assets`, `download_assets`, `import_scene`, `get_motion_context`, `export_video`, `generate_diagram`, `generate_deck`, `get_shaders`, `list_file_shaders`, `apply_shader`, `import_dom_snapshot`, `capture_webpage`.
- **Reuse, verification and recovery**: `get_local_component_links`, `set_local_component_links`, `design_diff`, `project_index`, `project_match`, `project_mappings`, `local_recipes`, `batch_edit`, `run_steps`, `operation_status`, `compare`, `rollback`.
- **Connection and help**: `figma_status`, `figma_setup`, `figma_read_guide`, `figma_select_document`, `figma_reconnect`.
