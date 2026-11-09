# Changelog

Versions 0.1.5 through 0.3.0 are not recorded in this file. Published versions in that span are listed in [GitHub Releases](https://github.com/Duoasa/DSH-to-Figma/releases) as v0.2.1, v0.2.2, v0.2.3, and v0.3.0. This file continues from 0.3.1.

## 0.4.1 (unreleased) — comprehensive upgrade of 0.3.5

- Adapt proven Figma `getNodeById` calls in await-capable script scopes to `await getNodeByIdAsync` during the existing local parse. No additional canvas reads, prompt text, retries or parsing pass; synchronous callbacks and unproven receivers are left unchanged.

- Add a collapsed Design Reference section to the existing companion UI: file-owned frame/name references, on-demand thumbnail, manual unbind, and shared DSH get/set/clear tools. No canvas scans or automatic spec injection.
- Synchronize reference changes in both directions and provide a compact, deduplicated reference notice before the next model request. Keep full UI/spec content on demand; use outline icons with a right-aligned disclosure chevron.

- Address #19: full/default metadata use the same uncertainty recovery rules; inspect actual returned subtree completeness, report recovery only while protected, and include actionable errors without additional native reads. Summary/paged/truncated responses never unlock blindly.
- Address #13: document local Code Layer boundaries, label CODE_INSTANCE reads/tree as opaque, and reject known unsupported constructor calls during existing preflight. No cloud dependency or routine extra tool calls.

- Upgrade 0.3.5 to the unreleased 0.4.1 development version. Keep the local companion as the default route and retain official desktop/remote MCP discovery, schemas and pass-through. This section does not announce publication of a release.
- Add opt-in semantic Design/component/FigJam context, target variable usage and alias resolution, explicit cross-page search and coverage/section plans. Shared styles and optional component deduplication reduce repeated data without disguising omitted fields as complete reads.
- Add persistent `design_diff` baselines with file/node provenance, collection-policy checks, explicit create/update and optimistic revisions. Add a bounded workspace component/token/SVG index, evidence-based matching, explicit local mappings and an inert script recipe library.
- Extend image replacement, export-settings handling, subtree SVG extraction and screenshot sizing. Add native MP4/GIF/WebM export with bounded chunked transfer, workspace output and container checks; actual encoder availability remains editor-dependent.
- Add recursive motion context and limited CSS conversion with unsupported cases reported. Add editable FigJam graph/limited Mermaid generation, basic Slides layouts, existing native shader discovery/application, and installed-browser DOM capture/import with explicit fidelity limits.
- Add controlled batch edits with preflight and verified best-effort field recovery, plus Work/document-scoped operation status. Arbitrary scripts remain nontransactional; uncertain writes are never automatically replayed.
- Verify native Design/FigJam/Slides authoring and MP4 encoding in isolated draft files; fix native paint-default/float normalization and text auto-height reset discovered during these checks. See the [upgrade and acceptance record](docs/0.4.1-upgrade.md) for unverified cases.
- Keep DSH package, generic/paired companion, Figma window title and runtime status on the same 0.4.1 version source.
- Preserve the user's current page, selection and viewport for local scripts unless the script explicitly changes them. Clarify current-file variable-mode limits and the inspection required before retrying an uncertain write.
- Require companion featureVersion 5 for the new canvas workflows while retaining legacy routes. Add regression fixtures and bundled [local workflow guidance](skills/figma-workbench/references/local-workflows.md); fixture success does not claim real-editor visual, shader or video acceptance.

## 0.3.5 — 2026-11-06

- Enable Figma's documented private-plugin API flag for the local development companion, exposing native file keys for reliable reconnect identity. Native keys take precedence over manual file links; preserve explicit target selection and operation non-replay.

- Make the bundled macOS Desktop CLI requirement prominent, including the managed-profile error and recovery instructions. Add Work-scoped reconnect hints to figma_status: last selected document, same-file-key matches and explicitly unverified name matches, without automatic rebinding or replay.

- Upgrade the plugin-owned MCP client to 2.4.0 and pin Zod 4.6.7 as a runtime dependency so fresh installs resolve the patched validator independently of older host dependencies. DSH compatibility ranges remain broad.

- Bundle a Chinese user manual and four task-focused help chapters, with DSH skill/prompt routing and offline figma_read_guide access for setup, design, motion and troubleshooting.

- Use the selected light-background blue whale/edit-frame icon for the DSH plugin; retain the original connection illustration inside the companion window. Figma native development-plugin list and titlebar icons remain host-managed.

- Align local workflow guidance with installed Codex Figma 17.0.0 while preserving 0.3.2 hotfix.1 compatibility ranges and the existing bridge.
- Add read-only capability discovery with explicit available/unavailable/unknown states; bounded motion reads expose manual tracks, applied styles and timelines.
- Add native Motion/TextStagger/custom-style guides and targeted replacement helpers. Native collection properties are read-only; detect unsupported assignments before execution. Replacement returns new application/entry IDs and rejects changes that would reorder other applications.
- Fix animation binding objects being mistaken for scene nodes, which previously lost enumerable fields when copied.
- Document native Specs gating. No claim of unavailable native local API support.
- Keep legacy featureVersion 3 scripts usable; companion featureVersion 4 is needed for new capability/motion read APIs. Upgrade the companion for the new helpers.
- Verify DSH Desktop 0.2.2-rc.1 in the real Figma editor; admit its Cordis 4.1.x and Schemastery 3.19.x peers while retaining the previous ranges.
- Distribute the DSH installer, credential-free Figma companion and SHA-256 checksums through the v0.3.5 GitHub Release.

## 0.3.2 hotfix.1 — 2026-11-04

- Broaden cordis peers to `4.0.x` and schemastery peers to `3.18.x`.
- Replace exact DSH RC lists with `^0.2.0-0 || ^0.2.1-0 || ^0.2.2-0` for `dsh-home-paths`, `dsh-mcp-client`, and `dsh-skill`. This accepts all stable 0.2.x versions and all prereleases (including alpha, beta, and RC) of 0.2.0, 0.2.1, and 0.2.2. It rejects 0.3.0 and its prereleases. Under npm's default semver rules, prereleases of other patch versions, such as 0.2.3-rc.1, still require an explicit range entry.
- Keep the package version at 0.3.2, development dependencies pinned, and `engines.dsh` at `*`. The pinned development runtime remains 0.2.1-rc.5; broader peer admission is not a claim that every admitted runtime has been tested.
- Distribute as `dsh-to-figma-0.3.2-hotfix.1.tgz` on the existing v0.3.2 Release, with an updated `SHA256SUMS`. Keep the original archive, tag, and Figma companion unchanged. Existing users must reinstall the hotfix archive in their current host/profile; the package version does not trigger an update by itself.

## 0.3.2 — 2026-11-02

### 中文

- 新增脚本执行前检查，提前发现语法错误和常见的不兼容调用，并提供错误位置与修正提示。
- 改善组件读取失败时的恢复提示，帮助模型核对已有修改，减少重复创建。
- 补充组件变体排列与异步读取示例，减少重叠和调用错误。

### English

- Add script preflight checks for syntax errors and common unsupported calls, with error locations and repair hints.
- Improve recovery guidance for component read failures, helping models inspect existing changes and avoid duplicate creation.
- Add examples for variant layout and asynchronous component reads to reduce overlaps and API errors.

### 日本語

- スクリプト実行前のチェックを追加。構文エラーやよくある非対応の呼び出しを検出し、エラー位置と修正方法を提示します。
- コンポーネントの読み取りに失敗した際の復旧案内を改善。既存の変更を確認し、重複作成を減らします。
- バリアントの配置と非同期読み取りの例を追加し、重なりや API の呼び出しミスを減らします。

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

### Recovery and continuous authoring follow-up

0.4.1 adds automatic local task sessions, structured error actions and document candidates, retained-result reconciliation, opt-in persistent idempotency, bounded write journals, observed variable quota diagnostics, explicit token aliases and checkpointed explicit step tasks. Normal calls do not gain mandatory recovery queries. Local is primary; official desktop/remote catalogs remain unchanged. See local-workflows for limits and recovery semantics.
