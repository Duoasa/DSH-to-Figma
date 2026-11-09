import {LOCAL_TOOLS} from '../lib/catalog.mjs'
/** Real DSH services, plugin lifecycle, agent execution and image admission. No model or real Figma account calls. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fixtureRuntime, connect, runJob, request } from './fixtures.mjs'
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
  const batchTools=typeof ctx.tools.setExecutor==='function'
  if(batchTools)await ctx.plugin(await load('@deepseek-ai/dsh-tool-executor-native'))
  ctx.llm.registerAdapter(['fixture'],new FixtureAdapter())
  const agent=async(id,model='vision',cwd=workspace)=>ctx.agentLoop.create(id,{provider:'fixture',model},cwd?{cwd}:{})
  const call=async(owner,name,args={})=>{const signal=new AbortController().signal;return batchTools?(await ctx.tools.execute({agent:owner,calls:[{type:'tool-call',id:crypto.randomUUID(),name,arguments:JSON.stringify(args)}],signal})).results[0].result:ctx.tools.execute({agent:owner,name,arguments:args,callId:crypto.randomUUID(),signal})}
  const bridge=new LocalBridge({token:'b'.repeat(64),port:0,timeoutMs:1000})
  let handle
  const fiber=await ctx.plugin({name:'figma-native-smoke',Config,inject,async apply(c,config){handle=await applyWithDependencies(c,config,{home,bridge});handles.push(handle)}},{backend:'local',bridgePort:3055})
  assert.equal(handle.available,true);assert.equal(handle.toolCount,LOCAL_TOOLS.length)
  const skill=await ctx.skills.get('figma-workbench');assert.match(skill.content,/get_metadata/)
  const a=await agent('a'),b=await agent('b'),text=await agent('text','text'),chat=await agent('chat','vision',null)
  for(const topic of ['user-guide','help-design']){
    const help=await call(chat,'figma_read_guide',{topic})
    assert.equal(help.isError,false,JSON.stringify(help))
    assert.match(help.value.content[0].text,/^# /)
  }
  const helpPrompt=(await ctx.systemPrompt.assemble()).sections.find(section=>section.name==='mcp:figma')?.text
  assert.match(helpPrompt,/read figma_read_guide topic user-guide first/)
  assert.match(skill.content,/## User help/)
  assert.equal(bridge.list().length,0,'help works before a canvas is connected')
  const status=await call(a,'figma_status');assert.equal(status.isError,false,JSON.stringify(status));assert.equal(status.value.structuredContent.backend,'local')
  assert.equal(status.value.structuredContent.localSpecs,undefined)
  assert.equal((await ctx.systemPrompt.assemble()).sections.some(s=>s.name==='mcp:figma-default-spec'),false)
  const id=await connect(bridge,'Canvas',5),fixture=await fixtureRuntime()
  assert.equal((await call(chat,'figma_select_document',{connectionId:id})).isError,true)
  const allowedWrite=call(b,'mcp__figma__use_figma',{code:'return 1'});await runJob(bridge,id,fixture.runtime);assert.equal((await allowedWrite).isError,false)
  const autoRead=call(b,'mcp__figma__get_metadata');await runJob(bridge,id,fixture.runtime);assert.equal((await autoRead).isError,false)
  const summaryRead=call(b,'mcp__figma__get_metadata',{profile:'summary'});await runJob(bridge,id,fixture.runtime);const summary=await summaryRead
  assert.equal(summary.isError,false,JSON.stringify(summary));assert.doesNotMatch(JSON.stringify(summary.content),/runtimeMs|serializationMs/)
  const health=(await call(b,'figma_status',{compact:true,includeMetrics:true})).value.structuredContent
  assert.equal(health.tools,undefined);assert.equal(health.performance.completed,3);assert.equal(health.performance.modelUsage,null)
  for(const owner of [a,text])assert.equal((await call(owner,'figma_select_document',{connectionId:id})).isError,false)
  // Exercise the host's real durable runtime-context projection: snapshot changes
  // reach the next model request, unchanged state produces no second user message.
  const {assembleContextFor}=await load('@deepseek-ai/dsh-agent')
  const {renderContextSections,joinContextSections}=await load('@deepseek-ai/dsh-system-prompt')
  const referenceProjection=async(owner)=>{
    const assembly=await ctx.systemPrompt.assemble(assembleContextFor(owner))
    const sections=renderContextSections(ctx.systemPrompt.refreshContext(assembly,assembleContextFor(owner))).filter(s=>s.name==='mcp:figma-design-reference')
    return {sections,text:joinContextSections(sections)}
  }
  const commitReference=async(owner,pattern)=>{
    const snapshot=await referenceProjection(owner);assert.match(snapshot.text,pattern)
    const pending=owner.runtimeContext.project(snapshot.text,snapshot.sections);assert.ok(pending,'changed state needs a durable notice')
    assert.ok(owner.runtimeContext.project(snapshot.text,snapshot.sections),'assembly without admission must not consume the notice')
    owner.session.append('user/message',pending,{surfaceOp:'append'})
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(owner.runtimeContext.project(snapshot.text,snapshot.sections),undefined,'unchanged reference must deduplicate')
  }
  await request(bridge,'/reference',{connectionId:id,designReference:{kind:'frame',name:'Manual A',nodeId:'1:5',revision:'notice-a'}})
  await commitReference(a,/Manual A/);await commitReference(b,/Manual A/)
  await request(bridge,'/reference',{connectionId:id,designReference:{kind:'frame',name:'Manual B',nodeId:'1:6',revision:'notice-b'}})
  await commitReference(a,/Manual B/)
  await request(bridge,'/reference',{connectionId:id,designReference:null})
  await commitReference(a,/未绑定/)
  assert.equal((await referenceProjection(chat)).text,'','chat without Work workspace receives no file state')
  const task=await call(a,'mcp__figma__create_session',{fileKey:`local:${id}`,description:'Native contract smoke'})
  assert.equal(task.isError,false,JSON.stringify(task))
  const sessionId=task.value.structuredContent.sessionId
  const mismatch=await call(a,'mcp__figma__use_figma',{fileKey:'wrong-file',sessionId,code:'return 1'})
  assert.equal(mismatch.isError,true);assert.match(JSON.stringify(mismatch),/safeToRetryWithoutCanvasRead/)
  assert.equal(bridge.documents.get(id).queue.length,0)
  const syntaxResult=await call(a,'mcp__figma__use_figma',{fileKey:`local:${id}`,sessionId,code:'const = invalid'})
  assert.equal(bridge.documents.get(id).queue.length,0,'syntax errors never enter the companion queue')
  assert.equal(syntaxResult.isError,true,JSON.stringify(syntaxResult));assert.equal(bridge.list()[0].needsInspection,false)
  const getterResult=await call(a,'mcp__figma__use_figma',{fileKey:`local:${id}`,sessionId,code:'const c=figma.createComponent();const instance=c.createInstance();return instance.mainComponent.id;'})
  assert.equal(getterResult.isError,true,JSON.stringify(getterResult))
  assert.match(JSON.stringify(getterResult),/FIGMA_ASYNC_MAIN_COMPONENT/)
  assert.match(JSON.stringify(getterResult),/getMainComponentAsync/)
  assert.equal(bridge.documents.get(id).queue.length,0,'known unsafe getters are rejected before any creation')
  assert.equal(bridge.list()[0].needsInspection,false)
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
  bridge.remove(id)
  const reconnected=await connect(bridge,'Canvas',4)
  const reconnectStatus=(await call(a,'figma_status',{compact:true})).value.structuredContent
  assert.equal(reconnectStatus.documentBinding.state,'disconnected')
  assert.equal(reconnectStatus.documentBinding.lastSelected.connectionId,id)
  assert.equal(reconnectStatus.documents.find(doc=>doc.connectionId===reconnected).bindingMatch,'same-name-unverified')
  assert.equal((await call(chat,'figma_status',{compact:true})).value.structuredContent.documentBinding.lastSelected,null)
  assert.equal((await call(a,'mcp__figma__get_metadata')).isError,true)
  assert.equal(bridge.documents.get(reconnected).queue.length,0,'reconnect hints never dispatch or rebind')
  assert.equal((await call(a,'figma_select_document',{connectionId:reconnected})).isError,false)
  const recovered=call(a,'mcp__figma__get_metadata');await runJob(bridge,reconnected,fixture.runtime);assert.equal((await recovered).isError,false)
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
  console.log(JSON.stringify({result:'PASS',actualDsh:require('@deepseek-ai/dsh-home-paths/package.json').version,productionEntry:true,localTools:LOCAL_TOOLS.length,skill:true,explicitDocumentBinding:true,reconnectHints:true,workScope:true,realHttpBridge:true,companionRuntime:true,referenceNotices:true,durableVisionAttachment:true,textModelFallback:true,workspaceExport:true,closed:true}))
}finally{for(const handle of handles)await handle.close();await ctx.fiber.dispose();await rm(home,{recursive:true,force:true})}
