import test from 'node:test'
import assert from 'node:assert/strict'
import { LocalBridge } from '../lib/bridge.mjs'
import { connect,request } from './fixtures.mjs'

async function rig(t,timeoutMs=2000){const bridge=await new LocalBridge({token:'a'.repeat(64),port:0,timeoutMs}).start();t.after(()=>bridge.close());return bridge}
async function complete(bridge,id,result,options={}){
  const call=bridge.call(id,options.method??'get_metadata',{},options)
  const job=await (await request(bridge,'/poll',{connectionId:id})).json()
  assert.equal((await request(bridge,'/result',{connectionId:id,id:job.id,ok:true,result})).status,200)
  await call
  return job.id
}

test('history and recovered results remain isolated by Work and document',async t=>{
  const b=await rig(t),id=await connect(b),other=await connect(b,'Other')
  const op=await complete(b,id,{value:{node:{id:'1:2',name:'Recovered'}},images:[]},{owner:'work-a'})
  const status=b.operation(id,op,'work-a')
  assert.equal(status.state,'completed');assert.equal(status.resultAvailable,true);assert.equal(status.result,undefined);assert.equal(status.replayed,false)
  assert.ok(status.expiresAt>status.finishedAt)
  const recovered=b.operation(id,op,'work-a',true)
  assert.equal(recovered.result.value.node.name,'Recovered')
  recovered.result.value.node.name='Changed locally'
  assert.equal(b.operation(id,op,'work-a',true).result.value.node.name,'Recovered')
  assert.throws(()=>b.operation(other,op,'work-a',true),/Work\/document/)
  assert.throws(()=>b.operation(id,op,'work-b',true),/Work\/document/)
  await assert.rejects(b.call(id,'get_metadata',{}, {operationId:op,owner:'work-a'}),/instead of replaying/)
  b.operations.get(op).expiresAt=Date.now()-1
  assert.throws(()=>b.operation(id,op,'work-a',true),/expired or evicted/)
  assert.equal(b.operationCacheBytes,0)
})

test('late success clears only after explicitly retrieving its retained result',async t=>{
  const b=await rig(t,50),id=await connect(b),owner='work-a',op='timed-out-write'
  const call=b.call(id,'use_figma',{code:'create once'}, {operationId:op,owner,mutation:true})
  const rejected=assert.rejects(call,/outcome may be unknown/)
  const job=await (await request(b,'/poll',{connectionId:id})).json()
  await rejected
  assert.equal(b.operation(id,op,owner).state,'unknown')
  // Even an old timed-out active record cannot expire while its job may still finish.
  b.operations.get(op).expiresAt=Date.now()-1;b.pruneOperations()
  assert.equal(b.operation(id,op,owner).state,'unknown')
  assert.equal(b.documents.get(id).active.id,op)
  await assert.rejects(b.call(id,'use_figma',{}, {operationId:op,owner,mutation:true}),/instead of replaying/)
  assert.equal((await request(b,'/result',{connectionId:id,id:job.id,ok:true,result:{value:{createdNodeIds:['1:9']},images:[]}})).status,200)
  assert.equal(b.operation(id,op,owner).requiresCanvasInspection,true)
  const status=b.operation(id,op,owner,true)
  assert.equal(status.state,'completed');assert.equal(status.lateResult,true);assert.equal(status.requiresCanvasInspection,false)
  assert.deepEqual(status.result.value.createdNodeIds,['1:9'])
  assert.equal(b.documents.get(id).active,null);assert.equal(b.documents.get(id).queue.length,0)
  assert.equal((await request(b,'/result',{connectionId:id,id:job.id,ok:true,result:{value:'duplicate'}})).status,409)
  assert.equal(b.documents.get(id).uncertain,false)
})

test('result cache has a one MiB entry limit and eight MiB aggregate limit',async t=>{
  const b=await rig(t),id=await connect(b),owner='work-a',ids=[]
  for(let i=0;i<12;i++)ids.push(await complete(b,id,{value:'x'.repeat(850*1024),images:[]},{owner}))
  assert.ok(b.operationCacheBytes<=8*1024*1024)
  const evicted=b.operation(id,ids[0],owner,true)
  assert.equal(evicted.state,'completed');assert.equal(evicted.resultAvailable,false);assert.equal(evicted.resultUnavailableReason,'cache-evicted');assert.equal(evicted.result,undefined)
  assert.equal(b.operation(id,ids.at(-1),owner,true).result.value.length,850*1024)
  const large=await complete(b,id,{value:'x'.repeat(1024*1024),images:[]},{owner})
  assert.equal(b.operation(id,large,owner,true).resultUnavailableReason,'result-too-large')
  const asset=await complete(b,id,{value:{},images:[],assets:[{name:'asset.svg',data:'content'}]},{owner})
  assert.equal(b.operation(id,asset,owner,true).resultUnavailableReason,'external-assets')
  const transfer=await complete(b,id,{value:{transfer:{transferId:'temporary'}},images:[]},{owner})
  assert.equal(b.operation(id,transfer,owner,true).resultUnavailableReason,'ephemeral-transfer')
  assert.ok(b.operationCacheBytes<=8*1024*1024)
})

