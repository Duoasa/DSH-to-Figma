import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source=await readFile(new URL('../companion/context.js',import.meta.url),'utf8')
async function fixture(){
  let sequence=0
  const nodes=new Map()
  class Node {
    constructor(type){this.type=type;this.id=`1:${++sequence}`;this.name=type;this.x=0;this.y=0;this.width=100;this.height=100;this.fills=[];this.children=[];nodes.set(this.id,this)}
    appendChild(node){this.children.push(node);node.parent=this}
    async loadAsync(){}
    async getCSSAsync(){return {display:'flex'}}
  }
  const root=new Node('DOCUMENT'),page=new Node('PAGE');root.appendChild(page)
  const figma={root,currentPage:page,variables:{getLocalVariablesAsync:async()=>[]},getLocalPaintStylesAsync:async()=>[{id:'paint:1',name:'Surface',type:'PAINT'}],getLocalTextStylesAsync:async()=>[],getLocalEffectStylesAsync:async()=>[],getLocalGridStylesAsync:async()=>[]}
  for(const [method,type] of Object.entries({createFrame:'FRAME',createText:'TEXT',createComponent:'COMPONENT',createSticky:'STICKY',createRectangle:'RECTANGLE'}))figma[method]=()=>new Node(type)
  figma.createPage=()=>{const node=new Node('PAGE');root.appendChild(node);return node}
  const runtime={figma,node:async id=>{const node=nodes.get(id);if(!node)throw Error('Node unavailable');return node},screenshot:async()=>({type:'image',data:'fixture',mimeType:'image/png'})}
  const f={runtime,figma,page,nodes},context=vm.createContext({Uint8Array,Promise,console})
  vm.runInContext(source,context)
  f.execute=(method,args)=>context.DshFigmaContext.execute(f.runtime,method,args)
  f.semantic=(node,args={})=>f.execute('get_design_context',{semantic:true,nodeId:node.id,...args})
  return f
}
const plain=value=>JSON.parse(JSON.stringify(value))
const byteLength=value=>Buffer.byteLength(JSON.stringify(value))

test('semantic reads preserve layout, modes, style IDs, mixed text and async CSS',async()=>{
  const f=await fixture(),frame=f.figma.createFrame(),text=f.figma.createText()
  frame.name='Card';frame.constraints={horizontal:'STRETCH',vertical:'MIN'};frame.gridRowCount=2;frame.gridColumnCount=3;frame.resolvedVariableModes={theme:'dark'};frame.explicitVariableModes={theme:'dark'};frame.fillStyleId='S:paint'
  text.characters='Hello';text.fontName=Symbol('mixed');text.componentPropertyReferences={characters:'Label#123'};text.getStyledTextSegments=()=>[{start:0,end:5,characters:'Hello',fontName:{family:'Inter',style:'Regular'}}]
  frame.appendChild(text);f.page.appendChild(frame)
  const {value,images}=await f.semantic(frame,{includeCss:true})
  assert.equal(value.coverage.complete,true)
  assert.deepEqual(plain(value.node.constraints),{horizontal:'STRETCH',vertical:'MIN'})
  assert.equal(value.node.gridColumnCount,3)
  assert.equal(value.node.explicitVariableModes.theme,'dark')
  assert.equal(value.node.fillStyleId,'S:paint')
  assert.equal(value.node.children[0].fontName.$figmaMixed,true)
  assert.equal(value.node.children[0].textSegments[0].characters,'Hello')
  assert.equal(value.node.children[0].componentPropertyReferences.characters,'Label#123')
  assert.equal(value.node.css.display,'flex')
  assert.equal(images.length,0)
  assert.equal(await f.execute('get_design_context',{nodeId:frame.id}),null)
})

