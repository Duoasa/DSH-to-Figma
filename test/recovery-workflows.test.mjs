import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {IdempotencyStore} from '../lib/idempotency.mjs'
import {StepTasks} from '../lib/workflows.mjs'
import {LocalFigmaTasks} from '../lib/figma-use-contract.mjs'
import {errorDetails,bindingFailure} from '../lib/errors.mjs'
import {fixtureRuntime,connect,request} from './fixtures.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
async function home(t){const h=await mkdtemp(join(tmpdir(),'dsh-recovery-'));t.after(()=>rm(h,{recursive:true,force:true}));return h}
const out=value=>({structuredContent:{result:value},content:[{type:'text',text:JSON.stringify(value)}]})
test('automatic sessions recover stale IDs without borrowing known foreign Work state',()=>{
 const t=new LocalFigmaTasks(),d={fileKey:'file',connectionId:'a'},a=t.context('work','/one',d,{})
 assert.equal(t.context('work','/one',d,{sessionId:'expired'}).sessionId,a.sessionId)
 assert.throws(()=>t.context('other','/one',d,{sessionId:a.sessionId}),/Unknown/)
 assert.throws(()=>t.context('work','/two',d,{sessionId:a.sessionId}),/Unknown/)
 assert.throws(()=>t.context('work','/one',d,{fileKey:'different'}),/does not match/)
 t.clear();const next=t.context('work','/one',d,{sessionId:a.sessionId});assert.notEqual(next.sessionId,a.sessionId)
 assert.equal(next.task.calls,0)
})
test('idempotency survives restart, rejects payload conflicts and never replays incomplete writes',async t=>{
 const h=await home(t),s=new IdempotencyStore(h),scope=['work','workspace','file']
 const lease=await s.begin(scope,'key','use_figma',{code:'create',sessionId:'old'})
 await assert.rejects(s.begin(scope,'key','use_figma',{code:'create'}),/already running/)
 const value=out({id:'1:1'});await s.finish(lease,value)
 assert.deepEqual((await new IdempotencyStore(h).begin(scope,'key','use_figma',{code:'create',sessionId:'new'})).output,value)
 await assert.rejects(s.begin(scope,'key','use_figma',{code:'different'}),/conflict/)
 await s.begin(scope,'interrupted','use_figma',{code:'partial'})
 await assert.rejects(new IdempotencyStore(h).begin(scope,'interrupted','use_figma',{code:'partial'}),/no retained final/)
 const other=await s.begin(['other','workspace','file'],'key','use_figma',{code:'different'});await s.finish(other,out(null))
})
test('errors separate platform cause from partial writes; binding candidates require explicit selection',()=>{
 const e=Object.assign(Error('in addMode: Limited to 1 modes only'),{executionState:'partial-or-unknown',affected:{collectionId:'c'}})
 const info=errorDetails(e,{safe:false,diagnostic:{code:'FIGMA_VARIABLE_MODE_LIMIT',limit:1}})
 assert.equal(info.failureClass,'platform-limit');assert.equal(info.retryable,false);assert.equal(info.reconcile.tool,'get_variable_defs')
 const binding=bindingFailure([{connectionId:'new',fileKey:'file',name:'N',editorType:'figma'}],{workspace:'/w',fileKey:'file',editorType:'figma'},'/w')
 assert.equal(binding.candidates[0].bindingMatch,'same-file-key')
 assert.equal(errorDetails(Object.assign(Error('timeout'),{operationId:'o',executionState:'unknown'}),{safe:false}).reconcile.args.operationId,'o')
})
test('explicit step tasks resume after restart without rerunning completed steps and reject foreign scope/page',async t=>{
 const h=await home(t),scope=['work','workspace','file'],calls=[];let page='p'
 const invoke=async(name,args)=>{if(name==='get_selection')return out({page:{id:page}});calls.push([name,args]);return out({id:'created-'+calls.length})}
 const steps=[{tool:'use_figma',args:{code:'create'}},{tool:'batch_edit',args:{ops:[{nodeId:{$step:0,path:['result','id']}}]}}]
 const first=await new StepTasks(h).run(scope,{action:'start',taskKey:'task',steps},invoke)
 assert.equal(first.progress.completed,1);assert.equal(calls.length,1)
 await new StepTasks(h).run(scope,{action:'start',taskKey:'task',steps},invoke);assert.equal(calls.length,1)
 const tasks=new StepTasks(h)
 await assert.rejects(tasks.run(['foreign','workspace','file'],{action:'status',taskId:first.taskId},invoke),/another Work/)
 page='wrong';await assert.rejects(tasks.run(scope,{action:'resume',taskId:first.taskId,resumeToken:first.resumeToken},invoke),/page changed/)
 page='p';const done=await tasks.run(scope,{action:'resume',taskId:first.taskId,resumeToken:first.resumeToken},invoke)
 assert.equal(done.state,'completed');assert.equal(calls.length,2);assert.equal(calls[1][1].ops[0].nodeId,'created-1')
 await tasks.run(scope,{action:'start',taskKey:'task',steps},invoke);assert.equal(calls.length,2)
})
test('partial failure blocks automatic resume; explicit acceptance advances only that step',async t=>{
 const h=await home(t),tasks=new StepTasks(h),scope=['w','p','f'];let writes=0
 const invoke=async name=>name==='get_selection'?out({page:{id:'p'}}):(writes++,{isError:true,structuredContent:{safeToRetryWithoutCanvasRead:false,executionState:'partial-or-unknown',operationId:'failed'}})
 const failed=await tasks.run(scope,{action:'start',taskKey:'partial',steps:[{tool:'use_figma',args:{code:'partial'}}]},invoke)
 const args={taskId:failed.taskId,resumeToken:failed.resumeToken}
 await tasks.run(scope,{action:'resume',...args},invoke);assert.equal(writes,1)
 await assert.rejects(tasks.run(scope,{action:'resolve',resolution:'retry',...args},invoke),/Only a confirmed/)
 const accepted=await tasks.run(scope,{action:'resolve',resolution:'accept',resolutionResult:{id:'inspected'},...args},invoke)
 assert.equal(accepted.state,'completed');assert.equal(writes,1)
})
function variableFixture(f){
 const vars=new Map([['source',{id:'source',resolvedType:'COLOR'}]]),c={id:'c',modes:[{modeId:'light',name:'Light'}],defaultModeId:'light',variableIds:[]};let adds=0
 c.addMode=()=>{adds++;throw Error('in addMode: Limited to 1 modes only')}
 Object.assign(f.figma.variables,{getVariableCollectionByIdAsync:async()=>c,getLocalVariableCollectionsAsync:async()=>[c],getVariableByIdAsync:async id=>vars.get(id),createVariable:(name,col,type)=>{const v={id:'v'+vars.size,name,resolvedType:type,valuesByMode:{},setValueForMode(id,value){this.valuesByMode[id]=value}};vars.set(v.id,v);col.variableIds.push(v.id);return v}})
 return {vars,c,get adds(){return adds}}
}
test('variable aliases prevalidate types and observed mode limits expire and can refresh',async()=>{
 const f=await fixtureRuntime(),v=variableFixture(f)
 await assert.rejects(f.runtime.run('create_variables',{collectionId:'c',tokens:[{name:'bad',type:'FLOAT',aliasOf:'source'}]}),/type mismatch/);assert.equal(v.vars.size,1)
 const result=await f.runtime.run('create_variables',{collectionId:'c',tokens:[{name:'dark/base',type:'COLOR',aliasOf:'source'}]})
 assert.equal(v.vars.get('v1').valuesByMode.light.type,'VARIABLE_ALIAS');assert.equal(result.journal.entries[0].valueConfirmed,true)
 await assert.rejects(f.runtime.run('add_variable_modes',{collectionId:'c',names:['Dark']}),e=>e.affected.collectionId==='c'&&e.safeToRetryWithoutCanvasRead===false)
 await assert.rejects(f.runtime.run('add_variable_modes',{collectionId:'c',names:['Dark']}),e=>e.safeToRetryWithoutCanvasRead===true);assert.equal(v.adds,1)
 const defs=await f.runtime.run('get_variable_defs',{collectionsOnly:true});assert.equal(defs.value.collections[0].modesAllowed,1);assert.equal(defs.value.collections[0].canCreateVariable,'unknown')
 await assert.rejects(f.runtime.run('add_variable_modes',{collectionId:'c',names:['Dark'],forceRefresh:true}));assert.equal(v.adds,2)
 f.runtime.modeLimits.get('c').expiresAt=0;assert.equal(f.runtime.collectionCapability(v.c).modesAllowed,null)
})
test('opt-in script journal reports observed writes on failure without claiming complete coverage',async()=>{
 const f=await fixtureRuntime()
 assert.equal((await f.runtime.run('use_figma',{code:'return 1'})).journal,undefined)
 await assert.rejects(f.runtime.run('use_figma',{journal:true,code:"const n=figma.createFrame();n.name='created';throw Error('deliberate')"}),e=>{assert.equal(e.journal.complete,false);assert.ok(e.journal.entries.some(x=>x.created));assert.ok(e.journal.entries.some(x=>x.updated?.prop==='name'));return true})
})
test('retrieving one late success cannot clear an independent unresolved write',async t=>{
 const b=new LocalBridge({token:'a'.repeat(64),port:0,timeoutMs:25});await b.start();t.after(()=>b.close());const id=await connect(b,'test',5),d=b.documents.get(id)
 const p=b.call(id,'use_figma',{}, {owner:'w',mutation:true,operationId:'late'});const rejected=assert.rejects(p,/unknown/)
 await request(b,'/poll',{connectionId:id});await rejected;d.uncertainIds.add('another')
 await request(b,'/result',{connectionId:id,id:'late',ok:true,result:{value:{id:'once'},images:[]}})
 assert.equal(b.operation(id,'late','w',true).requiresCanvasInspection,true);assert.equal(d.uncertainIds.has('another'),true)
})