test('private transfer calls cannot fill user history or retain export chunk data',async t=>{
  const b=await rig(t),id=await connect(b)
  const chunk=await complete(b,id,{value:{data:'base64'.repeat(20000)},images:[]},{method:'read_export_chunk',owner:'work-a'})
  await complete(b,id,{value:{released:true},images:[]},{method:'release_export',owner:'work-a'})
  assert.equal(b.operations.size,0);assert.equal(b.operationCacheBytes,0)
  assert.throws(()=>b.operation(id,chunk,'work-a',true),/outcome is unknown/)
  for(let i=0;i<1100;i++){
    const controller=new AbortController()
    const pending=b.call(id,'read_export_chunk',{transferId:'video',offset:i},{owner:'work-a',signal:controller.signal})
    controller.abort();await assert.rejects(pending,/canceled before dispatch/)
  }
  assert.equal(b.operations.size,0)
  const controller=new AbortController(),first=b.call(id,'read_export_chunk',{}, {operationId:'chunk-active',signal:controller.signal})
  const rejected=assert.rejects(first,/interrupted/)
  await request(b,'/poll',{connectionId:id})
  await assert.rejects(b.call(id,'read_export_chunk',{}, {operationId:'chunk-active'}),/instead of replaying/)
  controller.abort();await rejected
  await request(b,'/result',{connectionId:id,id:'chunk-active',ok:true,result:{value:'late'}})
  assert.equal(b.operationCacheBytes,0)
})

test('settled history evicts while queued and active jobs remain recoverable',async t=>{
  const b=await rig(t,10000),id=await connect(b),queuedAbort=new AbortController()
  const queued=b.call(id,'get_metadata',{}, {owner:'work-a',operationId:'keep-queued',signal:queuedAbort.signal}),queuedRejected=assert.rejects(queued,/canceled before dispatch/)
  for(let i=0;i<1100;i++){
    const controller=new AbortController(),p=b.call(id,'get_metadata',{}, {owner:'work-a',operationId:`settled-${i}`,signal:controller.signal})
    controller.abort();await assert.rejects(p,/canceled before dispatch/)
  }
  assert.equal(b.operations.size,1000)
  assert.equal(b.operation(id,'keep-queued','work-a').state,'queued')
  assert.throws(()=>b.operation(id,'settled-0','work-a'),/expired or evicted/)
  assert.equal(b.operation(id,'settled-1099','work-a').state,'canceled')
  queuedAbort.abort();await queuedRejected
  b.operations.get('keep-queued').expiresAt=Date.now()-1
  assert.throws(()=>b.operation(id,'keep-queued','work-a'),/outcome is unknown; do not replay/)
})

test('failure history preserves batch diagnostics and created node IDs without bypassing write safety',async t=>{
  const b=await rig(t),id=await connect(b,'Canvas',5),owner='work-a'
  const call=b.call(id,'use_figma',{}, {mutation:true,owner})
  const failure=call.catch(error=>error),job=await (await request(b,'/poll',{connectionId:id})).json()
  const batchResult={complete:false,commands:[{index:0,status:'completed'},{index:1,status:'failed'}]},createdNodeIds=['1:9']
  await request(b,'/result',{connectionId:id,id:job.id,ok:false,error:'Partial command failure',batchResult,createdNodeIds})
  const error=await failure
  assert.deepEqual(error.batchResult,batchResult);assert.deepEqual(error.createdNodeIds,createdNodeIds)
  const status=b.operation(id,job.id,owner,true)
  assert.equal(status.state,'failed');assert.equal(status.failureDetailsAvailable,true)
  assert.deepEqual(status.batchResult,batchResult);assert.deepEqual(status.createdNodeIds,createdNodeIds)
  assert.equal(status.safeToRetryWithoutCanvasRead,false);assert.equal(status.requiresCanvasInspection,true)
})

const descriptor=()=>({transferId:'export-private-recovery',nodeId:'1:9',format:'MP4',mimeType:'video/mp4',byteLength:1024,chunkSize:512*1024,expiresAt:new Date(Date.now()+600000).toISOString(),name:'animation.mp4'})

