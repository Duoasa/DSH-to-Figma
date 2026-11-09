import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { preflightScript, ScriptPreflightError } from '../lib/script-preflight.mjs'
import { fixtureRuntime } from './fixtures.mjs'

test('legacy cleanup lookups execute once through the async API without a canvas scan',async()=>{
  const f=await fixtureRuntime(),a=f.figma.createFrame(),b=f.figma.createFrame()
  a.name='Reference Notice A';b.name='Reference Notice B'
  const removed=[],lookups=[]
  for(const n of [a,b])n.remove=()=>{removed.push(n.id);f.nodes.delete(n.id)}
  f.figma.getNodeById=()=>{throw Error('dynamic-page sync lookup forbidden')}
  const get=f.figma.getNodeByIdAsync
  f.figma.getNodeByIdAsync=async id=>{lookups.push(id);return get(id)}
  const code=`const expected=${JSON.stringify({[a.id]:a.name,[b.id]:b.name})};
    const results=[];
    for(const id of Object.keys(expected)){
      const node=figma.getNodeById(id);
      if(node&&node.name===expected[id]){node.remove();results.push(id)}
    }
    return results;`
  const output=await f.runtime.run('use_figma',{code:preflightScript(code)})
  assert.deepEqual([...output.value],[a.id,b.id]);assert.deepEqual(removed,[a.id,b.id])
  assert.deepEqual(lookups,[a.id,b.id]);assert.equal(f.undo,1);assert.equal(f.figma.currentPage,f.page)
})

test('legacy lookups preserve nesting, aliases, optional access, awaited calls and null results',async()=>{
  const f=await fixtureRuntime(),n=f.figma.createFrame()
  const code=`const api=figma; async function read(id){return api['getNodeById'](id)?.id??null;}
    const nested=figma.getNodeById(figma.getNodeById(${JSON.stringify(n.id)}).id);
    return [nested.id,await read('missing'),(await figma.getNodeById(${JSON.stringify(n.id)})).id,
      await (async()=>figma?.getNodeById(${JSON.stringify(n.id)})?.id)()];`
  const prepared=preflightScript(code)
  assert.equal(preflightScript(prepared),prepared)
  const output=await f.runtime.run('use_figma',{code:prepared})
  assert.deepEqual([...output.value],[n.id,null,n.id,n.id])
})

test('legacy compatibility leaves synchronous callbacks, strings, shadowed APIs and valid scripts unchanged',()=>{
  for(const code of [
    'return await figma.getNodeByIdAsync("1:2");',
    'return ids.map(id=>figma.getNodeById(id));',
    'function lookup(){return figma.getNodeById("1:2")} return lookup();',
    'async function lookup(n=figma.getNodeById("1:2")){return n} return lookup();',
    'class A { value=figma.getNodeById("1:2"); static { figma.getNodeById("1:2"); }}',
    'const figma={getNodeById(x){return x}};return figma.getNodeById(1);',
    'async function read(figma){return figma.getNodeById(1)}',
    'let api=figma;api={getNodeById(x){return x}};return api.getNodeById(1);',
    '// figma.getNodeById("1:2")\nreturn "figma.getNodeById(1)";',
  ])assert.equal(preflightScript(code),code)
})

test('syntax is located in the submitted script without evaluating it', () => {
  globalThis.preflightExecuted = false
  const code = 'globalThis.preflightExecuted = true;\nconst checks = [1].map(x { return x; });'
  assert.throws(() => preflightScript(code), error => {
    assert.ok(error instanceof ScriptPreflightError)
    assert.equal(error.diagnostic.code,'SCRIPT_SYNTAX')
    assert.equal(error.diagnostic.line,2)
    assert.equal(error.diagnostic.column,code.split('\n')[1].indexOf('{')+1)
    assert.match(error.diagnostic.hint,/No script ran/)
    return true
  })
  preflightScript('globalThis.preflightExecuted = true; return await Promise.resolve(1);')
  assert.equal(globalThis.preflightExecuted,false)
  delete globalThis.preflightExecuted
  for (const code of ['', null, 'x'.repeat(150001),'```js\nreturn 1;\n```']) assert.throws(()=>preflightScript(code),/INVALID_SCRIPT/)
  for (const code of ['const = invalid','with({}) {}','return {']) assert.throws(()=>preflightScript(code),/SCRIPT_SYNTAX/)
  assert.throws(()=>preflightScript('return {'),error=>error.diagnostic.line===1)
})

