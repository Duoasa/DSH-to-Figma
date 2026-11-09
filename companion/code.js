globalThis.DSH_FIGMA_VERSION = "0.4.1";
/* MIT — Copyright (c) 2026 Duoasa. Public figma-use helper contract, local implementation. */
;(function (scope) {
  const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
  function propertyValues(object, path, mainComponent) {
    const parts = path.split('.')
    if (parts.some(part => !part || forbidden.has(part))) throw new Error('Invalid property path: ' + path)
    let values = [object]
    for (const part of parts) values = values.flatMap(value => {
      if (value == null || typeof value === 'symbol') return []
      if (part === '*') return Array.isArray(value) ? value : []
      if (part === 'mainComponent' && value.type === 'INSTANCE') return [mainComponent(value)]
      try { return [value[part]] } catch { return [] } // A type-specific getter is not available on every node.
    })
    return values
  }
  function compileSelector(source, mainComponent, depth = 0) {
    if (typeof source !== 'string' || !source.trim() || source.length > 8000 || depth > 20) throw new Error('Invalid or excessively nested query selector')
    let position = 0
    const fail = () => { throw new Error('Unsupported or malformed query selector near: ' + source.slice(position, position + 60)) }
    const space = () => { const start = position; while (/\s/.test(source[position] || '') && position < source.length) position++; return position > start }
    function enclosed(open, close) {
      if (source[position++] !== open) fail()
      const start = position
      let level = 1, quote = null, escaped = false
      for (; position < source.length; position++) {
        const c = source[position]
        if (escaped) { escaped = false; continue }
        if (c === '\\') { escaped = true; continue }
        if (quote) { if (c === quote) quote = null; continue }
        if (c === '"' || c === "'") { quote = c; continue }
        if (c === open) level++
        if (c === close && --level === 0) return source.slice(start, position++)
      }
      fail()
    }
    function compound() {
      const tests = []
      const rest = source.slice(position)
      const id = /^(?:#([\w-]+(?::\d+)?(?:;[\w-]+(?::\d+)?)*)|((?:I?\d+:\d+(?:;\d+:\d+)*)|(?:[0-9a-f]{8}-[0-9a-f-]{27,})))\b/i.exec(rest)
      if (id) { position += id[0].length; tests.push(node => node.id === (id[1] || id[2])) }
      else {
        const type = /^(\*|[a-z_][\w-]*)/i.exec(rest)
        if (type) { position += type[0].length; if (type[1] !== '*') tests.push(node => node.type === type[1].toUpperCase()); else tests.push(() => true) }
      }
      while (position < source.length) {
        if (source[position] === '[') {
          const attribute = enclosed('[', ']').trim()
          const match = /^(\w+(?:\.(?:\w+|\*))*)\s*(?:(\*=|\^=|\$=|=)\s*(.+))?$/.exec(attribute)
          if (!match || match[1].split('.').some(part => forbidden.has(part))) fail()
          const [, path, operator, input] = match
          let expected = input?.trim()
          if (expected?.startsWith('"') || expected?.startsWith("'")) {
            const quote = expected[0]
            if (expected.at(-1) !== quote || expected.length < 2) fail()
            expected = expected.slice(1, -1).replace(/\\(.)/g, '$1')
          } else if (expected === 'true' || expected === 'false') expected = expected === 'true'
          else if (expected && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(expected)) expected = Number(expected)
          tests.push(node => propertyValues(node, path, mainComponent).some(actual => {
            if (!operator) return actual !== undefined && actual !== null
            if (path === 'mainComponent' && actual && typeof actual === 'object') actual = actual.id
            if (operator === '=') return actual === expected
            if (typeof actual !== 'string' || typeof expected !== 'string') return false
            return operator === '*=' ? actual.includes(expected) : operator === '^=' ? actual.startsWith(expected) : actual.endsWith(expected)
          }))
        } else if (source[position] === ':') {
          position++
          const name = /^[a-z-]+/i.exec(source.slice(position))?.[0]?.toLowerCase()
          if (!name) fail()
          position += name.length
          if (['not', 'is', 'where'].includes(name)) {
            const match = compileSelector(enclosed('(', ')'), mainComponent, depth + 1)
            tests.push((node, boundary) => name === 'not' ? !match(node, boundary) : match(node, boundary))
          } else if (['first-child', 'last-child', 'nth-child'].includes(name)) {
            const number = name === 'nth-child' ? enclosed('(', ')').trim() : null
            if (number !== null && !/^[1-9]\d*$/.test(number)) fail()
            tests.push(node => {
              const siblings = node.parent?.children || [], index = siblings.indexOf(node)
              return index >= 0 && index === (name === 'first-child' ? 0 : name === 'last-child' ? siblings.length - 1 : Number(number) - 1)
            })
          } else fail()
        } else break
      }
      if (!tests.length) fail()
      return (node, boundary) => tests.every(test => test(node, boundary))
    }
    const groups = []
    while (position < source.length) {
      space()
      const parts = [compound()], links = []
      for (;;) {
        const separated = space(), c = source[position]
        if (!c || c === ',') break
        if ('>+~'.includes(c)) { links.push(c); position++; space() }
        else if (separated) links.push(' ')
        else fail()
        parts.push(compound())
      }
      function match(node, index, boundary) {
        if (!node || !parts[index](node, boundary)) return false
        if (index === 0) return true
        if (node === boundary) return false
        const relation = links[index - 1]
        if (relation === '>') return match(node.parent, index - 1, boundary)
        if (relation === ' ') {
          for (let parent = node.parent; parent; parent = parent.parent) {
            if (match(parent, index - 1, boundary)) return true
            if (parent === boundary) break
          }
          return false
        }
        const siblings = node.parent?.children || [], at = siblings.indexOf(node)
        if (relation === '+') return at > 0 && match(siblings[at - 1], index - 1, boundary)
        return siblings.slice(0, Math.max(0, at)).some(sibling => match(sibling, index - 1, boundary))
      }
      groups.push((node, boundary) => match(node, parts.length - 1, boundary))
      if (source[position] === ',') { position++; space(); if (position === source.length) fail() }
    }
    return (node, boundary) => groups.some(group => group(node, boundary))
  }
  scope.DshFigmaHelpers = { compileSelector, propertyValues }
})(globalThis)

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

/* MIT — Copyright (c) 2026 Duoasa. Bounded semantic reads; never mutates the canvas. */
;(function (scope) {
  const GEOMETRY = ['visible','locked','x','y','width','height','rotation','relativeTransform','absoluteTransform','opacity','blendMode']
  const LAYOUT = ['layoutMode','layoutWrap','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutSizingHorizontal','layoutSizingVertical','layoutAlign','layoutGrow','layoutPositioning','constraints','minWidth','maxWidth','minHeight','maxHeight','itemSpacing','counterAxisSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','clipsContent','cornerRadius','cornerSmoothing','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','gridRowCount','gridColumnCount','gridRowGap','gridColumnGap','gridRowSizes','gridColumnSizes','gridRowAnchorIndex','gridColumnAnchorIndex','gridRowSpan','gridColumnSpan','gridChildHorizontalAlign','gridChildVerticalAlign','gridItemsPositioning']
  const TEXT = ['characters','fontName','fontSize','fontWeight','textAlignHorizontal','textAlignVertical','textAutoResize','lineHeight','letterSpacing','textDecoration','textCase','paragraphSpacing','paragraphIndent','hyperlink']
  const TEXT_SEGMENTS = ['fontName','fontSize','fontWeight','fills','fillStyleId','textDecoration','textCase','lineHeight','letterSpacing','textStyleId','hyperlink','boundVariables','paragraphSpacing','paragraphIndent']
  const SEMANTIC = ['boundVariables','resolvedVariableModes','explicitVariableModes','fillStyleId','strokeStyleId','effectStyleId','textStyleId','gridStyleId','layoutGrids','guides','componentPropertyReferences','variantProperties','reactions','strokeWeight','strokeAlign','strokeCap','strokeJoin','dashPattern','strokeTopWeight','strokeBottomWeight','strokeLeftWeight','strokeRightWeight','isMask','maskType','vectorPaths','arcData','pointCount','innerRadius','booleanOperation','exportSettings']
  const FIGJAM = ['shapeType','connectorStart','connectorEnd','connectorLineType','connectorStartStrokeCap','connectorEndStrokeCap','authorVisible','isWideWidth']
  const integer = (v, fallback, min, max, name) => { const n=v??fallback;if(!Number.isInteger(n)||n<min||n>max)throw Error(name+' must be an integer from '+min+' to '+max);return n }
  const bytes = value => unescape(encodeURIComponent(JSON.stringify(value))).length
  const clone = value => value === undefined || typeof value === 'function' ? undefined : JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='symbol'?{$figmaMixed:true}:item))
  const canonical = value => JSON.stringify(value, (_k,v) => v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
  const identity = node => ({id:node.id,type:node.type,name:String(node.name??'')})
  const children = node => 'children' in node?node.children:[]
  function options(args) {
    for(const key of ['includeCss','dedupeStyles','dedupeComponents','semantic','includeScreenshot'])if(args[key]!==undefined&&typeof args[key]!=='boolean')throw Error(key+' must be boolean')
    return {maxNodes:integer(args.maxNodes,500,1,1500,'maxNodes'),maxBytes:integer(args.maxBytes,131072,1024,2097152,'maxBytes'),depth:integer(args.depth,10,0,30,'depth')}
  }
  function state(args) {return {...options(args),used:0,visited:0,complete:true,issues:0,styles:{},styleKeys:new Map(),figmaNodes:[],yieldEvery:40}}
  function mark(s,out,key,reason) {
    s.complete=false;s.issues++
    out.truncated=true
    if(key==='children')out.childrenOmitted=reason
    else if(reason==='maxBytes')(out.omittedFields??=[]).push(key)
    else (out.fieldErrors??={})[key]=String(reason).slice(0,100)
  }
  function put(s,out,key,value) {
    if(value===undefined)return
    let clean
    try{clean=clone(value)}catch(error){mark(s,out,key,error.message);return}
    if(clean===undefined)return
    const cost=bytes({[key]:clean})
    if(s.used+cost>s.maxBytes-700){mark(s,out,key,'maxBytes');return}
    out[key]=clean;s.used+=cost
  }
  function read(s,out,node,key) {
    try{if(key in node)put(s,out,key,node[key])}catch(error){mark(s,out,key,error.message)}
  }
  function mixedText(text) {
    for(const key of TEXT_SEGMENTS)try{if(typeof text[key]==='symbol')return true}catch{return true}
    return false
  }
  function textSegments(s,out,text) {
    try {
      if(typeof text.getStyledTextSegments!=='function') {
        if(mixedText(text))mark(s,out,'textSegments','Mixed text requires getStyledTextSegments')
        return
      }
      const segments=text.getStyledTextSegments(TEXT_SEGMENTS)
      if(!Array.isArray(segments))throw Error('Invalid styled text segment response')
      put(s,out,'textSegments',segments)
    }catch(error){mark(s,out,'textSegments',error.message)}
  }
  function sublayerText(s,out,text) {
    for(const key of [...TEXT,'fills','fillStyleId','textStyleId','boundVariables'])read(s,out,text,key)
    textSegments(s,out,text)
  }
  async function yieldTurn(runtime,s) {
    if(s.visited%s.yieldEvery!==0)return
    if(typeof runtime.yieldRead==='function')await runtime.yieldRead()
    else if(typeof scope.setTimeout==='function')await new Promise(resolve=>scope.setTimeout(resolve,0))
  }
  function paint(s,out,node,key,args) {
    if(args.dedupeStyles===false){read(s,out,node,key);return}
    try{
      if(!(key in node))return
      const value=clone(node[key]);if(value===undefined)return
      const hash=canonical(value);let id=s.styleKeys.get(hash)
      if(!id){
        id='s'+(s.styleKeys.size+1)
        if(s.used+bytes({[id]:value})+100>s.maxBytes-700){mark(s,out,key,'maxBytes');return}
        s.styles[id]=value;s.styleKeys.set(hash,id);s.used+=bytes({[id]:value})
      }
      out.styleRefs??={};put(s,out.styleRefs,key,id)
    }catch(error){mark(s,out,key,error.message)}
  }
  async function walk(runtime,node,s,args,depth) {
    if(s.visited>=s.maxNodes||s.used>s.maxBytes-900)return null
    const out={id:node.id,type:node.type};s.used+=bytes(out)+80;s.visited++;s.figmaNodes.push(node)
    read(s,out,node,'name')
    if(runtime.metrics)runtime.metrics.nodeCount++
    const codeLayer=node.type==='CODE_INSTANCE'?runtime.codeLayerInfo(node):null
    if(codeLayer){for(const key of GEOMETRY)read(s,out,node,key);for(const [key,value]of Object.entries(codeLayer))put(s,out,key,value);return out}
    await yieldTurn(runtime,s)
    for(const key of [...GEOMETRY,...LAYOUT,...SEMANTIC])read(s,out,node,key)
    for(const key of ['fills','strokes','effects'])paint(s,out,node,key,args)
    if(node.type==='TEXT') {
      for(const key of TEXT)read(s,out,node,key)
      textSegments(s,out,node)
    }
    if(['STICKY','SHAPE_WITH_TEXT','CONNECTOR','TABLE_CELL'].includes(node.type)) {
      const text={}
      try {if(node.text)sublayerText(s,text,node.text)}catch(error){mark(s,out,'text',error.message)}
      out.text=text
      for(const key of FIGJAM)read(s,out,node,key)
    }
    const opaqueFields={CODE_BLOCK:['code','codeLanguage'],EMBED:['embedData'],LINK_UNFURL:['linkUnfurlData'],MEDIA:['mediaData'],WIDGET:['widgetId']}
    for(const key of opaqueFields[node.type]??[])read(s,out,node,key)
    if(node.type==='TABLE') {
      read(s,out,node,'numRows');read(s,out,node,'numColumns');out.cells=[]
      if(Number.isInteger(out.numRows)&&Number.isInteger(out.numColumns)&&typeof node.cellAt==='function') {
        const total=out.numRows*out.numColumns
        for(let index=0;index<total;index++) {
          if(s.visited>=s.maxNodes||s.used>s.maxBytes-900){mark(s,out,'cells','budget');out.cellContinuation={row:Math.floor(index/out.numColumns),column:index%out.numColumns,remaining:total-index};break}
          try {
            const cell=node.cellAt(Math.floor(index/out.numColumns),index%out.numColumns),data={row:Math.floor(index/out.numColumns),column:index%out.numColumns,text:{}}
            s.visited++;s.used+=70
            sublayerText(s,data.text,cell.text)
            read(s,data,cell,'width');read(s,data,cell,'height');out.cells.push(data)
          }catch(error){mark(s,out,'cells',error.message);break}
        }
      }else mark(s,out,'cells','Table dimensions or cellAt unavailable')
    }
    if(node.type==='INSTANCE') {
      read(s,out,node,'componentProperties')
      if(typeof node.getMainComponentAsync==='function')try{const main=await node.getMainComponentAsync();put(s,out,'mainComponent',main?{...identity(main),key:main.key??null}:null)}catch(error){mark(s,out,'mainComponent',error.message)}
      else mark(s,out,'mainComponent','getMainComponentAsync unavailable')
    }
    if(node.type==='COMPONENT_SET'||node.type==='COMPONENT') {
      const owner=node.type==='COMPONENT'&&node.parent?.type==='COMPONENT_SET'?node.parent:node
      out.propertyOwnerId=owner.id
      read(s,out,owner,'componentPropertyDefinitions')
      for(const key of ['key','remote','description','descriptionMarkdown','documentationLinks'])read(s,out,node,key)
    }
    if(args.includeCss===true&&typeof node.getCSSAsync==='function')try{put(s,out,'css',await node.getCSSAsync())}catch(error){mark(s,out,'css',error.message)}
    let list
    try{list=children(node)}catch(error){mark(s,out,'children',error.message);return out}
    out.childCount=list.length
    if(list.length) {
      if(depth===0)mark(s,out,'children','depth')
      else {
        out.children=[]
        for(let i=0;i<list.length;i++) {
          const child=await walk(runtime,list[i],s,args,depth-1)
          if(!child){mark(s,out,'children','budget');out.childContinuation={nodeId:node.id,offset:i,remaining:list.length-i};break}
          out.children.push(child)
        }
      }
    }
    return out
  }
  function normalized(node) {
    return Object.fromEntries(Object.entries(node).filter(([key])=>key!=='id').map(([key,value])=>[key,key==='children'?value.map(normalized):value]))
  }
  function subtreeComplete(node) {return !node.truncated&&(node.children??[]).every(subtreeComplete)}
  function ids(node) {return [node.id,...(node.children??[]).flatMap(ids)]}
  function dedupe(node,seen=new Map()) {
    if(node.type==='INSTANCE'&&node.mainComponent?.id&&node.children?.length&&subtreeComplete(node)) {
      const key=node.mainComponent.id+'\0'+canonical(node.children.map(normalized)),prior=seen.get(key)
      if(prior){node.dedupedChildren={sourceNodeId:prior.id,descendantIds:node.children.flatMap(ids),rule:'Identical serialized child content only; IDs map to the source subtree in preorder.'};delete node.children}
      else seen.set(key,node)
      // Keep a source subtree intact so every descendant ID maps unambiguously.
      return
    }
    for(const child of node.children??[])dedupe(child,seen)
  }
  function sectionPlan(node,maxBytes) {
    let all
    try{all=children(node)}catch(error){return {rootNodeId:node.id,sections:[],complete:false,error:String(error.message).slice(0,100)}}
    const sections=[]
    let i=0
    for(;i<all.length;i++) {
      const item=identity(all[i]);if(bytes({sections:[...sections,item]})>Math.min(maxBytes-750,8192))break
      sections.push(item)
    }
    return {rootNodeId:node.id,sections,totalSections:all.length,complete:i===all.length,...(i<all.length?{continuation:{nodeId:node.id,offset:i,tool:'get_metadata',depth:1,limit:50}}:{})}
  }
  function bounded(value,s,node) {
    if(bytes(value)<=s.maxBytes)return value
    return {contextVersion:1,node:{id:node.id,type:node.type,truncated:true,reason:'maxBytes'},coverage:{complete:false,visited:s.visited,maxNodes:s.maxNodes,maxBytes:s.maxBytes,reason:'Serialized result exceeded budget; no partial semantic tree returned.'},sectionPlan:sectionPlan(node,s.maxBytes)}
  }
  async function semantic(runtime,method,args) {
    const node=await runtime.node(args.nodeId)
    if(method==='get_component_context'&&!['INSTANCE','COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('Expected component, component set, or instance')
    if(node.type==='PAGE'&&typeof node.loadAsync==='function')await node.loadAsync()
    const s=state(args),tree=await walk(runtime,node,s,args,s.depth)
    if(args.dedupeComponents===true&&tree)dedupe(tree)
    const value=bounded({contextVersion:1,source:'local-plugin-api',node:tree,sharedStyles:s.styles,coverage:{complete:s.complete,scope:'semantic-field-projection-v1',visited:s.visited,maxNodes:s.maxNodes,maxBytes:s.maxBytes,depth:s.depth,issues:s.issues},...(s.complete?{}:{sectionPlan:sectionPlan(node,s.maxBytes)})},s,node)
    const images=[]
    if(args.includeScreenshot===true)images.push(await runtime.screenshot(node,args))
    return {value,images}
  }
  function aliases(value,result=new Set()) {
    if(!value||typeof value!=='object')return result
    if(value.type==='VARIABLE_ALIAS'&&typeof value.id==='string')result.add(value.id)
    if(Array.isArray(value))for(const item of value)aliases(item,result)
    else for(const item of Object.values(value))aliases(item,result)
    return result
  }
  async function variableUsage(runtime,args) {
    const conflicting=['collectionsOnly','collectionIds','ids','modeIds','query','type','offset','limit'].filter(key=>args[key]!==undefined)
    if(conflicting.length)throw Error('nodeId variable usage does not combine with '+conflicting.join(', '))
    const root=await runtime.node(args.nodeId),s=state(args),queue=[{node:root,depth:s.depth}],used=new Map(),nodeModes={},styleIds=new Set(),errors=[]
    let segmentsVisited=0
    const addBindings=(value,nodeId)=>{for(const id of aliases(value)){if(!used.has(id))used.set(id,new Set());used.get(id).add(nodeId)}}
    function textUsage(text,nodeId) {
      try {
        addBindings(text.boundVariables,nodeId);addBindings(text.fills,nodeId)
        for(const key of ['textStyleId','fillStyleId'])if(typeof text[key]==='string'&&text[key])styleIds.add(text[key])
        if(typeof text.getStyledTextSegments!=='function') {
          if(mixedText(text))throw Error('Mixed text requires getStyledTextSegments')
          return
        }
        if(segmentsVisited>=5000)throw Error('Text segment scan exceeds 5000 ranges')
        const segments=text.getStyledTextSegments(['fills','fillStyleId','textStyleId','boundVariables'])
        if(!Array.isArray(segments))throw Error('Invalid styled text segment response')
        for(const segment of segments) {
          if(++segmentsVisited>5000)throw Error('Text segment scan exceeds 5000 ranges')
          addBindings(segment.boundVariables,nodeId);addBindings(segment.fills,nodeId)
          for(const key of ['textStyleId','fillStyleId'])if(typeof segment[key]==='string'&&segment[key])styleIds.add(segment[key])
        }
      }catch(error){errors.push({nodeId,field:'textSegments',error:String(error.message).slice(0,100)});s.complete=false}
    }
    for(let i=0;i<queue.length;i++) {
      if(s.visited>=s.maxNodes){s.complete=false;break}
      const {node,depth}=queue[i];s.visited++;await yieldTurn(runtime,s)
      let bindings
      try{bindings=node.boundVariables;nodeModes[node.id]=clone(node.resolvedVariableModes)??{}}catch(error){errors.push({nodeId:node.id,error:String(error.message).slice(0,100)});s.complete=false}
      for(const id of aliases(bindings)) {if(!used.has(id))used.set(id,new Set());used.get(id).add(node.id)}
      // Paint/effect bindings are also exposed in these collections on some editor versions.
      for(const key of ['fills','strokes','effects'])try{for(const id of aliases(node[key])){if(!used.has(id))used.set(id,new Set());used.get(id).add(node.id)}}catch{ s.complete=false }
      for(const key of ['fillStyleId','strokeStyleId','effectStyleId','textStyleId','gridStyleId'])try{if(typeof node[key]==='string'&&node[key])styleIds.add(node[key])}catch{s.complete=false}
      if(node.type==='TEXT')textUsage(node,node.id)
      else if(['STICKY','SHAPE_WITH_TEXT','CONNECTOR','TABLE_CELL'].includes(node.type))try{if(node.text)textUsage(node.text,node.id)}catch(error){errors.push({nodeId:node.id,field:'text',error:String(error.message).slice(0,100)});s.complete=false}
      if(node.type==='TABLE')try {
        const rows=node.numRows,columns=node.numColumns,total=rows*columns
        if(!Number.isInteger(rows)||rows<0||!Number.isInteger(columns)||columns<0||!Number.isSafeInteger(total)||typeof node.cellAt!=='function')throw Error('Table dimensions or cellAt unavailable')
        for(let cellIndex=0;cellIndex<total;cellIndex++) {
          if(s.visited>=s.maxNodes)throw Error('Table cell scan exceeds maxNodes')
          const cell=node.cellAt(Math.floor(cellIndex/columns),cellIndex%columns)
          s.visited++;await yieldTurn(runtime,s)
          // TableCellNode has no independent scene-node ID or variable modes; associate usage with its owning table.
          for(const key of ['boundVariables','fills','strokes','effects'])addBindings(cell[key],node.id)
          for(const key of ['fillStyleId','strokeStyleId','effectStyleId','textStyleId'])if(typeof cell[key]==='string'&&cell[key])styleIds.add(cell[key])
          if(!cell.text)throw Error('Table cell text unavailable')
          textUsage(cell.text,node.id)
        }
      }catch(error){errors.push({nodeId:node.id,field:'cells',error:String(error.message).slice(0,100)});s.complete=false}
      let list=[]
      try{list=children(node)}catch(error){errors.push({nodeId:node.id,error:String(error.message).slice(0,100)});s.complete=false}
      const room=Math.max(0,s.maxNodes-queue.length)
      if(depth>0)for(const child of list.slice(0,room))queue.push({node:child,depth:depth-1})
      if((depth===0&&list.length)||(depth>0&&list.length>room))s.complete=false
    }
    const f=runtime.figma,lookup=f.variables.getVariableByIdAsync?.bind(f.variables),getCollection=f.variables.getVariableCollectionByIdAsync?.bind(f.variables)
    if(!lookup)throw Error('getVariableByIdAsync is unavailable; use collection queries')
    const pending=[...used.keys()].slice(0,s.maxNodes),variables=[],collections=new Map(),resolved=new Map(),missing=[]
    if(used.size>pending.length)s.complete=false
    for(let i=0;i<pending.length;i++) {
      if(i>=s.maxNodes){s.complete=false;break}
      const id=pending[i]
      if(resolved.has(id))continue
      let v
      try{v=await lookup(id)}catch(error){missing.push({id,error:String(error.message).slice(0,100)});s.complete=false;continue}
      if(!v){missing.push({id,error:'Variable unavailable'});s.complete=false;continue}
      const entry={id:v.id,name:v.name,key:v.key,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId,valuesByMode:clone(v.valuesByMode),scopes:clone(v.scopes),usedBy:[...(used.get(id)??[])]}
      if(bytes(entry)+s.used>s.maxBytes-1200){s.complete=false;missing.push({id,error:'maxBytes'});break}
      s.used+=bytes(entry);variables.push(entry);resolved.set(id,entry)
      for(const dep of aliases(entry.valuesByMode))if(!pending.includes(dep)){if(pending.length<s.maxNodes)pending.push(dep);else s.complete=false}
      if(getCollection&&!collections.has(v.variableCollectionId))try {const c=await getCollection(v.variableCollectionId);if(c)collections.set(c.id,{id:c.id,name:c.name,defaultModeId:c.defaultModeId,modes:clone(c.modes)});else {missing.push({id:v.variableCollectionId,error:'Collection unavailable'});s.complete=false}}catch(error){missing.push({id:v.variableCollectionId,error:String(error.message).slice(0,100)});s.complete=false}
      else if(!getCollection){missing.push({id:v.variableCollectionId,error:'Collection lookup unavailable'});s.complete=false}
    }
    function resolve(id,modes,seen=new Set()) {
      if(seen.has(id))return {status:'alias-cycle',variableId:id}
      seen.add(id);const v=resolved.get(id)
      if(!v)return {status:'unavailable',variableId:id}
      const mode=modes[v.variableCollectionId]??collections.get(v.variableCollectionId)?.defaultModeId
      const value=v.valuesByMode?.[mode]
      if(value===undefined)return {status:'mode-unavailable',variableId:id,modeId:mode??null}
      return value?.type==='VARIABLE_ALIAS'?resolve(value.id,modes,seen):{status:'resolved',variableId:id,modeId:mode,value}
    }
    const usages=[]
    for(const [id,nodes] of used)for(const nodeId of nodes){const resolution=resolve(id,nodeModes[nodeId]??{});if(resolution.status!=='resolved')s.complete=false;usages.push({nodeId,variableId:id,resolved:resolution})}
    const value={contextVersion:1,scope:'target-subtree-and-alias-dependencies',nodeId:root.id,variables,collections:[...collections.values()],usages,styleIds:[...styleIds],missing,errors,coverage:{complete:s.complete,visitedNodes:s.visited,returnedVariables:variables.length,queuedVariables:pending.length,includesAliasDependencies:true}}
    if(!s.complete)value.continuation={nodeId:root.id,hint:'Narrow to a child node or increase maxNodes/maxBytes/depth. Missing variables are not absent variables.'}
    if(bytes(value)>s.maxBytes)return {value:{contextVersion:1,nodeId:root.id,variables:[],collections:[],usages:[],coverage:{complete:false,reason:'maxBytes',visitedNodes:s.visited},continuation:{nodeId:root.id,hint:'Narrow to a child node or increase maxBytes.'}},images:[]}
    return {value,images:[]}
  }
  async function search(runtime,args) {
    if(!Array.isArray(args.pageIds)||!args.pageIds.length||args.pageIds.length>20||args.pageIds.some(x=>typeof x!=='string'||!x))throw Error('pageIds must contain 1–20 page IDs')
    if(args.pageId!==undefined)throw Error('Use pageIds or pageId, not both')
    if(args.includeLibraryKeys?.length)throw Error('Cloud library search is unavailable locally')
    const libraryKeys=args.libraryCollectionKeys??[]
    if(args.libraryCollectionKeys!==undefined&&(!Array.isArray(libraryKeys)||!libraryKeys.length||libraryKeys.length>20||libraryKeys.some(key=>typeof key!=='string'||!key||key.length>300)||new Set(libraryKeys).size!==libraryKeys.length))throw Error('libraryCollectionKeys must contain 1–20 unique enabled collection keys')
    const queries=args.queries??[{entity:args.kind??'all',query:args.query}]
    if(!Array.isArray(queries)||!queries.length||queries.length>50||queries.some(q=>!q||typeof q.query!=='string'||!['all','component','components','variable','variables','style','styles'].includes(q.entity)))throw Error('Provide bounded entity/query searches')
    if(args.queries&&(args.query!==undefined||args.kind!==undefined))throw Error('Use queries or query/kind, not both')
    const s=state(args),offset=integer(args.offset,0,0,1000000,'offset'),limit=integer(args.limit,50,1,200,'limit'),pages=[],components=[],errors=[]
    const needComponents=queries.some(q=>['all','component','components'].includes(q.entity)),needVariables=queries.some(q=>['all','variable','variables'].includes(q.entity)),needStyles=queries.some(q=>['all','style','styles'].includes(q.entity))
    if(libraryKeys.length&&!needVariables)throw Error('libraryCollectionKeys requires a variable or all-entity query')
    for(const id of new Set(args.pageIds)) {
      const page=await runtime.node(id);if(page.type!=='PAGE')throw Error('pageIds must identify pages')
      if(typeof page.loadAsync==='function')await page.loadAsync()
      pages.push(id)
      if(!needComponents)continue
      const queue=[...children(page)].slice(0,s.maxNodes-s.visited)
      if(children(page).length>queue.length)s.complete=false
      for(let i=0;i<queue.length;i++) {
        if(s.visited>=s.maxNodes){s.complete=false;break}
        const node=queue[i];s.visited++;await yieldTurn(runtime,s)
        if(['COMPONENT','COMPONENT_SET'].includes(node.type))components.push({...identity(node),pageId:id})
        const list=children(node),room=Math.max(0,s.maxNodes-s.visited-(queue.length-i-1))
        queue.push(...list.slice(0,room));if(list.length>room)s.complete=false
      }
      if(s.visited>=s.maxNodes&&pages.length<new Set(args.pageIds).size){s.complete=false;break}
    }
    const f=runtime.figma,variables=[],styles=[],scanComplete={components:s.complete,variables:true,styles:true},libraryCollectionsRead=[]
    let localVariables=0,libraryVariables=0,libraryCollectionsScanned=0
    if(needVariables)try{
      const all=await f.variables.getLocalVariablesAsync()
      if(all.length>s.maxNodes){s.complete=false;scanComplete.variables=false}
      for(const v of all.slice(0,s.maxNodes))variables.push({id:v.id,name:v.name,resolvedType:v.resolvedType,source:'local'})
      localVariables=variables.length
    }catch(error){errors.push({entity:'variables',error:String(error.message).slice(0,100)});s.complete=false;scanComplete.variables=false}
    if(libraryKeys.length) {
      let known
      try {
        const api=f.teamLibrary
        if(typeof api?.getAvailableLibraryVariableCollectionsAsync!=='function'||typeof api?.getVariablesInLibraryCollectionAsync!=='function')throw Error('Native team library variable read APIs are unavailable')
        const all=await api.getAvailableLibraryVariableCollectionsAsync()
        if(!Array.isArray(all))throw Error('Unexpected available library collection response')
        const available=all.slice(0,5000);libraryCollectionsScanned=available.length
        known=new Set(available.map(collection=>collection.key))
        if(all.length>5000){errors.push({entity:'library-variables',error:'Enabled collection enumeration exceeds 5000 collections'});s.complete=false;scanComplete.variables=false}
      }catch(error){errors.push({entity:'library-variables',error:String(error.message).slice(0,100)});s.complete=false;scanComplete.variables=false}
      if(known)for(const key of libraryKeys) {
        if(!known.has(key)){errors.push({entity:'library-variables',libraryCollectionKey:key,error:'Collection not found in the bounded enabled-library inventory'});s.complete=false;scanComplete.variables=false;continue}
        const room=s.maxNodes-variables.length
        if(room<=0){errors.push({entity:'library-variables',libraryCollectionKey:key,error:'Variable candidate budget exhausted (maxNodes)'});s.complete=false;scanComplete.variables=false;continue}
        try {
          const all=await f.teamLibrary.getVariablesInLibraryCollectionAsync(key)
          if(!Array.isArray(all))throw Error('Unexpected library variable response')
          libraryCollectionsRead.push(key)
          if(all.length>room){s.complete=false;scanComplete.variables=false}
          for(const v of all.slice(0,room)){variables.push({key:v.key,name:v.name,resolvedType:v.resolvedType,libraryCollectionKey:key,source:'library'});libraryVariables++}
        }catch(error){errors.push({entity:'library-variables',libraryCollectionKey:key,error:String(error.message).slice(0,100)});s.complete=false;scanComplete.variables=false}
      }
    }
    if(needStyles)for(const method of ['getLocalPaintStylesAsync','getLocalTextStylesAsync','getLocalEffectStylesAsync','getLocalGridStylesAsync'])try{
      const all=await f[method](),room=Math.max(0,s.maxNodes-styles.length)
      if(all.length>room){s.complete=false;scanComplete.styles=false}
      for(const v of all.slice(0,room))styles.push({id:v.id,name:v.name,key:v.key,type:v.type})
    }catch(error){errors.push({entity:'styles',method,error:String(error.message).slice(0,100)});s.complete=false;scanComplete.styles=false}
    const paginate=(all,query,entity)=>{const found=all.filter(x=>String(x.name).toLowerCase().includes(query.toLowerCase()));return {items:found.slice(offset,offset+limit),pagination:{offset,limit,total:found.length,totalIsExact:scanComplete[entity],hasMore:offset+limit<found.length,nextOffset:offset+limit<found.length?offset+limit:null},discoveryComplete:scanComplete[entity]}}
    const results=queries.map(q=>({entity:q.entity,query:q.query,...(['all','component','components'].includes(q.entity)?{components:paginate(components,q.query,'components')}:{}),...(['all','variable','variables'].includes(q.entity)?{variables:paginate(variables,q.query,'variables')}:{}),...(['all','style','styles'].includes(q.entity)?{styles:paginate(styles,q.query,'styles')}:{})}))
    const value={results,errors,coverage:{complete:s.complete,pagesRead:pages,requestedPages:[...new Set(args.pageIds)],visitedNodes:s.visited,scannedVariables:variables.length,scannedStyles:styles.length,variableCandidateBudget:s.maxNodes,...(libraryKeys.length?{scannedLocalVariables:localVariables,scannedLibraryVariables:libraryVariables,libraryCollectionsRequested:libraryKeys,libraryCollectionsRead,libraryCollectionsScanned,libraryCollectionBudget:5000}:{}),scope:'specified-page components; local-file variables/styles and explicitly requested enabled-library variable descriptors; no imports or cloud search'}}
    if(!s.complete)value.continuation={hint:'Query fewer pages/libraries or increase maxNodes; local and library variables share one candidate budget. Totals cover only scanned candidates.'}
    if(bytes(value)>s.maxBytes)return {value:{results:[],coverage:{complete:false,reason:'maxBytes'},continuation:{hint:'Use fewer queries, a smaller limit, or increase maxBytes.'}},images:[]}
    return {value,images:[]}
  }
  scope.DshFigmaContext = {async execute(runtime,method,args={}) {
    if(['get_design_context','get_figjam','get_component_context'].includes(method)&&args.semantic!==true&&(['includeCss','dedupeStyles','dedupeComponents'].some(key=>args[key]!==undefined)||method==='get_component_context'&&args.includeScreenshot!==undefined))throw Error('These context options require semantic:true')
    if(method==='get_variable_defs'&&args.nodeId===undefined&&['depth','maxNodes','maxBytes'].some(key=>args[key]!==undefined))throw Error('Target variable budgets require nodeId; use catalog filters for inventory reads')
    if(method==='search_design_system'&&args.libraryCollectionKeys!==undefined&&args.pageIds===undefined)throw Error('libraryCollectionKeys requires explicit pageIds')
    if(['get_design_context','get_figjam','get_component_context'].includes(method)&&args.semantic===true)return semantic(runtime,method,args)
    if(method==='get_variable_defs'&&args.nodeId!==undefined)return variableUsage(runtime,args)
    if(method==='search_design_system'&&args.pageIds!==undefined)return search(runtime,args)
    return null
  }}
})(globalThis)

/* MIT — Copyright (c) 2026 Duoasa. Local assets and bounded native video transfer. */
;(function(scope) {
  const transfers = new WeakMap(), LIMIT = 256 * 1024 * 1024, CHUNK = 512 * 1024, TTL = 10 * 60 * 1000
  const ASSET_LIMIT = 12 * 1024 * 1024
  let sequence = 0
  const integer = (n, fallback, min, max, name) => { n ??= fallback; if (!Number.isInteger(n) || n < min || n > max) throw Error(name + ' out of range'); return n }
  const result = value => ({value, images:[]})
  const errorText = error => String(error?.message || error).slice(0,1000)
  const dispose = (runtime,item) => {if(item.timer!==undefined)clearTimeout(item.timer);item.bytes=null;if(transfers.get(runtime)===item)transfers.delete(runtime)}
  const renew = (runtime,item) => {item.expiresAt=Date.now()+TTL;if(item.timer!==undefined)clearTimeout(item.timer);if(typeof setTimeout==='function'){item.timer=setTimeout(()=>dispose(runtime,item),TTL);item.timer?.unref?.()}}
  const current = runtime => { const item=transfers.get(runtime); if(item && item.expiresAt <= Date.now()) { dispose(runtime,item); return null }; return item }
  const getTransfer = (runtime,id) => { const item=current(runtime); if(!item || item.id!==id || !item.bytes) throw Error('Export transfer not found or expired; do not reuse IDs after reconnect'); return item }
  const clone = value => JSON.parse(JSON.stringify(value))
  async function replaceImages(runtime,args) {
    const f=runtime.figma, assets=args.assets, ids=args.nodeIds
    if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('nodeIds must contain 1–20 unique target IDs')
    if(!Array.isArray(assets)||assets.length!==ids.length)throw Error('Each target requires exactly one raster asset')
    if(args.parentId!==undefined)throw Error('parentId cannot be combined with nodeIds')
    const index=integer(args.fillIndex,0,0,100,'fillIndex'), mode=args.scaleMode
    if(mode!==undefined&&!['FILL','FIT','CROP','TILE'].includes(mode))throw Error('Invalid image scaleMode')
    const pending=[];let total=0
    for(let i=0;i<ids.length;i++) {
      const asset=assets[i]
      if(!asset||!['image/png','image/jpeg','image/gif','image/webp'].includes(asset.mimeType)||typeof asset.data!=='string')throw Error('Target replacement accepts raster images only; SVG creates editable nodes')
      if(asset.data.length>Math.ceil(ASSET_LIMIT/3)*4)throw Error('Asset batch exceeds 12 MiB')
      const bytes=f.base64Decode(asset.data);total+=bytes.length
      if(!bytes.length||f.base64Encode(bytes)!==asset.data)throw Error('Invalid raster asset data')
      if(total>ASSET_LIMIT)throw Error('Asset batch exceeds 12 MiB')
      const node=await runtime.node(ids[i])
      if(!Array.isArray(node.fills))throw Error('Target must expose uniform fills; mixed text fills need explicit text-range editing')
      if(index>node.fills.length)throw Error('fillIndex must address an existing fill or append at the end')
      // Load existing text fonts before any target writes, never replace the user's font.
      if(node.type==='TEXT') {
        const fonts=typeof node.getStyledTextSegments==='function'?node.getStyledTextSegments(['fontName']).map(s=>s.fontName):[node.fontName]
        const seen=new Set()
        for(const font of fonts){if(!font||typeof font.family!=='string'||typeof font.style!=='string')throw Error('Unable to resolve existing text fonts');const key=font.family+'\0'+font.style;if(!seen.has(key)){seen.add(key);await f.loadFontAsync(font)}}
      }
      pending.push({node,bytes,fills:clone(node.fills)})
    }
    // Decode every image before changing fills so a corrupt later asset cannot cause partial replacement.
    for(const item of pending)item.image=f.createImage(item.bytes)
    const changed=[]
    for(const {node,image,fills} of pending) {
      const old=fills[index]
      let paint=old?.type==='IMAGE'?{...old,imageHash:image.hash}:{type:'IMAGE',imageHash:image.hash,scaleMode:mode??'FILL',...(old?{visible:old.visible,opacity:old.opacity,blendMode:old.blendMode}:{})}
      if(mode!==undefined&&mode!==paint.scaleMode){paint.scaleMode=mode;delete paint.imageTransform;delete paint.scalingFactor}
      if(paint.scaleMode==='CROP'&&!paint.imageTransform)paint.imageTransform=[[1,0,0],[0,1,0]]
      if(paint.scaleMode==='TILE'&&!paint.scalingFactor)paint.scalingFactor=1
      for(const key of Object.keys(paint))if(paint[key]===undefined)delete paint[key]
      fills.splice(index,index<fills.length?1:0,paint)
      node.fills=fills
      changed.push({nodeId:node.id,imageHash:image.hash,fillIndex:index,scaleMode:paint.scaleMode})
    }
    f.commitUndo()
    return result({nodeIds:changed.map(x=>x.nodeId),replacements:changed})
  }
  async function download(runtime,args) {
    const f=runtime.figma, ids=args.nodeIds??(args.nodeId?[args.nodeId]:f.currentPage.selection.map(n=>n.id))
    if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!id))throw Error('Select or specify 1–20 nodes')
    const maxNodes=integer(args.maxNodes,5000,1,10000,'maxNodes'), assets=[],mapping=[],hashes=new Set(),svgIds=new Set()
    let total=0,visited=0
    const add=(name,mimeType,bytes,entry)=>{if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('Export returned no bytes');if(assets.length>=40)throw Error('Export exceeds 40 files; select a smaller subtree');total+=bytes.length;if(total>ASSET_LIMIT)throw Error('Asset batch exceeds 12 MiB; export fewer or smaller nodes');mapping.push({...entry,assetIndex:assets.length,name,mimeType,bytes:bytes.length});assets.push({name,mimeType,data:f.base64Encode(bytes)})}
    const exportNode=async(node,settings,role)=>{
      const options=clone(settings), format=String(args.format??options.format??'PNG').toUpperCase()
      if(!['PNG','JPG','SVG','PDF'].includes(format))throw Error('Unsupported node export format: '+format)
      options.format=format;const suffix=typeof options.suffix==='string'?options.suffix:'';delete options.suffix
      if(args.scale!==undefined){if(!Number.isFinite(args.scale)||args.scale<0.01||args.scale>4)throw Error('Scale must be 0.01–4');if(['PNG','JPG'].includes(format))options.constraint={type:'SCALE',value:args.scale}}
      const bytes=await node.exportAsync(options)
      add(node.name+suffix+'.'+format.toLowerCase(),{PNG:'image/png',JPG:'image/jpeg',SVG:'image/svg+xml',PDF:'application/pdf'}[format],bytes,{nodeId:node.id,role,format})
      if(format==='SVG')svgIds.add(node.id)
    }
    for(const id of ids) {
      const root=await runtime.node(id)
      const settings=args.respectExportSettings&&Array.isArray(root.exportSettings)&&root.exportSettings.length?root.exportSettings:[{format:'PNG'}]
      if(settings.length>40)throw Error('Too many node export settings')
      for(const item of settings)await exportNode(root,item,'render')
      if(!args.includeOriginalImages&&!args.includeSvgAssets)continue
      const queue=[{node:root,insideBoolean:false}]
      while(queue.length){const {node,insideBoolean}=queue.shift();if(++visited>maxNodes)throw Error('Asset traversal exceeds maxNodes; select a smaller subtree')
        if(args.includeOriginalImages)for(const paint of Array.isArray(node.fills)?node.fills:[])if(paint.type==='IMAGE'&&paint.imageHash&&!hashes.has(paint.imageHash)){
          hashes.add(paint.imageHash);const image=f.getImageByHash(paint.imageHash);if(!image)throw Error('Original image unavailable: '+paint.imageHash)
          add(paint.imageHash+'.bin','application/octet-stream',await image.getBytesAsync(),{nodeId:node.id,imageHash:paint.imageHash,role:'original'})
        }
        if(args.includeSvgAssets&&!insideBoolean&&['VECTOR','BOOLEAN_OPERATION'].includes(node.type)&&!svgIds.has(node.id)){svgIds.add(node.id);const bytes=await node.exportAsync({format:'SVG'});add(node.name+'.svg','image/svg+xml',bytes,{nodeId:node.id,role:'vector',format:'SVG'})}
        if(Array.isArray(node.children)&&(args.includeOriginalImages||node.type!=='BOOLEAN_OPERATION')){if(visited+queue.length+node.children.length>maxNodes)throw Error('Asset traversal exceeds maxNodes; select a smaller subtree');for(const child of node.children)queue.push({node:child,insideBoolean:insideBoolean||node.type==='BOOLEAN_OPERATION'})}
      }
    }
    return {value:{exportCount:assets.length,mapping,complete:true},images:[],assets}
  }
  async function exportVideo(runtime,args) {
    const f=runtime.figma
    if(f.editorType!=='figma'||f.mode==='inspect'||f.mode==='codegen')throw Error('Native video export requires the Figma Design editor')
    const format=args.format??'MP4'
    if(!['MP4','GIF','WEBM'].includes(format))throw Error('Video format must be MP4, GIF or WEBM')
    if(args.fps!==undefined&&!(format==='GIF'?[8,12,15,24,30]:[12,24,30,60]).includes(args.fps))throw Error('Unsupported fps for '+format)
    if(args.quality!==undefined&&(format==='GIF'||!['LOW','MEDIUM','HIGH'].includes(args.quality)))throw Error('quality is LOW/MEDIUM/HIGH and applies only to MP4/WEBM')
    if(args.loopCount!==undefined){if(format!=='GIF')throw Error('loopCount applies only to GIF');integer(args.loopCount,0,0,1000,'loopCount')}
    if(args.constraint!==undefined){const c=args.constraint;if(!c||!['SCALE','WIDTH','HEIGHT'].includes(c.type)||!Number.isFinite(c.value)||c.value<=0||(c.type==='SCALE'?![0.5,0.75,1,1.5,2,3,4].includes(c.value):c.value>8192))throw Error('Invalid video size constraint; SCALE must be 0.5, 0.75, 1, 1.5, 2, 3 or 4')}
    if(current(runtime))throw Error('An export transfer is already active; finish or release it before exporting again')
    const node=await runtime.node(args.nodeId)
    let frame=typeof node.getTopLevelFrame==='function'?node.getTopLevelFrame():undefined
    if(!frame){let at=node;while(at&&at.type!=='PAGE'){if(at.type==='FRAME'&&at.parent?.type==='PAGE'){frame=at;break}at=at.parent}}
    if(!frame||frame.type!=='FRAME'||frame.parent?.type!=='PAGE'||typeof frame.exportAsync!=='function')throw Error('Target is not inside an exportable top-level animation frame')
    // Recheck after async node resolution, and never expire an encoder still in flight.
    if(current(runtime))throw Error('An export transfer is already active; finish or release it before exporting again')
    const pending={id:'export-'+Date.now().toString(36)+'-'+(++sequence).toString(36)+'-'+Math.random().toString(36).slice(2),expiresAt:Infinity,bytes:null}
    transfers.set(runtime,pending)
    try {
      const settings={format};for(const key of ['fps','quality','loopCount','constraint'])if(args[key]!==undefined)settings[key]=args[key]
      const bytes=await frame.exportAsync(settings)
      if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('Native encoder returned empty output')
      if(bytes.length>LIMIT)throw Error('Video exceeds 256 MiB; reduce quality, dimensions or duration')
      pending.bytes=bytes;renew(runtime,pending)
      return result({transfer:{transferId:pending.id,nodeId:frame.id,format,mimeType:{MP4:'video/mp4',GIF:'image/gif',WEBM:'video/webm'}[format],byteLength:bytes.length,chunkSize:CHUNK,expiresAt:new Date(pending.expiresAt).toISOString(),name:String(frame.name||'animation').slice(0,160)+'.'+format.toLowerCase()}})
    }catch(error){dispose(runtime,pending);throw Error('Native video export failed: '+errorText(error))}
  }
  async function execute(runtime,method,args={}) {
    if(method==='upload_assets'&&args.nodeIds===undefined&&(args.fillIndex!==undefined||args.scaleMode!==undefined))throw Error('Fill replacement options require nodeIds')
    if(method==='upload_assets'&&args.nodeIds!==undefined)return replaceImages(runtime,args)
    if(method==='download_assets'&&(args.respectExportSettings===true||args.includeSvgAssets===true))return download(runtime,args)
    if(method==='export_video')return exportVideo(runtime,args)
    if(method==='read_export_chunk'){
      const item=getTransfer(runtime,args.transferId),offset=integer(args.offset,0,0,item.bytes.length,'offset'),length=integer(args.length,CHUNK,1,CHUNK,'length')
      const bytes=item.bytes.subarray(offset,Math.min(offset+length,item.bytes.length));renew(runtime,item)
      return result({transferId:item.id,offset,byteLength:bytes.length,nextOffset:offset+bytes.length,done:offset+bytes.length===item.bytes.length,data:runtime.figma.base64Encode(bytes)})
    }
    if(method==='release_export'){
      const item=current(runtime);if(item&&item.id===args.transferId){dispose(runtime,item);return result({released:true})}return result({released:false})
    }
    return null
  }
  scope.DshFigmaMedia={execute}
})(globalThis)

