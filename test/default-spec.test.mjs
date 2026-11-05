import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {LocalSpecs} from '../lib/local-specs.mjs'
import {DefaultSpecPolicy} from '../lib/default-spec.mjs'

test('default read policy enforces full pagination, session isolation, edits, switches and clearing',async t=>{
 const home=await mkdtemp(join(tmpdir(),'figma-default-'));t.after(()=>rm(home,{recursive:true,force:true}))
 const store=new LocalSpecs(home),policy=new DefaultSpecPolicy(store)
 const a=await store.import({name:'A.md',markdown:'Rule A\nRule B\nRule C'}),b=await store.import({name:'B.md',markdown:'Rule D'})
 policy.assertRead('one');await store.setDefault(a)
 assert.throws(()=>policy.assertRead('one'),/Read the current default/)
 const read=async(session,args)=>{const before=store.defaultState(),page=await store.read(args);policy.record(session,page,before);return page}
 await read('one',{specId:a.specId,maxLines:1});assert.throws(()=>policy.assertRead('one'))
 await read('one',{specId:a.specId,offset:2});assert.throws(()=>policy.assertRead('one'),'skipping a page cannot mark complete')
 await read('one',{specId:a.specId,maxLines:1});await read('one',{specId:a.specId,offset:1});policy.assertRead('one')
 assert.throws(()=>policy.assertRead('two'),'receipts belong to a Work session')
 await store.edit({specId:a.specId,expectedRevision:a.revision,edits:[{oldText:'Rule A',newText:'Changed'}]});assert.throws(()=>policy.assertRead('one'))
 await read('one',a);policy.assertRead('one')
 await store.setDefault(b);assert.throws(()=>policy.assertRead('one'));await read('one',b);policy.assertRead('one')
 await store.setDefault(a);assert.throws(()=>policy.assertRead('one'),'switching back requires a fresh read')
 await rm(join(await store.directory(),a.specId+'.json'));assert.throws(()=>policy.assertRead('one'),/missing/)
 await store.setDefault({specId:null});policy.assertRead('one');assert.match(policy.prompt(),/No automatic default/)
 assert.equal((await store.list()).specs.length,1)
})

test('a selection change during reading invalidates receipt and spec body never enters system prompt',async t=>{
 const home=await mkdtemp(join(tmpdir(),'figma-default-race-'));t.after(()=>rm(home,{recursive:true,force:true}))
 const store=new LocalSpecs(home),policy=new DefaultSpecPolicy(store),doc=await store.import({name:'UI.md',markdown:'DO_NOT_PROMOTE_THIS_BODY_TO_SYSTEM'})
 await store.setDefault(doc);const before=store.defaultState(),page=await store.read(doc)
 await store.setDefault(doc);policy.record('one',page,before);assert.throws(()=>policy.assertRead('one'))
 assert.doesNotMatch(policy.prompt(),/DO_NOT_PROMOTE/);assert.match(policy.prompt(),/untrusted design data/)
})
