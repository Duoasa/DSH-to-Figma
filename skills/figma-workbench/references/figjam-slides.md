# FigJam, Slides and motion

The local companion runs in Design, FigJam and Slides. The current `editorType` determines which public API constructors work. Use the actual API; never substitute a PNG for an editable board or deck unless explicitly requested.

## FigJam

Do not create Design-only nodes such as components in a FigJam file. Do not call createPage in FigJam or Slides. Confirm actual constructor availability before writing; the companion does not emulate unavailable editor types.

Use `createSticky`, `createShapeWithText`, `createConnector`, `createSection`, `createText` and `createTable` when available. Create labeled nodes first and retain their IDs, then connect them using connector endpoint references. Keep connectors bound to nodes so they follow later movement. Load fonts before modifying the node's `text` sublayer. Design a clear reading direction, group related ideas, and avoid crossing connectors.

`generate_diagram` accepts structured nodes/edges or a limited Mermaid flowchart LR/TB/TD subset and creates editable shapes with bound connectors in the open FigJam file. Unsupported Mermaid syntax is rejected; cycles produce a layout warning. This is a local parser/layout workflow, not the official cloud parser or an incremental graph reconciler. See [local workflows](local-workflows.md) for examples and limits.

## Slides

Keep per-call page context explicit. Several new slides or a consistent edit across a deck may be one coherent call; choose boundaries by recoverability, not an arbitrary one-call-per-slide rule. Keep all local calls sequential.

Use `figma.createSlide()` and the public Slide/SlideRow APIs in a Slides file. Inspect their actual properties and container structure before creating many slides. Create editable text and shapes in each slide. Reuse typography, gutters, title placement and page numbering, while varying composition for comparisons, diagrams and narrative slides. Return every created slide ID and a compact description; capture representative slides, then inspect any layout-specific failures. `generate_deck` also provides basic editable title/body/notes/theme layouts in the open Slides file, returns node IDs and reports overflow. It does not create a cloud file or supply cloud templates/masters. See [local workflows](local-workflows.md); use `use_figma` for compositions outside that bounded layout contract.

## Motion and prototypes

Read prototype reactions, manual keyframe tracks, animation styles and timelines using `get_motion_context`. Load the `motion`, `text-motion` or `custom-animation-styles` guide before authoring. Use public node reactions and exposed `figma.motion` APIs through `use_figma` for the capabilities actually available in that editor version. Prototype reactions, manual timeline tracks and rendered video remain distinct. Opt-in recursive motion reads can produce a limited CSS candidate with explicit unsupported cases; `export_video` can request native MP4/GIF/WebM encoding when the local editor supports it. An unsupported encoder or timeline feature stays unavailable; do not fabricate playback acceptance. Preserve trigger, duration, easing and destination semantics when implementing interactions in code.