/* MIT — Copyright (c) 2026 Duoasa. Local authoring through public Figma APIs. */
;(function (scope) {
  const METHODS = new Set(['generate_diagram','generate_deck','get_shaders','list_file_shaders','apply_shader','import_dom_snapshot'])
  const forbidden = new Set(['__proto__','prototype','constructor'])
  const fail = message => { throw new Error(message) }
  const object = (value,name) => { if(!value||typeof value!=='object'||Array.isArray(value))fail(name+' must be an object');return value }
  const number = (value,min,max,name) => { if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(name+' is out of range');return value }
  const integer = (value,min,max,name) => { number(value,min,max,name);if(!Number.isInteger(value))fail(name+' must be an integer');return value }
  const text = (value,max,name,empty=false) => { if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))fail(name+' must be '+(empty?'a':'a nonempty')+' string of at most '+max+' characters');return value }
  const array = (value,max,name,min=0) => { if(!Array.isArray(value)||value.length<min||value.length>max)fail(name+' must contain '+min+'–'+max+' items');return value }
  const bytes = value => unescape(encodeURIComponent(JSON.stringify(value))).length
  function color(value,name='color') {
    if(typeof value!=='string')fail(name+' must be a hex or rgb color')
    let match=/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(value.trim())
    if(match){let hex=match[1];if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');return {r:parseInt(hex.slice(0,2),16)/255,g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255,a:hex.length===8?parseInt(hex.slice(6),16)/255:1}}
    match=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value.trim())
    if(match)return {r:number(+match[1],0,255,name)/255,g:number(+match[2],0,255,name)/255,b:number(+match[3],0,255,name)/255,a:match[4]===undefined?1:number(+match[4],0,1,name)}
    if(value==='transparent')return {r:0,g:0,b:0,a:0}
    fail(name+' must be a hex or rgb color')
  }
  const paint = c => ({type:'SOLID',color:{r:c.r,g:c.g,b:c.b},opacity:c.a})
  const requireApi = (f,names) => { for(const name of names)if(typeof f[name]!=='function')fail('Local editor does not expose '+name) }
  const editor = (f,type) => { if(f.editorType!==type)fail('This workflow requires the '+type+' editor; current editor is '+f.editorType) }
  const writable = f => {if(f.mode!==undefined&&f.mode!=='default')fail('Local authoring requires default edit mode; current mode is '+f.mode)}
  function origin(f,value) {
    if(value!==undefined){object(value,'origin');return {x:number(value.x,-1000000,1000000,'origin.x'),y:number(value.y,-1000000,1000000,'origin.y')}}
    let right=0;for(const n of f.currentPage.children||[])right=Math.max(right,(n.x||0)+(n.width||0));return {x:right+80,y:80}
  }
  async function loadFont(f,font) {requireApi(f,['loadFontAsync']);await f.loadFontAsync(font)}
  function writeFailure(error,created,extra={}) {
    const out=new Error(String(error?.message||error)+'; created node IDs: '+JSON.stringify(created)+'. Inspect these nodes before retrying.')
    out.createdNodeIds=created.slice();out.journal={coverage:'created-node-ids-only',complete:false,entries:[{created:created.slice()}]};out.safeToRetryWithoutCanvasRead=false;Object.assign(out,extra);throw out
  }
  function mermaid(source) {
    text(source,20000,'mermaid')
    const lines=source.split(/[\r\n;]+/).map(s=>s.trim()).filter(Boolean)
    const head=/^(?:flowchart|graph)\s+(LR|TB|TD)$/.exec(lines.shift()||'');if(!head)fail('Only Mermaid flowchart LR/TB/TD is supported')
    const nodes=new Map(),edges=[]
    const token=raw=>{
      const m=/^([A-Za-z_][\w-]*)(?:\[([^\[\]{}()]*)\]|\{([^\[\]{}()]*)\}|\(([^\[\]{}()]*)\))?$/.exec(raw.trim())
      if(!m)fail('Unsupported Mermaid node syntax: '+raw)
      const key=m[1],label=m[2]??m[3]??m[4],shape=m[3]!==undefined?'decision':m[4]!==undefined?'terminal':'process'
      if(label!==undefined){if(nodes.has(key)&&nodes.get(key).explicit&&(nodes.get(key).label!==label||nodes.get(key).shape!==shape))fail('Conflicting Mermaid definition for '+key);nodes.set(key,{key,label,shape,explicit:true})}
      else if(!nodes.has(key))nodes.set(key,{key,label:key,shape,explicit:false})
      return key
    }
    for(const line of lines){
      if(line.startsWith('%%'))continue
      if(line.includes('-->')){const bits=line.split('-->');if(bits.length!==2)fail('Only one Mermaid edge per line is supported');let tail=bits[1],label;const m=/^\s*\|([^|]+)\|\s*(.*)$/.exec(tail);if(m){label=m[1];tail=m[2]}edges.push({from:token(bits[0]),to:token(tail),...(label?{label}:{})})}
      else token(line)
    }
    return {nodes:[...nodes.values()].map(({explicit,...n})=>n),edges,direction:head[1]==='LR'?'LR':'TB'}
  }
  function graphInput(args) {
    if(args.mermaid!==undefined&&(args.nodes!==undefined||args.edges!==undefined))fail('Use mermaid or nodes/edges, not both')
    const data=args.mermaid!==undefined?mermaid(args.mermaid):args
    const nodes=array(data.nodes,200,'nodes',1).map(n=>{object(n,'node');const key=text(n.key,100,'node.key');if(forbidden.has(key))fail('Reserved node key');return {key,label:text(n.label,1000,'node.label',true),shape:n.shape??'process'}})
    if(new Set(nodes.map(n=>n.key)).size!==nodes.length)fail('Node keys must be unique')
    if(nodes.some(n=>!['process','decision','terminal'].includes(n.shape)))fail('shape must be process, decision or terminal')
    const keys=new Set(nodes.map(n=>n.key)),edges=array(data.edges??[],400,'edges').map(e=>{object(e,'edge');if(!keys.has(e.from)||!keys.has(e.to))fail('Edge endpoints must reference known node keys');return {from:e.from,to:e.to,label:text(e.label??'',500,'edge.label',true)}})
    const direction=data.direction??'LR';if(!['LR','TB'].includes(direction))fail('direction must be LR or TB')
    // Kahn layers; cyclic remainder occupies a deterministic final layer and is reported.
    const incoming=new Map(nodes.map(n=>[n.key,0])),outgoing=new Map(nodes.map(n=>[n.key,[]])),depth=new Map(nodes.map(n=>[n.key,0]))
    for(const e of edges){incoming.set(e.to,incoming.get(e.to)+1);outgoing.get(e.from).push(e.to)}
    const queue=nodes.filter(n=>incoming.get(n.key)===0).map(n=>n.key),visited=new Set()
    for(let i=0;i<queue.length;i++){const key=queue[i];visited.add(key);for(const to of outgoing.get(key)){depth.set(to,Math.max(depth.get(to),depth.get(key)+1));incoming.set(to,incoming.get(to)-1);if(incoming.get(to)===0)queue.push(to)}}
    const cyclic=nodes.filter(n=>!visited.has(n.key)).map(n=>n.key),last=Math.max(0,...depth.values())+1
    for(const key of cyclic)depth.set(key,last)
    return {nodes,edges,direction,depth,cyclic}
  }
  async function diagram(runtime,args) {
    const f=runtime.figma;writable(f);editor(f,'figjam');requireApi(f,['createShapeWithText','createConnector'])
    const graph=graphInput(args),pos=origin(f,args.origin),font={family:'Inter',style:'Regular'};await loadFont(f,font)
    const created=[],mapped=new Map(),layers=new Map()
    try{
      runtime.mutationEntered=true
      for(const spec of graph.nodes){const node=f.createShapeWithText();created.push(node.id);const layer=graph.depth.get(spec.key),row=layers.get(layer)||0;layers.set(layer,row+1);node.shapeType={process:'ROUNDED_RECTANGLE',decision:'DIAMOND',terminal:'ELLIPSE'}[spec.shape];node.resize(220,120);node.x=pos.x+(graph.direction==='LR'?layer*320:row*300);node.y=pos.y+(graph.direction==='LR'?row*200:layer*220);node.name=spec.key;node.text.fontName=font;node.text.fontSize=18;node.text.characters=spec.label;mapped.set(spec.key,node)}
      for(const spec of graph.edges){const edge=f.createConnector();created.push(edge.id);edge.name=spec.from+' → '+spec.to;edge.connectorStart={endpointNodeId:mapped.get(spec.from).id,magnet:'AUTO'};edge.connectorEnd={endpointNodeId:mapped.get(spec.to).id,magnet:'AUTO'};edge.connectorEndStrokeCap='ARROW_LINES';if(spec.label){edge.text.fontName=font;edge.text.characters=spec.label}}
      f.commitUndo?.();return {createdNodeIds:created,nodes:Object.fromEntries([...mapped].map(([k,v])=>[k,v.id])),nodeCount:graph.nodes.length,edgeCount:graph.edges.length,direction:graph.direction,warnings:graph.cyclic.length?[{code:'CYCLIC_LAYOUT',nodeKeys:graph.cyclic,message:'Cyclic remainder placed in a final layer; connectors remain attached.'}]:[]}
    }catch(e){writeFailure(e,created)}
  }
  async function deck(runtime,args) {
    const f=runtime.figma;writable(f);editor(f,'slides');requireApi(f,['createSlide','createText'])
    const slides=array(args.slides,30,'slides',1).map(s=>{object(s,'slide');return {title:text(s.title,300,'slide.title'),body:array(s.body??[],12,'slide.body').map(v=>text(v,1200,'slide.body item',true)),notes:text(s.notes??'',10000,'slide.notes',true)}})
    const theme=object(args.theme??{},'theme'),font={family:text(theme.fontFamily??'Inter',100,'fontFamily'),style:text(theme.fontStyle??'Regular',100,'fontStyle')}
    const colors={background:color(theme.background??'#FFFFFF'),text:color(theme.text??'#17202A'),accent:color(theme.accent??'#315BFF')},row=args.row===undefined?null:integer(args.row,0,1000,'row')
    let startColumn=0
    if(row!==null){requireApi(f,['getSlideGrid']);const grid=f.getSlideGrid();if(!Array.isArray(grid)||!Array.isArray(grid[row]))fail('row must reference an existing slide row');startColumn=grid[row].length}
    await loadFont(f,font);const created=[],ids=[],warnings=[]
    try{
      runtime.mutationEntered=true
      for(let i=0;i<slides.length;i++){
        const spec=slides[i],slide=row===null?f.createSlide():f.createSlide(row,startColumn+i);created.push(slide.id);ids.push(slide.id);slide.name=spec.title;slide.fills=[paint(colors.background)]
        // Cloud typings can expose notes before the local editor does. Never claim an absent native field was saved.
        if(typeof slide.speakerNotes==='string')slide.speakerNotes=spec.notes
        else if(spec.notes)warnings.push({code:'NOTES_UNAVAILABLE',slideId:slide.id,message:'This local editor does not expose native speakerNotes; supplied notes were not written.'})
        const width=slide.width,height=slide.height;if(!(width>0&&height>0))fail('Native slide has invalid dimensions')
        const margin=width*.06,contentWidth=width-margin*2
        const add=(name,chars,size,x,y,w,c)=>{const n=f.createText();created.push(n.id);slide.appendChild(n);n.name=name;n.fontName=font;n.fontSize=size;n.fills=[paint(c)];n.characters=chars;n.resize(w,Math.max(1,size*1.3));n.textAutoResize='HEIGHT';n.x=x;n.y=y;return n}
        const title=add('Title',spec.title,Math.max(24,width*.035),margin,height*.08,contentWidth,colors.text)
        const body=add('Body',spec.body.join('\n\n'),Math.max(16,width*.021),margin,Math.max(height*.25,title.y+title.height+24),contentWidth,colors.text)
        add('Page number',String(i+1),Math.max(12,width*.012),margin,height*.92,contentWidth,colors.accent)
        for(const n of [title,body])if(n.y+n.height>height*.89)warnings.push({code:'TEXT_OVERFLOW',slideId:slide.id,nodeId:n.id,bottom:n.y+n.height,availableBottom:height*.89})
      }
      f.commitUndo?.();return {createdNodeIds:created,slideIds:ids,slideCount:ids.length,warnings,requiresVisualReview:true}
    }catch(e){writeFailure(e,created)}
  }
  function shaderValue(value,definition) {
    const variable=v=>v&&typeof v==='object'&&v.type==='VARIABLE_ALIAS'&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=200
    if(variable(value))return
    const numeric=(keys)=>value&&typeof value==='object'&&keys.every(k=>typeof value[k]==='number'&&Number.isFinite(value[k]))
    const rgb=v=>variable(v)||v&&typeof v==='object'&&['r','g','b'].every(k=>typeof v[k]==='number'&&v[k]>=0&&v[k]<=1)&&(v.a===undefined||typeof v.a==='number'&&v.a>=0&&v.a<=1)
    let valid=false
    switch(definition.type){case 'BOOLEAN':valid=typeof value==='boolean';break;case 'TEXT':case 'IMAGE':case 'INSTANCE_SWAP':case 'SLOT':valid=typeof value==='string'&&value.length<=4000;break;case 'NUMBER':valid=typeof value==='number'&&Number.isFinite(value);break;case 'COLOR':valid=rgb(value);break;case 'POINT':valid=numeric(['x','y']);break;case 'LINE':valid=numeric(['x','y','x2','y2']);break;case 'CIRCLE':valid=numeric(['x','y','radius'])&&value.radius>=0;break;case 'CIRCLE_POINT':valid=numeric(['x','y','radius','angle'])&&value.radius>=0;break;case 'COLOR_POINT':valid=numeric(['x','y'])&&rgb(value.color);break;case 'GRADIENT':valid=Array.isArray(value?.stops)&&value.stops.length>0&&value.stops.length<=32&&value.stops.every(s=>Number.isFinite(s.position)&&s.position>=0&&s.position<=1&&rgb(s.color));break}
    if(!valid)fail('Invalid value for Shader property '+definition.name+' ('+definition.type+')')
  }
  async function shaders(runtime,method,args) {
    const f=runtime.figma
    if(method==='get_shaders'){
      requireApi(f,['listAvailableShaders']);const offset=integer(args.offset??0,0,100000,'offset'),limit=integer(args.limit??50,1,100,'limit')
      const ids=args.shaderIds===undefined?null:new Set(array(args.shaderIds,100,'shaderIds',1).map(x=>text(x,200,'shaderId')))
      const all=await f.listAvailableShaders();if(!Array.isArray(all))fail('Invalid shader catalog from editor')
      const selected=all.filter(s=>!ids||ids.has(s.id)),page=selected.slice(offset,offset+limit),rows=[];let total=0
      for(const s of page){const item={id:s.id,name:s.name,type:s.type,imported:s.imported,...(ids?{propertyDefinitions:s.propertyDefinitions??null}:{})};const size=bytes(item);if(total+size>65536)break;total+=size;rows.push(item)}
      if(page.length&&!rows.length)fail('Shader metadata exceeds budget; inspect selected definitions with use_figma')
      return {shaders:rows,pagination:{offset,returned:rows.length,total:selected.length,hasMore:offset+rows.length<selected.length,nextOffset:offset+rows.length<selected.length?offset+rows.length:null},scope:'Shaders available to this file; definitions are not source code'}
    }
    if(method==='list_file_shaders'){
      const root=args.nodeId?await runtime.node(args.nodeId):f.currentPage,max=integer(args.maxNodes??1000,1,10000,'maxNodes'),stack=[root],uses=[],errors=[];let visited=0
      while(stack.length&&visited<max){const n=stack.pop();visited++;for(const slot of ['fills','strokes','effects']){let values;try{values=n[slot]}catch{errors.push({nodeId:n.id,slot,reason:'unreadable'});continue}if(Array.isArray(values))for(let i=0;i<values.length;i++){const v=values[i];if(v.type==='SHADER')uses.push({nodeId:n.id,slot,index:i,shaderId:v.id,properties:v.properties??{}})}}if(n.children)for(let i=n.children.length-1;i>=0;i--)stack.push(n.children[i]);if(bytes(uses)>256000)fail('Shader usage result exceeds budget; select a smaller subtree')}
      return {uses,visitedNodes:visited,complete:stack.length===0&&errors.length===0,truncated:stack.length>0,errors,continuation:stack.length?{nodeIds:stack.slice(-100).reverse().map(n=>n.id),remainingRoots:stack.length,listedRoots:Math.min(100,stack.length),hint:'Read listed roots separately; choose a smaller subtree if remainingRoots exceeds listedRoots'}:null,scope:'Selected loaded subtree; no cloud shader source'}
    }
    writable(f);requireApi(f,['listAvailableShaders','importShaderById']);const node=await runtime.node(text(args.nodeId,200,'nodeId')),shaderId=text(args.shaderId,200,'shaderId'),slot=args.slot??'fills',props=object(args.properties??{},'properties')
    if(!['fills','strokes','effects'].includes(slot)||!(slot in node))fail('Target does not support the requested shader slot')
    if(bytes(props)>16000)fail('Shader properties exceed 16 KB')
    const current=node[slot];if(!Array.isArray(current))fail('Mixed or unsupported target slot')
    const index=integer(args.index??current.length,0,current.length,'index'),available=await f.listAvailableShaders(),found=available.find(s=>s.id===shaderId)
    if(!found)fail('Shader is not available in this file')
    if(found.type!==(slot==='effects'?'effect':'fill'))fail('Shader kind does not match slot')
    // Import is native file resource mutation. All subsequent errors must identify it for inspection.
    let imported=false,importAttempted=false,writeAttempted=false
    try{
      if(found.propertyDefinitions)for(const [key,value] of Object.entries(props)){if(forbidden.has(key)||!Object.hasOwn(found.propertyDefinitions,key))fail('Unknown shader property definition ID: '+key);shaderValue(value,found.propertyDefinitions[key])}
      importAttempted=!found.imported;if(importAttempted)runtime.mutationEntered=true;const shader=found.imported?found:await f.importShaderById(shaderId);imported=!found.imported
      const definitions=shader.propertyDefinitions;if(!definitions)fail('Shader definitions unavailable after import')
      for(const [key,value] of Object.entries(props)){if(forbidden.has(key)||!Object.hasOwn(definitions,key))fail('Unknown shader property definition ID: '+key);shaderValue(value,definitions[key])}
      const next=current.slice(),old=next[index],same=old?.type==='SHADER'&&old.id===shaderId
      const value={...(same?old:{}),type:'SHADER',id:shaderId,visible:same?old.visible!==false:true,properties:{...(same?old.properties:{}),...props}}
      next.splice(index,index<next.length?1:0,value);writeAttempted=true;runtime.mutationEntered=true;node[slot]=next;f.commitUndo?.()
      return {mutatedNodeIds:[node.id],shaderId,slot,index,importedResource:imported}
    }catch(e){if(importAttempted||writeAttempted){const out=new Error(String(e?.message||e)+(importAttempted?'; shader '+shaderId+(imported?' was imported':' import was attempted')+'. Inspect the file resource before retrying.':'')+(writeAttempted?'; target write attempted for node '+node.id+'. Inspect its '+slot+' before retrying.':''));out.safeToRetryWithoutCanvasRead=false;out.mutatedNodeIds=writeAttempted?[node.id]:[];out.importedShaderIds=imported?[shaderId]:[];throw out}throw e}
  }
  const cssKeys=new Set(['backgroundColor','color','fontFamily','fontStyle','fontSize','fontWeight','textAlign','lineHeight','opacity','borderRadius','borderColor','borderWidth','overflow','display','position','boxSizing'])
  const cssNumber=(v,min,max,key)=>number(typeof v==='string'&&/^-?[\d.]+px$/.test(v)?parseFloat(v):v,min,max,key)
  function prepareDom(snapshot) {
    object(snapshot,'snapshot');const width=number(snapshot.width,1,30000,'snapshot.width'),height=number(snapshot.height,1,30000,'snapshot.height'),warnings=[];let count=0,totalText=0
    function read(n,path){object(n,path);if(++count>500)fail('DOM snapshot exceeds 500 nodes');const b=object(n.bounds,path+'.bounds'),s=object(n.styles??{},path+'.styles');const bounds={x:number(b.x,-100000,100000,'x'),y:number(b.y,-100000,100000,'y'),width:number(b.width,.01,30000,'width'),height:number(b.height,.01,30000,'height')}
      const tag=text(n.tag??'div',100,'tag'),chars=n.text===undefined?null:text(n.text,20000,'text',true);totalText+=chars?.length??0;if(totalText>200000)fail('DOM snapshot text exceeds budget')
      const styles={};for(const [key,value]of Object.entries(s)){if(!cssKeys.has(key)){warnings.push({path,property:key,reason:'unsupported-style'});continue}styles[key]=value}
      for(const key of ['backgroundColor','color','borderColor'])if(styles[key]!==undefined)styles[key]=color(styles[key],key)
      for(const [key,min,max]of [['fontSize',1,1000],['opacity',0,1],['borderRadius',0,10000],['borderWidth',0,1000]])if(styles[key]!==undefined)styles[key]=cssNumber(styles[key],min,max,key)
      if(styles.lineHeight!==undefined&&styles.lineHeight!=='normal')styles.lineHeight=cssNumber(styles.lineHeight,1,3000,'lineHeight')
      if(styles.textAlign!==undefined&&!['left','center','right','justify'].includes(styles.textAlign))fail('Unsupported textAlign')
      for(const key of ['fontFamily','fontStyle'])if(styles[key]!==undefined)text(styles[key],100,key)
      if(styles.fontWeight!==undefined&&!['normal','400',400].includes(styles.fontWeight)&&!styles.fontStyle)warnings.push({path,property:'fontWeight',reason:'provide-exact-fontStyle-to-preserve-weight'})
      if(['img','video','canvas','iframe','svg'].includes(tag.toLowerCase()))warnings.push({path,tag,reason:'asset-not-imported; box-only'})
      return {name:text(n.key??tag,200,'node key'),tag,bounds,styles,text:chars,children:array(n.children??[],500,'children').map((c,i)=>read(c,path+'.children['+i+']'))}
    }
    return {width,height,name:text(snapshot.name??'DOM snapshot',200,'snapshot.name'),children:array(snapshot.children,500,'children').map((n,i)=>read(n,'children['+i+']')),warnings,count}
  }
  async function dom(runtime,args){
    const f=runtime.figma;writable(f);editor(f,'figma');requireApi(f,['createFrame','createText']);const data=prepareDom(args.snapshot),pos=origin(f,args.origin),fonts=new Map(),resolved=new Map(),warnings=data.warnings.slice(),fontPolicy=args.fontPolicy??'fallback'
    if(!['strict','fallback'].includes(fontPolicy))fail('fontPolicy must be strict or fallback')
    const collect=n=>{if(n.text!==null){const font={family:n.styles.fontFamily??'Inter',style:n.styles.fontStyle??'Regular'};fonts.set(JSON.stringify(font),font)}n.children.forEach(collect)};data.children.forEach(collect);for(const [key,font] of fonts){try{await loadFont(f,font);resolved.set(key,font)}catch(error){if(fontPolicy==='strict')throw error;const fallback={family:'Inter',style:'Regular'};await loadFont(f,fallback);resolved.set(key,fallback);warnings.push({reason:'font-substituted',requested:font,used:fallback})}}
    const created=[]
    try{runtime.mutationEntered=true;const root=f.createFrame();created.push(root.id);root.name=data.name;root.resize(data.width,data.height);root.x=pos.x;root.y=pos.y;root.fills=[]
      function build(spec,parent){const n=f.createFrame();created.push(n.id);parent.appendChild(n);n.name=spec.name;n.resize(spec.bounds.width,spec.bounds.height);n.x=spec.bounds.x;n.y=spec.bounds.y;const s=spec.styles;n.fills=s.backgroundColor?[paint(s.backgroundColor)]:[];if(s.opacity!==undefined)n.opacity=s.opacity;if(s.borderRadius!==undefined)n.cornerRadius=s.borderRadius;if(s.borderWidth>0){n.strokeWeight=s.borderWidth;n.strokeAlign='INSIDE';n.strokes=[paint(s.borderColor??color('#000000'))]}n.clipsContent=s.overflow==='hidden'||s.overflow==='clip';if(s.display==='none')n.visible=false
        if(spec.text!==null){const t=f.createText();created.push(t.id);n.appendChild(t);t.name='Text';t.fontName=resolved.get(JSON.stringify({family:s.fontFamily??'Inter',style:s.fontStyle??'Regular'}));t.fontSize=s.fontSize??16;t.characters=spec.text;t.fills=[paint(s.color??color('#000000'))];t.textAlignHorizontal=({left:'LEFT',center:'CENTER',right:'RIGHT',justify:'JUSTIFIED'})[s.textAlign??'left'];if(typeof s.lineHeight==='number')t.lineHeight={unit:'PIXELS',value:s.lineHeight};t.resize(spec.bounds.width,Math.max(1,t.fontSize));t.textAutoResize='HEIGHT';t.x=0;t.y=0;if(t.height>spec.bounds.height+1)warnings.push({nodeId:t.id,reason:'text-overflow',textHeight:t.height,boxHeight:spec.bounds.height})}
        spec.children.forEach(c=>build(c,n))
      }data.children.forEach(n=>build(n,root));f.commitUndo?.();return {createdNodeIds:created,rootNodeId:root.id,inputNodeCount:data.count,warnings,layoutContract:'Fixed measured boxes; bounds are relative to the parent. Editable layers, not responsive CSS or executable Code Layers.',requiresVisualReview:true}
    }catch(e){writeFailure(e,created)}
  }
  scope.DshFigmaAuthoring={async execute(runtime,method,args={}){if(!METHODS.has(method))return null;object(args,'arguments');let value;if(method==='generate_diagram')value=await diagram(runtime,args);else if(method==='generate_deck')value=await deck(runtime,args);else if(method==='import_dom_snapshot')value=await dom(runtime,args);else value=await shaders(runtime,method,args);return {value,images:[]}},parseMermaid:mermaid}
})(globalThis)

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

