# FigJam, Slides and motion

The local companion runs in Design, FigJam and Slides. The current `editorType` determines which public API constructors work. Use the actual API; never substitute a PNG for an editable board or deck unless explicitly requested.

## FigJam

Use `createSticky`, `createShapeWithText`, `createConnector`, `createSection`, `createText` and `createTable` when available. Create labeled nodes first and retain their IDs, then connect them using connector endpoint references. Keep connectors bound to nodes so they follow later movement. Load fonts before modifying the node's `text` sublayer. Design a clear reading direction, group related ideas, and avoid crossing connectors.

A Mermaid specification can guide construction, but the local bridge does not implement Figma's cloud `generate_diagram` parser. Translate the requested graph into explicit shapes/connectors using `use_figma`. For automatic official Mermaid generation switch to an eligible official backend that advertises `generate_diagram`.

## Slides

Use `figma.createSlide()` and the public Slide/SlideRow APIs in a Slides file. Inspect their actual properties and container structure before creating many slides. Create editable text and shapes in each slide. Reuse typography, gutters, title placement and page numbering, while varying composition for comparisons, diagrams and narrative slides. Return every created slide ID and a compact description; capture representative slides, then inspect any layout-specific failures. `use_figma` can construct a deck locally; cloud `generate_deck` is a different service.

## Motion and prototypes

Read prototype reactions using `get_motion_context`. Use public node reactions and exposed `figma.motion` APIs through `use_figma` for the capabilities actually available in that editor version. Do not claim that a prototype reaction is a full animation timeline, CSS keyframe conversion or MP4 render. Server-side video export and unavailable timeline features require the official service. Preserve trigger, duration, easing and destination semantics when implementing interactions in code.
