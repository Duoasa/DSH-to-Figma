# 0.4.0 / Codex Figma 17 alignment

Status: unreleased local build, 2026-11-04. Base: 0.3.2 hotfix.1 (`2b91919`). Retain the existing MCP bridge and native DSH tool lifecycle; no rewrite was needed. This is functional alignment of the available local workflows, not binary equivalence with Figma's private cloud executor.

The installed official plugin version is 17.0.0. `figma-use-17-baseline.json` records SHA-256 hashes of the consulted skill/API sources. The earlier 16.0.0 record contains hashes, not a full source checkout: do not claim that each capability described here first appeared in 17.0.0. Official skill text is not redistributed.

| Workflow | 0.4.0 behavior | Difference from cloud |
| --- | --- | --- |
| Scripts, queries, layout, components, variables, image/assets | Retained 0.3.2 contracts, async page/main-component access, syntax checks, bounded reads and unknown-write inspection | Serial per-editor execution; no cloud transactions or parallel page executor |
| Session, description, skill names | Local Work-scoped UUID and context metadata; optional for legacy scripts | Not a cloud session |
| Capability discovery | get_capabilities / figma_status report exposure/read probes with timestamps and explicit unknown state | Does not unlock unavailable APIs or prove writes |
| Motion reads | Per-node reactions, motion, manual tracks, application styles, timelines; optional resolved manual animations; explicit byte-budget omissions | Screenshot is resting state; no cloud render/video service |
| Motion edits | Native apply/remove track and setTimelineDuration methods | Native collection properties cannot be directly assigned |
| Text motion | Discovered TextStagger definitions; preserve text/font and replace requested final application | dsh.updateAnimationStyle returns a new binding ID, never silently stacks or reorders |
| Custom animation styles | Discover/create/apply/remove native styles; dsh.updateAnimationEntry replaces final entry | Entry ID changes; non-final replacements require an explicit ordered rebuild |
| Native Specs | Native namespace passthrough when exposed; exact edits and content readback guide | Native local figma.spec was absent in the tested editor; official cloud route separately verified |
| Markdown specifications | File-picker import, persistent private copy, default selection/clearing, automatic default guidance and full-read checks before writes, list/read/exact edit, optimistic revision, export from companion | Not native SPEC_BLOCK, no cloud comments or automatic source-file synchronization |
| Cloud-only services | Existing official backend passthrough when advertised | No local emulation of Make/Weave/shader source services, cloud file creation or publishing |

## Version and compatibility contract

The public package version and generated paired companion version are 0.4.0. Companion featureVersion is 4. Core use_figma/create_session still accept version 3 companions; capability discovery and expanded motion reads require version 4. Helpers and Markdown UI require the updated companion. Reinstall the local package in the intended DSH profile, restart DSH, run figma_setup, close and reopen the companion. Paired archives contain local credentials and must not be distributed. The generic companion ZIP is credential-free.

The user-requested relaxed declaration is preserved exactly:

- `engines.dsh: "*"`, Node >=22.
- Cordis `4.0.x`; Schemastery `3.18.x`.
- DSH home-paths, mcp-client, skill peers: `^0.2.0-0 || ^0.2.1-0 || ^0.2.2-0`.
- This admits stable 0.2.x and alpha/beta/RC builds of 0.2.0, 0.2.1 and 0.2.2. npm excludes prereleases of other patch tuples (e.g. 0.2.3-rc.1); 0.3.0 and its prereleases are outside the range. Do not imply universal future prerelease admission.
- Development dependencies remain pinned at the tested DSH 0.2.1-rc.5 runtime. Admission is not evidence that every runtime passed tests.

## Read-only versus writable

`capabilities.readOnly: true` describes the **probe operation**, not a read-only plugin. Actual Motion writes passed in the desktop companion. Native animation collections themselves are read-only getters: the public API supplies specific methods to modify them. Unsupported assignments are rejected during preflight when statically provable, otherwise at runtime with inspection guidance.

Replacement helpers create the replacement before removing the old final binding/entry. They reject nonexistent IDs and attempts to reorder other applications. They are not transactions: a failure after creation may leave both applications, so inspect IDs before retrying. Native Specs API absence is a different limitation, addressed by the explicitly separate local Markdown workflow.
