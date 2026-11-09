import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {designSync} from '../lib/design-sync.mjs'
const snapshot=(text='old')=>({node:{id:'1:1',type:'FRAME',children:[{id:'1:2',type:'TEXT',characters:text}],childCount:1},complete:true})
async function workspace(t){const root=await mkdtemp(join(tmpdir(),'dsh-diff-'));t.after(()=>rm(root,{recursive:true,force:true}));return root}
const args=(workspace,more={})=>({workspace,fileKey:'file-a',nodeId:'1:1',snapshot:snapshot(),...more})
test('design diff requires explicit baseline creation and optimistic update',async t=>{
 const w=await workspace(t)
 assert.equal((await designSync(args(w))).status,'baseline-missing')
 const first=await designSync(args(w,{action:'create'}));assert.equal(first.status,'baseline-created')
 await assert.rejects(designSync(args(w,{action:'create'})),/already exists/)
 assert.equal((await designSync(args(w))).status,'no-changes')
 const changed=await designSync(args(w,{snapshot:snapshot('new')}));assert.equal(changed.changes.changed[0].changes[0].property,'properties.characters')
 assert.equal(changed.changes.changed[0].changes[0].after,'new')
 await assert.rejects(designSync(args(w,{action:'update',snapshot:snapshot('new')})),/revision/)
 await designSync(args(w,{action:'update',snapshot:snapshot('new'),expectedRevision:first.revision}))
 await assert.rejects(designSync(args(w,{action:'update',expectedRevision:first.revision})),/revision/)
 assert.equal((await designSync(args(w,{fileKey:'file-b'}))).status,'baseline-missing')
})
test('design diff rejects incomplete snapshots and preserves existing baselines',async t=>{
 const w=await workspace(t),first=await designSync(args(w,{action:'create'}))
 for(const extra of [{truncated:true},{complete:false},{sectionPlan:{sections:[]}},{omittedFields:['fills']},{pagination:{hasMore:true}},{fieldErrors:{fills:'read failed'}},{coverage:{complete:false}}]){
  await assert.rejects(designSync(args(w,{action:'update',expectedRevision:first.revision,snapshot:{...snapshot(),...extra}})),/incomplete/)
 }
 await assert.rejects(designSync(args(w,{snapshot:{node:{id:'1:1',childCount:2,children:[]},coverage:{complete:true}}})),/omitted children/)
 await assert.rejects(designSync(args(w,{snapshot:{node:{id:'1:1'}}})),/explicitly attest complete/)
 await assert.rejects(designSync(args(w,{snapshot:{node:{id:'1:1',dedupedChildren:{sourceNodeId:'2:1'}},coverage:{complete:true}}})),/incomplete/)
 assert.equal(JSON.parse(await readFile(first.path)).revision,first.revision)
})
test('design diff validates provenance and format and reports moved/added/removed nodes',async t=>{
 const w=await workspace(t),first=await designSync(args(w,{action:'create'}))
 const next={node:{id:'1:1',type:'FRAME',childCount:1,children:[{id:'1:3',type:'RECTANGLE'}]},coverage:{complete:true}}
 const d=await designSync(args(w,{snapshot:next}));assert.equal(d.changes.added[0].id,'1:3');assert.equal(d.changes.removed[0].id,'1:2')
 const saved=JSON.parse(await readFile(first.path));saved.formatVersion=999;await writeFile(first.path,JSON.stringify(saved))
 await assert.rejects(designSync(args(w)),/format mismatch/)
 await assert.rejects(designSync(args(w,{snapshot:{node:{id:'wrong'},complete:true}})),/root does not match/)
 await assert.rejects(designSync(args(w,{snapshot:{...snapshot(),fileKey:'wrong-file'}})),/file identity/)
})
test('semantic shared tables are diffed and prototype-like node IDs are rejected',async t=>{
 const w=await workspace(t),original={...snapshot(),sharedStyles:{s1:{fill:'#fff'}}}
 await designSync(args(w,{action:'create',snapshot:original}))
 const difference=await designSync(args(w,{snapshot:{...original,sharedStyles:{s1:{fill:'#000'}}}}))
 assert.equal(difference.changes.sharedChanges[0].property,'sharedStyles.s1.fill')
 const invalid={node:{id:'1:1',children:[{id:'__proto__'}]},complete:true}
 await assert.rejects(designSync(args(w,{snapshot:invalid})),/stable IDs/)
 assert.equal({}.parentId,undefined)
})
test('baseline captures reject collection-policy changes instead of reporting design differences',async t=>{
 const w=await workspace(t)
 const semantic={...snapshot(),contextVersion:1,source:'local-plugin-api',coverage:{complete:true,scope:'semantic-field-projection-v1'}}
 const captureOptions={semantic:true,dedupeStyles:true,dedupeComponents:false,includeCss:false,depth:10,maxBytes:65536}
 const first=await designSync(args(w,{snapshot:semantic,captureOptions,action:'create'}))
 const saved=JSON.parse(await readFile(first.path))
 assert.equal(saved.capturePolicy.dedupeStyles,true)
 for(const option of [{includeCss:true},{dedupeStyles:false},{dedupeComponents:true},{semantic:false}]){
  const nextOptions={...captureOptions,...option}
  await assert.rejects(designSync(args(w,{snapshot:semantic,captureOptions:nextOptions})),/capture policy is incompatible/)
  await assert.rejects(designSync(args(w,{snapshot:semantic,captureOptions:nextOptions,action:'update',expectedRevision:first.revision})),/capture policy is incompatible/)
 }
 for(const changed of [{...semantic,contextVersion:2},{...semantic,source:'another-source'},{...semantic,coverage:{complete:true,scope:'semantic-field-projection-v2'}}]){
  await assert.rejects(designSync(args(w,{snapshot:changed,captureOptions})),/capture policy is incompatible/)
 }
 const same=await designSync(args(w,{snapshot:semantic,captureOptions:{...captureOptions,depth:20,maxBytes:131072,maxNodes:1500}}))
 assert.equal(same.status,'no-changes')
 assert.deepEqual(JSON.parse(await readFile(first.path)),saved)
})
test('design snapshots reject symlinked store and baseline files',async t=>{
 const w=await workspace(t),outside=await workspace(t);await symlink(outside,join(w,'.figma'))
 await assert.rejects(designSync(args(w,{action:'create'})),/real workspace directory/)
 const v=await workspace(t),saved=await designSync(args(v,{action:'create'}));await rm(saved.path);await writeFile(join(outside,'x'),'{}');await symlink(join(outside,'x'),saved.path)
 await assert.rejects(designSync(args(v)),/Invalid or oversized/)
})
