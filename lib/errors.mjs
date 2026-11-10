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
  const failureClass=error.failureClass??(mode||/FIGMA_CODE_LAYER_UNAVAILABLE/.test(message)?'platform-limit':diagnostic?.stage==='preflight'?'preflight':executionState==='unknown'?'execution-unknown':executionState==='read-only'?'execution-error':safe?'guard':'execution-error')
  let suggestedAction=error.suggestedAction??(mode?'use-supported-variable-layout':failureClass==='platform-limit'?(affected?.collectionId?'use-supported-variable-layout':'use-native-editable-layers'):safe?'correct-and-retry':'inspect-affected-resources')
  let reconcile
  const repair=/FIGMA_INVALID_PROPERTY.*strokeDashes/.test(message)?'strokeDashes 不是 Figma 节点属性；改用 dashPattern = [dash, gap]。':/FIGMA_UNKNOWN_ICON|Unknown icon/.test(message)?'使用已列出的内置图标名称，或通过 createNodeFromSvg 绘制所需图标。':/FILL.*(?:children|auto.layout)/i.test(message)?'先 appendChild 到自动布局父级，再设置 layoutSizingHorizontal/layoutSizingVertical = FILL。':/(?:font.*(?:not loaded|loadFontAsync)|loadFontAsync.*font)/i.test(message)?'用 resolve_fonts 批量解析实际可用字体，再 await figma.loadFontAsync(实际字体) 后修改文本。':/(?:read.only|readonly|cannot assign).*propert/i.test(message)?'该属性只读；使用对应的原生方法修改，不要直接赋值。':null
  if(repair)suggestedAction=repair
  const operationId=error.reconcileOperationId??(executionState==='unknown'?error.operationId:null)
  if(operationId){reconcile={tool:'operation_status',args:{operationId,includeResult:true}};suggestedAction='query-operation-status'}
  else if(!safe||error.recovery?.needsInspection)reconcile={tool:'get_metadata',args:{...(args.nodeId?{nodeId:args.nodeId}:{}),profile:'full',depth:10,responseMode:'recovery'},scope:'Returned subtree only; also inspect any affected variables or other nodes.'}
  if(affected?.collectionId&&!safe)reconcile={tool:'get_variable_defs',args:{collectionIds:[affected.collectionId],profile:'full',allVariables:true}}
  if(affected?.nodeIds?.length&&!operationId)reconcile={tool:'get_metadata',args:{nodeId:affected.nodeIds[0],profile:'full',depth:10,responseMode:'recovery'},remainingNodeIds:affected.nodeIds.slice(1),scope:affected.coverage??'explicit-targets'}
  if(error.reconcile)reconcile=error.reconcile
  const messageHuman=repair?(repair+(safe?' 本次没有画布写入；修正后重试。':' 本次可能已部分写入；先按 reconcile 核对残留，再补做。')):executionState==='read-only'?'本次为受限只读执行，没有修改画布。修正读取代码即可；此前未核实的写入仍受保护。':mode?`该集合添加模式时触及 Figma 限制（上限 ${diagnostic.limit}）。检查已有修改，再使用允许的单模式集合并按需绑定别名。`:error.candidates?(error.candidates.length?'请选择目标 Figma 文件；候选已附在错误中。':'尚未连接 Figma 文件，请运行已配对的本地插件。'):executionState==='unknown'?(operationId?'执行结果尚未确认，先查询操作状态，请勿重复创建。':'执行结果尚未确认，请等待原调用完成或检查受影响对象，不要重复创建。'):error.recovery?.needsInspection?'上一笔写入尚未核实，按 reconcile 检查后再继续。':failureClass==='platform-limit'?(affected?.collectionId?'该集合触及已观察到的模式限制；使用现有模式或独立集合。权限变化后可 forceRefresh。':'当前编辑器未开放该能力，请使用可编辑的原生图层。'):safe?'本次未开始写入，修正参数或目标后可重试。':'执行可能留下部分修改，先检查受影响对象，再补做缺失内容。'
  return {failureClass,executionState,retryable:safe===true&&!error.recovery?.needsInspection&&failureClass!=='platform-limit',suggestedAction,messageHuman,...(reconcile?{reconcile}:{}),...(error.reconcileOperationId?{blockingOperation:{operationId:error.reconcileOperationId,executionState:'unreconciled',scope:'previous-write'}}:{}),...(error.candidates?{candidates:error.candidates}:{}),...(affected?{affected}:{}),...(error.journal?{journal:error.journal}:{})}
}