test('mixed range typography and paint style changes remain visible in complete semantic snapshots',async()=>{
  const f=await fixture(),text=f.figma.createText();text.characters='First\nSecond'
  for(const key of ['paragraphSpacing','paragraphIndent','fontWeight','fillStyleId'])text[key]=Symbol('mixed')
  let spacing=8
  text.getStyledTextSegments=fields=>{
    const range={characters:'First',start:0,end:5,paragraphSpacing:spacing,paragraphIndent:12,fontWeight:650,fillStyleId:'paint:range'}
    return [Object.fromEntries(Object.entries(range).filter(([key])=>['characters','start','end'].includes(key)||fields.includes(key)))]
  }
  const before=(await f.semantic(text)).value
  assert.equal(before.coverage.complete,true)
  assert.equal(before.node.textSegments[0].paragraphSpacing,8)
  assert.equal(before.node.textSegments[0].paragraphIndent,12)
  assert.equal(before.node.textSegments[0].fontWeight,650)
  assert.equal(before.node.textSegments[0].fillStyleId,'paint:range')
  spacing=16
  const after=(await f.semantic(text)).value
  assert.equal(after.coverage.complete,true)
  assert.notDeepEqual(plain(after.node),plain(before.node))
  delete text.getStyledTextSegments
  const unavailable=(await f.semantic(text)).value
  assert.equal(unavailable.coverage.complete,false)
  assert.match(unavailable.node.fieldErrors.textSegments,/Mixed text/)
})

test('FigJam text, connector endpoints and public table cells are represented',async()=>{
  const f=await fixture(),sticky=f.figma.createSticky(),connector=f.figma.createRectangle(),table=f.figma.createFrame()
  sticky.text={characters:'Discuss launch',fontSize:16};sticky.authorVisible=true
  connector.type='CONNECTOR';connector.text={characters:'next'};connector.connectorStart={endpointNodeId:sticky.id,magnet:'RIGHT'};connector.connectorEnd={position:{x:300,y:30}};connector.connectorLineType='ELBOWED'
  table.type='TABLE';table.numRows=2;table.numColumns=2;table.cellAt=(row,column)=>({text:{characters:`${row}:${column}`},width:120,height:40})
  for(const node of [sticky,connector,table])f.page.appendChild(node)
  const {value}=await f.execute('get_figjam',{semantic:true,nodeId:f.page.id})
  assert.equal(value.coverage.complete,true)
  assert.equal(value.node.children[0].text.characters,'Discuss launch')
  assert.equal(value.node.children[1].connectorStart.endpointNodeId,sticky.id)
  assert.equal(value.node.children[2].cells[3].text.characters,'1:1')
  const bounded=await f.semantic(table,{maxNodes:3})
  assert.equal(bounded.value.coverage.complete,false)
  assert.equal(bounded.value.node.cells.length,2)
  assert.deepEqual(plain(bounded.value.node.cellContinuation),{row:1,column:0,remaining:2})
})

test('component properties use set owner and instances resolve main component asynchronously',async()=>{
  const f=await fixture(),set=f.figma.createFrame(),variant=f.figma.createComponent(),instance=f.figma.createFrame()
  set.type='COMPONENT_SET';set.componentPropertyDefinitions={'Label#1':{type:'TEXT',defaultValue:'OK'}};set.appendChild(variant)
  Object.defineProperty(variant,'componentPropertyDefinitions',{get(){throw Error('Variant definitions must be read from its set')}})
  const component=await f.execute('get_component_context',{semantic:true,nodeId:variant.id})
  assert.equal(component.value.coverage.complete,true)
  assert.equal(component.value.node.propertyOwnerId,set.id)
  assert.equal(component.value.node.componentPropertyDefinitions['Label#1'].type,'TEXT')
  instance.type='INSTANCE';instance.componentProperties={'Label#1':{type:'TEXT',value:'Cancel'}};instance.getMainComponentAsync=async()=>variant
  const result=await f.execute('get_component_context',{semantic:true,nodeId:instance.id})
  assert.equal(result.value.node.mainComponent.id,variant.id)
  assert.equal(result.value.node.componentProperties['Label#1'].value,'Cancel')
  await assert.rejects(f.execute('get_component_context',{semantic:true,nodeId:f.page.id}),/Expected component/)
})

