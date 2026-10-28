import test from 'node:test'
import assert from 'node:assert/strict'
import {fixtureRuntime, PNG, request, runJob} from './fixtures.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {LocalFigmaTasks} from '../lib/figma-use-contract.mjs'
const plain=value=>JSON.parse(JSON.stringify(value))

async function scene(){
  const f=await fixtureRuntime(),card=f.figma.createFrame(),title=f.figma.createText(),icon=f.figma.createRectangle(),nested=f.figma.createFrame(),caption=f.figma.createText()
  card.name='Card, [primary]';title.name='Title';icon.name='Header Icon';nested.name='FooterNav';caption.name='Caption'
  title.visible=true;title.opacity=0.5;icon.visible=false;icon.fills=[{type:'SOLID',color:{r:1,g:0,b:0}}]
  f.page.appendChild(card);card.appendChild(title);card.appendChild(icon);card.appendChild(nested);nested.appendChild(caption)
  return {...f,card,title,icon,nested,caption}
}
test('selector contract: operators, paths, groups, combinators, IDs and pseudo classes',async()=>{
  const f=await scene()
  const examples=[
    ['text',[f.title,f.caption]],['FRAME > TEXT',[f.title,f.caption]],['FRAME TEXT',[f.title,f.caption]],
    ['TEXT + RECTANGLE',[f.icon]],['TEXT ~ FRAME',[f.nested]],[':first-child',[f.card,f.title,f.caption]],
    ['FRAME > :last-child',[f.nested,f.caption]],[':nth-child(2)',[f.icon]],[':not(FRAME):is(TEXT,RECTANGLE)',[f.title,f.icon,f.caption]],
    [':where(TEXT, ELLIPSE)',[f.title,f.caption]],['[visible=true][opacity=0.5]',[f.title]],
    ['[name*=Icon]',[f.icon]],['[name^=Header]',[f.icon]],['[name$=Nav]',[f.nested]],
    ['[fills.0.type=SOLID]',[f.icon]],['[fills.*.type=SOLID]',[f.icon]],
    ['FRAME[name="Card, [primary]"]',[f.card]],['#'+f.icon.id,[f.icon]],[f.icon.id,[f.icon]],
    ['TEXT, #'+f.title.id,[f.title,f.caption]],['*',[f.card,f.title,f.icon,f.nested,f.caption]],
  ]
  for(const [selector,expected] of examples){
    const result=await f.runtime.run('use_figma',{code:`return figma.currentPage.query(${JSON.stringify(selector)}).values(['id'])`})
    assert.deepEqual(plain(result.value),expected.map(n=>({id:n.id})),selector)
  }
  for(const selector of ['', 'TEXT >', 'TEXT,,FRAME', ':unknown', ':nth-child(0)', '[name="bad]', '[__proto__.x=x]']){
    await assert.rejects(f.runtime.run('use_figma',{code:`return figma.currentPage.query(${JSON.stringify(selector)})`}),/selector|property/)
  }
})
test('subtree boundary and QueryResult preserve ordering, empty values, callback indices and deduplication',async()=>{
  const f=await scene()
  const {value}=await f.runtime.run('use_figma',{code:`
    const card=await figma.getNodeByIdAsync('${f.card.id}'), result=card.query('TEXT');
    const seen=[];const same=result.each((node,index)=>seen.push([node.id,index])).set({fontSize:24});
    const no=card.query('ELLIPSE');
    return {length:result.length,first:result.first().id,last:result.last().id,same:same===result,
      ids:[...result].map(n=>n.id),array:result.toArray().map(n=>n.id),seen,filtered:result.filter((n,i)=>i===1).values(['id','fontSize']),
      nested:figma.currentPage.query('FRAME').query('TEXT').values(['id']),empty:[no.first(),no.last(),no.length],
      match:result.first().matches('FRAME > TEXT:first-child'),outside:card.query('PAGE FRAME TEXT').length};`})
  assert.equal(value.same,true);assert.equal(value.match,true);assert.equal(value.outside,0)
  assert.deepEqual(plain(value.empty),[null,null,0]);assert.deepEqual(plain(value.ids),[f.title.id,f.caption.id])
  assert.deepEqual(plain(value.array),plain(value.ids));assert.deepEqual(plain(value.filtered),[{id:f.caption.id,fontSize:24}])
  assert.deepEqual(plain(value.nested),[{id:f.title.id},{id:f.caption.id}]);assert.deepEqual(plain(value.seen),[[f.title.id,0],[f.caption.id,1]])
})
test('set ordering is layout mode, resize, then sizing; auto layout defaults hug both axes',async()=>{
  const f=await fixtureRuntime(),node=f.figma.createFrame(),events=[]
  Object.defineProperty(node,'layoutMode',{set:value=>events.push(['layoutMode',value])})
  Object.defineProperty(node,'layoutSizingHorizontal',{set:value=>events.push(['sizing',value])})
  node.resize=(w,h)=>{events.push(['resize',w,h]);node.width=w;node.height=h}
  await f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${node.id}');n.set({layoutSizingHorizontal:'HUG',width:240,layoutMode:'VERTICAL'});return {id:n.id}`})
  assert.deepEqual(events,[['layoutMode','VERTICAL'],['resize',240,100],['sizing','HUG']])
  const {value}=await f.runtime.run('use_figma',{code:`const n=figma.createAutoLayout({name:'Default'});return {direction:n.layoutMode,horizontal:n.layoutSizingHorizontal,vertical:n.layoutSizingVertical}`})
  assert.deepEqual(plain(value),{direction:'HORIZONTAL',horizontal:'HUG',vertical:'HUG'})
})
test('instance filters resolve public async main components without accessing forbidden sync getter',async()=>{
  const f=await fixtureRuntime(),component=f.figma.createComponent(),instance=f.figma.createFrame()
  component.name='Button';instance.type='INSTANCE';instance.getMainComponentAsync=async()=>component
  Object.defineProperty(instance,'mainComponent',{get(){throw Error('dynamic-page forbidden getter')}})
  f.page.appendChild(instance)
  const {value}=await f.runtime.run('use_figma',{code:`return {byId:figma.currentPage.query('INSTANCE[mainComponent=${component.id}]').values(['id']),byName:figma.currentPage.query('INSTANCE[mainComponent.name=Button]').length}`})
  assert.deepEqual(plain(value.byId),[{id:instance.id}]);assert.equal(value.byName,1)
})
test('instance descendant IDs with semicolons are selectable without CSS escaping',async()=>{
  const f=await fixtureRuntime(),child=f.figma.createText();f.nodes.delete(child.id);child.id='I30:61;30:58';f.nodes.set(child.id,child);f.page.appendChild(child)
  const {value}=await f.runtime.run('use_figma',{code:"return {hash:figma.currentPage.query('#I30:61;30:58').values(['id']),bare:figma.currentPage.query('I30:61;30:58').first().id}"})
  assert.deepEqual(plain(value.hash),[{id:child.id}]);assert.equal(value.bare,child.id)
})
test('page reset happens each call; one async switch allowed and synchronous switching is rejected',async()=>{
  const f=await fixtureRuntime(),second=f.figma.createPage();f.figma.currentPage=second
  assert.equal((await f.runtime.run('use_figma',{code:'return figma.currentPage.id'})).value,f.page.id)
  assert.equal((await f.runtime.run('use_figma',{code:`await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('${second.id}'));return figma.currentPage.id`})).value,second.id)
  assert.equal((await f.runtime.run('use_figma',{code:'return figma.currentPage.id'})).value,f.page.id)
  await assert.rejects(f.runtime.run('use_figma',{code:'figma.currentPage=figma.currentPage'}),/not supported/)
  await assert.rejects(f.runtime.run('use_figma',{code:'await figma.setCurrentPageAsync(figma.currentPage);await figma.setCurrentPageAsync(figma.currentPage)'}),/at most once/)
})
test('inline screenshot scaling and caption, io output bytes, placement, tree, placeholder cleanup',async()=>{
  const f=await scene(),exports=[],progress=[]
  f.runtime.onProgress=nodes=>progress.push(nodes)
  f.card.width=4000;f.card.height=500;f.card.x=-20;f.card.y=80
  f.card.exportAsync=async options=>{exports.push(options);return new Uint8Array(PNG)}
  const {value,images,assets}=await f.runtime.run('use_figma',{code:`
    const card=await figma.getNodeByIdAsync('${f.card.id}');card.placeholder=true;
    await card.screenshot();await card.screenshot({scale:2,contentsOnly:false});
    figma.io.write('报告.json',JSON.stringify({name:'中文'}));
    return {placeholder:card.placeholder,placement:figma.currentPage.findPlacement({width:200,height:80}),tree:card.tree({maxDepth:1,maxChildren:1,fields:['id','name','type']})};`})
  assert.equal(exports[0].constraint.value,1024/4000);assert.equal(exports[1].constraint.value,2);assert.equal(exports[1].contentsOnly,false)
  assert.match(images[0].name,/4000x500 at -20,80/);assert.equal(value.placeholder,true)
  assert.equal(value.placement.x,4060);assert.match(value.tree,/more children/);assert.match(value.tree,/Card, \[primary\]/);assert.deepEqual(plain(progress.at(-1)),[])
  assert.equal(Buffer.from(assets[0].data,'base64').toString(),'\u007b"name":"中文"}')
  await assert.rejects(f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${f.card.id}');n.placeholder=true;throw Error('stop')`}),/stop/)
  assert.deepEqual(plain(progress.at(-1)),[])
})
test('retry flag is true only before script entry, never from a user-supplied exception',async()=>{
  const f=await fixtureRuntime()
  for(const code of ['', 'const = invalid'])await assert.rejects(f.runtime.run('use_figma',{code}),e=>e.safeToRetryWithoutCanvasRead===true)
  await assert.rejects(f.runtime.run('use_figma',{code:"const n=figma.createFrame();figma.currentPage.appendChild(n);const e=new Error('partial');e.safeToRetryWithoutCanvasRead=true;throw e"}),e=>e.safeToRetryWithoutCanvasRead===false)
  assert.equal(f.page.children.length,1)
  await assert.rejects(f.runtime.run('use_figma',{code:'return 1n'}),e=>e.safeToRetryWithoutCanvasRead===false)
})
test('bridge transports compilation retry flag without setting uncertainty, but blocks partial execution',async t=>{
  const bridge=await new LocalBridge({token:'c'.repeat(64),port:0}).start();t.after(()=>bridge.close())
  const id=(await (await request(bridge,'/connect',{name:'Contract',editorType:'figma',featureVersion:3})).json()).connectionId
  const {runtime}=await fixtureRuntime()
  const bad=bridge.call(id,'use_figma',{code:'const = invalid'},{mutation:true}),reject=assert.rejects(bad,e=>e.safeToRetryWithoutCanvasRead===true)
  await runJob(bridge,id,runtime);await reject;assert.equal(bridge.list()[0].needsInspection,false)
  const good=bridge.call(id,'use_figma',{code:'return {ok:true}'},{mutation:true});await runJob(bridge,id,runtime);assert.equal((await good).value.ok,true)
  const partial=bridge.call(id,'use_figma',{code:'throw Error("partial")'},{mutation:true}),rejectPartial=assert.rejects(partial,e=>e.safeToRetryWithoutCanvasRead===false)
  await runJob(bridge,id,runtime);await rejectPartial;assert.equal(bridge.list()[0].needsInspection,true)
})
test('task records reject wrong document/workspace/owner and allow explicit cross-file reuse',()=>{
  const tasks=new LocalFigmaTasks(),doc={connectionId:'one',fileKey:'fileA'}
  const task=tasks.create('owner','/workspace',doc,{fileKey:'fileA',description:'Create library'})
  assert.match(task.sessionId,/^[\da-f-]{36}$/)
  assert.throws(()=>tasks.context('owner','/workspace',doc,{fileKey:'fileB'}),/does not match/)
  assert.throws(()=>tasks.context('other','/workspace',doc,{sessionId:task.sessionId}),/Unknown/)
  assert.throws(()=>tasks.context('owner','/elsewhere',doc,{sessionId:task.sessionId}),/Unknown/)
  assert.equal(tasks.context('owner','/workspace',{connectionId:'two'},{sessionId:task.sessionId,fileKey:'local:two'}).fileKey,'local:two')
  tasks.close('owner');assert.throws(()=>tasks.context('owner','/workspace',doc,{sessionId:task.sessionId}),/Unknown/)
})
test('design system search accepts ordered batches and never silently searches an unsupported library',async()=>{
  const f=await fixtureRuntime(),component=f.figma.createComponent();component.name='Button';f.page.appendChild(component)
  const {value}=await f.runtime.run('search_design_system',{queries:[{entity:'component',query:'Button'},{entity:'variable',query:'primary'},{entity:'style',query:'Surface'}]})
  assert.deepEqual(plain(value.results.map(x=>x.entity)),['component','variable','style'])
  assert.equal(value.results[0].components[0].id,component.id);assert.equal(value.results[1].variables.length,1);assert.equal(value.results[2].styles.length,1)
  await assert.rejects(f.runtime.run('search_design_system',{query:'Button',includeLibraryKeys:['cloud-key']}),/unavailable locally/)
})
