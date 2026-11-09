/* MIT — comparison in the existing local companion iframe; no new dependencies. */
;(function(scope){
 const round=n=>Math.round(n*100)/100
 function lab(rgb){
  const [r,g,b]=rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4})
  const f=v=>v>216/24389?Math.cbrt(v):(24389/27*v+16)/116
  const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883)
  return [116*y-16,500*(x-y),200*(y-z)]
 }
 const delta=(a,b)=>{const aa=lab(a),bb=lab(b);return Math.hypot(aa[0]-bb[0],aa[1]-bb[1],aa[2]-bb[2])}
 function measure(a,b,width,height,tolerance={}){
  const step=Math.max(1,Math.ceil(Math.sqrt(width*height/120000))),sumA=[0,0,0],sumB=[0,0,0],exA=new Float64Array(width),exB=new Float64Array(width),eyA=new Float64Array(height),eyB=new Float64Array(height)
  let count=0,total=0,changed=0,max=0
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
   const i=(y*width+x)*4,aa=[a[i],a[i+1],a[i+2]],bb=[b[i],b[i+1],b[i+2]],d=delta(aa,bb)
   count++;total+=d;max=Math.max(max,d);if(d>(tolerance.deltaE??2))changed++
   for(let c=0;c<3;c++){sumA[c]+=aa[c];sumB[c]+=bb[c]}
   if(x>=step){for(let c=0;c<3;c++){exA[x]+=Math.abs(a[i+c]-a[i-step*4+c]);exB[x]+=Math.abs(b[i+c]-b[i-step*4+c])}}
   if(y>=step){for(let c=0;c<3;c++){eyA[y]+=Math.abs(a[i+c]-a[i-width*step*4+c]);eyB[y]+=Math.abs(b[i+c]-b[i-width*step*4+c])}}
  }
  const peaks=values=>{const max=Math.max(...values);if(max<40)return [];return [...values].map((value,at)=>({at,value})).filter(p=>p.value>max*.45).sort((a,b)=>b.value-a.value).reduce((list,p)=>list.every(q=>Math.abs(p.at-q.at)>step*3)&&list.length<8?[...list,p]:list,[]).sort((a,b)=>a.at-b.at).map(p=>p.at)}
  const boundaries={x:{reference:peaks(exA),actual:peaks(exB)},y:{reference:peaks(eyA),actual:peaks(eyB)}}
  return {sampleCount:count,samplingStridePx:step,meanDeltaE76:round(total/count),maxSampleDeltaE76:round(max),changedSampleRatio:round(changed/count*100)/100,meanColors:{reference:sumA.map(n=>Math.round(n/count)),actual:sumB.map(n=>Math.round(n/count))},boundaries,confidence:'diagnostic-only',limitations:['Pixel differences include font rasterization and anti-aliasing.','Projected edges are candidates, not identified semantic regions.']}
 }
 const canvas=(w,h)=>{if(w<1||h<1||w*h>5200000)throw Error('Comparison pixel budget exceeded; use a smaller crop');const c=document.createElement('canvas');c.width=w;c.height=h;return c}
 async function decode(image){
  const binary=atob(image.data);if(binary.length>8*1024*1024)throw Error('Comparison input exceeds 8 MiB')
  const blob=new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:image.mimeType})
  const bitmap=await createImageBitmap(blob)
  if(bitmap.width*bitmap.height>32000000){bitmap.close();throw Error('Reference exceeds 32 megapixels; crop/resize it first')}
  return bitmap
 }
 const png=c=>{const data=c.toDataURL('image/png').split(',')[1];if(data.length>Math.ceil(8*1024*1024/3)*4)throw Error('Comparison image exceeds 8 MiB; reduce maxDimension');return {type:'image',mimeType:'image/png',data}}
 async function finish(args,result){
  let reference,actual
  try{
   reference=await decode(args.referenceImage);actual=await decode(result.images[0])
   const crop=args.crop??{x:0,y:0,width:reference.width,height:reference.height}
   if(![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>reference.width||crop.y+crop.height>reference.height)throw Error('Reference crop is outside image bounds')
   const max=Math.min(1600,args.maxDimension??1200),width=Math.max(1,Math.round(Math.min(max,max/(Math.max(crop.height/crop.width,actual.height/actual.width))))),refScale=width/crop.width,actualScale=width/actual.width,height=Math.max(1,Math.ceil(Math.max(crop.height*refScale,actual.height*actualScale)))
   const a=canvas(width,height),b=canvas(width,height),ac=a.getContext('2d'),bc=b.getContext('2d')
   for(const ctx of [ac,bc]){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height)}
   ac.drawImage(reference,crop.x,crop.y,crop.width,crop.height,0,0,width,crop.height*refScale);bc.drawImage(actual,0,0,width,actual.height*actualScale)
   const metrics=measure(ac.getImageData(0,0,width,height).data,bc.getImageData(0,0,width,height).data,width,height,args.tolerance)
   const side=canvas(width*2,height),sc=side.getContext('2d');sc.drawImage(a,0,0);sc.drawImage(b,width,0)
   const overlay=canvas(width,height),oc=overlay.getContext('2d');oc.drawImage(a,0,0);oc.globalAlpha=.5;oc.drawImage(b,0,0)
   const units=result.value.width/crop.width,deltas=(result.value.regions??[]).map(r=>{
    const expected={x:(r.referenceBounds.x-crop.x)*units,y:(r.referenceBounds.y-crop.y)*units,width:r.referenceBounds.width*units,height:r.referenceBounds.height*units}
    const difference=Object.fromEntries(Object.keys(expected).map(k=>[k,round(r.actualBounds[k]-expected[k])]))
    return {...r,expectedBounds:expected,deltaFigmaUnits:difference,outsideTolerance:Object.values(difference).some(n=>Math.abs(n)*width/result.value.width>(args.tolerance?.edgePx??1)),confidence:'explicit-region-mapping',suggestedProperties:r.layoutMode==='NONE'?['x','y','width','height']:['width','height','layoutSizingHorizontal','layoutSizingVertical','parent.padding','parent.itemSpacing'],suggestion:'Use this mapped node’s sizing/parent layout to correct the measured bounds; do not blindly write auto-layout x/y.'}
   })
   return {...result,value:{...result.value,comparison:{alignment:'uniform-width; top-left; white alpha background; no stretch or automatic registration',referenceCrop:crop,referenceScale:refScale,actualScale,comparisonSize:{width,height},...metrics,deltas,visualAcceptance:'not-established'}},images:[png(side),png(overlay)]}
  }finally{reference?.close();actual?.close()}
 }
 scope.DshFigmaCompare={measure,lab,finish}
})(globalThis)
