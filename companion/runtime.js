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
    async node(id) {
      const node = id ? await this.figma.getNodeByIdAsync(id.replace(/^(\d+)-(\d+)$/, '$1:$2')) : this.figma.currentPage.selection[0]
      if (!node) throw new Error('Select a node in Figma or provide an existing nodeId')
      return node
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
      const edge=args.quality==='overview'?800:1600
      const scale=args.scale??(inline&&args.quality===undefined?Math.min(0.5,1024/Math.max(node.width||1,node.height||1)):Math.min(1,edge/Math.max(node.width||1,node.height||1)))
      if(!Number.isFinite(scale)||scale<=0||scale>4)throw new Error('Screenshot scale must be positive and at most 4')
      const started=now(),bytes=await node.exportAsync({format:'PNG',constraint:{type:'SCALE',value:scale},contentsOnly:args.contentsOnly!==false})
      if(this.metrics){this.metrics.exportMs+=now()-started;const dimension=at=>bytes[at]*16777216+bytes[at+1]*65536+bytes[at+2]*256+bytes[at+3];this.metrics.images.push({...(bytes.length>=24&&bytes[0]===137&&bytes[1]===80?{width:dimension(16),height:dimension(20)}:{}),bytes:bytes.length})}
      if(bytes.length>8*1024*1024)throw new Error('Screenshot exceeds 8 MiB; select a smaller node or scale')
      return {type:'image',mimeType:'image/png',data:this.figma.base64Encode(bytes),...(inline?{name:`${node.name} (${node.width}x${node.height} at ${node.x},${node.y}).png`}:{})}
    }
    async facade(images, assets) {
      const runtime = this, figma = this.figma, cache = new WeakMap(), raws = new WeakMap()
      const components = new WeakMap(), placeholders = new Map()
      const {compileSelector, propertyValues} = scope.DshFigmaHelpers
      const isNode = value => value && typeof value.id === 'string' && typeof value.type === 'string'
      const progress = () => { try { runtime.onProgress([...placeholders.values()].map(n=>({id:n.id,name:n.name}))) } catch {} }
      // Dynamic-page Figma forbids the synchronous instance.mainComponent getter.
      // Prime the synchronous query helper from the public async API, scoped to loaded targets.
      async function hydrate(target) {
        if (!isNode(target) || target.type==='DOCUMENT') return
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
          lines.push('  '.repeat(level)+JSON.stringify(data,(key,value)=>key&&isNode(value)?{id:value.id,type:value.type}:value))
          if(level<depth&&'children' in current){for(const child of current.children.slice(0,children))visit(child,level+1);if(current.children.length>children)lines.push('  '.repeat(level+1)+'… '+(current.children.length-children)+' more children')}
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
            if (target === figma && key === 'io') return io
            if (target === figma && key === 'setCurrentPageAsync') return async page => {
              if(runtime.pageSwitches>=1)throw new Error('Switch pages at most once per use_figma call')
              runtime.pageSwitches++;const raw=unwrap(page);await figma.setCurrentPageAsync(raw);await hydrate(raw)
            }
            if (target === figma && key === 'createAutoLayout') return (direction = 'HORIZONTAL', props = {}) => {
              if (typeof direction === 'object') { props = direction; direction = 'HORIZONTAL' }
              if (!['HORIZONTAL','VERTICAL'].includes(direction)) throw new Error('Invalid auto-layout direction')
              const frame = figma.createFrame(); frame.layoutMode = direction
              frame.primaryAxisSizingMode = 'AUTO'; frame.counterAxisSizingMode = 'AUTO'
              frame.layoutSizingHorizontal = 'HUG'; frame.layoutSizingVertical = 'HUG'
              return set(frame, props)
            }
            const v = target[key]
            return typeof v === 'function' ? (...args) => {
              const out=v.apply(target,args.map(unwrap))
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
            if(value===figma&&key==='currentPage')throw new Error('Setting figma.currentPage is not supported; await figma.setCurrentPageAsync(page)')
            if(key==='placeholder'&&isNode(value)){if(typeof next!=='boolean')throw new Error('placeholder must be boolean');if(next)placeholders.set(value.id,value);else placeholders.delete(value.id);progress();return true}
            value[key] = unwrap(next); return true
          }
        })
        cache.set(value, proxy); raws.set(proxy, value); return proxy
      }
      runtime.clearPlaceholders=()=>{placeholders.clear();progress()}
      return wrap(figma)
    }
    async run(method, args = {}) {
      if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Arguments must be an object')
      const started=now()
      this.scriptEntered=false;this.pageSwitches=0;this.clearPlaceholders=null
      this.metrics={runtimeMs:0,exportMs:0,serializationMs:0,nodeCount:0,imageCount:0,images:[],valueBytes:0}
      this.readOptions={};this.snapshotBudget=null
      try{
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
        result.metrics=this.metrics
        return result
      }catch(cause){
        // Never trust an exception property supplied by user code. Only pre-execution failures are retry-safe.
        const error=new Error(String(cause&&cause.message||cause))
        error.safeToRetryWithoutCanvasRead=method==='use_figma'&&!this.scriptEntered
        throw error
      }finally{this.clearPlaceholders?.();this.clearPlaceholders=null;this.metrics=null;this.readOptions={};this.snapshotBudget=null}
    }
    async execute(method, args = {}) {
      const f = this.figma, images = [], depth = integer(args.depth,3,0,10,'depth')
      let value, assets
      switch (method) {
        case 'use_figma': {
          if (typeof args.code !== 'string' || !args.code.trim() || args.code.length > 150000) throw new Error('Provide a script of 1–150000 characters')
          const run = new Function('figma', 'dsh', '"use strict"; return (async () => {\n' + args.code + '\n})()')
          const first=f.root.children[0]
          if(first&&f.currentPage!==first)await f.setCurrentPageAsync(first)
          assets=[]
          const facade=await this.facade(images,assets)
          this.scriptEntered=true
          value = await run(facade, { color(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) throw new Error('Use a six-digit hex color'); const n = parseInt(m[1],16); return { r: ((n>>16)&255)/255, g: ((n>>8)&255)/255, b: (n&255)/255 } } })
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
        case 'get_screenshot': { const node = await this.node(args.nodeId); images.push(await this.screenshot(node,args)); value = { id: node.id, name: node.name }; break }
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
          if(args.collectionsOnly&&(args.ids!==undefined||args.type!==undefined))throw new Error('collectionsOnly does not accept variable ids or type filters')
          const collectionIds=idFilter(args.collectionIds,'collectionIds'),ids=idFilter(args.ids,'ids'),modeIds=idFilter(args.modeIds,'modeIds'),q=textFilter(args.query,'query')
          if(args.collectionsOnly){
            const collections=await f.variables.getLocalVariableCollectionsAsync()
            const filtered=collections.filter(c=>(!collectionIds||collectionIds.has(c.id))&&(!q||c.name.toLowerCase().includes(q)))
            if(modeIds){const available=new Set(filtered.flatMap(c=>c.modes.map(mode=>mode.modeId)));if([...modeIds].some(id=>!available.has(id)))throw new Error('modeIds contains an unknown mode for the selected collections')}
            const page=pageOf(filtered,args)
            value={collections:page.items.map(c=>({id:c.id,name:c.name,modes:modeIds?c.modes.filter(mode=>modeIds.has(mode.modeId)):c.modes,defaultModeId:c.defaultModeId,variableCount:c.variableIds.length})),variables:[],pagination:page.pagination,
              coverage:{source:'local-file',collections:'filtered-collection-page-including-empty',variables:'not-read',localCollectionCount:collections.length,emptyLocalCollectionCount:collections.filter(c=>c.variableIds.length===0).length,collectionInventoryComplete:!collectionIds&&!q&&page.pagination.offset===0&&!page.pagination.hasMore,libraryCollectionsIncluded:false}}
            break
          }
          const [collections,variables]=await Promise.all([f.variables.getLocalVariableCollectionsAsync(),f.variables.getLocalVariablesAsync(args.type)])
          const filtered=variables.filter(v=>(!collectionIds||collectionIds.has(v.variableCollectionId))&&(!ids||ids.has(v.id))&&(!args.type||v.resolvedType===args.type)&&(!q||v.name.toLowerCase().includes(q)))
          const active=opted(args,['collectionIds','ids','modeIds','query','type','profile','offset','limit','collectionsOnly']),page=active?pageOf(filtered,args):{items:filtered}
          const relevant=new Set(page.items.map(v=>v.variableCollectionId))
          if(modeIds){const available=new Set(collections.filter(c=>!collectionIds||collectionIds.has(c.id)).flatMap(c=>c.modes.map(mode=>mode.modeId)));if([...modeIds].some(id=>!available.has(id)))throw new Error('modeIds contains an unknown mode')}
          value={collections:collections.filter(c=>!active||relevant.has(c.id)||collectionIds?.has(c.id)).map(c=>({id:c.id,name:c.name,modes:modeIds?c.modes.filter(mode=>modeIds.has(mode.modeId)):c.modes,defaultModeId:c.defaultModeId,...(args.profile==='summary'?{}:{variableIds:active?page.items.filter(v=>v.variableCollectionId===c.id).map(v=>v.id):c.variableIds,...(active?{variableIdsScope:'returned-page'}:{})})})),variables:page.items.map(v=>args.profile==='summary'?{id:v.id,name:v.name,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId}:{id:v.id,key:v.key,name:v.name,resolvedType:v.resolvedType,valuesByMode:modeIds?Object.fromEntries(Object.entries(v.valuesByMode).filter(([id])=>modeIds.has(id))):v.valuesByMode,scopes:v.scopes,description:v.description,variableCollectionId:v.variableCollectionId}),...(active?{pagination:page.pagination,coverage:{source:'local-file',collections:'returned-variable-page-and-requested-collections',variables:'filtered-variable-page',localCollectionCount:collections.length,emptyLocalCollectionCount:collections.filter(c=>c.variableIds.length===0).length,collectionInventoryComplete:false,libraryCollectionsIncluded:false}}:{})};break
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
        case 'get_motion_context': { const n=await this.node(args.nodeId); value={id:n.id,reactions:jsonValue(n.reactions) || [], motion:jsonValue(n.motion) ?? null,scope:'Public Plugin API only; cloud timeline conversion is not emulated'}; break }
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
          let count=0; const ids=[]
          const create=async (spec,parent) => {
            if(++count>500) throw new Error('Scene exceeds 500 nodes')
            const constructors={FRAME:'createFrame',TEXT:'createText',RECTANGLE:'createRectangle',ELLIPSE:'createEllipse',COMPONENT:'createComponent',SECTION:'createSection',STICKY:'createSticky',SHAPE_WITH_TEXT:'createShapeWithText'}
            const method=constructors[spec.type]; if(!method||typeof f[method]!=='function') throw new Error('Unsupported scene node type: '+spec.type)
            const n=f[method](); parent.appendChild(n); ids.push(n.id)
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
