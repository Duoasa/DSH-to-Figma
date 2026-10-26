import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureRuntime } from './fixtures.mjs'
import { LOCAL_TOOLS, requiresQueryFeatures, requiredQueryFeatureVersion } from '../lib/catalog.mjs'
const plain=value=>JSON.parse(JSON.stringify(value))

test('budget overflow on selection-based context continues at the selected node',async()=>{
  const f=await fixtureRuntime(),selected=f.figma.createFrame()
  f.page.appendChild(selected);f.page.selection=[selected]
  selected.getCSSAsync=async()=>({background:'x'.repeat(2000)})
  const result=await f.runtime.run('get_design_context',{maxBytes:1024,includeScreenshot:false})
  assert.equal(result.value.truncated,true);assert.equal(result.value.node.id,selected.id)
  assert.equal(result.value.node.continuation.nodeId,selected.id);assert.equal(result.value.node.type,'FRAME')
})

function children(f,count=8){
  const root=f.figma.createFrame();f.page.appendChild(root)
  for(let i=0;i<count;i++){const n=f.figma.createText();n.name='Label '+i;n.characters='Content '+i;n.fontName={family:'Inter',style:'Regular'};n.fontSize=14;n.effects=[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:.2},offset:{x:0,y:2},radius:4}];root.appendChild(n)}
  return root
}

test('summary reads avoid rich text/CSS getters and preserve useful discovery data',async()=>{
  const f=await fixtureRuntime(),root=children(f)
  let richReads=0,cssReads=0
  for(const child of root.children)child.getStyledTextSegments=()=>{richReads++;return [{characters:child.characters,fontSize:14}]}
  root.getCSSAsync=async()=>{cssReads++;return {display:'flex'}}
  const full=await f.runtime.run('get_metadata',{nodeId:root.id})
  assert.equal(richReads,8);assert.equal(full.value.children[0].fontSize,14)
  const summary=await f.runtime.run('get_metadata',{nodeId:root.id,profile:'summary'})
  assert.equal(richReads,8);assert.equal(summary.value.childCount,8)
  assert.equal(summary.value.children[0].id,root.children[0].id)
  assert.equal(summary.value.children[0].width,100)
  assert.equal(summary.value.children[0].characters,undefined)
  assert.equal(summary.value.children[0].fills,undefined)
  assert.equal(summary.value.children[0].textSegments,undefined)
  const context=await f.runtime.run('get_design_context',{nodeId:root.id,profile:'summary',includeScreenshot:false})
  assert.equal(cssReads,0);assert.equal(context.images.length,0)
  assert.ok(summary.metrics.valueBytes<full.metrics.valueBytes)
})

test('metadata pages direct children without gaps and exposes budget continuations',async()=>{
  const f=await fixtureRuntime(),root=children(f,7),seen=[]
  for(let offset=0;offset<7;offset+=3){
    const {value}=await f.runtime.run('get_metadata',{nodeId:root.id,profile:'summary',depth:1,offset,limit:3})
    seen.push(...value.children.map(n=>n.id))
    assert.equal(value.pagination.returned,value.children.length)
    assert.equal(value.pagination.total,7)
    assert.equal(value.pagination.hasMore,offset<6)
    assert.equal(value.pagination.nextOffset,offset<6?offset+3:null)
  }
  assert.deepEqual(seen,root.children.map(n=>n.id))
  const limited=await f.runtime.run('get_metadata',{nodeId:root.id,profile:'summary',depth:1,maxNodes:3,limit:7})
  assert.equal(limited.metrics.nodeCount,3);assert.equal(limited.value.children.length,2)
  assert.equal(limited.value.truncated,true);assert.equal(limited.value.reason,'maxNodes')
  assert.equal(limited.value.continuation.offset,2)
  const next=await f.runtime.run('get_metadata',plain(limited.value.continuation))
  assert.equal(next.value.children[0].id,root.children[2].id)
  const past=await f.runtime.run('get_metadata',{nodeId:root.id,offset:99,limit:2})
  assert.equal(past.value.children.length,0);assert.equal(past.value.pagination.nextOffset,null)
})

