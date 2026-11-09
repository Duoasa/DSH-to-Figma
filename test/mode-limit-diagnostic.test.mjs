import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {variableModeLimitDiagnostic} from '../lib/native-diagnostics.mjs'
import {applyWithDependencies} from '../index.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {fixtureRuntime,connect,runJob} from './fixtures.mjs'

const nativeMessage='in addMode: Limited to 1 modes only'
test('bundled mode preparation handles the actual native limit and never hides an unknown error',async()=>{
  const guide=await readFile(new URL('../skills/figma-workbench/references/components-variables.md',import.meta.url),'utf8')
  const code=[...guide.matchAll(/```js\n([\s\S]*?)\n```/g)].map(match=>match[1]).find(code=>code.includes("status:'mode-limit'"))
  assert.ok(code)
  const prepare=new Function('figma','return (async()=>{'+code+'})()')
  let attempts=0
  const collection={id:'theme',defaultModeId:'light',modes:[{name:'Light',modeId:'light'}],addMode(){attempts++;throw Error(nativeMessage)}}
  const figma={variables:{getVariableCollectionByIdAsync:async()=>collection}}
  const result=await prepare(figma)
  assert.equal(result.status,'mode-limit');assert.equal(result.maximumModes,1);assert.equal(result.error,nativeMessage)
  assert.equal(attempts,1);assert.deepEqual(collection.modes,[{name:'Light',modeId:'light'}])
  collection.modes.push({name:'Dark',modeId:'existing-dark'})
  assert.equal((await prepare(figma)).modeId,'existing-dark');assert.equal(attempts,1)
  collection.modes.pop();collection.addMode=()=>{throw Error('Permission denied')}
  await assert.rejects(prepare(figma),/Permission denied/)
})

test('only the exact native mode-limit error and bridge decoration receive scoped guidance',()=>{
  for(const message of [nativeMessage,nativeMessage+'; inspect the canvas before retrying [operationId=fixture-operation]']){
    const error=Object.assign(new Error(message),{safeToRetryWithoutCanvasRead:false}),diagnostic=variableModeLimitDiagnostic(error)
    assert.equal(diagnostic.code,'FIGMA_VARIABLE_MODE_LIMIT');assert.equal(diagnostic.limit,1);assert.equal(diagnostic.scope,'current-file')
    assert.equal(diagnostic.nativeError,nativeMessage);assert.equal(error.message,message);assert.equal(error.safeToRetryWithoutCanvasRead,false)
    assert.deepEqual(diagnostic.recovery.bridgeRead,{tool:'get_metadata',arguments:{},hint:'Check recovery.cleared; increase depth or read smaller affected subtrees if incomplete. Metadata does not verify variable values.'})
    assert.equal(diagnostic.recovery.collectionRead.tool,'get_variable_defs')
    assert.deepEqual(diagnostic.recovery.fallbacks.map(x=>x.kind),['existing-mode','single-mode-rebinding'])
  }
  assert.equal(variableModeLimitDiagnostic(new Error('in addMode: Limited to 12 modes only')).limit,12)
  for(const message of ['Limited to 1 modes only','Some other API: Limited to 1 modes only','Previous operation outcome is uncertain','A guide mentions '+nativeMessage,nativeMessage+' but this is a different error','in addMode: Limited to 9007199254740992 modes only'])assert.equal(variableModeLimitDiagnostic(new Error(message)),null)
})

async function setup(t){
  const home=await mkdtemp(join(tmpdir(),'dsh-mode-limit-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const definitions=new Map(),ctx={tools:{register(def){definitions.set(def.name,def);return()=>definitions.delete(def.name)}},skills:{registerProvider(){}},systemPrompt:{section(){},getSectionOrder(){return 1}},logger:{warn(){}},effect(){},on(){},get(){}}
  const f=await fixtureRuntime(),bridge=new LocalBridge({token:'a'.repeat(64),port:0})
  // Imported/existing modes are observable state, not a proof of addMode quota.
  const collection={id:'collection1',name:'Imported theme',defaultModeId:'light',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}],variableIds:['VariableID:1'],addMode(){throw Error(nativeMessage)}}
  f.figma.variables.getLocalVariableCollectionsAsync=async()=>[collection]
  const handle=await applyWithDependencies(ctx,{}, {home,bridge});t.after(()=>handle.close())
  const id=await connect(bridge,'Mode-limit fixture',5),exec={agent:{session:{id:'mode-limit-work',header:{cwd:home}}},signal:new AbortController().signal}
  return {...f,bridge,id,invoke:(tool,args={})=>definitions.get('mcp__figma__'+tool).execute(args,exec)}
}

for(const writesFirst of [false,true])test(`native mode-limit guidance preserves uncertainty ${writesFirst?'after a successful earlier write':'when addMode is the first write'}`,async t=>{
  const f=await setup(t)
  const code=`const collection=(await figma.variables.getLocalVariableCollectionsAsync())[0];${writesFirst?"const n=figma.createFrame();n.name='Created before failed mode';figma.currentPage.appendChild(n);":''}collection.addMode('Another');return {ok:true};`
  const pending=f.invoke('use_figma',{code}).then(()=>assert.fail('Expected mode-limit failure'),error=>JSON.parse(error.message))
  await runJob(f.bridge,f.id,f.runtime)
  const error=await pending
  assert.equal(error.safeToRetryWithoutCanvasRead,false)
  assert.match(error.error,/^in addMode: Limited to 1 modes only; inspect the canvas before retrying \[operationId=/)
  assert.equal(error.diagnostic.code,'FIGMA_VARIABLE_MODE_LIMIT');assert.equal(error.diagnostic.limit,1)
  assert.equal(f.bridge.list()[0].needsInspection,true)
  assert.equal(f.page.children.length,writesFirst?1:0)
  assert.match(error.diagnostic.hint,/get_metadata/)
  assert.match(error.diagnostic.hint,/get_variable_defs/)
  // Read APIs and the existing bridge reconciliation semantics remain unchanged.
  const variables=f.invoke('get_variable_defs',{collectionsOnly:true});await runJob(f.bridge,f.id,f.runtime)
  assert.equal((await variables).structuredContent.result.collections[0].modes.length,2)
  assert.equal(f.bridge.list()[0].needsInspection,true)
  const metadata=f.invoke('get_metadata',{});await runJob(f.bridge,f.id,f.runtime);await metadata
  assert.equal(f.bridge.list()[0].needsInspection,false)
  assert.equal(f.page.children.length,writesFirst?1:0)
})