test('dedupe preserves changed instance descendants and maps only identical subtree IDs',async()=>{
  const f=await fixture(),main=f.figma.createComponent()
  for(const label of ['One','One','Two']){
    const instance=f.figma.createFrame(),text=f.figma.createText()
    instance.type='INSTANCE';instance.name='Button';instance.getMainComponentAsync=async()=>main
    text.name='Label';text.characters=label;instance.appendChild(text);f.page.appendChild(instance)
  }
  const {value}=await f.semantic(f.page,{dedupeComponents:true})
  const [first,second,third]=value.node.children
  assert.equal(value.coverage.complete,true)
  assert.equal(first.children[0].characters,'One')
  assert.equal(second.children,undefined)
  assert.equal(second.dedupedChildren.sourceNodeId,first.id)
  assert.equal(second.dedupedChildren.descendantIds[0],f.page.children[1].children[0].id)
  assert.equal(third.children[0].characters,'Two')
  assert.equal(Object.keys(value.sharedStyles).length,1)
  assert.equal(first.styleRefs.fills,third.styleRefs.fills)
  const raw=await f.semantic(f.page,{dedupeStyles:false})
  assert.deepEqual(plain(raw.value.node.children[0].fills),[])
})

test('node and depth budgets report omissions and section plans without claiming completeness',async()=>{
  const f=await fixture()
  for(let i=0;i<20;i++){const node=f.figma.createFrame();node.name=`Section ${i}`;f.page.appendChild(node)}
  const limited=await f.semantic(f.page,{maxNodes:4})
  assert.equal(limited.value.coverage.visited,4)
  assert.equal(limited.value.coverage.complete,false)
  assert.equal(limited.value.node.children.length,3)
  assert.equal(limited.value.node.childContinuation.remaining,17)
  assert.equal(limited.value.sectionPlan.totalSections,20)
  const shallow=await f.semantic(f.page,{depth:0})
  assert.equal(shallow.value.node.childrenOmitted,'depth')
  assert.equal(shallow.value.coverage.complete,false)
  await assert.rejects(f.semantic(f.page,{maxNodes:1501}),/maxNodes/)
  await assert.rejects(f.semantic(f.page,{includeCss:'yes'}),/includeCss/)
})

test('UTF-8 byte budgets and large names never silently drop content',async()=>{
  const f=await fixture(),text=f.figma.createText();text.name='😀'.repeat(3000);text.characters='汉字'.repeat(3000);f.page.appendChild(text)
  for(const maxBytes of [1024,2048,4096]){
    const {value}=await f.semantic(f.page,{maxBytes})
    assert.ok(byteLength(value)<=maxBytes,`${byteLength(value)} exceeds ${maxBytes}`)
    assert.equal(value.coverage.complete,false)
  }
  const {value}=await f.semantic(text,{maxBytes:32768})
  assert.equal(value.node.name,text.name)
  assert.equal(value.node.characters,text.characters)
  assert.equal(value.coverage.complete,true)
})

test('unreadable children and fields explicitly invalidate semantic completeness',async()=>{
  const f=await fixture(),node=f.figma.createFrame()
  Object.defineProperty(node,'constraints',{get(){throw Error('Not supported')}})
  Object.defineProperty(node,'children',{get(){throw Error('Node removed')}})
  const {value}=await f.semantic(node)
  assert.equal(value.coverage.complete,false)
  assert.equal(value.node.fieldErrors.constraints,'Not supported')
  assert.equal(value.node.childrenOmitted,'Node removed')
  assert.equal(value.sectionPlan.complete,false)
})

function variables(f,entries){
  const map=new Map(entries.map(v=>[v.id,{name:v.id,key:v.id,resolvedType:'FLOAT',variableCollectionId:'theme',scopes:['ALL_SCOPES'],...v}]))
  f.figma.variables.getVariableByIdAsync=async id=>map.get(id)??null
  f.figma.variables.getVariableCollectionByIdAsync=async()=>({id:'theme',name:'Theme',defaultModeId:'light',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}]})
}

test('target variable usage resolves mode-aware aliases and preserves used style IDs',async()=>{
  const f=await fixture(),node=f.figma.createFrame();f.page.appendChild(node)
  node.boundVariables={width:{type:'VARIABLE_ALIAS',id:'alias'}};node.resolvedVariableModes={theme:'dark'};node.fillStyleId='paint:1'
  variables(f,[{id:'alias',valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'base'},dark:{type:'VARIABLE_ALIAS',id:'base'}}},{id:'base',valuesByMode:{light:8,dark:16}}])
  const {value}=await f.execute('get_variable_defs',{nodeId:f.page.id})
  assert.equal(value.coverage.complete,true)
  assert.equal(value.variables.length,2)
  assert.equal(value.usages[0].resolved.value,16)
  assert.deepEqual(plain(value.styleIds),['paint:1'])
  assert.equal(value.collections[0].defaultModeId,'light')
  const limited=await f.execute('get_variable_defs',{nodeId:f.page.id,maxNodes:1})
  assert.equal(limited.value.coverage.complete,false)
  await assert.rejects(f.execute('get_variable_defs',{nodeId:node.id,query:'x'}),/does not combine/)
})

