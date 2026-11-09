import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import {fixtureRuntime,connect,runJob,request} from './fixtures.mjs'
import {readOnlyProgram} from '../lib/readonly-program.mjs'
import {preflightScript} from '../lib/script-preflight.mjs'
import {requiredQueryFeatureVersion} from '../lib/catalog.mjs'
import {errorDetails} from '../lib/errors.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
const plain=x=>JSON.parse(JSON.stringify(x))
test('quality options require protocol 6; legacy calls keep their gate',()=>{
 assert.equal(requiredQueryFeatureVersion('use_figma',{code:'return 1'}),3)
 for(const name of ['compare','resolve_fonts','rollback'])assert.equal(requiredQueryFeatureVersion(name),6)
 for(const option of ['readOnly','trackCreated','verify'])assert.equal(requiredQueryFeatureVersion('use_figma',{[option]:true}),6)
})
test('verify failure preserves successful drawing, undo count and result',async()=>{
 const f=await fixtureRuntime();const out=await f.runtime.run('use_figma',{code:'return figma.createFrame().id',verify:{nodeId:'missing'}})
 assert.ok(f.nodes.has(out.value));assert.equal(f.undo,1);assert.equal(out.verification.state,'failed');assert.equal(out.verification.writeState,'completed');assert.equal(out.verification.reconcile.tool,'get_screenshot')
 const success=await f.runtime.run('use_figma',{code:'return 42',verify:{nodeId:out.value,scale:.5}})
 assert.equal(success.value,42);assert.equal(success.images.length,1);assert.equal(success.verification.state,'image-returned');assert.equal(success.verification.visualAcceptance,'not-established')
})
test('readOnly interpreter reads async nodes, maps, loops and templates without undo',async()=>{
 const f=await fixtureRuntime(),node=f.figma.createFrame();f.page.appendChild(node)
 const code=preflightScript('const n=await figma.getNodeByIdAsync("'+node.id+'"); const names = figma.currentPage.children.map(x=>x.name); let count=0; for(const item of names){count=count+1;} return {id:n.id,names,count,label:`items ${count}`};')
 const out=await f.runtime.run('use_figma',{code,readOnly:true,readOnlyProgram:readOnlyProgram(code)})
 assert.equal(out.value.id,node.id);assert.equal(out.value.count,1);assert.equal(out.value.label,'items 1');assert.equal(f.undo,0)
})
test('readOnly native write attempts, globals and constructor escapes cannot mutate',async()=>{
 const f=await fixtureRuntime();const count=f.nodes.size
 for(const code of ['figma.createFrame()','globalThis.figma.createFrame()','return [].filter.constructor("return figma")()','return Math.max["con"+"structor"]("return figma")()','return Object.values(figma).find(x=>typeof x==="function")()']){
  await assert.rejects(f.runtime.run('use_figma',{code,readOnly:true,readOnlyProgram:readOnlyProgram(code)}),error=>error.safeToRetryWithoutCanvasRead===true&&error.executionState==='read-only')
  assert.equal(f.nodes.size,count)
 }
 assert.throws(()=>readOnlyProgram('figma.currentPage.name="bad"'),/READ_ONLY_SCRIPT_SUBSET/)
})
test('readOnly JS type error remains safe; existing uncertain write remains protected',async t=>{
 const f=await fixtureRuntime(),b=new LocalBridge({port:0,token:'test'});await b.start();t.after(()=>b.close());const id=await connect(b,'Q',6)
 const failed=b.call(id,'use_figma',{code:'throw Error("write failed")'},{mutation:true,owner:'owner'});const failure=assert.rejects(failed);await runJob(b,id,f.runtime);await failure;assert.equal(b.list()[0].needsInspection,true)
 const code='const n = null; return n.children.find(x=>true)';const read=b.call(id,'use_figma',{code,readOnly:true,readOnlyProgram:readOnlyProgram(code)},{owner:'owner',mutation:false});const check=assert.rejects(read,e=>e.safeToRetryWithoutCanvasRead&&e.executionState==='read-only');await runJob(b,id,f.runtime);await check;assert.equal(b.list()[0].needsInspection,true)
 const blocked=assert.rejects(b.call(id,'use_figma',{code:'return 1'},{mutation:true,owner:'owner'}),e=>e.executionState==='not-started'&&!!e.reconcileOperationId);const polling=request(b,'/poll',{connectionId:id});await blocked;await b.close();await polling
})
test('font resolution caches availability, honors exact styles and explicit fallback policy',async()=>{
 const f=await fixtureRuntime();let calls=0;f.figma.listAvailableFontsAsync=async()=>{calls++;return [{fontName:{family:'Inter',style:'Regular'}},{fontName:{family:'Cascadia Mono',style:'Regular'}},{fontName:{family:'Inter',style:'Medium'}}]}
 let out=await f.runtime.run('resolve_fonts',{specs:[{family:'SF Mono',style:'Regular'},{family:'Inter',style:'Medium'}]})
 assert.equal(out.value.resolved[0].got.family,'Cascadia Mono');assert.equal(out.value.resolved[1].fallback,false)
 out=await f.runtime.run('resolve_fonts',{specs:[{family:'Absent'}],allowFallback:false});assert.equal(out.value.missing.length,1);assert.equal(calls,1)
 await f.runtime.run('resolve_fonts',{specs:[{semantic:'sans'}],forceRefresh:true});assert.equal(calls,2)
})
test('icons produce native nodes; invalid names/colors fail before creation',async()=>{
 const f=await fixtureRuntime();const out=await f.runtime.run('use_figma',{code:'return figma.icon("search",{size:20,color:"#606060"}).name'});assert.equal(out.value,'Icon / search');const count=f.nodes.size
 await assert.rejects(f.runtime.run('use_figma',{code:'figma.icon("search",{color:"red\\\" bad"})'}));assert.equal(f.nodes.size,count)
})
test('comparison measures exact matches, color change and candidate boundaries',async()=>{
 const ctx=vm.createContext({});vm.runInContext(await readFile(new URL('../companion/compare.js',import.meta.url),'utf8'),ctx)
 const pixels=new Uint8ClampedArray(20*20*4).fill(255),altered=pixels.slice();for(let y=0;y<20;y++)for(let x=10;x<20;x++)for(let c=0;c<3;c++)altered[(y*20+x)*4+c]=0
 const same=ctx.DshFigmaCompare.measure(pixels,pixels,20,20);assert.equal(same.meanDeltaE76,0)
 const different=ctx.DshFigmaCompare.measure(pixels,altered,20,20);assert.ok(different.meanDeltaE76>40);assert.equal(different.changedSampleRatio,.5);assert.ok(different.boundaries.x.actual.includes(10))
})
test('native FILL repair stays error-only and names prior blocking operation',()=>{
 const value=errorDetails({message:'FILL can only be set on children of auto-layout frames',reconcileOperationId:'prior',recovery:{needsInspection:true}},{safe:true})
 assert.match(value.messageHuman,/appendChild/);assert.equal(value.blockingOperation.operationId,'prior');assert.equal(value.retryable,false)
})
async function cleanupFixture(){
 const f=await fixtureRuntime(),listeners=new Map();f.page.on=(name,fn)=>listeners.set(name,fn);f.page.off=(name)=>listeners.delete(name);f.figma.on=()=>{};f.figma.off=()=>{}
 const factory=f.figma.createFrame
 f.figma.createFrame=()=>{const node=factory();node.exportAsync=async()=>({document:{id:node.id,name:node.name,width:node.width,children:node.children.map(n=>({id:n.id,name:n.name}))}});node.remove=()=>{for(const n of [node,...node.findAll(()=>true)]){n.removed=true;f.nodes.delete(n.id)}node.parent.children=node.parent.children.filter(n=>n!==node)};return node}
 return {...f,edit:()=>listeners.get('nodechange')?.()}
}
async function failedCreation(f,id,extra=''){
 try{await f.runtime.run('use_figma',{code:'const n=figma.createFrame();figma.currentPage.appendChild(n);n.name="partial";'+extra+'throw Error("stop")',trackCreated:true},{operationId:id});assert.fail('must fail')}catch(e){assert.equal(e.cleanup.available,true);return e.cleanup.createdNodeIds}
}
test('cleanup removes recorded unchanged disposable subtree only and retains other nodes',async()=>{
 const f=await cleanupFixture(),existing=f.figma.createFrame();f.page.appendChild(existing)
 const ids=await failedCreation(f,'failed-1');const out=await f.runtime.run('rollback',{operationId:'failed-1'})
 assert.deepEqual(plain(out.value.removed),plain(ids));assert.ok(f.nodes.has(existing.id));assert.equal(out.value.existingEditsRestored,false);assert.equal(out.value.requiresInspection,true)
})
test('cleanup skips modified nodes, foreign descendants and page change notifications',async()=>{
 for(const reason of ['modified','foreign','event']){
  const f=await cleanupFixture();const [id]=await failedCreation(f,reason),node=f.nodes.get(id)
  if(reason==='modified')node.name='human-edited'
  if(reason==='foreign')node.appendChild(f.figma.createRectangle())
  if(reason==='event')f.edit()
  const out=await f.runtime.run('rollback',{operationId:reason});assert.equal(out.value.removed.length,0);assert.ok(f.nodes.has(id));assert.equal(out.value.skipped.length,1)
 }
})
test('later normal scripts invalidate cleanup receipts; successful creation keeps no watcher',async()=>{
 const f=await cleanupFixture();await failedCreation(f,'failed');await f.runtime.run('use_figma',{code:'return 1'});await assert.rejects(f.runtime.run('rollback',{operationId:'failed'}),/unavailable|invalidated/)
 await f.runtime.run('use_figma',{code:'return figma.createFrame().id',trackCreated:true},{operationId:'success'});assert.equal(f.runtime.cleanupRecords?.has('success'),false)
})
test('verify can capture a newly returned ID; inline images are recognized as returned evidence',async()=>{
 const f=await fixtureRuntime();let out=await f.runtime.run('use_figma',{code:'return {frameId:figma.createFrame().id}',verify:{resultPath:'frameId'}});assert.equal(out.verification.nodeId,out.value.frameId);assert.equal(out.images.length,1)
 out=await f.runtime.run('use_figma',{code:'const n=figma.createFrame(); await n.screenshot(); return n.id'});assert.equal(out.verification.state,'image-returned')
})
test('editing existing nodes makes automatic ownership evidence unavailable',async()=>{
 const f=await cleanupFixture(),existing=f.figma.createFrame();f.page.appendChild(existing)
 await assert.rejects(f.runtime.run('use_figma',{code:'const n=figma.createFrame();figma.currentPage.appendChild(n);const old=await figma.getNodeByIdAsync("'+existing.id+'");old.reactions=[];throw Error("stop")',trackCreated:true},{operationId:'dependent'}),e=>e.cleanup?.available===false&&/existing/.test(e.cleanup.reason))
 assert.equal(f.runtime.cleanupRecords?.has('dependent')??false,false)
})
test('cleanup bypass is scoped to the failed operation owner and document',async t=>{
 const f=await cleanupFixture(),b=new LocalBridge({port:0,token:'test'});await b.start();t.after(()=>b.close());const id=await connect(b,'Cleanup',6)
 const failed=b.call(id,'use_figma',{code:'const n=figma.createFrame();figma.currentPage.appendChild(n);throw Error("stop")',trackCreated:true},{mutation:true,owner:'owner',operationId:'failed'})
 const rejected=assert.rejects(failed,e=>e.cleanup?.available===true);await runJob(b,id,f.runtime);await rejected
 await assert.rejects(b.call(id,'rollback',{operationId:'failed'},{mutation:true,owner:'other',recoveryOf:'failed'}),/Invalid cleanup/)
 const cleanup=b.call(id,'rollback',{operationId:'failed'},{mutation:true,owner:'owner',recoveryOf:'failed'});await runJob(b,id,f.runtime);assert.equal((await cleanup).value.removed.length,1);assert.equal(b.list()[0].needsInspection,true)
})
