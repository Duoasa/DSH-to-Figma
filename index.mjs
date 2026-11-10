import { recoveryResponse } from './lib/recovery.mjs'
import {compareReference} from './lib/compare-reference.mjs'
import {readOnlyProgram} from './lib/readonly-program.mjs'
import { referenceNotice } from './lib/reference-notice.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { LocalBridge } from './lib/bridge.mjs'
import { bridgeToken, privateDirectory, privateJson } from './lib/storage.mjs'
import { LOCAL_TOOLS, objectSchema, SUPPORTED_BACKENDS, requiredQueryFeatureVersion } from './lib/catalog.mjs'
import { PerformanceLog } from './lib/performance.mjs'
import { readAssets, saveAssets, localResult } from './lib/assets.mjs'
import { connectOfficial, desktopUrl } from './lib/official.mjs'
import { prepareCompanion } from './lib/companion.mjs'
import { figmaDiagnostic } from './lib/diagnostics.mjs'
import { FIGMA_USE_CONTRACT, LocalFigmaTasks } from './lib/figma-use-contract.mjs'
import { IdempotencyStore } from './lib/idempotency.mjs'
import { StepTasks } from './lib/workflows.mjs'
import { errorDetails, bindingFailure } from './lib/errors.mjs'
import { preflightScript, ScriptPreflightError } from './lib/script-preflight.mjs'
import { designSync } from './lib/design-sync.mjs'
import { scanProject, matchProjectAssets, projectMappings } from './lib/project-index.mjs'
import { recipes } from './lib/recipes.mjs'
import { saveMediaTransfer } from './lib/media-store.mjs'
import { captureDomSnapshot } from './lib/dom-capture.mjs'
import packageJson from './package.json' with { type: 'json' }

export const name='dsh-figma'
export const inject=['tools','skills','systemPrompt']
export const Config=z.object({
  backend:z.string().default('local'),
  bridgePort:z.number().step(1).min(1024).max(65535).default(3055),
  desktopServerUrl:z.string().default('http://127.0.0.1:3845/mcp'),
  toolCallTimeoutMs:z.number().step(1).min(1000).max(300000).default(120000),
  oauthClientId:z.string().default(''),
})
function publicToolName(server,raw){const full=`mcp__${server}__${raw}`,clean=full.replace(/[^A-Za-z0-9_-]/g,'_');return clean===full&&full.length<=64?full:clean.slice(0,51)+'_'+createHash('sha256').update(server+'\0'+raw).digest('hex').slice(0,12)}
const skillDir=fileURLToPath(new URL('./skills/figma-workbench/',import.meta.url))
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value})
const guides=['user-guide','help-connection','help-design','help-motion','help-troubleshooting','workflow','plugin-api','design-to-code','figjam-slides','components-variables','assets-scenes','official-services','motion','text-motion','custom-animation-styles','specs','local-workflows']

