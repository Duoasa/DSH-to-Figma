# Native motion through use_figma

Read plugin-api first. Refresh get_capabilities for the target node; stop if its required API is unavailable. Discovery is read-only and does not establish write access. Scripts use the actual editor API; cloud render/export tools are not emulated.

## Inspect and preserve

Use get_motion_context({nodeId}) for reactions, manualKeyframeTracks, animationStyles and timelines. Request `fields:['animations']` only for resolved manual tracks; style-generated tracks are not included there. Follow omittedFields/continuation rather than treating a partial return as complete. Custom style bindings may be omitted by Figma when that feature is disabled: an empty animationStyles array then does not prove no animation exists. Never add a fallback animation without resolving that limitation.

Animate a descendant of a top-level frame, not the top-level frame itself. Do not detach instances, split text, or rebuild geometry to evade an error. Preserve unrelated tracks, existing track/keyframe IDs, paints, effects and bindings. A change to resting x/y is not a reliable keyframe operation.

## Write one track

Replace NODE_ID with an inspected ID and switch to its known page once at the start of the script if needed.

```js
const node = await figma.getNodeByIdAsync('NODE_ID');
if (!node || node.parent?.type === 'PAGE') throw Error('Choose a descendant inside a frame');
node.applyManualKeyframeTrack({type:'PROPERTY', name:'TRANSLATION_X'}, {
  keyframes:[
    {timelinePosition:0, value:{type:'FLOAT', value:0}},
    {timelinePosition:0.6, value:{type:'FLOAT', value:120}, easing:{type:'EASE_OUT'}}
  ]
});
const timeline = node.timelines[0], mutatedNodeIds = [node.id];
if (timeline && timeline.duration < 0.6) {
  node.setTimelineDuration(timeline.id, 0.6);
  mutatedNodeIds.push(timeline.id);
}
return {mutatedNodeIds, track:node.manualKeyframeTracks.TRANSLATION_X, timelines:node.timelines};
```

Time is in seconds. Translation and rotation add to the resting transform; scale multiplies it (neutral 1). Opacity uses absolute 0–1 values. Rotation uses degrees; positive is counter-clockwise. Use public property names such as TRANSLATION_X/Y/XY, ROTATION, SCALE_X/Y/XY, OPACITY, WIDTH, HEIGHT, CORNER_RADIUS and layout spacing/padding fields. Check exact supported names in the editor/official API before unfamiliar fields; never invent MOTION_* fields.

To edit a track, read it, map its existing keyframes and preserve track id/baseValue and unchanged keyframe IDs, then call applyManualKeyframeTrack for that field. To remove one track, call removeManualKeyframeTrack with the same field descriptor. Unlike the cloud executor examples, the local editor exposes manualKeyframeTracks and animationStyles as read-only collections: never assign to them. Local preflight rejects known assignments before any script writes.

## Paints, effects and easing

Solid paint tracks live at manualKeyframeTracks.fills[index] or strokes[index]. Use `{type:'INDEXED_ITEM',collection:'fills',index:0}` for a solid fill color track. Confirm the index is a solid paint first. Color keyframe values are `{type:'COLOR',value:{r,g,b,a}}` with channels 0–1; static solid paint colors still use RGB only, with opacity on the paint.

Effect tracks use `{type:'INDEXED_ITEM',collection:'effects',index:0,field:'RADIUS'}` (or the actual public effect field), and live at effects[index][field]. Confirm the static effect exists. COLOR/SECONDARY_COLOR use COLOR values; radius, offsets, spread and other scalar fields use FLOAT. Do not invent internal effect fields.

Easing is `{type:'LINEAR'}`, EASE_IN, EASE_OUT, EASE_IN_AND_OUT, the corresponding BACK variants, GENTLE/QUICK/BOUNCY/SLOW, or HOLD. Custom cubic: `{type:'CUSTOM_CUBIC_BEZIER',easingFunctionCubicBezier:{x1,y1,x2,y2}}`; custom spring: `{type:'CUSTOM_SPRING',easingFunctionSpring:{bounce:0.3}}`. Easing belongs to the destination keyframe. Never use EASE_IN_OUT or internal OUT_CUBIC names. Extend timelines when needed; do not shorten existing timelines without request.

## Animation definitions and verification

Discover figma.motion.figmaAnimationStyles(); select an actual styleId and inspect its props descriptions. They are documentation, not literal setter values. applyAnimationStyle(styleId,{duration,timelineOffset,props}) returns the application ID; removeAnimationStyle takes that ID, not the definition ID. Update the final application with `dsh.updateAnimationStyle(node, appliedId, discoveredDefinitionId, configuration)`. It validates the target and definition, applies the replacement, then removes the old binding. It returns `{id,replacedId,nodeId}`; save the NEW application ID. Configuration contains the complete intended props/timing, so preserve values and bindings from the old application. Replacing a non-final application would reorder motion and is rejected; explicitly plan an ordered rebuild with known definitions if required. Never use a backing CodeComponentId as a discovered definition ID. The operation is nontransactional: inspect after any failure. For text use text-motion; for reusable file styles use custom-animation-styles.

Return affected node IDs, application/style IDs and focused readback. A PNG only shows the resting state. Verify meaningful motion in the Figma timeline/player or with an actually supported native export. Use an official export_video backend only when available; do not label a screenshot or a fixture test as playback acceptance. Report unavailable rendering separately from successful structural writes.
