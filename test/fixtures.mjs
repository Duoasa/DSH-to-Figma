import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
export const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')
export async function fixtureRuntime(){
  let sequence=1,undo=0;const nodes=new Map(),fonts=[]
  class Node {
    constructor(type){this.id=`1:${sequence++}`;this.name=type;this.type=type;this.width=100;this.height=100;this.x=0;this.y=0;this.fills=[];this.children=[];this.data={};nodes.set(this.id,this)}
    appendChild(child){if(!nodes.has(child.id)||!(child instanceof Node))throw new Error('Expected actual Figma node');if(child.parent)child.parent.children=child.parent.children.filter(n=>n!==child);this.children.push(child);child.parent=this}
    resize(w,h){this.width=w;this.height=h}
    findAll(fn){return this.children.flatMap(n=>[...(fn(n)?[n]:[]),...n.findAll(fn)])}
    findAllWithCriteria({types}){return this.findAll(n=>types.includes(n.type))}
    async exportAsync(){return new Uint8Array(PNG)}
    async getCSSAsync(){return {display:'flex'}}
    getPluginData(key){return this.data[key]||''}
    setPluginData(key,value){this.data[key]=value}
    async loadAsync(){}
  }
  const root=new Node('DOCUMENT'),page=new Node('PAGE');root.appendChild(page);page.selection=[]
  const vars=[{id:'VariableID:1',key:'variable1',name:'color/primary',resolvedType:'COLOR',valuesByMode:{light:{r:1,g:0,b:0}},scopes:['ALL_SCOPES'],variableCollectionId:'collection1'}]
  const figma={root,currentPage:page,editorType:'figma',viewport:{center:{x:200,y:300}},
    createFrame:()=>new Node('FRAME'),createText:()=>new Node('TEXT'),createRectangle:()=>new Node('RECTANGLE'),createEllipse:()=>new Node('ELLIPSE'),createComponent:()=>new Node('COMPONENT'),createSection:()=>new Node('SECTION'),createPage:()=>{const p=new Node('PAGE');p.selection=[];root.appendChild(p);return p},createSticky:()=>new Node('STICKY'),createShapeWithText:()=>new Node('SHAPE_WITH_TEXT'),
    getNodeByIdAsync:async id=>nodes.get(id)??null,loadFontAsync:async font=>fonts.push(font),listAvailableFontsAsync:async()=>[{fontName:{family:'Inter',style:'Regular'}}],
    setCurrentPageAsync:async p=>{figma.currentPage=p},commitUndo:()=>undo++,base64Encode:bytes=>Buffer.from(bytes).toString('base64'),base64Decode:s=>new Uint8Array(Buffer.from(s,'base64')),
    variables:{getLocalVariableCollectionsAsync:async()=>[{id:'collection1',name:'Theme',modes:[{modeId:'light',name:'Light'}],defaultModeId:'light',variableIds:['VariableID:1']}],getLocalVariablesAsync:async()=>vars},
    teamLibrary:{getAvailableLibraryVariableCollectionsAsync:async()=>[]},getLocalPaintStylesAsync:async()=>[{id:'paint:1',name:'Surface',type:'PAINT'}],getLocalTextStylesAsync:async()=>[],getLocalEffectStylesAsync:async()=>[],getLocalGridStylesAsync:async()=>[],
    createImage:bytes=>({hash:'imagehash',getSizeAsync:async()=>({width:320,height:200})}),getImageByHash:()=>({getBytesAsync:async()=>new Uint8Array(PNG)}),createNodeFromSvg:()=>new Node('FRAME')}
  const context=vm.createContext({Uint8Array,Promise,Buffer,console,setTimeout,clearTimeout})
  vm.runInContext(await readFile(new URL('../companion/runtime.js',import.meta.url),'utf8'),context)
  const runtime=new context.DshFigmaRuntime(figma)
  return {runtime,figma,page,nodes,fonts,get undo(){return undo}}
}
export async function request(bridge,path,data={},overrides={}){
  return fetch(`http://127.0.0.1:${bridge.port}${path}`,{method:'POST',headers:{authorization:`Bearer ${bridge.token}`,'content-type':'application/json',...overrides.headers},body:JSON.stringify(data),...overrides})
}
export async function connect(bridge,name='Canvas'){const response=await request(bridge,'/connect',{name,editorType:'figma'});return (await response.json()).connectionId}
export async function runJob(bridge,id,runtime){
  const response=await request(bridge,'/poll',{connectionId:id}),job=await response.json()
  if(!job.id)throw new Error('No queued job')
  let payload
  try{payload={ok:true,result:await runtime.run(job.method,job.args)}}catch(e){payload={ok:false,error:e.message}}
  const posted=await request(bridge,'/result',{connectionId:id,id:job.id,...payload})
  if(posted.status!==200)throw new Error('Result rejected')
  return job
}
