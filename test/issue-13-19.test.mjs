import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {applyWithDependencies} from '../index.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {fixtureRuntime,connect,runJob,request} from './fixtures.mjs'
import {preflightScript} from '../lib/script-preflight.mjs'

async function setup(t){
 const home=await mkdtemp(join(tmpdir(),'dsh-issue-regression-'));t.after(()=>rm(home,{recursive:true,force:true}))
 const defs=new Map(),ctx={tools:{register(d){defs.set(d.name,d);return()=>defs.delete(d.name)}},skills:{registerProvider(){}},systemPrompt:{section(){},getSectionOrder(){return 1}},logger:{warn(){}},effect(){},on(){},get(){}}
 const f=await fixtureRuntime(),bridge=new LocalBridge({token:'a'.repeat(64),port:0}),handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
 const id=await connect(bridge,'Issues',5),exec={agent:{session:{id:'issues',header:{cwd:home}}},signal:new AbortController().signal}
 const invoke=(name,args={})=>defs.get('mcp__figma__'+name).execute(args,exec)
 const run=async(name,args)=>{const p=invoke(name,args).then(value=>({value}),error=>({error:JSON.parse(error.message)}));await runJob(bridge,id,f.runtime);return await p}
 return {...f,home,bridge,id,invoke,run}
}
test('#19 full profile recovers; summary/paging/depth/budget omissions stay protected without duplicate creation',async t=>{
 const f=await setup(t)
 const failure=await f.run('use_figma',{code:"const n=figma.createFrame();figma.currentPage.appendChild(n);n.name='partial';const child=figma.createText();n.appendChild(child);child.characters='x'.repeat(5000);throw Error('partial')"})
 assert.equal(failure.error.safeToRetryWithoutCanvasRead,false);assert.match(failure.error.recovery.hint,/profile:"full"/)
 for(const [args,reason]of [[{profile:'summary'},'summary'],[{nodeId:f.page.id,depth:3,offset:0,limit:20},'pagination'],[{depth:0},'depth'],[{maxBytes:1024},'maxBytes'],[{maxNodes:1},'maxNodes']]){
  const {value}=await f.run('get_metadata',args)
  assert.equal(value.structuredContent.recovery.cleared,false)
  assert.equal(value.structuredContent.recovery.reason,reason)
  assert.equal(f.bridge.list()[0].needsInspection,true)
  assert.match(value.content.at(-1).text,/recovery/)
 }
 const blocked=f.invoke('use_figma',{code:'figma.createFrame()'}).catch(e=>JSON.parse(e.message))
 const poll=request(f.bridge,'/poll',{connectionId:f.id})
 assert.match((await blocked).error,/get_metadata/)
 const recovered=f.invoke('get_metadata',{nodeId:f.page.id,profile:'full',depth:3})
 const job=await(await poll).json();assert.equal(job.method,'get_metadata')
 await request(f.bridge,'/result',{connectionId:f.id,id:job.id,ok:true,result:await f.runtime.run(job.method,job.args)})
 assert.equal((await recovered).structuredContent.recovery.cleared,true)
 assert.equal(f.bridge.list()[0].needsInspection,false);assert.equal(f.page.children.length,1)
 const continued=await f.run('use_figma',{code:"figma.currentPage.children[0].name='completed';return {ok:true}"})
 assert.equal(continued.value.structuredContent.result.ok,true);assert.equal(f.page.children.length,1)
})
test('#19 normal calls add no recovery payload; default/full and sufficient budgets share recovery rules',async t=>{
 const f=await setup(t)
 assert.equal((await f.run('get_metadata',{})).value.structuredContent.recovery,undefined)
 for(const args of [{},{profile:'full'},{profile:'full',maxBytes:4096,maxNodes:10}]){
  await f.run('use_figma',{code:"throw Error('unknown')"})
  const out=await f.run('get_metadata',args)
  assert.equal(out.value.structuredContent.recovery.cleared,true)
 }
})
test('#13 code layer metadata/tree/semantic reads explicitly stay opaque; normal and Code Block nodes do not',async()=>{
 const f=await fixtureRuntime(),layer=f.figma.createFrame();layer.type='CODE_INSTANCE';layer.name='Code Layer';f.page.appendChild(layer)
 layer.findAll=undefined;layer.findAllWithCriteria=undefined
 Object.defineProperty(layer,'children',{get(){throw Error('internal children must not be read')}})
 const snapshot=(await f.runtime.run('get_metadata',{nodeId:layer.id})).value
 assert.equal(snapshot.opaque,true);assert.equal(snapshot.childCount,undefined);assert.equal(snapshot.codeLayer.source,'unavailable')
 const summary=(await f.runtime.run('get_selection',{profile:'summary'})).value;assert.equal(summary.page.opaque,undefined)
 const tree=(await f.runtime.run('use_figma',{code:`return (await figma.getNodeByIdAsync('${layer.id}')).tree()`})).value
 assert.match(tree,/"opaque":true/)
 const semantic=(await f.runtime.run('get_design_context',{nodeId:layer.id,semantic:true,includeScreenshot:false})).value
 assert.equal(semantic.node.opaque,true);assert.equal(semantic.node.childCount,undefined)
 assert.equal((await f.runtime.run('get_screenshot',{nodeId:layer.id})).images.length,1)
 layer.exportAsync=undefined
 assert.equal((await f.runtime.run('get_metadata',{nodeId:layer.id})).value.codeLayer.export,'unavailable')
 await assert.rejects(f.runtime.run('get_screenshot',{nodeId:layer.id}),/cannot be exported/)
 const block=f.figma.createFrame();block.type='CODE_BLOCK';assert.equal(f.runtime.snapshot(block,0).opaque,undefined)
})
test('#13 known unsupported constructor is preflight-safe; aliases, shadowing and exposure are respected',()=>{
 const unavailable={codeLayerCreation:'unavailable'}
 for(const code of ['figma.createFrame();figma.createCodeLayer()','const api=figma;api["createCodeLayer"]()'])assert.throws(()=>preflightScript(code,unavailable),e=>e.diagnostic.code==='FIGMA_CODE_LAYER_UNAVAILABLE')
 for(const code of ['const figma={createCodeLayer(){}};figma.createCodeLayer()','return typeof figma.createCodeLayer','return "figma.createCodeLayer()"'])preflightScript(code,unavailable)
 preflightScript('figma.createCodeLayer()', {codeLayerCreation:'available'})
 preflightScript('figma.createCodeLayer()')
})
test('#13 absent native constructor is probed without calling it; dynamic failures preserve partial-write safety',async()=>{
 const f=await fixtureRuntime()
 const report=(await f.runtime.run('get_capabilities',{})).value
 assert.equal(report.features.codeLayerCreation.state,'unavailable')
 await assert.rejects(f.runtime.run('use_figma',{code:"const n=figma.createFrame();figma.currentPage.appendChild(n);figma['create'+'CodeLayer']()"}),e=>/FIGMA_CODE_LAYER_UNAVAILABLE/.test(e.message)&&e.safeToRetryWithoutCanvasRead===false)
 assert.equal(f.page.children.length,1)
 let calls=0;f.figma.createCodeLayer=()=>{calls++;return 'native'}
 assert.equal((await f.runtime.run('get_capabilities',{})).value.features.codeLayerCreation.state,'available');assert.equal(calls,0)
})

