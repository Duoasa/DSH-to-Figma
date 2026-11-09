/* Generated entry is built by scripts/check.mjs from runtime.js and this file. */
const companionVersion = globalThis.DSH_FIGMA_BOOTSTRAP?.version || globalThis.DSH_FIGMA_VERSION || null
figma.showUI(__html__, { width: 300, height: 210, themeColors: true, ...(companionVersion?{title:'DSH to Figma · '+companionVersion}:{}) })
const runtime = new globalThis.DshFigmaRuntime(figma, {onProgress: nodes => figma.ui.postMessage({type:'progress',nodes})})
let busy = false, referenceWork = null, referenceSerial = 0
const referenceSummary = () => globalThis.DshFigmaReference.summary(globalThis.DshFigmaReference.stored(figma))
const notifyReference = reference => figma.ui.postMessage({type:'reference-changed',reference:globalThis.DshFigmaReference.summary(reference),referenceSerial})
figma.ui.onmessage = async message => {
  if (message.type === 'resize') {
    if (Number.isFinite(message.height)) figma.ui.resize(300, Math.max(158, Math.min(520, Math.round(message.height))))
    return
  }
  if (message.type === 'describe') {
    let capabilities
    try { capabilities = await globalThis.DshFigmaCapabilities.probe(figma) } catch {} // Discovery must not prevent pairing.
    figma.ui.postMessage({ type: 'document', name: figma.root.name, editorType: figma.editorType, fileKey: figma.fileKey || null, featureVersion: 5, designReference:referenceSummary(), referenceSerial, capabilities, companionVersion, connection: globalThis.DSH_FIGMA_BOOTSTRAP || null })
    return
  }
  if (message.type === 'reference') {
    if(busy||referenceWork){figma.ui.postMessage({type:'reference-result',id:message.id,ok:false,error:'请等待当前操作完成后再试。'});return}
    referenceWork=(async()=>{
      try{
        if(message.action==='locate')await globalThis.DshFigmaReference.locate(figma)
        const method=({get:'get_design_reference',bind:'set_design_reference',clear:'clear_design_reference',locate:'get_design_reference'})[message.action]
        if(!method)throw Error('不支持的参考操作。')
        const result=await runtime.run(method,{includePreview:message.includePreview===true})
        figma.ui.postMessage({type:'reference-result',id:message.id,ok:true,referenceSerial:++referenceSerial,result:{...result,value:{...result.value,reference:globalThis.DshFigmaReference.summary(result.value.reference)}}})
      }catch(error){figma.ui.postMessage({type:'reference-result',id:message.id,ok:false,error:String(error.message||error)})}
    })()
    try{await referenceWork}finally{referenceWork=null}
    return
  }
  if (message.type !== 'execute') return
  if(referenceWork)await referenceWork
  if (busy) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: 'An operation is already running', safeToRetryWithoutCanvasRead:true }); return }
  busy = true
  try { const result = await runtime.run(message.method, message.args); if(['get_design_reference','set_design_reference','clear_design_reference'].includes(message.method))result.referenceSerial=++referenceSerial; figma.ui.postMessage({ type: 'result', id: message.id, ok: true, result }); if(['get_design_reference','set_design_reference','clear_design_reference'].includes(message.method))notifyReference(result.value.reference) }
  catch (error) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: String(error && error.message || error), safeToRetryWithoutCanvasRead: error?.safeToRetryWithoutCanvasRead === true, batchResult:error?.batchResult,createdNodeIds:error?.createdNodeIds,journal:error?.journal,affected:error?.affected,failureClass:error?.failureClass }) }
  finally { busy = false }
}