test('variable usage includes mixed range style identities and bounded segment bindings',async()=>{
  const f=await fixture(),text=f.figma.createText();text.characters='Mixed';text.textStyleId=Symbol('mixed');text.fillStyleId=Symbol('mixed');text.resolvedVariableModes={theme:'dark'}
  text.boundVariables={fontSize:[{type:'VARIABLE_ALIAS',id:'size'}]}
  text.getStyledTextSegments=()=>[{characters:'Mixed',start:0,end:5,textStyleId:'text:range',fillStyleId:'paint:range',boundVariables:{fontSize:{type:'VARIABLE_ALIAS',id:'size'}},fills:[{type:'SOLID',boundVariables:{color:{type:'VARIABLE_ALIAS',id:'color'}}}]}]
  variables(f,[{id:'size',valuesByMode:{light:12,dark:16}},{id:'color',resolvedType:'COLOR',valuesByMode:{light:{r:1,g:1,b:1},dark:{r:0,g:0,b:0}}}])
  const {value}=await f.execute('get_variable_defs',{nodeId:text.id})
  assert.equal(value.coverage.complete,true)
  assert.deepEqual(plain(value.styleIds).sort(),['paint:range','text:range'])
  assert.equal(value.usages.find(x=>x.variableId==='size').resolved.value,16)
  assert.equal(value.variables.length,2)
  delete text.getStyledTextSegments
  const absent=await f.execute('get_variable_defs',{nodeId:text.id})
  assert.equal(absent.value.coverage.complete,false)
  assert.match(absent.value.errors[0].error,/Mixed text/)
  text.getStyledTextSegments=()=>{throw Error('Range access unavailable')}
  const failed=await f.execute('get_variable_defs',{nodeId:text.id})
  assert.equal(failed.value.coverage.complete,false)
  assert.match(failed.value.errors[0].error,/Range access unavailable/)
  text.getStyledTextSegments=()=>Array.from({length:5001},()=>({textStyleId:'text:range'}))
  const bounded=await f.execute('get_variable_defs',{nodeId:text.id})
  assert.equal(bounded.value.coverage.complete,false)
  assert.match(bounded.value.errors[0].error,/5000 ranges/)
})

test('FigJam text sublayers preserve mixed segment styles and report unavailable ranges',async()=>{
  const f=await fixture(),sticky=f.figma.createSticky()
  sticky.text={characters:'Mixed note',fontWeight:Symbol('mixed'),textStyleId:Symbol('mixed'),getStyledTextSegments:()=>[{start:0,end:10,characters:'Mixed note',fontWeight:700,textStyleId:'text:note'}]}
  variables(f,[])
  const semantic=(await f.semantic(sticky)).value
  assert.equal(semantic.coverage.complete,true);assert.equal(semantic.node.text.textSegments[0].fontWeight,700)
  const usage=(await f.execute('get_variable_defs',{nodeId:sticky.id})).value
  assert.equal(usage.coverage.complete,true);assert.deepEqual(plain(usage.styleIds),['text:note'])
  delete sticky.text.getStyledTextSegments
  assert.equal((await f.semantic(sticky)).value.coverage.complete,false)
  assert.equal((await f.execute('get_variable_defs',{nodeId:sticky.id})).value.coverage.complete,false)
})

test('table variable and style usage visits bounded cells using the owning table modes',async()=>{
  const f=await fixture(),table=f.figma.createFrame();table.type='TABLE';table.numRows=2;table.numColumns=2;table.resolvedVariableModes={theme:'dark'}
  table.cellAt=()=>({text:{characters:'Cell',textStyleId:'text:cell',boundVariables:{fontSize:{type:'VARIABLE_ALIAS',id:'size'}}}})
  variables(f,[{id:'size',valuesByMode:{light:12,dark:16}}])
  const {value}=await f.execute('get_variable_defs',{nodeId:table.id})
  assert.equal(value.coverage.complete,true);assert.equal(value.coverage.visitedNodes,5)
  assert.equal(value.usages[0].nodeId,table.id);assert.equal(value.usages[0].resolved.value,16)
  assert.deepEqual(plain(value.styleIds),['text:cell'])
  const bounded=(await f.execute('get_variable_defs',{nodeId:table.id,maxNodes:2})).value
  assert.equal(bounded.coverage.complete,false);assert.equal(bounded.coverage.visitedNodes,2)
  assert.match(bounded.errors[0].error,/Table cell scan exceeds maxNodes/)
  delete table.cellAt
  assert.equal((await f.execute('get_variable_defs',{nodeId:table.id})).value.coverage.complete,false)
})

