import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { validateCaptureOptions,captureDomSnapshot } from '../lib/dom-capture.mjs'

const source=await readFile(new URL('../companion/authoring.js',import.meta.url),'utf8')
const plain=value=>JSON.parse(JSON.stringify(value))
function fixture(editorType='figma'){
  let counter=0
  const nodes=new Map(),loaded=[],created=[],imports=[],slideGrid=[[],[],[],[]]
  function make(type,parent){
    const node={id:String(++counter),type,name:type,x:0,y:0,width:100,height:100,fills:[],strokes:[],effects:[],children:[],visible:true,
      resize(width,height){this.width=width;this.height=height;if(this.type==='TEXT')this.textAutoResize='NONE'},
      appendChild(child){if(child.parent)child.parent.children=child.parent.children.filter(x=>x!==child);this.children.push(child);child.parent=this}}
    if(type==='SHAPE_WITH_TEXT'||type==='CONNECTOR')node.text={}
    if(type==='TEXT'){let mode='WIDTH_AND_HEIGHT';Object.defineProperty(node,'textAutoResize',{get(){return mode},set(value){mode=value;if(value==='HEIGHT')this.height=Math.max(1,Math.ceil((this.characters||'').length/Math.max(1,Math.floor(this.width/((this.fontSize||16)*.55)))))*(this.fontSize||16)*1.3}})}
    if(type==='SLIDE'){node.width=1920;node.height=1080;node.speakerNotes=''}
    nodes.set(node.id,node);if(parent)parent.appendChild(node);return node
  }
  const page=make('PAGE')
  const figma={editorType,currentPage:page,commitUndo(){},async loadFontAsync(font){loaded.push(font)},
    createShapeWithText(){const n=make('SHAPE_WITH_TEXT',page);created.push(n);return n},createConnector(){const n=make('CONNECTOR',page);created.push(n);return n},
    createFrame(){const n=make('FRAME',page);created.push(n);return n},createText(){const n=make('TEXT',page);created.push(n);return n},
    getSlideGrid(){return slideGrid},createSlide(row=3,col=slideGrid[row].length){const n=make('SLIDE',page);n.row=row;n.col=col;slideGrid[row].splice(col,0,n);created.push(n);return n},
    async listAvailableShaders(){return catalog},async importShaderById(id){imports.push(id);return {...catalog.find(x=>x.id===id),imported:true,propertyDefinitions:definitions}}}
  const definitions={amount:{name:'Amount',type:'NUMBER'},tint:{name:'Tint',type:'COLOR'},gradient:{name:'Gradient',type:'GRADIENT'}}
  const catalog=[{id:'fill-1',name:'Ocean',type:'fill',imported:true,propertyDefinitions:definitions},{id:'fx-1',name:'Glow',type:'effect',imported:false}]
  const runtime={figma,async node(id){const n=nodes.get(id);if(!n)throw new Error('Node not found');return n}}
  const ctx=vm.createContext({});vm.runInContext(source,ctx)
  return {figma,page,nodes,created,loaded,imports,catalog,make,parse:ctx.DshFigmaAuthoring.parseMermaid,run:(method,args={})=>ctx.DshFigmaAuthoring.execute(runtime,method,args)}
}

