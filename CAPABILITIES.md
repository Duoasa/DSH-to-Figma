# Capability coverage

Baseline: 48 Codex Figma connector tools exposed in this development session on 2026-10-18. The [per-tool inventory](codex-tool-baseline.json) records local counterparts and limitations for every observed name. Availability is not inferred from matching names. The local bundle registers 18 document/task tools plus five setup/guidance tools. Official backends expose their actual dynamic catalog, not hardcoded placeholders.

| Capability | Local implementation | Official MCP mode |
| --- | --- | --- |
| Inspect and mutate canvas (`use_figma`) | Public Plugin API executed in the paired Figma editor; native layers, styles, layout, components and variables | Pass through when advertised |
| Metadata, screenshot, variables, FigJam | Bounded native data and actual PNGs; durable DSH attachments | Original schemas/results |
| Design-to-code | Native structure, CSS, assets and focused implementation guide; host model writes project code | Official `get_design_context` |
| Design system search / libraries | Current-page components, local-file styles/variables, available variable libraries | Cloud search and library tools when offered |
| Code Connect | Explicit local component/code links in plugin data; **not** published Code Connect | Mapping, suggestions and context tools when offered |
| Editable Design / FigJam / Slides creation inside a file | `use_figma`, public constructors, plus scene import | `use_figma`, diagram/deck tools when offered |
| Create a new cloud file | Not supplied by public local Plugin API; open/create a file in Figma | `create_new_file` when offered |
| Asset upload/download | Workspace images, editable SVG, PNG/JPG/SVG/PDF export and original fill bytes | Original upload/download contracts |
| Webpage → canvas | Host can inspect DOM then import a scene; no automatic HTML/browser capture implementation | `generate_figma_design` / `html_to_figma` when offered |
| Figma Code / Make | Not emulated | Threads, code import, prompts and generation polling when offered |
| Prototype/motion | Public reactions and exposed Plugin API scripting; no cloud timeline/code conversion | `get_motion_context` and `export_video` when offered |
| Shaders and generative plugins | Public API can use capabilities actually exposed by the editor; no cloud source-library authoring service | List/read/create/update tools when offered |
| Image generation / Weave | Not emulated by the local bridge | Advertised generation, workflow, model, upload, status and cancel tools |
| Gallery/site publication | Not implemented locally | Only when offered and explicitly requested by user |
| Host embedded Figma panel | No Codex panel copied; use the actual Figma app | Host-specific panel is not an MCP capability guaranteed to DSH |
| Resources/prompts | Seven focused local guides | MCP resource list/templates/read and prompt list/get |
| OAuth | Local editor pairing requires no Figma OAuth | Independent Figma PKCE login, private storage, refresh, logout |

## Default local backend and optional desktop mode

Version 0.2.0 defaults to local canvas editing with a private, automatically paired companion. One connected document is selected on first use; multiple files and disconnected bindings require explicit selection. Official desktop MCP was the 0.1.5 default and remains an optional read/screenshot route. On 2026-10-18, DSH Desktop 0.2.1-rc.2 discovered 10 tools and successfully called `get_metadata` and `get_screenshot` against a real frame with no companion running. Canvas writing (`use_figma`), new-file creation and UI-to-canvas generation require another supported backend; the desktop mode does not provide them. Remote client registration returned 403 before user authorization, so remote canvas capabilities remain unverified. See [real evidence](docs/verification.md).

The “Official MCP mode” column above describes combined potential across desktop and remote catalogs, not a guarantee that every capability is available in desktop mode.

## Local behavior limits that affect equivalence

- Public Plugin API functionality and fonts depend on the actual Figma editor/version. The companion cannot unlock private APIs.
- Local `use_figma` accepts code, description, fileKey, sessionId and skillNames after explicit/automatic binding. create_session supplies a local Work task UUID. Legacy code-only calls remain accepted; see the [16.0.0 alignment contract](docs/figma-use-16-alignment.md).
- Helpers include selector queries/QueryResult, matches, layout-ordered setters, auto layout, inline screenshots, tree, placement and io.write. Placeholder progress is shown in the companion, not a canvas shimmer. Pages reset to the first page per call; local writes are serial and nontransactional.
- Public editor scripting is powerful and nontransactional. Unknown write outcomes require inspection. No process on the host evaluates Figma scripts.
- Server tools requiring MCP task-based execution are surfaced with the native DSH bridge's explicit unsupported-task behavior, not silently run through a different protocol. Sampling, host panels and interactive server elicitation are not advertised as supported capabilities.
- Remote screenshot base64 is requested if the advertised schema supports it. Ordinary resource URLs stay URLs; they are not fetched through an unrestricted network bridge.
- Automated fixtures prove implementation/protocol behavior. Real local create/read/update/screenshot/export and official desktop metadata/screenshot acceptance passed for one Design file; broader editor, font, layout and long-running acceptance remain pending.

Official sources: [Plugin API](https://developers.figma.com/docs/plugins/api/figma/), [manifest](https://developers.figma.com/docs/plugins/manifest/), [MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/), [remote installation and approved-client restriction](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/).
