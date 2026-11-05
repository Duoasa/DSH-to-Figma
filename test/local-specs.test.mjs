import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {LocalSpecs,MAX_SPEC_BYTES} from '../lib/local-specs.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {connect} from './fixtures.mjs'
const setup=async t=>{const home=await mkdtemp(join(tmpdir(),'figma-specs-'));t.after(()=>rm(home,{recursive:true,force:true}));return new LocalSpecs(home)}
test('local Markdown import persists, reads with pagination, exact edits and exports the latest copy',async t=>{
 const store=await setup(t),markdown='# UI 设计规范\n\n按钮圆角 12 px。\n\n保留间距 8 px。'
 const doc=await store.import({name:'UI规范.md',markdown:'\uFEFF'+markdown})
 assert.equal(doc.source,'local-markdown-copy');assert.equal(doc.originalFileUpdated,false)
 const first=await store.read({specId:doc.specId,maxLines:2});assert.equal(first.hasMore,true);assert.equal(first.nextOffset,2)
 const edited=await store.edit({specId:doc.specId,expectedRevision:first.revision,edits:[{oldText:'按钮圆角 12 px。',newText:'按钮圆角 16 px。'}]})
 assert.notEqual(edited.revision,first.revision)
 const reopened=new LocalSpecs(store.home),out=await reopened.export({specId:doc.specId})
 assert.equal(out.markdown,markdown.replace('12 px','16 px'));assert.equal(out.revision,edited.revision)
 assert.equal((await reopened.list()).specs.length,1)
})
test('spec edits reject ambiguity, missing text, stale revisions and partial edits atomically',async t=>{
 const store=await setup(t),doc=await store.import({name:'ui.md',markdown:'# UI\n规则 A\n规则 B'})
 for(const edits of [[{oldText:'规则',newText:'新'}],[{oldText:'absent',newText:'new'}],[{oldText:'规则 A',newText:'改 A'},{oldText:'missing',newText:'new'}]]){
  await assert.rejects(store.edit({specId:doc.specId,expectedRevision:doc.revision,edits}),/exactly once/)
  assert.equal((await store.export(doc)).revision,doc.revision)
 }
 const results=await Promise.allSettled(['X','Y'].map(newText=>store.edit({specId:doc.specId,expectedRevision:doc.revision,edits:[{oldText:'规则 A',newText}]})))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/changed/)
})
test('spec storage rejects binary, unsafe names, traversal, oversized text and symlink reads',async t=>{
 const store=await setup(t)
 for(const input of [{name:'../ui.md',markdown:'ok'},{name:'ui.exe',markdown:'ok'},{name:'ui.md',markdown:'\0bad'},{name:'ui.md',markdown:'x'.repeat(MAX_SPEC_BYTES+1)},{name:'ui.md',markdown:'\uD800'}])await assert.rejects(store.import(input))
 await assert.rejects(store.read({specId:'../../bridge-token'}),/Invalid specId/)
 const doc=await store.import({name:'ui.md',markdown:'ok'}),path=join(await store.directory(),doc.specId+'.json')
 const original=await readFile(path);await rm(path);await symlink(join(store.home,'secret'),path)
 await assert.rejects(store.export(doc),/Invalid spec storage/)
 assert.ok(original.length)
})
test('long Markdown lines never silently truncate; bounded pages expose continuation',async t=>{
 const store=await setup(t),doc=await store.import({name:'ui.md',markdown:'中'.repeat(30000)})
 await assert.rejects(store.read(doc),/line exceeds/)
 const many=await store.import({name:'lines.md',markdown:Array.from({length:200},()=> '中'.repeat(500)).join('\n')})
 const page=await store.read({...many,maxLines:200});assert.equal(page.hasMore,true);assert.ok(Buffer.byteLength(page.markdown)<65536)
})
test('bridge import/export is authenticated and requires a live document; no arbitrary filesystem routes',async t=>{
 const store=await setup(t),bridge=new LocalBridge({token:'a'.repeat(64),port:0,localSpecs:store});await bridge.start();t.after(()=>bridge.close())
 const connectionId=await connect(bridge,'UI specs',4),post=(path,data,auth=true)=>fetch(`http://127.0.0.1:${bridge.port}${path}`,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+bridge.token}:{})},body:JSON.stringify(data)})
 assert.equal((await post('/specs/import',{connectionId,name:'ui.md',markdown:'# UI'},false)).status,401)
 assert.equal((await post('/specs/import',{connectionId:'wrong',name:'ui.md',markdown:'# UI'})).status,404)
 const imported=await (await post('/specs/import',{connectionId,name:'ui.md',markdown:'# UI'})).json()
 assert.equal((await (await post('/specs/export',{connectionId,specId:imported.specId})).json()).markdown,'# UI')
 assert.equal((await post('/specs/edit',{connectionId})).status,404)
 assert.equal((await post('/specs/import',{connectionId,name:'../escape.md',markdown:'# UI'})).status,400)
})

