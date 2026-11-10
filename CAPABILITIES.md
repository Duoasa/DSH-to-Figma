# Capability coverage — 0.4.1 (unreleased)

**0.4.1 is an unreleased comprehensive upgrade of 0.3.5.** It registers **34 local tools** (19 existing plus 15 workflow tools), including four workspace-only tools, plus five setup/guidance tools. Local Plugin API execution remains the default. Official desktop/remote MCP backends retain dynamic tool discovery and their original schemas; this upgrade does not depend on remote approval.

The 2026-11-09 comparison observed 44 Codex Figma tools. The earlier [48-tool inventory](codex-tool-baseline.json) is a historical 2026-10-18 snapshot, not the current catalog or a percentage of equivalent functionality. A shared tool name does not establish equivalent behavior. See the [local workflow reference](skills/figma-workbench/references/local-workflows.md) for parameters, examples and limits.

| Capability | Local implementation and boundary | Official MCP mode |
| --- | --- | --- |
| Canvas scripting | `use_figma`: native nodes, styles, layout, components and variables; scoped local task context | Original advertised tool |
| Design/component/FigJam context | Opt-in semantic projection: descendant layout, style references, text, component provenance, variable modes and FigJam-specific fields; bounded coverage and section plans | Original schemas/results |
| Variable usage and design-system search | Target subtree variable dependencies/aliases/modes; explicitly selected page search; local-file styles/variables and available variable libraries | Advertised cloud/library search |
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
| Operation recovery | Work/document-scoped status and optional retained small results; no automatic replay | Original run/status contracts |
| Code Layers | Existing `CODE_INSTANCE` nodes are opaque: exposed identity/geometry/visibility only; no internal source or child access. Screenshot/export only when the node exposes a working export API. Local creation is unavailable when the native constructor is absent. Code Blocks and editable DOM imports are different features. | `send_code_to_figma` only if actually advertised and authorized; no cloud dependency added |
| New cloud files, Code/Make, generative plugins, image generation, Weave and publication | These cloud resources/services are not implemented by the local upgrade | Dynamic pass-through when actually advertised and authorized |
| Resources, prompts and help | Bundled user-help and technical guides, including the new local workflow reference | MCP resources/templates/read and prompts/list/get |

## Availability and verification

Canvas workflow additions and new read options require companion **featureVersion 5**. The four workspace-only tools (`project_index`, `project_match`, `project_mappings`, `local_recipes`) need a current Work workspace but no connected canvas. Core legacy scripts retain their earlier compatibility. Use `figma_setup`, then close and rerun the paired companion when the feature version is old.

Check `figma_status` and refresh `get_capabilities` for gated work. The selected editor, its exposed API, fonts and account access determine what succeeds. A read-only probe does not establish successful writes, native video encoding, playback or rendered shader output. The companion cannot unlock unavailable APIs. Native Specs still require an exposed `figma.spec` surface; the earlier tested desktop environment did not expose it.

The [0.4.1 upgrade record](docs/0.4.1-upgrade.md) separates 208 automated tests, DSH-kernel integration, installed-browser capture and native Design/FigJam/Slides/MP4 smoke acceptance. Automated fixtures establish contracts, boundedness, failure handling and selected API interactions. They are not real Figma rendering or playback acceptance. Earlier [0.3.5 verification](docs/0.3.5-verification.md) and [desktop/local verification](docs/verification.md) remain historical evidence for their recorded scenarios; they do not certify every newly added workflow. New Design/FigJam/Slides composition, fonts, shader output and video playback require real-editor checks.

## Operational boundaries

- One document binds automatically only when it is the sole connection. Multiple documents, a disconnected binding or a workspace change require explicit selection. Reconnect hints never switch targets or replay operations.
- Local `use_figma` follows the [Codex Figma 17 contract alignment](docs/figma-use-17-alignment.md), with local environment differences. Calls preserve the current editor page and selection; explicitly switch only when the intended target requires it. Operations on one document remain sequential.
- Scripts and authoring operations can partially mutate the document. After an uncertain result, inspect affected IDs. `batch_edit` only restores its captured field subset and never invokes global undo.
- Semantic `coverage.complete` describes the documented field projection, not every possible Plugin API property. Exported CSS and project matches are candidates requiring application/rendered verification.
- Workspace baselines, mappings and recipes reject symlinked stores and silent overwrite. They remain local files, not official Figma cloud resources.
- Official MCP access is preserved, not asserted. Use its actual discovered catalog and account errors. Task-based server execution, sampling, embedded host panels and interactive elicitation are not silently emulated.
- “Local” describes the Plugin API/host route, not a promise that Figma, library access or host model inference works offline. No cloud Figma service was added to implement these workflows.

Official reference points: [Plugin API](https://developers.figma.com/docs/plugins/api/figma/), [manifest](https://developers.figma.com/docs/plugins/manifest/), [MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/), [remote installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/).

### First-use efficiency (0.4.1 development)

Corrected `compare` requires companion **featureVersion 7**; optional `verify`, restricted reads, font resolution and cleanup keep their protocol-6 gates. Product/package versions remain 0.4.1. `bounds:"node"` uses the node rectangle (outside shadows/strokes excluded); `bounds:"render"` includes the native effect extent and reports the subject offset. Reference crops must describe the same chosen rectangle. Export dimensions are checked against native bounds; the small raster-rounding allowance is not a visual acceptance tolerance. Images retain aspect ratio, no automatic registration/stretching.

`get_metadata({nodeId,profile:"full",depth:10,responseMode:"recovery"})` returns node identity, parent, bounds, layout mode and text snippets after existing full-response completeness checks. Shortened fields are explicit; detailed paints, text runs, bindings and component properties remain available through normal scoped reads. The inventory does not prove which operation created a node or validate omitted properties. Incomplete reads and variable-resource barriers remain protected. Normal metadata responses are unchanged.

Common literal icon-name errors and proven-node `strokeDashes` assignments fail in the existing parse before dispatch. Dynamic errors retain partial-write semantics with actionable diagnostics. No new always-on canvas scans, screenshots, model calls or dependencies.