test('byte budgets expose omissions and bound non-ASCII metadata',async()=>{
  const f=await fixtureRuntime(),root=children(f,10)
  root.name='根节点';root.children[0].characters='设计😀'.repeat(8000)
  const {value,metrics}=await f.runtime.run('get_metadata',{nodeId:root.id,maxBytes:1024})
  assert.ok(Buffer.byteLength(JSON.stringify(value))<=1024)
  assert.equal(value.truncated,true)
  assert.ok(value.continuation)
  assert.equal(metrics.valueBytes,Buffer.byteLength(JSON.stringify(value)))
  const full=await f.runtime.run('get_metadata',{nodeId:root.children[0].id,depth:0})
  assert.equal(full.value.characters,root.children[0].characters)
})

test('query bounds fail explicitly before inspection',async()=>{
  const f=await fixtureRuntime(),root=children(f)
  for(const args of [{limit:0},{limit:201},{offset:-1},{offset:1.5},{maxNodes:0},{maxBytes:100},{depth:11},{profile:'tiny'}])await assert.rejects(f.runtime.run('get_metadata',{nodeId:root.id,...args}))
  await assert.rejects(f.runtime.run('get_metadata',{limit:2}),/nodeId/)
  await assert.rejects(f.runtime.run('get_metadata',{nodeId:root.id,depth:0,limit:2}),/depth/)
})

test('font filters are exact for family/style and paged without changing legacy results',async()=>{
  const f=await fixtureRuntime()
  f.figma.listAvailableFontsAsync=async()=>[{fontName:{family:'Inter',style:'Regular'}},{fontName:{family:'Inter',style:'Bold'}},{fontName:{family:'Noto Sans SC',style:'Regular'}}]
  assert.equal((await f.runtime.run('list_fonts')).value.length,3)
  const filtered=(await f.runtime.run('list_fonts',{family:'inter',style:'BOLD'})).value
  assert.equal(filtered.fonts.length,1);assert.equal(filtered.fonts[0].fontName.style,'Bold')
  const first=(await f.runtime.run('list_fonts',{query:'Inter',limit:1})).value
  const second=(await f.runtime.run('list_fonts',{query:'Inter',limit:1,offset:first.pagination.nextOffset})).value
  assert.equal(first.pagination.total,2);assert.notEqual(first.fonts[0].fontName.style,second.fonts[0].fontName.style)
  await assert.rejects(f.runtime.run('list_fonts',{query:4}),/string/)
})

test('variable filters preserve raw aliases and restrict modes, collections and result pages',async()=>{
  const f=await fixtureRuntime(),variables=[
    {id:'v1',name:'color/base',resolvedType:'COLOR',variableCollectionId:'c1',valuesByMode:{light:{r:1,g:1,b:1},dark:{r:0,g:0,b:0}}},
    {id:'v2',name:'color/surface',resolvedType:'COLOR',variableCollectionId:'c1',valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'v1'},dark:{type:'VARIABLE_ALIAS',id:'v1'}}},
    {id:'v3',name:'spacing/small',resolvedType:'FLOAT',variableCollectionId:'c2',valuesByMode:{base:4}}]
  f.figma.variables.getLocalVariablesAsync=async()=>variables
  f.figma.variables.getLocalVariableCollectionsAsync=async()=>[
    {id:'c1',name:'Theme',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}],defaultModeId:'light',variableIds:['v1','v2']},
    {id:'c2',name:'Spacing',modes:[{modeId:'base',name:'Base'}],defaultModeId:'base',variableIds:['v3']}]
  const legacy=(await f.runtime.run('get_variable_defs')).value
  assert.equal(legacy.variables.length,3);assert.equal(legacy.pagination,undefined);assert.equal(legacy.coverage,undefined)
  const result=(await f.runtime.run('get_variable_defs',{collectionIds:['c1'],type:'COLOR',query:'surface',modeIds:['dark']})).value
  assert.equal(result.variables.length,1);assert.equal(result.collections.length,1)
  assert.deepEqual(plain(result.variables[0].valuesByMode),{dark:{type:'VARIABLE_ALIAS',id:'v1'}})
  assert.equal(result.collections[0].modes.length,1)
  assert.equal(result.collections[0].variableIdsScope,'returned-page')
  const summary=(await f.runtime.run('get_variable_defs',{profile:'summary',limit:1})).value
  assert.equal(summary.variables[0].valuesByMode,undefined);assert.equal(summary.collections[0].variableIds,undefined)
  assert.equal(summary.pagination.hasMore,true)
  const ids=(await f.runtime.run('get_variable_defs',{ids:['v3']})).value
  assert.equal(ids.variables[0].id,'v3')
  await assert.rejects(f.runtime.run('get_variable_defs',{modeIds:['absent']}),/unknown mode/)
  await assert.rejects(f.runtime.run('get_variable_defs',{ids:[]}),/IDs/)
})

