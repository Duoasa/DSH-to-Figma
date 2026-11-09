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