test('default selection persists, switches, follows edits, detects missing copies and clears independently',async t=>{
 const store=await setup(t),a=await store.import({name:'A.md',markdown:'Radius 12'}),b=await store.import({name:'B.md',markdown:'Radius 8'})
 assert.equal(store.defaultState().state,'none')
 await store.setDefault({specId:a.specId});const first=store.defaultState()
 assert.equal(new LocalSpecs(store.home).defaultState().spec.specId,a.specId)
 await store.edit({specId:a.specId,expectedRevision:a.revision,edits:[{oldText:'12',newText:'16'}]})
 assert.notEqual(store.defaultState().spec.revision,first.spec.revision)
 await assert.rejects(store.setDefault({specId:'invalid'}));assert.equal(store.defaultState().spec.specId,a.specId)
 await store.setDefault({specId:b.specId});assert.equal(store.defaultState().spec.specId,b.specId)
 assert.notEqual(store.defaultState().selectionRevision,first.selectionRevision)
 await rm(join(await store.directory(),b.specId+'.json'))
 assert.equal(store.defaultState().state,'missing')
 await store.setDefault({specId:null});assert.equal(new LocalSpecs(store.home).defaultState().state,'none')
 assert.equal((await store.list()).specs.length,1)
})

test('default settings reject symlinks and malformed persisted state without silently applying old rules',async t=>{
 const store=await setup(t),a=await store.import({name:'A.md',markdown:'Rule'})
 await store.setDefault({specId:a.specId});const path=join(store.home,'figma','specs-default.json')
 await rm(path);await symlink(join(await store.directory(),a.specId+'.json'),path)
 assert.equal(store.defaultState().state,'unavailable')
 await store.setDefault({specId:null});assert.equal(store.defaultState().state,'none')
 assert.equal((await store.export(a)).markdown,'Rule')
})

test('default bridge mutations require authentication and connection, and null clears only the selection',async t=>{
 const store=await setup(t),bridge=new LocalBridge({token:'a'.repeat(64),port:0,localSpecs:store});await bridge.start();t.after(()=>bridge.close())
 const connectionId=await connect(bridge,'Defaults',4),doc=await store.import({name:'A.md',markdown:'Rule'})
 const post=(data,auth=true)=>fetch(`http://127.0.0.1:${bridge.port}/specs/set-default`,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+bridge.token}:{})},body:JSON.stringify(data)})
 assert.equal((await post({connectionId,specId:doc.specId},false)).status,401)
 assert.equal((await post({connectionId:'bad',specId:doc.specId})).status,404)
 assert.equal((await post({connectionId,specId:doc.specId})).status,200)
 assert.equal((await store.list()).defaultSpec.spec.specId,doc.specId)
 assert.equal((await post({connectionId,specId:null})).status,200)
 assert.equal(store.defaultState().state,'none');assert.equal((await store.list()).specs.length,1)
})

test('one corrupt copy does not block healthy specs, new imports or default recovery',async t=>{
 const {writeFile}=await import('node:fs/promises')
 const store=await setup(t),good=await store.import({name:'Good.md',markdown:'Radius 12'}),bad=await store.import({name:'Broken.md',markdown:'Radius 8'})
 await store.setDefault({specId:bad.specId})
 const path=join(await store.directory(),bad.specId+'.json')
 await writeFile(path,'{broken')
 const list=await store.list()
 assert.deepEqual(list.specs.map(s=>s.specId),[good.specId])
 assert.equal(list.defaultSpec.state,'unavailable')
 assert.equal(list.unreadableSpecs.length,1);assert.equal(list.unreadableSpecs[0].specId,bad.specId)
 await store.import({name:'New.md',markdown:'Spacing 8'})
 await store.setDefault({specId:good.specId});assert.equal(store.defaultState().state,'active')
 await store.setDefault({specId:null});assert.equal(store.defaultState().state,'none')
 assert.equal(await readFile(path,'utf8'),'{broken','unreadable copies are preserved for recovery')
})

test('malformed metadata is rejected consistently and invalid copies still count toward the storage limit',async t=>{
 const {writeFile}=await import('node:fs/promises'),{randomUUID}=await import('node:crypto')
 const store=await setup(t),doc=await store.import({name:'Valid.md',markdown:'Rule'})
 await store.setDefault({specId:doc.specId})
 const directory=await store.directory(),path=join(directory,doc.specId+'.json'),original=JSON.parse(await readFile(path,'utf8'))
 for(const patch of [{updatedAt:null},{updatedAt:'not a date'},{name:'../bad.md'}]){
  await writeFile(path,JSON.stringify({...original,...patch}))
  await assert.rejects(store.export(doc),/metadata/)
  assert.equal(store.defaultState().state,'unavailable')
  assert.equal((await store.list()).unreadableSpecs.length,1)
 }
 for(let i=1;i<100;i++)await writeFile(join(directory,randomUUID()+'.json'),'{broken')
 await assert.rejects(store.import({name:'Overflow.md',markdown:'Rule'}),/limit/)
})
