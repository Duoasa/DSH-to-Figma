import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { capabilityReport } from './capabilities.mjs'
import { metadataInspection, recoveryHint } from './recovery.mjs'

// Status carries only a small reference descriptor, never its text or preview.
function designReference(value){
  if(!value||!['frame','spec'].includes(value.kind)||typeof value.name!=='string')return null
  const result={kind:value.kind,name:value.name.slice(0,500),state:['bound','missing','invalid'].includes(value.state)?value.state:'bound'}
  for(const key of ['nodeId','pageId','revision'])if(typeof value[key]==='string')result[key]=value[key].slice(0,200)
  return result
}
const MAX_BODY = 24 * 1024 * 1024
const HISTORY_TTL_MS = 10 * 60 * 1000
const HISTORY_LIMIT = 1000
const RESULT_LIMIT = 1024 * 1024
const RESULT_CACHE_LIMIT = 8 * 1024 * 1024
const PRIVATE_TRANSFER_METHODS = new Set(['read_export_chunk','release_export'])
const EXPORT_MIME = {MP4:'video/mp4',GIF:'image/gif',WEBM:'video/webm'}
function exportDescriptor(value){
  if(!value||typeof value.transferId!=='string'||!/^export-[a-z0-9-]{1,150}$/.test(value.transferId)||!Object.hasOwn(EXPORT_MIME,value.format)||value.mimeType!==EXPORT_MIME[value.format]||!Number.isInteger(value.byteLength)||value.byteLength<1||value.byteLength>256*1024*1024||!Number.isInteger(value.chunkSize)||value.chunkSize<1||value.chunkSize>512*1024)return null
  if(typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())return null
  if(value.nodeId!==undefined&&(typeof value.nodeId!=='string'||value.nodeId.length>512))return null
  if(value.name!==undefined&&(typeof value.name!=='string'||value.name.length>200))return null
  return {transferId:value.transferId,format:value.format,mimeType:value.mimeType,byteLength:value.byteLength,chunkSize:value.chunkSize,expiresAt:new Date(Math.min(Date.parse(value.expiresAt),Date.now()+HISTORY_TTL_MS)).toISOString(),...(value.nodeId!==undefined?{nodeId:value.nodeId}:{}),...(value.name!==undefined?{name:value.name}:{})}
}
const ORIGINS = new Set(['null', 'https://www.figma.com', 'https://figma.com'])
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const failure = (message, safeToRetryWithoutCanvasRead = false) => Object.assign(new Error(message), {safeToRetryWithoutCanvasRead})
const json = (res, code, value) => { if (!res.destroyed) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) } }
async function body(req) {
  let size = 0; const chunks = []
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('Body too large'); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

/** Only Figma's sandbox executes scripts. This process never evals canvas code. */
export class LocalBridge {
  constructor({ token, port = 3055, timeoutMs = 120000 }) {
    this.token = token; this.port = port; this.timeoutMs = timeoutMs
    this.documents = new Map(); this.operations = new Map(); this.operationCacheBytes = 0; this.stopped = false
  }
  async start() {
    this.server = createServer((req, res) => this.route(req, res).catch(() => json(res, 400, { error: 'Invalid bridge request' })))
    this.server.requestTimeout = 30000
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, '127.0.0.1', resolve) })
    this.port = this.server.address().port
    this.timer = setInterval(() => {
      for (const doc of this.documents.values()) if (Date.now() - doc.lastSeen > 45000) this.remove(doc.id)
      this.pruneOperations()
    }, 5000); this.timer.unref()
    return this
  }
  updateReference(doc,value,serial){
    const ordered=Number.isSafeInteger(serial)&&serial>=0
    if(doc.referenceSerial!==null&&doc.referenceSerial!==undefined&&(!ordered||serial<doc.referenceSerial))return
    doc.designReference=designReference(value)
    if(ordered)doc.referenceSerial=serial
  }
  list() { return [...this.documents.values()].map(d => ({ connectionId: d.id, name: d.name, editorType: d.editorType, fileKey: d.fileKey, busy: !!d.active, needsInspection: d.uncertain, featureVersion: d.featureVersion, companionVersion: d.companionVersion, capabilities:capabilityReport(d.capabilities),designReference:d.designReference??null })) }
  async route(req, res) {
    if (this.stopped) return json(res, 503, { error: 'Bridge stopped' })
    if (![ `127.0.0.1:${this.port}`, `localhost:${this.port}` ].includes(req.headers.host)) return json(res, 403, { error: 'Host rejected' })
    const origin = req.headers.origin
    if (origin && !ORIGINS.has(origin)) return json(res, 403, { error: 'Origin rejected' })
    if (origin) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin') }
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'POST')
      res.setHeader('access-control-allow-headers', 'Authorization, Content-Type')
      res.setHeader('access-control-allow-private-network', 'true')
      res.writeHead(204); return res.end()
    }
    if (!equal(req.headers.authorization, `Bearer ${this.token}`)) return json(res, 401, { error: 'Pairing token required' })
    if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
    const data = await body(req)
    if (req.url === '/connect') {
      const clientId = typeof data.clientId === 'string' && /^[a-f0-9-]{36}$/.test(data.clientId) ? data.clientId : null
      const existing = clientId && [...this.documents.values()].find(doc => doc.clientId === clientId)
      if (existing) { existing.lastSeen = Date.now(); if(Object.hasOwn(data,'designReference'))this.updateReference(existing,data.designReference,data.referenceSerial); return json(res, 200, { connectionId: existing.id }) }
      if (this.documents.size >= 20) return json(res, 429, { error: 'Too many open documents' })
      if (typeof data.name !== 'string' || !['figma', 'figjam', 'slides', 'buzz'].includes(data.editorType)) throw new Error('Invalid document')
      const doc = { id: randomUUID(), clientId, name: data.name.slice(0, 200), editorType: data.editorType,
        fileKey: typeof data.fileKey === 'string' && /^[A-Za-z0-9]{5,128}$/.test(data.fileKey) ? data.fileKey : null,
        featureVersion: Number.isInteger(data.featureVersion) && data.featureVersion >= 0 && data.featureVersion <= 100 ? data.featureVersion : 0,
        companionVersion: typeof data.companionVersion === 'string' && data.companionVersion.length <= 64 && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(data.companionVersion) ? data.companionVersion : null,
        capabilities:capabilityReport(data.capabilities),designReference:designReference(data.designReference),referenceSerial:Number.isSafeInteger(data.referenceSerial)&&data.referenceSerial>=0?data.referenceSerial:null,
        lastSeen: Date.now(), queue: [], active: null, poll: null, uncertain: false, uncertainIds:new Set() }
      this.documents.set(doc.id, doc)
      return json(res, 200, { connectionId: doc.id })
    }
    const doc = this.documents.get(data.connectionId)
    if (!doc) return json(res, 404, { error: 'Document disconnected; reconnect and select it again' })
    doc.lastSeen = Date.now()
    if (req.url === '/reference') {this.updateReference(doc,data.designReference,data.referenceSerial);return json(res,200,{updated:true})}
    if (req.url === '/heartbeat') {if(Object.hasOwn(data,'designReference'))this.updateReference(doc,data.designReference,data.referenceSerial);return json(res, 200, { connected: true })}
    if (req.url === '/disconnect') { this.remove(doc.id); return json(res, 200, { disconnected: true }) }
    if (req.url === '/poll') {
      if (doc.poll) return json(res, 409, { error: 'A poll is already pending' })
      const timer = setTimeout(() => { if (doc.poll?.res === res) { doc.poll = null; json(res, 200, { idle: true }) } }, 20000)
      doc.poll = { res, timer }
      res.once('close', () => { if (doc.poll?.res === res) doc.poll = null; clearTimeout(timer) })
      this.dispatch(doc); return
    }
    if (req.url === '/result') {
      const job = doc.active
      if (!job || data.id !== job.id) return json(res, 409, { error: 'Unknown or already consumed operation' })
      doc.active = null
      if(data.ok===true&&['get_design_reference','set_design_reference','clear_design_reference'].includes(job.method))this.updateReference(doc,data.result?.value?.reference,data.result?.referenceSerial)
      const record=this.operations.get(job.id)
      if(record){
        record.state=data.ok===true?'completed':'failed';record.finishedAt=Date.now();record.expiresAt=record.finishedAt+HISTORY_TTL_MS
        record.lateResult=job.settled;record.error=data.ok===true?null:String(data.error||'Figma operation failed').slice(0,2000)
        record.resultStage='native'
        if(data.ok===true&&job.method==='export_video'&&data.result?.value?.transfer){
          const descriptor=exportDescriptor(data.result.value.transfer)
          if(descriptor){this.cacheOperation(record,{pendingExport:descriptor});record.outputState='pending';record.resultUnavailableReason='host-transfer-pending'}
          else {this.clearOperationCache(record,'invalid-export-descriptor');record.outputState='unavailable'}
        }
        else if(data.ok===true)this.cacheOperation(record,{result:data.result??null},data.result?.assets?.length?'external-assets':data.result?.value?.transfer?'ephemeral-transfer':null)
        else this.cacheOperation(record,{failureDetails:{...(data.journal?{journal:data.journal}:{}),...(data.affected?{affected:data.affected}:{}),...(data.batchResult?{batchResult:data.batchResult}:{}),...(data.createdNodeIds?{createdNodeIds:data.createdNodeIds}:{}),...(data.cleanup?{cleanup:data.cleanup}:{}),safeToRetryWithoutCanvasRead:!job.mutation||doc.featureVersion>=3&&data.safeToRetryWithoutCanvasRead===true}})
      }
      if (!job.settled) {
        if (data.ok === true) {
          if (job.method === 'get_capabilities') doc.capabilities = capabilityReport(data.result?.value)
          if (doc.uncertain && job.method === 'get_metadata') {
            const inspection=metadataInspection(job.args,data.result?.value)
            if(doc.active?.mutation){inspection.complete=false;inspection.reason='write-still-running'}
            const variableWrites=[...doc.uncertainIds].some(id=>['create_variables','add_variable_modes'].includes(this.operations.get(id)?.method))
            if(variableWrites){inspection.complete=false;inspection.reason='variable-resources-required';inspection.hint='Read affected collections with get_variable_defs({collectionIds, allVariables:true}), including values, without pagination.'}
            if(inspection.complete){doc.uncertain=false;doc.uncertainIds.clear()}
            if(data.result&&typeof data.result==='object')data.result.recovery={cleared:inspection.complete,needsInspection:doc.uncertain,...inspection,
              ...(inspection.complete?{scope:'Returned subtree only; reconcile any other affected nodes and variable/component resources before continuing.'}:{})}
          }
          if(doc.uncertain&&job.method==='get_variable_defs'){
            const value=data.result?.value,full=job.args.profile!=='summary'&&!job.args.collectionsOnly&&job.args.offset===undefined&&job.args.limit===undefined&&!job.args.ids&&!job.args.modeIds&&!job.args.query&&!job.args.type&&!job.args.nodeId&&!value?.truncated&&!value?.pagination?.hasMore&&Array.isArray(value?.variables)&&Array.isArray(value?.collections)
            let cleared=0
            if(full)for(const id of doc.uncertainIds){const operation=this.operations.get(id);if(['create_variables','add_variable_modes'].includes(operation?.method)&&value.collections.some(c=>c.id===operation.collectionId)){doc.uncertainIds.delete(id);cleared++}}
            doc.uncertain=doc.uncertainIds.size>0
            if(data.result)data.result.recovery={cleared:!doc.uncertain,needsInspection:doc.uncertain,reconciledVariableOperations:cleared,scope:'Returned collection values only; unrelated canvas writes remain protected.'}
          }
          job.finish(null, data.result)
        } else {
          const safe = !job.mutation || doc.featureVersion >= 3 && data.safeToRetryWithoutCanvasRead === true
          if (job.mutation && !safe) {doc.uncertain = true;doc.uncertainIds.add(job.id)}
          const error=failure(`${String(data.error || 'Figma operation failed').slice(0, 2000)}; ${safe?'correct the error and retry':'inspect the canvas before retrying'}`,safe)
          for(const key of ['journal','affected','failureClass','cleanup','executionState'])if(data[key])error[key]=data[key]
          if(data.batchResult)error.batchResult=data.batchResult
          if(data.createdNodeIds)error.createdNodeIds=data.createdNodeIds
          if(doc.uncertain)error.recovery={needsInspection:true,hint:recoveryHint}
          job.finish(error)
        }
      }
      json(res, 200, { accepted: true }); this.dispatch(doc); return
    }
    json(res, 404, { error: 'Unknown route' })
  }
  dispatch(doc) {
    if (doc.active || !doc.poll) return
    let job
    while ((job = doc.queue.shift())) {
      if (job.settled) continue
      if (doc.uncertain && job.mutation && !job.recoveryOf) { job.finish(Object.assign(new Error('Previous operation outcome is uncertain. '+recoveryHint),{safeToRetryWithoutCanvasRead:true,executionState:'not-started',recovery:{needsInspection:true,hint:recoveryHint},reconcileOperationId:[...doc.uncertainIds].find(id=>this.operations.get(id)?.owner===job.owner)})); continue }
      doc.active = job; job.dispatched = true; job.dispatchedAt = performance.now();const record=this.operations.get(job.id);if(record)record.state='running'
      const poll = doc.poll; doc.poll = null; clearTimeout(poll.timer)
      json(poll.res, 200, { id: job.id, method: job.method, args: job.args }); return
    }
  }
  call(id, method, args, { signal, mutation = false, inspect = false, onMetric, operationId = randomUUID(), owner, recoveryOf } = {}) {
    const doc = this.documents.get(id)
    if (this.stopped || !doc) return Promise.reject(new Error('Figma document is not connected'))
    if (doc.queue.length >= 30) return Promise.reject(new Error('Figma queue is full'))
    if (Buffer.byteLength(JSON.stringify(args)) > MAX_BODY - 1024) return Promise.reject(new Error('Figma request is too large'))
    return new Promise((resolve, reject) => {
      if(recoveryOf){const original=this.operations.get(recoveryOf);if(method!=='rollback'||original?.owner!==owner||original?.documentId!==id||original?.state!=='failed'||original?.method!=='use_figma')return reject(new Error('Invalid cleanup recovery scope'))}
      const privateTransfer=PRIVATE_TRANSFER_METHODS.has(method)
      if(this.operations.has(operationId)||this.liveOperationIds().has(operationId))return reject(new Error('Operation ID already exists; inspect status instead of replaying'))
      this.pruneOperations(privateTransfer?HISTORY_LIMIT:HISTORY_LIMIT-1)
      if(!privateTransfer){
        if(this.operations.size>=HISTORY_LIMIT)return reject(new Error('Operation history is full of active operations; wait for completion'))
        this.operations.set(operationId,{operationId,documentId:id,owner,method,...(args.collectionId?{collectionId:args.collectionId}:{}),state:'queued',createdAt:Date.now(),expiresAt:null,resultAvailable:false})
      }
      const job = { id: operationId, owner, method, args, mutation, inspect, recoveryOf, settled: false, dispatched: false, queuedAt: performance.now() }
      let timer
      const cancel = () => {
        if (job.dispatched && mutation) {doc.uncertain = true;doc.uncertainIds.add(job.id)}
        job.finish(failure(job.dispatched ? 'Figma operation interrupted; its outcome may be unknown. Do not replay. Wait for completion and inspect the canvas.' : 'Figma operation canceled before dispatch',!job.dispatched&&!doc.uncertain))
      }
      job.finish = (error, result) => {
        if (job.settled) return
        const record=this.operations.get(job.id)
        if(error){error.executionState??=job.dispatched&&!job.mutation?'read-only':job.dispatched?(record?.state==='failed'?(error.safeToRetryWithoutCanvasRead?'not-started':'partial-or-unknown'):'unknown'):'not-started';if(!job.mutation)error.safeToRetryWithoutCanvasRead=true;error.operationId=job.id;error.message+=' [operationId='+job.id+']';if(record&&!['completed','failed'].includes(record.state)){record.state=job.dispatched?'unknown':'canceled';record.callerFinishedAt=Date.now();record.error=String(error.message).slice(0,2000);record.expiresAt=job.dispatched?null:record.callerFinishedAt+HISTORY_TTL_MS}}
        job.settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel)
        if (!job.dispatched) doc.queue = doc.queue.filter(other => other !== job)
        const finishedAt = performance.now()
        try { onMetric?.({queueMs:(job.dispatchedAt??finishedAt)-job.queuedAt,bridgeMs:job.dispatched?finishedAt-job.dispatchedAt:null}) } catch {} // Diagnostics must never affect execution.
        error ? reject(error) : resolve(result)
      }
      timer = setTimeout(cancel, this.timeoutMs)
      if (signal?.aborted) return cancel()
      signal?.addEventListener('abort', cancel, { once: true })
      doc.queue.push(job); this.dispatch(doc)
    })
  }
  liveOperationIds(){
    const live=new Set()
    for(const record of this.operations.values())if(record.outputState==='recovering')live.add(record.operationId)
    for(const doc of this.documents.values()){
      if(doc.active)live.add(doc.active.id)
      for(const job of doc.queue)if(!job.settled)live.add(job.id)
    }
    return live
  }
  clearOperationCache(record,reason){
    if(record.cached?.pendingExport&&reason)record.outputState='unavailable'
    this.operationCacheBytes-=record.cacheBytes??0
    delete record.cached;delete record.cacheBytes
    record.resultAvailable=false;record.failureDetailsAvailable=false
    if(reason)record.resultUnavailableReason=reason
  }
  pruneOperations(limit=HISTORY_LIMIT){
    const live=this.liveOperationIds(),now=Date.now()
    for(const [id,record] of this.operations)if(!live.has(id)&&record.expiresAt!==null&&record.expiresAt<=now){this.clearOperationCache(record);this.operations.delete(id)}
    if(this.operations.size<=limit)return
    // Map insertion order is chronological; settled history can yield to new work.
    for(const [id,record] of this.operations){
      if(live.has(id))continue
      this.clearOperationCache(record);this.operations.delete(id)
      if(this.operations.size<=limit)break
    }
  }
  cacheOperation(record,payload,unavailableReason){
    this.clearOperationCache(record)
    const serialized=JSON.stringify(payload),size=Buffer.byteLength(serialized)
    if(unavailableReason||size>RESULT_LIMIT){record.resultUnavailableReason=unavailableReason??'result-too-large';return}
    for(const old of this.operations.values()){
      if(this.operationCacheBytes+size<=RESULT_CACHE_LIMIT)break
      if(old!==record&&old.cached&&old.outputState!=='recovering')this.clearOperationCache(old,'cache-evicted')
    }
    if(this.operationCacheBytes+size>RESULT_CACHE_LIMIT){record.resultUnavailableReason='cache-full';return}
    record.cached=JSON.parse(serialized);record.cacheBytes=size;this.operationCacheBytes+=size
    record.resultAvailable='result' in record.cached;record.failureDetailsAvailable='failureDetails' in record.cached
    delete record.resultUnavailableReason
  }
  takeExport(id,operationId,owner){
    this.pruneOperations()
    const record=this.operations.get(operationId)
    if(!record||record.documentId!==id||record.owner!==owner)throw new Error('Export not found in this Work/document; do not repeat encoding')
    if(record.outputState==='recovering')throw new Error('Export recovery is already in progress; do not repeat encoding')
    const descriptor=record.cached?.pendingExport
    if(record.method!=='export_video'||record.state!=='completed'||!descriptor)return null
    if(Date.parse(descriptor.expiresAt)<=Date.now()){this.clearOperationCache(record,'transfer-expired');record.outputState='unavailable';return null}
    record.outputState='recovering';record.outputClaimedAt=Date.now()
    return {transfer:JSON.parse(JSON.stringify(descriptor)),state:'claimed'}
  }
  completeOutput(id,operationId,owner,result){
    const record=this.operations.get(operationId)
    if(!record||record.documentId!==id||record.owner!==owner||record.state!=='completed')return false
    this.cacheOperation(record,{result})
    record.resultStage='host';record.outputState='completed';record.hostFinishedAt=Date.now();record.expiresAt=record.hostFinishedAt+HISTORY_TTL_MS
    return true
  }
  failOutput(id,operationId,owner,error){
    const record=this.operations.get(operationId)
    if(!record||record.documentId!==id||record.owner!==owner||record.state!=='completed'||record.outputState==='completed')return false
    this.clearOperationCache(record,'transfer-unavailable');record.outputState='unavailable';record.hostError=String(error?.message??error??'Export recovery failed').slice(0,2000)
    return true
  }
  operation(id,operationId,owner,includeResult=false){
    this.pruneOperations()
    const record=this.operations.get(operationId)
    if(!record||record.documentId!==id||record.owner!==owner)throw new Error('Operation not found in this Work/document; history may be expired or evicted. Its outcome is unknown; do not replay.')
    const {owner:ignored,documentId:doc,cached,cacheBytes,...status}=record
    const recovered=includeResult&&cached?JSON.parse(JSON.stringify(cached)):{}
    const document=this.documents.get(id)
    // Only retrieving a retained successful result reconciles this specific write.
    // Other uncertain operations remain barriers; querying status alone changes nothing.
    if(includeResult&&record.state==='completed'&&recovered.result!==undefined&&document?.uncertainIds.has(operationId)){
      document.uncertainIds.delete(operationId);document.uncertain=document.uncertainIds.size>0
    }
    return {...status,...(recovered.result!==undefined?{result:recovered.result}:{}),...(recovered.failureDetails??{}),requiresCanvasInspection:!!this.documents.get(id)?.uncertain,replayed:false,...(this.documents.get(id)?.uncertain?{suggestedAction:record.state==='unknown'||record.state==='running'?'wait-and-query-status':'inspect-affected-resources',reconcile:record.state==='unknown'||record.state==='running'?{tool:'operation_status',args:{operationId,includeResult:true}}:{tool:'get_metadata',args:{profile:'full',depth:10},scope:'Provide affected nodeId when known; returned subtree only.'}}:{suggestedAction:'continue-without-replay'})}
  }
  remove(id) {
    const doc = this.documents.get(id); if (!doc) return
    this.documents.delete(id)
    if (doc.poll) { clearTimeout(doc.poll.timer); json(doc.poll.res, 410, { error: 'Disconnected' }) }
    for (const job of [doc.active, ...doc.queue].filter(Boolean)) {
      job.finish(new Error('Figma disconnected. Operation was not replayed; inspect the canvas after reconnecting.'))
      const record=this.operations.get(job.id);if(record){record.disconnectedAt=Date.now();record.expiresAt=record.disconnectedAt+HISTORY_TTL_MS}
    }
  }
  async close() {
    this.stopped = true; this.operations.clear(); this.operationCacheBytes=0; clearInterval(this.timer)
    for (const id of this.documents.keys()) this.remove(id)
    if (this.server?.listening) await new Promise(resolve => { this.server.close(resolve); this.server.closeAllConnections() })
  }
}
