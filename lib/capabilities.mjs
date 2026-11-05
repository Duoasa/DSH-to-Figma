// Accept only the bounded capability report, never arbitrary companion-provided metadata.
export const capabilityNames = ['manualKeyframes','animationStyles','timelines','animationDefinitions','textAnimation','customAnimationStyles','specs','specCreation','specComments']
export function capabilityReport(input) {
  const valid = input?.schemaVersion === 1 && input?.readOnly === true
  const features = Object.fromEntries(capabilityNames.map(name => {
    const value = valid ? input.features?.[name] : null
    const state = ['available','unavailable','unknown'].includes(value?.state) ? value.state : 'unknown'
    return [name, {state, reason:typeof value?.reason === 'string' ? value.reason.slice(0,300) : 'Not probed by this companion; run get_capabilities with companion featureVersion 4'}]
  }))
  return {schemaVersion:1, features, readOnly:true, writesVerified:false,
    checkedAt:valid && typeof input.checkedAt === 'string' && Number.isFinite(Date.parse(input.checkedAt)) ? input.checkedAt.slice(0,32) : null,
    pageId:valid && typeof input.pageId === 'string' ? input.pageId.slice(0,128) : null,
    sampledNodeId:valid && typeof input.sampledNodeId === 'string' ? input.sampledNodeId.slice(0,128) : null,
    scope:'Snapshot of current editor/file API exposure and read probes; not proof of successful writes. Refresh with get_capabilities after account, file or editor changes.'}
}