test('empty variable pages expose incomplete collection coverage without implying no collections exist',async()=>{
  const f=await fixtureRuntime(),collections=[
    {id:'empty',name:'Empty theme',modes:[{modeId:'light',name:'Light'}],defaultModeId:'light',variableIds:[]},
    {id:'populated',name:'Populated theme',modes:[{modeId:'dark',name:'Dark'}],defaultModeId:'dark',variableIds:['v1']}]
  f.figma.variables.getLocalVariableCollectionsAsync=async()=>collections
  f.figma.variables.getLocalVariablesAsync=async()=>[{id:'v1',name:'color/primary',resolvedType:'COLOR',variableCollectionId:'populated',valuesByMode:{dark:{r:0,g:0,b:0}}}]
  const missing=(await f.runtime.run('get_variable_defs',{profile:'summary',query:'not-present',limit:1})).value
  assert.equal(missing.variables.length,0);assert.equal(missing.collections.length,0);assert.equal(missing.pagination.total,0)
  assert.equal(missing.coverage.localCollectionCount,2);assert.equal(missing.coverage.emptyLocalCollectionCount,1)
  assert.equal(missing.coverage.collectionInventoryComplete,false);assert.equal(missing.coverage.libraryCollectionsIncluded,false)
  assert.equal(missing.coverage.collections,'returned-variable-page-and-requested-collections')
  const requested=(await f.runtime.run('get_variable_defs',{collectionIds:['empty','populated'],profile:'summary',limit:1})).value
  assert.deepEqual(plain(requested.collections.map(c=>c.id)),['empty','populated'])
  assert.equal(requested.variables.length,1)
  const past=(await f.runtime.run('get_variable_defs',{profile:'summary',offset:99,limit:1})).value
  assert.equal(past.pagination.total,1);assert.equal(past.collections.length,0)
  assert.equal(past.coverage.localCollectionCount,2);assert.equal(past.coverage.collectionInventoryComplete,false)
  const legacy=(await f.runtime.run('get_variable_defs')).value
  assert.deepEqual(Object.keys(legacy).sort(),['collections','variables'])
  assert.deepEqual(plain(legacy.collections.map(c=>c.id)),['empty','populated'])
  assert.deepEqual(plain(legacy.collections[0].variableIds),[])
})

test('collection inventory finds empty collections without reading variables and pages the collection list',async()=>{
  const f=await fixtureRuntime(),collections=[
    {id:'c1',name:'Empty theme',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}],defaultModeId:'light',variableIds:[]},
    {id:'c2',name:'Theme tokens',modes:[{modeId:'base',name:'Base'}],defaultModeId:'base',variableIds:['v1','v2']},
    {id:'c3',name:'Spacing',modes:[{modeId:'space',name:'Base'}],defaultModeId:'space',variableIds:['v3']}]
  f.figma.variables.getLocalVariableCollectionsAsync=async()=>collections
  f.figma.variables.getLocalVariablesAsync=async()=>{throw Error('Inventory must not fetch variables')}
  const first=(await f.runtime.run('get_variable_defs',{collectionsOnly:true,query:'THEME',limit:1})).value
  assert.equal(first.collections[0].id,'c1');assert.equal(first.collections[0].variableCount,0)
  assert.equal(first.collections[0].variableIds,undefined);assert.equal(first.variables.length,0)
  assert.equal(first.pagination.total,2);assert.equal(first.pagination.hasMore,true)
  assert.equal(first.coverage.variables,'not-read');assert.equal(first.coverage.localCollectionCount,3)
  assert.equal(first.coverage.collectionInventoryComplete,false)
  const second=(await f.runtime.run('get_variable_defs',{collectionsOnly:true,query:'theme',offset:first.pagination.nextOffset,limit:1})).value
  assert.equal(second.collections[0].id,'c2');assert.equal(second.collections[0].variableCount,2)
  assert.equal(second.pagination.hasMore,false);assert.equal(second.coverage.collectionInventoryComplete,false)
  const scoped=(await f.runtime.run('get_variable_defs',{collectionsOnly:true,collectionIds:['c1'],modeIds:['dark']})).value
  assert.equal(scoped.collections[0].modes.length,1);assert.equal(scoped.collections[0].modes[0].modeId,'dark')
  assert.equal(scoped.coverage.collectionInventoryComplete,false)
  const all=(await f.runtime.run('get_variable_defs',{collectionsOnly:true})).value
  assert.equal(all.collections.length,3);assert.equal(all.coverage.collectionInventoryComplete,true)
  assert.equal(all.coverage.collections,'filtered-collection-page-including-empty')
  for(const args of [{ids:['v1']},{type:'COLOR'},{limit:0},{offset:-1},{modeIds:['absent']}])await assert.rejects(f.runtime.run('get_variable_defs',{collectionsOnly:true,...args}))
  await assert.rejects(f.runtime.run('get_variable_defs',{collectionsOnly:'yes'}),/boolean/)
})

