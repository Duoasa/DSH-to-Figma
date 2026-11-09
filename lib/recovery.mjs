// Recovery checks run only while a document has an uncertain write. They reuse
// the requested metadata response; no additional native reads or model calls.
export const recoveryHint = 'Read affected nodes with get_metadata({nodeId, profile:"full", depth:10}); omit offset/limit. If recovery.cleared is false, follow its reason and read a smaller affected subtree or increase the read budget. Check variables/bindings too if the failed operation changed them. Continue missing work, not the whole creation script.'
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
