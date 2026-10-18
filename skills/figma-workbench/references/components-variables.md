# Reusable design systems

Discover local components and styles with `search_design_system`, inspect selected variants with `get_component_context`, and inspect variables/modes with `get_variable_defs`. Local component search is current-page scoped. Enumerate pages, load the necessary page, then search it; do not imply that all subscribed cloud libraries have been indexed.

Create components with `figma.createComponent`, variants using `figma.combineAsVariants`, and instances with `component.createInstance`. Set instance overrides through `setProperties`. Inspect the parent component set's property definitions before choosing property names and variant values. Avoid detachInstance unless the user explicitly needs independent geometry. Use `importComponentByKeyAsync` or `importComponentSetByKeyAsync` for a known published key; do not invent one.

Create variable collections with `figma.variables.createVariableCollection`. Use the returned mode IDs, not labels, in `setValueForMode`. Create aliases with `figma.variables.createVariableAlias`. Bind node fields with `setBoundVariable` and paint fields with `setBoundVariableForPaint`, then reassign the updated paint array. Discover API support and correct scopes before binding. Load the fonts used in every FONT_FAMILY mode before relying on mode switching.

Keep typography, effects and grid styles as real local styles when reusable. Use asynchronous style APIs and node setters where required by dynamic-page access. Return variable IDs, mode IDs, component IDs and instance counts from the write. Verify a representative instance and theme state visually, then fix only the faulty component or binding.
