# Changelog

Versions 0.1.5 through 0.3.0 are not recorded in this file. Published versions in that span are listed in [GitHub Releases](https://github.com/Duoasa/DSH-to-Figma/releases) as v0.2.1, v0.2.2, v0.2.3, and v0.3.0. This file continues from 0.3.1.

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