test('#13 host rejects a known unavailable constructor before dispatch, with no extra canvas calls',async t=>{
 const f=await setup(t)
 f.bridge.documents.get(f.id).capabilities={schemaVersion:1,readOnly:true,features:{codeLayerCreation:{state:'unavailable',reason:'not exposed'}}}
 const before=f.bridge.operations.size
 await assert.rejects(f.invoke('use_figma',{code:'figma.createFrame();figma.createCodeLayer()'}),e=>{
  const value=JSON.parse(e.message);return value.safeToRetryWithoutCanvasRead===true&&value.diagnostic.code==='FIGMA_CODE_LAYER_UNAVAILABLE'
 })
 assert.equal(f.bridge.operations.size,before);assert.equal(f.page.children.length,0);assert.equal(f.bridge.list()[0].needsInspection,false)
})
test('host idempotent script replay returns original result without an extra canvas call',async t=>{
 const f=await setup(t),args={code:"const n=figma.createFrame();figma.currentPage.appendChild(n);return {id:n.id}",idempotencyKey:'create-once',sessionId:'stale-from-restart'}
 const first=(await f.run('use_figma',args)).value
 const count=f.bridge.operations.size
 const again=await f.invoke('use_figma',{...args,sessionId:undefined})
 assert.deepEqual(again.structuredContent,first.structuredContent);assert.equal(f.page.children.length,1);assert.equal(f.bridge.operations.size,count)
 await assert.rejects(f.invoke('use_figma',{...args,code:'return 2'}),/conflict/)
})
test('host explicit steps use saved IDs and resume only remaining steps',async t=>{
 const f=await setup(t)
 const start=f.invoke('run_steps',{action:'start',taskKey:'host-task',steps:[{tool:'use_figma',args:{code:"const n=figma.createFrame();figma.currentPage.appendChild(n);return {id:n.id}"}},{tool:'batch_edit',args:{ops:[{type:'set_properties',nodeId:{$step:0,path:['result','id']},properties:{name:'Resumed'}}]}}]})
 await runJob(f.bridge,f.id,f.runtime);await runJob(f.bridge,f.id,f.runtime)
 const task=(await start).structuredContent;assert.equal(task.progress.completed,1)
 const resume=f.invoke('run_steps',{action:'resume',taskId:task.taskId,resumeToken:task.resumeToken})
 await runJob(f.bridge,f.id,f.runtime);await runJob(f.bridge,f.id,f.runtime)
 assert.equal((await resume).structuredContent.state,'completed');assert.equal(f.page.children.length,1);assert.equal(f.page.children[0].name,'Resumed')
})
test('variable-only failure reconciles from affected collection values, not an unrelated canvas read',async t=>{
 const f=await setup(t),collection={id:'c',name:'Test',modes:[{modeId:'m',name:'M'}],defaultModeId:'m',variableIds:[],addMode(){throw Error('in addMode: Limited to 1 modes only')}}
 f.figma.variables.getVariableCollectionByIdAsync=async()=>collection
 f.figma.variables.getLocalVariableCollectionsAsync=async()=>[collection]
 const failed=await f.run('add_variable_modes',{collectionId:'c',names:['Extra']})
 assert.equal(failed.error.failureClass,'platform-limit');assert.equal(failed.error.reconcile.tool,'get_variable_defs')
 assert.equal((await f.run('get_metadata',{})).value.structuredContent.recovery.cleared,false)
 assert.equal((await f.run('get_variable_defs',{collectionsOnly:true})).value.structuredContent.recovery.cleared,false)
 assert.equal((await f.run('get_variable_defs',{collectionIds:['c'],profile:'full'})).value.structuredContent.recovery.cleared,true)
 const cached=f.invoke('add_variable_modes',{collectionId:'c',names:['Extra']}).catch(e=>JSON.parse(e.message));await runJob(f.bridge,f.id,f.runtime)
 assert.equal((await cached).executionState,'not-started')
})

test('persisted pending idempotency is unknown and never marked retry-safe by the host',async t=>{
 const f=await setup(t),{IdempotencyStore}=await import('../lib/idempotency.mjs')
 await new IdempotencyStore(f.home).begin(['issues',await realpath(f.home),'local:'+f.id],'pending','use_figma',{code:'create',idempotencyKey:'pending'})
 await assert.rejects(f.invoke('use_figma',{code:'create',idempotencyKey:'pending'}),e=>{const v=JSON.parse(e.message);assert.equal(v.executionState,'unknown');assert.equal(v.safeToRetryWithoutCanvasRead,false);assert.equal(v.retryable,false);return true})
 assert.equal(f.bridge.operations.size,0)
})
