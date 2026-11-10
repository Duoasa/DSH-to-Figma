# Reusable design systems

## Choose the requested scope

A token edit, one component, a full library, and reconciliation are different tasks. Do not expand a single button request into a complete design system. Inspect existing conventions and reuse the intended identities. For a full library, establish variables/modes, semantic aliases and text/effect styles before dependent components; for a focused component, create only the foundations it needs.

Keep a workspace ledger, for example `.figma/design-system-state-<taskId>.json`, with fileKey, sessionId, page IDs, collection/mode/variable/style/component IDs, completed steps and pending validation. Update it from actual tool results after each coherent batch. The host writes this file outside use_figma; never put orchestration state in layer descriptions or plugin data. After context loss, read the ledger and verify referenced IDs before resuming. Use exact collection+name+type checks only when no stable ID exists; ambiguous matches require resolution, not fuzzy deletion.

## Discover and reuse

When shared libraries are relevant, inspect get_libraries first. Local search supports `queries:[{entity:"component",query:"Button"},{entity:"variable",query:"color/primary"}]` and returns ordered `results`. Supply pageId for the intended component page. Available variable libraries do not imply a cloud-wide component catalog or Code Connect mapping. Nonempty includeLibraryKeys is rejected locally instead of ignored.

Discover components and styles with filtered, paged `search_design_system` calls. Use `profile:"summary"` for discovery and detailed `get_component_context` for the selected component. Limit `get_variable_defs` to the relevant collections, IDs, type and modes; summary data intentionally omits values. Follow pagination before treating an inventory as complete. Local component discovery is page-scoped, not a search of every subscribed cloud library.

FeatureVersion 5 adds explicit `pageIds` searches with coverage and an opt-in semantic component projection. For variables used by a target, use `get_variable_defs({nodeId,...})` separately from inventory filters; it follows alias dependencies and reports per-node mode resolutions and missing/error cases. `project_index`, `project_match` and `project_mappings` support workspace reuse with explicit mappings ahead of heuristic suggestions. See [local workflows](local-workflows.md); local mappings never publish official Code Connect.

For a known component or variable ID, read it directly instead of repeating discovery. To discover collections, call `get_variable_defs({collectionsOnly:true,query:"...",limit:50})`; query matches collection names and includes empty collections without fetching variable values. Normal variable-page responses include only related collections, so `collections:[]` does not establish that none exist. Use coverage and pagination to distinguish a complete local collection inventory from filtered or partial results. Check available libraries when the task calls for shared tokens. Reuse intended collections and their mode IDs rather than creating duplicates.

Create components with `figma.createComponent`, variants using `figma.combineAsVariants`, and instances with `component.createInstance`. Set instance overrides through `setProperties`. Inspect the parent component set's property definitions before choosing property names and variant values. Avoid detachInstance unless the user explicitly needs independent geometry. Use `importComponentByKeyAsync` or `importComponentSetByKeyAsync` for a known published key; do not invent one.

Create variable collections with `figma.variables.createVariableCollection`. Use the returned mode IDs, not labels, in `setValueForMode`. Create aliases with `figma.variables.createVariableAlias`. Bind node fields with `setBoundVariable` and paint fields with `setBoundVariableForPaint`, then reassign the updated paint array. Discover API support and correct scopes before binding. Load the fonts used in every FONT_FAMILY mode before relying on mode switching.

Keep typography, effects and grid styles as real local styles when reusable. Use asynchronous style APIs and node setters where required by dynamic-page access. Return variable IDs, mode IDs, component IDs and instance counts from the write. Verify a representative instance and theme state visually, then fix only the faulty component or binding.

Batch related variable/component edits and structural readback in one script, retaining actual IDs. Do not replace an existing variable or component solely because its name matches. After an uncertain write, follow `reconcile` for the affected resources. Full `get_variable_defs` values can reconcile controlled variable operations for the returned collection; they cannot clear unrelated canvas writes. For affected nodes, use complete scoped metadata without pagination, optionally `responseMode:"recovery"`, and check `recovery.cleared`. Inspect relevant omitted bindings/component properties; a node inventory alone does not establish variable state.