test('a late video export can be claimed once and replaced by its final host result',async t=>{
  const b=await rig(t,50),id=await connect(b),owner='work-a',op='late-video'
  const pending=b.call(id,'export_video',{}, {owner,operationId:op}),rejected=assert.rejects(pending,/outcome may be unknown/)
  const job=await (await request(b,'/poll',{connectionId:id})).json();await rejected
  const transfer=descriptor()
  await request(b,'/result',{connectionId:id,id:job.id,ok:true,result:{value:{transfer},images:[]}})
  const publicStatus=b.operation(id,op,owner,true)
  assert.equal(publicStatus.state,'completed');assert.equal(publicStatus.outputState,'pending');assert.equal(publicStatus.resultStage,'native')
  assert.equal(publicStatus.resultAvailable,false);assert.doesNotMatch(JSON.stringify(publicStatus),/export-private-recovery|transferId|chunkSize/)
  assert.throws(()=>b.takeExport(id,op,'another-work'),/Work\/document/)
  const claim=b.takeExport(id,op,owner)
  assert.equal(claim.transfer.transferId,transfer.transferId);assert.equal(claim.state,'claimed')
  claim.transfer.name='Changed outside cache'
  assert.equal(b.operations.get(op).cached.pendingExport.name,'animation.mp4')
  assert.throws(()=>b.takeExport(id,op,owner),/already in progress/)
  // Claimed recovery is protected even while unrelated results evict old cache entries.
  for(let i=0;i<12;i++)await complete(b,id,{value:'x'.repeat(850*1024),images:[]},{owner})
  assert.equal(b.operation(id,op,owner).outputState,'recovering');assert.ok(b.operationCacheBytes<=8*1024*1024)
  const output={file:{path:'/workspace/.figma/assets/animation.mp4',bytes:1024},operationId:op}
  assert.equal(b.completeOutput(id,op,owner,output),true)
  const recovered=b.operation(id,op,owner,true)
  assert.equal(recovered.resultStage,'host');assert.equal(recovered.outputState,'completed');assert.deepEqual(recovered.result,output)
  assert.equal(b.takeExport(id,op,owner),null)
  assert.equal(b.failOutput(id,op,owner,Error('late cleanup error')),false)
  assert.equal(b.documents.get(id).queue.length,0)
  assert.equal(b.operations.get(op).cached.pendingExport,undefined)
})

test('failed or expired export recovery becomes unavailable without exposing or replaying the transfer',async t=>{
  const b=await rig(t),id=await connect(b),owner='work-a'
  const op=await complete(b,id,{value:{transfer:descriptor()},images:[]},{owner,method:'export_video'})
  b.takeExport(id,op,owner)
  assert.equal(b.failOutput(id,op,'another-work',Error('wrong owner')),false)
  assert.equal(b.operation(id,op,owner).outputState,'recovering')
  assert.equal(b.failOutput(id,op,owner,Error('Save interrupted')),true)
  const failed=b.operation(id,op,owner,true)
  assert.equal(failed.state,'completed');assert.equal(failed.outputState,'unavailable');assert.equal(failed.resultUnavailableReason,'transfer-unavailable')
  assert.equal(failed.hostError,'Save interrupted');assert.equal(b.takeExport(id,op,owner),null)
  assert.doesNotMatch(JSON.stringify(failed),/export-private-recovery|transferId/)
  const expired=await complete(b,id,{value:{transfer:descriptor()},images:[]},{owner,method:'export_video'})
  b.operations.get(expired).cached.pendingExport.expiresAt=new Date(Date.now()-1).toISOString()
  assert.equal(b.takeExport(id,expired,owner),null)
  assert.equal(b.operation(id,expired,owner).resultUnavailableReason,'transfer-expired')
  assert.equal(b.operationCacheBytes,0)
})

test('pending export metadata is validated, whitelisted, scoped and bounded by history retention',async t=>{
  const b=await rig(t),id=await connect(b),other=await connect(b,'Other'),owner='work-a'
  const op=await complete(b,id,{value:{transfer:{...descriptor(),unexpected:'x'.repeat(2*1024*1024)}},images:[]},{owner,method:'export_video'})
  assert.ok(b.operationCacheBytes<4096)
  assert.equal(b.operations.get(op).cached.pendingExport.unexpected,undefined)
  assert.throws(()=>b.takeExport(other,op,owner),/Work\/document/)
  assert.equal(b.completeOutput(other,op,owner,{file:'wrong document'}),false)
  b.operations.get(op).expiresAt=Date.now()-1
  assert.throws(()=>b.takeExport(id,op,owner),/not found/)
  assert.equal(b.operationCacheBytes,0)
  const bad=await complete(b,id,{value:{transfer:{...descriptor(),chunkSize:513*1024}},images:[]},{owner,method:'export_video'})
  assert.equal(b.operation(id,bad,owner).resultUnavailableReason,'invalid-export-descriptor')
  assert.equal(b.takeExport(id,bad,owner),null)
  assert.equal(b.operationCacheBytes,0)
})
