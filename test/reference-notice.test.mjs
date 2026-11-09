import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {applyWithDependencies} from '../index.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {connect,request,fixtureRuntime,runJob} from './fixtures.mjs'

async function setup(t){
 const home=await mkdtemp(join(tmpdir(),'reference-notice-'));t.after(()=>rm(home,{recursive:true,force:true}))
 const definitions=new Map(),contexts=new Map(),sections=new Map()
 const ctx={tools:{register(d){definitions.set(d.name,d);return()=>definitions.delete(d.name)}},skills:{registerProvider(){}},systemPrompt:{context(d){contexts.set(d.name,d);return()=>contexts.delete(d.name)},section(d){sections.set(d.name,d);return()=>sections.delete(d.name)},getSectionOrder(){return 1}},logger:{warn(){}},effect(){},on(){},get(){}}
 const bridge=new LocalBridge({token:'a'.repeat(64),port:0}),handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
 const agent={session:{id:'work-a',header:{cwd:home}}},exec={agent,signal:new AbortController().signal}
 const call=(name,args={},owner=exec)=>definitions.get(name).execute(args,owner)
 const notice=()=>contexts.get('mcp:figma-design-reference').text({agent})
 return {home,definitions,contexts,bridge,agent,exec,call,notice,handle}
}
test('manual bind/change/unbind refresh model context without tools, canvas reads, or consumed notifications',async t=>{
 const h=await setup(t),id=await connect(h.bridge,'Canvas',5)
 await h.call('figma_select_document',{connectionId:id})
 const update=(reference,serial)=>request(h.bridge,'/reference',{connectionId:id,designReference:reference,referenceSerial:serial})
 assert.match(h.notice(),/未绑定/)
 await update({kind:'frame',name:'Reference A',nodeId:'1:1',revision:'a',content:'NEVER INJECT',images:['NEVER INJECT']},1)
 const a=h.notice();assert.match(a,/Reference A/);assert.doesNotMatch(a,/NEVER INJECT/)
 assert.equal(h.notice(),a,'preview and aborted assembly must not consume a notice')
 await update({kind:'frame',name:'Reference B',nodeId:'1:2',revision:'b'},2)
 assert.match(h.notice(),/Reference B/);assert.doesNotMatch(h.notice(),/Reference A/)
 await update(null,3);assert.match(h.notice(),/未绑定.*旧参考/)
 await request(h.bridge,'/heartbeat',{connectionId:id,designReference:{kind:'frame',name:'Stale A'},referenceSerial:1})
 assert.match(h.notice(),/未绑定/,'late heartbeat cannot resurrect the old binding')
 assert.equal(h.bridge.documents.get(id).queue.length,0);assert.equal(h.bridge.operations.size,0)
 assert.equal(h.contexts.get('mcp:figma-design-reference').required,true)
 h.agent.session.header.cwd=join(h.home,'elsewhere');assert.match(h.notice(),/工作区已改变/)
 await h.handle.close();assert.equal(h.contexts.size,0)
})
test('DSH reference tools and manual UI updates use the same latest model state; files and Work bindings stay isolated',async t=>{
 const h=await setup(t),a=await connect(h.bridge,'Canvas A',5),b=await connect(h.bridge,'Canvas B',5),f=await fixtureRuntime()
 assert.equal(h.notice(),'','ambiguous unbound documents never inject another file reference')
 await h.call('figma_select_document',{connectionId:a})
 await request(h.bridge,'/reference',{connectionId:b,designReference:{kind:'spec',name:'Other document'}})
 assert.doesNotMatch(h.notice(),/Other document/)
 let pending=h.call('mcp__figma__set_design_reference',{kind:'spec',name:'DSH spec',content:'PRIVATE FULL SPEC'})
 await runJob(h.bridge,a,f.runtime);await pending
 assert.match(h.notice(),/DSH spec/);assert.doesNotMatch(h.notice(),/PRIVATE FULL SPEC/)
 pending=h.call('mcp__figma__clear_design_reference');await runJob(h.bridge,a,f.runtime);await pending
 assert.match(h.notice(),/未绑定/)
 h.bridge.remove(a);assert.match(h.notice(),/连接已失效/);assert.doesNotMatch(h.notice(),/Other document/)
})