test('diagram validates all endpoints and unique keys before loading fonts or writing',async()=>{
  const f=fixture('figjam')
  await assert.rejects(f.run('generate_diagram',{nodes:[{key:'a',label:'A'}],edges:[{from:'a',to:'missing'}]}),/known node/)
  await assert.rejects(f.run('generate_diagram',{nodes:[{key:'a',label:'A'},{key:'a',label:'Again'}]}),/unique/)
  assert.equal(f.created.length,0);assert.equal(f.loaded.length,0)
})
test('native FigJam diagram has deterministic layers and attached connector endpoints',async()=>{
  const f=fixture('figjam'),args={nodes:[{key:'a',label:'Start',shape:'terminal'},{key:'b',label:'Check',shape:'decision'},{key:'c',label:'Finish'}],edges:[{from:'a',to:'b',label:'next'},{from:'b',to:'c'}],origin:{x:20,y:30}}
  const {value}=await f.run('generate_diagram',args),shapes=f.created.slice(0,3),edges=f.created.slice(3)
  assert.deepEqual(shapes.map(x=>[x.x,x.y]),[[20,30],[340,30],[660,30]])
  assert.deepEqual(shapes.map(x=>x.shapeType),['ELLIPSE','DIAMOND','ROUNDED_RECTANGLE'])
  assert.deepEqual(plain(edges[0].connectorStart),{endpointNodeId:value.nodes.a,magnet:'AUTO'})
  assert.equal(edges[0].connectorEnd.endpointNodeId,value.nodes.b);assert.equal(edges[1].connectorEnd.endpointNodeId,value.nodes.c)
  assert.equal(edges[0].text.characters,'next');assert.equal(value.createdNodeIds.length,5);assert.equal(f.loaded.length,1)
})
test('limited Mermaid rejects unsupported syntax and preserves cycles with explicit warning',async()=>{
  const f=fixture('figjam')
  assert.throws(()=>f.parse('sequenceDiagram\n A->B'),/Only Mermaid/)
  assert.throws(()=>f.parse('flowchart LR\n A --> B --> C'),/one Mermaid edge/)
  assert.throws(()=>f.parse('flowchart LR\n A[One]\n A[Two]'),/Conflicting/)
  const {value}=await f.run('generate_diagram',{mermaid:'flowchart TB\n A[Start] -->|next| B{Check}\n B --> A',origin:{x:0,y:0}})
  assert.equal(value.direction,'TB');assert.equal(value.warnings[0].code,'CYCLIC_LAYOUT');assert.equal(value.edgeCount,2)
})
test('diagram editor and font gates run before writes; partial failure returns created IDs',async()=>{
  const wrong=fixture('figma');await assert.rejects(wrong.run('generate_diagram',{nodes:[]}),/figjam editor/);assert.equal(wrong.created.length,0)
  const fonts=fixture('figjam');fonts.figma.loadFontAsync=async()=>{throw new Error('font missing')};await assert.rejects(fonts.run('generate_diagram',{nodes:[{key:'a',label:'A'}]}),/font missing/);assert.equal(fonts.created.length,0)
  const f=fixture('figjam'),create=f.figma.createShapeWithText;f.figma.createShapeWithText=()=>{if(f.created.length)throw new Error('write failed');return create()}
  await assert.rejects(f.run('generate_diagram',{nodes:[{key:'a',label:'A'},{key:'b',label:'B'}]}),e=>{assert.deepEqual(plain(e.createdNodeIds),[f.created[0].id]);assert.equal(e.safeToRetryWithoutCanvasRead,false);return true})
})
test('deck uses existing Slides native slide API, theme, notes, and fixed row',async()=>{
  const f=fixture('slides'),{value}=await f.run('generate_deck',{slides:[{title:'First',body:['Point A','Point B'],notes:'Speaker notes'},{title:'Next'}],row:3,theme:{background:'#123456',fontFamily:'Inter',fontStyle:'Regular'}})
  const slide=f.nodes.get(value.slideIds[0]);assert.equal(value.slideCount,2);assert.equal(slide.row,3);assert.equal(slide.col,0);assert.equal(slide.speakerNotes,'Speaker notes');assert.equal(slide.children[1].characters,'Point A\n\nPoint B');assert.equal(slide.fills[0].color.r,0x12/255);assert.equal(value.createdNodeIds.length,8);assert.equal(value.requiresVisualReview,true)
  await assert.rejects(f.run('generate_deck',{slides:[{title:'Valid'},{title:''}]}),/nonempty/);assert.equal(f.created.length,8)
})
test('deck has capability gate and visible text overflow report',async()=>{
  const f=fixture('slides'),{value}=await f.run('generate_deck',{slides:[{title:'Title',body:Array(12).fill('x'.repeat(1200))}]})
  assert.equal(value.warnings[0].code,'TEXT_OVERFLOW')
  delete f.figma.createSlide;await assert.rejects(f.run('generate_deck',{slides:[{title:'Title'}]}),/createSlide/)
})
test('deck appends to existing rows and reports unavailable native notes instead of pretending persistence',async()=>{
  const f=fixture('slides');const existing=f.figma.createSlide();const create=f.figma.createSlide
  f.figma.createSlide=(...args)=>{const n=create(...args);delete n.speakerNotes;return n}
  const {value}=await f.run('generate_deck',{row:3,slides:[{title:'New',notes:'Not silently saved'}]})
  assert.equal(f.nodes.get(value.slideIds[0]).col,1);assert.equal(f.figma.getSlideGrid()[3][0],existing)
  assert.equal(value.warnings[0].code,'NOTES_UNAVAILABLE');assert.equal(f.nodes.get(value.slideIds[0]).speakerNotes,undefined)
  const count=f.created.length;await assert.rejects(f.run('generate_deck',{row:99,slides:[{title:'Missing row'}]}),/existing slide row/);assert.equal(f.created.length,count)
})
test('shader catalog is paginated and definitions require explicit IDs',async()=>{
  const f=fixture(),first=(await f.run('get_shaders',{limit:1})).value
  assert.equal(first.shaders.length,1);assert.equal(first.shaders[0].propertyDefinitions,undefined);assert.equal(first.pagination.nextOffset,1)
  const selected=(await f.run('get_shaders',{shaderIds:['fill-1']})).value
  assert.equal(selected.shaders[0].propertyDefinitions.amount.type,'NUMBER');assert.equal(selected.pagination.hasMore,false)
})
test('shader application validates definition IDs and preserves same shader assignments',async()=>{
  const f=fixture(),n=f.make('FRAME',f.page);n.fills=[{type:'SHADER',id:'fill-1',opacity:.3,properties:{tint:{r:1,g:0,b:0}}}]
  await assert.rejects(f.run('apply_shader',{nodeId:n.id,shaderId:'fill-1',index:0,properties:{Amount:1}}),/definition ID/)
  await assert.rejects(f.run('apply_shader',{nodeId:n.id,shaderId:'fill-1',index:0,properties:{amount:'wrong'}}),/Invalid value/)
  assert.equal(n.fills[0].properties.amount,undefined)
  await f.run('apply_shader',{nodeId:n.id,shaderId:'fill-1',index:0,properties:{amount:2,gradient:{stops:[{position:0,color:{type:'VARIABLE_ALIAS',id:'var-1'}}]}}})
  assert.equal(n.fills[0].opacity,.3);assert.equal(n.fills[0].properties.amount,2);assert.equal(n.fills[0].properties.tint.r,1);assert.equal(f.imports.length,0)
})
test('shader slot mismatch never imports, while post-import validation reports resource mutation',async()=>{
  const f=fixture(),n=f.make('FRAME',f.page)
  await assert.rejects(f.run('apply_shader',{nodeId:n.id,shaderId:'fx-1',slot:'fills'}),/kind/);assert.equal(f.imports.length,0)
  await assert.rejects(f.run('apply_shader',{nodeId:n.id,shaderId:'fx-1',slot:'effects',properties:{unknown:1}}),/was imported/);assert.deepEqual(f.imports,['fx-1']);assert.equal(n.effects.length,0)
  await f.run('apply_shader',{nodeId:n.id,shaderId:'fx-1',slot:'effects',properties:{amount:1}});assert.equal(n.effects[0].type,'SHADER');assert.equal(n.effects[0].visible,true)
})
test('read-only native modes reject authoring before font loading or resource import',async()=>{
  const f=fixture('slides');f.figma.mode='inspect'
  for(const method of ['generate_deck','generate_diagram','import_dom_snapshot','apply_shader'])await assert.rejects(f.run(method,{}),/default edit mode/)
  assert.equal(f.created.length,0);assert.equal(f.imports.length,0);assert.equal(f.loaded.length,0)
  assert.equal((await f.run('get_shaders',{})).value.shaders.length,2)
})
test('shader usage traversal reports bounded partial scope and scans all paint/effect slots',async()=>{
  const f=fixture(),a=f.make('FRAME',f.page),b=f.make('FRAME',a);a.strokes=[{type:'SHADER',id:'fill-1'}];b.effects=[{type:'SHADER',id:'fx-1',properties:{amount:1}}]
  const partial=(await f.run('list_file_shaders',{maxNodes:2})).value;assert.equal(partial.complete,false);assert.equal(partial.uses.length,1);assert.equal(partial.continuation.nodeIds[0],b.id)
  const full=(await f.run('list_file_shaders',{})).value;assert.equal(full.complete,true);assert.deepEqual(Array.from(full.uses,x=>x.slot),['strokes','effects'])
})

