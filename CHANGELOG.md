# Changelog

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
