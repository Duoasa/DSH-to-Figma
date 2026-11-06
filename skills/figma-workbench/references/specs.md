# Native Figma Specs

Check get_capabilities: the local editor must expose figma.spec. If unavailable, stop the native workflow and explain that the API is unavailable; do not create ordinary text frames as a native Spec substitute. The current companion manifest supports Design/FigJam/Slides, not standalone figspec files. Independent file creation and plan discovery require an eligible official backend; do not claim local support for them.

Use an explicit node ID when given. Resolve it and require type SPEC_BLOCK and specBlockType DOCUMENT. Otherwise search the intended loaded page with findAllWithCriteria({types:['SPEC_BLOCK']}) and filter document roots. Inspect selected candidates before choosing; pass specNodeId to every content call. Keep cross-page discovery sequential and load only relevant pages. Do not traverse the Markdown body as ordinary scene nodes.

Create a canvas document, when createOnCanvasAsync is available, with `{title:'Feature spec',content:'# Feature spec\n\nRequirements…'}`. Use a nonempty title, retain specNodeId and read it back with getContent. getContent returns `markdown`; write calls accept `content`. For large reads use offset/maxLines and follow the actual response's paging information.

```js
const specNodeId = 'SPEC_ID';
const before = await figma.spec.getContent({specNodeId});
const oldText = 'The save action is disabled.', newText = 'The save action is enabled.';
// Resolve one intended span; ambiguous edits must fail without changes.
if (before.markdown.split(oldText).length !== 2) throw Error('Expected one unique target span');
await figma.spec.editContent({specNodeId, edits:[{oldText,newText}]});
const after = await figma.spec.getContent({specNodeId});
if (!after.markdown.includes(newText)) throw Error('Spec edit was not verified');
return {mutatedNodeIds:[specNodeId], verified:true};
```

Prefer editContent; each oldText must match exactly once. setContent clears/rebuilds a document: use only for an empty draft or an explicit whole-document replacement. Preserve the first H1/title block and overlapping `[comment:<uuid>]…[/comment:<uuid>]` markers around the same text. Keep unrelated content untouched. Verification reads content, not a screenshot. Do not silently retry failed mutations.

Content is a plain GFM string, never base64-encoded as a whole. Images use ordinary Markdown URLs or supported image data URLs. Shared links must be portable (e.g. repository permalinks), not local file paths or localhost. Use `<ins>` for underline.

When the user requests comments and the API is exposed, figma.spec.comments.create accepts `{specNodeId,anchorText,contextText?,message}`; the rendered anchor must match once. Read/reply with getThread({uuid}) and reply({uuid,message}) using the root UUID, not a reply UUID. Preserve anchor markers during text changes. Comment APIs are not exercised by capability probes and posting is never an automatic substitute for editing.
