// MIT — Copyright (c) 2026 Duoasa.
// Capture in a new isolated browser. No existing browser profile or cloud capture service.
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

export function validateCaptureOptions(options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Capture options must be an object')
  if(typeof options.url!=='string'||options.url.length>8192)throw new Error('url must be an HTTP(S) URL of at most 8192 characters')
  let url;try{url=new URL(options.url)}catch{throw new Error('Invalid capture URL')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Capture requires an HTTP(S) URL without embedded credentials')
  const viewport=options.viewport??{width:1440,height:900}
  if(!viewport||typeof viewport!=='object'||Array.isArray(viewport))throw new Error('viewport must be an object')
  for(const [key,min,max]of [['width',320,3840],['height',200,2160]])if(!Number.isInteger(viewport[key])||viewport[key]<min||viewport[key]>max)throw new Error(`viewport.${key} must be an integer from ${min} to ${max}`)
  if(options.executablePath!==undefined&&(typeof options.executablePath!=='string'||!path.isAbsolute(options.executablePath)))throw new Error('executablePath must be an absolute path to an installed Chromium browser')
  if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))throw new Error('signal must be an AbortSignal')
  return {url:url.href,viewport:{width:viewport.width,height:viewport.height},executablePath:options.executablePath,signal:options.signal}
}

async function browserExecutable(explicit) {
  const candidates=explicit?[explicit]:[
    process.env.DSH_FIGMA_BROWSER_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean)
  for(const candidate of candidates){if(!path.isAbsolute(candidate))continue;try{await access(candidate,constants.X_OK);return candidate}catch{}}
  throw new Error('No installed Chromium browser found. Install Chrome/Chromium/Edge or provide executablePath; browser downloads are not performed.')
}

// Self-contained: sent to page.evaluate. Exported to test its output contract independently.
export function extractDomSnapshot({width,height,maxNodes=480,maxText=180000}={}) {
  const warnings=[],seenWarnings=new Set(),maxWarnings=200
  let inputNodeCount=0,textCount=0,truncated=false,omittedWarnings=0
  function warn(reason,element,detail){const key=reason+':'+(element?.tagName||'')+':'+(detail||'');if(seenWarnings.has(key))return;seenWarnings.add(key);if(warnings.length<maxWarnings)warnings.push({reason,tag:element?.tagName?.toLowerCase(),...(detail?{detail}:{})});else omittedWarnings++}
  function reserve(){if(inputNodeCount>=maxNodes){truncated=true;return false}inputNodeCount++;return true}
  const cssCanvas=document.createElement('canvas'),cssContext=cssCanvas.getContext('2d',{willReadFrequently:true});cssCanvas.width=1;cssCanvas.height=1
  function cssColor(value){
    if(!value||value==='transparent')return 'rgba(0, 0, 0, 0)'
    if(/^rgba?\([\d\s.,]+\)$/.test(value))return value
    if(!cssContext)return 'rgba(0, 0, 0, 0)'
    cssContext.clearRect(0,0,1,1);cssContext.fillStyle=value;cssContext.fillRect(0,0,1,1);const [r,g,b,a]=cssContext.getImageData(0,0,1,1).data
    return `rgba(${r}, ${g}, ${b}, ${a/255})`
  }
  function font(style){
    const families=style.fontFamily.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')),generics=new Set(['system-ui','ui-sans-serif','sans-serif','serif','monospace','-apple-system','BlinkMacSystemFont'])
    const family=families.find(f=>f&&!generics.has(f))||'Inter',weight=Number(style.fontWeight)||400,italic=style.fontStyle==='italic'||style.fontStyle==='oblique'
    const base=weight>=700?'Bold':weight>=600?'Semi Bold':weight>=500?'Medium':weight<=300?'Light':'Regular'
    return {fontFamily:family.slice(0,100),fontStyle:italic?(base==='Regular'?'Italic':base+' Italic'):base}
  }
  function textStyles(style){const f=font(style),line=parseFloat(style.lineHeight);return {...f,fontSize:Math.min(1000,Math.max(1,parseFloat(style.fontSize)||16)),color:cssColor(style.color),textAlign:['left','center','right','justify'].includes(style.textAlign)?style.textAlign:'left',...(Number.isFinite(line)?{lineHeight:Math.max(1,Math.min(3000,line))}:{})}}
  function number(value,max=30000){return Math.max(0,Math.min(max,parseFloat(value)||0))}
  function bounds(rect,parent){return {x:Math.max(-100000,Math.min(100000,rect.left-parent.left)),y:Math.max(-100000,Math.min(100000,rect.top-parent.top)),width:Math.max(.01,Math.min(30000,rect.width)),height:Math.max(.01,Math.min(30000,rect.height))}}
  function ownText(node,parentRect,style){
    let value=node.nodeValue||''
    if(!/pre|break-spaces/.test(style.whiteSpace))value=value.replace(/\s+/g,' ')
    if(!value.trim())return null
    if(value.length>20000){value=value.slice(0,20000);truncated=true;warn('text-truncated',node.parentElement,'Individual text run exceeds 20000 characters')}
    if(textCount+value.length>maxText){truncated=true;warn('text-budget',node.parentElement);return null}
    const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();range.detach()
    if(rect.width<=0||rect.height<=0||!reserve())return null
    textCount+=value.length
    return {tag:'text',text:value,bounds:bounds(rect,parentRect),styles:textStyles(style),children:[]}
  }
  function read(element,parentRect){
    const tag=element.tagName.toLowerCase()
    if(['script','style','noscript','link','meta','head','template'].includes(tag))return null
    const style=getComputedStyle(element),rect=element.getBoundingClientRect()
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||rect.width<=0||rect.height<=0)return null
    if(!Number.isFinite(rect.x)||!Number.isFinite(rect.y)||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)){warn('invalid-bounds',element);return null}
    if(rect.top+scrollY>=30000||rect.left+scrollX>=30000){truncated=true;warn('canvas-size-limit',element);return null}
    if(!reserve())return null
    const styles={backgroundColor:cssColor(style.backgroundColor),opacity:number(style.opacity,1),borderRadius:number(style.borderTopLeftRadius,10000),overflow:style.overflow==='hidden'||style.overflow==='clip'?style.overflow:'visible'}
    const border=number(style.borderTopWidth,1000)
    if(border>0&&style.borderTopStyle!=='none'){styles.borderWidth=border;styles.borderColor=cssColor(style.borderTopColor);if(style.borderTopStyle!=='solid')warn('border-style-approximated',element,style.borderTopStyle)}
    for(const property of ['backgroundImage','boxShadow','filter','backdropFilter','transform','clipPath'])if(style[property]&&style[property]!=='none')warn('unsupported-style',element,property)
    if(style.mixBlendMode!=='normal')warn('unsupported-style',element,'mixBlendMode')
    if(new Set([style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth]).size>1||new Set([style.borderTopColor,style.borderRightColor,style.borderBottomColor,style.borderLeftColor]).size>1)warn('nonuniform-border-approximated',element)
    if(new Set([style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius]).size>1)warn('nonuniform-radius-approximated',element)
    for(const pseudo of ['::before','::after']){const ps=getComputedStyle(element,pseudo);if(ps.content&&ps.content!=='none'&&ps.content!=='normal'&&ps.content!=='""')warn('pseudo-element-not-imported',element,pseudo)}
    const key=(element.id?tag+'#'+element.id:tag).slice(0,200),result={key,tag,bounds:bounds(rect,parentRect),styles,children:[]}
    if(['img','picture','video','canvas','iframe','svg','input','textarea','select'].includes(tag)){warn('asset-or-control-box-only',element);return result}
    if(element.shadowRoot)warn('shadow-dom-not-imported',element)
    for(const child of element.childNodes){if(inputNodeCount>=maxNodes){truncated=true;break}let captured;if(child.nodeType===Node.ELEMENT_NODE)captured=read(child,rect);else if(child.nodeType===Node.TEXT_NODE)captured=ownText(child,rect,style);if(captured)result.children.push(captured)}
    return result
  }
  const documentHeight=Math.max(height,document.documentElement.scrollHeight,document.body?.scrollHeight||0)
  if(documentHeight>30000){truncated=true;warn('canvas-height-clamped',document.documentElement)}
  const documentWidth=Math.max(width,document.documentElement.scrollWidth)
  if(documentWidth>width)warn('horizontal-overflow',document.documentElement,'Snapshot root width is the requested viewport width')
  const rootRect={left:-scrollX,top:-scrollY},body=document.body?read(document.body,rootRect):null
  return {snapshot:{name:(document.title||'Captured webpage').slice(0,200),width,height:Math.min(30000,documentHeight),children:body?[body]:[]},diagnostics:{title:document.title.slice(0,500),inputNodeCount,textCharacters:textCount,truncated,warnings,omittedWarnings,layoutContract:'Measured fixed DOM boxes and text; media, pseudo elements, shadows, filters, transforms and responsive behavior require review.'}}
}

