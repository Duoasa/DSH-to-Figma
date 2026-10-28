# Reusable design systems

## Choose the requested scope

A token edit, one component, a full library, and reconciliation are different tasks. Do not expand a single button request into a complete design system. Inspect existing conventions and reuse the intended identities. For a full library, establish variables/modes, semantic aliases and text/effect styles before dependent components; for a focused component, create only the foundations it needs.

Keep a workspace ledger, for example `.figma/design-system-state-<taskId>.json`, with fileKey, sessionId, page IDs, collection/mode/variable/style/component IDs, completed steps and pending validation. Update it from actual tool results after each coherent batch. The host writes this file outside use_figma; never put orchestration state in layer descriptions or plugin data. After context loss, read the ledger and verify referenced IDs before resuming. Use exact collection+name+type checks only when no stable ID exists; ambiguous matches require resolution, not fuzzy deletion.

## Discover and reuse

When shared libraries are relevant, inspect get_libraries first. Local search supports `queries:[{entity:"component",query:"Button"},{entity:"variable",query:"color/primary"}]` and returns ordered `results`. Supply pageId for the intended component page. Available variable libraries do not imply a cloud-wide component catalog or Code Connect mapping. Nonempty includeLibraryKeys is rejected locally instead of ignored.

Discover components and styles with filtered, paged `search_design_system` calls. Use `profile:"summary"` for discovery and detailed `get_component_context` for the selected component. Limit `get_variable_defs` to the relevant collections, IDs, type and modes; summary data intentionally omits values. Follow pagination before treating an inventory as complete. Local component discovery is page-scoped, not a search of every subscribed cloud library.

For a known component or variable ID, read it directly instead of repeating discovery. To discover collections, call `get_variable_defs({collectionsOnly:true,query:"...",limit:50})`; query matches collection names and includes empty collections without fetching variable values. Normal variable-page responses include only related collections, so `collections:[]` does not establish that none exist. Use coverage and pagination to distinguish a complete local collection inventory from filtered or partial results. Check available libraries when the task calls for shared tokens. Reuse intended collections and their mode IDs rather than creating duplicates.

Create components with `figma.createComponent`, variants using `figma.combineAsVariants`, and instances with `component.createInstance`. Set instance overrides through `setProperties`. Inspect the parent component set's property definitions before choosing property names and variant values. Avoid detachInstance unless the user explicitly needs independent geometry. Use `importComponentByKeyAsync` or `importComponentSetByKeyAsync` for a known published key; do not invent one.

Create variable collections with `figma.variables.createVariableCollection`. Use the returned mode IDs, not labels, in `setValueForMode`. Create aliases with `figma.variables.createVariableAlias`. Bind node fields with `setBoundVariable` and paint fields with `setBoundVariableForPaint`, then reassign the updated paint array. Discover API support and correct scopes before binding. Load the fonts used in every FONT_FAMILY mode before relying on mode switching.

Keep typography, effects and grid styles as real local styles when reusable. Use asynchronous style APIs and node setters where required by dynamic-page access. Return variable IDs, mode IDs, component IDs and instance counts from the write. Verify a representative instance and theme state visually, then fix only the faulty component or binding.

Batch related variable/component edits and structural readback in one script, retaining actual IDs. Do not replace an existing variable or component solely because its name matches. After an uncertain write, reconcile the affected variable values, aliases and bindings or component properties in addition to a `get_metadata` read without summary, pagination or custom budgets; a node snapshot alone does not establish variable state. Partial metadata reads do not clear the bridge's write barrier.

## Creation, modification and validation sequence

1. Resolve the target page, inventory relevant existing collections/components, and load the exact fonts before mutation. Do not reuse a name match from a different collection or component family.
2. Reuse/create the collection, rename its actual defaultModeId, and add only missing requested modes. Retrieve existing variables by stable IDs; check resolvedType before editing. Prefer collection objects in createVariable. Use explicit scopes such as ALL_FILLS or GAP instead of leaving ALL_SCOPES indiscriminately.
3. Set each requested mode value with its real modeId. For semantic variables, set createVariableAlias(target), preserving alias types instead of flattening everything into literal colors. Validate target type and avoid alias cycles. Preserve untouched modes. Apply setVariableCodeSyntax only when requested/useful.
4. Create native components and editable text; configure auto layout, dimensions, padding and variable bindings. Use setBoundVariableForPaint's returned paint and reassign fills. Bind spacing/dimensions through setBoundVariable. In incremental loading, use `node.setExplicitVariableModeForCollection(collectionObject, modeId)`, NOT a collection ID string.
5. For variants, establish valid axis/value combinations, name each variant consistently, then combineAsVariants. Arrange the resulting set with auto layout or an explicit readable grid. Read componentPropertyDefinitions from the set when it owns them. Add supported TEXT/BOOLEAN/INSTANCE_SWAP properties and wire componentPropertyReferences to the relevant child fields.
6. Create instances, setProperties using exact property keys (including suffixes), and preserve linkage. After a variant change, await instance.getMainComponentAsync before a mainComponent selector. Do not detach instances to work around an avoidable property error.
7. Return IDs and evidence: collection/mode counts, variable types/scopes/values and alias targets, component/variant/property counts, instance linkage, bindings and positive layout dimensions. One representative screenshot checks composition; screenshots do not prove alias/binding correctness. Test requested modes and states.
8. For updates, mutate the existing ID. For retries, reconcile actual partial state before deciding which missing objects to create. A successful repeat must not duplicate collections, variables, variants or instances. Stop when requested scope passes.

Errors with safeToRetryWithoutCanvasRead:true mean the script did not run. Otherwise inspect the affected nodes, variables and component state before retrying; the local bridge does not roll back changes. Native font/style/editor restrictions remain authoritative.
