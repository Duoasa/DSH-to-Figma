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
 async function compare(runtime,args){
  const node=await runtime.node(args.nodeId),bounds=node.absoluteBoundingBox
  if(!bounds||node.rotation)throw Error('Compare requires an unrotated scene node with absolute bounds')
  const mappings=[]
  for(const region of args.regions??[]){
   const child=await runtime.node(region.nodeId);let parent=child
   while(parent&&parent.id!==node.id)parent=parent.parent
   if(!parent||!child.absoluteBoundingBox)throw Error('Comparison regions must map to descendants of the target')
   const b=child.absoluteBoundingBox
   mappings.push({name:region.name,nodeId:child.id,referenceBounds:region.referenceBounds,actualBounds:{x:round(b.x-bounds.x),y:round(b.y-bounds.y),width:round(b.width),height:round(b.height)},layoutMode:child.parent?.layoutMode??'NONE'})
  }
  const image=await runtime.screenshot(node,{maxDimension:args.maxDimension??1200,contentsOnly:true})
  return {value:{nodeId:node.id,width:node.width,height:node.height,regions:mappings},images:[image]}
 }
 scope.DshFigmaQuality={resolveFonts,async execute(runtime,method,args){
  if(method==='resolve_fonts')return {value:await resolveFonts(runtime,args),images:[]}
  if(method==='compare')return compare(runtime,args)
  if(method==='rollback')return {value:await scope.DshFigmaRecovery.rollback(runtime,args.operationId),images:[]}
  return null
 }}
})(globalThis)
