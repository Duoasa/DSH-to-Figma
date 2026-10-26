# Inspect → construct → verify

Start with `get_metadata({profile:"summary",depth:1})` to locate a target without loading visual styles or text segments. Read the chosen subtree with `get_design_context`; use `includeScreenshot:false` when only structure is needed. Summary data is a discovery index, not enough to reproduce a design. Search the relevant components, variables and styles before creating substitutes, and inspect the parent's layout before appending children.

Use query filters and bounded pages for discovery. Follow returned pagination and truncation information; a truncated tree is not a complete inventory. Once found, use explicit IDs and request detailed data only for the affected nodes. Do not repeatedly fetch the entire page, font list or variable collection for a small edit.

For an existing design, return a short internal plan of the affected nodes and intended change. For a new composition, establish typography scale, spacing rhythm, colors, image needs and component reuse. Position new top-level frames away from existing bounds. Respect the requested product rather than forcing a visual template.

Build or modify a coherent subtree in one operation. A script can locate known IDs, load each required font once, apply related edits, read back affected properties, and return a compact summary. Add `await target.screenshot()` in that same operation when visual verification is needed. Avoid a separate model turn for each node. Return newly created IDs and reuse them in subsequent calls; do not recreate by name.

Use one composition screenshot after building, then a targeted post-fix screenshot if needed. The default screenshot already limits its longest edge to 1600 pixels; use `quality:"overview"` for composition and `quality:"detail"` or explicit `scale` when text/spacing requires closer inspection. Do not request another identical image just because a separate screenshot tool exists. Check overflow, typography, spacing, contrast and alignment. Validate component linkage and variable bindings structurally; a screenshot does not prove those relationships.

Local reads and writes are serialized per connected document. Do not run independent scripts concurrently on the same canvas. A fresh DSH Work session binds the only connected document automatically. Multiple documents require explicit selection. Existing bindings never silently switch after disconnect. The currently selected Figma node may change through human interaction; use explicit node IDs once discovered.
