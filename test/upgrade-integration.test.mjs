import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {applyWithDependencies} from '../index.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {LOCAL_TOOLS,requiredQueryFeatureVersion} from '../lib/catalog.mjs'
import {fixtureRuntime,connect,request,runJob,PNG} from './fixtures.mjs'
async function setup(t,{featureVersion=5,connected=true,realBridge=false,timeoutMs=1000}={}){
  const home=await mkdtemp(join(tmpdir(),'dsh-upgrade-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const definitions=new Map(),ctx={tools:{register(def){definitions.set(def.name,def);return()=>definitions.delete(def.name)}},skills:{registerProvider(){}},systemPrompt:{section(){},getSectionOrder(){return 1}},logger:{warn(){}},effect(){},on(){},get(){}}
  const f=await fixtureRuntime(),bridge=new LocalBridge({token:'a'.repeat(64),port:0,timeoutMs}),calls=[]
  if(!realBridge){bridge.takeExport=undefined
    bridge.call=async(id,method,args,options)=>{calls.push({id,method,args,options});return JSON.parse(JSON.stringify(await f.runtime.run(method,args)))}}
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  if(connected)await connect(bridge,'Upgrade fixture',featureVersion)
  const exec={agent:{session:{id:'upgrade-work',header:{cwd:home}}},signal:new AbortController().signal}
  const invoke=(name,args={},execution=exec)=>definitions.get(name.startsWith('figma_')?name:'mcp__figma__'+name).execute(args,execution)
  return {home,definitions,bridge,calls,invoke,exec,...f}
}
test('workspace tools work without a canvas and explicit mappings take precedence',async t=>{
  const f=await setup(t,{connected:false})
  await writeFile(join(f.home,'Button.tsx'),'export function Button(){return null}\n')
  const index=(await f.invoke('project_index')).structuredContent
  assert.equal(index.components[0].name,'Button')
  await f.invoke('project_mappings',{action:'set',kind:'component',figmaKey:'component:1',sourcePath:'Button.tsx',exportName:'Button'})
  const matches=(await f.invoke('project_match',{components:[{id:'component:1',name:'Completely different name'}]})).structuredContent
  assert.equal(matches.components[0].status,'mapped');assert.equal(matches.components[0].mapping.sourcePath,'Button.tsx')
  assert.equal(f.calls.length,0)
  await assert.rejects(f.invoke('local_recipes',{action:'save',name:'invalid',code:'return ('}),/syntax|Unexpected|SCRIPT_SYNTAX/i)
  await f.invoke('local_recipes',{action:'save',name:'read-selection',code:'return figma.currentPage.selection.map(n=>n.id)'})
  assert.equal(f.calls.length,0)
})
test('semantic reads pass deep contexts through runtime and incomplete reads cannot replace baselines',async t=>{
  const f=await setup(t),root=f.figma.createFrame();f.page.appendChild(root)
  let at=root;for(let i=0;i<13;i++){const child=f.figma.createFrame();at.appendChild(child);at=child}
  const read=(await f.invoke('get_design_context',{nodeId:root.id,semantic:true,depth:30,includeScreenshot:false})).structuredContent.result
  assert.equal(read.coverage.complete,true)
  const baseline=(await f.invoke('design_diff',{nodeId:root.id,action:'create'})).structuredContent.result
  assert.equal(baseline.status,'baseline-created')
  at.name='Changed deep node'
  const diff=(await f.invoke('design_diff',{nodeId:root.id})).structuredContent.result
  assert.equal(diff.status,'diff');assert.ok(diff.changes.changed.some(x=>x.id===at.id))
  await assert.rejects(f.invoke('design_diff',{nodeId:root.id,action:'update',expectedRevision:baseline.revision,maxNodes:1}),/incomplete/)
  assert.equal((await f.invoke('design_diff',{nodeId:root.id})).structuredContent.result.baselineRevision,baseline.revision)
  assert.ok(f.calls.filter(c=>c.args.semantic).every(c=>c.args.depth===30))
})
test('native video transfer is consumed to a verified file and released without exposing base64',async t=>{
  const f=await setup(t),frame=f.figma.createFrame();f.page.appendChild(frame)
  const mp4=Buffer.alloc(600000);mp4.writeUInt32BE(24,0);mp4.write('ftypisom',4)
  frame.exportAsync=async options=>{assert.equal(options.format,'MP4');return new Uint8Array(mp4)}
  const output=await f.invoke('export_video',{nodeId:frame.id,format:'MP4',fps:30})
  const file=output.structuredContent.result.file
  assert.equal(file.bytes,mp4.length);assert.deepEqual(await readFile(file.path),mp4)
  assert.equal(output.structuredContent.result.transfer,undefined)
  assert.ok(JSON.stringify(output).length<3000)
  assert.equal(f.calls.filter(c=>c.method==='read_export_chunk').length,2)
  const released=f.calls.find(c=>c.method==='release_export');assert.equal(typeof released.args.transferId,'string')
  await assert.rejects(f.runtime.run('read_export_chunk',{transferId:released.args.transferId,offset:0,length:12}),/expired|not found/i)
  assert.ok(f.calls.every(c=>c.options.owner==='upgrade-work'))
})
test('cancellation immediately after native export still releases its private transfer',async t=>{
  const f=await setup(t),frame=f.figma.createFrame();f.page.appendChild(frame)
  const controller=new AbortController();frame.exportAsync=async()=>{controller.abort();return new Uint8Array(Buffer.from('0000ftypisom00000'))}
  await assert.rejects(f.invoke('export_video',{nodeId:frame.id,format:'MP4'},{...f.exec,signal:controller.signal}),/abort/i)
  assert.equal(f.calls.filter(c=>c.method==='read_export_chunk').length,0)
  assert.equal(f.calls.filter(c=>c.method==='release_export').length,1)
})
test('new screenshot maxDimension caps an explicit scale and reports source dimensions',async t=>{
  const f=await setup(t),frame=f.figma.createFrame();f.page.appendChild(frame);frame.resize(2000,1000)
  let settings;frame.exportAsync=async opts=>{settings=opts;return new Uint8Array(PNG)}
  const value=(await f.invoke('get_screenshot',{nodeId:frame.id,scale:2,maxDimension:500})).structuredContent.result
  assert.equal(settings.constraint.value,.25);assert.equal(value.originalWidth,2000);assert.equal(value.originalHeight,1000)
})
test('upgrade feature gates preserve older core calls and block unsupported new operations before dispatch',async t=>{
  const f=await setup(t,{featureVersion:3})
  await f.invoke('use_figma',{code:'return 3'})
  assert.equal(f.calls.length,1)
  await assert.rejects(f.invoke('get_design_context',{semantic:true,nodeId:f.page.id}),/companion.*support/i)
  await assert.rejects(f.invoke('export_video',{nodeId:f.page.id,format:'MP4'}),/companion.*support/i)
  assert.equal(f.calls.length,1)
  assert.equal(requiredQueryFeatureVersion('get_design_context',{depth:3}),0)
  assert.equal(requiredQueryFeatureVersion('get_design_context',{depth:30,semantic:true}),5)
  assert.equal(LOCAL_TOOLS.length,new Set(LOCAL_TOOLS.map(t=>t.name)).size)
})
test('late native export recovers through operation_status and saves once without re-encoding',async t=>{
  const f=await setup(t,{realBridge:true,timeoutMs:100}),frame=f.figma.createFrame();f.page.appendChild(frame)
  let encodes=0;frame.exportAsync=async()=>{encodes++;return new Uint8Array(Buffer.from('0000ftypisom00000'))}
  const connectionId=f.bridge.list()[0].connectionId
  const invocation=f.invoke('export_video',{nodeId:frame.id,format:'MP4'}),rejected=assert.rejects(invocation,/outcome may be unknown/)
  const job=await (await request(f.bridge,'/poll',{connectionId})).json()
  const response=await f.runtime.run(job.method,job.args)
  await rejected
  f.bridge.timeoutMs=2000
  await request(f.bridge,'/result',{connectionId,id:job.id,ok:true,result:response})
  const before=(await f.invoke('operation_status',{operationId:job.id})).structuredContent
  assert.equal(before.outputState,'pending');assert.doesNotMatch(JSON.stringify(before),/transferId|ftyp/)
  const recovered=f.invoke('operation_status',{operationId:job.id,includeResult:true})
  assert.equal((await runJob(f.bridge,connectionId,f.runtime)).method,'read_export_chunk')
  assert.equal((await runJob(f.bridge,connectionId,f.runtime)).method,'release_export')
  const status=(await recovered).structuredContent
  assert.equal(status.resultStage,'host');assert.equal(status.outputState,'completed')
  const file=status.result.result.file
  assert.equal((await readFile(file.path)).toString(),'0000ftypisom00000')
  const again=(await f.invoke('operation_status',{operationId:job.id,includeResult:true})).structuredContent
  assert.equal(again.result.result.file.path,file.path);assert.equal(encodes,1)
  assert.equal(f.bridge.documents.get(connectionId).queue.length,0)
})
test('trusted controlled preflight is retry-safe but an attempted write still requires inspection',async t=>{
  const f=await setup(t),node=f.figma.createFrame();f.page.appendChild(node)
  await assert.rejects(f.runtime.run('batch_edit',{ops:[{nodeId:node.id,type:'set_properties',properties:{unsupported:1}}]}),e=>e.safeToRetryWithoutCanvasRead===true)
  await assert.rejects(f.runtime.run('generate_diagram',{nodes:[{key:'a',label:'Wrong editor'}]}),e=>e.safeToRetryWithoutCanvasRead===true)
  Object.defineProperty(node,'name',{get:()=> 'Locked',set(){throw Error('simulated setter failure')},configurable:true})
  await assert.rejects(f.runtime.run('batch_edit',{ops:[{nodeId:node.id,type:'set_properties',properties:{name:'Changed'}}]}),e=>e.safeToRetryWithoutCanvasRead===false&&e.batchResult.rollback!==undefined)
  f.figma.listAvailableShaders=async()=>[{id:'s',type:'fill',imported:false,propertyDefinitions:{}}]
  f.figma.importShaderById=async()=>{throw Error('connection lost after import started')}
  await assert.rejects(f.runtime.run('apply_shader',{nodeId:node.id,shaderId:'s'}),e=>e.safeToRetryWithoutCanvasRead===false)
})
test('new options never silently fall back to a legacy route that ignores them',async t=>{
  const f=await setup(t)
  for(const [method,args,pattern] of [
    ['get_design_context',{includeCss:true},/semantic:true/],
    ['get_component_context',{includeScreenshot:true},/semantic:true/],
    ['get_variable_defs',{maxNodes:5},/nodeId/],
    ['search_design_system',{query:'color',libraryCollectionKeys:['a']},/pageIds/],
    ['upload_assets',{scaleMode:'FIT'},/nodeIds/],
    ['get_motion_context',{maxNodes:5},/recursive:true/],
  ])await assert.rejects(f.runtime.run(method,args),pattern)
})
test('quality host routes verified output and constrained read-only payloads through protocol 6',async t=>{
 const f=await setup(t,{featureVersion:6})
 let out=await f.invoke('use_figma',{code:'return {frameId:figma.createFrame().id}',verify:{resultPath:'frameId'}})
 assert.equal(out.isError,undefined);assert.equal(out.structuredContent.verification.state,'image-returned');assert.equal(out.content.filter(b=>b.type==='image').length,1)
 out=await f.invoke('use_figma',{code:'return figma.currentPage.children.map(n=>n.id)',readOnly:true})
 assert.equal(out.isError,undefined);assert.equal(f.calls.at(-1).options.mutation,false);assert.equal(f.calls.at(-1).args.readOnlyProgram.type,'Program')
 const calls=f.calls.length
 await assert.rejects(f.invoke('use_figma',{code:'figma.createFrame()',verify:{}}),/verify requires/);assert.equal(f.calls.length,calls)
 await assert.rejects(f.invoke('use_figma',{code:'figma.currentPage.name="bad"',readOnly:true}),/READ_ONLY_SCRIPT_SUBSET/);assert.equal(f.calls.length,calls)
 out=await f.invoke('resolve_fonts',{specs:[{family:'Inter',style:'Regular'}]});assert.equal(out.structuredContent.result.resolved[0].fallback,false)
})
test('comparison host confines reference files and forwards only raster bytes to the companion',async t=>{
 const f=await setup(t,{featureVersion:7}),node=f.figma.createFrame();node.resize(1,1);node.absoluteBoundingBox={x:0,y:0,width:1,height:1};f.page.appendChild(node)
 await writeFile(join(f.home,'reference.png'),PNG)
 const out=await f.invoke('compare',{nodeId:node.id,reference:{path:'reference.png'}})
 assert.equal(out.isError,undefined);assert.equal(f.calls.at(-1).method,'compare');assert.equal(f.calls.at(-1).args.referenceImage.mimeType,'image/png');assert.equal(f.calls.at(-1).options.mutation,false)
 const count=f.calls.length
 await assert.rejects(f.invoke('compare',{nodeId:node.id,reference:{path:'../outside.png'}}),/inside the current workspace/);assert.equal(f.calls.length,count)
})

 test('old companions cannot silently use pre-fix comparison geometry',async t=>{
  const f=await setup(t,{featureVersion:6})
  await assert.rejects(f.invoke('compare',{nodeId:'1:1',reference:{path:'ref.png'}}),/7|companion|配套/)
  assert.equal(f.calls.length,0)
 })
 test('host recovery projection rejects shallow summary policy before dispatch and preserves unknown evidence',async t=>{
  const f=await setup(t,{featureVersion:7}),node=f.figma.createFrame();f.page.appendChild(node)
  await assert.rejects(f.invoke('get_metadata',{nodeId:node.id,profile:'summary',responseMode:'recovery'}),/full/)
  assert.equal(f.calls.length,0)
  const out=await f.invoke('get_metadata',{nodeId:node.id,profile:'full',depth:10,responseMode:'recovery'})
  assert.equal(out.structuredContent.result.responseMode,'recovery');assert.equal(out.structuredContent.result.nodes[0].id,node.id)
  assert.equal(out.structuredContent.result.evidence.propertyValidation,'not-established')
 })
