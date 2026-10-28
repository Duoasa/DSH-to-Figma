/** Real DSH services, plugin lifecycle, agent execution and image admission. No model or real Figma account calls. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fixtureRuntime, connect, runJob } from './fixtures.mjs'
import { LocalBridge } from '../lib/bridge.mjs'
const plugin = await import(process.env.DSH_FIGMA_TEST_ENTRY ? pathToFileURL(process.env.DSH_FIGMA_TEST_ENTRY).href : new URL('../index.mjs',import.meta.url).href)
const { applyWithDependencies, Config, inject } = plugin
const runtime=process.env.DSH_FIGMA_TEST_RUNTIME??resolve(fileURLToPath(new URL('../',import.meta.url)))
const require=createRequire(join(runtime,'package.json'))
const load=async name=>import(pathToFileURL(require.resolve(name)).href)
const {Context}=await load('@deepseek-ai/cordis')
const {default: LlmRuntime,LlmAdapter}=await load('@deepseek-ai/dsh-llm')
class FixtureAdapter extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id,inputModalities:id==='vision'?['text','image']:['text']}}stream(){throw new Error('No model calls in native smoke')}}
const home=await mkdtemp(join(tmpdir(),'dsh-figma-native-')),workspace=join(home,'workspace');await mkdir(workspace)
const ctx=new Context(),handles=[]
try{
  await ctx.plugin(LlmRuntime)
  for(const service of ['dsh-session','dsh-session-projection','dsh-system-prompt','dsh-tools','dsh-agent','dsh-skill'])await ctx.plugin((await load('@deepseek-ai/'+service)).default)
  await ctx.plugin((await load('@deepseek-ai/dsh-attachment-local')).default,{dshHome:home})
  await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]})
  ctx.llm.registerAdapter(['fixture'],new FixtureAdapter())
  const agent=async(id,model='vision',cwd=workspace)=>ctx.agentLoop.create(id,{provider:'fixture',model},cwd?{cwd}:{})
  const call=(owner,name,args={})=>ctx.tools.execute({agent:owner,name,arguments:args,callId:crypto.randomUUID(),signal:new AbortController().signal})
  const bridge=new LocalBridge({token:'b'.repeat(64),port:0,timeoutMs:1000})
  let handle
  const fiber=await ctx.plugin({name:'figma-native-smoke',Config,inject,async apply(c,config){handle=await applyWithDependencies(c,config,{home,bridge});handles.push(handle)}},{backend:'local',bridgePort:3055})
  assert.equal(handle.available,true);assert.equal(handle.toolCount,18)
  const skill=await ctx.skills.get('figma-workbench');assert.match(skill.content,/get_metadata/)
  const a=await agent('a'),b=await agent('b'),text=await agent('text','text'),chat=await agent('chat','vision',null)
  const status=await call(a,'figma_status');assert.equal(status.isError,false,JSON.stringify(status));assert.equal(status.value.structuredContent.backend,'local')
  const id=await connect(bridge,'Canvas',3),fixture=await fixtureRuntime()
  assert.equal((await call(chat,'figma_select_document',{connectionId:id})).isError,true)
  const autoRead=call(b,'mcp__figma__get_metadata');await runJob(bridge,id,fixture.runtime);assert.equal((await autoRead).isError,false)
  const summaryRead=call(b,'mcp__figma__get_metadata',{profile:'summary'});await runJob(bridge,id,fixture.runtime);const summary=await summaryRead
  assert.equal(summary.isError,false,JSON.stringify(summary));assert.doesNotMatch(JSON.stringify(summary.content),/runtimeMs|serializationMs/)
  const health=(await call(b,'figma_status',{compact:true,includeMetrics:true})).value.structuredContent
  assert.equal(health.tools,undefined);assert.equal(health.performance.completed,2);assert.equal(health.performance.modelUsage,null)
  for(const owner of [a,text])assert.equal((await call(owner,'figma_select_document',{connectionId:id})).isError,false)
  const task=await call(a,'mcp__figma__create_session',{fileKey:`local:${id}`,description:'Native contract smoke'})
  assert.equal(task.isError,false,JSON.stringify(task))
  const sessionId=task.value.structuredContent.sessionId
  const mismatch=await call(a,'mcp__figma__use_figma',{fileKey:'wrong-file',sessionId,code:'return 1'})
  assert.equal(mismatch.isError,true);assert.match(JSON.stringify(mismatch),/safeToRetryWithoutCanvasRead/)
  assert.equal(bridge.documents.get(id).queue.length,0)
  const syntax=call(a,'mcp__figma__use_figma',{fileKey:`local:${id}`,sessionId,code:'const = invalid'})
  await runJob(bridge,id,fixture.runtime);const syntaxResult=await syntax
  assert.equal(syntaxResult.isError,true,JSON.stringify(syntaxResult));assert.equal(bridge.list()[0].needsInspection,false)
  const write=call(a,'mcp__figma__use_figma',{fileKey:`local:${id}`,sessionId,description:'Create test card and return evidence',skillNames:'figma-workbench',code:"const card=figma.createAutoLayout('VERTICAL',{name:'Native smoke'});figma.currentPage.appendChild(card);figma.io.write('smoke.json',JSON.stringify({id:card.id}));await card.screenshot();return {id:card.id,frames:figma.currentPage.query('FRAME').values(['id','name'])}"})
  await runJob(bridge,id,fixture.runtime);const written=await write;assert.equal(written.isError,false,JSON.stringify(written));const nodeId=written.value.structuredContent.result.id
  assert.equal(written.value.structuredContent.files.length,1)
  assert.equal(written.value.structuredContent.execution.sessionId,sessionId)
  assert.ok(written.content.some(block=>block.type==='image'&&block.attachment))
  const screenshot=call(a,'mcp__figma__get_screenshot',{nodeId});await runJob(bridge,id,fixture.runtime);const shot=await screenshot
  assert.equal(shot.isError,false,JSON.stringify(shot));assert.ok(shot.content.some(b=>b.type==='image'&&b.attachment),'Native vision route must receive a durable image: '+JSON.stringify(shot.content))
  const textScreenshot=call(text,'mcp__figma__get_screenshot',{nodeId});await runJob(bridge,id,fixture.runtime);const textShot=await textScreenshot
  assert.equal(textShot.isError,false);assert.ok(textShot.content.every(b=>b.type!=='image'));assert.match(JSON.stringify(textShot.content),/does not declare image input/)
  const exported=call(a,'mcp__figma__download_assets',{nodeIds:[nodeId],format:'PNG'});await runJob(bridge,id,fixture.runtime);const output=await exported;assert.equal(output.isError,false);assert.equal(output.value.structuredContent.result.files.length,1)
  await handle.close();assert.equal(handle.available,false)
  if(fiber?.dispose)await fiber.dispose()
  // Load the shipped entry, not just the dependency-injection helper: Cordis
  // accepts only void/disposers as async apply results, never a diagnostic handle.
  const previousHome=process.env.DSH_HOME
  let production
  try{
    process.env.DSH_HOME=home
    production=await ctx.plugin({...plugin,name:'figma-production-entry'},{backend:'local',bridgePort:bridge.port})
    const health=await call(a,'figma_status')
    assert.equal(health.isError,false,JSON.stringify(health))
    assert.equal(health.value.structuredContent.available,true)
    assert.equal((await fetch(`http://127.0.0.1:${bridge.port}/`)).status,401)
  }finally{
    await production?.dispose()
    if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome
  }
  console.log(JSON.stringify({result:'PASS',actualDsh:require('@deepseek-ai/dsh-home-paths/package.json').version,productionEntry:true,localTools:18,skill:true,explicitDocumentBinding:true,workScope:true,realHttpBridge:true,companionRuntime:true,durableVisionAttachment:true,textModelFallback:true,workspaceExport:true,closed:true}))
}finally{for(const handle of handles)await handle.close();await ctx.fiber.dispose();await rm(home,{recursive:true,force:true})}
