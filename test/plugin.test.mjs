import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWithDependencies } from '../index.mjs'
function context(){const definitions=new Map(),listeners=new Map();return {definitions,listeners,ctx:{tools:{register(def){if(definitions.has(def.name))throw Error('duplicate');definitions.set(def.name,def);return()=>definitions.delete(def.name)}},skills:{registerProvider(){}},systemPrompt:{section(){},getSectionOrder(){return 1}},logger:{warn(){},info(){}},effect(){},on(name,fn){listeners.set(name,fn)},get(){return undefined}}}}
const response=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value})
test('official catalog, raw contracts, isolated sessions, resources/prompts and failed-call non-replay',async t=>{
  const home=await mkdtemp(join(tmpdir(),'figma-plugin-test-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context(),connections=[],calls=[]
  let fail=false,discoveryFail=false,extra=false
  const connect=async()=>{if(discoveryFail)throw Error('offline');const c={closed:false,client:{
    listTools:async()=>({tools:[{name:'use_figma',description:'official',inputSchema:{type:'object',properties:{code:{type:'string'}},required:['code']}},...(extra?[{name:'new_tool',inputSchema:{type:'object',properties:{}}}]:[])]}),
    getInstructions:()=>'',callTool:async(args)=>{calls.push(args);if(fail)throw Error('lost response');return response({id:'official-node'})},
    listResources:async()=>({resources:[{uri:'figma://file',name:'file'}]}),readResource:async()=>({contents:[]}),listResourceTemplates:async()=>({resourceTemplates:[]}),
    listPrompts:async()=>({prompts:[{name:'rules'}]}),getPrompt:async()=>({messages:[]})},close:async()=>{c.closed=true}};connections.push(c);return c}
  const handle=await applyWithDependencies(ctx,{backend:'remote'},{home,connect});t.after(()=>handle.close())
  assert.equal(handle.available,true);assert.equal(connections[0].closed,true);assert.equal(calls.length,0)
  const exec=id=>({agent:{session:{id,header:{cwd:home}}},signal:new AbortController().signal})
  const invoke=(name,args,id='a')=>definitions.get(name).execute(args,exec(id))
  await invoke('mcp__figma__use_figma',{code:'return 1'});await invoke('mcp__figma__use_figma',{code:'return 2'});assert.equal(connections.length,2)
  await invoke('mcp__figma__use_figma',{code:'return 3'},'b');assert.equal(connections.length,3);assert.equal(calls[0].name,'use_figma')
  assert.equal((await invoke('figma_resources',{operation:'list'})).structuredContent.resources.length,1)
  assert.equal((await invoke('figma_prompts',{operation:'list'})).structuredContent.prompts[0].name,'rules')
  fail=true;const before=calls.length;await assert.rejects(invoke('mcp__figma__use_figma',{code:'mutate()'}),/not replayed/);assert.equal(calls.length,before+1);fail=false
  discoveryFail=true;await handle.refresh();assert.equal(handle.available,true);assert.ok(definitions.has('mcp__figma__use_figma'));discoveryFail=false
  extra=true;await handle.refresh();assert.equal(handle.toolCount,2);assert.ok(definitions.has('mcp__figma__new_tool'))
  await handle.close();assert.equal(definitions.size,0)
})
test('refresh waits for an active official call rather than closing its transport',async t=>{
  const home=await mkdtemp(join(tmpdir(),'figma-plugin-gate-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context();let release,started,discovery=0,closed=0
  const entered=new Promise(resolve=>started=resolve),blocked=new Promise(resolve=>release=resolve)
  const connect=async()=>({client:{listTools:async()=>{discovery++;return{tools:[{name:'write',inputSchema:{type:'object',properties:{}}}]}},callTool:async()=>{started();await blocked;return response({ok:true})}},close:async()=>{closed++}})
  const handle=await applyWithDependencies(ctx,{backend:'remote'},{home,connect});t.after(()=>handle.close())
  const call=definitions.get('mcp__figma__write').execute({},{agent:{session:{id:'a',header:{cwd:home}}},signal:new AbortController().signal})
  await entered;const refresh=handle.refresh();await new Promise(resolve=>setImmediate(resolve));assert.equal(discovery,1);assert.equal(closed,1)
  release();await call;await refresh;assert.equal(discovery,2)
})

test('native remote status exposes registration rejection and clears it after successful discovery',async t=>{
  const {RegistrationRejectedError}=await import('@modelcontextprotocol/client')
  const home=await mkdtemp(join(tmpdir(),'figma-registration-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context();let denied=true
  const connect=async()=>{
    if(denied)throw new RegistrationRejectedError({status:403,body:'private-response',submittedMetadata:{redirect_uris:[]}})
    return {client:{listTools:async()=>({tools:[]}),getInstructions:()=>''},close:async()=>{}}
  }
  const handle=await applyWithDependencies(ctx,{backend:'remote'},{home,connect});t.after(()=>handle.close())
  let status=await definitions.get('figma_status').execute({})
  assert.equal(status.structuredContent.available,false)
  assert.equal(status.structuredContent.errorCode,'oauth_client_registration_forbidden')
  assert.equal(status.structuredContent.diagnostic.httpStatus,403)
  assert.doesNotMatch(JSON.stringify(status),/private-response/)
  denied=false;await handle.refresh()
  status=await definitions.get('figma_status').execute({})
  assert.equal(status.structuredContent.available,true)
  assert.equal(status.structuredContent.diagnostic,null)
})

test('explicit desktop backend stays there when the server is unavailable',async t=>{
  const {ctx,definitions}=context();let options,bridgeStarted=false
  const handle=await applyWithDependencies(ctx,{backend:'desktop'}, {
    connect:async value=>{options=value;throw new Error('desktop offline')},
    bridge:{start:async()=>{bridgeStarted=true}}
  });t.after(()=>handle.close())
  const status=(await definitions.get('figma_status').execute({})).structuredContent
  assert.equal(options.backend,'desktop')
  assert.equal(status.backend,'desktop')
  assert.equal(status.available,false)
  assert.equal(status.bridgePort,null)
  assert.equal(bridgeStarted,false)
  assert.deepEqual(status.tools,[])
  assert.match(status.setup,/No companion plugin or remote OAuth login/)
  assert.ok(!definitions.has('mcp__figma__use_figma'))
})

test('default local prepares a private companion and binds one file without silently switching',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs')
  const {connect}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-auto-bind-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context(),bridge=new LocalBridge({token:'a'.repeat(64),port:0})
  bridge.call=async id=>({value:{id},images:[]})
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const status=(await definitions.get('figma_status').execute({})).structuredContent
  assert.equal(status.backend,'local');assert.equal(status.available,true);assert.ok(status.companion.paired)
  assert.doesNotMatch(JSON.stringify(status),new RegExp(bridge.token))
  const exec={agent:{session:{id:'a',header:{cwd:home}}},signal:new AbortController().signal}
  const invoke=()=>definitions.get('mcp__figma__get_metadata').execute({},exec)
  await assert.rejects(invoke(),/No Figma document/)
  const first=await connect(bridge,'First');assert.equal((await invoke()).structuredContent.result.id,first)
  const second=await connect(bridge,'Second');assert.equal((await invoke()).structuredContent.result.id,first)
  await assert.rejects(definitions.get('mcp__figma__get_metadata').execute({},{...exec,agent:{session:{id:'new',header:{cwd:home}}}}),/Multiple Figma documents/)
  bridge.remove(first);await assert.rejects(invoke(),/will not switch automatically/)
  await definitions.get('figma_select_document').execute({connectionId:second},exec)
  assert.equal((await invoke()).structuredContent.result.id,second)
})

test('compact status, optimized-query capability gate and private performance diagnostics',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs')
  const {request}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-performance-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context(),bridge=new LocalBridge({token:'a'.repeat(64),port:0})
  const calls=[]
  bridge.call=async(id,method,args,options)=>{calls.push({id,method,args,inspect:options.inspect});options.onMetric({queueMs:1,bridgeMs:3});return{value:{id:'sensitive-node',name:'private-design'},images:[],metrics:{runtimeMs:2,nodeCount:1,exportMs:0,serializationMs:0,images:[]}}}
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const exec={agent:{session:{id:'a',header:{cwd:home}}},signal:new AbortController().signal}
  const invoke=(name,args={})=>definitions.get(name).execute(args,exec)
  const compact=(await invoke('figma_status',{compact:true})).structuredContent
  assert.equal(compact.available,true);assert.equal(compact.tools,undefined);assert.equal(compact.setup,undefined);assert.equal(compact.performance,undefined)
  const old=(await (await request(bridge,'/connect',{name:'Old',editorType:'figma'})).json()).connectionId
  await assert.rejects(invoke('mcp__figma__get_metadata',{profile:'summary'}),/rerun/)
  assert.equal(calls.length,0)
  await invoke('mcp__figma__get_metadata');assert.equal(calls.at(-1).inspect,true)
  bridge.remove(old)
  const fresh=(await (await request(bridge,'/connect',{name:'Current',editorType:'figma',featureVersion:1})).json()).connectionId
  await invoke('figma_select_document',{connectionId:fresh})
  const output=await invoke('mcp__figma__get_metadata',{profile:'summary'})
  assert.equal(calls.at(-1).inspect,false)
  assert.doesNotMatch(JSON.stringify(output),/runtimeMs|queueMs/)
  const performance=(await invoke('figma_status',{compact:true,includeMetrics:true})).structuredContent.performance
  assert.equal(performance.completed,2);assert.equal(performance.entries[1].queueMs,1);assert.equal(performance.modelUsage,null)
  assert.doesNotMatch(JSON.stringify(performance),/sensitive-node|private-design/)
})
