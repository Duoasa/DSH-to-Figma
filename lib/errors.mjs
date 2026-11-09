// Error-only diagnostics: no native reads, probes or additional model calls.
export function bindingFailure(documents,binding,workspace){
  const candidates=documents.map(d=>({connectionId:d.connectionId,name:d.name,fileKey:d.fileKey??`local:${d.connectionId}`,
    bindingMatch:binding?.workspace===workspace&&d.editorType===binding.editorType?(binding.fileKey&&binding.fileKey===d.fileKey?'same-file-key':!binding.fileKey&&binding.name===d.name?'same-name-unverified':'none'):'none'}))
  return Object.assign(new Error(documents.length?'Multiple Figma documents are connected or the previous binding disconnected. Choose the target with figma_select_document; it will not switch automatically.':'No Figma document is connected. Run the paired companion.'),{candidates,failureClass:'guard',suggestedAction:documents.length?'select-document':'connect-companion'})
}
export function errorDetails(error,{safe,diagnostic,args={}}={}){
  const observed=[...new Set((error.journal?.entries??[]).flatMap(e=>[...(e.created??[]),...(e.updated?.nodeId?[e.updated.nodeId]:[])]))].slice(0,1000)
  const affected=error.affected??(observed.length?{nodeIds:observed,coverage:'observed-only'}:undefined)
  const message=String(error.message??error),mode=diagnostic?.code==='FIGMA_VARIABLE_MODE_LIMIT'
  const executionState=error.executionState??(safe?'not-started':'partial-or-unknown')
  const failureClass=error.failureClass??(mode||/FIGMA_CODE_LAYER_UNAVAILABLE/.test(message)?'platform-limit':diagnostic?.stage==='preflight'?'preflight':executionState==='unknown'?'execution-unknown':safe?'guard':'execution-error')
  let suggestedAction=error.suggestedAction??(mode?'use-supported-variable-layout':failureClass==='platform-limit'?(affected?.collectionId?'use-supported-variable-layout':'use-native-editable-layers'):safe?'correct-and-retry':'inspect-affected-resources')
  let reconcile
  const operationId=error.reconcileOperationId??(executionState==='unknown'?error.operationId:null)
  if(operationId){reconcile={tool:'operation_status',args:{operationId,includeResult:true}};suggestedAction='query-operation-status'}
  else if(!safe||error.recovery?.needsInspection)reconcile={tool:'get_metadata',args:{...(args.nodeId?{nodeId:args.nodeId}:{}),profile:'full',depth:10},scope:'Returned subtree only; also inspect any affected variables or other nodes.'}
  if(affected?.collectionId&&!safe)reconcile={tool:'get_variable_defs',args:{collectionIds:[affected.collectionId],profile:'full',allVariables:true}}
  if(affected?.nodeIds?.length&&!operationId)reconcile={tool:'get_metadata',args:{nodeId:affected.nodeIds[0],profile:'full',depth:10},remainingNodeIds:affected.nodeIds.slice(1),scope:affected.coverage??'explicit-targets'}
  if(error.reconcile)reconcile=error.reconcile
  const messageHuman=mode?`该集合添加模式时触及 Figma 限制（上限 ${diagnostic.limit}）。检查已有修改，再使用允许的单模式集合并按需绑定别名。`:error.candidates?(error.candidates.length?'请选择目标 Figma 文件；候选已附在错误中。':'尚未连接 Figma 文件，请运行已配对的本地插件。'):executionState==='unknown'?(operationId?'执行结果尚未确认，先查询操作状态，请勿重复创建。':'执行结果尚未确认，请等待原调用完成或检查受影响对象，不要重复创建。'):error.recovery?.needsInspection?'上一笔写入尚未核实，按 reconcile 检查后再继续。':failureClass==='platform-limit'?(affected?.collectionId?'该集合触及已观察到的模式限制；使用现有模式或独立集合。权限变化后可 forceRefresh。':'当前编辑器未开放该能力，请使用可编辑的原生图层。'):safe?'本次未开始写入，修正参数或目标后可重试。':'执行可能留下部分修改，先检查受影响对象，再补做缺失内容。'
  return {failureClass,executionState,retryable:safe===true&&!error.recovery?.needsInspection&&failureClass!=='platform-limit',suggestedAction,messageHuman,...(reconcile?{reconcile}:{}),...(error.candidates?{candidates:error.candidates}:{}),...(affected?{affected}:{}),...(error.journal?{journal:error.journal}:{})}
}
