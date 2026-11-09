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
