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

test('default backend uses official desktop and stays there when the server is unavailable',async t=>{
  const {ctx,definitions}=context();let options,bridgeStarted=false
  const handle=await applyWithDependencies(ctx,{}, {
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
