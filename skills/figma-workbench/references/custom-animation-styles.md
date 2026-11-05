# Reusable file animation styles

Load motion first. Custom styles have their own gate: test getLocalCustomAnimationStylesAsync even when manual tracks work. Stop on unavailable API; Figma can hide custom applications from animationStyles while gated. Adding a replacement could stack another animation on an unseen one.

Discover styles by id/name/type/count, then inspect entries for selected IDs. Reuse stable IDs; names are not unique. First-party definitions from figma.motion.figmaAnimationStyles are not authored here. A local CUSTOM_ANIMATION style contains an ordered list of those definitions; custom styles cannot nest or introduce new motion primitives.

Create with figma.createCustomAnimationStyle(), set a meaningful name, then await style.addAnimationEntryAsync(definition.styleId, props). Entry duration/easing belong inside props. Preserve the style ID and entry IDs in the task ledger. A newly created empty style may be removed after its initialization fails, but do not remove an existing shared style as recovery.

```js
const definition = figma.motion.figmaAnimationStyles().find(s => s.styleId === 'Opacity');
if (!definition) throw Error('Opacity definition unavailable');
const style = figma.createCustomAnimationStyle();
try {
  style.name = 'Motion/Gentle entrance';
  await style.addAnimationEntryAsync(definition.styleId, {duration:0.4, easing:{type:'EASE_OUT'}});
} catch (error) { style.remove(); throw error; }
return {createdStyleIds:[style.id], entries:style.animationEntries};
```

Apply with node.applyAnimationStyle(style.id,{type:'CUSTOM',timelineOffset:0.25}). Do not pass duration/props in a CUSTOM application: timing belongs to its entries. Return both style.id and the returned application ID. Read back the style entries and the target binding. First-party applications have type FIGMA; narrow before reading duration/props, which CUSTOM applications do not expose.

Entries append through addAnimationEntryAsync and are removed by removeAnimationEntry(entryId). For the final entry, use `await dsh.updateAnimationEntry(style, entryId, discoveredDefinitionId, props)`; it adds the replacement and removes the old entry, returning `{id,replacedId,styleId}`. Keep the new ID. Non-final replacements are rejected to preserve ordering; a full ordered rebuild needs explicitly known source definitions. Arrays/entries are read-only. Inspect after failures because replacement is not transactional. Returned entry.styleId is not the original definition ID; rediscover the source definition when rebuilding entries. Preserve unrelated entries/applications and all consumers of a shared style. Use getStyleConsumersAsync when a shared edit affects other nodes.

moveLocalCustomAnimationStyleAfter(target,reference) and moveLocalCustomAnimationFolderAfter(targetPath,referencePath) handle ordering where exposed. Remove an application using node.removeAnimationStyle(applicationId); remove an entire style with style.remove only when requested. Return affected IDs and verify ordering, bindings and playback independently.
