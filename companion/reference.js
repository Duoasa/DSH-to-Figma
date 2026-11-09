/* One lightweight, file-owned reference. No scans, images or source copies on disk. */
;(function(scope){
  const KEY='dsh.design-reference.v1'
  const FRAME_TYPES=new Set(['FRAME','COMPONENT','COMPONENT_SET','SECTION','GROUP'])
  function stored(figma){
    const raw=figma.root.getPluginData(KEY)
    if(!raw)return null
    try{const value=JSON.parse(raw);if(value.version===1&&['frame','spec'].includes(value.kind)&&typeof value.name==='string')return value}catch{}
    return {version:1,kind:'spec',name:'无法读取的设计参考',state:'invalid'}
  }
  function summary(value){
    if(!value)return null
    const result={kind:value.kind,name:value.name,state:value.state||'bound'}
    for(const key of ['nodeId','pageId','revision'])if(typeof value[key]==='string')result[key]=value[key]
    return result
  }
  async function read(figma){
    const value=stored(figma)
    if(!value||!value.nodeId)return value
    const node=await figma.getNodeByIdAsync(value.nodeId)
    if(!node||node.removed)return {...value,state:'missing'}
    let page=node.parent;while(page&&page.type!=='PAGE')page=page.parent
    return {...value,name:node.name,pageId:page?.id,state:'bound'}
  }
  async function execute(runtime,method,args={}){
    if(!['get_design_reference','set_design_reference','clear_design_reference'].includes(method))return null
    const f=runtime.figma,images=[]
    let reference
    if(method==='set_design_reference'){
      const kind=args.kind||'frame'
      if(!['frame','spec'].includes(kind))throw Error('请选择画板或规范引用。')
      let node=null
      if(args.nodeId)node=await f.getNodeByIdAsync(args.nodeId)
      else if(kind==='frame'){
        if(f.currentPage.selection.length!==1)throw Error('请先选中一个参考画板，再点击绑定。')
        node=f.currentPage.selection[0]
      }
      if((args.nodeId&&!node)||node?.removed)throw Error('参考对象不存在，请重新选择。')
      if(kind==='frame'&&(!node||!FRAME_TYPES.has(node.type)))throw Error('请选择画板、组件、分区或组作为参考。')
      if(kind==='spec'&&node&&!FRAME_TYPES.has(node.type)&&node.type!=='TEXT')throw Error('请选择规范画板或文字作为引用。')
      const name=node?node.name:args.name
      if(typeof name!=='string'||!name.trim()||name.length>500)throw Error('请提供 1–500 字的参考名称。')
      if(args.content!==undefined&&(typeof args.content!=='string'||args.content.length>10000))throw Error('规范内容最多 10000 字。')
      if(kind==='spec'&&!node&&(!args.content||!args.content.trim()))throw Error('名称引用需要规范内容；也可以绑定已有规范的 nodeId。')
      reference={version:1,kind,name,revision:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),...(node?{nodeId:node.id}:{}),...(kind==='spec'&&!node?{content:args.content}:{})}
      runtime.mutationEntered=true
      f.root.setPluginData(KEY,JSON.stringify(reference))
      reference=await read(f)
    }else if(method==='clear_design_reference'){
      runtime.mutationEntered=true;f.root.setPluginData(KEY,'');reference=null
    }else reference=await read(f)
    let previewError
    if(args.includePreview===true&&reference?.kind==='frame'&&reference.state==='bound'){
      try{images.push(await runtime.screenshot(await f.getNodeByIdAsync(reference.nodeId),{maxDimension:160}))}
      catch{previewError='缩略图暂时无法读取，参考绑定仍然有效。'}
    }
    return {value:{reference,...(previewError?{previewError}:{})},images}
  }
  async function locate(figma){
    const reference=await read(figma)
    if(!reference?.nodeId||reference.state!=='bound')throw Error('参考对象不存在，或没有可定位的画板。')
    const node=await figma.getNodeByIdAsync(reference.nodeId),page=await figma.getNodeByIdAsync(reference.pageId)
    if(figma.currentPage.id!==page.id)await figma.setCurrentPageAsync(page)
    figma.currentPage.selection=[node];figma.viewport.scrollAndZoomIntoView([node])
  }
  scope.DshFigmaReference={stored,summary,read,execute,locate}
})(globalThis)