async function registerSkill(ctx){
  const path=join(skillDir,'SKILL.md'),raw=await readFile(path,'utf8'),front=/^---\n([\s\S]*?)\n---\n/.exec(raw)
  if(!front)throw new Error('Figma skill metadata missing')
  const description=/^description: (.+)$/m.exec(front[1])?.[1]
  const summary={name:'figma-workbench',description,path,source:'bundled',provider:'dsh-figma',rank:BUNDLED_SKILL_RANK,invocation:{modelInvocable:true,userInvocable:true},resourceBase:{kind:'directory',path:skillDir},locator:path}
  ctx.skills.registerProvider(()=>({name:'dsh-figma',list:async()=>[summary],get:async({rank:_rank,locator:_locator,...metadata})=>({...metadata,content:raw.slice(front[0].length).trim()})}))
}
export async function applyWithDependencies(ctx,config={},deps={}){
  const backend=config.backend??'local',home=deps.home??resolveDshHome(),timeoutMs=config.toolCallTimeoutMs??120000
  if(!SUPPORTED_BACKENDS.includes(backend))throw new Error('Figma backend must be local, desktop, or remote')
  if(backend==='desktop')desktopUrl(config.desktopServerUrl)
  const disposers=[],dynamic=[],sessions=new Map(),bindings=new Map(),agents=new WeakMap(),dead=new WeakSet(),shutdown=new AbortController(),performanceLogs=new Map()
  const figmaTasks=new LocalFigmaTasks(),idempotency=new IdempotencyStore(home),stepTasks=new StepTasks(home),localCalls=new Map()
  const bindDocument=(session,workspace,doc)=>{
    const binding={id:doc.connectionId,workspace,workspaceInput:session.header.cwd,name:doc.name,editorType:doc.editorType,fileKey:doc.fileKey??null}
    bindings.set(session.id,binding);return binding
  }
  const metricsFor=session=>{let log=performanceLogs.get(session.id);if(!log){log=new PerformanceLog();performanceLogs.set(session.id,log)}return log}
  const connect=deps.connect??connectOfficial
  let gate=Promise.resolve()
  const exclusive=run=>{const next=gate.then(run);gate=next.catch(()=>{});return next}
  let stopped=false,bridge,companion,available=false,toolNames=[],remoteInstructions='',refreshing,errorCode=null,diagnostic=null
  const assertOpen=()=>{if(stopped)throw new Error('Figma plugin has stopped')}
  const register=(rawName,description,inputSchema,call,{qualified=true,outputSchema,taskRequired}={})=>{
    const tool=createMcpToolDefinition(ctx,{name:qualified?publicToolName('figma',rawName):rawName,rawName,description,inputSchema,outputSchema,taskRequired,call})
    tool.isConcurrencySafe=()=>false // Stateful document selection and mutations are barriers.
    const dispose=ctx.tools.register(tool);(qualified?dynamic:disposers).push(dispose)
  }
  const closeSession=async id=>{bindings.delete(id);performanceLogs.delete(id);figmaTasks.close(id);const connection=sessions.get(id);sessions.delete(id);if(connection)await connection.then(c=>c.close()).catch(()=>{})}
  const close=async()=>{
    if(stopped)return;stopped=true;shutdown.abort()
    for(const dispose of [...dynamic.splice(0),...disposers.splice(0)])dispose()
    await bridge?.close();await Promise.all([...sessions.keys()].map(closeSession));performanceLogs.clear();figmaTasks.clear();available=false
  }
  ctx.effect(()=>close,'dsh-figma.lifecycle')
  ctx.on('agent/disposed',({agent})=>{dead.add(agent);agents.get(agent)?.abort();void closeSession(agent.session.id)})
  ctx.on('internal/plugin',fiber=>{if(fiber===ctx.fiber&&fiber.uid===null)return close()},{global:true})
  await registerSkill(ctx)
  const execution=async exec=>{
    assertOpen();exec.signal.throwIfAborted()
    const agent=exec.agent,session=agent?.session
    if(!session||dead.has(agent)||!session.header.cwd||!isAbsolute(session.header.cwd))throw new Error('Figma tools require an active Work session with a workspace')
    let controller=agents.get(agent);if(!controller){controller=new AbortController();agents.set(agent,controller)}
    const signal=AbortSignal.any([exec.signal,controller.signal,shutdown.signal]),workspace=await realpath(session.header.cwd)
    signal.throwIfAborted()
    return {session,workspace,signal}
  }
  ctx.systemPrompt.section({name:'mcp:figma',order:ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),interpolate:false,text:()=>stopped?'':
    `DSH to Figma backend: ${backend}. For questions about using DSH to Figma, read figma_read_guide topic user-guide first, then its relevant help-* chapter; these bundled help topics work offline and require no canvas session. Answer how-to questions without modifying canvas or settings; use live status only when diagnosing actual state. Read figma-workbench before design work. Confirm the intended document with figma_status({compact:true}); recheck after disconnect or target change. Local status includes documentBinding and per-document bindingMatch: same-file-key identifies a reconnect candidate; same-name-unverified is only a name hint, never proof. Explicitly confirm the intended target with figma_select_document after reconnect; status never rebinds. Local use_figma follows the installed Codex Figma 17 contract. Check document capabilities for gated APIs; get_capabilities refreshes this read-only snapshot. Read motion/text-motion/custom-animation-styles or specs guides before these operations; use local-workflows for semantic context, project reuse, design_diff, batch_edit, native export and authoring. Stop on unavailable native APIs. Local task sessions bootstrap automatically; create_session is optional. Pass the intended fileKey and a concise description on scripts. Local scripts preserve the current editor page and selection. Local status includes the file’s designReference descriptor; reuse an active reference unless the user overrides it, and call get_design_reference or read its nodeId only for missing context. Bind/unbind on request with set_design_reference/clear_design_reference. For a user-selected reference, read get_selection and retain the node/page IDs; never assume the first page. Switch at most once using await figma.setCurrentPageAsync(page) only when the intended target requires it. Local mode binds a single connected document on first use; multiple documents or disconnected bindings require figma_select_document. Use a shallow summary only to discover unknown targets. For known targets, read only missing context; for exact edits, inspect required properties, abort on mismatch, then edit and read back in one use_figma call. Return IDs and concise results. Query fonts/variables only when needed. Clarify an unresolved replication target once before detailed measurement, not after it. Build coherent regions and verify milestones; let observed defects drive deeper measurement, not a fixed round count. UI quality includes intended layout and editing behavior; choose flow, fixed positioning, constraints and locks by purpose, never sacrifice them for tiny pixel differences. At composition completion request a real image with use_figma.verify or node.screenshot, inspect it and correct defects; for replicas compare against the reference with compare. Image-returned is not visual acceptance. Reuse valid evidence and keep routine operations light; do not skip necessary verification. If verification alone fails, retry only verification. Use readOnly:true for bounded read scripts and resolve_fonts for font batches. Metrics are for diagnostics, not routine work. On errors follow suggestedAction/reconcile; never replay an uncertain write. The local editor serializes page calls; do not use the cloud parallel-page policy. ${remoteInstructions}`})
  if(backend==='local'){
    const text=({agent}={})=>{
      if(stopped||!agent||dead.has(agent)||!agent.session?.header?.cwd)return ''
      const binding=bindings.get(agent.session.id)
      if(binding&&binding.workspaceInput!==agent.session.header.cwd)return 'Figma 工作区已改变，旧设计参考不可继续沿用；请确认目标文件。'
      const documents=bridge?.documents
      const document=binding?documents?.get(binding.id):documents?.size===1?documents.values().next().value:null
      if(binding&&!document)return 'Figma 目标文件连接已失效，当前设计参考未知；不要沿用旧绑定，重新选择目标文件后获取最新状态。'
      return referenceNotice(document?{connectionId:document.id,fileKey:document.fileKey,name:document.name,designReference:document.designReference}:null)
    }
    // Runtime contexts are refreshed before request admission and durably deduplicated
    // by DSH. Never consume a notification in assemble(): preview/cancellation may run it.
    const notice={name:'mcp:figma-design-reference',order:900,interpolate:false,required:true,text}
    const dispose=typeof ctx.systemPrompt.context==='function'?ctx.systemPrompt.context(notice):ctx.systemPrompt.section(notice)
    if(typeof dispose==='function')disposers.push(dispose) // Older hosts keep the same small current-state section.
  }
  register('figma_status','Show connected documents and actual plugin/companion versions and cached read-only feature probes. Local documentBinding is scoped to this Work; documents.bindingMatch is selected, same-file-key, same-name-unverified, or none. Reconnect hints never rebind; use figma_select_document after confirming the target. Use get_capabilities to refresh the selected document. Prefer compact:true. includeMetrics:true adds this Work session\'s bounded canvas-call summary. Save performance.cursor before a task and pass it as metricsSince afterward; metricsDetails:true adds per-call records. Not model token usage.',objectSchema({compact:{type:'boolean'},includeMetrics:{type:'boolean'},metricsSince:objectSchema({epoch:{type:'string'},sequence:{type:'integer',minimum:0}},['epoch','sequence']),metricsDetails:{type:'boolean'}}),async(args={},exec)=>{
    if((args.metricsSince!==undefined||args.metricsDetails!==undefined)&&!args.includeMetrics)throw new Error('metricsSince and metricsDetails require includeMetrics:true')
    const documents=bridge?.list()??[]
    const health={backend,pluginVersion:packageJson.version,available,errorCode,diagnostic,documents:documents.map(doc=>({...doc,fileKey:doc.fileKey??`local:${doc.connectionId}`})),...(backend==='local'?{figmaUseContract:FIGMA_USE_CONTRACT}:{})}
    if(backend==='local'){
      const agent=exec?.agent,binding=agent&&!dead.has(agent)?bindings.get(agent.session?.id):null
      let sameWorkspace=false
      if(binding)try{sameWorkspace=binding.workspace===await realpath(agent.session.header.cwd)}catch{}
      const state=!binding?'unbound':!sameWorkspace?'workspace-changed':documents.some(doc=>doc.connectionId===binding.id)?'connected':'disconnected'
      health.documentBinding={state,requiresSelection:binding?state!=='connected':documents.length>1,lastSelected:binding?{connectionId:binding.id,name:binding.name,editorType:binding.editorType,fileKey:binding.fileKey}:null}
      for(let i=0;i<documents.length;i++){
        const doc=documents[i];let match='none'
        if(binding&&sameWorkspace){
          if(doc.connectionId===binding.id)match='selected'
          else if(state==='disconnected'&&doc.editorType===binding.editorType){
            if(binding.fileKey&&doc.fileKey){if(binding.fileKey===doc.fileKey)match='same-file-key'}
            else if(binding.name===doc.name)match='same-name-unverified'
          }
        }
        health.documents[i].bindingMatch=match
      }
    }
    if(!args.compact)Object.assign(health,{tools:toolNames,companion:companion??null,documentSelection:backend==='local'?'A single connected document is selected on first use. Multiple documents and disconnected bindings require explicit selection.':'Use the actual official tool schema and intended file or selection.',bridgePort:bridge?.port??null,skill:'figma-workbench',cloudAccess:backend==='remote'?'Depends on official client approval, account and seat.':backend==='desktop'?'Official desktop MCP provides design reading and screenshots, not canvas writing or cloud generation.':'Cloud-only generation is not provided by the local bridge.',setup:backend==='local'?'Import the paired companion.manifest once in Figma, then run DSH to Figma · Local. It connects automatically; keep it open. Call figma_setup for installation paths.':backend==='desktop'?'Keep Figma desktop open with its built-in MCP enabled, then run figma_reconnect. No companion plugin or remote OAuth login is required.':'Run dsh-figma login with the same DSH home, then figma_reconnect.'})
    if(args.includeMetrics){
      if(!exec?.agent?.session)throw new Error('Performance metrics require an active Work session; ordinary status is available without includeMetrics')
      const {session}=await execution(exec);health.performance=metricsFor(session).snapshot({since:args.metricsSince,details:args.metricsDetails===true})
    }
    return result(health)
  },{qualified:false})
  register('figma_setup','Prepare the private, pre-paired Figma companion. Return installation paths only; never read or share its credential-bearing code or archive.',objectSchema(),async()=>{companion=await prepareCompanion(home,{port:bridge?.port??config.bridgePort??3055,token:bridge?.token});return result({backend,bridgeRunning:!!bridge&&available,...companion,instructions:'Import this manifest once through Figma Plugins > Development > Import plugin from manifest. Run DSH to Figma · Local in your target file. Keep the window open. Requires backend: local; restart DSH after changing backend. Do not upload or share this private package.'})},{qualified:false})
  register('figma_read_guide','Read bundled offline user help or a technical Figma guide. For usage questions start with user-guide, then help-connection (setup/update/modes), help-design (editing/assets/export/code), help-motion (animation/FigJam/Slides), or help-troubleshooting (errors/recovery). No active canvas or Work session is needed to read help.',objectSchema({topic:{type:'string',enum:guides}},['topic']),async args=>{if(!guides.includes(args.topic))throw new Error('Unknown Figma guide');return {content:[{type:'text',text:await readFile(join(skillDir,'references',args.topic+'.md'),'utf8')}] }},{qualified:false})
  register('figma_select_document','Bind this Work session to one explicitly chosen local Figma document. IDs come from figma_status. Never silently switches targets.',objectSchema({connectionId:{type:'string'}},['connectionId']),async(args,exec)=>{
    const {session,workspace}=await execution(exec)
    if(!bridge)throw new Error('Document binding is only used with the local backend')
    const doc=bridge.list().find(d=>d.connectionId===args.connectionId)
    if(!doc)throw new Error('Document is not connected')
    bindDocument(session,workspace,doc);return result({selected:doc})
  },{qualified:false})
  if(backend==='local'){
    try{
      bridge=deps.bridge??new LocalBridge({token:await bridgeToken(home),port:config.bridgePort??3055,timeoutMs})
      await bridge.start()
      companion=await prepareCompanion(home,{port:bridge.port,token:bridge.token})
      await privateJson(join(await privateDirectory(home),'bridge.json'),{port:bridge.port,pid:process.pid,companion:companion.manifest,startedAt:new Date().toISOString()})
      const persistExport=async(id,operationId,owner,workspace,signal,descriptor)=>{
        const pending=bridge.takeExport?bridge.takeExport(id,operationId,owner):descriptor?{transfer:descriptor}:null
        if(!pending)return null
        try{
          const file=await saveMediaTransfer(workspace,pending.transfer,{signal,
            readChunk:async chunk=>(await bridge.call(id,'read_export_chunk',chunk,{signal,owner})).value,
            release:async transfer=>(await bridge.call(id,'release_export',transfer,{owner})).value})
          const saved={result:{file},operationId}
          bridge.completeOutput?.(id,operationId,owner,saved)
          return saved
        }catch(error){
          bridge.failOutput?.(id,operationId,owner,error)
          throw Object.assign(new Error(String(error?.message||error).replace(/ \[operationId=[^\]]+\]/g,'')+' [operationId='+operationId+']',{cause:error}),{operationId,safeToRetryWithoutCanvasRead:false})
        }
      }
      for(const tool of LOCAL_TOOLS){const call=async(args,exec)=>{
        let dispatched=false,lease
        try {
        const {session,workspace,signal}=await execution(exec)
        if(tool.hostOnly){
          if(tool.name==='project_index')return result(await scanProject(workspace,args))
          if(tool.name==='project_match')return result(matchProjectAssets(await scanProject(workspace,{}),{...args,mappings:(await projectMappings(workspace)).mappings}))
          if(tool.name==='project_mappings')return result(await projectMappings(workspace,args))
          if(tool.name==='local_recipes'){if(args.action==='save')preflightScript(args.code);return result(await recipes(workspace,args))}
        }
        let binding=bindings.get(session.id)
        if(!binding){
          const documents=bridge.list()
          if(documents.length!==1)throw bindingFailure(documents,null,workspace)
          binding=bindDocument(session,workspace,documents[0])
        }
        const document=bridge.list().find(doc=>doc.connectionId===binding.id)
        if(!document)throw bindingFailure(bridge.list(),binding,workspace)
        if(binding.workspace!==workspace)throw new Error('Work workspace changed; explicitly select the document again')
        if((document.featureVersion??0)<requiredQueryFeatureVersion(tool.name,args))throw new Error('The connected Figma companion does not support these query features yet. Run figma_setup, then close and rerun DSH to Figma · Local from its paired manifest; inspect figma_status and reselect the document. Legacy queries remain available.')
        const context=figmaTasks.context(session.id,workspace,document,args)
        if(tool.name==='run_steps'){if(args.action==='resolve'&&(document.busy||document.needsInspection))throw Object.assign(Error('Inspect affected resources and wait for the active write before resolving this step'),{recovery:{needsInspection:true}});return result(await stepTasks.run([session.id,workspace,context.fileKey],args,(name,payload)=>localCalls.get(name)(payload,exec)))}
        if(tool.mutation&&args.idempotencyKey!==undefined){lease=await idempotency.begin([session.id,workspace,context.fileKey],args.idempotencyKey,tool.name,args);if(lease.output!==undefined)return lease.output}
        if(tool.name==='operation_status'){
          const status=bridge.operation(binding.id,args.operationId,session.id,false)
          if(args.includeResult&&status.method==='export_video'&&status.state==='completed'&&status.outputState==='pending')await persistExport(binding.id,args.operationId,session.id,workspace,signal)
          return result(bridge.operation(binding.id,args.operationId,session.id,args.includeResult))
        }
        if(tool.name==='create_session')return result(figmaTasks.create(session.id,workspace,document,args))
        if(tool.name==='get_metadata'&&args.responseMode==='recovery'&&(!args.nodeId||args.profile==='summary'||args.offset!==undefined||args.limit!==undefined))throw new Error('Recovery response requires affected nodeId, full/default profile and no offset/limit')
        const preparedCode=tool.name==='use_figma'?preflightScript(args.code,{codeLayerCreation:document.capabilities?.features?.codeLayerCreation?.state}):undefined
        if(tool.name==='use_figma'&&args.verify&&(Boolean(args.verify.nodeId)===Boolean(args.verify.resultPath)||args.verify.resultPath&&!/^(?:\$|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(args.verify.resultPath)))throw Error('verify requires exactly one nodeId or resultPath')
        const readProgram=tool.name==='use_figma'&&args.readOnly?readOnlyProgram(preparedCode):undefined
        if(args.readOnly&&args.trackCreated)throw Error('readOnly and trackCreated cannot be combined')
        if(tool.name==='rollback'){const original=bridge.operation(binding.id,args.operationId,session.id,false);if(original.method!=='use_figma'||original.state!=='failed')throw Error('Rollback requires a failed use_figma operation owned by this Work/file')}
        const id=binding.id
        const performanceLog=metricsFor(session)
        const started=performance.now()
        let payload=preparedCode!==undefined?{...args,code:preparedCode,...(readProgram?{readOnlyProgram:readProgram}:{})}:args,response,output,bridgeMetric,capture,status='failed',method=tool.name
        const operationId=randomUUID()
        try{
          if(tool.name==='compare')payload={...args,reference:undefined,referenceImage:await compareReference({workspace,session,attachments:ctx.get('attachments'),reference:args.reference,signal})}
          if(tool.name==='upload_assets')payload={...args,files:undefined,assets:await readAssets(workspace,args.files)}
          if(tool.name==='capture_webpage'){capture=await captureDomSnapshot({...args,signal});payload={snapshot:capture.snapshot??capture,fontPolicy:args.fontPolicy,origin:args.origin};method='import_dom_snapshot'}
          if(tool.name==='design_diff'){method='get_design_context';payload={nodeId:args.nodeId,semantic:true,includeScreenshot:false,dedupeStyles:false,dedupeComponents:false,maxNodes:args.maxNodes??1500,maxBytes:args.maxBytes??2097152,depth:30}}
          dispatched=true
          if(context.task){context.task.calls++;context.task.files.add(context.fileKey)}
          response=await bridge.call(id,method,payload,{signal,operationId,owner:session.id,mutation:tool.mutation&&!(tool.name==='use_figma'&&args.readOnly),...(tool.name==='rollback'?{recoveryOf:args.operationId}:{}),inspect:tool.inspect&&args.profile!=='summary'&&args.offset===undefined&&args.limit===undefined,onMetric:metric=>{bridgeMetric=metric}})
          if(tool.name!=='export_video')signal.throwIfAborted()
          if(tool.name==='design_diff')response.value=await designSync({workspace,fileKey:context.fileKey,nodeId:args.nodeId,snapshot:response.value,captureOptions:payload,action:args.action??'compare',expectedRevision:args.expectedRevision})
          if(tool.name==='export_video'&&response.value?.transfer){
            const saved=await persistExport(id,operationId,session.id,workspace,signal,response.value.transfer)
            if(!saved)throw Object.assign(new Error('Export transfer unavailable; query operation_status before taking any further action'),{operationId})
            response.value=saved.result
          }
          if(tool.name==='download_assets')response.value={...response.value,files:await saveAssets(workspace,response.assets)}
          if(capture?.diagnostics)response.value={...response.value,capture:capture.diagnostics}
          signal.throwIfAborted()
          const files=tool.name==='use_figma'&&response.assets?.length?await saveAssets(workspace,response.assets):[]
          if(tool.name==='get_metadata'&&args.responseMode==='recovery')response.value=recoveryResponse(response.value,response.recovery)
          output=localResult(response)
          if(response.verification){output.structuredContent.verification=response.verification;output.content.push({type:'text',text:JSON.stringify({verification:response.verification})})}
          if(response.journal){output.structuredContent.journal=response.journal;output.content.push({type:'text',text:JSON.stringify({journal:response.journal})})}
          if(response.recovery){output.structuredContent.recovery=response.recovery;output.content.push({type:'text',text:JSON.stringify({recovery:response.recovery})})}
          if(files.length){output.structuredContent.files=files;output.content.push({type:'text',text:JSON.stringify({files})})}
          if(tool.name==='use_figma')output.structuredContent.execution={fileKey:context.fileKey,sessionId:context.sessionId,description:args.description??null,skillNames:args.skillNames??null}
          output.structuredContent.operationId=operationId
          bridge.completeOutput?.(id,operationId,session.id,output.structuredContent)
          if(lease)await idempotency.finish(lease,output)
          status='ok';return output
        }finally{
          if(signal.aborted)status='canceled'
          performanceLog.record({tool:tool.name,status,hostMs:performance.now()-started,bridge:bridgeMetric,runtime:response?.metrics,
            textBytes:output?Buffer.byteLength(output.content[0].text):null,
            imageCount:output?output.content.filter(block=>block.type==='image').length:null,
            imageBytes:output?output.content.filter(block=>block.type==='image').reduce((total,block)=>total+Buffer.byteLength(block.data,'base64'),0):null})
        }
        }catch(error){
          const value={error:String(error?.message||error),safeToRetryWithoutCanvasRead:error.executionState==='unknown'?false:!dispatched||error?.safeToRetryWithoutCanvasRead===true,...(error.operationId?{operationId:error.operationId}:{}),...(error.batchResult?{batchResult:error.batchResult}:{}),...(error.createdNodeIds?{createdNodeIds:error.createdNodeIds}:{})}
          if(error.recovery)value.recovery=error.recovery
          if(error.cleanup)value.cleanup=error.cleanup
          if(!dispatched&&error instanceof ScriptPreflightError)value.diagnostic={stage:'preflight',...error.diagnostic}
          else if(dispatched){
            const {variableModeLimitDiagnostic}=await import('./lib/native-diagnostics.mjs')
            const diagnostic=variableModeLimitDiagnostic(error)
            if(diagnostic){const {code,stage,scope,limit,nativeError}=diagnostic;value.diagnostic={code,stage,scope,limit,nativeError,hint:'Follow reconcile; inspect affected values with get_variable_defs and canvas nodes with get_metadata as needed.'}}
          }
          Object.assign(value,errorDetails(error,{safe:value.safeToRetryWithoutCanvasRead,diagnostic:value.diagnostic,args}))
          if(value.reconcile?.tool==='get_variable_defs'&&value.recovery)value.recovery={needsInspection:true,hint:'Read affected collection values using reconcile.'}
          const output={...result(value),isError:true};if(lease?.id)await idempotency.finish(lease,output);return output
        }
      };localCalls.set(tool.name,call);register(tool.name,tool.description,tool.inputSchema,call)}
      toolNames=LOCAL_TOOLS.map(t=>t.name);available=true
    }catch(error){await bridge?.close();for(const dispose of dynamic.splice(0))dispose();errorCode=error.code==='EADDRINUSE'?'bridge_port_in_use':'local_start_failed';ctx.logger.warn('Figma local bridge unavailable; check figma_status and port configuration.')}
  }
  const connectionFor=async context=>{
    let pending=sessions.get(context.session.id)
    if(!pending){pending=connect({backend,home,desktopServerUrl:config.desktopServerUrl,clientId:config.oauthClientId,signal:context.signal}).then(async connection=>{
      if(stopped||context.signal.aborted){await connection.close();throw new Error('Figma connection canceled')}
      connection.workspace=context.workspace;return connection
    });sessions.set(context.session.id,pending);pending.catch(()=>{if(sessions.get(context.session.id)===pending)sessions.delete(context.session.id)})}
    const connection=await pending
    if(connection.workspace!==context.workspace)throw new Error('Workspace changed; start a new Work session')
    return connection
  }
  const refresh=()=>{
    if(refreshing)return refreshing
    refreshing=exclusive(async()=>{
      assertOpen();if(backend==='local')return {available,tools:toolNames,errorCode}
      let discovery
      try{
        discovery=await connect({backend,home,desktopServerUrl:config.desktopServerUrl,clientId:config.oauthClientId,signal:shutdown.signal})
        const listed=await discovery.client.listTools(undefined,{timeout:15000,cacheMode:'refresh'})
        if(!Array.isArray(listed.tools)||listed.tools.length>300||new Set(listed.tools.map(t=>t.name)).size!==listed.tools.length)throw new Error('Invalid tool catalog')
        const instructions=discovery.client.getInstructions?.()??''
        if(Buffer.byteLength(instructions)>65536)throw new Error('Instructions too large')
        assertOpen();await Promise.all([...sessions.keys()].map(closeSession));assertOpen()
        for(const dispose of dynamic.splice(0))dispose()
        available=false;toolNames=[];remoteInstructions=''
        for(const tool of listed.tools){
          if(typeof tool.name!=='string'||!tool.name||tool.name.length>200)throw new Error('Invalid tool name')
          register(tool.name,tool.description??'',tool.inputSchema,(args,exec)=>exclusive(async()=>{
            const context=await execution(exec),connection=await connectionFor(context)
            const secured={...args}
            if(tool.name==='get_screenshot'&&tool.inputSchema?.properties?.enableBase64Response)secured.enableBase64Response=true
            try{return await connection.client.callTool({name:tool.name,arguments:secured},{signal:context.signal,timeout:timeoutMs,toolDefinition:tool})}
            catch(error){await closeSession(context.session.id);throw new Error('Official Figma call failed or was interrupted. The operation was not replayed. Inspect the canvas before retrying; check login, access and service status.')}
          }),{outputSchema:tool.outputSchema,taskRequired:tool.execution?.taskSupport==='required'})
        }
        toolNames=listed.tools.map(t=>t.name);remoteInstructions=instructions;available=true;errorCode=null;diagnostic=null
      }catch(error){diagnostic=figmaDiagnostic(error);errorCode=diagnostic.code;if(!available){for(const dispose of dynamic.splice(0))dispose();toolNames=[]}ctx.logger.warn(diagnostic.message)}
      finally{await discovery?.close()}
      return {available,tools:toolNames,errorCode,diagnostic}
    }).finally(()=>{refreshing=null});return refreshing
  }
  register('figma_reconnect','Refresh the official MCP tool catalog after login or enabling Figma desktop MCP. No canvas tools are called.',objectSchema(),async()=>result(await refresh()),{qualified:false})
  if(backend!=='local'){
    register('figma_resources','List or read official MCP resources and resource templates, preserving original content.',objectSchema({operation:{type:'string',enum:['list','templates','read']},uri:{type:'string'},cursor:{type:'string'}},['operation']),(args,exec)=>exclusive(async()=>{
      const context=await execution(exec),{client}=await connectionFor(context),options={signal:context.signal,timeout:timeoutMs}
      if(args.operation==='read'&&!args.uri)throw new Error('Resource URI required')
      const value=args.operation==='read'?await client.readResource({uri:args.uri},options):args.operation==='templates'?await client.listResourceTemplates({cursor:args.cursor},options):await client.listResources({cursor:args.cursor},options)
      return result(value)
    }),{qualified:false})
    register('figma_prompts','List or retrieve an official MCP prompt.',objectSchema({operation:{type:'string',enum:['list','get']},name:{type:'string'},arguments:{type:'object',additionalProperties:{type:'string'}}},['operation']),(args,exec)=>exclusive(async()=>{
      const context=await execution(exec),{client}=await connectionFor(context),options={signal:context.signal,timeout:timeoutMs}
      if(args.operation==='get'&&!args.name)throw new Error('Prompt name required')
      return result(args.operation==='get'?await client.getPrompt({name:args.name,arguments:args.arguments},options):await client.listPrompts(undefined,options))
    }),{qualified:false})
    await refresh()
  }
  return {close,refresh,get available(){return available},get toolCount(){return toolNames.length},get bridge(){return bridge}}
}
export async function apply(ctx,config){if(process.env.DSH_FIGMA_DISABLED==='1')return;await applyWithDependencies(ctx,config)}
