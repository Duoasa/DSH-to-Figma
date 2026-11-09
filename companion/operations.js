/* MIT — Copyright (c) 2026 Duoasa. Bounded motion reads and controlled, recoverable edits. */
;(function (scope) {
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const bytes = value => unescape(encodeURIComponent(JSON.stringify(value))).length
  const message = error => String(error?.message || error).slice(0, 300)
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const integer = (value, fallback, min, max, key) => { const n = value ?? fallback; if (!Number.isInteger(n) || n < min || n > max) throw Error(key + ' must be an integer from ' + min + ' to ' + max); return n }
  const same = (a, b) => JSON.stringify(a, sortKeys) === JSON.stringify(b, sortKeys)
  function sortKeys(_key, value) { return object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value }
  const finite = value => typeof value === 'number' && Number.isFinite(value)
  // Native SOLID reads add defaults and store channels as float32. Keep this
  // equivalence narrow: bindings, unknown fields, paint ordering and all other
  // node properties must still match exactly.
  function samePaints(actual, expected) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return same(actual, expected)
    const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-6
    const normalize = paint => ({...paint,
      visible:paint.visible === undefined ? true : paint.visible,
      opacity:paint.opacity === undefined ? 1 : paint.opacity,
      blendMode:paint.blendMode === undefined ? 'NORMAL' : paint.blendMode,
      boundVariables:paint.boundVariables === undefined ? {} : paint.boundVariables})
    return actual.every((paint, index) => {
      const wanted = expected[index]
      if (!object(paint) || !object(wanted) || paint.type !== 'SOLID' || wanted.type !== 'SOLID') return same(paint, wanted)
      const {color:a, opacity:ao, ...restA} = normalize(paint), {color:b, opacity:bo, ...restB} = normalize(wanted)
      if (!object(a) || !object(b) || !same(Object.keys(a).sort(),['b','g','r']) || !same(Object.keys(b).sort(),['b','g','r'])) return false
      return same(restA,restB) && close(ao,bo) && ['r','g','b'].every(key => close(a[key],b[key]))
    })
  }
  const sameEditValue = (key, actual, expected) => key === 'fills' ? samePaints(actual, expected) : same(actual, expected)

  function easing(value) {
    if (!object(value)) throw Error('Missing native destination easing')
    const named = {LINEAR:'linear', EASE_IN:'ease-in', EASE_OUT:'ease-out', EASE_IN_AND_OUT:'ease-in-out', HOLD:'steps(1, end)'}
    if (named[value.type]) return named[value.type]
    if (value.type === 'CUSTOM_CUBIC_BEZIER') {
      const b = value.easingFunctionCubicBezier
      if (b && ['x1','y1','x2','y2'].every(k => finite(b[k])) && b.x1 >= 0 && b.x1 <= 1 && b.x2 >= 0 && b.x2 <= 1) return 'cubic-bezier(' + [b.x1,b.y1,b.x2,b.y2].join(', ') + ')'
    }
    throw Error('Unsupported easing: ' + String(value.type))
  }
  const channels = {
    TRANSLATION_X:[['tx','x','px']], TRANSLATION_Y:[['ty','y','px']], TRANSLATION_XY:[['tx','x','px'],['ty','y','px']],
    SCALE_X:[['sx','x','']], SCALE_Y:[['sy','y','']], SCALE_XY:[['sx','x',''],['sy','y','']],
    ROTATION:[['rot',null,'deg']], OPACITY:[['opacity',null,'']]
  }
  function cssFor(item) {
    const unsupported = [], tracks = [], occupied = new Set(), raw = item.manualKeyframeTracks
    const fail = (field, reason) => unsupported.push({field, reason})
    if (!object(raw)) fail('manualKeyframeTracks', 'Native manual tracks were not returned; absence does not prove no animation')
    for (const [field, binding] of Object.entries(raw || {})) {
      try {
        const target = channels[field]
        if (!target) throw Error('Property has no supported CSS conversion')
        if (!binding || !Array.isArray(binding.keyframes) || binding.keyframes.length < 2 || binding.keyframes.length > 500) throw Error('Requires 2–500 native keyframes')
        if (target.some(([name]) => occupied.has(name))) throw Error('Overlapping scalar and vector channels are ambiguous')
        let prior = -1
        const frames = binding.keyframes.map((frame, index) => {
          if (!finite(frame.timelinePosition) || frame.timelinePosition < 0 || frame.timelinePosition <= prior) throw Error('Keyframe times must be finite, nonnegative and strictly increasing')
          prior = frame.timelinePosition
          if (index === 0 && prior !== 0) throw Error('A zero-time keyframe is required; the starting state will not be inferred')
          const vector = field.endsWith('_XY'), native = frame.value
          if (!native || native.type !== (vector ? 'VECTOR' : 'FLOAT')) throw Error('Expected native ' + (vector ? 'VECTOR' : 'FLOAT') + ' value')
          const values = target.map(([name, axis, unit]) => {
            let v = vector ? native.value?.[axis] : native.value
            if (!finite(v)) throw Error('Keyframe values must be finite')
            if (field === 'OPACITY' && (v < 0 || v > 1)) throw Error('Opacity outside 0–1')
            if (field === 'ROTATION') v = -v // Figma is counterclockwise; CSS is clockwise.
            return [name, String(v) + unit]
          })
          return {time:prior, values, easing:index ? easing(frame.easing) : null}
        })
        target.forEach(([name]) => occupied.add(name)); tracks.push({field, target, frames})
      } catch (error) { fail(field, message(error)) }
    }
    if (Array.isArray(item.animationStyles) && item.animationStyles.length) fail('animationStyles', 'Style bindings are retained as raw data; style-generated motion is not converted')
    else if (item.fieldStatus?.animationStyles?.state !== 'available') fail('animationStyles', 'Style bindings were not readable; conversion coverage is unknown')
    if (Array.isArray(item.reactions) && item.reactions.length) fail('reactions', 'Prototype triggers and transitions are not converted')
    if (item.motion != null && (!object(item.motion) || Object.keys(item.motion).length)) fail('motion', 'Additional motion metadata is not converted')
    let duration = Math.max(0, ...tracks.map(t => t.frames[t.frames.length - 1].time)), durationSource = 'last manual keyframe'
    if (Array.isArray(item.timelines) && item.timelines.length === 1 && finite(item.timelines[0].duration) && item.timelines[0].duration > 0) {
      if (item.timelines[0].duration < duration) fail('timelines', 'Timeline is shorter than the manual tracks; playback timing requires inspection')
      else { duration = item.timelines[0].duration; durationSource = 'native timeline' }
    } else if (Array.isArray(item.timelines) && item.timelines.length > 1) fail('timelines', 'Multiple timelines require explicit playback selection')
    const suffix = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_'), rules = [], animations = [], initial = []
    for (const track of tracks) {
      const animation = 'dsh_' + suffix + '_' + track.field.toLowerCase()
      for (const [name,, unit] of track.target) if (name !== 'opacity') {
        const variable = '--dsh_' + suffix + '_' + name, base = name === 'sx' || name === 'sy' ? '1' : '0' + unit
        rules.push('@property ' + variable + ' { syntax: "' + (unit === 'px' ? '<length>' : unit === 'deg' ? '<angle>' : '<number>') + '"; inherits: false; initial-value: ' + base + '; }')
        initial.push(variable + ': ' + base + ';')
      }
      const frames = track.frames.map((frame, index) => {
        const declarations = frame.values.map(([name, value]) => (name === 'opacity' ? 'opacity' : '--dsh_' + suffix + '_' + name) + ': ' + value + ';')
        // CSS associates easing with the outgoing interval; native Figma stores it on the destination.
        if (track.frames[index + 1]) declarations.push('animation-timing-function: ' + track.frames[index + 1].easing + ';')
        return (frame.time / duration * 100).toFixed(5).replace(/\.?0+$/, '') + '% { ' + declarations.join(' ') + ' }'
      })
      const last = track.frames[track.frames.length - 1]
      if (last.time < duration) frames.push('100% { ' + last.values.map(([name, value]) => (name === 'opacity' ? 'opacity' : '--dsh_' + suffix + '_' + name) + ': ' + value + ';').join(' ') + ' }')
      rules.push('@keyframes ' + animation + ' {\n  ' + frames.join('\n  ') + '\n}')
      animations.push(animation + ' ' + duration + 's linear 1 both')
    }
    if (animations.length) {
      if ([...occupied].some(v => v !== 'opacity')) {
        const v = (name, fallback) => occupied.has(name) ? 'var(--dsh_' + suffix + '_' + name + ')' : fallback
        initial.push('transform: translate(' + v('tx','0px') + ', ' + v('ty','0px') + ') rotate(' + v('rot','0deg') + ') scale(' + v('sx','1') + ', ' + v('sy','1') + ');')
      }
      initial.push('animation: ' + animations.join(', ') + ';')
      rules.push('.dsh-motion-' + suffix + ' {\n  ' + initial.join('\n  ') + '\n}')
    }
    return {nodeId:item.id, format:'css', status:unsupported.length ? 'partial' : 'candidate', complete:unsupported.length === 0,
      convertedFields:tracks.map(t => t.field), unsupported, duration, durationSource,
      application:'Apply to a dedicated motion wrapper preserving the resting layout/transform. With OPACITY, set inner content opacity to 1 because native tracks are absolute. Requires CSS @property support. Verify transform origin, named easing presets, trigger timing and visual playback; no screenshot verifies animation.', code:rules.join('\n\n')}
  }

  async function motion(runtime, args) {
    if (args.recursive !== undefined && typeof args.recursive !== 'boolean') throw Error('recursive must be boolean')
    if (args.codeFormat !== undefined && args.codeFormat !== 'css') throw Error('codeFormat must be css')
    const maxNodes = integer(args.maxNodes, 500, 1, 1500, 'maxNodes'), maxDepth = integer(args.maxDepth, 10, 0, 30, 'maxDepth'), maxBytes = integer(args.maxBytes, 65536, 4096, 2097152, 'maxBytes')
    const root = await runtime.node(args.nodeId), nodes = [], codes = [], limits = new Set()
    const coverage = {visitedNodes:0, returnedNodes:0, traversalComplete:true, dataComplete:true, unavailableFields:0, truncatedFields:0}
    const result = {rootId:root.id, recursive:args.recursive === true, nodes, coverage,
      scope:'Read-only native motion inventory. Unavailable fields are unknown, not empty animation. Screenshots show resting state.'}
    if (args.codeFormat) result.conversion = {format:'css', nodes:codes, complete:true}
    async function visit(node, depth) {
      if (coverage.visitedNodes >= maxNodes) { limits.add('maxNodes'); coverage.traversalComplete = false; return false }
      coverage.visitedNodes++
      const fields = args.codeFormat ? [...new Set([...(args.fields || []),'manualKeyframeTracks','animationStyles','timelines','reactions','motion'])] : args.fields
      const item = scope.DshFigmaCapabilities.motionContext(node, {...args, fields, maxBytes})
      // Reserve room for final coverage/continuation so the whole response respects its budget.
      if (bytes(result) + bytes(item) + 700 > maxBytes) { limits.add('maxBytes'); coverage.traversalComplete = false; return false }
      nodes.push(item); coverage.returnedNodes++
      const missing = Object.values(item.fieldStatus).filter(s => s.state !== 'available').length
      coverage.unavailableFields += missing; coverage.truncatedFields += item.omittedFields.length
      if (missing || item.truncated) coverage.dataComplete = false
      if (args.codeFormat) {
        const code = cssFor(item)
        if (bytes(result) + bytes(code) + 700 <= maxBytes) { codes.push(code); if (!code.complete) result.conversion.complete = false }
        else { limits.add('codeMaxBytes'); result.conversion.complete = false }
      }
      if (runtime.metrics) runtime.metrics.nodeCount++
      if (coverage.visitedNodes % 30 === 0 && typeof runtime.yieldRead === 'function') await runtime.yieldRead()
      if (args.recursive && node.children?.length) {
        if (depth >= maxDepth) { limits.add('maxDepth'); coverage.traversalComplete = false }
        else for (let i = 0; i < node.children.length; i++) if (!await visit(node.children[i], depth + 1)) return false
      }
      return true
    }
    await visit(root, 0)
    coverage.complete = coverage.traversalComplete && coverage.dataComplete
    coverage.limits = [...limits]
    if (result.conversion && !coverage.complete) result.conversion.complete = false
    if (!coverage.traversalComplete || coverage.truncatedFields || limits.size) result.continuation = {nodeId:root.id, hint:'Read smaller subtrees or individual omitted fields; increase maxNodes, maxDepth or maxBytes within the documented limits. This result is not a complete inventory.'}
    return {value:result, images:[]}
  }

  const nonnegative = v => finite(v) && v >= 0 && v <= 10000
  const coordinate = v => finite(v) && Math.abs(v) <= 1000000
  const propertyRules = {name:v => typeof v === 'string' && v.length <= 1000, visible:v => typeof v === 'boolean', locked:v => typeof v === 'boolean', opacity:v => finite(v) && v >= 0 && v <= 1,
    x:coordinate,y:coordinate,width:v => finite(v) && v > 0 && v <= 100000,height:v => finite(v) && v > 0 && v <= 100000,
    itemSpacing:v => finite(v) && Math.abs(v) <= 10000,paddingTop:nonnegative,paddingRight:nonnegative,paddingBottom:nonnegative,paddingLeft:nonnegative,cornerRadius:nonnegative}
  const contextFields = ['boundVariables','fillStyleId','strokeStyleId','textStyleId','effectStyleId','explicitVariableModes','componentPropertyReferences']
  const textFields = ['fontName','fontSize','fontWeight','fills','textAlignHorizontal','textAlignVertical','textAutoResize','lineHeight','letterSpacing','textDecoration','textCase','paragraphSpacing','paragraphIndent','hyperlink','width','height']
  function hasBindings(value) {
    if (!value || typeof value !== 'object') return false
    if (value.type === 'VARIABLE_ALIAS') return true
    return Object.entries(value).some(([key, item]) => key === 'boundVariables' && item && Object.keys(item).length > 0 || hasBindings(item))
  }
  function snapshot(node, keys) {
    const result = {}
    for (const key of keys) if (node[key] !== undefined) {
      if (typeof node[key] === 'symbol') throw Error('Mixed field cannot be restored safely: ' + key)
      result[key] = clone(node[key])
    }
    return result
  }
  function safetyState(node) {
    const ancestry = []
    for (let p = node; p; p = p.parent) ancestry.push({id:p.id,type:p.type,layoutMode:p.layoutMode})
    return {ancestry, childCount:node.children?.length ?? 0, ...snapshot(node,['layoutMode','primaryAxisSizingMode','counterAxisSizingMode','layoutSizingHorizontal','layoutSizingVertical','minWidth','minHeight','maxWidth','maxHeight'])}
  }
  function paints(value) {
    if (!Array.isArray(value) || value.length > 16) throw Error('fills must be an array of at most 16 solid paints')
    for (const paint of value) {
      if (!object(paint) || paint.type !== 'SOLID' || Object.keys(paint).some(k => !['type','color','opacity','visible','blendMode'].includes(k))) throw Error('set_fills supports unbound SOLID paints only')
      if (!object(paint.color) || Object.keys(paint.color).some(k => !['r','g','b'].includes(k)) || !['r','g','b'].every(k => finite(paint.color[k]) && paint.color[k] >= 0 && paint.color[k] <= 1)) throw Error('Solid color channels must be numbers from 0 to 1')
      if (paint.opacity !== undefined && !propertyRules.opacity(paint.opacity)) throw Error('Paint opacity must be from 0 to 1')
      if (paint.visible !== undefined && typeof paint.visible !== 'boolean') throw Error('Paint visible must be boolean')
      if (paint.blendMode !== undefined && paint.blendMode !== 'NORMAL') throw Error('Only NORMAL blend mode is supported by controlled fills')
    }
  }
  async function prepare(runtime, op, index) {
    if (!object(op) || !['set_properties','set_text','set_fills'].includes(op.type) || typeof op.nodeId !== 'string' || !op.nodeId) throw Error('Invalid batch operation at index ' + index)
    if (Object.keys(op).some(k => !['type','nodeId','properties','text','fills','expected'].includes(k))) throw Error('Unknown batch operation field at index ' + index)
    const node = await runtime.node(op.nodeId)
    for (let p = node; p; p = p.parent) if (p.type === 'INSTANCE') throw Error('Batch edits inside instances are unsupported: ' + node.id)
    if (['DOCUMENT','PAGE'].includes(node.type)) throw Error('Batch targets must be scene nodes')
    let next, font
    if (op.type === 'set_properties') {
      if (op.text !== undefined || op.fills !== undefined) throw Error('set_properties accepts properties only')
      if (!object(op.properties) || !Object.keys(op.properties).length) throw Error('properties must be a nonempty object')
      for (const [key, value] of Object.entries(op.properties)) if (!propertyRules[key] || !propertyRules[key](value)) throw Error('Unsupported property or value: ' + key)
      next = clone(op.properties)
      const fixed = () => !['AUTO'].includes(node.primaryAxisSizingMode) && !['AUTO'].includes(node.counterAxisSizingMode) && !['HUG','FILL'].includes(node.layoutSizingHorizontal) && !['HUG','FILL'].includes(node.layoutSizingVertical)
      if (['x','y','width','height'].some(k => k in next) && node.parent?.layoutMode && node.parent.layoutMode !== 'NONE') throw Error('Geometry edits inside auto layout are unsupported')
      if (['width','height'].some(k => k in next)) {
        if (!['RECTANGLE','ELLIPSE','FRAME'].includes(node.type) || node.children?.length || !fixed() || typeof node.resize !== 'function') throw Error('Dimensions require a fixed, childless rectangle, ellipse or frame')
        if ([node.minWidth,node.minHeight,node.maxWidth,node.maxHeight].some(v => v != null)) throw Error('Dimension constraints are unsupported by controlled resize')
      }
      if (Object.keys(next).some(k => ['itemSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft'].includes(k)) && (!['HORIZONTAL','VERTICAL'].includes(node.layoutMode) || !fixed())) throw Error('Spacing edits require a fixed-size horizontal or vertical auto-layout container')
    } else if (op.type === 'set_fills') {
      if (op.text !== undefined || op.properties !== undefined) throw Error('set_fills accepts fills only')
      if (node.type === 'TEXT') throw Error('Controlled fill edits on text are unsupported because range styling may change')
      paints(op.fills); next = {fills:clone(op.fills)}
    }
    else {
      if (op.fills !== undefined || op.properties !== undefined) throw Error('set_text accepts text only')
      if (node.type !== 'TEXT' || typeof op.text !== 'string' || op.text.length > 100000) throw Error('set_text requires a TEXT node and at most 100000 characters')
      if (node.textAutoResize !== 'NONE') throw Error('set_text requires fixed text geometry (textAutoResize NONE) for recovery')
      if (node.textStyleId || node.fillStyleId || node.hyperlink) throw Error('Styled or hyperlinked text cannot be restored by this controlled edit')
      if (!object(node.fontName) || typeof node.fontName.family !== 'string' || typeof node.fontName.style !== 'string') throw Error('set_text requires one concrete font')
      if (typeof node.getStyledTextSegments !== 'function') throw Error('Text style segments cannot be inspected; controlled edit refused')
      const segments = node.getStyledTextSegments(['fontName','fontSize','fills','textStyleId','hyperlink','boundVariables','textDecoration','textCase','lineHeight','letterSpacing','listOptions'])
      if (!Array.isArray(segments) || segments.length > 1 || node.characters.length && segments.length !== 1 || hasBindings(segments) || segments.some(s => s.textStyleId || s.hyperlink || s.listOptions?.type && s.listOptions.type !== 'NONE')) throw Error('Mixed, bound, listed or linked text is unsupported')
      font = clone(node.fontName); next = {characters:op.text}
    }
    const keys = Object.keys(next)
    for (const key of keys) if (!(key in node)) throw Error('Property is unavailable on target: ' + key)
    const context = snapshot(node, contextFields)
    if (keys.some(key => context.boundVariables?.[key] !== undefined) || hasBindings(next)) throw Error('Variable-bound edited fields are unsupported')
    if (keys.some(k => k === 'width' || k === 'height') && ['width','height'].some(k => context.boundVariables?.[k] !== undefined)) throw Error('Controlled resize requires both dimensions to be unbound')
    if (keys.includes('cornerRadius') && ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'].some(k => context.boundVariables?.[k] !== undefined)) throw Error('Individual corner bindings prevent reversible cornerRadius edits')
    if (keys.includes('fills') && (context.fillStyleId || hasBindings(node.fills) || typeof node.fills === 'symbol')) throw Error('Style-linked, bound or mixed fills cannot be restored safely')
    if (op.type === 'set_text' && (hasBindings(node.boundVariables) || Object.keys(node.boundVariables || {}).length)) throw Error('Bound text is unsupported')
    const resize = keys.some(k => k === 'width' || k === 'height')
    const before = snapshot(node, [...keys, ...(resize ? ['width','height'] : []), ...(op.type === 'set_text' ? textFields : [])])
    if (op.expected !== undefined) {
      if (!object(op.expected) || Object.keys(op.expected).some(k => !keys.includes(k))) throw Error('expected may compare only fields modified by this operation')
      for (const [key, value] of Object.entries(op.expected)) if (!sameEditValue(key, node[key], value)) throw Error('Expected value mismatch: ' + node.id + '.' + key)
    }
    return {node, index, type:op.type, next, before, context, font, resize, safety:safetyState(node), attemptedKeys:[]}
  }
  function differences(node, expected, normalizePaints = false) {
    const out = []
    for (const [key, value] of Object.entries(expected)) try { if (!(normalizePaints ? sameEditValue(key,node[key],value) : same(node[key],value))) out.push(key) } catch { out.push(key) }
    return out
  }
  async function batch(runtime, args) {
    const maxOps = integer(args.maxOps, 50, 1, 50, 'maxOps')
    if (!Array.isArray(args.ops) || !args.ops.length || args.ops.length > maxOps) throw Error('ops must contain 1–' + maxOps + ' controlled edits')
    if (bytes(args.ops) > 2097152) throw Error('Batch payload exceeds 2 MiB')
    const prepared = [], ids = new Set()
    // Complete every validation before font loading or the first mutation.
    for (let i = 0; i < args.ops.length; i++) {
      const item = await prepare(runtime, args.ops[i], i)
      if (ids.has(item.node.id)) throw Error('Use one operation per node per batch')
      ids.add(item.node.id); prepared.push(item)
    }
    const fonts = new Set()
    for (const item of prepared) if (item.font && !fonts.has(JSON.stringify(item.font))) { await runtime.figma.loadFontAsync(item.font); fonts.add(JSON.stringify(item.font)) }
    // Font loading yields to the editor. Revalidate before changing any target.
    for (const item of prepared) if (!same(safetyState(item.node),item.safety) || differences(item.node, item.before).length || differences(item.node, item.context).length) throw Error('Target changed during preflight: ' + item.node.id)
    const attempted = []
    try {
      for (const item of prepared) {
        runtime.mutationEntered=true
        attempted.push(item)
        for (const [key, value] of Object.entries(item.next)) {
          if (key === 'width' || key === 'height') continue
          item.attemptedKeys.push(key); item.node[key] = clone(value)
        }
        if (item.resize) { item.attemptedKeys.push('$resize'); item.node.resize(item.next.width ?? item.before.width, item.next.height ?? item.before.height) }
        if (differences(item.node, {...item.before,...item.next}, true).length || differences(item.node, item.context).length) throw Error('Write verification failed: ' + item.node.id)
      }
    } catch (cause) {
      const restoredNodeIds = [], failures = [], residue = []
      for (const item of [...attempted].reverse()) {
        const keys = [...item.attemptedKeys].reverse()
        for (const key of keys) try {
          if (key === '$resize') item.node.resize(item.before.width,item.before.height)
          else item.node[key] = clone(item.before[key])
        } catch (error) { failures.push({nodeId:item.node.id, field:key, reason:message(error)}) }
        // A text setter can alter homogeneous text presentation; restore captured fields where changed.
        if (item.type === 'set_text') for (const key of textFields.filter(k => !['width','height','fontWeight'].includes(k))) if (key in item.before && differences(item.node, {[key]:item.before[key]}, true).length) try { item.node[key] = clone(item.before[key]) } catch (error) { failures.push({nodeId:item.node.id, field:key, reason:message(error)}) }
        if (item.type === 'set_text' && differences(item.node, {width:item.before.width,height:item.before.height}).length) try { item.node.resize(item.before.width,item.before.height) } catch (error) { failures.push({nodeId:item.node.id, field:'geometry', reason:message(error)}) }
        const fields = [...new Set([...differences(item.node,item.before,true), ...differences(item.node,item.context)])]
        if (fields.length) residue.push({nodeId:item.node.id, fields}); else restoredNodeIds.push(item.node.id)
      }
      const batchResult = {ok:false, phase:'apply', failedIndex:attempted[attempted.length - 1].index, attemptedNodeIds:attempted.map(i => i.node.id), rollback:{restoredNodeIds, failures, residue, complete:residue.length === 0}, requiresInspection:true,
        scope:'Best-effort restoration of captured target fields only; not a document transaction. No global undo was invoked.'}
      const error = Error('Batch edit failed: ' + message(cause) + '; recovery=' + JSON.stringify(batchResult)); error.batchResult = batchResult;error.journal={coverage:'captured-target-fields-only',complete:false,entries:attempted.map(i=>({nodeId:i.node.id,attemptedProperties:i.attemptedKeys})),rollback:batchResult.rollback,failedAt:{step:batchResult.failedIndex}};error.affected={nodeIds:attempted.map(i=>i.node.id)};throw error
    }
    return {journal:{coverage:'captured-target-fields-only',complete:false,entries:prepared.map(i=>({updated:{nodeId:i.node.id,properties:Object.keys(i.next)}}))},value:{ok:true, applied:prepared.length, nodeIds:prepared.map(i => i.node.id), recoveryScope:'Captured target fields only; layout propagation and document-wide effects are not a transaction'}, images:[]}
  }
  async function variables(runtime,method,args){
    const f=runtime.figma,api=f.variables
    if(typeof api?.getVariableCollectionByIdAsync!=='function')throw Error('Variable collection lookup unavailable')
    const collection=await api.getVariableCollectionByIdAsync(args.collectionId)
    if(!collection||collection.remote)throw Error('Provide an existing writable local collection')
    const entries=[],journal={coverage:'explicit-variable-tool-writes',complete:true,entries},affected={collectionId:collection.id}
    if(method==='add_variable_modes'){
      if(!Array.isArray(args.names)||!args.names.length||args.names.length>20||args.names.some(n=>typeof n!=='string'||!n.trim()||n.length>200))throw Error('Provide 1–20 mode names')
      if(new Set(args.names).size!==args.names.length||args.names.some(n=>collection.modes.some(m=>m.name===n)))throw Error('Mode names must be unique and not already present')
      runtime.modeLimits??=new Map();if(args.forceRefresh)runtime.modeLimits.delete(collection.id)
      const capability=runtime.collectionCapability(collection)
      if(capability.modesAllowed!==null&&collection.modes.length+args.names.length>capability.modesAllowed)throw Object.assign(Error('Cached mode limit: '+capability.modesAllowed+'; forceRefresh can recheck changed permissions'),{failureClass:'platform-limit',affected,journal})
      try{
        for(const name of args.names){runtime.mutationEntered=true;const modeId=collection.addMode(name);entries.push({createdModeId:modeId,name,collectionId:collection.id})}
      }catch(error){
        const match=/^in addMode: Limited to (\d+) modes only$/.exec(String(error.message))
        if(match){if(runtime.modeLimits.size>=100)runtime.modeLimits.delete(runtime.modeLimits.keys().next().value);runtime.modeLimits.set(collection.id,{limit:Number(match[1]),count:collection.modes.length,expiresAt:Date.now()+60000})}
        throw Object.assign(error,{journal,affected,...(match?{failureClass:'platform-limit'}:{})})
      }
      return {value:{collectionId:collection.id,modes:entries},journal,images:[]}
    }
    const modeId=args.modeId??collection.defaultModeId
    if(!collection.modes.some(m=>m.modeId===modeId))throw Error('Unknown mode in target collection')
    if(typeof api.createVariable!=='function')throw Error('Variable creation unavailable')
    if(!Array.isArray(args.tokens)||!args.tokens.length||args.tokens.length>100)throw Error('Provide 1–100 tokens')
    const prepared=[],names=new Set()
    // Validate every token and alias before creating the first variable.
    for(const token of args.tokens){
      if(typeof token.name!=='string'||!token.name.trim()||token.name.length>300||names.has(token.name)||!['COLOR','FLOAT','BOOLEAN','STRING'].includes(token.type))throw Error('Invalid or duplicate token name/type')
      names.add(token.name);let value
      if(token.aliasOf!==undefined){
        if(token.value!==undefined)throw Error('Choose value or aliasOf, not both')
        const source=await api.getVariableByIdAsync(token.aliasOf)
        if(!source||source.resolvedType!==token.type)throw Error('Alias source missing or type mismatch')
        // Existing variables cannot point to a newly created ID: this cannot introduce a cycle.
        value={type:'VARIABLE_ALIAS',id:source.id}
      }else{
        value=token.value
        const valid=token.type==='COLOR'?object(value)&&['r','g','b'].every(k=>finite(value[k])&&value[k]>=0&&value[k]<=1)&&(value.a===undefined||finite(value.a)&&value.a>=0&&value.a<=1):token.type==='FLOAT'?finite(value):token.type==='BOOLEAN'?typeof value==='boolean':typeof value==='string'&&value.length<=10000
        if(!valid)throw Error('Invalid token value for '+token.type)
      }
      prepared.push({...token,value})
    }
    try{
      for(const token of prepared){
        runtime.mutationEntered=true;const variable=api.createVariable(token.name,collection,token.type)
        const entry={createdVariableId:variable.id,collectionId:collection.id,name:token.name,valueConfirmed:false};entries.push(entry)
        variable.setValueForMode(modeId,token.value);entry.valueConfirmed=true;entry.modeId=modeId;if(token.aliasOf)entry.aliasOf=token.aliasOf
      }
    }catch(error){throw Object.assign(error,{journal,affected})}
    return {value:{collectionId:collection.id,modeId,variables:entries},journal,images:[]}
  }
  async function execute(runtime, method, args = {}) {
    if(['create_variables','add_variable_modes'].includes(method))return variables(runtime,method,args)
    if(method==='get_motion_context'&&args.recursive!==true&&args.codeFormat===undefined&&(args.maxNodes!==undefined||args.maxDepth!==undefined))throw Error('Traversal limits require recursive:true or codeFormat')
    if (method === 'get_motion_context' && (args.recursive === true || args.codeFormat !== undefined)) return motion(runtime,args)
    if (method === 'batch_edit') return batch(runtime,args)
    return null
  }
  scope.DshFigmaOperations = {execute}
})(globalThis)
