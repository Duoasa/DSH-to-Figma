import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureRuntime } from './fixtures.mjs'
const plain=x=>JSON.parse(JSON.stringify(x))
test('scripts create editable layout and text, unwrap node arguments, query and screenshot',async()=>{
  const f=await fixtureRuntime()
  const output=await f.runtime.run('use_figma',{code:`const card=figma.createAutoLayout('VERTICAL',{name:'Card',itemSpacing:12});figma.currentPage.appendChild(card);await figma.loadFontAsync({family:'Inter',style:'Regular'});const title=figma.createText();card.appendChild(title);title.set({name:'Title',characters:'Hello',width:200});card.query('TEXT[name="Title"]').set({fontSize:24});await card.screenshot();return {id:card.id,title:title.id,color:dsh.color('#ff0000')}`})
  assert.equal(f.page.children[0].layoutMode,'VERTICAL');assert.equal(f.page.children[0].children[0].fontSize,24);assert.equal(f.fonts.length,1);assert.equal(output.images.length,1);assert.deepEqual(plain(output.value.color),{r:1,g:0,b:0});assert.equal(f.undo,1)
})
test('scene/context/variables/assets and local links return real fixture state',async()=>{
  const f=await fixtureRuntime(),scene=await f.runtime.run('import_scene',{nodes:[{type:'FRAME',props:{name:'Card',layoutMode:'VERTICAL'},children:[{type:'TEXT',props:{characters:'Heading',fontName:{family:'Inter',style:'Regular'}}}]}]})
  const id=scene.value.nodeIds[0];assert.equal(scene.value.count,2)
  const context=await f.runtime.run('get_design_context',{nodeId:id});assert.equal(context.value.node.children[0].characters,'Heading');assert.equal(context.value.css.display,'flex');assert.equal(context.images.length,1)
  assert.equal((await f.runtime.run('get_variable_defs')).value.variables[0].name,'color/primary')
  await f.runtime.run('set_local_component_links',{nodeId:id,links:[{name:'Card',source:'src/Card.tsx'}]})
  assert.equal((await f.runtime.run('get_local_component_links',{nodeId:id})).value[0].name,'Card')
  assert.equal((await f.runtime.run('download_assets',{nodeIds:[id],format:'PNG'})).assets.length,1)
})
test('bounded tree, fonts, selection, search, libraries and reactions are supported',async()=>{
  const f=await fixtureRuntime();const component=f.figma.createComponent();component.name='Button';f.page.appendChild(component);f.page.selection=[component]
  assert.equal((await f.runtime.run('get_selection')).value.selection[0].name,'Button')
  assert.equal((await f.runtime.run('list_fonts')).value.length,1)
  assert.equal((await f.runtime.run('search_design_system',{query:'Button'})).value.components.length,1)
  assert.equal((await f.runtime.run('get_component_context',{nodeId:component.id})).value.type,'COMPONENT')
  assert.equal((await f.runtime.run('get_libraries')).value.variableCollections.length,0)
  assert.equal((await f.runtime.run('get_motion_context',{nodeId:component.id})).value.motion,null)
  const root=await f.runtime.run('get_metadata',{nodeId:f.page.id,depth:0});assert.equal(root.value.children,undefined)
})
test('rejects invalid script, selector, missing selection and oversized/malformed exports',async()=>{
  const f=await fixtureRuntime()
  await assert.rejects(f.runtime.run('use_figma',{code:''}),/script/)
  await assert.rejects(f.runtime.run('get_screenshot'),/Select/)
  await assert.rejects(f.runtime.run('use_figma',{code:'return figma.currentPage.query("TEXT > RECTANGLE")'}),/supports/)
  await assert.rejects(f.runtime.run('download_assets',{nodeIds:[],format:'PNG'}),/1–20/)
  await assert.rejects(f.runtime.run('import_scene',{nodes:[{type:'NOT_A_NODE'}]}),/Unsupported/)
})
test('page index does not access unloaded page children',async()=>{
  const f=await fixtureRuntime()
  f.figma.root.children.push({id:'99:1',name:'Unloaded',type:'PAGE',get children(){throw Error('page not loaded')}})
  const metadata=await f.runtime.run('get_metadata')
  assert.equal(metadata.value.pages.at(-1).name,'Unloaded')
})
