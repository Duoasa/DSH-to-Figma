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
  // New read probes deliberately never return resource names, IDs, source, or raw API errors.
  // API errors can contain private library metadata; a static classification is enough here.
  function nativeFailure(error, label) {
    const text = message(error)
    if (/permission|not authorized|unauthorized|access denied|forbidden|teamlibrary.*manifest/i.test(text)) return unavailable(label + ' read denied by current permissions; no import or write was attempted')
    if (/not (?:a )?supported|not available|not enabled|no such property/i.test(text)) return unavailable(label + ' API is unavailable in this editor or file')
    return unknown(label + ' read could not be verified; retry after checking editor and file access')
  }
  async function listProbe(object, method, label) {
    try {
      if (typeof object?.[method] !== 'function') return unavailable(label + ' list API is not exposed')
      // One native read, no item iteration, import, or recursive discovery.
      const value = await object[method]()
      return Array.isArray(value) ? available(label + ' list read succeeded with current permissions; resource metadata omitted, imports and writes unverified') : unknown(label + ' returned an unexpected list response')
    } catch (error) { return nativeFailure(error,label) }
  }
  function constructors(figma, editor, methods) {
    try {
      if (figma.editorType !== editor) return unavailable('Requires the ' + editor + ' editor; constructors were not invoked')
      if (figma.mode && figma.mode !== 'default') return unavailable('Constructors require the normal editor plugin mode')
      return methods.every(key => typeof figma[key] === 'function')
        ? available(editor + ' constructors exposed; creation and write permission are unverified')
        : unavailable('Required ' + editor + ' constructors are not all exposed')
    } catch (error) { return nativeFailure(error,editor + ' constructors') }
  }
  function nativeVideo(figma, requestedNode) {
    try {
      if (figma.editorType !== 'figma' || (figma.mode && figma.mode !== 'default')) return unavailable('Native video export requires the normal Figma Design editor')
      let frame, node = requestedNode
      // Parent walking is bounded and never loads another page.
      for (let i=0; node && i<100; i++,node=node.parent) {
        if (node.type === 'FRAME' && node.parent?.type === 'PAGE') {frame=node;break}
        if (node.type === 'PAGE') break
      }
      if (!frame && !requestedNode) frame = (figma.currentPage?.children || []).slice(0,100).find(item => item.type === 'FRAME' && item.parent?.type === 'PAGE')
      if (!frame) return unknown('No eligible top-level frame in the bounded current-page probe; native encoding was not attempted')
      if (typeof frame.exportAsync !== 'function') return unavailable('Frame exportAsync is not exposed on this target')
      // Image export uses the same method, so mere exposure cannot establish video support.
      return unknown('Generic frame exportAsync is exposed; MP4/GIF/WEBM support and animation encoding remain unverified until export_video succeeds')
    } catch (error) { return nativeFailure(error,'Native video export') }
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
    features.variableCreation=typeof figma.variables?.createVariable==='function'?available('Variable constructor exposed; collection permission and mode quota unknown'):unavailable('Variable constructor not exposed')
    try { features.codeLayerCreation=typeof figma.createCodeLayer==='function'?available('Code Layer constructor exposed; signature and writes unverified'):unavailable('Local Code Layer constructor is not exposed') } catch { features.codeLayerCreation=unknown('Code Layer constructor exposure could not be checked') }
    features.nativeVideoExport = nativeVideo(figma,requestedNode)
    features.shaderCatalog = await listProbe(figma,'listAvailableShaders','Shader catalog')
    try {
      features.shaderImport = typeof figma.importShaderById === 'function'
        ? available('Shader import API exposed; no shader was imported and write permission is unverified')
        : unavailable('Shader import API is not exposed')
    } catch (error) { features.shaderImport = nativeFailure(error,'Shader import') }
    try { features.teamLibraryRead = await listProbe(figma.teamLibrary,'getAvailableLibraryVariableCollectionsAsync','Team library') }
    catch (error) { features.teamLibraryRead = nativeFailure(error,'Team library') }
    features.figjamConstructors = constructors(figma,'figjam',['createSticky','createShapeWithText','createConnector'])
    features.slidesConstructors = constructors(figma,'slides',['createSlide','createSlideRow','createText'])
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
