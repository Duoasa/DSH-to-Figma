import test from 'node:test'
import assert from 'node:assert/strict'
import { PerformanceLog } from '../lib/performance.mjs'

test('performance log is bounded, content-free and does not claim model usage', () => {
  const log = new PerformanceLog(2)
  for (let index=0;index<3;index++) log.record({tool:'get_metadata',status:index===2?'failed':'ok',hostMs:12.34567,textBytes:100,imageBytes:0,imageCount:0,
    args:{nodeId:'PRIVATE_NODE'}, error:'SECRET_ERROR', token:'SECRET_TOKEN', runtime:{runtimeMs:7,exportMs:2,serializationMs:1,nodeCount:5,images:[{width:400,height:200,data:'PRIVATE_IMAGE'}],value:'PRIVATE_DESIGN'},bridge:{queueMs:1,bridgeMs:10}})
  const report=log.snapshot({details:true})
  assert.equal(report.completed,3);assert.equal(report.retained,2);assert.equal(report.entries[0].sequence,2)
  assert.equal(report.totals.succeeded,1);assert.equal(report.totals.failed,1);assert.equal(report.totals.textBytes,200)
  assert.equal(report.modelUsage,null);assert.equal(report.entries[0].hostMs,12.346)
  assert.deepEqual(report.window,{afterSequence:0,throughSequence:3,expected:3,returned:2,dropped:1,complete:false})
  assert.equal(log.snapshot().entries,undefined)
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_|SECRET_/)
  report.entries[0].imageDimensions[0].width=1
  assert.equal(log.snapshot({details:true}).entries[0].imageDimensions[0].width,400)
})

test('missing, non-numeric and invalid metrics stay unknown',()=>{
  const log=new PerformanceLog()
  log.record({tool:'sensitive arbitrary text',status:'error contains details',hostMs:NaN,textBytes:-1,runtime:{runtimeMs:'12',images:[{width:Infinity,height:-1}]}})
  const entry=log.snapshot({details:true}).entries[0]
  assert.equal(entry.tool,'unknown');assert.equal(entry.status,'failed')
  for(const key of ['hostMs','textBytes','runtimeMs','queueMs','imageBytes'])assert.equal(entry[key],null)
  assert.deepEqual(entry.imageDimensions,[{width:null,height:null}])
})

test('cursor measures only subsequent calls and identifies an expired interval',()=>{
  const log=new PerformanceLog(2)
  log.record({tool:'get_metadata',status:'ok',textBytes:100})
  const baseline=log.snapshot().cursor
  log.record({tool:'get_screenshot',status:'ok',textBytes:20,imageBytes:50,imageCount:1})
  log.record({tool:'use_figma',status:'failed',textBytes:0})
  const window=log.snapshot({since:baseline,details:true})
  assert.equal(window.completed,3)
  assert.deepEqual(window.window,{afterSequence:1,throughSequence:3,expected:2,returned:2,dropped:0,complete:true})
  assert.equal(window.totals.textBytes,20)
  assert.equal(window.totals.succeeded,1);assert.equal(window.totals.failed,1)
  assert.deepEqual(window.entries.map(item=>item.sequence),[2,3])
  const none=log.snapshot({since:window.cursor})
  assert.equal(none.window.returned,0);assert.equal(none.window.complete,true);assert.equal(none.totals.textBytes,0)
  log.record({tool:'get_metadata',status:'ok',textBytes:8})
  const expired=log.snapshot({since:baseline})
  assert.equal(expired.window.expected,3);assert.equal(expired.window.returned,2)
  assert.equal(expired.window.complete,false);assert.equal(expired.window.dropped,1)
  assert.equal(expired.totals.textBytes,8)
})

test('cursors reject other sessions, restarts, future positions and malformed values',()=>{
  const log=new PerformanceLog(),cursor=log.snapshot().cursor
  const restarted=new PerformanceLog()
  assert.throws(()=>restarted.snapshot({since:cursor}),/another session or plugin run/)
  assert.throws(()=>log.snapshot({since:{...cursor,sequence:1}}),/ahead/)
  for(const since of [null,[],{}, {epoch:cursor.epoch,sequence:-1},{epoch:cursor.epoch,sequence:0.5},{epoch:cursor.epoch,sequence:Number.MAX_SAFE_INTEGER+1}]){
    assert.throws(()=>log.snapshot({since}),/Invalid metrics cursor/)
  }
  assert.notEqual(cursor.epoch,restarted.snapshot().cursor.epoch)
})