const snapshot=()=>({name:'Web page',width:800,height:600,children:[{key:'panel',tag:'section',bounds:{x:10,y:20,width:400,height:300},styles:{backgroundColor:'rgb(255, 255, 255)',borderRadius:'8px',borderWidth:'1px',borderColor:'#123456',boxShadow:'0 1px 5px black'},children:[{tag:'p',text:'Editable text',bounds:{x:12,y:14,width:300,height:40},styles:{fontFamily:'Inter',fontStyle:'Regular',fontSize:'16px',color:'#333333'}},{tag:'img',bounds:{x:0,y:80,width:100,height:50}}]}]})
test('DOM snapshot becomes native editable fixed boxes and text with unsupported reports',async()=>{
  const f=fixture(),{value}=await f.run('import_dom_snapshot',{snapshot:snapshot(),origin:{x:100,y:200}}),root=f.nodes.get(value.rootNodeId),panel=root.children[0]
  assert.equal(root.x,100);assert.equal(root.y,200);assert.equal(panel.x,10);assert.equal(panel.children[0].x,12);assert.equal(panel.children[0].children[0].characters,'Editable text');assert.equal(panel.cornerRadius,8);assert.equal(panel.strokeAlign,'INSIDE');assert.equal(value.inputNodeCount,3);assert.match(value.layoutContract,/relative to the parent/);assert.ok(value.warnings.some(w=>w.property==='boxShadow'));assert.ok(value.warnings.some(w=>w.tag==='img'))
})
test('DOM malformed late child is rejected before fonts or canvas writes',async()=>{
  const f=fixture(),data=snapshot();data.children[0].children[1].bounds.width=-1
  await assert.rejects(f.run('import_dom_snapshot',{snapshot:data}),/width/);assert.equal(f.created.length,0);assert.equal(f.loaded.length,0)
})
test('native resize resets text mode, so DOM and deck restore HEIGHT after setting width',async()=>{
  const f=fixture(),data=snapshot();data.children[0].children[0].text='Long text '.repeat(80)
  const {value}=await f.run('import_dom_snapshot',{snapshot:data})
  const t=f.created.find(n=>n.type==='TEXT');assert.equal(t.textAutoResize,'HEIGHT');assert.equal(t.width,300);assert.ok(t.height>40);assert.ok(value.warnings.some(w=>w.reason==='text-overflow'))
  const slides=fixture('slides');await slides.run('generate_deck',{slides:[{title:'Title',body:['Body']}]});assert.ok(slides.created.filter(n=>n.type==='TEXT').every(n=>n.textAutoResize==='HEIGHT'))
})
test('DOM fonts are all preloaded; fallback is explicit and strict mode aborts before writes',async()=>{
  const f=fixture(),data=snapshot();data.children[0].children[0].styles.fontFamily='Missing';f.figma.loadFontAsync=async font=>{if(font.family==='Missing')throw new Error('missing')}
  await assert.rejects(f.run('import_dom_snapshot',{snapshot:data,fontPolicy:'strict'}),/missing/);assert.equal(f.created.length,0)
  const {value}=await f.run('import_dom_snapshot',{snapshot:data});assert.equal(value.warnings.find(w=>w.reason==='font-substituted').used.family,'Inter')
  const text=f.created.find(n=>n.type==='TEXT');assert.equal(text.fontName.family,'Inter')
})
test('DOM node cap is enforced and unknown tools return null',async()=>{
  const f=fixture(),data=snapshot();data.children=Array.from({length:501},()=>data.children[0]);await assert.rejects(f.run('import_dom_snapshot',{snapshot:data}),/500/);assert.equal(await f.run('not_authoring'),null)
})
test('browser capture validates protocol, credentials, viewport and executable before launching',()=>{
  for(const url of ['file:///etc/passwd','javascript:alert(1)','https://user:pass@example.com','not a URL'])assert.throws(()=>validateCaptureOptions({url}))
  assert.throws(()=>validateCaptureOptions({url:'http://localhost',viewport:{width:0,height:900}}),/viewport.width/)
  assert.throws(()=>validateCaptureOptions({url:'http://localhost',executablePath:'chrome'}),/absolute path/)
  assert.deepEqual(validateCaptureOptions({url:'http://localhost:3000'}).viewport,{width:1440,height:900})
  assert.equal(validateCaptureOptions({url:'http://localhost:3000'}).url,'http://localhost:3000/')
})
test('aborted browser capture fails before opening a browser',async()=>{
  const controller=new AbortController();controller.abort(new Error('cancelled capture'))
  await assert.rejects(captureDomSnapshot({url:'http://localhost:3000',signal:controller.signal}),/cancelled capture/)
})
