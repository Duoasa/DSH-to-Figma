import {createHash,randomUUID} from 'node:crypto'
import {mkdir,readdir,lstat,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {readFileSync,lstatSync} from 'node:fs'
import {privateDirectory,privateJson} from './storage.mjs'

export const MAX_SPEC_BYTES=512*1024
const revision=markdown=>createHash('sha256').update(markdown).digest('hex')
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
function content(markdown){
  if(typeof markdown!=='string'||markdown.includes('\0')||Buffer.byteLength(markdown)>MAX_SPEC_BYTES)throw fail('Markdown must be UTF-8 text without NUL, at most 512 KiB')
  // Reject unpaired UTF-16 surrogates instead of silently changing them on disk/export.
  if(Buffer.from(markdown).toString('utf8')!==markdown)throw fail('Invalid Unicode in Markdown')
  return markdown
}
const validName=name=>typeof name==='string'&&name.length<=180&&!/[\\/\x00-\x1f\x7f]/.test(name)&&/^.+\.(md|markdown)$/i.test(name)
function validateDoc(doc,specId){
  if(!doc||doc.specId!==specId||!validName(doc.name)||typeof doc.updatedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(doc.updatedAt)||!Number.isFinite(Date.parse(doc.updatedAt)))throw fail('Invalid spec metadata')
  content(doc.markdown)
  return doc
}
const summary=doc=>({specId:doc.specId,name:doc.name,revision:revision(doc.markdown),updatedAt:doc.updatedAt,bytes:Buffer.byteLength(doc.markdown),source:'local-markdown-copy',originalFileUpdated:false})
export class LocalSpecs {
  constructor(home){this.home=home;this.gate=Promise.resolve()}
  exclusive(run){const next=this.gate.then(run);this.gate=next.catch(()=>{});return next}
  // Prompt providers are synchronous; read only bounded, validated metadata on each assembly.
  defaultState(){
    try{
      const root=join(this.home,'figma'),path=join(root,'specs-default.json')
      const read=(path,max)=>{const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size>max)throw Error('Invalid default storage');return JSON.parse(readFileSync(path,'utf8'))}
      try{if(lstatSync(root).isSymbolicLink())throw Error('Invalid state directory')}catch(e){if(e.code==='ENOENT')return {state:'none',spec:null};throw e}
      let selected
      try{selected=read(path,4096)}catch(e){if(e.code==='ENOENT')return {state:'none',spec:null};throw e}
      if(typeof selected.selectionRevision!=='string'||!/^[-a-f0-9]{36}$/.test(selected.selectionRevision))throw Error('Invalid selection revision')
      const meta={selectionRevision:selected.selectionRevision}
      if(selected.specId===null)return {state:'none',spec:null,...meta}
      if(typeof selected.specId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(selected.specId))throw Error('Invalid selection')
      let doc
      try{
        if(lstatSync(join(root,'specs')).isSymbolicLink())throw Error('Invalid specs directory')
        doc=read(join(root,'specs',selected.specId+'.json'),MAX_SPEC_BYTES*6+4096)
      }catch(e){if(e.code==='ENOENT')return {state:'missing',spec:null,specId:selected.specId,...meta};throw e}
      validateDoc(doc,selected.specId)
      return {state:'active',spec:summary(doc),...meta}
    }catch{return {state:'unavailable',spec:null}}
  }
  setDefault({specId}){return this.exclusive(async()=>{
    if(specId!==null)await this.load(specId)
    await privateJson(join(await privateDirectory(this.home),'specs-default.json'),{specId,selectionRevision:randomUUID()})
    return {defaultSpec:this.defaultState()}
  })}
  async directory(){const path=join(await privateDirectory(this.home),'specs');await mkdir(path,{recursive:true,mode:0o700});if((await lstat(path)).isSymbolicLink())throw fail('Specs directory cannot be a symlink');return path}
  async load(specId){
    if(typeof specId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(specId))throw fail('Invalid specId')
    const path=join(await this.directory(),specId+'.json');let info
    try{info=await lstat(path)}catch(e){if(e.code==='ENOENT')throw fail('Local spec not found',404);throw e}
    if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_SPEC_BYTES*6+4096)throw fail('Invalid spec storage')
    return validateDoc(JSON.parse(await readFile(path,'utf8')),specId)
  }
  async storedNames(){return (await readdir(await this.directory())).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))}
  async list(){
    const names=await this.storedNames(),specs=[],unreadableSpecs=[]
    for(const name of names){
      const specId=name.slice(0,-5)
      try{specs.push(summary(await this.load(specId)))}
      catch{unreadableSpecs.push({specId,error:'Stored copy is unreadable; preserved on disk. Reimport the source or restore a backup.'})}
    }
    return {defaultSpec:this.defaultState(),specs:specs.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),unreadableSpecs,source:'local-markdown-copy',originalFileUpdated:false}
  }
  import({name,markdown}){return this.exclusive(async()=>{
    if(typeof name!=='string'||name.length>180||/[\\/\x00-\x1f\x7f]/.test(name)||!/^.+\.(md|markdown)$/i.test(name))throw fail('Choose a .md or .markdown filename without a path')
    content(markdown)
    if((await this.storedNames()).length>=100)throw fail('Local spec limit reached (100)')
    const doc={specId:randomUUID(),name,markdown:markdown.replace(/^\uFEFF/,''),updatedAt:new Date().toISOString()}
    await privateJson(join(await this.directory(),doc.specId+'.json'),doc);return summary(doc)
  })}
  async read({specId,offset=0,maxLines=100}){
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(maxLines)||maxLines<1||maxLines>200)throw fail('Use offset >= 0 and maxLines from 1 to 200')
    const doc=await this.load(specId),lines=doc.markdown.split('\n'),selected=[];let bytes=0
    for(const line of lines.slice(offset,offset+maxLines)){
      if(bytes+Buffer.byteLength(line)+1>65536){if(!selected.length)throw fail('A line exceeds the 64 KiB read budget; split it in the source file and reimport');break}
      selected.push(line);bytes+=Buffer.byteLength(line)+1
    }
    const next=offset+selected.length
    return {...summary(doc),markdown:selected.join('\n'),offset,linesReturned:selected.length,totalLines:lines.length,hasMore:next<lines.length,...(next<lines.length?{nextOffset:next}:{})}
  }
  edit({specId,expectedRevision,edits}){return this.exclusive(async()=>{
    const doc=await this.load(specId)
    if(expectedRevision!==revision(doc.markdown))throw fail('Local spec changed. Read it again and use its current revision; no edits were applied.',409)
    if(!Array.isArray(edits)||!edits.length||edits.length>50)throw fail('Provide 1–50 exact edits')
    let markdown=doc.markdown
    for(const edit of edits){
      if(typeof edit.oldText!=='string'||!edit.oldText||typeof edit.newText!=='string')throw fail('Each edit needs nonempty oldText and string newText')
      const at=markdown.indexOf(edit.oldText)
      if(at<0||markdown.indexOf(edit.oldText,at+1)>=0)throw fail('oldText must match exactly once; no edits were applied.',409)
      markdown=markdown.slice(0,at)+edit.newText+markdown.slice(at+edit.oldText.length)
    }
    content(markdown)
    const updated={...doc,markdown,updatedAt:new Date().toISOString()}
    await privateJson(join(await this.directory(),specId+'.json'),updated)
    return {...summary(updated),editsApplied:edits.length}
  })}
  async export({specId}){const doc=await this.load(specId);return {...summary(doc),markdown:doc.markdown}}
}
