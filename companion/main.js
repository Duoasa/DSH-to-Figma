/* Generated entry is built by scripts/check.mjs from runtime.js and this file. */
figma.showUI(__html__, { width: 300, height: 210, themeColors: true })
const runtime = new globalThis.DshFigmaRuntime(figma)
let busy = false
figma.ui.onmessage = async message => {
  if (message.type === 'resize') {
    if (Number.isFinite(message.height)) figma.ui.resize(300, Math.max(158, Math.min(520, Math.round(message.height))))
    return
  }
  if (message.type === 'describe') {
    figma.ui.postMessage({ type: 'document', name: figma.root.name, editorType: figma.editorType, fileKey: figma.fileKey || null, featureVersion: 2, companionVersion: globalThis.DSH_FIGMA_BOOTSTRAP?.version || null, connection: globalThis.DSH_FIGMA_BOOTSTRAP || null })
    return
  }
  if (message.type !== 'execute') return
  if (busy) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: 'An operation is already running' }); return }
  busy = true
  try { const result = await runtime.run(message.method, message.args); figma.ui.postMessage({ type: 'result', id: message.id, ok: true, result }) }
  catch (error) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: String(error && error.message || error) }) }
  finally { busy = false }
}
