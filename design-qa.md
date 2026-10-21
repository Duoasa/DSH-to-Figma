# Compact companion UI — design QA

- Source visual: /Users/sukduoasa/.codex/generated_images/01a156de-a767-7af0-b3c2-27d7372f1d5b/exec-a30d244e-efe3-407f-9763-f5cf6655e804.png
- Implementation screenshot: /tmp/dsh-compact-preview.png
- Preview: http://127.0.0.1:4186/
- State: connected, dark, Chinese; simulated transport, actual companion HTML.
- Source: 1577 × 997 presentation image; panel approximately 1056 × 622. Compare its panel hierarchy at the intended 300px width, excluding presentation margins/caption. Screenshot: 1168 × 1233 at native CSS scale; content 300 × 158 plus simulated 32px host titlebar. The Figma-owned titlebar is not implemented in the companion.

## Findings and comparison history

Initial browser inspection found a dark pause icon with poor contrast. Recolored the bundled Feather icon blue and recaptured. Final comparison opened the source and browser capture together: dark base, left status/document group, right connected brand illustration and separated footer retained. No remaining blocking layout or control-visibility defects in the browser preview.

- Typography: system Chinese fallback, prominent status, smaller document and helper; long document names truncate.
- Spacing: 16px content padding, compact 28px controls, 46px footer; no overflow in connected or expanded settings state.
- Color: graphite surfaces, green connected state, blue action icon; keyboard focus outline present.
- Assets: generated transparent brand illustration embedded in HTML; Feather icons with license. Illustration glow and logo contours differ slightly from concept (P3). No external asset requests.
- Copy: Chinese-first; full connection diagnostics retained outside the collapsed connected state. Operation failure notice can expand separately.
- Interaction: browser-clicked settings open/close and pause/resume; visible state and accessible button labels updated. Settings fields remained visible after expansion.

## Verification boundary

Six existing UI/packaging regression tests and generated-entry/syntax checks pass. Browser transport is simulated; no live Figma installation or native window resize acceptance is claimed. Browser console collection was not performed. Figma titlebar, desktop rendering, actual bridge connection and user visual acceptance remain to be checked in the editor.

final result: passed

## Pause-state correction

User screenshot exposed a P2 defect missed in the initial pass: paused status squeezed beneath the filename and estimated window height left empty space under the footer. Removed the shortened non-connected canvas height. Paused state now keeps the 112px canvas and 46px footer, with its instruction in the footer instead of a second paragraph. Replaced text-length height estimates with measured panel bounds and ResizeObserver updates, including advanced settings.

Browser verified paused, expanded settings, collapsed settings and resumed states. Final paused capture: /tmp/dsh-paused-fixed.png (same browser viewport as above). Connected and paused content both measure by the same 158px layout. Existing four companion UI regressions pass. Live Figma validation is still pending.

final result: passed

## Installed 0.2.2 smoke check

Installed dist/dsh-to-figma-0.2.2.tgz using the official DeepSeek Harness Desktop CLI into its desktop profile. Regenerated the existing private companion in ~/.dsh/figma/companion without changing pairing. Figma hot-reloaded the new UI; its settings visibly showed 0.2.2. Clicked settings open/close and pause/resume in the actual editor; final state is 已连接. The official DSH process owns the live 3055 listener. Screenshot: /tmp/dsh-figma-022-live.png. No canvas writes performed. All 33 unit/protocol tests and the native DSH integration smoke passed. User visual acceptance remains pending. No public release or Git push performed.

## User acceptance

2026-10-21: The user accepted the installed UI after trying it in Figma and requested committing and pushing this version to GitHub. The earlier pending visual-acceptance notes above are historical.
