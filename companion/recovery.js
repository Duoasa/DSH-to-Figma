/* MIT — bounded, explicit cleanup; never a general transaction/Undo. */
;(function(scope){
 const disposable=new Set(['FRAME','GROUP','SECTION','TEXT','RECTANGLE','ELLIPSE','LINE','VECTOR','POLYGON','STAR','BOOLEAN_OPERATION'])
 const reads=new Set(['resolve_fonts','compare','get_selection','list_fonts','get_metadata','get_screenshot','get_design_context','get_figjam','get_variable_defs','get_libraries','search_design_system','get_component_context','get_local_component_links','get_capabilities','get_motion_context','download_assets','get_design_reference'])
 const descendants=node=>{const out=[],visit=n=>{if(out.length>1500)throw Error('Cleanup subtree exceeds 1500 nodes');out.push(n);for(const c of n.children??[])visit(c)};visit(node);return out}
 function discard(runtime){for(const record of runtime.cleanupRecords?.values()??[])record.dispose?.();runtime.cleanupRecords?.clear()}
 function before(runtime,method,args,operationId){
  if(runtime.cleanupRecords?.size&&method!=='rollback'&&!reads.has(method)&&!(method==='use_figma'&&args.readOnly))discard(runtime)
  runtime.creationReceipt=null
  if(method!=='use_figma'||!args.trackCreated)return
  if(args.readOnly)throw Error('trackCreated is incompatible with readOnly')
  const page=runtime.figma.currentPage,record={operationId,pageId:page.id,ids:new Set(),roots:[],dirty:false,expires:Date.now()+600000,coverage:'observed node factories only; existing edits/variables are not undone'}
  const change=()=>{if(record.sealed)record.dirty=true},pageChange=()=>{record.dirty=true}
  if(typeof page.on!=='function'||typeof page.off!=='function'||typeof runtime.figma.on!=='function'||typeof runtime.figma.off!=='function')record.unavailable='Editor lacks scoped change observation'
  else{page.on('nodechange',change);runtime.figma.on('currentpagechange',pageChange);record.dispose=()=>{try{page.off('nodechange',change)}catch{}try{runtime.figma.off('currentpagechange',pageChange)}catch{}if(record.timer)clearTimeout(record.timer)}}
  runtime.creationReceipt=record
 }
 function created(runtime,node){
  const r=runtime.creationReceipt;if(!r||!node?.id)return
  try{for(const n of descendants(node)){if(r.ids.size>=1500){r.unavailable='Created-node budget exceeded';break}r.ids.add(n.id)}}catch{r.unavailable='Created subtree too large'}
 }
 async function fingerprint(node){
  const raw=await node.exportAsync({format:'JSON_REST_V1'})
  if(!raw?.document||raw.document.id!==node.id)throw Error('Native JSON snapshot unavailable')
  const text=JSON.stringify({parent:node.parent?.id,document:raw.document})
  if(text.length>2000000)throw Error('Cleanup snapshot exceeds 2 MiB')
  return text
 }
 async function failed(runtime){
  const r=runtime.creationReceipt;if(!r)return null
  r.sealed=true
  const candidates=[]
  for(const id of r.ids){const node=await runtime.figma.getNodeByIdAsync(id);if(node&&!node.removed&&!r.ids.has(node.parent?.id))candidates.push(node)}
  let bytes=0
  for(const node of candidates){
   try{
    const children=descendants(node)
    if(children.some(n=>!r.ids.has(n.id)||!disposable.has(n.type)))throw Error('Subtree contains existing/untracked or dependency-bearing nodes')
    const snapshot=await fingerprint(node);bytes+=snapshot.length;if(bytes>4000000)throw Error('Cleanup receipt exceeds 4 MiB')
    r.roots.push({id:node.id,snapshot,ids:children.map(n=>n.id)})
   }catch(error){r.roots.push({id:node.id,reason:error.message})}
  }
  if(!r.operationId||r.unavailable||r.dirty){r.dispose?.();return {available:false,reason:r.unavailable??'Canvas changed or operation identity unavailable',createdNodeIds:[...r.ids]}}
  runtime.cleanupRecords??=new Map();while(runtime.cleanupRecords.size>=10){const key=runtime.cleanupRecords.keys().next().value;runtime.cleanupRecords.get(key).dispose?.();runtime.cleanupRecords.delete(key)}
  runtime.cleanupRecords.set(r.operationId,r)
  r.timer=setTimeout(()=>{r.dispose?.();runtime.cleanupRecords.delete(r.operationId)},600000);r.timer?.unref?.()
  return {available:true,operationId:r.operationId,createdNodeIds:[...r.ids],expiresAt:r.expires,coverage:r.coverage,reconcile:{tool:'rollback',args:{operationId:r.operationId}}}
 }
 async function rollback(runtime,operationId){
  const r=runtime.cleanupRecords?.get(operationId)
  if(!r)throw Object.assign(Error('Cleanup receipt unavailable or invalidated by a subsequent write; inspect the affected nodes'),{safeToRetryWithoutCanvasRead:true})
  const removed=[],skipped=[]
  for(const entry of r.roots){
   const node=await runtime.figma.getNodeByIdAsync(entry.id)
   if(!node||node.removed){skipped.push({nodeId:entry.id,reason:'already-absent'});continue}
   let reason=r.dirty?'intervening-canvas-edit':Date.now()>r.expires?'receipt-expired':runtime.figma.currentPage.id!==r.pageId?'page-changed':entry.reason
   if(!reason){try{if(await fingerprint(node)!==entry.snapshot)reason='subtree-modified';else if(descendants(node).some(n=>!r.ids.has(n.id)||!disposable.has(n.type)))reason='untracked-or-dependent-descendant'}catch{reason='snapshot-unavailable'}}
   if(r.dirty)reason='intervening-canvas-edit'
   if(reason){skipped.push({nodeId:entry.id,reason});continue}
   // Removing a verified root removes only the verified descendants atomically in Figma.
   runtime.mutationEntered=true;node.remove();removed.push(...entry.ids)
  }
  r.dispose?.();runtime.cleanupRecords.delete(operationId)
  return {operationId,removed,skipped,scope:'created disposable subtrees only',existingEditsRestored:false,requiresInspection:true,reconcile:{tool:'get_metadata',args:{nodeId:r.pageId,profile:'full',depth:10},hint:'Also inspect any variables or other resources changed by the original script.'}}
 }
 scope.DshFigmaRecovery={before,created,failed,rollback,success(runtime){runtime.creationReceipt?.dispose?.()},discard}
})(globalThis)
