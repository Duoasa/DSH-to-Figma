import test from 'node:test'
import { request as httpRequest } from 'node:http'
import assert from 'node:assert/strict'
import { LocalBridge } from '../lib/bridge.mjs'
import { connect,request,runJob,fixtureRuntime } from './fixtures.mjs'
async function rig(t,timeoutMs=1000){const bridge=await new LocalBridge({token:'a'.repeat(64),port:0,timeoutMs}).start();t.after(()=>bridge.close());return bridge}
test('real HTTP rejects bad token, foreign origin/host and handles pairing',async t=>{
  const b=await rig(t)
  assert.equal((await request(b,'/connect',{},{headers:{authorization:'Bearer wrong'}})).status,401)
  assert.equal((await request(b,'/connect',{},{headers:{authorization:`Bearer ${b.token}`,origin:'https://evil.example'}})).status,403)
  assert.equal(await new Promise(resolve=>{const req=httpRequest({hostname:'127.0.0.1',port:b.port,path:'/connect',method:'POST',headers:{host:'evil.example',authorization:`Bearer ${b.token}`}},res=>{res.resume();resolve(res.statusCode)});req.end('{}')}),403)
  const id=await connect(b);assert.equal(b.list()[0].connectionId,id)
  assert.equal((await request(b,'/heartbeat',{connectionId:id})).status,200)
  assert.equal((await request(b,'/result',{connectionId:id,id:'unknown'})).status,409)
})
test('exact localhost host is accepted while lookalikes and wrong ports are rejected',async t=>{
  const b=await rig(t)
  const send=host=>new Promise((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port:b.port,path:'/connect',method:'POST',headers:{host,authorization:`Bearer ${b.token}`}},res=>{res.resume();resolve({status:res.statusCode})});req.on('error',reject);req.end(JSON.stringify({name:'Localhost canvas',editorType:'figma'}))})
  assert.equal((await send(`localhost:${b.port}`)).status,200)
  assert.equal((await send(`localhost.evil.example:${b.port}`)).status,403)
  assert.equal((await send(`localhost:${b.port+1}`)).status,403)
})
test('FIFO serial execution reaches the companion runtime, with no cross-document routing',async t=>{
  const b=await rig(t),id=await connect(b),other=await connect(b,'Other'),{runtime,page}=await fixtureRuntime()
  const first=b.call(id,'use_figma',{code:`const n=figma.createFrame();figma.currentPage.appendChild(n);n.name='First';return {id:n.id}`},{mutation:true})
  const second=b.call(id,'get_metadata',{},{inspect:true})
  const job=await runJob(b,id,runtime);assert.equal(job.method,'use_figma');await first
  assert.equal(b.documents.get(other).queue.length,0)
  await runJob(b,id,runtime);const snapshot=await second;assert.equal(snapshot.value.currentPage.children[0].name,'First');assert.equal(page.children.length,1)
})
test('queued cancellation never dispatches and active cancellation never replays',async t=>{
  const b=await rig(t),id=await connect(b),control=new AbortController()
  const canceled=b.call(id,'use_figma',{code:'return 1'},{signal:control.signal,mutation:true});control.abort();await assert.rejects(canceled,/before dispatch/)
  assert.equal(b.documents.get(id).queue.length,0)
  const activeControl=new AbortController(),active=b.call(id,'use_figma',{code:'return 2'},{signal:activeControl.signal,mutation:true})
  const job=await (await request(b,'/poll',{connectionId:id})).json();activeControl.abort();await assert.rejects(active,/not replay|Do not replay/)
  assert.equal(b.list()[0].busy,true);assert.equal(b.list()[0].needsInspection,true)
  await request(b,'/result',{connectionId:id,id:job.id,ok:true,result:{value:2,images:[]}})
  const blocked=b.call(id,'use_figma',{code:'return 3'},{mutation:true})
  const poll=request(b,'/poll',{connectionId:id})
  await assert.rejects(blocked,/uncertain/)
  const read=b.call(id,'get_metadata',{},{inspect:true}),readJob=await (await poll).json()
  await request(b,'/result',{connectionId:id,id:readJob.id,ok:true,result:{value:{},images:[]}});await read
  assert.equal(b.list()[0].needsInspection,false)
})
test('partial error gates writes; metadata reconciles; duplicate result is rejected',async t=>{
  const b=await rig(t),id=await connect(b),{runtime,page}=await fixtureRuntime()
  const failed=b.call(id,'use_figma',{code:"const n=figma.createFrame();figma.currentPage.appendChild(n);throw Error('partial')"},{mutation:true});const rejection=assert.rejects(failed,/partial/)
  const job=await runJob(b,id,runtime);await rejection;assert.equal(page.children.length,1);assert.equal(b.list()[0].needsInspection,true)
  assert.equal((await request(b,'/result',{connectionId:id,id:job.id,ok:true})).status,409)
  const read=b.call(id,'get_metadata',{},{inspect:true});await runJob(b,id,runtime);await read;assert.equal(b.list()[0].needsInspection,false)
})
test('disconnect rejects pending calls and cannot route them to a new connection',async t=>{
  const b=await rig(t),id=await connect(b),p=b.call(id,'use_figma',{code:'return 1'},{mutation:true}),rejection=assert.rejects(p,/disconnected/)
  await request(b,'/disconnect',{connectionId:id});await rejection
  const next=await connect(b);assert.notEqual(next,id);assert.equal(b.documents.get(next).queue.length,0)
})
test('timeout retains in-flight operation and refuses blind replay',async t=>{
  const b=await rig(t,60),id=await connect(b),p=b.call(id,'use_figma',{code:'return 1'},{mutation:true}),rejected=assert.rejects(p,/unknown/)
  await request(b,'/poll',{connectionId:id});await rejected;assert.equal(b.list()[0].busy,true);assert.equal(b.list()[0].needsInspection,true)
})
test('repeated companion handshake is idempotent and preserves active job state',async t=>{
  const b=await rig(t),clientId=crypto.randomUUID(),metadata={name:'Canvas',editorType:'figma',clientId}
  const id=(await (await request(b,'/connect',metadata)).json()).connectionId
  const pending=b.call(id,'use_figma',{code:'return 1'},{mutation:true})
  const job=await (await request(b,'/poll',{connectionId:id})).json()
  const retry=await (await request(b,'/connect',metadata)).json()
  assert.equal(retry.connectionId,id);assert.equal(b.list().length,1);assert.equal(b.documents.get(id).active.id,job.id)
  await request(b,'/result',{connectionId:id,id:job.id,ok:true,result:{value:1}});await pending
})

