import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,readdir,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {scanProject,matchProjectAssets,projectMappings} from '../lib/project-index.mjs'
async function workspace(t){const root=await mkdtemp(join(tmpdir(),'dsh-index-'));t.after(()=>rm(root,{recursive:true,force:true}));return root}
test('bounded project index exposes evidence without source or secrets',async t=>{
 const w=await workspace(t);await mkdir(join(w,'src'));await mkdir(join(w,'node_modules'))
 await writeFile(join(w,'src','Button.tsx'),'export function Button(){return <button/>} const apiKey="do-not-return";')
 await writeFile(join(w,'src','Badge.vue'),'<template>Badge</template>')
 await writeFile(join(w,'src','tokens.css'),':root { --brand: #ff0000; --space: 8px; --password: supersecret; --api-key: 123456789; --background: url(https://private.example/x); }')
 await writeFile(join(w,'.env'),'SECRET=never');await writeFile(join(w,'node_modules','Ignored.ts'),'export const Ignored=1')
 await writeFile(join(w,'src','arrow.svg'),'<svg/>')
 const i=await scanProject(w);assert.deepEqual(i.components.map(x=>x.name).sort(),['Badge','Button']);assert.equal(i.icons.length,1);assert.equal(i.tokens.length,2)
 assert.equal(i.coverage.complete,true);assert.ok(!JSON.stringify(i).includes('do-not-return'));assert.ok(!JSON.stringify(i).includes('supersecret'));assert.ok(!JSON.stringify(i).includes('123456789'))
 const limited=await scanProject(w,{maxFiles:1});assert.equal(limited.coverage.complete,false)
})
test('project scan skips symlinks and reports ambiguous name/value candidates',async t=>{
 const w=await workspace(t),out=await workspace(t)
 await writeFile(join(out,'External.ts'),'export function External(){}');await symlink(out,join(w,'external'))
 await writeFile(join(w,'Button.ts'),'export function Button(){}');await writeFile(join(w,'Other.ts'),'export function Button(){}')
 const i=await scanProject(w),m=matchProjectAssets(i,{components:[{id:'1:1',name:'Button'}]})
 assert.equal(i.components.length,2);assert.equal(m.components[0].ambiguous,true);assert.equal(m.components[0].verified,false)
 assert.equal(m.components[0].candidates[0].score,0.8)
 assert.throws(()=>matchProjectAssets(i,{components:[{name:'--'}]}),/meaningful name/)
})
test('explicit mapping identity takes precedence and stale bindings remain explicit',async t=>{
 const w=await workspace(t)
 await writeFile(join(w,'Button.ts'),'export function Button(){}')
 await writeFile(join(w,'Other.ts'),'export function Button(){}')
 await writeFile(join(w,'Custom.ts'),'export function BrandControl(){}')
 await projectMappings(w,{action:'set',kind:'component',figmaKey:'figma-button',sourcePath:'Custom.ts',exportName:'BrandControl'})
 const index=await scanProject(w),{mappings}=await projectMappings(w)
 const query={components:[{id:'figma-button',name:'Button'},{name:'Button'}],icons:[{id:'figma-button',name:'Button'}],mappings}
 const result=matchProjectAssets(index,query)
 assert.equal(result.components[0].status,'mapped')
 assert.equal(result.components[0].basis,'explicit-user-mapping')
 assert.equal(result.components[0].mapping.sourcePath,'Custom.ts')
 assert.equal(result.components[0].mapping.exportName,'BrandControl')
 assert.equal(result.components[0].ambiguous,false)
 assert.equal(result.components[0].verified,false)
 assert.ok(result.components[0].candidates.every(c=>c.score<1))
 assert.equal(result.components[1].status,'candidates')
 assert.equal(result.components[1].ambiguous,true)
 assert.equal(result.icons[0].status,'unmapped')
 await rm(join(w,'Custom.ts'))
 const stale=matchProjectAssets(index,{...query,mappings:(await projectMappings(w)).mappings})
 assert.equal(stale.components[0].status,'stale-mapping')
 assert.equal(stale.components[0].mapping.stale,true)
 assert.equal(stale.components[0].ambiguous,true)
 assert.equal(stale.components[0].basis,'heuristic')
 assert.throws(()=>matchProjectAssets(index,{...query,mappings:[{...mappings[0],sourcePath:'Other.ts'}]}),/Invalid mapping record/)
})
test('mapping inventories detect changed record content and reject symlinked stores',async t=>{
 const w=await workspace(t);await writeFile(join(w,'Button.ts'),'export function Button(){}')
 await projectMappings(w,{action:'set',kind:'component',figmaKey:'button-key',sourcePath:'Button.ts'})
 const dir=join(w,'.figma','mappings'),file=join(dir,(await readdir(dir))[0]),record=JSON.parse(await readFile(file))
 record.sourcePath='Other.ts';await writeFile(file,JSON.stringify(record))
 await assert.rejects(projectMappings(w),/Invalid mapping/)
 const second=await workspace(t),outside=await workspace(t);await symlink(outside,join(second,'.figma'))
 await assert.rejects(projectMappings(second),/real workspace directory/)
})
test('explicit mappings validate source, revisions, confinement and stale entries',async t=>{
 const w=await workspace(t),out=await workspace(t);await writeFile(join(w,'Button.ts'),'export function Button(){}');await writeFile(join(out,'x.ts'),'x')
 const created=await projectMappings(w,{action:'set',kind:'component',figmaKey:'published-key',sourcePath:'Button.ts',exportName:'Button'})
 await assert.rejects(projectMappings(w,{action:'set',kind:'component',figmaKey:'published-key',sourcePath:'Button.ts'}),/revision/)
 await assert.rejects(projectMappings(w,{action:'set',kind:'icon',figmaKey:'x',sourcePath:'../x.svg'}),/workspace-relative/)
 await symlink(join(out,'x.ts'),join(w,'Link.ts'))
 await assert.rejects(projectMappings(w,{action:'set',kind:'component',figmaKey:'x',sourcePath:'Link.ts'}),/symlink/)
 await rm(join(w,'Button.ts'));const list=await projectMappings(w);assert.equal(list.mappings[0].stale,true)
 await projectMappings(w,{action:'remove',kind:'component',figmaKey:'published-key',expectedRevision:created.revision});assert.equal((await projectMappings(w)).mappings.length,0)
})
test('bulk mapping preflight prevents the first write when a later item is invalid',async t=>{
 const w=await workspace(t);await writeFile(join(w,'Button.ts'),'export function Button(){}')
 const first={kind:'component',figmaKey:'first',sourcePath:'Button.ts',exportName:'Button'}
 for(const bad of [{kind:'unknown',figmaKey:'second',sourcePath:'Button.ts'},{kind:'component',figmaKey:'second',sourcePath:'../Button.ts'},{kind:'component',figmaKey:'second',sourcePath:'Button.ts',exportName:'invalid name'}]){
  await assert.rejects(projectMappings(w,{action:'set_many',mappings:[first,bad]}))
  assert.equal((await projectMappings(w)).mappings.length,0)
 }
 await assert.rejects(projectMappings(w,{action:'set_many',mappings:[first,{...first}]}),/Duplicate mapping identity/)
 assert.equal((await projectMappings(w)).mappings.length,0)
 await assert.rejects(projectMappings(w,{action:'set_many',mappings:Array.from({length:51},(_,i)=>({...first,figmaKey:String(i)}))}),/1–50/)
 assert.equal((await projectMappings(w)).mappings.length,0)
})
test('bulk mappings check all revisions before writing and preserve explicit identities',async t=>{
 const w=await workspace(t);await writeFile(join(w,'Button.ts'),'export function Button(){}')
 const existing=await projectMappings(w,{action:'set',kind:'component',figmaKey:'existing',sourcePath:'Button.ts',exportName:'Button'})
 const mappings=[{kind:'component',figmaKey:'new',sourcePath:'Button.ts'},{kind:'component',figmaKey:'existing',sourcePath:'Button.ts',exportName:'Changed'}]
 await assert.rejects(projectMappings(w,{action:'set_many',mappings}),/revision/)
 let rows=(await projectMappings(w)).mappings
 assert.equal(rows.length,1);assert.equal(rows[0].revision,existing.revision)
 const result=await projectMappings(w,{action:'set_many',mappings:[mappings[0],{...mappings[1],expectedRevision:existing.revision}]})
 assert.equal(result.ok,true);assert.equal(result.atomic,false);assert.deepEqual(result.applied.map(row=>row.figmaKey),['new','existing'])
 rows=(await projectMappings(w)).mappings
 assert.equal(rows.length,2);assert.equal(rows.find(row=>row.figmaKey==='existing').exportName,'Changed')
 assert.ok(rows.every(row=>row.evidence==='explicit-user-mapping'))
})
test('bulk mappings report partial completion on a runtime file-lock conflict without undoing',async t=>{
 const w=await workspace(t);await writeFile(join(w,'Button.ts'),'export function Button(){}')
 await mkdir(join(w,'.figma','mappings'),{recursive:true})
 const name=createHash('sha256').update('component\0second').digest('hex')+'.json.lock'
 await writeFile(join(w,'.figma','mappings',name),'external writer')
 const result=await projectMappings(w,{action:'set_many',mappings:['first','second','third'].map(figmaKey=>({kind:'component',figmaKey,sourcePath:'Button.ts'}))})
 assert.equal(result.ok,false);assert.equal(result.atomic,false);assert.equal(result.requiresReview,true)
 assert.deepEqual(result.applied.map(row=>row.figmaKey),['first']);assert.equal(result.failed.figmaKey,'second')
 assert.match(result.failed.error,/being modified/);assert.equal(result.failed.writeOutcome,'unconfirmed');assert.deepEqual(result.notAttempted.map(row=>row.figmaKey),['third'])
 assert.deepEqual((await projectMappings(w)).mappings.map(row=>row.figmaKey),['first'])
 assert.equal(await readFile(join(w,'.figma','mappings',name),'utf8'),'external writer')
})
test('single and bulk mapping writes honor the same workspace lock',async t=>{
 const w=await workspace(t);await writeFile(join(w,'Button.ts'),'export function Button(){}')
 const saved=await projectMappings(w,{action:'set',kind:'component',figmaKey:'button',sourcePath:'Button.ts'})
 const lock=join(w,'.figma','mappings','.mapping-write.lock');await writeFile(lock,'another operation')
 for(const args of [{action:'set',kind:'component',figmaKey:'other',sourcePath:'Button.ts'},{action:'remove',kind:'component',figmaKey:'button',expectedRevision:saved.revision}]){
  await assert.rejects(projectMappings(w,args),/Workspace mappings are being modified/)
 }
 const busy=await projectMappings(w,{action:'set_many',mappings:[{kind:'component',figmaKey:'other',sourcePath:'Button.ts'}]})
 assert.equal(busy.ok,false);assert.deepEqual(busy.applied,[]);assert.equal(busy.failed.writeOutcome,'not-started')
 assert.equal(await readFile(lock,'utf8'),'another operation');assert.equal((await projectMappings(w)).mappings.length,1)
})