## Variable mode limits and a single-mode fallback

An existing collection with several modes is not evidence that the current file/account can add another mode, or that a new collection can have the same number. `collection.modes` describes existing modes, not an entitlement or a writable capacity. The current editor can reject `collection.addMode('Dark')` with `Limited to 1 modes`. Do not infer a plan limit from another collection, and do not keep retrying the same rejected addition.

Read the intended collection's ID, `defaultModeId`, modes and relevant variables first. Reuse the requested mode's actual ID when it already exists; resolve ambiguous names before writing. If a requested mode is missing, isolate its creation in a small `use_figma` call **before** dependent variable, component or node edits. For a new collection, retain its returned ID/default mode first, then handle the optional additional mode separately. Do not put a risky `addMode` after a large creation batch.

For an already resolved collection, this preparation call reuses Dark or attempts just that mode addition. It catches only the known native mode-limit message and returns an explicit result. Other errors propagate; do not turn every `addMode` exception into a fallback success.

```js
const collection = await figma.variables.getVariableCollectionByIdAsync('COLLECTION_ID_FROM_READ');
if (!collection) throw new Error('Target variable collection no longer exists');
const requestedMode = 'Dark';
const matches = collection.modes.filter(mode => mode.name === requestedMode);
if (matches.length > 1) throw new Error('Ambiguous Dark mode; resolve its ID first');
if (matches.length === 1) {
  return {status:'reused', collectionId:collection.id, modeId:matches[0].modeId};
}
try {
  const modeId = collection.addMode(requestedMode);
  return {status:'created', collectionId:collection.id, modeId};
} catch (error) {
  const nativeMessage = String(error?.message ?? error);
  const limited = /^(?:in addMode: )?Limited to ([1-9]\d*) modes only$/.exec(nativeMessage);
  if (!limited) throw error;
  return {status:'mode-limit', collectionId:collection.id, requestedMode,
    maximumModes:Number(limited[1]), defaultModeId:collection.defaultModeId,
    modes:collection.modes.map(mode => ({modeId:mode.modeId, name:mode.name})),
    error:nativeMessage, fallbackRequired:true};
}
```

Report `mode-limit` as a constraint, not as a created Dark mode. Re-read the collection and relevant variables before choosing the next write. A caught error is not proof of rollback, and an uncaught tool error is not automatically safe to replay. If `safeToRetryWithoutCanvasRead` is false or absent, follow `reconcile`: inspect affected collection values, aliases and modes, plus any node bindings actually touched. Controlled variable operations can reconcile through complete collection values; arbitrary scripts or other unresolved canvas writes may still require scoped metadata. Check the returned recovery state, then continue only missing work.

When the requested visual result can use independent theme tokens, a single-mode fallback may be appropriate:

1. Reuse a previously recorded fallback collection by ID, or create a clearly named independent collection such as `Theme — Dark fallback`. Use its real `defaultModeId`; rename only this new collection's default mode to Dark if useful. Do not call `addMode` again for this fallback.
2. Create the required Dark variables in that collection. Track the original-to-fallback variable ID mapping, rebuild the needed semantic aliases against the intended fallback primitives, and set values only under the fallback mode ID. Preserve existing Light values, modes, aliases and variable identities.
3. Rebind the intended Dark nodes' fields and paints to those fallback variable IDs; use `setBoundVariableForPaint` and reassign the returned paints. Creating a collection or setting its explicit mode does not redirect existing bindings from the Light collection. If shared component bindings cannot be overridden on the intended target, use a dedicated fallback component/variant rather than changing the shared Light component.
4. Read back fallback values, alias targets and node bindings, verify the Light values are unchanged, and inspect both appearances. Report that this is a separate single-mode theme with explicit bindings, **not** native Light/Dark switching in the original collection. If native switching itself is required, explain the editor restriction instead of claiming this fallback satisfies it.

