// Recovery checks run only while a document has an uncertain write. They reuse
// the requested metadata response; no additional native reads or model calls.
export const recoveryHint = 'Read affected nodes with get_metadata({nodeId, profile:"full", depth:10, responseMode:"recovery"}); omit offset/limit. If recovery.cleared is false, follow its reason before writing. Inspect omitted properties or variables only when relevant. Continue missing work, not the whole creation script.'

// Project only after the bridge checks the original full response. This changes
// model-facing detail, not native traversal, completeness or write protection.
export function recoveryResponse(value, recovery) {
  const inspection=recovery??metadataInspection({nodeId:value?.id},value)
  const nodes=[],stack=[{node:value?.currentPage??value,parentId:null}]
  while(stack.length){
    const {node,parentId}=stack.pop();if(!node||typeof node!=='object')continue
    const item={id:node.id,type:node.type,parentId}
    for(const key of ['name','characters'])if(typeof node[key]==='string'){
      item[key]=node[key].slice(0,key==='name'?120:160)
      if(item[key].length<node[key].length)(item.shortenedFields??=[]).push(key)
    }
    for(const key of ['x','y','width','height','visible','locked','layoutMode','childCount','truncated','reason','continuation','fieldContinuation','omittedFields','opaque'])if(node[key]!==undefined)item[key]=node[key]
    nodes.push(item)
    for(const child of [...(node.children??[])].reverse())stack.push({node:child,parentId:node.id})
  }
  return {responseMode:'recovery',scopeNodeId:nodes[0]?.id,nodes,
    evidence:{kind:'current-tree-inventory',complete:inspection.complete===true,...(!inspection.complete?{reason:inspection.reason,hint:inspection.hint}:{}),attribution:'unknown; existing nodes are not proof of creation by this operation',propertyValidation:'not-established'},
    details:{omitted:'Detailed paints, text runs, bindings, component properties and effects. Read only properties needed for the failed edit.',tool:'get_metadata',args:{nodeId:nodes[0]?.id,depth:0,profile:'full'}},
    nextAction:recovery?.needsInspection||!inspection.complete?'Follow recovery/evidence hints; do not write yet.':'Inspect relevant omitted properties and other affected resources, then continue missing work; do not replay creation.'}
}
export function metadataInspection(args, value) {
  if(args.profile==='summary')return {complete:false,reason:'summary',hint:'Use profile:"full" (or omit profile) for the affected target.'}
  if(args.offset!==undefined||args.limit!==undefined)return {complete:false,reason:'pagination',hint:'Read the affected subtree without offset/limit.'}
  const root=args.nodeId?value:value?.currentPage
  if(!root?.id||!root.type)return {complete:false,reason:'missing-scope',hint:'Read an existing affected node by nodeId.'}
  const stack=[root];let count=0
  while(stack.length){
    const node=stack.pop()
    if(++count>1500||!node||typeof node!=='object')return {complete:false,reason:'invalid-or-oversized-result',hint:'Read a smaller affected subtree.'}
    if(node.truncated||node.continuation||node.fieldContinuation||node.omittedFields?.length||node.pagination?.hasMore)return {complete:false,reason:node.reason||'incomplete-result',hint:'Increase the relevant budget or read a smaller affected subtree without pagination.'}
    if(node.childCount!==undefined){
      if(!Number.isInteger(node.childCount)||node.childCount<0)return {complete:false,reason:'invalid-child-count',hint:'Read the affected node again.'}
      if((node.children?.length??0)!==node.childCount)return {complete:false,reason:'depth',hint:'Increase depth (up to 10), or read the affected descendants as smaller subtrees.'}
    }
    if(node.children){if(!Array.isArray(node.children))return {complete:false,reason:'invalid-children'};stack.push(...node.children)}
  }
  if(value.truncated||value.pagesTruncated)return {complete:false,reason:'truncated-result',hint:'Read the affected node directly by nodeId.'}
  return {complete:true,scopeNodeId:root.id}
}
