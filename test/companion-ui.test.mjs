import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('metadata and results accept Figma outer-window and parent messages, rejecting foreign senders', async () => {
  const html = await readFile(new URL('../companion/ui.html', import.meta.url), 'utf8')
  const elements = new Map()
  const parent = { postMessage() {} }, top = {}
  const window = {}
  const context = vm.createContext({ window, parent, top, crypto, setInterval() {}, setTimeout(){}, clearTimeout(){}, document: {
    body: {dataset:{}},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {})
      return elements.get(selector)
    },
  } })
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context)
  const message = { data: { pluginMessage: { type: 'document', name: 'Canvas', editorType: 'figma' } } }
  window.onmessage({ ...message, source: top, origin: 'https://evil.example' })
  assert.equal(elements.get('#document'), undefined)
  window.onmessage({ ...message, source: {}, origin: 'https://www.figma.com' })
  assert.equal(elements.get('#document'), undefined)
  window.onmessage({ ...message, source: top, origin: 'https://www.figma.com' })
  assert.equal(elements.get('#document').textContent, 'Canvas · figma')
  for (const sender of [
    { source: top, origin: 'https://www.figma.com' },
    { source: top, origin: 'https://figma.com' },
    { source: parent, origin: 'null' },
  ]) {
    let received
    context.resolveResult = value => { received = value }
    vm.runInContext("pending.set('job-1', resolveResult)", context)
    const result = { type: 'result', id: 'job-1', ok: true, result: { value: 'readback' } }
    window.onmessage({ source: {}, origin: 'https://www.figma.com', data: { pluginMessage: result } })
    window.onmessage({ source: top, origin: 'https://www.figma.com.evil.example', data: { pluginMessage: result } })
    assert.equal(received, undefined)
    window.onmessage({ ...sender, data: { pluginMessage: result } })
    assert.equal(received, result)
    assert.equal(vm.runInContext("pending.has('job-1')", context), false)
  }
})

test('companion endpoint uses localhost and matches the manifest development allowlist', async () => {
  const html = await readFile(new URL('../companion/ui.html', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../companion/manifest.json', import.meta.url), 'utf8'))
  const endpoint = html.match(/const base='([^']+)'/)[1]
  assert.equal(endpoint, 'http://localhost:3055')
  assert.deepEqual(manifest.networkAccess.devAllowedDomains, [endpoint])
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none'])
})

async function uiHarness(fetcher){
 const html=await readFile(new URL('../companion/ui.html',import.meta.url),'utf8'),elements=new Map(),timers=[],messages=[]
 const parent={postMessage(message){messages.push(message)}},window={},document={body:{dataset:{}},querySelector(selector){if(!elements.has(selector))elements.set(selector,{value:'',textContent:''});return elements.get(selector)}}
 const ctx=vm.createContext({window,parent,top:{},document,crypto,URL,AbortSignal,fetch:fetcher,setInterval(){},setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){}})
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx)
 const send=message=>window.onmessage({source:parent,origin:'null',data:{pluginMessage:message}})
 const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve))}
 return {ctx,elements,timers,messages,send,flush,boot:()=>send({type:'document',name:'Auto Canvas',editorType:'figma',connection:{token:'a'.repeat(64),port:3055,version:'test'}})}
}
const ok=value=>({ok:true,status:200,json:async()=>value})
test('paired companion auto-connects and retries idle startup failure without manual token entry',async()=>{
 let attempts=0
 const h=await uiHarness(async(url,options)=>{
  assert.equal(options.headers.authorization,'Bearer '+'a'.repeat(64))
  if(url.endsWith('/connect')){attempts++;if(attempts===1)throw new Error('offline');return ok({connectionId:'connected'})}
  if(url.endsWith('/poll'))return new Promise(()=>{})
  throw new Error('unexpected request')
 })
 h.boot();await h.flush();assert.equal(attempts,1);assert.equal(h.timers.length,1)
 h.timers[0]();await h.flush();assert.equal(attempts,2);assert.equal(vm.runInContext('active',h.ctx),true)
 assert.equal(h.elements.get('#token')?.value??'','')
 assert.match(h.elements.get('#status').textContent,/Ready/)
})
test('companion never reconnects or replays after losing an operation result',async()=>{
 let connects=0,results=0
 const h=await uiHarness(async url=>{
  if(url.endsWith('/connect')){connects++;return ok({connectionId:'connected'})}
  if(url.endsWith('/poll'))return ok({id:'job-1',method:'use_figma',args:{code:'return 1'}})
  if(url.endsWith('/result')){results++;throw new Error('lost result acknowledgement')}
  throw new Error('unexpected request')
 })
 h.boot();await h.flush();assert.equal(h.messages.filter(m=>m.pluginMessage.type==='execute').length,1)
 h.send({type:'result',id:'job-1',ok:true,result:{value:1}});await h.flush()
 assert.equal(results,1);assert.equal(connects,1);assert.equal(h.timers.length,0);assert.equal(vm.runInContext('blocked',h.ctx),true)
 await h.elements.get('#connect').onclick();await h.flush();assert.equal(connects,1)
 assert.match(h.elements.get('#status').textContent,/不会重放/)
})
