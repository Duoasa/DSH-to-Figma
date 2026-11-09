import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {recipes} from '../lib/recipes.mjs'
async function workspace(t){const root=await mkdtemp(join(tmpdir(),'dsh-recipes-'));t.after(()=>rm(root,{recursive:true,force:true}));return root}
test('recipes are inert, syntax checked, and overwrite/remove require revisions',async t=>{
 const w=await workspace(t);assert.equal((await recipes(w)).recipes.length,0)
 const code='globalThis.SHOULD_NEVER_RUN = true; return await figma.getNodeByIdAsync("1:1");'
 const first=await recipes(w,{action:'save',name:'inspect-node',code,description:'Inspect'});assert.equal(globalThis.SHOULD_NEVER_RUN,undefined)
 const read=await recipes(w,{action:'read',name:'inspect-node'});assert.equal(read.code,code)
 await assert.rejects(recipes(w,{action:'save',name:'inspect-node',code:'return 2;'}),/revision/)
 const second=await recipes(w,{action:'save',name:'inspect-node',code:'return 2;',expectedRevision:first.revision})
 await assert.rejects(recipes(w,{action:'remove',name:'inspect-node',expectedRevision:first.revision}),/revision/)
 await recipes(w,{action:'remove',name:'inspect-node',expectedRevision:second.revision});assert.equal((await recipes(w)).recipes.length,0)
})
test('recipe storage rejects invalid names/syntax and symlink escapes',async t=>{
 const w=await workspace(t)
 await assert.rejects(recipes(w,{action:'save',name:'../bad',code:'return 1;'}),/Recipe name/)
 await assert.rejects(recipes(w,{action:'save',name:'bad',code:'const = ;'}),/syntax/)
 const other=await workspace(t),out=await workspace(t);await symlink(out,join(other,'.figma'))
 await assert.rejects(recipes(other,{action:'save',name:'test',code:'return 1;'}),/real workspace directory/)
})
