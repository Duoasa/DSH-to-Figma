import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm,mkdir,writeFile,readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWithDependencies } from '../index.mjs'
import packageJson from '../package.json' with { type: 'json' }
function context(){const definitions=new Map(),listeners=new Map();return {definitions,listeners,ctx:{tools:{register(def){if(definitions.has(def.name))throw Error('duplicate');definitions.set(def.name,def);return()=>definitions.delete(def.name)}},skills:{registerProvider(){}},systemPrompt:{section(){},getSectionOrder(){return 1}},logger:{warn(){},info(){}},effect(){},on(name,fn){listeners.set(name,fn)},get(){return undefined}}}}
const response=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value})
test('local preflight returns repair details without dispatch and accepts corrected retry',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs')
  const {connect}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-preflight-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context(),bridge=new LocalBridge({token:'a'.repeat(64),port:0}),calls=[]
  bridge.call=async(id,method,args)=>{calls.push(args);return {value:{ok:true},images:[]}}
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const id=await connect(bridge,'Preflight',3)
  const exec={agent:{session:{id:'preflight',header:{cwd:home}}},signal:new AbortController().signal}
  const invoke=code=>definitions.get('mcp__figma__use_figma').execute({code},exec)
  for(const [code,diagnostic] of [
    ['figma.createFrame();\nconst checks=[1].map(x {return x;});','SCRIPT_SYNTAX'],
    ['const c=figma.createComponent();const instance=c.createInstance();return instance.mainComponent.id;','FIGMA_ASYNC_MAIN_COMPONENT'],
  ]) {
    await assert.rejects(invoke(code),error=>{
      const value=JSON.parse(error.message)
      assert.equal(value.safeToRetryWithoutCanvasRead,true)
      assert.equal(value.diagnostic.stage,'preflight')
      assert.equal(value.diagnostic.code,diagnostic)
      assert.ok(value.diagnostic.line>=1&&value.diagnostic.column>=1)
      assert.ok(value.diagnostic.hint)
      return true
    })
    assert.equal(calls.length,0)
    assert.equal(bridge.list().find(doc=>doc.connectionId===id).needsInspection,false)
  }
  await invoke('const c=figma.createComponent();const instance=c.createInstance();return (await instance.getMainComponentAsync())?.id;')
  assert.equal(calls.length,1)
})
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

test('reconnect status identifies a previous file key without rebinding or leaking another Work selection',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs'),{request}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-reconnect-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const other=await mkdtemp(join(tmpdir(),'figma-other-work-'));t.after(()=>rm(other,{recursive:true,force:true}))
  const {ctx,definitions,listeners}=context(),bridge=new LocalBridge({token:'a'.repeat(64),port:0});let calls=0
  bridge.call=async id=>{calls++;return {value:{id},images:[]}}
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const exec={agent:{session:{id:'a',header:{cwd:home}}},signal:new AbortController().signal}
  const call=(name,args={},owner=exec)=>definitions.get(name).execute(args,owner)
  const status=async owner=>(await call('figma_status',{compact:true},owner)).structuredContent
  const connect=async(name,fileKey,editorType='figma')=>(await (await request(bridge,'/connect',{name,fileKey,editorType,featureVersion:4})).json()).connectionId
  const first=await connect('Original','FileKey123')
  await call('mcp__figma__get_metadata')
  assert.equal((await status()).documents[0].bindingMatch,'selected')
  bridge.remove(first)
  const fresh=await connect('Renamed','FileKey123'),wrong=await connect('Original','Different123'),otherEditor=await connect('Original','FileKey123','slides')
  const health=await status()
  assert.equal(health.documentBinding.state,'disconnected')
  assert.equal(health.documentBinding.lastSelected.connectionId,first)
  assert.equal(health.documentBinding.requiresSelection,true)
  assert.equal(health.documents.find(d=>d.connectionId===fresh).bindingMatch,'same-file-key')
  for(const id of [wrong,otherEditor])assert.equal(health.documents.find(d=>d.connectionId===id).bindingMatch,'none')
  await assert.rejects(call('mcp__figma__get_metadata'),/will not switch automatically/)
  assert.equal(calls,1,'status cannot cause canvas dispatch or silent selection')
  const unrelated=await status({...exec,agent:{session:{id:'b',header:{cwd:home}}}})
  assert.equal(unrelated.documentBinding.lastSelected,null)
  assert.ok(unrelated.documents.every(d=>d.bindingMatch==='none'))
  assert.equal((await definitions.get('figma_status').execute({})).structuredContent.documentBinding.lastSelected,null)
  await call('figma_select_document',{connectionId:fresh})
  assert.equal((await status()).documentBinding.state,'connected')
  exec.agent.session.header.cwd=other
  const changed=await status();assert.equal(changed.documentBinding.state,'workspace-changed');assert.ok(changed.documents.every(d=>d.bindingMatch==='none'))
  await assert.rejects(call('mcp__figma__get_metadata'),/workspace changed/)
  listeners.get('agent/disposed')({agent:exec.agent})
  assert.equal((await status()).documentBinding.lastSelected,null)
})

