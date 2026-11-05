# 0.4.0 local verification — 2026-11-04

This build is **unreleased**. Work is on `codex/figma-use-17-040`, based on 0.3.2 hotfix.1. No Release, version tag or registry publication was performed. Earlier user-authorized installation/reload placed a development build in the desktop profile; the final pre-release recheck below used an isolated installation and did not replace that running profile.

## Automated and native host checks

`npm run test:all` runs syntax/build validation, the Node test suite, then real Cordis/DSH service lifecycle and tool-execution smoke checks. Final suite: **111 tests passed**, plus native smoke **PASS** with DSH **0.2.1-rc.5**, Node **24.18.0**, **22 local tools** and the bundled skill. The native smoke uses actual DSH services with a simulated canvas, not a live model. It checks the production plugin entry, Work scoping, explicit file selection, HTTP bridge, execution/preflight, durable vision attachments, text-only-model behavior, workspace exports, local Markdown read/edit/conflict rejection and cleanup.

Focused regression coverage includes:

- Capability exposure versus unavailable/unknown, read-only probes, per-document cached reports and featureVersion 3 backward compatibility.
- Native methods retain their receiver; animation application records remain ordinary enumerable objects. Track edits/removal retain unrelated tracks, text and parenting.
- Replacement helpers return new IDs, preserve other bindings and reject unsafe reordering; unsupported direct collection assignments fail before dispatch when provable.
- Motion read budgets, long Unicode names/errors, optional fields and explicit omissions.
- Native Specs exact edits/anchors in a fixture, unavailable namespace and bridge write-barrier behavior.
- Local Markdown import/persistence, UTF-8 text limits, safe identifiers, revision conflicts, atomic all-or-nothing edits, pagination, authenticated import/export and refusal to read arbitrary filesystem paths.
- Broad package peer admission remains unchanged from 0.3.2 hotfix.1; stable/RC/alpha/beta matrices and lockfile consistency pass. This does not prove every admitted host runtime.

## Real Figma desktop companion

During the initial live-editor acceptance phase, an isolated bridge and private companion were used without changing installed DSH profiles. A later user-authorized development installation/reload is separate from that evidence. The test scripts are in `test/manual/`; the reusable harness loads the production plugin. The credential-bearing companion and raw execution artifacts remain in ignored `.figma/040-live-home`. Do not distribute this directory.

The dedicated acceptance page (node 48:710) contains:

- One two-mode collection, three variables with semantic aliasing, two button variants, a bound native instance with text override and Dark mode. Repeating creation retained all IDs and counts.
- Motion board `48:723`: translation, solid-fill and blur tracks; targeted edit changes end translation to 440px at 1.2s, removes only rotation and preserves track/key IDs.
- Native TextStagger revised to WORD/1.5s without changing text or stacking a second application.
- Reusable custom opacity style entry revised to 0.6s and its heading application offset to 0.1s, each retaining a single entry/application. Replacement IDs are explicitly recorded.
- Timeline UI showed 3 manual tracks and 6 keyframes. Actual playback advanced time and displayed translation, color change, blur and sequential words. This is a functional playback smoke check; it does not replace the user's final visual acceptance.

[Sanitized real-editor evidence](figma-use-17-real-evidence.json) records IDs, readback and checks. Initial scripts exposed a real native/cloud difference: collection assignment was rejected by the native API. After inspecting actual state, the method-based adapter was implemented and the targeted edit passed. Failed writes were not blindly replayed.

## Specifications: separate native and Markdown routes

The official Codex Figma 17 tool created native Spec node 50:7 (node 50:7). The initial engineering-rule sample was corrected following user feedback to **UI design specifications**: layout, color/theme, typography, component state, motion and scope, with links to the tested designs. Native exact replacements and missing/ambiguous-target rejection were verified. No comments were posted. [Native evidence](figma-use-17-spec-evidence.json).

The local companion still reports native `figma.spec` unavailable in this file/editor. Cloud success is not evidence of native local support.

The requested local alternative was tested through the **actual companion file picker**: import [ui-design-spec-test.md](ui-design-spec-test.md), list/read through production DSH tools, precisely update one motion sentence, then download through the companion and native Save dialog. File bytes equal the expected one-sentence change; all other rules and original source bytes are unchanged. [Import/edit/export evidence](figma-use-17-local-spec-evidence.json). Copies persist in the active DSH home's private storage; they are not watched source files, cloud documents, or comment threads.

## Delivery and limits

Local artifacts: `dist/dsh-to-figma-0.4.0.tgz`, `dist/DSH-to-Figma-companion-0.4.0.zip`, and `dist/SHA256SUMS-0.4.0`. The ZIP is generic/unpaired. The package includes guides and verification documentation, excludes the private `.figma` test home and the pre-existing untracked remote validation note. The archived plugin entry also passed the native smoke from an isolated temporary extraction, resolving dependencies from the pinned test installation. The generic ZIP bootstrap contains only version/port, with no pairing token. The test bridge was stopped and the original Local companion was reopened and connected after validation.

Native Motion/Specs availability can differ by editor/account/file. FigJam/Slides live acceptance, private cloud executor parity, cloud rendering/export-video, and testing every declared DSH version remain outside these verified results. The Figma UI intermittently reported pending synchronization; local readback and playback passed, but no universal cloud-sync guarantee is claimed.

## Persistent default Markdown specification (2026-11-04)

The companion can explicitly set, switch or clear a default for the current DSH home. Selection survives restart; clearing retains the copies. Current default metadata is refreshed in the DSH system prompt and figma_status. Specification bodies remain untrusted tool-result data. Before local canvas mutations, the host requires this Work session to have read all pages of the current revision. Selection changes and edits invalidate receipts; missing defaults block writes until reselected or cleared. Already-dispatched operations are not canceled.

Validation: persistence/switch/clear/missing-file/symlink tests; authenticated bridge routes; UI state and explicit activation; complete pagination, session isolation and stale-read invalidation. Real DSH services verify dynamic prompt assembly, status, rejection before dispatch, successful dispatch after reading, and clearing. This verifies data delivery and read enforcement, not live-model visual conformance.

## Bundled user help

Six user-help topics (index plus connection, design, Markdown/default specs, motion, and troubleshooting) ship alongside eleven technical guides. The system prompt and bundled skill route usage questions through `figma_read_guide`. Tests verify all six help topics remain readable with the backend unavailable, reject unknown/path-traversal topics, and do not reconnect. Native DSH service smoke verifies guide retrieval in a conversation without a workspace, before a canvas connects, and checks the assembled help instruction. This verifies packaging, routing instructions, and tool delivery; it does not claim a live model will answer every question correctly.

## Final pre-release recheck

See [0.4.0 pre-release check](0.4.0-pre-release-check.md) for the final dependency fixes, corrupt-spec recovery, Node 22/24 results, clean-package installation and remaining host-owned audit findings. The live-editor evidence above comes from the earlier same-day acceptance runs; it was not repeated for the final storage/dependency/reconnect-status fixes.

<!-- Public copy: private Figma file key and links omitted. -->