test('variable cycles, unavailable aliases and exhausted lookup budgets remain explicit',async()=>{
  const f=await fixture();f.page.boundVariables={width:{type:'VARIABLE_ALIAS',id:'a'}}
  variables(f,[{id:'a',valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'b'}}},{id:'b',valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'a'}}}])
  const cyclic=await f.execute('get_variable_defs',{nodeId:f.page.id})
  assert.equal(cyclic.value.coverage.complete,false)
  assert.equal(cyclic.value.usages[0].resolved.status,'alias-cycle')
  variables(f,[{id:'a',valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'missing'}}}])
  const missing=await f.execute('get_variable_defs',{nodeId:f.page.id})
  assert.equal(missing.value.coverage.complete,false)
  assert.equal(missing.value.missing[0].id,'missing')
  const small=await f.execute('get_variable_defs',{nodeId:f.page.id,maxBytes:1024})
  assert.ok(byteLength(small.value)<=1024)
  assert.equal(small.value.coverage.complete,false)
})

test('multi-page search batches queries, paginates, and never changes active page',async()=>{
  const f=await fixture(),other=f.figma.createPage(),active=f.figma.currentPage
  for(const page of [f.page,other])for(let i=0;i<3;i++){const node=f.figma.createComponent();node.name=`Button ${i}`;page.appendChild(node)}
  const {value}=await f.execute('search_design_system',{pageIds:[f.page.id,other.id],queries:[{entity:'components',query:'button'},{entity:'styles',query:'surface'}],limit:2})
  assert.equal(value.coverage.complete,true)
  assert.equal(value.results[0].components.pagination.total,6)
  assert.equal(value.results[0].components.pagination.nextOffset,2)
  assert.equal(value.results[1].styles.items[0].id,'paint:1')
  assert.equal(f.figma.currentPage,active)
  const bounded=await f.execute('search_design_system',{pageIds:[f.page.id,other.id],query:'button',kind:'components',maxNodes:2})
  assert.equal(bounded.value.coverage.complete,false)
  assert.equal(bounded.value.coverage.visitedNodes,2)
  assert.equal(bounded.value.results[0].components.pagination.totalIsExact,false)
  await assert.rejects(f.execute('search_design_system',{pageIds:[other.id],pageId:f.page.id,query:''}),/not both/)
  await assert.rejects(f.execute('search_design_system',{pageIds:[f.page.id],query:'',includeLibraryKeys:['cloud']}),/unavailable locally/)
})

test('local variable and style discovery is separately bounded and marks inexact totals',async()=>{
  const f=await fixture();f.figma.variables.getLocalVariablesAsync=async()=>Array.from({length:10},(_,i)=>({id:`v${i}`,name:`Spacing ${i}`,resolvedType:'FLOAT'}))
  const {value}=await f.execute('search_design_system',{pageIds:[f.page.id],queries:[{entity:'variables',query:'spacing'}],maxNodes:2})
  assert.equal(value.coverage.visitedNodes,0)
  assert.equal(value.coverage.scannedVariables,2)
  assert.equal(value.coverage.complete,false)
  assert.equal(value.results[0].variables.pagination.totalIsExact,false)
  assert.equal(value.results[0].variables.items.length,2)
  f.figma.getLocalPaintStylesAsync=async()=>{throw Error('Disconnected')}
  const failed=await f.execute('search_design_system',{pageIds:[f.page.id],query:'',kind:'styles'})
  assert.equal(failed.value.coverage.complete,false)
  assert.equal(failed.value.errors[0].error,'Disconnected')
})

