// Isolated live-editor acceptance harness. No installed DSH profile is modified.
// Run: node test/manual/live-harness.mjs /absolute/private/test-home 13055
// Stdin: {"tool":"figma_status","args":{"compact":true}}; {"stop":true} to close.
// Pair only the printed manifest in a disposable test file. Never share its code/ZIP.
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createInterface} from 'node:readline'
import {applyWithDependencies} from '../../index.mjs'
const home=resolve(process.argv[2]??'.figma/live-test-home'),port=Number(process.argv[3]??13055)
await mkdir(home,{recursive:true,mode:0o700})
const definitions=new Map(),ctx={tools:{register(def){definitions.set(def.name,def);return()=>definitions.delete(def.name)}},skills:{registerProvider(){}},systemPrompt:{section(){},getSectionOrder(){return 1}},logger:{warn(message){console.error(message)}},effect(){},on(){},get(){return undefined}}
const handle=await applyWithDependencies(ctx,{backend:'local',bridgePort:port},{home})
const exec={agent:{session:{id:'live-test',header:{cwd:process.cwd()}}},signal:new AbortController().signal}
let sequence=0
const evidence=join(home,'evidence');await mkdir(evidence,{recursive:true,mode:0o700});sequence=Math.max(0,...(await readdir(evidence)).filter(n=>/^\d+\.json$/.test(n)).map(n=>Number(n.split('.')[0])))
const status=await definitions.get('figma_status').execute({},exec)
if(!status.structuredContent.available)throw Error('Isolated bridge failed to start')
const manifest=status.structuredContent.companion.manifest
const data=JSON.parse(await readFile(manifest,'utf8'));data.name='DSH to Figma · Local Test';await writeFile(manifest,JSON.stringify(data,null,2),{mode:0o600})
console.log(JSON.stringify({ready:true,manifest,port,evidence}))
try {
  for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
    if(!line.trim())continue
    try {
      const request=JSON.parse(line);if(request.stop)break
      if (request.script) {
        const script=resolve('test/manual',request.script)
        if (!script.startsWith(resolve('test/manual')+'/') || !script.endsWith('.js')) throw Error('Use a test/manual JavaScript file')
        request.args={...request.args,code:await readFile(script,'utf8')}
      }
      const name=request.tool.startsWith('figma_')?request.tool:'mcp__figma__'+request.tool
      const definition=definitions.get(name);if(!definition)throw Error('Unknown tool')
      const response=await definition.execute(request.args??{},exec)
      const imagePaths=[]
      for(const block of response.content??[])if(block.type==='image') {
        const path=join(evidence,`${sequence+1}-${imagePaths.length}.png`)
        await writeFile(path,Buffer.from(block.data,'base64'));imagePaths.push(path)
      }
      const value=response.structuredContent??response.content?.filter(b=>b.type==='text')
      const out={sequence:++sequence,tool:request.tool,label:request.label??null,value,imagePaths}
      await writeFile(join(evidence,`${sequence}.json`),JSON.stringify(out,null,2))
      console.log(JSON.stringify(out))
    } catch(error) { const out={sequence:++sequence,error:String(error.message)};await writeFile(join(evidence,`${sequence}.json`),JSON.stringify(out,null,2));console.log(JSON.stringify(out)) }
  }
} finally {await handle.close()}
