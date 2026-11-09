import { constants } from 'node:fs'
import { open, opendir, mkdir, realpath, lstat, rename, rm } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const MAX_BYTES = 4 * 1024 * 1024
const hash = value => createHash('sha256').update(value).digest('hex')
export const revisionOf = value => hash(JSON.stringify(value))
const inside = (root,path) => { const r=relative(root,path); return r!== '..'&&!r.startsWith('../')&&!isAbsolute(r) }
export async function boundedEntries(path,limit) {
  const entries=[]
  for await(const entry of await opendir(path)) {
    if(entries.length===limit)return {entries,truncated:true}
    entries.push(entry)
  }
  return {entries,truncated:false}
}
export async function workspaceDirectory(workspace, area, create=false) {
  if (!['snapshots','mappings','recipes'].includes(area)) throw Error('Invalid workspace storage area')
  const root=await realpath(workspace); let path=root
  for(const name of ['.figma',area]) {
    path=join(path,name)
    if(create) await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e})
    try {const st=await lstat(path);if(st.isSymbolicLink()||!st.isDirectory()||!inside(root,await realpath(path)))throw Error('Figma storage must be a real workspace directory')}
    catch(e){if(e.code==='ENOENT'&&!create)return null;throw e}
  }
  return path
}
export async function readStored(path,maxBytes=MAX_BYTES) {
  let fd
  try {
    const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>maxBytes)throw Error('Invalid or oversized stored file')
    fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const actual=await fd.stat()
    if(!actual.isFile()||actual.size>maxBytes)throw Error('Invalid or oversized stored file')
    const text=await fd.readFile('utf8');if(Buffer.byteLength(text)>maxBytes)throw Error('Stored file exceeds budget')
    return JSON.parse(text)
  } catch(e) {if(e.code==='ENOENT')return null;throw e} finally {await fd?.close()}
}
export async function mutateStored(directory,name,operation) {
  if(!/^[a-z0-9][a-z0-9._-]{0,100}\.json$/.test(name))throw Error('Invalid store filename')
  const path=join(directory,name),lock=path+'.lock';let fd
  try {fd=await open(lock,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Error('This record is being modified; retry after the current operation');throw e}
  let temporary
  try {
    const previous=await readStored(path),next=await operation(previous)
    if(next===undefined)return previous
    if(next===null){if(previous!==null)await rm(path);return null}
    const bytes=JSON.stringify(next)
    if(Buffer.byteLength(bytes)>MAX_BYTES)throw Error('Stored record exceeds 4 MiB')
    temporary=path+'.'+randomUUID()+'.tmp';const writer=await open(temporary,'wx',0o600)
    try {await writer.writeFile(bytes);await writer.sync()}finally{await writer.close()}
    await rename(temporary,path);temporary=null;return next
  } finally {if(temporary)await rm(temporary,{force:true});await fd.close();await rm(lock,{force:true})}
}
function validateIdentity(fileKey,nodeId) {
  for(const [k,v] of Object.entries({fileKey,nodeId}))if(typeof v!=='string'||!v.trim()||v.length>200)throw Error(k+' must be a nonempty identifier of at most 200 characters')
}
function stable(value,depth=0,state={count:0}) {
  if(depth>40||++state.count>100000)throw Error('Snapshot exceeds structural limits')
  if(value===null||typeof value==='string'||typeof value==='boolean')return value
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Snapshot contains invalid numbers');return value}
  if(Array.isArray(value))return value.map(v=>stable(v,depth+1,state))
  if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Snapshot must contain JSON values only')
  const out={}
  for(const key of Object.keys(value).sort()){
    if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsupported snapshot key')
    out[key]=stable(value[key],depth+1,state)
  }
  return out
}
function ensureComplete(value) {
  const stack=[value];let count=0
  while(stack.length){const x=stack.pop();if(++count>100000)throw Error('Snapshot exceeds structural limits');if(!x||typeof x!=='object')continue
    if(x.truncated===true||x.complete===false||x.sectionPlan||x.dedupedChildren||x.reason==='maxBytes'||x.reason==='maxNodes'||(Array.isArray(x.omittedFields)&&x.omittedFields.length)||(Array.isArray(x.omissions)&&x.omissions.length)||(x.fieldErrors&&Object.keys(x.fieldErrors).length)||x.hasMore===true)throw Error('Cannot persist or compare incomplete design context; read every required section first')
    for(const v of Object.values(x))if(v&&typeof v==='object')stack.push(v)
  }
}
function normalize(snapshot,nodeId) {
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw Error('A complete design snapshot is required')
  const raw=JSON.stringify(snapshot);if(Buffer.byteLength(raw)>MAX_BYTES-4096)throw Error('Snapshot exceeds 4 MiB budget')
  ensureComplete(snapshot)
  if(snapshot.coverage?.complete!==true&&snapshot.complete!==true)throw Error('Design context must explicitly attest complete coverage')
  const root=snapshot.node??snapshot.root??snapshot
  if(root.id!==nodeId)throw Error('Snapshot root does not match nodeId')
  const nodes={};let count=0
  function visit(n,parentId=null,index=0){
    if(!n||typeof n!=='object'||typeof n.id!=='string'||!n.id||n.id.length>200||['__proto__','constructor','prototype'].includes(n.id))throw Error('Snapshot nodes require stable IDs')
    if(Object.hasOwn(nodes,n.id))throw Error('Snapshot contains duplicate node IDs')
    if(++count>1500)throw Error('Snapshot exceeds 1500 nodes')
    const {children,...properties}=n
    if(children!==undefined&&!Array.isArray(children))throw Error('Invalid children in design snapshot')
    if(Number.isInteger(n.childCount)&&n.childCount>(children?.length??0)&&!n.deduped)throw Error('Snapshot depth omitted children; capture the complete target')
    nodes[n.id]={parentId,index,properties:stable(properties)}
    for(const [i,child] of (children??[]).entries())visit(child,n.id,i)
  }
  visit(root)
  // Shared style/component tables are part of the baseline, not runtime metrics or timestamps.
  const tables={}
  for(const k of ['styles','sharedStyles','globalVars','components','variables','colorProfile'])if(snapshot[k]!==undefined)tables[k]=stable(snapshot[k])
  return {nodes:stable(nodes),tables}
}
function capturePolicy(snapshot,options) {
  if(!options||typeof options!=='object'||Array.isArray(options))throw Error('captureOptions must describe the actual snapshot request')
  for(const key of ['semantic','includeCss','dedupeStyles','dedupeComponents'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw Error('Capture option '+key+' must be boolean')
  if(snapshot.contextVersion!==undefined&&(!Number.isInteger(snapshot.contextVersion)||snapshot.contextVersion<1))throw Error('Invalid snapshot contextVersion')
  if(snapshot.source!==undefined&&(typeof snapshot.source!=='string'||snapshot.source.length>100))throw Error('Invalid snapshot source')
  if(snapshot.coverage?.scope!==undefined&&(typeof snapshot.coverage.scope!=='string'||snapshot.coverage.scope.length>100))throw Error('Invalid snapshot coverage scope')
  return stable({
    source:snapshot.source??null,
    contextVersion:snapshot.contextVersion??null,
    scope:snapshot.coverage?.scope??null,
    semantic:options.semantic??(snapshot.contextVersion!==undefined),
    includeCss:options.includeCss??false,
    dedupeStyles:options.dedupeStyles??true,
    dedupeComponents:options.dedupeComponents??false,
  })
}
function propertyChanges(before,after,path='',out=[]) {
  if(JSON.stringify(before)===JSON.stringify(after))return out
  if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object'){
    for(const key of [...new Set([...Object.keys(before),...Object.keys(after)])].sort())propertyChanges(before[key],after[key],path?path+'.'+key:key,out)
  } else out.push({property:path,before:before??null,after:after??null,beforePresent:before!==undefined,afterPresent:after!==undefined})
  return out
}
export function diffDesignSnapshots(before,after) {
  const added=[],removed=[],changed=[]
  for(const id of Object.keys(after.nodes))if(!Object.hasOwn(before.nodes,id))added.push({id,...after.nodes[id]})
  for(const id of Object.keys(before.nodes))if(!Object.hasOwn(after.nodes,id))removed.push({id,...before.nodes[id]})
  for(const id of Object.keys(after.nodes))if(Object.hasOwn(before.nodes,id)){
    const changes=propertyChanges(before.nodes[id],after.nodes[id]);if(changes.length)changed.push({id,changes})
  }
  const sharedChanges=propertyChanges(before.tables,after.tables)
  return {added,removed,changed,sharedChanges}
}
export async function designSync({workspace,fileKey,nodeId,snapshot,captureOptions={},action='compare',expectedRevision}={}) {
  validateIdentity(fileKey,nodeId)
  if(!['compare','create','update'].includes(action))throw Error('action must be compare, create or update')
  if(snapshot?.fileKey!==undefined&&snapshot.fileKey!==fileKey)throw Error('Snapshot file identity does not match bound fileKey')
  const content=normalize(snapshot,nodeId),policy=capturePolicy(snapshot,captureOptions),directory=await workspaceDirectory(workspace,'snapshots',action!=='compare')
  const name=hash(fileKey+'\0'+nodeId)+'.json',path=directory?join(directory,name):null
  const currentRevision=revisionOf({capturePolicy:policy,content})
  const validate=record=>{
    if(record===null)return
    if(record.formatVersion!==1||record.fileKey!==fileKey||record.nodeId!==nodeId||!record.content||!record.capturePolicy||record.revision!==revisionOf({capturePolicy:record.capturePolicy,content:record.content}))throw Error('Baseline provenance or format mismatch; do not silently replace it')
    if(JSON.stringify(stable(record.capturePolicy))!==JSON.stringify(policy))throw Error('Baseline capture policy is incompatible; use the original source, contextVersion and collection options before comparing or updating')
  }
  const make=()=>({formatVersion:1,fileKey,nodeId,capturePolicy:policy,revision:currentRevision,capturedAt:new Date().toISOString(),content})
  if(action==='compare'){
    const previous=path?await readStored(path):null;validate(previous)
    if(!previous)return {status:'baseline-missing',fileKey,nodeId,actionRequired:'create',capturePolicy:policy,complete:true}
    const changes=diffDesignSnapshots(previous.content,content)
    const hasChanges=Object.values(changes).some(a=>a.length)
    const result={status:hasChanges?'diff':'no-changes',fileKey,nodeId,baselineRevision:previous.revision,currentRevision,capturePolicy:policy,changes,complete:true}
    if(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES)throw Error('Diff exceeds output budget; compare a smaller complete section')
    return result
  }
  let previousRevision=null
  const record=await mutateStored(directory,name,previous=>{
    validate(previous);previousRevision=previous?.revision??null
    if(action==='create'&&previous)throw Error('A baseline already exists; compare first and explicitly update with expectedRevision')
    if(action==='update'&&(!previous||typeof expectedRevision!=='string'||previous.revision!==expectedRevision))throw Error('Baseline revision changed or missing; compare first and pass expectedRevision')
    return make()
  })
  return {status:action==='create'?'baseline-created':'baseline-updated',fileKey,nodeId,revision:record.revision,previousRevision,path,capturePolicy:policy,complete:true}
}
