# Official Figma services

`backend: desktop` connects to the configured literal loopback HTTP `/mcp` endpoint (default 127.0.0.1:3845/mcp). Enable MCP in Figma desktop first. `backend: remote` connects to https://mcp.figma.com/mcp using independently authorized OAuth credentials; it does not borrow Codex credentials or pretend to be Codex.

Run `dsh-figma login` in the same DSH home. The CLI prints the authorization URL and validates a loopback callback with state and PKCE. If Figma requires approved client registration, use an approved DSH client ID or request approval. A saved token does not prove tool access. After login use `figma_reconnect`, then inspect `figma_status` for the actual tool list.

All discovered official tool schemas and names are retained under `mcp__figma__…`. Tool-list refresh uses discovery only; it never creates a file or edits a canvas. Errors, cancellations and lost responses are never blindly replayed. MCP resources and prompts are exposed by `figma_resources` and `figma_prompts`.

For file creation, inspect available plans and choose the user-requested destination. For Code import, distinguish native editable layers from code-backed applications. Inspect the returned destination and run identifiers. Poll existing runs rather than launching duplicates. For shaders/generative plugins, read the existing source/manifest first, make coherent changes, retain references, and verify the result in the destination. For Weave, discover the actual tool/model and its input contract, upload permitted assets, start one run, poll it, and deliver the returned output.

Publishing to Gallery or a public site is a separate action requiring the user's publication request. Server tools can consume credits or require particular seats; report server-provided limitations rather than promising universal access. Embedded host panels, Codex browser/terminal tools and proprietary backend implementations are not provided by this plugin.
