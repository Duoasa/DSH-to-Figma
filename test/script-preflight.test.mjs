import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { preflightScript, ScriptPreflightError } from '../lib/script-preflight.mjs'
import { fixtureRuntime } from './fixtures.mjs'

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
