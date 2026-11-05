/* MIT — Copyright (c) 2026 Duoasa. Read-only feature discovery in the actual editor. */
;(function (scope) {
  const status = (state, reason, extra = {}) => ({state, reason, ...extra})
  const unavailable = reason => status('unavailable', reason)
  const unknown = reason => status('unknown', reason)
  const available = reason => status('available', reason)
  const message = error => String(error?.message || error).slice(0, 300)
  const failure = error => status(/not (?:a )?supported|not available|not enabled|no such property/i.test(message(error)) ? 'unavailable' : 'unknown', message(error))
  const motionFields = ['reactions', 'motion', 'manualKeyframeTracks', 'animationStyles', 'timelines', 'animations']
  const bytes = value => {
    const text = JSON.stringify(value)
    return unescape(encodeURIComponent(text)).length
  }
  function read(object, key) {
    try {
      const value = object[key]
      if (value === undefined) return {capability: unavailable(key + ' is not exposed on this target')}
      return {capability: available(key + ' read successfully'), value: JSON.parse(JSON.stringify(value))}
    } catch (error) { return {capability: failure(error)} }
  }
  async function probe(figma, requestedNode) {
    const features = {}, sampleTypes = new Set(['TEXT','RECTANGLE','ELLIPSE','VECTOR','FRAME','COMPONENT','INSTANCE','GROUP','POLYGON','STAR','LINE'])
    // Read only a bounded portion of the loaded page. Never create a probe node or switch pages.
    let sample = requestedNode, visited = 0
    if (!sample) {
      const queue = [...(figma.currentPage?.selection || []).slice(0, 20), ...(figma.currentPage?.children || []).slice(0, 100)]
      for (let i = 0; i < queue.length && visited < 100; i++) {
        const node = queue[i]; visited++
        if (sampleTypes.has(node.type) && node.parent?.type !== 'PAGE') { sample = node; break }
        if (node.children) queue.push(...node.children.slice(0, Math.max(0, 100 - queue.length)))
      }
    }
    for (const [feature, property] of [['manualKeyframes','manualKeyframeTracks'],['animationStyles','animationStyles'],['timelines','timelines']]) {
      features[feature] = sample ? read(sample, property).capability : unknown('No eligible node in the bounded current-page sample; pass nodeId to get_capabilities')
    }
    let definitions
    try {
      const api = figma.motion
      if (typeof api?.figmaAnimationStyles !== 'function') features.animationDefinitions = unavailable('figma.motion.figmaAnimationStyles is not exposed')
      else {
        definitions = await api.figmaAnimationStyles()
        if (!Array.isArray(definitions)) throw new Error('Unexpected animation definition response')
        features.animationDefinitions = available('Animation definitions read successfully')
      }
    } catch (error) { features.animationDefinitions = failure(error) }
    features.textAnimation = definitions
      ? (definitions.some(def => def.styleId === 'TextStagger') ? available('TextStagger discovered') : unavailable('TextStagger is absent from the discovered definitions'))
      : {...features.animationDefinitions}
    try {
      if (typeof figma.getLocalCustomAnimationStylesAsync !== 'function') features.customAnimationStyles = unavailable('Async custom animation style API is not exposed')
      else {
        const styles = await figma.getLocalCustomAnimationStylesAsync()
        if (!Array.isArray(styles)) throw new Error('Unexpected custom animation style response')
        features.customAnimationStyles = available('Local custom animation styles read successfully')
      }
    } catch (error) { features.customAnimationStyles = failure(error) }
    try {
      const api = figma.spec
      features.specs = api && typeof api.getContent === 'function' && typeof api.editContent === 'function'
        ? available('Specs read/edit methods exposed; document access and writes still require verification')
        : unavailable('figma.spec read/edit API is not exposed')
      features.specCreation = typeof api?.createOnCanvasAsync === 'function' ? available('Canvas spec constructor exposed; creation not attempted') : unavailable('Canvas spec constructor is not exposed')
      features.specComments = ['create','getThread','reply'].every(key => typeof api?.comments?.[key] === 'function')
        ? available('Spec comment methods exposed; no comments were posted') : unavailable('Spec comment API is not exposed')
    } catch (error) {
      for (const key of ['specs','specCreation','specComments']) features[key] = failure(error)
    }
    return {schemaVersion:1, editorType:figma.editorType, pageId:figma.currentPage?.id ?? null,
      sampledNodeId:sample?.id ?? null, checkedAt:new Date().toISOString(), readOnly:true, writesVerified:false,
      features, scope:'Current editor/file API exposure and read probes; not a guarantee of write permission or visual correctness'}
  }
  function motionContext(node, args = {}) {
    const fields = args.fields ?? ['reactions','motion','manualKeyframeTracks','animationStyles','timelines']
    if (!Array.isArray(fields) || !fields.length || fields.length > motionFields.length || fields.some(key => !motionFields.includes(key))) throw new Error('fields must contain supported motion properties')
    const maxBytes = args.maxBytes ?? 65536
    if (!Number.isInteger(maxBytes) || maxBytes < 4096 || maxBytes > 2097152) throw new Error('maxBytes must be an integer from 4096 to 2097152')
    const result = {id:node.id, name:node.name, type:node.type, parentId:node.parent?.id ?? null,
      scope:'Public Plugin API data; animations resolves manual tracks only; screenshots show resting state',
      fieldStatus:{}, omittedFields:[], truncated:false}
    if (bytes(result) > 1024) { result.name = null; result.nameOmitted = true }
    for (const key of new Set(fields)) {
      const item = read(node, key)
      result.fieldStatus[key] = {...item.capability, reason:item.capability.reason.slice(0,96)}
      if (item.value !== undefined) {
        if (bytes(item.value) + bytes(result) + 2048 > maxBytes) {
          result.omittedFields.push(key); result.truncated = true
        } else result[key] = item.value
      } else if (key === 'motion') result.motion = null // Legacy result compatibility; status explains absence.
      else if (key === 'reactions') result.reactions = []
    }
    if (result.truncated) result.continuation = {nodeId:node.id, fields:result.omittedFields, maxBytes:Math.min(2097152, maxBytes * 2), hint:'Request omitted fields separately, increase maxBytes, or inspect named tracks with use_figma. No omitted field was returned.'}
    return result
  }
  scope.DshFigmaCapabilities = {probe, motionContext}
})(globalThis)
