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