/* One lightweight, file-owned reference. No scans, images or source copies on disk. */
;(function(scope){
  const KEY='dsh.design-reference.v1'
  const FRAME_TYPES=new Set(['FRAME','COMPONENT','COMPONENT_SET','SECTION','GROUP'])
  function stored(figma){
    const raw=figma.root.getPluginData(KEY)
    if(!raw)return null
    try{const value=JSON.parse(raw);if(value.version===1&&['frame','spec'].includes(value.kind)&&typeof value.name==='string')return value}catch{}
    return {version:1,kind:'spec',name:'无法读取的设计参考',state:'invalid'}
  }
  function summary(value){
    if(!value)return null
    const result={kind:value.kind,name:value.name,state:value.state||'bound'}
    for(const key of ['nodeId','pageId','revision'])if(typeof value[key]==='string')result[key]=value[key]
    return result
  }
  async function read(figma){
    const value=stored(figma)
    if(!value||!value.nodeId)return value
    const node=await figma.getNodeByIdAsync(value.nodeId)
    if(!node||node.removed)return {...value,state:'missing'}
    let page=node.parent;while(page&&page.type!=='PAGE')page=page.parent
    return {...value,name:node.name,pageId:page?.id,state:'bound'}
  }
  async function execute(runtime,method,args={}){
    if(!['get_design_reference','set_design_reference','clear_design_reference'].includes(method))return null
    const f=runtime.figma,images=[]
    let reference
    if(method==='set_design_reference'){
      const kind=args.kind||'frame'
      if(!['frame','spec'].includes(kind))throw Error('请选择画板或规范引用。')
      let node=null
      if(args.nodeId)node=await f.getNodeByIdAsync(args.nodeId)
      else if(kind==='frame'){
        if(f.currentPage.selection.length!==1)throw Error('请先选中一个参考画板，再点击绑定。')
        node=f.currentPage.selection[0]
      }
      if((args.nodeId&&!node)||node?.removed)throw Error('参考对象不存在，请重新选择。')
      if(kind==='frame'&&(!node||!FRAME_TYPES.has(node.type)))throw Error('请选择画板、组件、分区或组作为参考。')
      if(kind==='spec'&&node&&!FRAME_TYPES.has(node.type)&&node.type!=='TEXT')throw Error('请选择规范画板或文字作为引用。')
      const name=node?node.name:args.name
      if(typeof name!=='string'||!name.trim()||name.length>500)throw Error('请提供 1–500 字的参考名称。')
      if(args.content!==undefined&&(typeof args.content!=='string'||args.content.length>10000))throw Error('规范内容最多 10000 字。')
      if(kind==='spec'&&!node&&(!args.content||!args.content.trim()))throw Error('名称引用需要规范内容；也可以绑定已有规范的 nodeId。')
      reference={version:1,kind,name,revision:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),...(node?{nodeId:node.id}:{}),...(kind==='spec'&&!node?{content:args.content}:{})}
      runtime.mutationEntered=true
      f.root.setPluginData(KEY,JSON.stringify(reference))
      reference=await read(f)
    }else if(method==='clear_design_reference'){
      runtime.mutationEntered=true;f.root.setPluginData(KEY,'');reference=null
    }else reference=await read(f)
    let previewError
    if(args.includePreview===true&&reference?.kind==='frame'&&reference.state==='bound'){
      try{images.push(await runtime.screenshot(await f.getNodeByIdAsync(reference.nodeId),{maxDimension:160}))}
      catch{previewError='缩略图暂时无法读取，参考绑定仍然有效。'}
    }
    return {value:{reference,...(previewError?{previewError}:{})},images}
  }
  async function locate(figma){
    const reference=await read(figma)
    if(!reference?.nodeId||reference.state!=='bound')throw Error('参考对象不存在，或没有可定位的画板。')
    const node=await figma.getNodeByIdAsync(reference.nodeId),page=await figma.getNodeByIdAsync(reference.pageId)
    if(figma.currentPage.id!==page.id)await figma.setCurrentPageAsync(page)
    figma.currentPage.selection=[node];figma.viewport.scrollAndZoomIntoView([node])
  }
  scope.DshFigmaReference={stored,summary,read,execute,locate}
})(globalThis)

