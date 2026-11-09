import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,readdir,rename} from 'node:fs/promises'
import {join} from 'node:path'
const hash=v=>createHash('sha256').update(v).digest('hex')
export const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)
export class IdempotencyStore {
  constructor(home){this.directory=join(home,'figma','requests');this.active=new Set()}
  async begin(scope,key,method,args){
    if(typeof key!=='string'||!key||key.length>200)throw Error('idempotencyKey must contain 1–200 characters')
    const id=hash(stable([scope,key])),path=join(this.directory,id+'.json')
    const {sessionId,description,skillNames,idempotencyKey,...payload}=args,digest=hash(stable([method,payload]))
    if(this.active.has(id))throw Object.assign(Error('This idempotent request is already running; do not replay.'),{executionState:'unknown'})
    this.active.add(id)
    try{
      let record;try{record=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
      if(record){
        if(record.digest!==digest)throw Error('Idempotency key conflict: use a new key for a different request')
        if(record.output!==undefined){this.active.delete(id);return {output:record.output}}
        throw Object.assign(Error('Idempotent request has no retained final result; do not replay. Inspect affected resources.'),{executionState:'unknown',operationId:record.operationId})
      }
      await mkdir(this.directory,{recursive:true,mode:0o700})
      if((await readdir(this.directory)).filter(x=>x.endsWith('.json')).length>=1000)throw Error('Idempotency history capacity reached (1000); existing keys remain protected')
      record={digest,state:'pending',createdAt:new Date().toISOString()}
      await writeFile(path,JSON.stringify(record),{flag:'wx',mode:0o600})
      return {id,path,record}
    }catch(e){this.active.delete(id);throw e}
  }
  async finish(lease,output){
    if(!lease?.id)return
    try{
      const text=JSON.stringify(output),record={...lease.record,state:output.isError?'failed':'completed',operationId:output.structuredContent?.operationId,finishedAt:new Date().toISOString(),...(Buffer.byteLength(text)<=1024*1024?{output}:{resultUnavailable:'result-too-large'})}
      const temp=lease.path+'.tmp';await writeFile(temp,JSON.stringify(record),{mode:0o600});await rename(temp,lease.path)
    }finally{this.active.delete(lease.id)}
  }
}
