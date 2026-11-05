# Editable text animation

Load plugin-api and motion. Discover `TextStagger` through figma.motion.figmaAnimationStyles(); its absence is a capability boundary. Do not substitute a different preset, split letters into nodes, rewrite characters on a timer or detach instances.

Inspect the existing TEXT node, its applied animation IDs, fonts and containing timeline. Load its current fonts with getStyledTextSegments(['fontName']) before writing. Preserve characters, font ranges, wrapping, component membership and unrelated animation.

```js
const node = await figma.getNodeByIdAsync('TEXT_ID');
if (!node || node.type !== 'TEXT') throw Error('Expected the inspected text node');
const definition = figma.motion.figmaAnimationStyles().find(s => s.styleId === 'TextStagger');
if (!definition) throw Error('TextStagger is unavailable');
for (const segment of node.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(segment.fontName);
const timeline = node.timelines[0];
if (!timeline) throw Error('Text needs a containing animation timeline');
const appliedId = node.applyAnimationStyle(definition.styleId, {
  duration:1.2, timelineOffset:0,
  props:{animationDirection:'in', textDelayGrouping:'CHARACTER', textDelayOrder:'LEFT_RIGHT',
    presetStaggerOverlap:0, delay:0, easing:{type:'LINEAR'},
    opacityEnabled:true, opacityVisible:true, opacityAmount:0,
    positionEnabled:false, rotationEnabled:false, scaleEnabled:false, blurEnabled:false}
});
const mutatedNodeIds = [node.id];
if (timeline.duration < 1.2) { node.setTimelineDuration(timeline.id,1.2); mutatedNodeIds.push(timeline.id); }
return {mutatedNodeIds, appliedId, applied:node.animationStyles.find(s => s.id === appliedId), characters:node.characters};
```

This is a typewriter reveal, not reflowing typed text or a blinking cursor. Other groupings: CHARACTER_NO_WHITESPACE, WORD, LINE, PARAGRAPH. LEFT_RIGHT, RIGHT_LEFT and CENTER_OUT control order. Duration is the whole stagger span, not per-letter duration. Layout determines visual lines.

One TextStagger application combines position, rotation, scale, opacity and blur via a flat props object, with shared timing/easing. For rising words use WORD, positionEnabled/positionVisible, direction:'bottom', distance:24, opacityAmount:0 and optionally blurEnabled/blurVisible with blurAmount:12. For line fading use LINE and opacity only. Discover the advertised controls before using unfamiliar properties. Do not invent nested styles or per-effect durations.

Store appliedId outside the file. For revisions, find the exact existing application and use `dsh.updateAnimationStyle(node, appliedId, definition.styleId, configuration)` with preserved timing/props. Keep its returned new ID. The helper replaces only the final application to retain ordering. Do not assign animationStyles (native read-only), and do not add another application without removing the old one. Read-back styleId may refer to a backing component, so do not identify existing applications solely by literal 'TextStagger'. Remove by appliedId. Verify text and styling before/after plus actual playback when available.
