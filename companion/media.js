/* MIT — Copyright (c) 2026 Duoasa. Local assets and bounded native video transfer. */
;(function(scope) {
  const transfers = new WeakMap(), LIMIT = 256 * 1024 * 1024, CHUNK = 512 * 1024, TTL = 10 * 60 * 1000
  const ASSET_LIMIT = 12 * 1024 * 1024
  let sequence = 0
  const integer = (n, fallback, min, max, name) => { n ??= fallback; if (!Number.isInteger(n) || n < min || n > max) throw Error(name + ' out of range'); return n }
  const result = value => ({value, images:[]})
  const errorText = error => String(error?.message || error).slice(0,1000)
  const dispose = (runtime,item) => {if(item.timer!==undefined)clearTimeout(item.timer);item.bytes=null;if(transfers.get(runtime)===item)transfers.delete(runtime)}
  const renew = (runtime,item) => {item.expiresAt=Date.now()+TTL;if(item.timer!==undefined)clearTimeout(item.timer);if(typeof setTimeout==='function'){item.timer=setTimeout(()=>dispose(runtime,item),TTL);item.timer?.unref?.()}}
  const current = runtime => { const item=transfers.get(runtime); if(item && item.expiresAt <= Date.now()) { dispose(runtime,item); return null }; return item }
  const getTransfer = (runtime,id) => { const item=current(runtime); if(!item || item.id!==id || !item.bytes) throw Error('Export transfer not found or expired; do not reuse IDs after reconnect'); return item }
  const clone = value => JSON.parse(JSON.stringify(value))
  async function replaceImages(runtime,args) {
    const f=runtime.figma, assets=args.assets, ids=args.nodeIds
    if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('nodeIds must contain 1–20 unique target IDs')
    if(!Array.isArray(assets)||assets.length!==ids.length)throw Error('Each target requires exactly one raster asset')
    if(args.parentId!==undefined)throw Error('parentId cannot be combined with nodeIds')
    const index=integer(args.fillIndex,0,0,100,'fillIndex'), mode=args.scaleMode
    if(mode!==undefined&&!['FILL','FIT','CROP','TILE'].includes(mode))throw Error('Invalid image scaleMode')
    const pending=[];let total=0
    for(let i=0;i<ids.length;i++) {
      const asset=assets[i]
      if(!asset||!['image/png','image/jpeg','image/gif','image/webp'].includes(asset.mimeType)||typeof asset.data!=='string')throw Error('Target replacement accepts raster images only; SVG creates editable nodes')
      if(asset.data.length>Math.ceil(ASSET_LIMIT/3)*4)throw Error('Asset batch exceeds 12 MiB')
      const bytes=f.base64Decode(asset.data);total+=bytes.length
      if(!bytes.length||f.base64Encode(bytes)!==asset.data)throw Error('Invalid raster asset data')
      if(total>ASSET_LIMIT)throw Error('Asset batch exceeds 12 MiB')
      const node=await runtime.node(ids[i])
      if(!Array.isArray(node.fills))throw Error('Target must expose uniform fills; mixed text fills need explicit text-range editing')
      if(index>node.fills.length)throw Error('fillIndex must address an existing fill or append at the end')
      // Load existing text fonts before any target writes, never replace the user's font.
      if(node.type==='TEXT') {
        const fonts=typeof node.getStyledTextSegments==='function'?node.getStyledTextSegments(['fontName']).map(s=>s.fontName):[node.fontName]
        const seen=new Set()
        for(const font of fonts){if(!font||typeof font.family!=='string'||typeof font.style!=='string')throw Error('Unable to resolve existing text fonts');const key=font.family+'\0'+font.style;if(!seen.has(key)){seen.add(key);await f.loadFontAsync(font)}}
      }
      pending.push({node,bytes,fills:clone(node.fills)})
    }
    // Decode every image before changing fills so a corrupt later asset cannot cause partial replacement.
    for(const item of pending)item.image=f.createImage(item.bytes)
    const changed=[]
    for(const {node,image,fills} of pending) {
      const old=fills[index]
      let paint=old?.type==='IMAGE'?{...old,imageHash:image.hash}:{type:'IMAGE',imageHash:image.hash,scaleMode:mode??'FILL',...(old?{visible:old.visible,opacity:old.opacity,blendMode:old.blendMode}:{})}
      if(mode!==undefined&&mode!==paint.scaleMode){paint.scaleMode=mode;delete paint.imageTransform;delete paint.scalingFactor}
      if(paint.scaleMode==='CROP'&&!paint.imageTransform)paint.imageTransform=[[1,0,0],[0,1,0]]
      if(paint.scaleMode==='TILE'&&!paint.scalingFactor)paint.scalingFactor=1
      for(const key of Object.keys(paint))if(paint[key]===undefined)delete paint[key]
      fills.splice(index,index<fills.length?1:0,paint)
      node.fills=fills
      changed.push({nodeId:node.id,imageHash:image.hash,fillIndex:index,scaleMode:paint.scaleMode})
    }
    f.commitUndo()
    return result({nodeIds:changed.map(x=>x.nodeId),replacements:changed})
  }
  async function download(runtime,args) {
    const f=runtime.figma, ids=args.nodeIds??(args.nodeId?[args.nodeId]:f.currentPage.selection.map(n=>n.id))
    if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!id))throw Error('Select or specify 1–20 nodes')
    const maxNodes=integer(args.maxNodes,5000,1,10000,'maxNodes'), assets=[],mapping=[],hashes=new Set(),svgIds=new Set()
    let total=0,visited=0
    const add=(name,mimeType,bytes,entry)=>{if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('Export returned no bytes');if(assets.length>=40)throw Error('Export exceeds 40 files; select a smaller subtree');total+=bytes.length;if(total>ASSET_LIMIT)throw Error('Asset batch exceeds 12 MiB; export fewer or smaller nodes');mapping.push({...entry,assetIndex:assets.length,name,mimeType,bytes:bytes.length});assets.push({name,mimeType,data:f.base64Encode(bytes)})}
    const exportNode=async(node,settings,role)=>{
      const options=clone(settings), format=String(args.format??options.format??'PNG').toUpperCase()
      if(!['PNG','JPG','SVG','PDF'].includes(format))throw Error('Unsupported node export format: '+format)
      options.format=format;const suffix=typeof options.suffix==='string'?options.suffix:'';delete options.suffix
      if(args.scale!==undefined){if(!Number.isFinite(args.scale)||args.scale<0.01||args.scale>4)throw Error('Scale must be 0.01–4');if(['PNG','JPG'].includes(format))options.constraint={type:'SCALE',value:args.scale}}
      const bytes=await node.exportAsync(options)
      add(node.name+suffix+'.'+format.toLowerCase(),{PNG:'image/png',JPG:'image/jpeg',SVG:'image/svg+xml',PDF:'application/pdf'}[format],bytes,{nodeId:node.id,role,format})
      if(format==='SVG')svgIds.add(node.id)
    }
    for(const id of ids) {
      const root=await runtime.node(id)
      const settings=args.respectExportSettings&&Array.isArray(root.exportSettings)&&root.exportSettings.length?root.exportSettings:[{format:'PNG'}]
      if(settings.length>40)throw Error('Too many node export settings')
      for(const item of settings)await exportNode(root,item,'render')
      if(!args.includeOriginalImages&&!args.includeSvgAssets)continue
      const queue=[{node:root,insideBoolean:false}]
      while(queue.length){const {node,insideBoolean}=queue.shift();if(++visited>maxNodes)throw Error('Asset traversal exceeds maxNodes; select a smaller subtree')
        if(args.includeOriginalImages)for(const paint of Array.isArray(node.fills)?node.fills:[])if(paint.type==='IMAGE'&&paint.imageHash&&!hashes.has(paint.imageHash)){
          hashes.add(paint.imageHash);const image=f.getImageByHash(paint.imageHash);if(!image)throw Error('Original image unavailable: '+paint.imageHash)
          add(paint.imageHash+'.bin','application/octet-stream',await image.getBytesAsync(),{nodeId:node.id,imageHash:paint.imageHash,role:'original'})
        }
        if(args.includeSvgAssets&&!insideBoolean&&['VECTOR','BOOLEAN_OPERATION'].includes(node.type)&&!svgIds.has(node.id)){svgIds.add(node.id);const bytes=await node.exportAsync({format:'SVG'});add(node.name+'.svg','image/svg+xml',bytes,{nodeId:node.id,role:'vector',format:'SVG'})}
        if(Array.isArray(node.children)&&(args.includeOriginalImages||node.type!=='BOOLEAN_OPERATION')){if(visited+queue.length+node.children.length>maxNodes)throw Error('Asset traversal exceeds maxNodes; select a smaller subtree');for(const child of node.children)queue.push({node:child,insideBoolean:insideBoolean||node.type==='BOOLEAN_OPERATION'})}
      }
    }
    return {value:{exportCount:assets.length,mapping,complete:true},images:[],assets}
  }
  async function exportVideo(runtime,args) {
    const f=runtime.figma
    if(f.editorType!=='figma'||f.mode==='inspect'||f.mode==='codegen')throw Error('Native video export requires the Figma Design editor')
    const format=args.format??'MP4'
    if(!['MP4','GIF','WEBM'].includes(format))throw Error('Video format must be MP4, GIF or WEBM')
    if(args.fps!==undefined&&!(format==='GIF'?[8,12,15,24,30]:[12,24,30,60]).includes(args.fps))throw Error('Unsupported fps for '+format)
    if(args.quality!==undefined&&(format==='GIF'||!['LOW','MEDIUM','HIGH'].includes(args.quality)))throw Error('quality is LOW/MEDIUM/HIGH and applies only to MP4/WEBM')
    if(args.loopCount!==undefined){if(format!=='GIF')throw Error('loopCount applies only to GIF');integer(args.loopCount,0,0,1000,'loopCount')}
    if(args.constraint!==undefined){const c=args.constraint;if(!c||!['SCALE','WIDTH','HEIGHT'].includes(c.type)||!Number.isFinite(c.value)||c.value<=0||(c.type==='SCALE'?![0.5,0.75,1,1.5,2,3,4].includes(c.value):c.value>8192))throw Error('Invalid video size constraint; SCALE must be 0.5, 0.75, 1, 1.5, 2, 3 or 4')}
    if(current(runtime))throw Error('An export transfer is already active; finish or release it before exporting again')
    const node=await runtime.node(args.nodeId)
    let frame=typeof node.getTopLevelFrame==='function'?node.getTopLevelFrame():undefined
    if(!frame){let at=node;while(at&&at.type!=='PAGE'){if(at.type==='FRAME'&&at.parent?.type==='PAGE'){frame=at;break}at=at.parent}}
    if(!frame||frame.type!=='FRAME'||frame.parent?.type!=='PAGE'||typeof frame.exportAsync!=='function')throw Error('Target is not inside an exportable top-level animation frame')
    // Recheck after async node resolution, and never expire an encoder still in flight.
    if(current(runtime))throw Error('An export transfer is already active; finish or release it before exporting again')
    const pending={id:'export-'+Date.now().toString(36)+'-'+(++sequence).toString(36)+'-'+Math.random().toString(36).slice(2),expiresAt:Infinity,bytes:null}
    transfers.set(runtime,pending)
    try {
      const settings={format};for(const key of ['fps','quality','loopCount','constraint'])if(args[key]!==undefined)settings[key]=args[key]
      const bytes=await frame.exportAsync(settings)
      if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('Native encoder returned empty output')
      if(bytes.length>LIMIT)throw Error('Video exceeds 256 MiB; reduce quality, dimensions or duration')
      pending.bytes=bytes;renew(runtime,pending)
      return result({transfer:{transferId:pending.id,nodeId:frame.id,format,mimeType:{MP4:'video/mp4',GIF:'image/gif',WEBM:'video/webm'}[format],byteLength:bytes.length,chunkSize:CHUNK,expiresAt:new Date(pending.expiresAt).toISOString(),name:String(frame.name||'animation').slice(0,160)+'.'+format.toLowerCase()}})
    }catch(error){dispose(runtime,pending);throw Error('Native video export failed: '+errorText(error))}
  }
  async function execute(runtime,method,args={}) {
    if(method==='upload_assets'&&args.nodeIds===undefined&&(args.fillIndex!==undefined||args.scaleMode!==undefined))throw Error('Fill replacement options require nodeIds')
    if(method==='upload_assets'&&args.nodeIds!==undefined)return replaceImages(runtime,args)
    if(method==='download_assets'&&(args.respectExportSettings===true||args.includeSvgAssets===true))return download(runtime,args)
    if(method==='export_video')return exportVideo(runtime,args)
    if(method==='read_export_chunk'){
      const item=getTransfer(runtime,args.transferId),offset=integer(args.offset,0,0,item.bytes.length,'offset'),length=integer(args.length,CHUNK,1,CHUNK,'length')
      const bytes=item.bytes.subarray(offset,Math.min(offset+length,item.bytes.length));renew(runtime,item)
      return result({transferId:item.id,offset,byteLength:bytes.length,nextOffset:offset+bytes.length,done:offset+bytes.length===item.bytes.length,data:runtime.figma.base64Encode(bytes)})
    }
    if(method==='release_export'){
      const item=current(runtime);if(item&&item.id===args.transferId){dispose(runtime,item);return result({released:true})}return result({released:false})
    }
    return null
  }
  scope.DshFigmaMedia={execute}
})(globalThis)
