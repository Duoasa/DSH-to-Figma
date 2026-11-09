import test from 'node:test'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {fixtureRuntime,request,connect} from './fixtures.mjs'
import {LocalBridge} from '../lib/bridge.mjs'

test('file reference persists across runtime restart, follows rename and never changes the page or source',async()=>{
 const {runtime,figma,page,nodes}=await fixtureRuntime(),source=figma.createFrame();source.name='参考';page.appendChild(source)
 const second=figma.createPage();figma.currentPage=second;second.selection=[]
 let exports=0;source.exportAsync=async()=>{exports++;return new Uint8Array([137,80])}
 const bound=await runtime.run('set_design_reference',{nodeId:source.id})
 assert.equal(bound.value.reference.name,'参考');assert.equal(figma.currentPage,second);assert.equal(exports,0)
 const restarted=new runtime.constructor(figma)
 source.name='改名后';const read=await restarted.run('get_design_reference')
 assert.equal(read.value.reference.nodeId,source.id);assert.equal(read.value.reference.name,'改名后');assert.equal(exports,0)
 await restarted.run('get_design_reference',{includePreview:true});assert.equal(exports,1);assert.equal(figma.currentPage,second)
 nodes.delete(source.id);assert.equal((await restarted.run('get_design_reference')).value.reference.state,'missing')
 assert.equal((await restarted.run('clear_design_reference')).value.reference,null)
 assert.equal(page.children.length,1);assert.equal(figma.currentPage,second)
})
test('selection validation and invalid spec do not replace a valid binding; file references stay isolated',async()=>{
 const {runtime,figma,page}=await fixtureRuntime(),other=await fixtureRuntime()
 await runtime.run('set_design_reference',{kind:'spec',name:'品牌规范',content:'主色 #2277FF'})
 assert.equal((await other.runtime.run('get_design_reference')).value.reference,null)
 for(const args of [{},{kind:'spec',name:'无内容'},{nodeId:'missing'}])await assert.rejects(runtime.run('set_design_reference',args),e=>e.safeToRetryWithoutCanvasRead===true)
 assert.equal((await runtime.run('get_design_reference')).value.reference.content,'主色 #2277FF')
 const frame=figma.createFrame();page.appendChild(frame);page.selection=[frame]
 assert.equal((await runtime.run('set_design_reference',{})).value.reference.nodeId,frame.id)
 assert.equal(page.selection[0],frame)
})
test('preview failure never loses binding and spec references never export images',async()=>{
 const {runtime,figma,page}=await fixtureRuntime(),frame=figma.createFrame();page.appendChild(frame)
 frame.exportAsync=async()=>{throw Error('export failed')}
 await runtime.run('set_design_reference',{nodeId:frame.id})
 const preview=await runtime.run('get_design_reference',{includePreview:true})
 assert.equal(preview.value.reference.state,'bound');assert.match(preview.value.previewError,/缩略图/);assert.equal(preview.images.length,0)
 await runtime.run('set_design_reference',{kind:'spec',nodeId:frame.id})
 const spec=await runtime.run('get_design_reference',{includePreview:true});assert.equal(spec.value.previewError,undefined)
 assert.equal(spec.images.length,0)
})
test('bridge status stores bounded descriptor without content or thumbnail; explicit UI updates do not clear write uncertainty',async t=>{
 const bridge=await new LocalBridge({token:'a'.repeat(64),port:0}).start();t.after(()=>bridge.close())
 const id=await connect(bridge,'Ref',5),doc=bridge.documents.get(id);doc.uncertain=true
 const response=await request(bridge,'/reference',{connectionId:id,designReference:{kind:'spec',name:'Brand',content:'private spec',images:['large image'],revision:'v1'}})
 assert.equal(response.status,200)
 assert.deepEqual(bridge.list()[0].designReference,{kind:'spec',name:'Brand',state:'bound',revision:'v1'})
 assert.equal(doc.uncertain,true)
 await request(bridge,'/heartbeat',{connectionId:id,designReference:null});assert.equal(bridge.list()[0].designReference,null)
})

test('generated companion boots all extensions together and describes persisted reference without export',async()=>{
 const {figma}=await fixtureRuntime(),messages=[]
 figma.showUI=()=>{};figma.ui={postMessage:message=>messages.push(message)}
 const context=vm.createContext({figma,__html__:'',Uint8Array,console,setTimeout,clearTimeout})
 vm.runInContext(await readFile(new URL('../companion/code.js',import.meta.url),'utf8'),context)
 await figma.ui.onmessage({type:'describe'})
 assert.equal(messages[0].type,'document');assert.equal(messages[0].designReference,null)
})