test('explicit task page guard rejects a script before mutation and disallows cross-page continuation',async()=>{
 const f=await fixtureRuntime(),other=f.figma.createPage()
 await assert.rejects(f.runtime.run('use_figma',{taskPageId:other.id,code:'figma.createFrame()'}),e=>e.safeToRetryWithoutCanvasRead===true)
 await assert.rejects(f.runtime.run('use_figma',{taskPageId:f.page.id,code:`await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('${other.id}'))`}),/original page/)
 assert.equal(f.figma.currentPage.id,f.page.id)
})

test('explicit allVariables returns a full scoped collection beyond default pagination',async()=>{
 const f=await fixtureRuntime();f.figma.variables.getLocalVariablesAsync=async()=>Array.from({length:70},(_,i)=>({id:'v'+i,variableCollectionId:'collection1',name:'v'+i,valuesByMode:{light:i}}))
 assert.equal((await f.runtime.run('get_variable_defs',{collectionIds:['collection1']})).value.pagination.hasMore,true)
 const all=await f.runtime.run('get_variable_defs',{collectionIds:['collection1'],allVariables:true});assert.equal(all.value.variables.length,70);assert.equal(all.value.pagination,undefined)
 await assert.rejects(f.runtime.run('get_variable_defs',{allVariables:true,limit:100}),/without pagination/)
})
