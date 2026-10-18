/* Generated entry is built by scripts/check.mjs from runtime.js and this file. */
figma.showUI(__html__, { width: 360, height: 430, themeColors: true })
const runtime = new globalThis.DshFigmaRuntime(figma)
let busy = false
figma.ui.onmessage = async message => {
  if (message.type === 'describe') {
    figma.ui.postMessage({ type: 'document', name: figma.root.name, editorType: figma.editorType })
    return
  }
  if (message.type !== 'execute') return
  if (busy) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: 'An operation is already running' }); return }
  busy = true
  try { const result = await runtime.run(message.method, message.args); figma.ui.postMessage({ type: 'result', id: message.id, ok: true, result }) }
  catch (error) { figma.ui.postMessage({ type: 'result', id: message.id, ok: false, error: String(error && error.message || error) }) }
  finally { busy = false }
}