test('a file with only an empty collection is distinguishable from a file with none',async()=>{
  const f=await fixtureRuntime()
  f.figma.variables.getLocalVariableCollectionsAsync=async()=>[{id:'empty',name:'Existing empty',modes:[{modeId:'base',name:'Base'}],defaultModeId:'base',variableIds:[]}]
  f.figma.variables.getLocalVariablesAsync=async()=>[]
  const summary=(await f.runtime.run('get_variable_defs',{profile:'summary'})).value
  assert.equal(summary.collections.length,0);assert.equal(summary.variables.length,0)
  assert.equal(summary.coverage.localCollectionCount,1);assert.equal(summary.coverage.emptyLocalCollectionCount,1)
  const inventory=(await f.runtime.run('get_variable_defs',{collectionsOnly:true})).value
  assert.equal(inventory.collections[0].id,'empty');assert.equal(inventory.coverage.collectionInventoryComplete,true)
  f.figma.variables.getLocalVariableCollectionsAsync=async()=>[]
  const none=(await f.runtime.run('get_variable_defs',{collectionsOnly:true})).value
  assert.equal(none.collections.length,0);assert.equal(none.coverage.localCollectionCount,0)
  assert.equal(none.coverage.collectionInventoryComplete,true)
})

test('design-system kind avoids unrelated APIs and explicit page searches do not change current page',async()=>{
  const f=await fixtureRuntime(),other=f.figma.createPage(),component=f.figma.createComponent()
  other.appendChild(component);component.name='Button';component.fills=[{type:'SOLID',color:{r:1,g:0,b:0}}]
  let loads=0;other.loadAsync=async()=>{loads++}
  f.figma.variables.getLocalVariablesAsync=async()=>{throw Error('unrelated variable scan')}
  f.figma.getLocalPaintStylesAsync=async()=>{throw Error('unrelated style scan')}
  const {value}=await f.runtime.run('search_design_system',{query:'Button',kind:'components',pageId:other.id,profile:'summary',limit:1})
  assert.equal(loads,1);assert.equal(f.figma.currentPage.id,f.page.id)
  assert.equal(value.components[0].id,component.id);assert.equal(value.components[0].fills,undefined)
  assert.equal(value.pagination.components.total,1)
  await assert.rejects(f.runtime.run('search_design_system',{query:'',kind:'bad'}),/kind/)
})

test('screenshot presets retain legacy size and report numeric PNG metrics outside model value',async()=>{
  const f=await fixtureRuntime(),root=children(f,0);root.width=3200;root.height=1600
  const original=root.exportAsync.bind(root),scales=[]
  root.exportAsync=async options=>{scales.push(options.constraint.value);return original(options)}
  const overview=await f.runtime.run('get_screenshot',{nodeId:root.id,quality:'overview'})
  await f.runtime.run('get_screenshot',{nodeId:root.id,quality:'detail'})
  await f.runtime.run('get_screenshot',{nodeId:root.id})
  await f.runtime.run('get_screenshot',{nodeId:root.id,quality:'overview',scale:1})
  assert.deepEqual(scales,[.25,.5,.5,1])
  assert.equal(overview.metrics.imageCount,1);assert.equal(overview.metrics.images[0].width,1)
  assert.ok(overview.metrics.images[0].bytes>0)
  assert.equal(overview.value.metrics,undefined)
  for(const key of ['runtimeMs','exportMs','serializationMs','nodeCount','imageCount','valueBytes'])assert.equal(typeof overview.metrics[key],'number')
  await assert.rejects(f.runtime.run('get_screenshot',{nodeId:root.id,quality:'huge'}),/quality/)
})

