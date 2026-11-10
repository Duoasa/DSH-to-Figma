/* MIT — local, opt-in authoring verification. */
;(function(scope){
 const families={sans:['Inter','Arial','Roboto','Helvetica Neue'],serif:['Georgia','Times New Roman','Noto Serif'],mono:['SF Mono','Cascadia Mono','Menlo','Consolas','Roboto Mono','Courier New'],cjk:['PingFang SC','Microsoft YaHei','Noto Sans SC','Source Han Sans SC']}
 const aliases={'sf pro':['Inter','Helvetica Neue','Arial'],'sf pro display':['Inter','Helvetica Neue'],'sf pro text':['Inter','Helvetica Neue'],'sf pro rounded':['SF Pro Rounded','Inter'],'sf mono':families.mono}
 const lower=x=>String(x??'').toLowerCase(),round=x=>Math.round(x*100)/100
 async function resolveFonts(runtime,args){
  if(!Array.isArray(args.specs)||!args.specs.length||args.specs.length>50)throw Error('Provide 1–50 font specs')
  if(args.forceRefresh||!runtime.fontCache||runtime.fontCache.expires<Date.now())runtime.fontCache={fonts:await runtime.figma.listAvailableFontsAsync(),expires:Date.now()+60000}
  const available=runtime.fontCache.fonts.map(x=>x.fontName),resolved=[],missing=[]
  for(const want of args.specs){
   if(!want.family&&!families[want.semantic])throw Error('Each font needs a family or semantic class')
   const requested=want.style||'Regular',candidates=[want.family,...(args.allowFallback===false?[]:[...(want.fallbacks??[]),...(aliases[lower(want.family)]??[]),...(families[want.semantic]??families.sans)])].filter(Boolean)
   let got
   for(const family of candidates){got=available.find(n=>lower(n.family)===lower(family)&&lower(n.style)===lower(requested));if(got)break}
   if(!got&&args.allowFallback!==false)for(const family of candidates){got=available.find(n=>lower(n.family)===lower(family)&&['regular','normal','book','roman'].includes(lower(n.style)));if(got)break}
   if(got)resolved.push({want,got,fallback:lower(got.family)!==lower(want.family)||lower(got.style)!==lower(requested),familyFallback:!!want.family&&lower(got.family)!==lower(want.family),styleFallback:lower(got.style)!==lower(requested)})
   else missing.push({want,reason:'No available matching family/style or allowed fallback'})
  }
  return {resolved,missing,glyphCoverage:'unverified',cacheExpiresAt:runtime.fontCache.expires}
 }
 const layoutFields=['id','type','name','x','y','width','height','locked','layoutMode','layoutPositioning','layoutSizingHorizontal','layoutSizingVertical','constraints','minWidth','maxWidth','minHeight','maxHeight','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutWrap','itemSpacing','counterAxisSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','clipsContent','textAutoResize']
 function layoutContext(node){
  const values={},omittedFields=[]
  for(const key of layoutFields){try{const raw=node[key];if(raw!==undefined){if(typeof raw==='symbol')values[key]='mixed';else values[key]=JSON.parse(JSON.stringify(raw))}}catch{omittedFields.push(key)}}
  return {node:values,parent:node.parent?{id:node.parent.id,layoutMode:node.parent.layoutMode??'NONE'}:null,...(omittedFields.length?{omittedFields}:{})}
 }
 function readLayout(node){
  const children=node.type==='CODE_INSTANCE'?[]:(node.children??[]),nodes=[node,...children.slice(0,19)].map(layoutContext)
  return {state:'observed',nodes,coverage:{scope:'target-and-direct-children',returned:nodes.length,total:1+children.length,truncated:children.length>19,opaque:node.type==='CODE_INSTANCE'},behaviorValidation:'not-tested',layoutAcceptance:'not-established',interpretation:'Evaluate against intended fixed/content-responsive/container-responsive behavior. Locks prevent accidental edits; no Auto Layout score or automatic resizing.'}
 }
 async function compare(runtime,args){
  const node=await runtime.node(args.nodeId),bounds=node.absoluteBoundingBox
  if(!bounds||node.rotation||node.absoluteTransform&&(Math.abs(node.absoluteTransform[0][1])>1e-6||Math.abs(node.absoluteTransform[1][0])>1e-6))throw Error('Compare requires an axis-aligned scene node with absolute bounds')
  const mode=args.bounds??'node'
  if(!['node','render'].includes(mode))throw Error('Comparison bounds must be node or render')
  const exportBounds=mode==='node'?bounds:node.absoluteRenderBounds
  if(!exportBounds||!['x','y','width','height'].every(k=>Number.isFinite(exportBounds[k]))||exportBounds.width<=0||exportBounds.height<=0)throw Error('Comparison export bounds are unavailable or empty')
  const mappings=[]
  for(const region of args.regions??[]){
   const child=await runtime.node(region.nodeId);let parent=child
   while(parent&&parent.id!==node.id)parent=parent.parent
   if(!parent||!child.absoluteBoundingBox)throw Error('Comparison regions must map to descendants of the target')
   const b=child.absoluteBoundingBox
   mappings.push({name:region.name,nodeId:child.id,referenceBounds:region.referenceBounds,actualBounds:{x:round(b.x-exportBounds.x),y:round(b.y-exportBounds.y),width:round(b.width),height:round(b.height)},layoutMode:child.parent?.layoutMode??'NONE',layoutContext:layoutContext(child)})
  }
  const {exportGeometry,...image}=await runtime.screenshot(node,{scale:Math.min(1,(args.maxDimension??1200)/Math.max(exportBounds.width,exportBounds.height)),contentsOnly:true,useAbsoluteBounds:mode==='node',captureGeometry:true})
  // Reject unexpected export padding instead of silently scaling the wrong rectangle.
  if(Math.abs(exportGeometry.width-exportBounds.width*exportGeometry.scale)>2||Math.abs(exportGeometry.height-exportBounds.height*exportGeometry.scale)>2)throw Error('Comparison export dimensions do not match the selected bounds; no pixel comparison was performed. Choose an explicit frame whose bounds match the reference.')
  return {value:{nodeId:node.id,width:node.width,height:node.height,regions:mappings,geometry:{mode,nodeBounds:bounds,exportBounds,raster:exportGeometry,subjectOffset:{x:bounds.x-exportBounds.x,y:bounds.y-exportBounds.y},outsideEffects:mode==='node'?'excluded':'included'}},images:[image]}
 }
 scope.DshFigmaQuality={resolveFonts,layoutContext,readLayout,async execute(runtime,method,args){
  if(method==='resolve_fonts')return {value:await resolveFonts(runtime,args),images:[]}
  if(method==='compare')return compare(runtime,args)
  if(method==='rollback')return {value:await scope.DshFigmaRecovery.rollback(runtime,args.operationId),images:[]}
  return null
 }}
})(globalThis)