test('reconnect without a file key reports all name matches as unverified candidates',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs'),{connect}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-reconnect-name-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context(),bridge=new LocalBridge({token:'a'.repeat(64),port:0})
  bridge.call=async id=>({value:{id},images:[]})
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const exec={agent:{session:{id:'a',header:{cwd:home}}},signal:new AbortController().signal}
  const first=await connect(bridge,'Untitled')
  await definitions.get('figma_select_document').execute({connectionId:first},exec)
  bridge.remove(first)
  await connect(bridge,'Untitled');await connect(bridge,'Untitled');await connect(bridge,'Other')
  const health=(await definitions.get('figma_status').execute({compact:true},exec)).structuredContent
  assert.equal(health.documentBinding.lastSelected.fileKey,null)
  assert.equal(health.documents.filter(d=>d.bindingMatch==='same-name-unverified').length,2)
  assert.equal(health.documents.filter(d=>d.bindingMatch==='none').length,1)
  await assert.rejects(definitions.get('mcp__figma__get_metadata').execute({},exec),/will not switch automatically/)
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
  assert.equal(compact.pluginVersion,packageJson.version)
  const old=(await (await request(bridge,'/connect',{name:'Old',editorType:'figma'})).json()).connectionId
  await assert.rejects(invoke('mcp__figma__get_metadata',{profile:'summary'}),/rerun/)
  assert.equal(calls.length,0)
  await invoke('mcp__figma__get_metadata');assert.equal(calls.at(-1).inspect,true)
  bridge.remove(old)
  const fresh=(await (await request(bridge,'/connect',{name:'Current',editorType:'figma',featureVersion:1,companionVersion:'0.2.4'})).json()).connectionId
  await invoke('figma_select_document',{connectionId:fresh})
  const output=await invoke('mcp__figma__get_metadata',{profile:'summary'})
  assert.equal(calls.at(-1).inspect,false)
  assert.doesNotMatch(JSON.stringify(output),/runtimeMs|queueMs/)
  const summary=(await invoke('figma_status',{compact:true,includeMetrics:true})).structuredContent
  assert.equal(summary.documents[0].companionVersion,'0.2.4')
  assert.equal(summary.performance.entries,undefined)
  const performance=(await invoke('figma_status',{compact:true,includeMetrics:true,metricsDetails:true})).structuredContent.performance
  assert.equal(performance.completed,2);assert.equal(performance.entries[1].queueMs,1);assert.equal(performance.modelUsage,null)
  assert.doesNotMatch(JSON.stringify(performance),/sensitive-node|private-design/)
  await assert.rejects(invoke('mcp__figma__get_variable_defs',{collectionsOnly:true}),/rerun/)
  assert.equal(calls.length,2)
  await assert.rejects(invoke('mcp__figma__use_figma',{code:'return 1',description:'Check helpers'}),error=>{
    const result=JSON.parse(error.message);assert.equal(result.safeToRetryWithoutCanvasRead,true);assert.match(result.error,/rerun/);return true
  });assert.equal(calls.length,2)
})

test('performance cursors isolate Work sessions and reset on session disposal',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs')
  const {connect}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-metrics-session-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions,listeners}=context(),bridge=new LocalBridge({token:'a'.repeat(64),port:0})
  bridge.call=async()=>({value:{ok:true},images:[]})
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  await connect(bridge)
  const agentA={session:{id:'PRIVATE_SESSION_A',header:{cwd:home}}},agentB={session:{id:'PRIVATE_SESSION_B',header:{cwd:home}}}
  const invoke=(agent,name,args={})=>definitions.get(name).execute(args,{agent,signal:new AbortController().signal})
  const status=(agent,args={})=>invoke(agent,'figma_status',{compact:true,includeMetrics:true,...args}).then(result=>result.structuredContent.performance)
  const baseline=(await status(agentA)).cursor
  await invoke(agentA,'mcp__figma__get_metadata')
  await invoke(agentB,'mcp__figma__get_metadata')
  await invoke(agentA,'mcp__figma__get_metadata')
  const a=await status(agentA,{metricsSince:baseline,metricsDetails:true}),b=await status(agentB)
  assert.equal(a.completed,2);assert.equal(a.window.returned,2);assert.equal(a.totals.succeeded,2)
  assert.equal(b.completed,1);assert.equal(b.window.returned,1)
  assert.equal(a.window.complete,true);assert.equal(a.entries.length,2)
  assert.equal((await status(agentA,{metricsSince:a.cursor})).window.returned,0,'status reads are not counted as canvas calls')
  assert.doesNotMatch(JSON.stringify([a,b]),/PRIVATE_SESSION/)
  await assert.rejects(status(agentB,{metricsSince:baseline}),/another session or plugin run/)
  await assert.rejects(invoke(agentA,'figma_status',{metricsSince:baseline}),/require includeMetrics/)
  await assert.rejects(definitions.get('figma_status').execute({includeMetrics:true}),/active Work session/)
  listeners.get('agent/disposed')({agent:agentA})
  const reopened={session:{id:agentA.session.id,header:{cwd:home}}}
  await assert.rejects(status(reopened,{metricsSince:baseline}),/another session or plugin run/)
  assert.equal((await status(reopened)).completed,0)
})


