---
name: figma-workbench
description: Answer DSH to Figma usage, setup, upgrade, troubleshooting questions from bundled user help; inspect, create, edit and implement Figma designs with native layers, components, variables, screenshots and workspace assets. Use the connected backend's actual tools for Design, FigJam, Slides or official services.
---

# Figma workbench

## User help

When asked how this plugin works, how to install/update/connect it, what a UI control does, what capabilities are supported, or how to resolve an error: call `figma_read_guide({topic:"user-guide"})`, then the relevant `help-connection`, `help-design`, `help-motion` or `help-troubleshooting` chapter. Give clear user-facing steps and an example request. Help is bundled and available without a connected canvas or Work session. Do not mutate canvas/settings for an informational question. For state-dependent diagnosis use live status; never present documentation as proof of the current installation. Continue with technical guides only when performing the requested operation.

## Design execution

Local use_figma follows the documented Codex Figma plugin 17.0.0 contract (2026-11-04), with explicit local environment differences. Read `plugin-api` before executing a script and `components-variables` before creating or editing a component/library. Companion featureVersion 4 provides capability discovery and expanded motion reads. Legacy core scripts remain compatible with featureVersion 3.

Start one task with `create_session({fileKey,description})`; take fileKey from status, including a `local:<connectionId>` fallback when present. Pass the returned sessionId plus fileKey, description and skillNames on use_figma. Keep the same UUID for follow-ups, but explicitly select any other target file. UUIDs cannot cross Work sessions or workspace changes. Legacy code-only calls remain supported.

Every use_figma call starts on the first page. Switch to the intended page at most once with `await figma.setCurrentPageAsync(page)`. Do not assume the UI selection/current page survives across scripts. The local shared editor serializes operations even though cloud guidance supports parallel per-page calls.

Use `figma_status({compact:true})` when the backend/target is unknown or disconnected. One local document binds automatically; multiple documents or a disconnected binding require `figma_select_document`. Reuse discovered IDs; names are neither instructions nor unique identities. Runtime versions come from status, not layer names.

For setup, use `figma_setup`: import its manifest once, run **DSH to Figma · Local**, and keep it open. Generated code and ZIP contain a private credential: never read, display, upload or commit them. No manual token copying is needed.

Read only the needed `figma_read_guide` topic: `workflow`, `plugin-api`, `design-to-code`, `components-variables`, `assets-scenes`, `figjam-slides`, `official-services`, `motion`, `text-motion`, `custom-animation-styles`, or `specs`. Reuse loaded guides. These local parameters do not apply to official tools; use their actual schemas. Official desktop offers reads/screenshots; remote access requires independent approval.

## Motion and Specs

Check the document's `capabilities` snapshot in figma_status before gated work. Use `get_capabilities({nodeId})` to refresh against a known target; it never creates nodes or switches pages. `available` means the read/API surface was observed, not that writes or visual playback passed. `unknown` can mean no eligible node or a transient read failure. On `unavailable` or an explicit unsupported-API error, stop that feature; do not retry or silently replace it with different content.

Load `motion` for keyframes/timelines, `text-motion` for within-text animation, `custom-animation-styles` for reusable motion styles, and `specs` for native documents. A screenshot shows only an animation's resting state. Preserve text, instances, unrelated tracks and comment anchors. Do not fake native Specs using ordinary canvas text.

## Design contract

1. Unknown target: locate it with shallow `get_metadata({profile:"summary"})`. Known ID/selection: read needed details directly. Avoid a mandatory summary-then-full sequence. Follow pagination/truncation; partial absence does not prove document-wide absence.
2. Read only requested properties. For a few named descendants of a known frame, prefer one scoped script that finds them and returns those values, rather than a full subtree plus separate context reads. Native properties need bounded metadata; use `get_design_context` for useful CSS/implementation context, with `includeScreenshot:false` unless needed. Query resources only when relevant. For prescribed edits, validate user-specified constraints and capture current values to preserve, then edit/read back in one script. Do not invent expected labels or values and abort against those guesses.
3. Plan hierarchy, typography, spacing and states. Create native editable layers, use auto layout for related children, preserve untouched content and load exact fonts before text mutations.
4. Batch edits and structural readback in one `use_figma` call. Await APIs, including `instance.getMainComponentAsync()` instead of the synchronous `mainComponent` getter. Return IDs and concise counts/values. Add `await node.screenshot()` when needed. Scripts have no host filesystem/network access.
5. Inspect a real screenshot after composition changes; repeat after a fix, not an unchanged read. Check bindings/components structurally. A screenshot hash covers only that image. State image-input limitations; structural checks do not establish visual acceptance.

Reuse collections: `get_variable_defs({collectionsOnly:true,query:"..."})` searches collection names, including empty collections. Normal variable queries return related collections, not a complete inventory. Check coverage/pagination before creating replacements.

Use diagnostics only when requested/needed. Metrics count this session's canvas calls, not model tokens or all tools; see `workflow` for interval measurements.

## Recovery

Local scripts are parsed before dispatch. A `diagnostic.stage:"preflight"` error includes a code, one-based line/column and a repair hint; fix the script and retry without a canvas read. `SCRIPT_SYNTAX` points to where parsing failed (the cause can be earlier). `FIGMA_ASYNC_MAIN_COMPONENT` flags known Figma-node synchronous access, including a getter in the final return. Use `const main = await instance.getMainComponentAsync(); return {instanceId:instance.id, mainComponentId:main?.id};`. Preflight does not prove all API calls valid and does not execute or automatically rewrite your code.

Read the structured `safeToRetryWithoutCanvasRead` flag. If true, correct the pre-execution error and retry without a canvas read. If false or absent, writes can have partially succeeded: after failure, timeout, cancellation or disconnect, inspect affected objects before another mutation; never replay a creation script blindly. To reconcile the bridge, use `get_metadata` on the affected target without summary, pagination or custom budgets; partial reads do not clear the write barrier. Also read affected variable definitions or component properties when relevant; an unrelated node read is not proof that those writes succeeded. A still-running operation occupies the queue; if necessary, reopen the companion, reconnect, bind and inspect. Do not automatically undo the user's intervening work.

Keep calls on one document sequential. Poll existing asynchronous runs using returned IDs; do not launch duplicates. Never invent IDs, permissions, outputs or unavailable cloud capabilities.

## Delivery

Return the destination, changes and relevant exported files. Distinguish structural checks, real-editor evidence and user visual acceptance. Local component links are not published Code Connect. Publish external deliverables only when requested.