test('known Figma getters fail before creating or modifying anything', () => {
  const setup='const component = figma.createComponent();\nconst instance = component.createInstance();\n'
  for (const expression of ['instance.mainComponent.id','instance["mainComponent"]?.name','instance?.mainComponent','(await figma.getNodeByIdAsync("40:21")).mainComponent']) {
    assert.throws(()=>preflightScript(setup+'return '+expression),error=>error.diagnostic.code==='FIGMA_ASYNC_MAIN_COMPONENT'&&error.diagnostic.line===3)
  }
  for (const code of [
    setup+'const alias=instance; return alias.mainComponent;',
    setup+'const {mainComponent:main} = instance; return main;',
    setup+'const { ["mainComponent"]: main } = instance; return main;',
    'const page=figma.currentPage; return page.query("INSTANCE").first().mainComponent;',
    'return figma.currentPage.selection[0].mainComponent;',
    'const api=figma;const node=await api.getNodeByIdAsync("1:2");return node.mainComponent;',
  ]) assert.throws(()=>preflightScript(code),/FIGMA_ASYNC_MAIN_COMPONENT/)
})

test('ordinary data, selectors, comments and shadowed names are not blocked', () => {
  for (const code of [
    'const report={mainComponent:{id:"1:2"}};return report.mainComponent.id;',
    'const {mainComponent}={mainComponent:"ok"};return mainComponent;',
    'return figma.currentPage.query("INSTANCE[mainComponent.name=Button]").values(["mainComponent.id"]);',
    '// instance.mainComponent\nreturn "instance.mainComponent";',
    'const figma={currentPage:{mainComponent:1}};return figma.currentPage.mainComponent;',
    'function read(figma){return figma.currentPage.mainComponent;} return read({currentPage:{mainComponent:1}});',
    'const instance=figma.currentPage.selection[0];function read(instance){return instance.mainComponent;}return read({mainComponent:1});',
    'const instance=figma.currentPage.selection[0];{const instance={mainComponent:1};return instance.mainComponent;}',
    'const instance=figma.currentPage.selection[0];function read(){if(true){var instance={mainComponent:1};}return instance.mainComponent;}return read();',
    'let instance=figma.currentPage.selection[0];instance={mainComponent:1};return instance.mainComponent;',
    'let instance=figma.currentPage.selection[0];for(instance of [{mainComponent:1}]){return instance.mainComponent;}',
    'const instance=figma.currentPage.selection[0]; const main=await instance.getMainComponentAsync();return {mainComponent:main?.id};',
  ]) assert.doesNotThrow(()=>preflightScript(code),code)
})

test('existing real-editor scripts remain accepted', async () => {
  for (const file of ['figma-use-real-create.js','figma-use-real-verify.js']) {
    preflightScript(await readFile(new URL('./manual/'+file,import.meta.url),'utf8'))
  }
})

test('unproven dynamic access still gives actionable runtime guidance and remains unsafe to replay', async () => {
  const f=await fixtureRuntime(), instance=f.figma.createFrame()
  instance.type='INSTANCE';instance.getMainComponentAsync=async()=>null
  f.page.appendChild(instance)
  Object.defineProperty(instance,'mainComponent',{get(){throw new Error('native forbidden getter')}})
  const code='const n=figma.currentPage.children[0];n.name="changed";const key=["main","Component"].join("");return n[key];'
  preflightScript(code)
  await assert.rejects(f.runtime.run('use_figma',{code}),error=>{
    assert.equal(error.safeToRetryWithoutCanvasRead,false)
    assert.match(error.message,new RegExp(instance.id))
    assert.match(error.message,/getMainComponentAsync/)
    assert.match(error.message,/do not replay creation/)
    return true
  })
  assert.equal(instance.name,'changed')
  const result=await f.runtime.run('use_figma',{code:'const n=figma.currentPage.children[0];return {main:await n.getMainComponentAsync()};'})
  assert.equal(result.value.main,null)
})

test('local read-only motion collections fail before earlier creation statements can run',()=>{
  for(const field of ['manualKeyframeTracks','animationStyles','timelines','animations']) {
    assert.throws(()=>preflightScript(`const n=figma.createRectangle();n.${field}=[];`),error=>error.diagnostic?.code==='FIGMA_READONLY_MOTION_COLLECTION')
  }
  assert.doesNotThrow(()=>preflightScript('const data={};data.animationStyles=[];return data;'))
  assert.doesNotThrow(()=>preflightScript("const n=await figma.getNodeByIdAsync('1:2');n.applyManualKeyframeTrack({type:'PROPERTY',name:'OPACITY'},{keyframes:[]});"))
})
