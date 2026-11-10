import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fixtureRuntime,connect,runJob,PNG} from './fixtures.mjs'
import {preflightScript} from '../lib/script-preflight.mjs'
import {ICON_NAMES} from '../lib/icon-names.mjs'
import {recoveryResponse,metadataInspection} from '../lib/recovery.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {errorDetails} from '../lib/errors.mjs'
const plain=x=>JSON.parse(JSON.stringify(x))

test('known first-use mistakes fail before any creation, with exact source locations',()=>{
 for(const [code,id,line] of [
  ['const f=figma.createFrame();\nfigma.icon("refresh");','FIGMA_UNKNOWN_ICON',2],
  ['const f=figma;\nf["icon"]("star");','FIGMA_UNKNOWN_ICON',2],
  ['const n=figma.createEllipse();\nn.strokeDashes=[2,2];','FIGMA_INVALID_PROPERTY',2],
  ['const n=await figma.getNodeByIdAsync("1:2");n["strokeDashes"]=[2,2];','FIGMA_INVALID_PROPERTY',1],
 ]) assert.throws(()=>preflightScript(code),e=>e.diagnostic.code===id&&e.diagnostic.line===line&&/No script ran/.test(e.message))
 for(const code of ['const figma={icon:n=>n};figma.icon("custom")','const data={};data.strokeDashes=[]','const n=figma.createEllipse();n.dashPattern=[2,2]','const name="search";figma.icon(name)','function icon(figma){return figma.icon("custom")}'])assert.doesNotThrow(()=>preflightScript(code))
})
test('preflight icon names are generated from the same bundled paths',async()=>{
 const source=await readFile(new URL('../companion/icons.js',import.meta.url),'utf8')
 assert.deepEqual(ICON_NAMES,Object.keys(JSON.parse(source.match(/const paths=(.*);/)[1])))
})
test('dynamic invalid property reports a repair while retaining partial-write status',async()=>{
 const f=await fixtureRuntime()
 await assert.rejects(f.runtime.run('use_figma',{code:'const n=figma.createEllipse();const k="stroke"+"Dashes";n[k]=[2,2]'}),e=>{
  assert.equal(e.safeToRetryWithoutCanvasRead,false)
  const info=errorDetails(e,{safe:false});assert.match(info.messageHuman,/dashPattern/);assert.equal(info.reconcile.args.responseMode,'recovery');return true
 })
 assert.equal(f.nodes.size,3) // root, page, partial ellipse; never claim rollback
})
async function comparisonFixture(){
 const f=await fixtureRuntime(),node=f.figma.createFrame(),child=f.figma.createFrame(),exports=[]
 node.absoluteBoundingBox={x:100,y:200,width:100,height:100};node.absoluteRenderBounds={x:90,y:180,width:130,height:140}
 child.absoluteBoundingBox={x:110,y:220,width:20,height:30};node.appendChild(child)
 node.exportAsync=async options=>{exports.push(options);const b=options.useAbsoluteBounds?node.absoluteBoundingBox:node.absoluteRenderBounds,bytes=Buffer.from(PNG);bytes.writeUInt32BE(Math.round(b.width*options.constraint.value),16);bytes.writeUInt32BE(Math.round(b.height*options.constraint.value),20);return new Uint8Array(bytes)}
 return {...f,node,child,exports}
}
test('compare defaults to subject bounds and keeps effect-inclusive coordinates explicit',async()=>{
 const f=await comparisonFixture(),args={nodeId:f.node.id,regions:[{name:'card',nodeId:f.child.id,referenceBounds:{x:10,y:20,width:20,height:30}}]}
 const subject=await f.runtime.run('compare',args)
 assert.equal(f.exports[0].useAbsoluteBounds,true);assert.equal(f.exports[0].colorProfile,'SRGB');assert.equal(subject.value.geometry.outsideEffects,'excluded')
 assert.deepEqual(plain(subject.value.regions[0].actualBounds),{x:10,y:20,width:20,height:30});assert.equal(subject.images[0].exportGeometry,undefined)
 const render=await f.runtime.run('compare',{...args,bounds:'render'})
 assert.equal(f.exports[1].useAbsoluteBounds,false);assert.deepEqual(plain(render.value.geometry.subjectOffset),{x:10,y:20})
 assert.deepEqual(plain(render.value.regions[0].actualBounds),{x:20,y:40,width:20,height:30});assert.equal(f.undo,0)
})
test('compare rejects unverified export padding and ancestor rotations; ordinary screenshots unchanged',async()=>{
 const f=await comparisonFixture();f.node.exportAsync=async()=>new Uint8Array(PNG)
 await assert.rejects(f.runtime.run('compare',{nodeId:f.node.id}),/dimensions do not match/)
 f.node.absoluteTransform=[[0,-1,100],[1,0,200]]
 await assert.rejects(f.runtime.run('compare',{nodeId:f.node.id}),/axis-aligned/)
 const g=await comparisonFixture();await g.runtime.screenshot(g.node);assert.equal(g.exports[0].useAbsoluteBounds,undefined);assert.equal(g.exports[0].colorProfile,undefined)
})
test('compact recovery preserves every node identity and completeness failures, never attributes creation',()=>{
 const tree={id:'root',type:'FRAME',name:'Main',childCount:1,fills:Array(200).fill({type:'SOLID',color:{r:1,g:0,b:0}}),children:[{id:'text',type:'TEXT',characters:'x'.repeat(500),childCount:0,textSegments:Array(100).fill({fontSize:14})}]}
 const inspection=metadataInspection({nodeId:'root',profile:'full'},tree),out=recoveryResponse(tree,inspection)
 assert.equal(inspection.complete,true);assert.deepEqual(out.nodes.map(n=>n.id),['root','text']);assert.equal(out.nodes[1].parentId,'root')
 assert.match(out.evidence.attribution,/unknown/);assert.equal(out.evidence.propertyValidation,'not-established');assert.deepEqual(out.nodes[1].shortenedFields,['characters'])
 assert.ok(JSON.stringify(out).length<JSON.stringify(tree).length/3)
 const incomplete={...tree,children:[],truncated:true,reason:'maxNodes'}
 const bad=metadataInspection({nodeId:'root'},incomplete),compact=recoveryResponse(incomplete,{...bad,needsInspection:true})
 assert.equal(compact.evidence.complete,false);assert.match(compact.nextAction,/do not write/);assert.equal(compact.nodes[0].truncated,true)
})
test('compact recovery does not weaken bridge guards for depth, summary or variable resources',async t=>{
 const f=await fixtureRuntime(),b=new LocalBridge({port:0,token:'test'});await b.start();t.after(()=>b.close());const id=await connect(b,'Recovery',6)
 const parent=f.figma.createFrame(),child=f.figma.createFrame();parent.appendChild(child)
 const fail=b.call(id,'use_figma',{code:'throw Error("partial")'},{mutation:true,owner:'w'}),rejected=assert.rejects(fail);await runJob(b,id,f.runtime);await rejected
 for(const args of [{nodeId:parent.id,depth:0,profile:'full'},{nodeId:parent.id,depth:10,profile:'summary'}]){
  const call=b.call(id,'get_metadata',{...args,responseMode:'recovery'},{owner:'w'});await runJob(b,id,f.runtime);const res=await call
  assert.equal(res.recovery.cleared,false);assert.equal(recoveryResponse(res.value,res.recovery).evidence.complete,false);assert.equal(b.list()[0].needsInspection,true)
 }
 const doc=b.documents.get(id);doc.uncertainIds.add('variable-write');b.operations.set('variable-write',{method:'create_variables',collectionId:'collection1'})
 const guarded=b.call(id,'get_metadata',{nodeId:parent.id,depth:10,responseMode:'recovery'},{owner:'w'});await runJob(b,id,f.runtime);const blocked=await guarded
 assert.equal(blocked.recovery.cleared,false);assert.equal(blocked.recovery.reason,'variable-resources-required');assert.equal(recoveryResponse(blocked.value,blocked.recovery).evidence.complete,false)
 doc.uncertainIds.delete('variable-write');b.operations.delete('variable-write')
 const call=b.call(id,'get_metadata',{nodeId:parent.id,depth:10,profile:'full',responseMode:'recovery'},{owner:'w'});await runJob(b,id,f.runtime);const res=await call
 assert.equal(res.recovery.cleared,true);assert.equal(recoveryResponse(res.value,res.recovery).nodes.length,2)
})
