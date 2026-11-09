import {createHash,randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {stable} from './idempotency.mjs'
const allowed=new Set(['use_figma','batch_edit','import_scene','create_variables','add_variable_modes','generate_diagram','generate_deck','import_dom_snapshot'])
const hash=v=>createHash('sha256').update(v).digest('hex')
export class StepTasks {
 constructor(home){this.directory=join(home,'figma','step-tasks');this.active=new Set()}
 async run(scope,args,invoke){
  if(!['start','status','resume','resolve'].includes(args.action))throw Error('Invalid task action')
  const owner=hash(stable(scope));let id=args.taskId
  if(args.action==='start'){
   if(typeof args.taskKey!=='string'||!args.taskKey||args.taskKey.length>200)throw Error('start requires a stable taskKey')
   if(!Array.isArray(args.steps)||!args.steps.length||args.steps.length>100||args.steps.some(s=>!allowed.has(s.tool)||!s.args||typeof s.args!=='object'||Array.isArray(s.args)))throw Error('Provide 1–100 supported explicit steps')
   if(Buffer.byteLength(stable(args.steps))>2*1024*1024)throw Error('Task steps exceed 2 MiB')
   id=hash(stable([owner,args.taskKey]))
  }
  if(!/^[a-f0-9]{64}$/.test(id??''))throw Error('Invalid taskId')
  if(this.active.has(id))throw Error('Task already running; query status after this call finishes')
  this.active.add(id)
  try{
   await mkdir(this.directory,{recursive:true,mode:0o700});const path=join(this.directory,id+'.json')
   const save=async record=>{const temp=path+'.tmp';await writeFile(temp,JSON.stringify(record),{mode:0o600});await rename(temp,path)}
   let initialSelection,created=false,task;try{task=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
   if(task&&task.owner!==owner)throw Error('Task belongs to another Work/workspace/file')
   if(task&&args.action==='start'&&task.digest!==hash(stable(args.steps)))throw Error('Task key conflict')
   if(!task){
    if(args.action!=='start')throw Error('Task not found')
    if((await readdir(this.directory)).filter(x=>x.endsWith('.json')).length>=100)throw Error('Task history capacity reached (100)')
    const selection=initialSelection=await invoke('get_selection',{});if(selection.isError)return selection
    task={owner,digest:hash(stable(args.steps)),taskId:id,steps:args.steps,pageId:selection.structuredContent.result?.page?.id,next:0,results:[],state:'ready',resumeToken:randomUUID()}
    if(!task.pageId)throw Error('Cannot establish task page context')
    await save(task);created=true
   }
   const summary=()=>({taskId:id,resumeToken:task.resumeToken,state:task.state,progress:{completed:task.next,total:task.steps.length},journal:task.results.map((r,i)=>({step:i,operationId:r.operationId,createdNodeIds:r.result?.createdNodeIds,nodeIds:r.result?.nodeIds,resultId:r.result?.id,acceptedAfterInspection:r.acceptedAfterInspection})),...(task.failure?{failure:task.failure}:{})})
   if(args.action==='status'||args.action==='start'&&!created||task.state==='completed')return summary()
   if(['resume','resolve'].includes(args.action)&&args.resumeToken!==task.resumeToken)throw Error('Stale or missing resumeToken; read task status')
   if(args.action==='resolve'){
    if(!['failed','running'].includes(task.state))throw Error('Only an interrupted or failed step can be resolved')
    if(args.resolution==='accept'){
      if(!args.resolutionResult||typeof args.resolutionResult!=='object'||Buffer.byteLength(JSON.stringify(args.resolutionResult))>65536)throw Error('accept requires a bounded resolutionResult after inspecting effects')
      task.results.push({result:args.resolutionResult,acceptedAfterInspection:true,operationId:task.failure?.operationId});task.next++
    }else if(args.resolution==='retry'){
      if(task.failure?.safeToRetryWithoutCanvasRead!==true||task.failure?.executionState!=='not-started')throw Error('Only a confirmed not-started step can retry; inspect and accept partial work or start an explicit repair task')
      if(args.stepArgs){if(typeof args.stepArgs!=='object'||Array.isArray(args.stepArgs)||Buffer.byteLength(JSON.stringify(args.stepArgs))>150000)throw Error('Invalid replacement stepArgs');task.steps[task.next].args=args.stepArgs}
      task.attempt=(task.attempt??0)+1
    }else throw Error('Choose accept or retry')
    task.failure=null;task.state=task.next===task.steps.length?'completed':'ready';task.resumeToken=randomUUID();await save(task);return summary()
   }
   if(task.state==='running'||task.state==='failed')return summary() // Never replay an interrupted/partially failed step.
   const selection=initialSelection??await invoke('get_selection',{});if(selection.isError)return selection
   if(selection.structuredContent.result?.page?.id!==task.pageId)throw Error('Task page changed; return to the original page before resuming')
   const max=args.maxSteps??1;if(!Number.isInteger(max)||max<1||max>10)throw Error('maxSteps must be 1–10')
   for(let n=0;n<max&&task.next<task.steps.length;n++){
    const i=task.next,step=task.steps[i]
    function resolve(v){
     if(v&&typeof v==='object'&&Object.hasOwn(v,'$step')){
      if(!Number.isInteger(v.$step)||v.$step<0||v.$step>=i||!Array.isArray(v.path)||v.path.some(k=>typeof k!=='string'||['__proto__','constructor','prototype'].includes(k)))throw Error('Invalid previous-step reference')
      let out=task.results[v.$step];for(const key of v.path){if(!out||!Object.hasOwn(out,key))throw Error('Step reference path not found');out=out[key]}return out
     }
     return Array.isArray(v)?v.map(resolve):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x)])):v
    }
    const payload=resolve(step.args);task.state='running';await save(task)
    let out;try{out=await invoke(step.tool,{...payload,taskPageId:task.pageId,idempotencyKey:'task:'+id+':'+i+':'+(task.attempt??0)})}catch(e){out={isError:true,structuredContent:{error:String(e.message),executionState:'unknown'}}}
    if(out.isError){task.state='failed';task.failure={step:i,...out.structuredContent};await save(task);return summary()}
    const result=out.structuredContent
    if(Buffer.byteLength(JSON.stringify(result))>65536){task.state='failed';task.failure={step:i,error:'Step completed but result exceeds 64 KiB checkpoint limit; do not replay',operationId:result.operationId};await save(task);return summary()}
    task.results.push(result);task.next++;task.state=task.next===task.steps.length?'completed':'ready';task.resumeToken=randomUUID();await save(task)
   }
   return summary()
  }finally{this.active.delete(id)}
 }
}