test('enabled library variable search unions native descriptors without importing or reading values',async()=>{
  const f=await fixture(),active=f.page;let collections=0,reads=0,imports=0
  f.figma.variables.getLocalVariablesAsync=async()=>[{id:'local:1',name:'Brand local',resolvedType:'COLOR'}]
  f.figma.variables.importVariableByKeyAsync=()=>{imports++;throw Error('must not import')}
  const api={async getAvailableLibraryVariableCollectionsAsync(){assert.equal(this,api);collections++;return [{key:'enabled'}]},async getVariablesInLibraryCollectionAsync(key){assert.equal(this,api);assert.equal(key,'enabled');reads++;return [{key:'remote-key',name:'Brand remote',resolvedType:'COLOR',get valuesByMode(){throw Error('must not inspect values')}}]}}
  f.figma.teamLibrary=api
  const {value}=await f.execute('search_design_system',{pageIds:[f.page.id],kind:'variables',query:'brand',libraryCollectionKeys:['enabled'],maxNodes:2})
  const found=value.results[0].variables
  assert.equal(value.coverage.complete,true);assert.equal(found.pagination.total,2)
  assert.equal(found.items[0].source,'local');assert.equal(found.items[1].source,'library')
  assert.equal(found.items[1].key,'remote-key');assert.equal(found.items[1].libraryCollectionKey,'enabled')
  assert.equal(found.items[1].valuesByMode,undefined)
  assert.equal(value.coverage.scannedLocalVariables,1);assert.equal(value.coverage.scannedLibraryVariables,1)
  assert.equal(collections,1);assert.equal(reads,1);assert.equal(imports,0);assert.equal(f.figma.currentPage,active)
})

test('library query budgets and permission failures never claim exact or complete discovery',async()=>{
  const f=await fixture();let reads=0
  f.figma.variables.getLocalVariablesAsync=async()=>[{id:'local:1',name:'Spacing',resolvedType:'FLOAT'}]
  f.figma.teamLibrary={getAvailableLibraryVariableCollectionsAsync:async()=>[{key:'enabled'}],getVariablesInLibraryCollectionAsync:async()=>{reads++;return Array.from({length:3},(_,i)=>({key:'v'+i,name:'Spacing '+i,resolvedType:'FLOAT'}))}}
  const args={pageIds:[f.page.id],kind:'variables',query:'spacing',libraryCollectionKeys:['enabled']}
  const limited=(await f.execute('search_design_system',{...args,maxNodes:2})).value
  assert.equal(limited.coverage.complete,false);assert.equal(limited.coverage.scannedVariables,2)
  assert.equal(limited.results[0].variables.pagination.totalIsExact,false)
  const unknown=(await f.execute('search_design_system',{...args,libraryCollectionKeys:['not-enabled']})).value
  assert.equal(unknown.coverage.complete,false);assert.match(unknown.errors[0].error,/not found/);assert.equal(reads,1)
  f.figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync=async()=>{throw Error('Team library permission denied')}
  const denied=(await f.execute('search_design_system',args)).value
  assert.equal(denied.coverage.complete,false);assert.equal(denied.results[0].variables.discoveryComplete,false)
  assert.equal(denied.results[0].variables.items[0].source,'local');assert.match(denied.errors[0].error,/permission/)
  assert.equal(reads,1)
  await assert.rejects(f.execute('search_design_system',{...args,libraryCollectionKeys:['enabled','enabled']}),/unique/)
  await assert.rejects(f.execute('search_design_system',{...args,kind:'components'}),/requires a variable/)
})

test('library collection enumeration is bounded and does not expose unrequested collection metadata',async()=>{
  const f=await fixture();let reads=0
  f.figma.teamLibrary={getAvailableLibraryVariableCollectionsAsync:async()=>Array.from({length:5001},(_,i)=>({key:'collection'+i,get name(){throw Error('must not inspect names')}})),getVariablesInLibraryCollectionAsync:async()=>{reads++;return []}}
  const {value}=await f.execute('search_design_system',{pageIds:[f.page.id],kind:'variables',query:'',libraryCollectionKeys:['collection5000']})
  assert.equal(value.coverage.complete,false);assert.equal(value.coverage.libraryCollectionsScanned,5000)
  assert.equal(value.coverage.libraryCollectionBudget,5000);assert.equal(reads,0)
  assert.equal(value.errors.length,2);assert.equal(value.results[0].variables.pagination.totalIsExact,false)
})
