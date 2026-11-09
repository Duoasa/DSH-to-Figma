import { constants } from 'node:fs'
import { open, realpath, lstat, rm } from 'node:fs/promises'
import { join, relative, isAbsolute, extname, basename, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { workspaceDirectory, readStored, mutateStored, revisionOf, boundedEntries } from './design-sync.mjs'

const SKIP=new Set(['node_modules','vendor','dist','build','coverage','output','tmp','target','.git','.figma','.next','.nuxt','.cache'])
const CODE=new Set(['.js','.jsx','.ts','.tsx','.vue','.svelte'])
const EXT=new Set([...CODE,'.css','.scss','.svg'])
const hash=s=>createHash('sha256').update(s).digest('hex')
const norm=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
const inside=(root,p)=>{const r=relative(root,p);return r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)}
const sensitive=name=>/(?:secret|credential|password|private[-_]?key|api[-_]?key|access[-_]?(?:key|token))/i.test(name)
const excluded=name=>name.startsWith('.')||SKIP.has(name)||sensitive(name)
function bound(n,fallback,min,max,label){n??=fallback;if(!Number.isInteger(n)||n<min||n>max)throw Error(label+' must be an integer from '+min+' to '+max);return n}
function allowedValue(raw){
  const v=raw.trim();if(v.length>150||/[{};\n]/.test(v)||/url\(|password|secret|token\s*=/i.test(v))return null
  return /^(?:#[a-f\d]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|vh|vw)?|(?:rgb|rgba|hsl|hsla)\([\d.,%\s/+\-a-z]+\)|var\(--[a-z\d_-]+\)|(?:transparent|inherit|currentColor|black|white))$/i.test(v)?v:null
}
async function safeRead(path,limit){
  const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0))
  try{const st=await fd.stat();if(!st.isFile()||st.size>limit)return null;const b=await fd.readFile();if(b.length>limit)return null;return b.toString('utf8')}finally{await fd.close()}
}
export async function scanProject(workspace,{maxFiles,maxBytes,query}={}) {
  maxFiles=bound(maxFiles,1000,1,5000,'maxFiles');maxBytes=bound(maxBytes,4*1024*1024,1024,16*1024*1024,'maxBytes')
  if(query!==undefined&&(typeof query!=='string'||query.length>200))throw Error('query must be at most 200 characters')
  const root=await realpath(workspace),queue=[{path:root,depth:0}],components=[],tokens=[],icons=[],omissions=[]
  let visited=0,filesRead=0,bytesRead=0,entriesSeen=0,complete=true
  const limitOutput=1000
  const add=(list,item)=>{if(list.length<limitOutput)list.push(item);else {complete=false;if(!omissions.includes('asset-limit'))omissions.push('asset-limit')}}
  while(queue.length){
    const dir=queue.shift();const stat=await lstat(dir.path)
    if(stat.isSymbolicLink()||!stat.isDirectory()||!inside(root,await realpath(dir.path)))throw Error('Project directory changed during scan')
    const inventory=await boundedEntries(dir.path,20000-entriesSeen)
    if(inventory.truncated){complete=false;omissions.push('entry-limit')}
    const entries=inventory.entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)
    for(const e of entries){
      if(++entriesSeen>20000){complete=false;omissions.push('entry-limit');queue.length=0;break}
      if(excluded(e.name)||e.isSymbolicLink())continue
      const path=join(dir.path,e.name)
      if(e.isDirectory()){if(dir.depth<12)queue.push({path,depth:dir.depth+1});else {complete=false;if(!omissions.includes('depth-limit'))omissions.push('depth-limit')}continue}
      if(!e.isFile()||!EXT.has(extname(e.name).toLowerCase()))continue
      if(++visited>maxFiles||bytesRead>=maxBytes){complete=false;omissions.push(visited>maxFiles?'file-limit':'byte-limit');queue.length=0;break}
      if(!inside(root,await realpath(path)))throw Error('Project source escapes workspace')
      const content=await safeRead(path,Math.min(256*1024,maxBytes-bytesRead))
      if(content===null){complete=false;if(!omissions.includes('oversized-file'))omissions.push('oversized-file');continue}
      filesRead++;bytesRead+=Buffer.byteLength(content)
      const sourcePath=relative(root,path).split(sep).join('/'),ext=extname(e.name).toLowerCase()
      if(ext==='.svg')add(icons,{id:'icon:'+sourcePath,name:basename(e.name,ext),sourcePath,evidence:'workspace-svg-file'})
      if(CODE.has(ext)){
        const names=new Set()
        for(const match of content.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let)\s+([A-Z][A-Za-z0-9_]*)/g))names.add(match[1])
        if(['.vue','.svelte'].includes(ext)&&/^[A-Z]/.test(e.name))names.add(basename(e.name,ext))
        for(const name of names)add(components,{id:'component:'+sourcePath+'#'+name,name,sourcePath,exportName:name,evidence:['.vue','.svelte'].includes(ext)?'component-file-name':'export-declaration-candidate',verified:false})
      }
      if(ext==='.css'||ext==='.scss')for(const m of content.matchAll(/(?:^|[\s{;])(--[\w-]+|\$[\w-]+)\s*:\s*([^;{}]+);/g)){
        const value=sensitive(m[1])?null:allowedValue(m[2]);if(value!==null)add(tokens,{id:'token:'+sourcePath+'#'+m[1],name:m[1],value,sourcePath,evidence:'style-variable-literal',verified:false})
      }
    }
    if(inventory.truncated){queue.length=0;break}
  }
  const q=query?.toLowerCase();const select=items=>q?items.filter(x=>x.name.toLowerCase().includes(q)||x.sourcePath.toLowerCase().includes(q)):items
  return {formatVersion:1,root,components:select(components),tokens:select(tokens),icons:select(icons),coverage:{complete,filesRead,bytesRead,entriesSeen,omissions:[...new Set(omissions)],scope:'Allowlisted source/style/SVG files only; hidden/build/vendor directories and symlinks skipped. Export scanning is heuristic, not semantic type analysis.'}}
}
export function matchProjectAssets(index,{components=[],tokens=[],icons=[],mappings=[]}={}) {
  if(!index||!Array.isArray(index.components)||!Array.isArray(index.tokens)||!Array.isArray(index.icons))throw Error('A project index is required')
  if(!Array.isArray(mappings)||mappings.length>500)throw Error('Provide at most 500 validated project mappings')
  const declared=new Map()
  for(const mapping of mappings){
    if(!mapping||typeof mapping.sourceExists!=='boolean'||typeof mapping.stale!=='boolean'||mapping.evidence!=='explicit-user-mapping')throw Error('Use validated projectMappings inventory for matching')
    const key=mappingKey(mapping.kind,mapping.figmaKey)
    validateMapping(mapping,key)
    if(declared.has(key))throw Error('Duplicate explicit mapping identity')
    declared.set(key,mapping)
  }
  const result={components:[],tokens:[],icons:[],coverage:index.coverage}
  for(const [kind,items]of Object.entries({components,tokens,icons})){
    if(!Array.isArray(items)||items.length>200)throw Error('Provide at most 200 '+kind+' queries')
    for(const item of items){
      if(!item||typeof item.name!=='string'||!norm(item.name)||item.name.length>200)throw Error('Asset query requires a meaningful name up to 200 characters')
      const mapping=item.id===undefined?undefined:declared.get(mappingKey(kind.slice(0,-1),item.id))
      const matches=index[kind].map(c=>{const exact=norm(item.name)===norm(c.name);const value=kind==='tokens'&&item.value!==undefined&&String(item.value).trim()===c.value;const related=!exact&&(norm(c.name).includes(norm(item.name))||norm(item.name).includes(norm(c.name)));return {candidate:c,score:exact?0.8:value?0.5:related?0.3:0,matchedBy:[...(exact?['normalized-name']:[]),...(value?['value']:[]),...(related?['partial-name']:[])]}}).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.candidate.id.localeCompare(b.candidate.id))
      const candidates=matches.slice(0,5),mapped=mapping?.sourceExists===true&&mapping.stale===false,ambiguous=!mapped&&candidates.length>1&&candidates[0].score===candidates[1].score
      result[kind].push({
        id:item.id??null,name:item.name,
        status:mapped?'mapped':mapping?'stale-mapping':candidates.length?'candidates':'unmapped',
        basis:mapped?'explicit-user-mapping':'heuristic',
        ...(mapping?{mapping}:{}),
        ambiguous,candidates,moreCandidates:matches.length>5,verified:false,
        hint:mapped?'The explicit user mapping takes precedence; source existence does not verify rendered equivalence. Candidates are optional alternatives.':mapping?'The saved mapping source is stale or unavailable. Repair it explicitly; heuristic candidates do not replace it.':'Candidates require semantic and rendered verification; equal names or values are not established bindings.',
      })
    }
  }
  return result
}
function mappingKey(kind,figmaKey){if(!['component','token','icon'].includes(kind)||typeof figmaKey!=='string'||!figmaKey.trim()||figmaKey.length>300)throw Error('Mapping requires kind component/token/icon and a nonempty figmaKey');return hash(kind+'\0'+figmaKey)+'.json'}
function validateMapping(record,name){
  if(record===null)return
  const value={kind:record.kind,figmaKey:record.figmaKey,sourcePath:record.sourcePath,...(record.exportName?{exportName:record.exportName}:{})}
  if(record.formatVersion!==1||mappingKey(record.kind,record.figmaKey)!==name||typeof record.sourcePath!=='string'||record.revision!==revisionOf(value))throw Error('Invalid mapping record')
}
async function mappingFiles(directory){
  const inventory=await boundedEntries(directory,1000)
  if(inventory.truncated)throw Error('Mapping storage directory exceeds inventory budget')
  return inventory.entries.map(e=>e.name).filter(x=>/^[a-f0-9]{64}\.json$/.test(x)).sort()
}
async function sourceWithin(workspace,sourcePath){
  if(typeof sourcePath!=='string'||!sourcePath||isAbsolute(sourcePath)||sourcePath.split(/[\\/]/).some(p=>p==='..'||excluded(p)))throw Error('Mapping source must be an allowed workspace-relative path')
  const root=await realpath(workspace),path=resolve(root,sourcePath)
  if(!EXT.has(extname(path).toLowerCase())||!inside(root,path))throw Error('Mapping source extension is not allowed')
  let cursor=root
  for(const part of relative(root,path).split(sep)){cursor=join(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw Error('Mapping source cannot be a symlink')}
  if(!(await lstat(path)).isFile()||!inside(root,await realpath(path)))throw Error('Mapping source must be a regular workspace file')
  return relative(root,path).split(sep).join('/')
}
function checkMappingRevision(old,expectedRevision){
  if(old&&old.revision!==expectedRevision)throw Error('Mapping revision required or changed; list first and pass expectedRevision')
  if(!old&&expectedRevision!==undefined)throw Error('Mapping no longer exists')
}
function checkExportName(exportName){if(exportName!==undefined&&(typeof exportName!=='string'||!/^[A-Za-z_$][\w$-]{0,199}$/.test(exportName)))throw Error('Invalid exportName')}
function mappingRecord({kind,figmaKey,sourcePath,exportName}){
  const value={kind,figmaKey,sourcePath,...(exportName?{exportName}:{})}
  return {formatVersion:1,...value,revision:revisionOf(value),updatedAt:new Date().toISOString(),evidence:'explicit-user-mapping'}
}
async function mappingWriteLock(directory,operation){
  const lock=join(directory,'.mapping-write.lock');let fd
  try{fd=await open(lock,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Object.assign(Error('Workspace mappings are being modified; retry after the current operation'),{code:'MAPPING_WRITE_BUSY'});throw e}
  try{return await operation()}finally{await fd.close();await rm(lock,{force:true})}
}
async function setManyMappings(workspace,directory,mappings){
  if(!Array.isArray(mappings)||!mappings.length||mappings.length>50)throw Error('set_many requires 1–50 explicit mappings')
  const prepared=[],seen=new Set()
  // Complete preflight runs while all plugin-owned mapping writers share the same lock.
  for(const item of mappings){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Each mapping must be an object')
    const {kind,figmaKey,exportName,expectedRevision}=item,name=mappingKey(kind,figmaKey)
    if(seen.has(name))throw Error('Duplicate mapping identity in set_many: '+kind+' '+figmaKey)
    seen.add(name);checkExportName(exportName)
    const sourcePath=await sourceWithin(workspace,item.sourcePath),old=await readStored(join(directory,name),10000)
    validateMapping(old,name);checkMappingRevision(old,expectedRevision)
    prepared.push({kind,figmaKey,exportName,expectedRevision,sourcePath,name,isNew:old===null})
  }
  if((await mappingFiles(directory)).length+prepared.filter(item=>item.isNew).length>500)throw Error('Mapping limit reached (500)')
  const applied=[]
  for(const [index,item] of prepared.entries()){
    let writeStarted=false
    try{
      // External filesystem changes are still possible; never silently ignore them.
      await sourceWithin(workspace,item.sourcePath)
      writeStarted=true
      const record=await mutateStored(directory,item.name,old=>{validateMapping(old,item.name);checkMappingRevision(old,item.expectedRevision);return mappingRecord(item)})
      applied.push(record)
    }catch(error){
      return {ok:false,action:'set_many',atomic:false,applied,failed:{index,kind:item.kind,figmaKey:item.figmaKey,writeOutcome:writeStarted?'unconfirmed':'not-started',error:String(error?.message??error).slice(0,2000)},notAttempted:prepared.slice(index+1).map(({kind,figmaKey})=>({kind,figmaKey})),requiresReview:true,scope:'Explicit local mappings only; applied records were not undone or published. Inspect the failed identity before retrying.'}
    }
  }
  return {ok:true,action:'set_many',atomic:false,applied,scope:'Explicit local mappings; not published Code Connect'}
}
export async function projectMappings(workspace,{action='list',kind,figmaKey,sourcePath,exportName,expectedRevision,mappings}={}) {
  if(!['list','set','set_many','remove'].includes(action))throw Error('Unknown mapping action')
  const name=['list','set_many'].includes(action)?null:mappingKey(kind,figmaKey),directory=await workspaceDirectory(workspace,'mappings',action==='set'||action==='set_many')
  if(action==='list'){
    if(!directory)return {mappings:[],complete:true}
    const files=await mappingFiles(directory);if(files.length>500)throw Error('Mapping inventory exceeds 500 records')
    const mappings=[]
    for(const file of files){const r=await readStored(join(directory,file),10000);if(!r)continue;validateMapping(r,file);let valid=true;try{await sourceWithin(workspace,r.sourcePath)}catch{valid=false}mappings.push({...r,sourceExists:valid,stale:!valid})}
    return {mappings,complete:true,scope:'Explicit local mappings; not published Code Connect'}
  }
  if(!directory)throw Error('Mapping not found')
  try{return await mappingWriteLock(directory,async()=>{
    if(action==='set_many')return setManyMappings(workspace,directory,mappings)
    if(action==='set'){sourcePath=await sourceWithin(workspace,sourcePath);checkExportName(exportName)}
    const out=await mutateStored(directory,name,async old=>{
      validateMapping(old,name);checkMappingRevision(old,expectedRevision)
      if(action==='remove'){if(!old)throw Error('Mapping not found');return null}
      if(!old&&(await mappingFiles(directory)).length>=500)throw Error('Mapping limit reached (500)')
      return mappingRecord({kind,figmaKey,sourcePath,exportName})
    })
    return action==='remove'?{removed:figmaKey,kind}:out
  })}catch(error){
    if(action==='set_many'&&error.code==='MAPPING_WRITE_BUSY')return {ok:false,action,atomic:false,applied:[],failed:{stage:'workspace-lock',writeOutcome:'not-started',error:error.message},requiresReview:false,scope:'No mapping writes were started; an existing writer owns the workspace lock'}
    throw error
  }
}
