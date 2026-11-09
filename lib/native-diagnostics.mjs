import {recoveryHint} from './recovery.mjs'
// Classify one documented native error. This is guidance only: it must never
// change execution state, uncertainty, or safeToRetryWithoutCanvasRead.
export function variableModeLimitDiagnostic(error) {
  const message=String(error?.message??error??'')
  const match=/^(in addMode: Limited to (\d+) modes only)(?:; inspect the canvas before retrying(?: \[operationId=[^\]\r\n]{1,200}\])?)?$/.exec(message)
  if(!match)return null
  const limit=Number(match[2])
  if(!Number.isSafeInteger(limit)||limit<0)return null
  return {
    code:'FIGMA_VARIABLE_MODE_LIMIT',stage:'native-api',scope:'current-file',limit,nativeError:match[1],
    message:`Figma rejected adding a variable mode in the current file; its native error reports a limit of ${limit}. Existing or imported modes do not establish permission to add another mode.`,
    hint:'Inspect affected collections and variable values with get_variable_defs. '+recoveryHint,
    recovery:{
      collectionRead:{tool:'get_variable_defs',arguments:{collectionsOnly:true},hint:'Follow pagination and inspect affected variable values by their actual collection/variable IDs; a collection list alone does not verify values or bindings.'},
      bridgeRead:{tool:'get_metadata',arguments:{},hint:'Check recovery.cleared; increase depth or read smaller affected subtrees if incomplete. Metadata does not verify variable values.'},
      fallbacks:[
        {kind:'existing-mode',hint:'Reuse a suitable existing mode only if it is writable and fits the requested design; do not infer addMode quota from the number of existing modes.'},
        {kind:'single-mode-rebinding',hint:'If compatible with the requested design, reuse or create tokens in a permitted single-mode collection and explicitly rebind the intended nodes. Preserve unrelated bindings and verify the resulting values; separate collections are not native Light/Dark mode switching.'},
      ],
    },
  }
}
