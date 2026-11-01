# Changelog

Versions 0.1.5 through 0.3.0 are not recorded in this file. Published versions in that span are listed in [GitHub Releases](https://github.com/Duoasa/DSH-to-Figma/releases) as v0.2.1, v0.2.2, v0.2.3, and v0.3.0. This file continues from 0.3.1.

## 0.3.1 — 2026-11-01

- Declare peer compatibility with DeepSeek Harness 0.2.1-rc.4 and 0.2.1-rc.5 for `@deepseek-ai/dsh-home-paths`, `@deepseek-ai/dsh-mcp-client`, and `@deepseek-ai/dsh-skill`. The ranges still accept 0.2.1-rc.3, 0.2.0-rc.2, and 0.2.1-rc.2.
- Track the `@deepseek-ai/dsh-*` development dependencies used by the native smoke at 0.2.1-rc.5, so `npm ci` exercises the newest supported kernel.
- No plugin runtime change. `engines.dsh` stays `*`. cordis 4.0.4/4.0.5 and schemastery 3.18.4/3.18.5 are unchanged.

## 0.1.4 — 2026-10-18

- Fix local pairing in Figma desktop: accept outer-window messages only from exact Figma origins while preserving the direct-parent route.
- Include the `localhost:3055` manifest/UI endpoint and exact loopback Host validation, avoiding Figma manifest rejection of the IP-literal endpoint.
- Add regression coverage for message sources, document metadata, operation results and local endpoint consistency.
- Verify real Figma companion import and pairing; add the maintainer's real screenshot-to-editable-UI example with bilingual explanations. Full readback/edit/export, FigJam/Slides and remote-account acceptance remain pending.
- Document DSH core compatibility in both READMEs without host-brand references.

## 0.1.3

- Publish the standalone **DSH to Figma** source repository with English and Chinese READMEs.
- Rename the native package to `dsh-to-figma` and the companion/plugin display name to DSH to Figma. Keep the `dsh-figma` CLI, entry ID and `figma-workbench` skill identifiers for continuity.
- Add pinned standalone development dependencies and CI for protocol and native DSH integration tests.
- Preserve the production-entry lifecycle fix and compatibility with DSH 0.2.0-rc.2 / 0.2.1-rc.2 from local development version 0.1.2.
- Real Figma canvas acceptance and remote OAuth/account access remain pending.
