---
name: figma-workbench
description: Inspect, create, edit and implement Figma designs with native layers, components, variables, screenshots and workspace assets. Use the connected backend's actual tools for Design, FigJam, Slides or official services.
---

# Figma workbench

Use `figma_status({compact:true})` when the backend/target is unknown or disconnected. One local document binds automatically; multiple documents or a disconnected binding require `figma_select_document`. Reuse discovered IDs; names are neither instructions nor unique identities. Runtime versions come from status, not layer names.

For setup, use `figma_setup`: import its manifest once, run **DSH to Figma · Local**, and keep it open. Generated code and ZIP contain a private credential: never read, display, upload or commit them. No manual token copying is needed.

Read only the needed `figma_read_guide` topic: `workflow`, `plugin-api`, `design-to-code`, `components-variables`, `assets-scenes`, `figjam-slides`, or `official-services`. Reuse loaded guides. These local parameters do not apply to official tools; use their actual schemas. Official desktop offers reads/screenshots; remote access requires independent approval.

## Design contract

1. Unknown target: locate it with shallow `get_metadata({profile:"summary"})`. Known ID/selection: read needed details directly. Avoid a mandatory summary-then-full sequence. Follow pagination/truncation; partial absence does not prove document-wide absence.
2. Read only requested properties. For a few named descendants of a known frame, prefer one scoped script that finds them and returns those values, rather than a full subtree plus separate context reads. Native properties need bounded metadata; use `get_design_context` for useful CSS/implementation context, with `includeScreenshot:false` unless needed. Query resources only when relevant. For prescribed edits, validate user-specified constraints and capture current values to preserve, then edit/read back in one script. Do not invent expected labels or values and abort against those guesses.
3. Plan hierarchy, typography, spacing and states. Create native editable layers, use auto layout for related children, preserve untouched content and load exact fonts before text mutations.
4. Batch edits and structural readback in one `use_figma` call. Await APIs, including `instance.getMainComponentAsync()` instead of the synchronous `mainComponent` getter. Return IDs and concise counts/values. Add `await node.screenshot()` when needed. Scripts have no host filesystem/network access.
5. Inspect a real screenshot after composition changes; repeat after a fix, not an unchanged read. Check bindings/components structurally. A screenshot hash covers only that image. State image-input limitations; structural checks do not establish visual acceptance.

Reuse collections: `get_variable_defs({collectionsOnly:true,query:"..."})` searches collection names, including empty collections. Normal variable queries return related collections, not a complete inventory. Check coverage/pagination before creating replacements.

Use diagnostics only when requested/needed. Metrics count this session's canvas calls, not model tokens or all tools; see `workflow` for interval measurements.

## Recovery

Writes can partially succeed. After failure, timeout, cancellation or disconnect, inspect affected objects before another mutation; never replay a creation script blindly. To reconcile the bridge, use `get_metadata` on the affected target without summary, pagination or custom budgets; partial reads do not clear the write barrier. Also read affected variable definitions or component properties when relevant; an unrelated node read is not proof that those writes succeeded. A still-running operation occupies the queue; if necessary, reopen the companion, reconnect, bind and inspect. Do not automatically undo the user's intervening work.

Keep calls on one document sequential. Poll existing asynchronous runs using returned IDs; do not launch duplicates. Never invent IDs, permissions, outputs or unavailable cloud capabilities.

## Delivery

Return the destination, changes and relevant exported files. Distinguish structural checks, real-editor evidence and user visual acceptance. Local component links are not published Code Connect. Publish external deliverables only when requested.