/* Feather 4.29.2, MIT, Copyright 2013–2023 Cole Bemis. See assets/companion/FEATHER-LICENSE. */
;(function(scope){
const paths={"search": "<circle cx=\"11\" cy=\"11\" r=\"8\"></circle><line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line>", "home": "<path d=\"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"></path><polyline points=\"9 22 9 12 15 12 15 22\"></polyline>", "menu": "<line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"></line><line x1=\"3\" y1=\"6\" x2=\"21\" y2=\"6\"></line><line x1=\"3\" y1=\"18\" x2=\"21\" y2=\"18\"></line>", "x": "<line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>", "check": "<polyline points=\"20 6 9 17 4 12\"></polyline>", "plus": "<line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"></line><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>", "minus": "<line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>", "chevron-up": "<polyline points=\"18 15 12 9 6 15\"></polyline>", "chevron-down": "<polyline points=\"6 9 12 15 18 9\"></polyline>", "chevron-left": "<polyline points=\"15 18 9 12 15 6\"></polyline>", "chevron-right": "<polyline points=\"9 18 15 12 9 6\"></polyline>", "arrow-left": "<line x1=\"19\" y1=\"12\" x2=\"5\" y2=\"12\"></line><polyline points=\"12 19 5 12 12 5\"></polyline>", "arrow-right": "<line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line><polyline points=\"12 5 19 12 12 19\"></polyline>", "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z\"></path>", "user": "<path d=\"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\"></path><circle cx=\"12\" cy=\"7\" r=\"4\"></circle>", "calendar": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect><line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"></line><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"></line><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"></line>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><polyline points=\"12 6 12 12 16 14\"></polyline>", "play": "<polygon points=\"5 3 19 12 5 21 5 3\"></polygon>", "pause": "<rect x=\"6\" y=\"4\" width=\"4\" height=\"16\"></rect><rect x=\"14\" y=\"4\" width=\"4\" height=\"16\"></rect>", "heart": "<path d=\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z\"></path>", "bell": "<path d=\"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9\"></path><path d=\"M13.73 21a2 2 0 0 1-3.46 0\"></path>", "more-horizontal": "<circle cx=\"12\" cy=\"12\" r=\"1\"></circle><circle cx=\"19\" cy=\"12\" r=\"1\"></circle><circle cx=\"5\" cy=\"12\" r=\"1\"></circle>", "file": "<path d=\"M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z\"></path><polyline points=\"13 2 13 9 20 9\"></polyline>", "folder": "<path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"></path>", "trash-2": "<polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path><line x1=\"10\" y1=\"11\" x2=\"10\" y2=\"17\"></line><line x1=\"14\" y1=\"11\" x2=\"14\" y2=\"17\"></line>", "copy": "<rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"></rect><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"></path>", "download": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"7 10 12 15 17 10\"></polyline><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>"};
scope.DshFigmaIcons={names:Object.keys(paths),create(figma,name,options={}){
if(!Object.hasOwn(paths,name))throw Error("Unknown icon. Available: "+Object.keys(paths).join(", "));
const size=options.size??24,color=options.color??"#000000",stroke=options.strokeWidth??2;
if(!Number.isFinite(size)||size<1||size>1024||!/^#[0-9a-f]{6}$/i.test(color)||!Number.isFinite(stroke)||stroke<=0||stroke>8)throw Error("Icon requires size 1–1024, six-digit hex color and strokeWidth (0,8]");
const node=figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`);node.name="Icon / "+name;return node;
}}})(globalThis);

/* MIT — local, opt-in authoring verification. */
;(function(scope){
 const families={sans:['Inter','Arial','Roboto','Helvetica Neue'],serif:['Georgia','Times New Roman','Noto Serif'],mono:['SF Mono','Cascadia Mono','Menlo','Consolas','Roboto Mono','Courier New'],cjk:['PingFang SC','Microsoft YaHei','Noto Sans SC','Source Han Sans SC']}
 const aliases={'sf pro':['Inter','Helvetica Neue','Arial'],'sf pro display':['Inter','Helvetica Neue'],'sf pro text':['Inter','Helvetica Neue'],'sf pro rounded':['SF Pro Rounded','Inter'],'sf mono':families.mono}
 const lower=x=>String(x??'').toLowerCase(),round=x=>Math.round(x*100)/100
 async function resolveFonts(runtime,args){
  if(!Array.isArray(args.specs)||!args.specs.length||args.specs.length>50)throw Error('Provide 1–50 font specs')
  if(args.forceRefresh||!runtime.fontCache||runtime.fontCache.expires<Date.now())runtime.fontCache={fonts:await runtime.figma.listAvailableFontsAsync(),expires:Date.now()+60000}
  const available=runtime.fontCache.fonts.map(x=>x.fontName),resolved=[],missing=[]
  for(const want of args.specs){
   if(!want.family&&!families[want.semantic])throw Error('Each font needs a family or semantic class')
   const requested=want.style||'Regular',candidates=[want.family,...(args.allowFallback===false?[]:[...(want.fallbacks??[]),...(aliases[lower(want.family)]??[]),...(families[want.semantic]??families.sans)])].filter(Boolean)
   let got
   for(const family of candidates){got=available.find(n=>lower(n.family)===lower(family)&&lower(n.style)===lower(requested));if(got)break}
   if(!got&&args.allowFallback!==false)for(const family of candidates){got=available.find(n=>lower(n.family)===lower(family)&&['regular','normal','book','roman'].includes(lower(n.style)));if(got)break}
   if(got)resolved.push({want,got,fallback:lower(got.family)!==lower(want.family)||lower(got.style)!==lower(requested),familyFallback:!!want.family&&lower(got.family)!==lower(want.family),styleFallback:lower(got.style)!==lower(requested)})
   else missing.push({want,reason:'No available matching family/style or allowed fallback'})
  }
  return {resolved,missing,glyphCoverage:'unverified',cacheExpiresAt:runtime.fontCache.expires}
 }
 async function compare(runtime,args){
  const node=await runtime.node(args.nodeId),bounds=node.absoluteBoundingBox
  if(!bounds||node.rotation)throw Error('Compare requires an unrotated scene node with absolute bounds')
  const mappings=[]
  for(const region of args.regions??[]){
   const child=await runtime.node(region.nodeId);let parent=child
   while(parent&&parent.id!==node.id)parent=parent.parent
   if(!parent||!child.absoluteBoundingBox)throw Error('Comparison regions must map to descendants of the target')
   const b=child.absoluteBoundingBox
   mappings.push({name:region.name,nodeId:child.id,referenceBounds:region.referenceBounds,actualBounds:{x:round(b.x-bounds.x),y:round(b.y-bounds.y),width:round(b.width),height:round(b.height)},layoutMode:child.parent?.layoutMode??'NONE'})
  }
  const image=await runtime.screenshot(node,{maxDimension:args.maxDimension??1200,contentsOnly:true})
  return {value:{nodeId:node.id,width:node.width,height:node.height,regions:mappings},images:[image]}
 }
 scope.DshFigmaQuality={resolveFonts,async execute(runtime,method,args){
  if(method==='resolve_fonts')return {value:await resolveFonts(runtime,args),images:[]}
  if(method==='compare')return compare(runtime,args)
  if(method==='rollback')return {value:await scope.DshFigmaRecovery.rollback(runtime,args.operationId),images:[]}
  return null
 }}
})(globalThis)

/* MIT — bounded, explicit cleanup; never a general transaction/Undo. */
;(function(scope){
 const disposable=new Set(['FRAME','GROUP','SECTION','TEXT','RECTANGLE','ELLIPSE','LINE','VECTOR','POLYGON','STAR','BOOLEAN_OPERATION'])
 const reads=new Set(['resolve_fonts','compare','get_selection','list_fonts','get_metadata','get_screenshot','get_design_context','get_figjam','get_variable_defs','get_libraries','search_design_system','get_component_context','get_local_component_links','get_capabilities','get_motion_context','download_assets','get_design_reference'])
 const descendants=node=>{const out=[],visit=n=>{if(out.length>1500)throw Error('Cleanup subtree exceeds 1500 nodes');out.push(n);for(const c of n.children??[])visit(c)};visit(node);return out}
 function discard(runtime){for(const record of runtime.cleanupRecords?.values()??[])record.dispose?.();runtime.cleanupRecords?.clear()}
 function before(runtime,method,args,operationId){
  if(runtime.cleanupRecords?.size&&method!=='rollback'&&!reads.has(method)&&!(method==='use_figma'&&args.readOnly))discard(runtime)
  runtime.creationReceipt=null
  if(method!=='use_figma'||!args.trackCreated)return
  if(args.readOnly)throw Error('trackCreated is incompatible with readOnly')
  const page=runtime.figma.currentPage,record={operationId,pageId:page.id,ids:new Set(),roots:[],dirty:false,expires:Date.now()+600000,coverage:'observed node factories only; existing edits/variables are not undone'}
  const change=()=>{if(record.sealed)record.dirty=true},pageChange=()=>{record.dirty=true}
  if(typeof page.on!=='function'||typeof page.off!=='function'||typeof runtime.figma.on!=='function'||typeof runtime.figma.off!=='function')record.unavailable='Editor lacks scoped change observation'
  else{page.on('nodechange',change);runtime.figma.on('currentpagechange',pageChange);record.dispose=()=>{try{page.off('nodechange',change)}catch{}try{runtime.figma.off('currentpagechange',pageChange)}catch{}if(record.timer)clearTimeout(record.timer)}}
  runtime.creationReceipt=record
 }
 function created(runtime,node){
  const r=runtime.creationReceipt;if(!r||!node?.id)return
  try{for(const n of descendants(node)){if(r.ids.size>=1500){r.unavailable='Created-node budget exceeded';break}r.ids.add(n.id)}}catch{r.unavailable='Created subtree too large'}
 }
 async function fingerprint(node){
  const raw=await node.exportAsync({format:'JSON_REST_V1'})
  if(!raw?.document||raw.document.id!==node.id)throw Error('Native JSON snapshot unavailable')
  const text=JSON.stringify({parent:node.parent?.id,document:raw.document})
  if(text.length>2000000)throw Error('Cleanup snapshot exceeds 2 MiB')
  return text
 }
 async function failed(runtime){
  const r=runtime.creationReceipt;if(!r)return null
  r.sealed=true
  const candidates=[]
  for(const id of r.ids){const node=await runtime.figma.getNodeByIdAsync(id);if(node&&!node.removed&&!r.ids.has(node.parent?.id))candidates.push(node)}
  let bytes=0
  for(const node of candidates){
   try{
    const children=descendants(node)
    if(children.some(n=>!r.ids.has(n.id)||!disposable.has(n.type)))throw Error('Subtree contains existing/untracked or dependency-bearing nodes')
    const snapshot=await fingerprint(node);bytes+=snapshot.length;if(bytes>4000000)throw Error('Cleanup receipt exceeds 4 MiB')
    r.roots.push({id:node.id,snapshot,ids:children.map(n=>n.id)})
   }catch(error){r.roots.push({id:node.id,reason:error.message})}
  }
  if(!r.operationId||r.unavailable||r.dirty){r.dispose?.();return {available:false,reason:r.unavailable??'Canvas changed or operation identity unavailable',createdNodeIds:[...r.ids]}}
  runtime.cleanupRecords??=new Map();while(runtime.cleanupRecords.size>=10){const key=runtime.cleanupRecords.keys().next().value;runtime.cleanupRecords.get(key).dispose?.();runtime.cleanupRecords.delete(key)}
  runtime.cleanupRecords.set(r.operationId,r)
  r.timer=setTimeout(()=>{r.dispose?.();runtime.cleanupRecords.delete(r.operationId)},600000);r.timer?.unref?.()
  return {available:true,operationId:r.operationId,createdNodeIds:[...r.ids],expiresAt:r.expires,coverage:r.coverage,reconcile:{tool:'rollback',args:{operationId:r.operationId}}}
 }
 async function rollback(runtime,operationId){
  const r=runtime.cleanupRecords?.get(operationId)
  if(!r)throw Object.assign(Error('Cleanup receipt unavailable or invalidated by a subsequent write; inspect the affected nodes'),{safeToRetryWithoutCanvasRead:true})
  const removed=[],skipped=[]
  for(const entry of r.roots){
   const node=await runtime.figma.getNodeByIdAsync(entry.id)
   if(!node||node.removed){skipped.push({nodeId:entry.id,reason:'already-absent'});continue}
   let reason=r.dirty?'intervening-canvas-edit':Date.now()>r.expires?'receipt-expired':runtime.figma.currentPage.id!==r.pageId?'page-changed':entry.reason
   if(!reason){try{if(await fingerprint(node)!==entry.snapshot)reason='subtree-modified';else if(descendants(node).some(n=>!r.ids.has(n.id)||!disposable.has(n.type)))reason='untracked-or-dependent-descendant'}catch{reason='snapshot-unavailable'}}
   if(r.dirty)reason='intervening-canvas-edit'
   if(reason){skipped.push({nodeId:entry.id,reason});continue}
   // Removing a verified root removes only the verified descendants atomically in Figma.
   runtime.mutationEntered=true;node.remove();removed.push(...entry.ids)
  }
  r.dispose?.();runtime.cleanupRecords.delete(operationId)
  return {operationId,removed,skipped,scope:'created disposable subtrees only',existingEditsRestored:false,requiresInspection:true,reconcile:{tool:'get_metadata',args:{nodeId:r.pageId,profile:'full',depth:10},hint:'Also inspect any variables or other resources changed by the original script.'}}
 }
 scope.DshFigmaRecovery={before,created,failed,rollback,success(runtime){runtime.creationReceipt?.dispose?.()},discard}
})(globalThis)

/* MIT — read-only scripts are interpreted, never passed to Function/eval. */
;(function(scope){
 const denied=new Set(['constructor','prototype','__proto__','caller','callee','arguments','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__'])
 const nativeReads=new Set(['getNodeByIdAsync','getLocalPaintStylesAsync','getLocalTextStylesAsync','getLocalEffectStylesAsync','getLocalGridStylesAsync','listAvailableFontsAsync','getLocalVariablesAsync','getLocalVariableCollectionsAsync','getVariableByIdAsync','getVariableCollectionByIdAsync','getCSSAsync','getMainComponentAsync','getPluginData','getPluginDataKeys','getSharedPluginData','getSharedPluginDataKeys','getRangeFontName','getRangeFontSize','getStyledTextSegments','getAvailableLibraryVariableCollectionsAsync'])
 function readonlyFacade(figma){
  const cache=new WeakMap()
  const wrap=value=>{
   if(!value||typeof value!=='object')return value
   if(Array.isArray(value))return value.map(wrap)
   if(cache.has(value))return cache.get(value)
   const proxy=new Proxy({}, {get(_,key){
    if(denied.has(key))throw Error('Restricted property in readOnly script')
    const v=value[key]
    if(typeof v==='function'){
     if(!nativeReads.has(key))throw Error('Native method '+String(key)+' is unavailable in readOnly mode')
     return async(...args)=>wrap(await v.apply(value,args))
    }
    return wrap(v)
   },has(_,key){return !denied.has(key)&&key in value},ownKeys(){return Object.keys(value).filter(k=>!denied.has(k)&&typeof value[k]!=='function')},getOwnPropertyDescriptor(){return {configurable:true,enumerable:true}},set(){throw Error('Canvas writes are forbidden in readOnly mode')},defineProperty(){throw Error('Canvas writes are forbidden in readOnly mode')},deleteProperty(){throw Error('Canvas writes are forbidden in readOnly mode')}})
   cache.set(value,proxy);return proxy
  }
  return wrap(figma)
 }
 async function execute(figma,program){
  if(program?.type!=='Program')throw Error('Missing validated read-only program; update both host and companion')
  const funcs=new WeakSet(),maxSteps=100000;let steps=0
  const globals=Object.assign(Object.create(null),{figma:readonlyFacade(figma),undefined,NaN,Infinity,Math:Object.fromEntries(Object.getOwnPropertyNames(Math).filter(k=>!denied.has(k)).map(k=>[k,Math[k]])),JSON:{parse:JSON.parse,stringify:JSON.stringify},Object:{keys:Object.keys,values:Object.values,entries:Object.entries,fromEntries:Object.fromEntries},Array:{isArray:Array.isArray},Number:{isFinite:Number.isFinite,isInteger:Number.isInteger},String:v=>String(v),Boolean:v=>Boolean(v),Error:message=>Error(message)})
  const env=(parent)=>({values:Object.create(null),parent}),root=env(null);Object.assign(root.values,globals)
  const find=(e,key)=>Object.hasOwn(e.values,key)?e:e.parent?find(e.parent,key):null
  const read=(e,key)=>{const owner=find(e,key);if(!owner)throw Error('Unknown identifier in readOnly script: '+key);return owner.values[key]}
  const write=(e,key,value)=>{const owner=find(e,key);if(!owner||owner===root)throw Error('Cannot assign a global in readOnly script');owner.values[key]=value;return value}
  const keyOf=async(n,e)=>n.computed?await value(n.property,e):n.property.name
  const get=(object,key)=>{if(denied.has(String(key))||typeof key!=='string'&&typeof key!=='number')throw Error('Restricted property in readOnly script');if(funcs.has(object))throw Error('Functions are opaque in readOnly scripts');if(object==null)throw Error('Cannot read '+String(key)+' of '+object);return object[key]}
  async function invoke(fn,args){
   if(funcs.has(fn)){const e=env(fn.env);fn.node.params.forEach((p,i)=>e.values[p.name]=args[i]);if(fn.node.body.type==='BlockStatement'){const r=await block(fn.node.body.body,e);return r?.kind==='return'?r.value:undefined}return value(fn.node.body,e)}
   if(typeof fn!=='function')throw Error('Value is not callable in readOnly script')
   return fn(...args)
  }
  async function value(n,e){
   if(++steps>maxSteps)throw Error('readOnly script exceeded 100000 interpreter steps')
   if(!n)return undefined
   switch(n.type){
    case 'Literal':return n.value
    case 'Identifier':return read(e,n.name)
    case 'ChainExpression':case 'AwaitExpression':return value(n.expression??n.argument,e)
    case 'MemberExpression':{const object=await value(n.object,e);return n.optional&&object==null?undefined:get(object,await keyOf(n,e))}
    case 'ArrayExpression':{const a=[];for(const item of n.elements)a.push(await value(item,e));return a}
    case 'ObjectExpression':{const o=Object.create(null);for(const p of n.properties){const k=p.computed?await value(p.key,e):p.key.name??p.key.value;if(denied.has(String(k)))throw Error('Restricted object key');o[k]=await value(p.value,e)}return o}
    case 'ArrowFunctionExpression':case 'FunctionExpression':{const f={node:n,env:e};funcs.add(f);return f}
    case 'ConditionalExpression':return await value(n.test,e)?value(n.consequent,e):value(n.alternate,e)
    case 'LogicalExpression':{const a=await value(n.left,e);return n.operator==='&&'?(a?value(n.right,e):a):n.operator==='||'?(a?a:value(n.right,e)):(a??await value(n.right,e))}
    case 'UnaryExpression':{const a=await value(n.argument,e);if(n.operator==='!')return !a;if(n.operator==='-')return -a;if(n.operator==='+')return +a;if(n.operator==='typeof')return typeof a;if(n.operator==='void')return undefined;throw Error('Unsupported unary operator')}
    case 'BinaryExpression':{const a=await value(n.left,e),b=await value(n.right,e);switch(n.operator){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '**':return a**b;case '===':return a===b;case '!==':return a!==b;case '==':return a==b;case '!=':return a!=b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;case 'in':return a in b;default:throw Error('Unsupported binary operator')}}
    case 'AssignmentExpression':return write(e,n.left.name,await value(n.right,e))
    case 'UpdateExpression':{const old=read(e,n.argument.name),next=n.operator==='++'?old+1:old-1;write(e,n.argument.name,next);return n.prefix?next:old}
    case 'TemplateLiteral':{let out=n.quasis[0].value.cooked;for(let i=0;i<n.expressions.length;i++)out+=String(await value(n.expressions[i],e))+n.quasis[i+1].value.cooked;return out}
    case 'NewExpression':return Error(await value(n.arguments[0],e))
    case 'CallExpression':{
     const args=[];for(const arg of n.arguments)args.push(await value(arg,e))
     if(n.callee.type==='MemberExpression'){
      const receiver=await value(n.callee.object,e),key=await keyOf(n.callee,e);if(n.callee.optional&&receiver==null)return undefined
      if(Array.isArray(receiver)&&['map','filter','find','some','every','forEach','reduce'].includes(key)){
       const output=[];let accumulator=args[1],start=0;if(key==='reduce'&&args.length<2){if(!receiver.length)throw Error('Reduce of empty array');accumulator=receiver[0];start=1}
       for(let i=start;i<receiver.length;i++){const r=await invoke(args[0],key==='reduce'?[accumulator,receiver[i],i]:[receiver[i],i]);if(key==='map')output.push(r);if(key==='filter'&&r)output.push(receiver[i]);if(key==='find'&&r)return receiver[i];if(key==='some'&&r)return true;if(key==='every'&&!r)return false;if(key==='reduce')accumulator=r}
       return key==='reduce'?accumulator:key==='some'?false:key==='every'?true:['find','forEach'].includes(key)?undefined:output
      }
      const method=get(receiver,key);if(typeof method!=='function')return invoke(method,args)
      return method.apply(receiver,args)
     }
     return invoke(await value(n.callee,e),args)
    }
    default:throw Error('Unsupported readOnly expression: '+n.type)
   }
  }
  async function statement(n,e){
   if(++steps>maxSteps)throw Error('readOnly script exceeded 100000 interpreter steps')
   switch(n.type){
    case 'EmptyStatement':return
    case 'BlockStatement':return block(n.body,env(e))
    case 'ExpressionStatement':await value(n.expression,e);return
    case 'VariableDeclaration':for(const d of n.declarations)e.values[d.id.name]=await value(d.init,e);return
    case 'FunctionDeclaration':{const f={node:n,env:e};funcs.add(f);e.values[n.id.name]=f;return}
    case 'ReturnStatement':return {kind:'return',value:await value(n.argument,e)}
    case 'ThrowStatement':throw await value(n.argument,e)
    case 'BreakStatement':return {kind:'break'}
    case 'ContinueStatement':return {kind:'continue'}
    case 'IfStatement':return await value(n.test,e)?statement(n.consequent,e):n.alternate?statement(n.alternate,e):undefined
    case 'ForOfStatement':{
     const items=await value(n.right,e);if(!Array.isArray(items)&&typeof items!=='string')throw Error('readOnly for-of requires an array or string')
     for(const item of items){const local=env(e);if(n.left.type==='VariableDeclaration')local.values[n.left.declarations[0].id.name]=item;else write(e,n.left.name,item);const r=await statement(n.body,local);if(r?.kind==='return')return r;if(r?.kind==='break')break}return
    }
    case 'ForStatement':case 'WhileStatement':{const local=env(e);if(n.init){if(n.init.type==='VariableDeclaration')await statement(n.init,local);else await value(n.init,local)}while(!n.test||await value(n.test,local)){const r=await statement(n.body,local);if(r?.kind==='return')return r;if(r?.kind==='break')break;if(n.update)await value(n.update,local)}return}
    default:throw Error('Unsupported readOnly statement: '+n.type)
   }
  }
  async function block(nodes,e){for(const n of nodes){const r=await statement(n,e);if(r)return r}}
  return (await block(program.body,env(root)))?.value
 }
 scope.DshFigmaReadonly={execute}
})(globalThis)

/* MIT — Copyright (c) 2026 Duoasa. Runs inside the Figma plugin sandbox only. */
;(function (scope) {
  const MAX_NODES = 1500
  const summaryFields = ['id','name','type','visible','locked','x','y','width','height','rotation']
  const now = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
  const bytesOf = text => { if(/^[\x00-\x7f]*$/.test(text))return text.length;let size=0; for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)size++;else if(c<2048)size+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){size+=4;i++}else size+=3};return size }
  const integer = (value, fallback, min, max, name) => { const n=value??fallback;if(!Number.isInteger(n)||n<min||n>max)throw new Error(name+' must be an integer from '+min+' to '+max);return n }
  const textFilter = (value,name) => { if(value!==undefined&&typeof value!=='string')throw new Error(name+' must be a string');return (value||'').toLowerCase() }
  const idFilter = (value,name) => { if(value===undefined)return null;if(!Array.isArray(value)||!value.length||value.length>200||value.some(id=>typeof id!=='string'||!id))throw new Error(name+' must contain 1–200 IDs');return new Set(value) }
  const pageOf = (items,args={}) => { const offset=integer(args.offset,0,0,1000000,'offset'),limit=integer(args.limit,50,1,200,'limit'),selected=items.slice(offset,offset+limit);return {items:selected,pagination:{offset,limit,returned:selected.length,total:items.length,hasMore:offset+selected.length<items.length,nextOffset:offset+selected.length<items.length?offset+selected.length:null}} }
  const opted = (args,keys) => keys.some(key=>args[key]!==undefined)

  const fields = ['id','name','type','visible','locked','x','y','width','height','rotation','opacity','blendMode','fills','strokes','strokeWeight','strokeAlign','effects','cornerRadius','layoutMode','layoutWrap','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutSizingHorizontal','layoutSizingVertical','itemSpacing','counterAxisSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','clipsContent','characters','fontName','fontSize','fontWeight','textAlignHorizontal','textAlignVertical','textAutoResize','lineHeight','letterSpacing','boundVariables','componentProperties','componentPropertyDefinitions','variantProperties','reactions']
  const jsonValue = value => value === undefined || typeof value === 'symbol' ? undefined : JSON.parse(JSON.stringify(value))
  class Runtime {
    constructor(figma, {onProgress = () => {}} = {}) { this.figma = figma; this.metrics = null; this.readOptions = {}; this.onProgress = onProgress }
    collectionCapability(collection){
      const entry=this.modeLimits?.get(collection.id),valid=entry&&entry.expiresAt>Date.now()&&entry.count===collection.modes.length
      if(entry&&!valid)this.modeLimits.delete(collection.id)
      return {modesAllowed:valid?entry.limit:null,canCreateVariable:collection.remote?'unavailable':'unknown',modeLimitSource:valid?'observed-native-error':'unknown',...(valid?{modeLimitExpiresAt:entry.expiresAt}:{})}
    }
    recordWrite(entry){if(!this.writeJournal)return;if(this.writeJournal.entries.length<1000)this.writeJournal.entries.push(entry);else this.writeJournal.truncated=true}
    async node(id) {
      const node = id ? await this.figma.getNodeByIdAsync(id.replace(/^(\d+)-(\d+)$/, '$1:$2')) : this.figma.currentPage.selection[0]
      if (!node) throw new Error('Select a node in Figma or provide an existing nodeId')
      return node
    }
    codeLayerInfo(node) {
      if(node.type!=='CODE_INSTANCE')return null
      return {opaque:true,codeLayer:{source:'unavailable',children:'unavailable',export:typeof node.exportAsync==='function'?'exposed-unverified':'unavailable'}}
    }
    snapshot(node, depth, budget, root = true) {
      const options=this.readOptions
      budget ||= this.snapshotBudget ||= {count:0,bytes:0,maxNodes:options.maxNodes??MAX_NODES,maxBytes:options.maxBytes??Infinity}
      const result={},reserved=320
      if(++budget.count>budget.maxNodes)return {id:node.id,truncated:true,reason:'maxNodes',continuation:{nodeId:node.id,depth}}
      if(this.metrics)this.metrics.nodeCount++
      budget.bytes+=reserved
      const add=(key,raw)=>{
        const value=jsonValue(raw);if(value===undefined)return
        const size=Number.isFinite(budget.maxBytes)?bytesOf(JSON.stringify({[key]:value})):0
        if(budget.bytes+size>budget.maxBytes){result.truncated=true;result.reason='maxBytes';(result.omittedFields??=[]).push(key);result.fieldContinuation={nodeId:node.id,profile:options.profile??'full',depth:0};result.continuation={nodeId:node.id,profile:options.profile??'full',depth};return}
        result[key]=value;budget.bytes+=size
      }
      for(const key of options.profile==='summary'?summaryFields:fields){try{add(key,node[key])}catch{}}
      // IDs are necessary to recover a bounded read even if a large name/property exhausted its budget.
      result.id=node.id;result.type=node.type
      const codeLayer=this.codeLayerInfo(node);if(codeLayer){for(const [key,value]of Object.entries(codeLayer))add(key,value);return result}
      if(options.profile!=='summary'&&node.type==='TEXT'&&typeof node.getStyledTextSegments==='function'){
        try{const segments=node.getStyledTextSegments(['fontName','fontSize','fills','textDecoration','textCase','lineHeight','letterSpacing']);add('textSegments',segments.slice(0,2000));if(segments.length>2000){result.truncated=true;result.reason='textSegments';result.continuation={nodeId:node.id,hint:'Read text ranges with use_figma'}}}catch{}
      }
      if(node.children){
        result.childCount=node.children.length
        if(depth>0){
          result.children=[]
          const paged=root&&opted(options,['offset','limit']),offset=paged?options.offset??0:0,limit=paged?options.limit??50:node.children.length
          const end=Math.min(node.children.length,offset+limit)
          let next=offset
          for(;next<end;next++){
            if(budget.count>=budget.maxNodes||budget.bytes+reserved+128>budget.maxBytes){result.truncated=true;result.reason=budget.count>=budget.maxNodes?'maxNodes':'maxBytes';break}
            result.children.push(this.snapshot(node.children[next],depth-1,budget,false))
          }
          if(next<node.children.length){
            result.continuation={nodeId:node.id,depth,offset:next,limit:Math.min(200,limit||50),profile:options.profile??'full'}
            if(!paged||next<end)result.truncated=true
          }
          if(paged)result.pagination={offset,limit,returned:result.children.length,total:node.children.length,hasMore:next<node.children.length,nextOffset:next<node.children.length?next:null}
        }
      }
      return result
    }
    async screenshot(node, args = {}, inline = false) {
      if(typeof node.exportAsync!=='function')throw new Error('This node cannot be exported; choose a frame or scene node')
      if(args.quality!==undefined&&!['overview','detail'].includes(args.quality))throw new Error('quality must be overview or detail')
      const edge=args.maxDimension===undefined?(args.quality==='overview'?800:1600):integer(args.maxDimension,1600,1,8192,'maxDimension')
      let scale=args.scale??(inline&&args.quality===undefined?Math.min(0.5,1024/Math.max(node.width||1,node.height||1)):Math.min(1,edge/Math.max(node.width||1,node.height||1)))
      if(!Number.isFinite(scale)||scale<=0||scale>4)throw new Error('Screenshot scale must be positive and at most 4')
      if(args.maxDimension!==undefined)scale=Math.min(scale,edge/Math.max(node.width||1,node.height||1))
      const started=now(),bytes=await node.exportAsync({format:'PNG',constraint:{type:'SCALE',value:scale},contentsOnly:args.contentsOnly!==false})
      if(this.metrics){this.metrics.exportMs+=now()-started;const dimension=at=>bytes[at]*16777216+bytes[at+1]*65536+bytes[at+2]*256+bytes[at+3];this.metrics.images.push({...(bytes.length>=24&&bytes[0]===137&&bytes[1]===80?{width:dimension(16),height:dimension(20)}:{}),bytes:bytes.length})}
      if(bytes.length>8*1024*1024)throw new Error('Screenshot exceeds 8 MiB; select a smaller node or scale')
      return {type:'image',mimeType:'image/png',data:this.figma.base64Encode(bytes),...(inline?{name:`${node.name} (${node.width}x${node.height} at ${node.x},${node.y}).png`}:{})}
    }
    async facade(images, assets) {
      const runtime = this, figma = this.figma, cache = new WeakMap(), raws = new WeakMap()
      const components = new WeakMap(), placeholders = new Map()
      const {compileSelector, propertyValues} = scope.DshFigmaHelpers
      // Animation bindings also have id/type. Treating them as nodes hides their
      // enumerable fields, losing application IDs during {...style} edits.
      const isNode = value => value && typeof value.id === 'string' && typeof value.type === 'string' && typeof value.getPluginData === 'function' && !['FIGMA','CUSTOM','CUSTOM_ANIMATION'].includes(value.type)
      const progress = () => { try { runtime.onProgress([...placeholders.values()].map(n=>({id:n.id,name:n.name}))) } catch {} }
      // Dynamic-page Figma forbids the synchronous instance.mainComponent getter.
      // Prime the synchronous query helper from the public async API, scoped to loaded targets.
      async function hydrate(target) {
        if (!isNode(target) || ['DOCUMENT','CODE_INSTANCE'].includes(target.type)) return
        const instances = [target, ...(target.findAll && target.findAllWithCriteria ? target.findAllWithCriteria({types:['INSTANCE']}) : [])].filter(node=>node.type==='INSTANCE')
        for (const instance of instances) if (typeof instance.getMainComponentAsync === 'function') components.set(instance, await instance.getMainComponentAsync())
      }
      const mainComponent = node => {
        if (components.has(node)) return components.get(node)
        try { return node.mainComponent } catch { throw new Error('Call await instance.getMainComponentAsync() or await page.loadAsync() before querying mainComponent') }
      }
      await hydrate(figma.currentPage)
      const unwrap = value => raws.get(value) || (Array.isArray(value) ? value.map(unwrap) : value)
      const set = (node, props) => {
        if(runtime.creationReceipt&&!runtime.creationReceipt.ids.has(node.id))runtime.creationReceipt.unavailable='Script edits existing objects; cleanup ownership/dependencies cannot be established'
        if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('set expects a property object')
        if (Object.hasOwn(props,'layoutMode')) node.layoutMode = props.layoutMode
        if ('width' in props || 'height' in props) node.resize(props.width ?? node.width, props.height ?? node.height)
        for (const [key, value] of Object.entries(props)) if (!['layoutMode','width','height','__proto__','constructor','prototype'].includes(key)) wrap(node)[key] = value
        return wrap(node)
      }
      function queryResult(nodes) {
        const items = [...new Set(nodes)]
        // Keep numeric indexing/Array.isArray for existing local scripts while exposing QueryResult.
        const result = items.map(wrap)
        const methods = {
          first:()=>result[0]??null, last:()=>result.at(-1)??null, toArray:()=>[...result],
          each:fn=>{result.forEach(fn);return result},
          filter:fn=>queryResult(items.filter((node,index)=>fn(wrap(node),index))),
          values:keys=>{if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'))throw new Error('values expects property names');return items.map(node=>Object.fromEntries(keys.map(key=>{const values=propertyValues(node,key,mainComponent);return [key,key.includes('*')?values.map(wrap):wrap(values[0])]})))},
          set:props=>{for(const node of items)set(node,props);return result},
          query:selector=>{const match=compileSelector(selector,mainComponent);return queryResult(items.flatMap(node=>typeof node.findAll==='function'?node.findAll(child=>match(child,node)):[]))},
        }
        for(const [name,value] of Object.entries(methods))Object.defineProperty(result,name,{value,enumerable:false})
        return result
      }
      const query = (node, selector) => { const match=compileSelector(selector,mainComponent);return queryResult(node.findAll(child=>match(child,node))) }
      function tree(node, options={}) {
        const depth=integer(options.maxDepth,3,0,20,'maxDepth'),children=integer(options.maxChildren,50,0,1500,'maxChildren'),keys=options.fields??['id','name','type'],lines=[]
        if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'))throw new Error('tree fields must be property paths')
        let count=0
        function visit(current,level){
          if(++count>MAX_NODES)return
          const data=Object.fromEntries(keys.map(key=>{const values=propertyValues(current,key,mainComponent);return[key,key.includes('*')?values:values[0]]}))
          Object.assign(data,runtime.codeLayerInfo(current)||{})
          lines.push('  '.repeat(level)+JSON.stringify(data,(key,value)=>key&&isNode(value)?{id:value.id,type:value.type}:value))
          if(current.type!=='CODE_INSTANCE'&&level<depth&&'children' in current){for(const child of current.children.slice(0,children))visit(child,level+1);if(current.children.length>children)lines.push('  '.repeat(level+1)+'… '+(current.children.length-children)+' more children')}
        }
        visit(node,0);if(count>MAX_NODES)lines.push('… node limit reached');return lines.join('\n')
      }
      const io = {write(path,data){
        if(typeof path!=='string'||!path.trim()||path.length>500)throw new Error('io.write expects an output filename')
        let bytes
        if(typeof data==='string')bytes=new Uint8Array(Array.from(unescape(encodeURIComponent(data)),c=>c.charCodeAt(0)))
        else if(data instanceof Uint8Array)bytes=data
        else throw new Error('io.write data must be a string or Uint8Array')
        if(assets.length>=20||assets.reduce((total,a)=>total+a.byteLength,0)+bytes.length>12*1024*1024)throw new Error('io.write output exceeds 20 files or 12 MiB')
        const mimeType=/\.png$/i.test(path)?'image/png':/\.jpe?g$/i.test(path)?'image/jpeg':/\.svg$/i.test(path)?'image/svg+xml':/\.json$/i.test(path)?'application/json':typeof data==='string'?'text/plain':'application/octet-stream'
        assets.push({name:path.split(/[\\/]/).pop(),mimeType,data:figma.base64Encode(bytes),byteLength:bytes.length})
      }}
      function wrap(value) {
        if (!value || typeof value !== 'object') return value
        if (value instanceof Promise) return value.then(wrap)
        if (Array.isArray(value)) return value.map(wrap)
        if (value !== figma && !isNode(value)) return value
        if (cache.has(value)) return cache.get(value)
        const proxy = new Proxy({}, {
          get(_target, key) {
            const target = value
            if(runtime.creationReceipt&&target===figma&&['variables','teamLibrary'].includes(key))runtime.creationReceipt.unavailable='Script accesses resources outside node-only cleanup'
            if (key === 'mainComponent' && target.type === 'INSTANCE') throw new Error('Synchronous mainComponent access on instance '+target.id+' is not supported. Use const main = await instance.getMainComponentAsync(); then read main?.id or main?.name. This script has started: inspect affected nodes and variables before retrying; do not replay creation.')
            if (key === 'set') return props => set(target, props)
            if (key === 'query' && target.findAll) return selector => query(target, selector)
            if (key === 'matches' && isNode(target)) return selector => compileSelector(selector,mainComponent)(target)
            if (key === 'tree' && isNode(target)) return opts => tree(target,opts)
            if (key === 'placeholder' && isNode(target)) return placeholders.has(target.id)
            if (key === 'screenshot' && target.exportAsync) return async opts => { if (images.length >= 4) throw new Error('Maximum four screenshots per operation'); images.push(await runtime.screenshot(target, opts, true)) }
            if (key === 'findPlacement' && target.type === 'PAGE') return size => {
              if(target!==figma.currentPage)throw new Error('findPlacement requires the current page')
              if(!size||!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<=0||size.height<=0)throw new Error('findPlacement requires positive finite dimensions')
              if(typeof target.findPlacement==='function')return target.findPlacement(size)
              const right=target.children.reduce((edge,node)=>Math.max(edge,(node.absoluteBoundingBox?.x??node.x??0)+(node.absoluteBoundingBox?.width??node.width??0)),0)
              return {x:right+80,y:80,width:size.width,height:size.height}
            }
            if (target === figma && key === 'icon') return (name,options)=>{const node=scope.DshFigmaIcons.create(figma,name,options);if(runtime.creationReceipt)scope.DshFigmaRecovery.created(runtime,node);return wrap(node)}
            if (target === figma && key === 'io') return io
            if (target === figma && key === 'setCurrentPageAsync') return async page => {
              if(runtime.taskPageId&&unwrap(page).id!==runtime.taskPageId)throw new Error('Explicit step tasks cannot switch away from their original page')
              if(runtime.pageSwitches>=1)throw new Error('Switch pages at most once per use_figma call')
              runtime.pageSwitches++;const raw=unwrap(page);await figma.setCurrentPageAsync(raw);await hydrate(raw)
            }
            if (target === figma && key === 'createAutoLayout') return (direction = 'HORIZONTAL', props = {}) => {
              if (typeof direction === 'object') { props = direction; direction = 'HORIZONTAL' }
              if (!['HORIZONTAL','VERTICAL'].includes(direction)) throw new Error('Invalid auto-layout direction')
              const frame = figma.createFrame(); if(runtime.creationReceipt)scope.DshFigmaRecovery.created(runtime,frame); frame.layoutMode = direction
              frame.primaryAxisSizingMode = 'AUTO'; frame.counterAxisSizingMode = 'AUTO'
              frame.layoutSizingHorizontal = 'HUG'; frame.layoutSizingVertical = 'HUG'
              return set(frame, props)
            }
            const v = target[key]
            return typeof v === 'function' ? (...args) => {
              if(runtime.creationReceipt){const receipt=runtime.creationReceipt;if((String(key).startsWith('create')&&!['createFrame','createRectangle','createEllipse','createLine','createPolygon','createStar','createText','createVector','createSection','createComponent','createNodeFromSvg','createInstance'].includes(key))||isNode(target)&&!receipt.ids.has(target.id)&&/^(set|remove|resize|swap|apply|insert)/.test(String(key))||isNode(target)&&key==='appendChild'&&!receipt.ids.has(unwrap(args[0])?.id))receipt.unavailable='Script changes existing/dependent resources outside cleanup coverage'}
              const out=v.apply(target,args.map(unwrap));if(runtime.creationReceipt&&(String(key).startsWith('create')||key==='clone')){if(out?.then)out.then(node=>scope.DshFigmaRecovery.created(runtime,node),()=>{});else scope.DshFigmaRecovery.created(runtime,out)}if(runtime.writeJournal){if(String(key).startsWith('create')&&isNode(out))runtime.recordWrite({created:[out.id],api:String(key)});else if(isNode(target)&&/^(set|append|insert|resize|remove|swap|apply)/.test(String(key)))runtime.recordWrite({updated:{nodeId:target.id,api:String(key)}})}
              if(out&&typeof out.then==='function')return out.then(async resolved=>{if(key==='getMainComponentAsync')components.set(target,resolved);await hydrate(key==='loadAsync'?target:resolved);return wrap(resolved)})
              if(key==='createInstance'&&target.type==='COMPONENT')components.set(out,target)
              if(key==='swapComponent')components.set(target,unwrap(args[0]))
              if(key==='setProperties')components.delete(target)
              return wrap(out)
            } : wrap(v)
          },
          has(_target, key) {
            if (key === 'set' || ['matches','tree','placeholder'].includes(key)&&isNode(value) || key==='findPlacement'&&value.type==='PAGE' || key === 'query' && value.findAll || key === 'screenshot' && value.exportAsync || ['createAutoLayout','io'].includes(key)&&value===figma) return true
            return key in value
          },
          set(_target, key, next) {
            if(runtime.creationReceipt&&isNode(value)&&!runtime.creationReceipt.ids.has(value.id))runtime.creationReceipt.unavailable='Script edits existing objects; cleanup ownership/dependencies cannot be established'
            if(value===figma&&key==='currentPage')throw new Error('Setting figma.currentPage is not supported; await figma.setCurrentPageAsync(page)')
            if(isNode(value)&&['animationStyles','manualKeyframeTracks','timelines','animations'].includes(key))throw new Error('Native motion collections are read-only. Use applyManualKeyframeTrack/removeManualKeyframeTrack, setTimelineDuration, or dsh.updateAnimationStyle; inspect the motion guide. This script has already started.')
            if(key==='placeholder'&&isNode(value)){if(typeof next!=='boolean')throw new Error('placeholder must be boolean');if(next)placeholders.set(value.id,value);else placeholders.delete(value.id);progress();return true}
            value[key] = unwrap(next); if(isNode(value))runtime.recordWrite({updated:{nodeId:value.id,prop:String(key)}});return true
          }
        })
        cache.set(value, proxy); raws.set(proxy, value); return proxy
      }
      runtime.clearPlaceholders=()=>{placeholders.clear();progress()}
      runtime.motionHelpers={
        // Native collections are read-only. Replacement is explicit and reports
        // the new binding ID; only the final application can keep its ordering.
        updateAnimationStyle(node, applicationId, definitionId, configuration) {
          const target=unwrap(node),styles=target.animationStyles
          const index=styles.findIndex(style=>style.id===applicationId)
          if(index<0)throw new Error('Animation application does not exist; inspect animationStyles')
          if(index!==styles.length-1)throw new Error('Only the final animation application can be replaced without reordering others; plan an ordered rebuild explicitly')
          const old=styles[index]
          if(old.type==='CUSTOM'){
            if(definitionId!==old.styleId||configuration?.type!=='CUSTOM')throw new Error('Custom replacement must use its original styleId and CUSTOM configuration')
          }else{
            const definitions=figma.motion.figmaAnimationStyles()
            if(!definitions.some(def=>def.styleId===definitionId)||configuration?.type==='CUSTOM')throw new Error('Pass a discovered first-party definitionId for this FIGMA application')
          }
          const id=target.applyAnimationStyle(definitionId,unwrap(configuration))
          target.removeAnimationStyle(applicationId)
          return {id,replacedId:applicationId,nodeId:target.id}
        },
        async updateAnimationEntry(style, entryId, definitionId, props) {
          const target=unwrap(style),entries=target.animationEntries
          const index=entries.findIndex(entry=>entry.id===entryId)
          if(index<0)throw new Error('Animation entry does not exist')
          if(index!==entries.length-1)throw new Error('Only the final animation entry can be replaced without reordering others; plan an ordered rebuild explicitly')
          if(!figma.motion.figmaAnimationStyles().some(def=>def.styleId===definitionId))throw new Error('Pass a discovered first-party definitionId, not an entry backing styleId')
          const entry=await target.addAnimationEntryAsync(definitionId,props)
          target.removeAnimationEntry(entryId)
          return {id:entry.id,replacedId:entryId,styleId:target.id}
        }
      }
      return wrap(figma)
    }
    async run(method, args = {}, execution = {}) {
      if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Arguments must be an object')
      const started=now()
      this.writeJournal=args.journal===true?{coverage:'observed-node-proxy-writes-only; excludes variables, indirect effects and native helper internals',complete:false,entries:[]}:null;this.taskPageId=args.taskPageId;this.scriptEntered=false;this.mutationEntered=false;this.pageSwitches=0;this.clearPlaceholders=null
      this.metrics={runtimeMs:0,exportMs:0,serializationMs:0,nodeCount:0,imageCount:0,images:[],valueBytes:0}
      this.readOptions={};this.snapshotBudget=null
      try{
        scope.DshFigmaRecovery?.before(this,method,args,execution.operationId)
        if(this.taskPageId&&this.figma.currentPage.id!==this.taskPageId)throw Error('Task page changed before step execution')
        if(['get_metadata','get_selection','get_component_context','get_design_context','get_figjam','search_design_system'].includes(method)){
          if(args.profile!==undefined&&!['summary','full'].includes(args.profile))throw new Error('profile must be summary or full')
          this.readOptions={profile:args.profile??'full',maxNodes:integer(args.maxNodes,MAX_NODES,1,MAX_NODES,'maxNodes'),maxBytes:args.maxBytes===undefined?Infinity:integer(args.maxBytes,65536,1024,2097152,'maxBytes')}
          if(method==='get_metadata'&&opted(args,['offset','limit'])){
            if(!args.nodeId)throw new Error('Child pagination requires nodeId')
            if((args.depth??3)<1)throw new Error('Child pagination requires depth of at least 1')
            this.readOptions.offset=integer(args.offset,0,0,1000000,'offset');this.readOptions.limit=integer(args.limit,50,1,200,'limit')
          }
        }
        const result=await this.execute(method,args)
        if(method==='use_figma'){
          result.verification={state:result.images.length?'image-returned':'not-requested',visualAcceptance:'not-established'}
          if(args.verify){
            let verifyId=args.verify.nodeId
            try{if(args.verify.resultPath){let resolved=result.value;for(const key of args.verify.resultPath.split('.').filter(k=>k!=='$')){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid verify resultPath');resolved=resolved?.[key]}if(typeof resolved!=='string'||!resolved)throw Error('verify resultPath did not resolve to a node ID');verifyId=resolved}
              if(result.images.length>=4)throw Error('Screenshot limit reached; request get_screenshot separately');const target=await this.node(verifyId);result.images.push(await this.screenshot(target,args.verify,true));result.verification={state:'image-returned',nodeId:target.id,visualAcceptance:'not-established'}}
            catch(error){result.verification={state:'failed',nodeId:verifyId??null,error:String(error.message??error),writeState:args.readOnly?'read-only':'completed',...(verifyId?{reconcile:{tool:'get_screenshot',args:{nodeId:verifyId,...(args.verify.scale?{scale:args.verify.scale}:{})}}}:{}),suggestedAction:'Retry verification only; do not replay the creation script.'}}
          }
        }
        const serializeStart=now()
        result.value=jsonValue(result.value)??null
        let valueJson=JSON.stringify(result.value)
        if(Number.isFinite(this.readOptions.maxBytes)&&bytesOf(valueJson)>this.readOptions.maxBytes){
          const target=args.nodeId||['get_design_context','get_figjam','get_component_context'].includes(method)?await this.node(args.nodeId):this.figma.currentPage
          const marker={id:target.id,type:target.type,truncated:true,reason:'maxBytes',continuation:{nodeId:target.id,depth:1,profile:args.profile??'full',offset:args.offset??0,limit:1},hint:'Increase maxBytes or use profile summary; omitted content was not inspected.'}
          if(method==='get_design_context'||method==='get_figjam')result.value={node:marker,truncated:true,reason:'maxBytes'}
          else if(method==='get_selection')result.value={page:marker,selection:[],truncated:true,reason:'maxBytes',omittedSelectionCount:this.figma.currentPage.selection.length,hint:'Read selection without maxBytes to obtain IDs, then read individual nodes.'}
          else if(method==='get_metadata'&&!args.nodeId)result.value={pages:[],currentPage:marker,truncated:true,reason:'maxBytes',pagesTruncated:true,hint:'Read the page index with depth:0 and a larger maxBytes, or read currentPage by ID.'}
          else result.value=marker
          valueJson=JSON.stringify(result.value)
        }
        this.metrics.valueBytes=bytesOf(valueJson)
        if(this.metrics.valueBytes+JSON.stringify({images:result.images,assets:result.assets}).length+32+(result.assets||[]).reduce((n,a)=>n+bytesOf(a.name||''),0)>23*1024*1024)throw new Error('Result too large; return IDs and bounded metadata')
        this.metrics.serializationMs+=now()-serializeStart
        this.metrics.imageCount=result.images.length
        this.metrics.runtimeMs=now()-started
        if(this.writeJournal)result.journal=this.writeJournal
        result.metrics=this.metrics
        scope.DshFigmaRecovery?.success(this)
        return result
      }catch(cause){
        // Never trust an exception property supplied by user code. Only pre-execution failures are retry-safe.
        const nativeMessage=String(cause&&cause.message||cause)
        const error=new Error(/createCodeLayer.*(?:not a function|undefined)/.test(nativeMessage)&&typeof this.figma.createCodeLayer!=='function'?'FIGMA_CODE_LAYER_UNAVAILABLE: This editor does not expose local Code Layer creation. '+nativeMessage:nativeMessage)
        error.safeToRetryWithoutCanvasRead=method==='use_figma'?args.readOnly===true||!this.scriptEntered:method==='rollback'?!this.mutationEntered:['batch_edit','generate_diagram','generate_deck','apply_shader','import_dom_snapshot','create_variables','add_variable_modes','set_design_reference','clear_design_reference'].includes(method)&&!this.mutationEntered
        if(method==='use_figma'&&args.readOnly)error.executionState='read-only'
        if(this.creationReceipt){try{error.cleanup=await scope.DshFigmaRecovery.failed(this)}catch{this.creationReceipt.dispose?.();error.cleanup={available:false,reason:'Cleanup evidence unavailable'}}}
        if(this.writeJournal)error.journal={...this.writeJournal,failedAt:{stack:String(cause.stack??'').split('\n').slice(0,3).join('\n')}}
        for(const key of ['journal','affected','failureClass'])if(cause?.[key]&&method!=='use_figma')error[key]=cause[key]
        if(cause?.batchResult)error.batchResult=cause.batchResult
        if(cause?.createdNodeIds)error.createdNodeIds=cause.createdNodeIds
        throw error
      }finally{this.clearPlaceholders?.();this.clearPlaceholders=null;this.metrics=null;this.readOptions={};this.snapshotBudget=null}
    }
    async execute(method, args = {}) {
      const f = this.figma, images = []
      let value, assets
      for(const extension of [scope.DshFigmaContext,scope.DshFigmaMedia,scope.DshFigmaAuthoring,scope.DshFigmaOperations,scope.DshFigmaReference,scope.DshFigmaQuality]){
        const result=await extension?.execute(this,method,args);if(result)return result
      }
      const depth = integer(args.depth,3,0,10,'depth')
      switch (method) {
        case 'use_figma': {
          if(args.readOnly){this.scriptEntered=true;value=await scope.DshFigmaReadonly.execute(f,args.readOnlyProgram);break}
          if (typeof args.code !== 'string' || !args.code.trim() || args.code.length > 150000) throw new Error('Provide a script of 1–150000 characters')
          const run = new Function('figma', 'dsh', '"use strict"; return (async () => {\n' + args.code + '\n})()')
          // The local plugin shares the user's editor. Preserve its page and
          // selection; only an explicit script request may switch pages.
          assets=[]
          const facade=await this.facade(images,assets)
          this.scriptEntered=true
          value = await run(facade, { ...this.motionHelpers, color(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) throw new Error('Use a six-digit hex color'); const n = parseInt(m[1],16); return { r: ((n>>16)&255)/255, g: ((n>>8)&255)/255, b: (n&255)/255 } } })
          f.commitUndo(); break
        }
        case 'get_selection': value = { page: this.snapshot(f.currentPage, 0), selection: f.currentPage.selection.map(n => this.snapshot(n, 0)) }; break
        case 'list_fonts': {
          const fonts=await f.listAvailableFontsAsync()
          if(!opted(args,['query','family','style','offset','limit'])){value=fonts;break}
          const query=textFilter(args.query,'query'),family=textFilter(args.family,'family'),style=textFilter(args.style,'style')
          const page=pageOf(fonts.filter(font=>{const name=font.fontName||{};return (!query||(name.family+' '+name.style).toLowerCase().includes(query))&&(!family||(name.family||'').toLowerCase()===family)&&(!style||(name.style||'').toLowerCase()===style)}),args)
          value={fonts:page.items,pagination:page.pagination};break
        }
        case 'get_metadata': {
          if(args.nodeId) { const target=await this.node(args.nodeId); if(target.type==='PAGE'&&typeof target.loadAsync==='function')await target.loadAsync(); value=this.snapshot(target,depth) }
          else value={pages:f.root.children.map(p=>({id:p.id,name:p.name,type:p.type})),currentPage:this.snapshot(f.currentPage,depth)}
          break
        }
        case 'get_screenshot': { const node = await this.node(args.nodeId); images.push(await this.screenshot(node,args)); value = { id: node.id, name: node.name, originalWidth:node.width,originalHeight:node.height,...this.metrics.images.at(-1) }; break }
        case 'get_design_context':
        case 'get_figjam': {
          const node = await this.node(args.nodeId); value = { node: this.snapshot(node, depth), source: 'local-plugin-api', codeGeneration: 'Adapt structure and CSS to the project; no cloud code generation was called.' }
          if (args.profile!=='summary' && typeof node.getCSSAsync === 'function') value.css = await node.getCSSAsync()
          if (node.type === 'INSTANCE') { const main = await node.getMainComponentAsync(); value.mainComponent = main ? this.snapshot(main, 0) : null }
          if (args.includeScreenshot !== false) images.push(await this.screenshot(node,args))
          break
        }
        case 'get_variable_defs': {
          if(args.profile!==undefined&&!['summary','full'].includes(args.profile))throw new Error('profile must be summary or full')
          if(args.type!==undefined&&!['COLOR','FLOAT','BOOLEAN','STRING'].includes(args.type))throw new Error('Unsupported variable type')
          if(args.collectionsOnly!==undefined&&typeof args.collectionsOnly!=='boolean')throw new Error('collectionsOnly must be a boolean')
          if(args.allVariables&&(args.collectionsOnly||args.offset!==undefined||args.limit!==undefined))throw Error('allVariables requires variable values without pagination')
          if(args.collectionsOnly&&(args.ids!==undefined||args.type!==undefined))throw new Error('collectionsOnly does not accept variable ids or type filters')
          const collectionIds=idFilter(args.collectionIds,'collectionIds'),ids=idFilter(args.ids,'ids'),modeIds=idFilter(args.modeIds,'modeIds'),q=textFilter(args.query,'query')
          if(args.collectionsOnly){
            const collections=await f.variables.getLocalVariableCollectionsAsync()
            const filtered=collections.filter(c=>(!collectionIds||collectionIds.has(c.id))&&(!q||c.name.toLowerCase().includes(q)))
            if(modeIds){const available=new Set(filtered.flatMap(c=>c.modes.map(mode=>mode.modeId)));if([...modeIds].some(id=>!available.has(id)))throw new Error('modeIds contains an unknown mode for the selected collections')}
            const page=pageOf(filtered,args)
            value={collections:page.items.map(c=>({id:c.id,name:c.name,...this.collectionCapability(c),modes:modeIds?c.modes.filter(mode=>modeIds.has(mode.modeId)):c.modes,defaultModeId:c.defaultModeId,variableCount:c.variableIds.length})),variables:[],pagination:page.pagination,
              coverage:{source:'local-file',collections:'filtered-collection-page-including-empty',variables:'not-read',localCollectionCount:collections.length,emptyLocalCollectionCount:collections.filter(c=>c.variableIds.length===0).length,collectionInventoryComplete:!collectionIds&&!q&&page.pagination.offset===0&&!page.pagination.hasMore,libraryCollectionsIncluded:false}}
            break
          }
          const [collections,variables]=await Promise.all([f.variables.getLocalVariableCollectionsAsync(),f.variables.getLocalVariablesAsync(args.type)])
          const filtered=variables.filter(v=>(!collectionIds||collectionIds.has(v.variableCollectionId))&&(!ids||ids.has(v.id))&&(!args.type||v.resolvedType===args.type)&&(!q||v.name.toLowerCase().includes(q)))
          const active=opted(args,['collectionIds','ids','modeIds','query','type','profile','offset','limit','collectionsOnly']),page=active&&!args.allVariables?pageOf(filtered,args):{items:filtered}
          const relevant=new Set(page.items.map(v=>v.variableCollectionId))
          if(modeIds){const available=new Set(collections.filter(c=>!collectionIds||collectionIds.has(c.id)).flatMap(c=>c.modes.map(mode=>mode.modeId)));if([...modeIds].some(id=>!available.has(id)))throw new Error('modeIds contains an unknown mode')}
          value={collections:collections.filter(c=>!active||relevant.has(c.id)||collectionIds?.has(c.id)).map(c=>({id:c.id,name:c.name,...this.collectionCapability(c),modes:modeIds?c.modes.filter(mode=>modeIds.has(mode.modeId)):c.modes,defaultModeId:c.defaultModeId,...(args.profile==='summary'?{}:{variableIds:active?page.items.filter(v=>v.variableCollectionId===c.id).map(v=>v.id):c.variableIds,...(active?{variableIdsScope:'returned-page'}:{})})})),variables:page.items.map(v=>args.profile==='summary'?{id:v.id,name:v.name,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId}:{id:v.id,key:v.key,name:v.name,resolvedType:v.resolvedType,valuesByMode:modeIds?Object.fromEntries(Object.entries(v.valuesByMode).filter(([id])=>modeIds.has(id))):v.valuesByMode,scopes:v.scopes,description:v.description,variableCollectionId:v.variableCollectionId}),...(active?{pagination:page.pagination,coverage:{source:'local-file',collections:'returned-variable-page-and-requested-collections',variables:'filtered-variable-page',localCollectionCount:collections.length,emptyLocalCollectionCount:collections.filter(c=>c.variableIds.length===0).length,collectionInventoryComplete:false,libraryCollectionsIncluded:false}}:{})};break
        }
        case 'get_libraries': value = { variableCollections: await f.teamLibrary.getAvailableLibraryVariableCollectionsAsync(), scope: 'Libraries exposed to this plugin; component discovery is local-page only.' }; break
        case 'search_design_system': {
          if(args.includeLibraryKeys!==undefined&&(!Array.isArray(args.includeLibraryKeys)||args.includeLibraryKeys.length))throw new Error('Cloud library search is unavailable locally; use get_libraries and import known published keys')
          if(args.queries!==undefined){
            if(args.query!==undefined||args.kind!==undefined)throw new Error('Use queries or legacy query/kind, not both')
            if(!Array.isArray(args.queries)||!args.queries.length||args.queries.length>50||args.queries.some(q=>!q||!['component','variable','style'].includes(q.entity)||typeof q.query!=='string'))throw new Error('queries must contain 1–50 entity/query pairs')
            const results=[]
            for(const query of args.queries){const {value:found}=await this.execute('search_design_system',{...args,queries:undefined,query:query.query,kind:{component:'components',variable:'variables',style:'styles'}[query.entity]});results.push({...query,...found})}
            value={results,scope:'local; ordered batch; no cloud libraries or Code Connect'};break
          }
          if(typeof args.query!=='string')throw new Error('Provide query or queries')
          const q=textFilter(args.query,'query'),kind=args.kind??'all'
          if(!['all','components','variables','styles'].includes(kind))throw new Error('kind must be all, components, variables or styles')
          const active=opted(args,['kind','pageId','profile','offset','limit'])
          if(active)pageOf([],args)
          let page=f.currentPage
          if(args.pageId&&(kind==='all'||kind==='components')){page=await this.node(args.pageId);if(page.type!=='PAGE')throw new Error('pageId must identify a page');if(typeof page.loadAsync==='function')await page.loadAsync()}
          const components=kind==='all'||kind==='components'?page.findAllWithCriteria({types:['COMPONENT','COMPONENT_SET']}).filter(n=>n.name.toLowerCase().includes(q)):[]
          const variables=kind==='all'||kind==='variables'?(await f.variables.getLocalVariablesAsync()).filter(v=>v.name.toLowerCase().includes(q)):[]
          const styles=kind==='all'||kind==='styles'?(await Promise.all([f.getLocalPaintStylesAsync(),f.getLocalTextStylesAsync(),f.getLocalEffectStylesAsync(),f.getLocalGridStylesAsync()])).flat().filter(s=>s.name.toLowerCase().includes(q)):[]
          const paginate=items=>active?pageOf(items,args):{items:items.slice(0,200)}
          const cp=paginate(components),vp=paginate(variables),sp=paginate(styles)
          value={scope:args.pageId?'specified-page components, local-file variables and styles':'current-page components, local-file variables and styles',components:cp.items.map(n=>this.snapshot(n,0)),variables:vp.items.map(v=>({id:v.id,name:v.name,resolvedType:v.resolvedType})),styles:sp.items.map(s=>({id:s.id,key:s.key,name:s.name,type:s.type})),...(active?{pagination:{components:cp.pagination,variables:vp.pagination,styles:sp.pagination}}:{})};break
        }
        case 'get_component_context': { const n = await this.node(args.nodeId); if (!['COMPONENT','COMPONENT_SET','INSTANCE'].includes(n.type)) throw new Error('Expected a component, component set, or instance'); value = this.snapshot(n,depth); break }
        case 'get_local_component_links': { const n=await this.node(args.nodeId); value = JSON.parse(n.getPluginData('dsh-code-links') || '[]'); break }
        case 'set_local_component_links': {
          if (!Array.isArray(args.links) || args.links.length > 100) throw new Error('Expected at most 100 component links')
          const n=await this.node(args.nodeId); n.setPluginData('dsh-code-links',JSON.stringify(args.links)); value={id:n.id,links:args.links,scope:'DSH plugin data; not published Figma Code Connect'}; f.commitUndo(); break
        }
        case 'get_capabilities': value=await scope.DshFigmaCapabilities.probe(f,args.nodeId?await this.node(args.nodeId):undefined); break
        case 'get_motion_context': { const n=await this.node(args.nodeId); value=scope.DshFigmaCapabilities.motionContext(n,args); break }
        case 'download_assets': {
          const ids = args.nodeIds || (args.nodeId ? [args.nodeId] : f.currentPage.selection.map(n=>n.id))
          if (!Array.isArray(ids) || !ids.length || ids.length > 20) throw new Error('Select or specify 1–20 nodes')
          const format = String(args.format || 'PNG').toUpperCase()
          if (!['PNG','JPG','SVG','PDF'].includes(format)) throw new Error('Supported formats: PNG, JPG, SVG, PDF')
          assets=[]; let total=0; const hashes=new Set()
          const add = (name,mime,bytes) => { total+=bytes.length; if(total>12*1024*1024) throw new Error('Asset batch exceeds 12 MiB; export fewer or smaller nodes'); assets.push({name,mimeType:mime,data:f.base64Encode(bytes)}) }
          for (const id of ids) {
            const node = await this.node(id), options={format}
            if (['PNG','JPG'].includes(format)) { const scale=args.scale??1; if(!Number.isFinite(scale)||scale<0.01||scale>4) throw new Error('Scale must be 0.01–4'); options.constraint={type:'SCALE',value:scale} }
            const exportStarted=now(),exported=await node.exportAsync(options)
            if(this.metrics)this.metrics.exportMs+=now()-exportStarted
            add(node.name+'.'+format.toLowerCase(),{PNG:'image/png',JPG:'image/jpeg',SVG:'image/svg+xml',PDF:'application/pdf'}[format],exported)
            if(args.includeOriginalImages) {
              const nodes=[node,...(node.findAll?node.findAll(n=>Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')):[])]
              for(const child of nodes) for(const paint of Array.isArray(child.fills)?child.fills:[]) if(paint.type==='IMAGE'&&paint.imageHash&&!hashes.has(paint.imageHash)) {
                hashes.add(paint.imageHash); if(hashes.size>20) throw new Error('More than 20 source images; select a smaller subtree')
                const image=f.getImageByHash(paint.imageHash); if(image) add(paint.imageHash+'.bin','application/octet-stream',await image.getBytesAsync())
              }
            }
          }
          value={exportCount:assets.length}; break
        }
        case 'upload_assets': {
          if(!Array.isArray(args.assets)||!args.assets.length||args.assets.length>20) throw new Error('Upload 1–20 assets')
          const parent=args.parentId?await this.node(args.parentId):f.currentPage
          if(!parent.appendChild) throw new Error('Parent does not accept children')
          const ids=[]; let x=f.viewport.center.x, y=f.viewport.center.y
          for(const asset of args.assets) {
            let node
            if(asset.mimeType==='image/svg+xml') node=f.createNodeFromSvg(asset.svg)
            else { const image=f.createImage(f.base64Decode(asset.data)); const size=await image.getSizeAsync(); node=f.createRectangle(); node.resize(size.width,size.height); node.fills=[{type:'IMAGE',imageHash:image.hash,scaleMode:'FILL'}] }
            node.name=asset.name; parent.appendChild(node)
            if(!parent.layoutMode||parent.layoutMode==='NONE') { node.x=x; node.y=y; x+=node.width+32 }
            ids.push(node.id)
          }
          f.commitUndo(); value={nodeIds:ids}; break
        }
        case 'import_scene': {
          this.writeJournal={coverage:'scene-created-nodes',complete:true,entries:[]}
          let count=0; const ids=[]
          const create=async (spec,parent) => {
            if(++count>500) throw new Error('Scene exceeds 500 nodes')
            const constructors={FRAME:'createFrame',TEXT:'createText',RECTANGLE:'createRectangle',ELLIPSE:'createEllipse',COMPONENT:'createComponent',SECTION:'createSection',STICKY:'createSticky',SHAPE_WITH_TEXT:'createShapeWithText'}
            const method=constructors[spec.type]; if(!method||typeof f[method]!=='function') throw new Error('Unsupported scene node type: '+spec.type)
            const n=f[method]();ids.push(n.id);this.recordWrite({created:[n.id],api:method});parent.appendChild(n)
            const props=spec.props||{}
            if(n.type==='TEXT') { const font=props.fontName||{family:'Inter',style:'Regular'}; await f.loadFontAsync(font); n.fontName=font }
            if('width'in props||'height'in props) n.resize(props.width??n.width,props.height??n.height)
            for(const [key,v] of Object.entries(props)) if(fields.includes(key)&&!['id','type','width','height','boundVariables','componentProperties','componentPropertyDefinitions','variantProperties'].includes(key)) n[key]=v
            if(spec.children) { if(!n.appendChild) throw new Error('Leaf node cannot have children'); for(const child of spec.children) await create(child,n) }
            return n
          }
          const parent=args.parentId?await this.node(args.parentId):f.currentPage
          if(!Array.isArray(args.nodes)||!args.nodes.length) throw new Error('Provide a non-empty nodes array')
          for(const spec of args.nodes) await create(spec,parent)
          f.commitUndo(); value={nodeIds:ids,count}; break
        }
        default: throw new Error('Unknown local Figma operation: '+method)
      }
      return {value,images,...(assets?{assets}:{})}
    }
  }
  scope.DshFigmaRuntime = Runtime
})(globalThis)

/* Generated entry is built by scripts/check.mjs from runtime.js and this file. */
const companionVersion = globalThis.DSH_FIGMA_BOOTSTRAP?.version || globalThis.DSH_FIGMA_VERSION || null
figma.showUI(__html__, { width: 300, height: 210, themeColors: true, ...(companionVersion?{title:'DSH to Figma · '+companionVersion}:{}) })
const runtime = new globalThis.DshFigmaRuntime(figma, {onProgress: nodes => figma.ui.postMessage({type:'progress',nodes})})
let busy = false, referenceWork = null, referenceSerial = 0
const referenceSummary = () => globalThis.DshFigmaReference.summary(globalThis.DshFigmaReference.stored(figma))
const notifyReference = reference => figma.ui.postMessage({type:'reference-changed',reference:globalThis.DshFigmaReference.summary(reference),referenceSerial})
figma.ui.onmessage = async message => {
  if (message.type === 'resize') {
    if (Number.isFinite(message.height)) figma.ui.resize(300, Math.max(158, Math.min(520, Math.round(message.height))))
    return
  }
  if (message.type === 'describe') {
    let capabilities
    try { capabilities = await globalThis.DshFigmaCapabilities.probe(figma) } catch {} // Discovery must not prevent pairing.
    figma.ui.postMessage({ type: 'document', name: figma.root.name, editorType: figma.editorType, fileKey: figma.fileKey || null, featureVersion: 6, designReference:referenceSummary(), referenceSerial, capabilities, companionVersion, connection: globalThis.DSH_FIGMA_BOOTSTRAP || null })
    return
  }
  if (message.type === 'reference') {
    if(busy||referenceWork){figma.ui.postMessage({type:'reference-result',id:message.id,ok:false,error:'请等待当前操作完成后再试。'});return}
    referenceWork=(async()=>{
      try{
        if(message.action==='locate')await globalThis.DshFigmaReference.locate(figma)
        const method=({get:'get_design_reference',bind:'set_design_reference',clear:'clear_design_reference',locate:'get_design_reference'})[message.action]
        if(!method)throw Error('不支持的参考操作。')
        const result=await runtime.run(method,{includePreview:message.includePreview===true})
        figma.ui.postMessage({type:'reference-result',id:message.id,ok:true,referenceSerial:++referenceSerial,result:{...result,value:{...result.value,reference:globalThis.DshFigmaReference.summary(result.value.reference)}}})
      }catch(error){figma.ui.postMessage({type:'reference-result',id:message.id,ok:false,error:String(error.message||error)})}
    })()
    try{await referenceWork}finally{referenceWork=null}
    return
  }
  if (message.type !== 'execute') return
  if(referenceWork)await referenceWork
  if (busy) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: 'An operation is already running', safeToRetryWithoutCanvasRead:true }); return }
  busy = true
  try { const result = await runtime.run(message.method, message.args,{operationId:message.id}); if(['get_design_reference','set_design_reference','clear_design_reference'].includes(message.method))result.referenceSerial=++referenceSerial; figma.ui.postMessage({ type: 'result', id: message.id, ok: true, result }); if(['get_design_reference','set_design_reference','clear_design_reference'].includes(message.method))notifyReference(result.value.reference) }
  catch (error) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: String(error && error.message || error), safeToRetryWithoutCanvasRead: error?.safeToRetryWithoutCanvasRead === true, executionState:error?.executionState,cleanup:error?.cleanup,batchResult:error?.batchResult,createdNodeIds:error?.createdNodeIds,journal:error?.journal,affected:error?.affected,failureClass:error?.failureClass }) }
  finally { busy = false }
}
