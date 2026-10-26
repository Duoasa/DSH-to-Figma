import test from 'node:test'
import assert from 'node:assert/strict'
import { PerformanceLog } from '../lib/performance.mjs'

test('performance log is bounded, content-free and does not claim model usage', () => {
  const log = new PerformanceLog(2)
  for (let index=0;index<3;index++) log.record({tool:'get_metadata',status:index===2?'failed':'ok',hostMs:12.34567,textBytes:100,imageBytes:0,imageCount:0,
    args:{nodeId:'PRIVATE_NODE'}, error:'SECRET_ERROR', token:'SECRET_TOKEN', runtime:{runtimeMs:7,exportMs:2,serializationMs:1,nodeCount:5,images:[{width:400,height:200,data:'PRIVATE_IMAGE'}],value:'PRIVATE_DESIGN'},bridge:{queueMs:1,bridgeMs:10}})
  const report=log.snapshot()
  assert.equal(report.completed,3);assert.equal(report.retained,2);assert.equal(report.entries[0].sequence,2)
  assert.equal(report.totals.succeeded,1);assert.equal(report.totals.failed,1);assert.equal(report.totals.textBytes,200)
  assert.equal(report.modelUsage,null);assert.equal(report.entries[0].hostMs,12.346)
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_|SECRET_/)
  report.entries[0].imageDimensions[0].width=1
  assert.equal(log.snapshot().entries[0].imageDimensions[0].width,400)
})

test('missing, non-numeric and invalid metrics stay unknown',()=>{
  const log=new PerformanceLog()
  log.record({tool:'sensitive arbitrary text',status:'error contains details',hostMs:NaN,textBytes:-1,runtime:{runtimeMs:'12',images:[{width:Infinity,height:-1}]}})
  const entry=log.snapshot().entries[0]
  assert.equal(entry.tool,'unknown');assert.equal(entry.status,'failed')
  for(const key of ['hostMs','textBytes','runtimeMs','queueMs','imageBytes'])assert.equal(entry[key],null)
  assert.deepEqual(entry.imageDimensions,[{width:null,height:null}])
})