export async function captureDomSnapshot(options) {
  const {url,viewport,executablePath,signal}=validateCaptureOptions(options)
  signal?.throwIfAborted()
  const executable=await browserExecutable(executablePath)
  const {chromium}=await import('playwright-core')
  signal?.throwIfAborted()
  const browser=await chromium.launch({executablePath:executable,headless:true,timeout:15000})
  let timedOut=false
  const deadline=setTimeout(()=>{timedOut=true;void browser.close().catch(()=>{})},45000)
  const onAbort=()=>{void browser.close().catch(()=>{})}
  signal?.addEventListener('abort',onAbort,{once:true})
  try{
    signal?.throwIfAborted()
    const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false})
    const page=await context.newPage()
    page.setDefaultTimeout(10000)
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000})
    if(response&&response.status()>=400)throw new Error('Capture page returned HTTP '+response.status())
    const finalUrl=validateCaptureOptions({url:page.url(),viewport}).url
    const settled=await page.evaluate(async()=>{
      const result=await Promise.race([document.fonts.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),3000))])
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
      window.scrollTo(0,0)
      return result
    })
    signal?.throwIfAborted()
    const result=await page.evaluate(extractDomSnapshot,viewport)
    if(Buffer.byteLength(JSON.stringify(result.snapshot),'utf8')>750000)throw new Error('Captured DOM snapshot exceeds 750 KB; use a smaller page or viewport')
    return {...result,diagnostics:{...result.diagnostics,url:finalUrl,requestedUrl:url,viewport,fontsSettled:settled,isolatedBrowser:true}}
  }catch(error){signal?.throwIfAborted();if(timedOut)throw new Error('Webpage capture exceeded the 45 second browser deadline');throw error}
  finally{clearTimeout(deadline);signal?.removeEventListener('abort',onAbort);await browser.close().catch(()=>{})}
}
