import {randomUUID} from 'node:crypto'

export const FIGMA_USE_CONTRACT=Object.freeze({
  baseline:'Codex Figma plugin 16.0.0',observedAt:'2026-10-28',featureVersion:3,
  helpers:['query','matches','set','createAutoLayout','screenshot','tree','findPlacement','io.write','placeholder'],
  pageContext:'first-page-per-call',pageSwitchesPerCall:1,parallelPages:false,
  placeholder:'companion-progress; no canvas shimmer',findPlacement:'native when available; right-of-content fallback',
  transactions:false,cloudSessions:false,cloudLibrarySearch:false,
})

export class LocalFigmaTasks {
  constructor(){this.owners=new Map()}
  close(owner){this.owners.delete(owner)}
  clear(){this.owners.clear()}
  context(owner,workspace,document,args={}){
    const fileKey=document.fileKey??`local:${document.connectionId}`
    if(args.fileKey!==undefined&&args.fileKey!==fileKey)throw new Error('fileKey does not match the selected document. Use figma_select_document explicitly; no script was dispatched.')
    for(const key of ['description','skillNames'])if(args[key]!==undefined&&(typeof args[key]!=='string'||args[key].length>4000))throw new Error(key+' must be a string of at most 4000 characters')
    let task
    if(args.sessionId!==undefined){
      task=this.owners.get(owner)?.get(args.sessionId)
      if(!task||task.workspace!==workspace)throw new Error('Unknown sessionId for this DSH Work session/workspace; call create_session first')
    }
    return {fileKey,task}
  }
  create(owner,workspace,document,args){
    const {fileKey}=this.context(owner,workspace,document,args)
    if(typeof args.description!=='string'||!args.description.trim())throw new Error('create_session requires a description')
    let tasks=this.owners.get(owner)
    if(!tasks){tasks=new Map();this.owners.set(owner,tasks)}
    if(tasks.size>=100)throw new Error('Reuse an existing Figma task session; maximum 100 per Work session')
    const sessionId=randomUUID(),task={workspace,description:args.description,files:new Set([fileKey]),calls:0}
    tasks.set(sessionId,task)
    return {sessionId,fileKey,description:task.description,scope:'local DSH Work task; not a Figma cloud recording'}
  }
}
