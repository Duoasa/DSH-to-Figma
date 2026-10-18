import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { LocalBridge } from './lib/bridge.mjs'
import { bridgeToken, privateDirectory, privateJson } from './lib/storage.mjs'
import { LOCAL_TOOLS, objectSchema, SUPPORTED_BACKENDS } from './lib/catalog.mjs'
import { readAssets, saveAssets, localResult } from './lib/assets.mjs'
import { connectOfficial, desktopUrl } from './lib/official.mjs'
import { prepareCompanion } from './lib/companion.mjs'
import { figmaDiagnostic } from './lib/diagnostics.mjs'

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
const guides=['workflow','plugin-api','design-to-code','figjam-slides','components-variables','assets-scenes','official-services']

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
  const disposers=[],dynamic=[],sessions=new Map(),bindings=new Map(),agents=new WeakMap(),dead=new WeakSet(),shutdown=new AbortController()
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
  const closeSession=async id=>{bindings.delete(id);const connection=sessions.get(id);sessions.delete(id);if(connection)await connection.then(c=>c.close()).catch(()=>{})}
  const close=async()=>{
    if(stopped)return;stopped=true;shutdown.abort()
    for(const dispose of [...dynamic.splice(0),...disposers.splice(0)])dispose()
    await bridge?.close();await Promise.all([...sessions.keys()].map(closeSession));available=false
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
    `DSH to Figma backend: ${backend}. Read figma-workbench before design work. Use figma_status, in local mode one connected document is bound on first use; when multiple documents exist or a previous binding disconnected, use figma_select_document explicitly. Never infer cloud capability from a tool name. Inspect existing content, preserve components, use auto layout, return IDs, and verify composition with a real screenshot. On an unknown write outcome, inspect before retrying; never replay automatically. ${remoteInstructions}`})
  register('figma_status','Show connected Figma documents, backend, actual tool coverage and setup state without credentials.',objectSchema(),async()=>result({backend,available,tools:toolNames,errorCode,diagnostic,documents:bridge?.list()??[],companion:companion??null,documentSelection:backend==='local'?'A single connected document is selected on first use. Multiple documents and disconnected bindings require explicit selection.':'Use the actual official tool schema and intended file or selection.',bridgePort:bridge?.port??null,skill:'figma-workbench',cloudAccess:backend==='remote'?'Depends on official client approval, account and seat.':backend==='desktop'?'Official desktop MCP provides design reading and screenshots, not canvas writing or cloud generation.':'Cloud-only generation is not provided by the local bridge.',setup:backend==='local'?'Import the paired companion.manifest once in Figma, then run DSH to Figma · Local. It connects automatically; keep it open. Call figma_setup for installation paths.':backend==='desktop'?'Keep Figma desktop open with its built-in MCP enabled, then run figma_reconnect. No companion plugin or remote OAuth login is required.':'Run dsh-figma login with the same DSH home, then figma_reconnect.'}),{qualified:false})
  register('figma_setup','Prepare the private, pre-paired Figma companion. Return installation paths only; never read or share its credential-bearing code or archive.',objectSchema(),async()=>{companion=await prepareCompanion(home,{port:bridge?.port??config.bridgePort??3055,token:bridge?.token});return result({backend,bridgeRunning:!!bridge&&available,...companion,instructions:'Import this manifest once through Figma Plugins > Development > Import plugin from manifest. Run DSH to Figma · Local in your target file. Keep the window open. Requires backend: local; restart DSH after changing backend. Do not upload or share this private package.'})},{qualified:false})
  register('figma_read_guide','Read a focused local Figma workflow guide.',objectSchema({topic:{type:'string',enum:guides}},['topic']),async args=>{if(!guides.includes(args.topic))throw new Error('Unknown Figma guide');return {content:[{type:'text',text:await readFile(join(skillDir,'references',args.topic+'.md'),'utf8')}] }},{qualified:false})
  register('figma_select_document','Bind this Work session to one explicitly chosen local Figma document. IDs come from figma_status. Never silently switches targets.',objectSchema({connectionId:{type:'string'}},['connectionId']),async(args,exec)=>{
    const {session,workspace}=await execution(exec)
    if(!bridge)throw new Error('Document binding is only used with the local backend')
    const doc=bridge.list().find(d=>d.connectionId===args.connectionId)
    if(!doc)throw new Error('Document is not connected')
    bindings.set(session.id,{id:doc.connectionId,workspace});return result({selected:doc})
  },{qualified:false})
  if(backend==='local'){
    try{
      bridge=deps.bridge??new LocalBridge({token:await bridgeToken(home),port:config.bridgePort??3055,timeoutMs})
      await bridge.start()
      companion=await prepareCompanion(home,{port:bridge.port,token:bridge.token})
      await privateJson(join(await privateDirectory(home),'bridge.json'),{port:bridge.port,pid:process.pid,companion:companion.manifest,startedAt:new Date().toISOString()})
      for(const tool of LOCAL_TOOLS)register(tool.name,tool.description,tool.inputSchema,async(args,exec)=>{
        const {session,workspace,signal}=await execution(exec)
        let binding=bindings.get(session.id)
        if(!binding){
          const documents=bridge.list()
          if(documents.length!==1)throw new Error(documents.length?'Multiple Figma documents are connected. Choose the target with figma_select_document using figma_status.':'No Figma document is connected. Run the paired Figma companion; use figma_setup for its manifest path.')
          binding={id:documents[0].connectionId,workspace};bindings.set(session.id,binding)
        }
        if(!bridge.list().some(doc=>doc.connectionId===binding.id))throw new Error('The previously selected Figma document disconnected. Explicitly choose the intended document with figma_select_document; it will not switch automatically.')
        if(binding.workspace!==workspace)throw new Error('Work workspace changed; explicitly select the document again')
        const id=binding.id
        let payload=args
        if(tool.name==='upload_assets')payload={parentId:args.parentId,assets:await readAssets(workspace,args.files)}
        const response=await bridge.call(id,tool.name,payload,{signal,mutation:tool.mutation,inspect:tool.inspect})
        signal.throwIfAborted()
        if(tool.name==='download_assets')response.value={...response.value,files:await saveAssets(workspace,response.assets)}
        return localResult(response)
      })
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
