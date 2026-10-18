/* MIT — Copyright (c) 2026 Duoasa. Runs inside the Figma plugin sandbox only. */
;(function (scope) {
  const MAX_NODES = 1500
  const fields = ['id','name','type','visible','locked','x','y','width','height','rotation','opacity','blendMode','fills','strokes','strokeWeight','strokeAlign','effects','cornerRadius','layoutMode','layoutWrap','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutSizingHorizontal','layoutSizingVertical','itemSpacing','counterAxisSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','clipsContent','characters','fontName','fontSize','fontWeight','textAlignHorizontal','textAlignVertical','textAutoResize','lineHeight','letterSpacing','boundVariables','componentProperties','componentPropertyDefinitions','variantProperties','reactions']
  const jsonValue = value => value === undefined || typeof value === 'symbol' ? undefined : JSON.parse(JSON.stringify(value))
  class Runtime {
    constructor(figma) { this.figma = figma }
    async node(id) {
      const node = id ? await this.figma.getNodeByIdAsync(id.replace(/^(\d+)-(\d+)$/, '$1:$2')) : this.figma.currentPage.selection[0]
      if (!node) throw new Error('Select a node in Figma or provide an existing nodeId')
      return node
    }
    snapshot(node, depth, budget = { count: 0 }) {
      if (++budget.count > MAX_NODES) return { id: node.id, truncated: true }
      const result = {}
      for (const key of fields) { try { const value = jsonValue(node[key]); if (value !== undefined) result[key] = value } catch {} }
      if (node.type === 'TEXT' && typeof node.getStyledTextSegments === 'function') {
        try { result.textSegments = jsonValue(node.getStyledTextSegments(['fontName','fontSize','fills','textDecoration','textCase','lineHeight','letterSpacing'])).slice(0,2000) } catch {}
      }
      if (node.children) {
        result.childCount = node.children.length
        if (depth > 0) {
          result.children = []
          for (const child of node.children) { if (budget.count >= MAX_NODES) { result.truncated = true; break }; result.children.push(this.snapshot(child, depth - 1, budget)) }
        }
      }
      return result
    }
    async screenshot(node, args = {}) {
      if (typeof node.exportAsync !== 'function') throw new Error('This node cannot be exported; choose a frame or scene node')
      const scale = args.scale ?? Math.min(1, 1600 / Math.max(node.width || 1, node.height || 1))
      if (!Number.isFinite(scale) || scale < 0.01 || scale > 4) throw new Error('Screenshot scale must be 0.01–4')
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale }, contentsOnly: args.contentsOnly !== false })
      if (bytes.length > 8 * 1024 * 1024) throw new Error('Screenshot exceeds 8 MiB; select a smaller node or scale')
      return { type: 'image', mimeType: 'image/png', data: this.figma.base64Encode(bytes) }
    }
    facade(images) {
      const runtime = this, figma = this.figma, cache = new WeakMap(), raws = new WeakMap()
      const unwrap = value => raws.get(value) || (Array.isArray(value) ? value.map(unwrap) : value)
      const set = (node, props) => {
        if ('width' in props || 'height' in props) node.resize(props.width ?? node.width, props.height ?? node.height)
        for (const [key, value] of Object.entries(props)) if (!['width','height','__proto__','constructor','prototype'].includes(key)) node[key] = unwrap(value)
        return wrap(node)
      }
      const query = (node, selector) => {
        const m = /^(\*|[A-Z_]+)?(?:\[name=(?:"([^"]*)"|'([^']*)'|([^\]]+))\])?$/.exec(selector)
        if (!m || !selector) throw new Error('Local query supports TYPE, [name="exact"], or TYPE[name="exact"]')
        const matches = node.findAll(child => (!m[1] || m[1] === '*' || child.type === m[1]) && (m[2] === undefined && m[3] === undefined && m[4] === undefined || child.name === (m[2] ?? m[3] ?? m[4])))
        const result = matches.map(wrap)
        result.set = props => { for (const item of matches) set(item, props); return result }
        return result
      }
      function wrap(value) {
        if (!value || typeof value !== 'object') return value
        if (value instanceof Promise) return value.then(wrap)
        if (Array.isArray(value)) return value.map(wrap)
        if (value !== figma && !(typeof value.id === 'string' && typeof value.type === 'string')) return value
        if (cache.has(value)) return cache.get(value)
        const proxy = new Proxy({}, {
          get(_target, key) {
            const target = value
            if (key === 'set') return props => set(target, props)
            if (key === 'query' && target.findAll) return selector => query(target, selector)
            if (key === 'screenshot' && target.exportAsync) return async opts => { if (images.length >= 4) throw new Error('Maximum four screenshots per operation'); images.push(await runtime.screenshot(target, opts)); return { id: target.id, screenshot: true } }
            if (target === figma && key === 'createAutoLayout') return (direction = 'HORIZONTAL', props = {}) => {
              if (typeof direction === 'object') { props = direction; direction = 'HORIZONTAL' }
              if (!['HORIZONTAL','VERTICAL'].includes(direction)) throw new Error('Invalid auto-layout direction')
              const frame = figma.createFrame(); frame.layoutMode = direction
              frame.primaryAxisSizingMode = 'AUTO'; frame.counterAxisSizingMode = 'AUTO'
              return set(frame, props)
            }
            const v = target[key]
            return typeof v === 'function' ? (...args) => wrap(v.apply(target, args.map(unwrap))) : wrap(v)
          },
          set(_target, key, next) { value[key] = unwrap(next); return true }
        })
        cache.set(value, proxy); raws.set(proxy, value); return proxy
      }
      return wrap(figma)
    }
    async run(method, args = {}) {
      const f = this.figma, images = [], depth = Math.max(0, Math.min(10, args.depth ?? 3))
      let value, assets
      switch (method) {
        case 'use_figma': {
          if (typeof args.code !== 'string' || !args.code.trim() || args.code.length > 150000) throw new Error('Provide a script of 1–150000 characters')
          const run = new Function('figma', 'dsh', '"use strict"; return (async () => {\n' + args.code + '\n})()')
          value = await run(this.facade(images), { color(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) throw new Error('Use a six-digit hex color'); const n = parseInt(m[1],16); return { r: ((n>>16)&255)/255, g: ((n>>8)&255)/255, b: (n&255)/255 } } })
          f.commitUndo(); break
        }
        case 'get_selection': value = { page: this.snapshot(f.currentPage, 0), selection: f.currentPage.selection.map(n => this.snapshot(n, 0)) }; break
        case 'list_fonts': value = await f.listAvailableFontsAsync(); break
        case 'get_metadata': {
          if(args.nodeId) { const target=await this.node(args.nodeId); if(target.type==='PAGE'&&typeof target.loadAsync==='function')await target.loadAsync(); value=this.snapshot(target,depth) }
          else value={pages:f.root.children.map(p=>({id:p.id,name:p.name,type:p.type})),currentPage:this.snapshot(f.currentPage,depth)}
          break
        }
        case 'get_screenshot': { const node = await this.node(args.nodeId); images.push(await this.screenshot(node,args)); value = { id: node.id, name: node.name }; break }
        case 'get_design_context':
        case 'get_figjam': {
          const node = await this.node(args.nodeId); value = { node: this.snapshot(node, depth), source: 'local-plugin-api', codeGeneration: 'Adapt structure and CSS to the project; no cloud code generation was called.' }
          if (typeof node.getCSSAsync === 'function') value.css = await node.getCSSAsync()
          if (node.type === 'INSTANCE') { const main = await node.getMainComponentAsync(); value.mainComponent = main ? this.snapshot(main, 0) : null }
          if (args.includeScreenshot !== false) images.push(await this.screenshot(node,args))
          break
        }
        case 'get_variable_defs': {
          const collections = await f.variables.getLocalVariableCollectionsAsync(), variables = await f.variables.getLocalVariablesAsync()
          value = { collections: collections.map(c => ({ id: c.id,name:c.name,modes:c.modes,defaultModeId:c.defaultModeId,variableIds:c.variableIds })), variables: variables.map(v => ({ id:v.id,key:v.key,name:v.name,resolvedType:v.resolvedType,valuesByMode:v.valuesByMode,scopes:v.scopes,description:v.description,variableCollectionId:v.variableCollectionId })) }; break
        }
        case 'get_libraries': value = { variableCollections: await f.teamLibrary.getAvailableLibraryVariableCollectionsAsync(), scope: 'Libraries exposed to this plugin; component discovery is local-page only.' }; break
        case 'search_design_system': {
          const q = String(args.query || '').toLowerCase()
          const nodes = f.currentPage.findAllWithCriteria({ types: ['COMPONENT','COMPONENT_SET'] }).filter(n => n.name.toLowerCase().includes(q)).slice(0,200)
          const variables = (await f.variables.getLocalVariablesAsync()).filter(v => v.name.toLowerCase().includes(q)).slice(0,200)
          const styles = (await Promise.all([f.getLocalPaintStylesAsync(), f.getLocalTextStylesAsync(), f.getLocalEffectStylesAsync(), f.getLocalGridStylesAsync()])).flat().filter(s => s.name.toLowerCase().includes(q)).slice(0,200)
          value = { scope: 'current-page components, local-file variables and styles', components: nodes.map(n=>this.snapshot(n,0)), variables: variables.map(v=>({id:v.id,name:v.name,resolvedType:v.resolvedType})), styles: styles.map(s=>({id:s.id,key:s.key,name:s.name,type:s.type})) }; break
        }
        case 'get_component_context': { const n = await this.node(args.nodeId); if (!['COMPONENT','COMPONENT_SET','INSTANCE'].includes(n.type)) throw new Error('Expected a component, component set, or instance'); value = this.snapshot(n,depth); break }
        case 'get_local_component_links': { const n=await this.node(args.nodeId); value = JSON.parse(n.getPluginData('dsh-code-links') || '[]'); break }
        case 'set_local_component_links': {
          if (!Array.isArray(args.links) || args.links.length > 100) throw new Error('Expected at most 100 component links')
          const n=await this.node(args.nodeId); n.setPluginData('dsh-code-links',JSON.stringify(args.links)); value={id:n.id,links:args.links,scope:'DSH plugin data; not published Figma Code Connect'}; f.commitUndo(); break
        }
        case 'get_motion_context': { const n=await this.node(args.nodeId); value={id:n.id,reactions:jsonValue(n.reactions) || [], motion:jsonValue(n.motion) ?? null,scope:'Public Plugin API only; cloud timeline conversion is not emulated'}; break }
        case 'download_assets': {
          const ids = args.nodeIds || (args.nodeId ? [args.nodeId] : f.currentPage.selection.map(n=>n.id))
          if (!Array.isArray(ids) || !ids.length || ids.length > 20) throw new Error('Select or specify 1–20 nodes')
          const format = String(args.format || 'PNG').toUpperCase()
          if (!['PNG','JPG','SVG','PDF'].includes(format)) throw new Error('Supported formats: PNG, JPG, SVG, PDF')
          assets=[]; let total=0; const hashes=new Set()
          const add = (name,mime,bytes) => { total+=bytes.length; if(total>12*1024*1024) throw new Error('Asset batch exceeds 12 MiB; export fewer or smaller nodes'); assets.push({name,mimeType:mime,data:f.base64Encode(bytes)}) }
          for (const id of ids) {
            const node = await this.node(id), options={format}
            if (['PNG','JPG'].includes(format)) { const scale=args.scale??1; if(!Number.isFinite(scale)||scale<0.01||scale>4) throw new Error('Scale must be 0.01–4'); options.constraint={type:'SCALE',value:scale} }
            add(node.name+'.'+format.toLowerCase(),{PNG:'image/png',JPG:'image/jpeg',SVG:'image/svg+xml',PDF:'application/pdf'}[format],await node.exportAsync(options))
            if(args.includeOriginalImages) {
              const nodes=[node,...(node.findAll?node.findAll(n=>Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')):[])]
              for(const child of nodes) for(const paint of Array.isArray(child.fills)?child.fills:[]) if(paint.type==='IMAGE'&&paint.imageHash&&!hashes.has(paint.imageHash)) {
                hashes.add(paint.imageHash); if(hashes.size>20) throw new Error('More than 20 source images; select a smaller subtree')
                const image=f.getImageByHash(paint.imageHash); if(image) add(paint.imageHash+'.bin','application/octet-stream',await image.getBytesAsync())
              }
            }
          }
          value={exportCount:assets.length}; break
        }
        case 'upload_assets': {
          if(!Array.isArray(args.assets)||!args.assets.length||args.assets.length>20) throw new Error('Upload 1–20 assets')
          const parent=args.parentId?await this.node(args.parentId):f.currentPage
          if(!parent.appendChild) throw new Error('Parent does not accept children')
          const ids=[]; let x=f.viewport.center.x, y=f.viewport.center.y
          for(const asset of args.assets) {
            let node
            if(asset.mimeType==='image/svg+xml') node=f.createNodeFromSvg(asset.svg)
            else { const image=f.createImage(f.base64Decode(asset.data)); const size=await image.getSizeAsync(); node=f.createRectangle(); node.resize(size.width,size.height); node.fills=[{type:'IMAGE',imageHash:image.hash,scaleMode:'FILL'}] }
            node.name=asset.name; parent.appendChild(node)
            if(!parent.layoutMode||parent.layoutMode==='NONE') { node.x=x; node.y=y; x+=node.width+32 }
            ids.push(node.id)
          }
          f.commitUndo(); value={nodeIds:ids}; break
        }
        case 'import_scene': {
          let count=0; const ids=[]
          const create=async (spec,parent) => {
            if(++count>500) throw new Error('Scene exceeds 500 nodes')
            const constructors={FRAME:'createFrame',TEXT:'createText',RECTANGLE:'createRectangle',ELLIPSE:'createEllipse',COMPONENT:'createComponent',SECTION:'createSection',STICKY:'createSticky',SHAPE_WITH_TEXT:'createShapeWithText'}
            const method=constructors[spec.type]; if(!method||typeof f[method]!=='function') throw new Error('Unsupported scene node type: '+spec.type)
            const n=f[method](); parent.appendChild(n); ids.push(n.id)
            const props=spec.props||{}
            if(n.type==='TEXT') { const font=props.fontName||{family:'Inter',style:'Regular'}; await f.loadFontAsync(font); n.fontName=font }
            if('width'in props||'height'in props) n.resize(props.width??n.width,props.height??n.height)
            for(const [key,v] of Object.entries(props)) if(fields.includes(key)&&!['id','type','width','height','boundVariables','componentProperties','componentPropertyDefinitions','variantProperties'].includes(key)) n[key]=v
            if(spec.children) { if(!n.appendChild) throw new Error('Leaf node cannot have children'); for(const child of spec.children) await create(child,n) }
            return n
          }
          const parent=args.parentId?await this.node(args.parentId):f.currentPage
          if(!Array.isArray(args.nodes)||!args.nodes.length) throw new Error('Provide a non-empty nodes array')
          for(const spec of args.nodes) await create(spec,parent)
          f.commitUndo(); value={nodeIds:ids,count}; break
        }
        default: throw new Error('Unknown local Figma operation: '+method)
      }
      const result = { value: jsonValue(value) ?? null, images, ...(assets ? { assets } : {}) }
      if(JSON.stringify(result).length>23*1024*1024) throw new Error('Result too large; return IDs and bounded metadata')
      return result
    }
  }
  scope.DshFigmaRuntime = Runtime
})(globalThis)

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