test('schema feature detection keeps legacy calls available to old companions',()=>{
  assert.equal(requiresQueryFeatures('get_metadata',{nodeId:'1:2',depth:1}),false)
  assert.equal(requiresQueryFeatures('get_design_context',{includeScreenshot:false}),false)
  for(const [method,args] of [['get_metadata',{profile:'summary'}],['get_variable_defs',{ids:['v']}],['get_screenshot',{quality:'overview'}],['list_fonts',{query:'Inter'}]])assert.equal(requiresQueryFeatures(method,args),true)
  assert.equal(requiresQueryFeatures('use_figma',{code:'return 1'}),false)
  assert.equal(requiresQueryFeatures('get_metadata',{unknown:true}),false)
  assert.ok(LOCAL_TOOLS.find(t=>t.name==='get_metadata').inputSchema.properties.maxBytes)
  assert.equal(requiredQueryFeatureVersion('get_metadata',{nodeId:'1:2',depth:1}),0)
  assert.equal(requiredQueryFeatureVersion('get_variable_defs',{profile:'summary'}),1)
  assert.equal(requiredQueryFeatureVersion('get_variable_defs',{collectionsOnly:true}),2)
  assert.equal(requiredQueryFeatureVersion('get_variable_defs',{collectionsOnly:false}),2)
  assert.equal(requiresQueryFeatures('get_variable_defs',{collectionsOnly:true}),true)
  assert.equal(LOCAL_TOOLS.find(t=>t.name==='get_variable_defs').inputSchema.properties.collectionsOnly.type,'boolean')
})

test('selection and component summaries retain identity without copying visual properties',async()=>{
  const f=await fixtureRuntime(),component=f.figma.createComponent();component.name='Control';component.opacity=.5;component.rotation=12;f.page.appendChild(component);f.page.selection=[component]
  const selection=(await f.runtime.run('get_selection',{profile:'summary'})).value
  assert.equal(selection.selection[0].id,component.id);assert.equal(selection.selection[0].type,'COMPONENT')
  assert.equal(selection.selection[0].name,'Control');assert.equal(selection.selection[0].rotation,12)
  assert.equal(selection.selection[0].opacity,undefined)
  const result=await f.runtime.run('get_component_context',{nodeId:component.id,profile:'summary'})
  assert.equal(result.value.width,100);assert.equal(result.value.childCount,0)
  const legacy=(await f.runtime.run('get_component_context',{nodeId:component.id})).value
  assert.equal(legacy.opacity,.5)
})

test('metadata reports omitted fields separately from child continuation',async()=>{
  const f=await fixtureRuntime(),root=children(f,2)
  root.characters='長'.repeat(2000)
  const result=(await f.runtime.run('get_metadata',{nodeId:root.id,maxBytes:2048,profile:'full',depth:1})).value
  assert.ok(result.omittedFields.includes('characters'))
  assert.equal(result.fieldContinuation.nodeId,root.id)
  const recovered=(await f.runtime.run('get_metadata',plain(result.fieldContinuation))).value
  assert.equal(recovered.characters,root.characters)
})

test('asset exports contribute export duration without becoming image attachments',async()=>{
  const f=await fixtureRuntime(),root=children(f,0),original=root.exportAsync.bind(root)
  root.exportAsync=async options=>{await new Promise(resolve=>setTimeout(resolve,8));return original(options)}
  const result=await f.runtime.run('download_assets',{nodeId:root.id})
  assert.equal(result.assets.length,1);assert.equal(result.images.length,0)
  assert.equal(result.metrics.images.length,0);assert.equal(result.metrics.imageCount,0)
  assert.ok(result.metrics.exportMs>=5)
})