## Creation, modification and validation sequence

1. Resolve the target page, inventory relevant existing collections/components, and load the exact fonts before mutation. Do not reuse a name match from a different collection or component family.
2. Reuse/create the collection and resolve its actual mode IDs. Rename a default mode only when that change is intended; preserve existing Light modes. Isolate any missing requested mode addition before dependent edits and follow the mode-limit procedure above if it is rejected. Retrieve existing variables by stable IDs; check resolvedType before editing. Prefer collection objects in createVariable. Use explicit scopes such as ALL_FILLS or GAP instead of leaving ALL_SCOPES indiscriminately.
3. Set each requested mode value with its real modeId. For semantic variables, set createVariableAlias(target), preserving alias types instead of flattening everything into literal colors. Validate target type and avoid alias cycles. Preserve untouched modes. Apply setVariableCodeSyntax only when requested/useful.
4. Create native components and editable text; configure auto layout, dimensions, padding and variable bindings. Use setBoundVariableForPaint's returned paint and reassign fills. Bind spacing/dimensions through setBoundVariable. In incremental loading, use `node.setExplicitVariableModeForCollection(collectionObject, modeId)`, NOT a collection ID string.
5. For variants, establish valid axis/value combinations, name each variant consistently, then combineAsVariants. Arrange the resulting set with auto layout or an explicit readable grid. Read componentPropertyDefinitions from the set when it owns them. Add supported TEXT/BOOLEAN/INSTANCE_SWAP properties and wire componentPropertyReferences to the relevant child fields.
6. Create instances, setProperties using exact property keys (including suffixes), and preserve linkage. After a variant change, await instance.getMainComponentAsync before a mainComponent selector. Do not detach instances to work around an avoidable property error.
7. Return IDs and evidence: collection/mode counts, variable types/scopes/values and alias targets, component/variant/property counts, instance linkage, bindings and positive layout dimensions. One representative screenshot checks composition; screenshots do not prove alias/binding correctness. Test requested modes and states.
8. For updates, mutate the existing ID. For retries, reconcile actual partial state before deciding which missing objects to create. A successful repeat must not duplicate collections, variables, variants or instances. Stop when requested scope passes.

Errors with safeToRetryWithoutCanvasRead:true mean the script did not run. Otherwise inspect the affected nodes, variables and component state before retrying; the local bridge does not roll back changes. Native font/style/editor restrictions remain authoritative.

## Variant layout and safe readback pattern

For a new set, arrange variants immediately after combining; overlapping input positions can produce overlapping variants. The following assumes `variants` contains the intended newly created components with valid names (for example `State=Default` and `State=Hover`) and `page` is the intended current page. Choose layout dimensions for the actual design; do not re-layout an existing set merely to read it.

```js
const set = figma.combineAsVariants(variants, page);
set.set({layoutMode:'VERTICAL', primaryAxisSizingMode:'AUTO',
  counterAxisSizingMode:'AUTO', itemSpacing:16,
  paddingTop:16, paddingBottom:16, paddingLeft:16, paddingRight:16});
const instance = variants[0].createInstance();
page.appendChild(instance);
instance.x = set.x + set.width + 80;
instance.y = set.y;
// After any setProperties/swapComponent, obtain the current main component again.
const main = await instance.getMainComponentAsync();
return {setId:set.id, instanceId:instance.id, mainComponentId:main?.id,
  mainComponentName:main?.name};
```

Never put `instance.mainComponent` in a final return: a failing getter can hide an otherwise completed write. For validation, prefer small direct checks and bounded query results over a large custom assertion framework. Keep creation, follow-up modification and independent read-only verification as separate coherent calls when testing a workflow.
