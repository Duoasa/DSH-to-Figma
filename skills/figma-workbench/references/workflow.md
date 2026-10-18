# Inspect → construct → verify

Use `get_metadata` for the page index and a bounded subtree. Use `get_design_context` for detailed layout/CSS and one screenshot; it is more informative than repeatedly expanding metadata. Search components, variables and styles before creating substitutes. Inspect the target parent's layout before appending children.

For an existing design, return a short internal plan of the affected nodes and intended change. For a new composition, establish typography scale, spacing rhythm, colors, image needs and component reuse. Position new top-level frames away from existing bounds. Respect the requested product rather than forcing a visual template.

Build a coherent subtree in one operation when safe. Reuse stable IDs for subsequent changes. A script that creates a frame should return its ID; the next script should locate that ID rather than create another frame with the same name. A name is a discovery aid, not a unique identity.

Use one composition screenshot after building, then a targeted post-fix screenshot if needed. Inspect overflow, cramped spacing, inconsistent radii, weak contrast, unbalanced density, missing imagery, wrong font styles and responsive behavior. Validate component linkage and variable bindings structurally. A screenshot does not prove those relationships.

Local reads and writes are serialized per connected document. Do not run independent scripts concurrently on the same canvas. Different DSH sessions must each bind a document. The currently selected Figma node may change through human interaction; use explicit node IDs once discovered.