test('bundled help remains readable without a backend or Work session and rejects unknown paths',async t=>{
  const home=await mkdtemp(join(tmpdir(),'figma-help-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const {ctx,definitions}=context();let connections=0
  const handle=await applyWithDependencies(ctx,{backend:'desktop'},{home,connect:async()=>{connections++;throw Error('offline')}})
  t.after(()=>handle.close())
  assert.equal(handle.available,false)
  const guide=definitions.get('figma_read_guide')
  for(const topic of ['user-guide','help-connection','help-design','help-motion','help-troubleshooting']){
    const output=await guide.execute({topic})
    assert.match(output.content[0].text,/^# /)
    assert.ok(output.content[0].text.length>500)
  }
  for(const topic of ['../SKILL','../../../../package','missing'])await assert.rejects(guide.execute({topic}),/Unknown Figma guide/)
  assert.equal(connections,1,'reading help must not reconnect or call a canvas')
})


test('0.3.5 ignores legacy default specs without injection, write blocking or data deletion',async t=>{
  const {LocalBridge}=await import('../lib/bridge.mjs')
  const {connect}=await import('./fixtures.mjs')
  const home=await mkdtemp(join(tmpdir(),'figma-no-specs-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const directory=join(home,'figma','specs'),specId='11111111-1111-4111-8111-111111111111'
  await mkdir(directory,{recursive:true})
  const saved=JSON.stringify({specId,name:'Legacy.md',markdown:'# LEGACY_SPEC_SENTINEL',updatedAt:'2026-11-04T00:00:00.000Z'})
  const selected=JSON.stringify({specId,selectionRevision:'22222222-2222-4222-8222-222222222222'})
  await writeFile(join(directory,specId+'.json'),saved)
  const selectionPath=join(home,'figma','specs-default.json');await writeFile(selectionPath,selected)
  const {ctx,definitions}=context(),sections=[],calls=[]
  ctx.systemPrompt.section=section=>sections.push(section)
  const bridge=new LocalBridge({token:'a'.repeat(64),port:0})
  bridge.call=async(id,method,args)=>{calls.push({method,args});return {value:{ok:true},images:[]}}
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const id=await connect(bridge,'No specs',4)
  const exec={agent:{session:{id:'legacy',header:{cwd:home}}},signal:new AbortController().signal}
  assert.equal(handle.toolCount,19)
  for(const name of ['list_local_specs','read_local_spec','edit_local_spec'])assert.equal(definitions.has('mcp__figma__'+name),false)
  assert.equal(sections.some(s=>s.name==='mcp:figma-default-spec'),false)
  assert.doesNotMatch(sections.map(s=>s.text()).join(' '),/LEGACY_SPEC_SENTINEL|read_local_spec|default.spec/i)
  assert.equal((await definitions.get('figma_status').execute({},exec)).structuredContent.localSpecs,undefined)
  const write=()=>definitions.get('mcp__figma__use_figma').execute({code:'return figma.createFrame().id'},exec)
  await write()
  await writeFile(selectionPath,'broken legacy default')
  await write()
  assert.equal(calls.length,2,'neither a selected nor corrupt legacy default blocks dispatch')
  for(const route of ['list','import','export','set-default']){
    const response=await fetch(`http://127.0.0.1:${bridge.port}/specs/${route}`,{method:'POST',headers:{authorization:'Bearer '+bridge.token,'content-type':'application/json'},body:JSON.stringify({connectionId:id,specId:null})})
    assert.equal(response.status,404)
  }
  assert.equal(await readFile(join(directory,specId+'.json'),'utf8'),saved)
  assert.equal(await readFile(selectionPath,'utf8'),'broken legacy default')
})