test('document status distinguishes companion versions from feature capability and unknown versions',async t=>{
  const b=await rig(t)
  for(const metadata of [
    {name:'Old',editorType:'figma'},
    {name:'Current',editorType:'figma',featureVersion:2,companionVersion:'0.2.5'},
    {name:'Preview',editorType:'figma',featureVersion:2,companionVersion:'0.2.5-preview.1+test'},
    {name:'Invalid',editorType:'figma',featureVersion:2,companionVersion:'PRIVATE_INVALID_VERSION'},
  ])await request(b,'/connect',metadata)
  assert.deepEqual(b.list().map(doc=>[doc.name,doc.featureVersion,doc.companionVersion]),[
    ['Old',0,null],['Current',2,'0.2.5'],['Preview',2,'0.2.5-preview.1+test'],['Invalid',2,null],
  ])
  assert.doesNotMatch(JSON.stringify(b.list()),/PRIVATE_INVALID_VERSION/)
})

test('bridge reports queue/execution durations once without altering results or replay safety',async t=>{
  const b=await rig(t),id=await connect(b),{runtime}=await fixtureRuntime(),metrics=[]
  const read=b.call(id,'get_metadata',{}, {onMetric:metric=>metrics.push(metric)})
  await runJob(b,id,runtime);await read
  assert.equal(metrics.length,1);assert.ok(metrics[0].queueMs>=0);assert.ok(metrics[0].bridgeMs>=0)
  const controller=new AbortController()
  const canceled=b.call(id,'get_metadata',{}, {signal:controller.signal,onMetric:metric=>metrics.push(metric)})
  controller.abort();await assert.rejects(canceled,/before dispatch/)
  assert.equal(metrics.length,2);assert.equal(metrics[1].bridgeMs,null)
  const robust=b.call(id,'get_metadata',{}, {onMetric:()=>{throw Error('diagnostics failed')}})
  await runJob(b,id,runtime);await robust
})
