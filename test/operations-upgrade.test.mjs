import test from 'node:test'
import assert from 'node:assert/strict'
import {fixtureRuntime} from './fixtures.mjs'

const json = value => JSON.parse(JSON.stringify(value))
const frame = f => { const n = f.figma.createFrame(); f.page.appendChild(n); return n }
const rect = f => { const n = f.figma.createRectangle(); n.opacity = 1; n.visible = true; n.locked = false; f.page.appendChild(n); return n }
const op = (node, properties, extra = {}) => ({type:'set_properties',nodeId:node.id,properties,...extra})
const track = (a, b, end = 1, easing = {type:'LINEAR'}) => ({id:'binding',baseValue:{type:'FLOAT',value:a},keyframes:[{id:'a',timelinePosition:0,value:{type:'FLOAT',value:a},easing:{type:'LINEAR'}},{id:'b',timelinePosition:end,value:{type:'FLOAT',value:b},easing}]})
function motionNode(n) { n.manualKeyframeTracks = {}; n.animationStyles = []; n.timelines = [{id:n.id,duration:1}]; n.reactions = []; n.motion = {}; return n }
function text(f) {
  const n = f.figma.createText(); f.page.appendChild(n)
  Object.assign(n,{characters:'Before',fontName:{family:'Inter',style:'Regular'},fontSize:16,textAutoResize:'NONE',textStyleId:'',fillStyleId:'',boundVariables:{}})
  n.getStyledTextSegments = () => [{characters:n.characters,start:0,end:n.characters.length,fontName:n.fontName,fontSize:n.fontSize,fills:[],textStyleId:'',hyperlink:null,listOptions:{type:'NONE'}}]
  return n
}

test('recursive motion inventories raw native fields with honest depth and node coverage', async () => {
  const f = await fixtureRuntime(), root = motionNode(frame(f)), child = motionNode(frame(f)), deep = motionNode(rect(f))
  root.appendChild(child); child.appendChild(deep); deep.manualKeyframeTracks.OPACITY = track(0,1)
  const result = (await f.runtime.execute('get_motion_context',{nodeId:root.id,recursive:true,maxDepth:1})).value
  assert.equal(result.nodes.length,2)
  assert.equal(result.coverage.traversalComplete,false)
  assert.deepEqual(json(result.coverage.limits),['maxDepth'])
  const bounded = (await f.runtime.execute('get_motion_context',{nodeId:root.id,recursive:true,maxNodes:1})).value
  assert.equal(bounded.nodes.length,1); assert.ok(bounded.coverage.limits.includes('maxNodes'))
  const complete = (await f.runtime.execute('get_motion_context',{nodeId:root.id,recursive:true})).value
  assert.equal(complete.nodes.length,3); assert.equal(complete.coverage.complete,true)
  assert.equal(complete.nodes[2].manualKeyframeTracks.OPACITY.keyframes[1].value.value,1)
  assert.equal(f.undo,0)
})

test('recursive motion enforces total UTF-8 response budget and reports unreadable fields', async () => {
  const f = await fixtureRuntime(), root = motionNode(frame(f))
  for (let i = 0; i < 20; i++) { const child = rect(f); child.name = '中文'.repeat(300); root.appendChild(child) }
  Object.defineProperty(root,'animationStyles',{get(){throw Error('disabled here')}})
  const result = (await f.runtime.execute('get_motion_context',{nodeId:root.id,recursive:true,codeFormat:'css',maxBytes:4096})).value
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 4096)
  assert.equal(result.coverage.complete,false)
  assert.ok(result.coverage.unavailableFields > 0)
  assert.equal(result.conversion.complete,false)
  assert.ok(result.continuation)
})

test('CSS uses native destination easing, clockwise rotation and independent transform channels', async () => {
  const f = await fixtureRuntime(), node = motionNode(rect(f))
  node.manualKeyframeTracks = {OPACITY:track(0,1),TRANSLATION_X:track(0,100,.5,{type:'EASE_OUT'}),ROTATION:track(0,90)}
  const result = (await f.runtime.execute('get_motion_context',{nodeId:node.id,codeFormat:'css'})).value
  const css = result.conversion.nodes[0]
  assert.equal(css.complete,true)
  assert.match(css.code,/@property --dsh_/)
  assert.match(css.code,/0% \{ --dsh_.*_tx: 0px; animation-timing-function: ease-out;/)
  assert.match(css.code,/_rot: -90deg/)
  assert.match(css.code,/100% \{ --dsh_.*_tx: 100px;/)
  assert.match(css.application,/dedicated motion wrapper/)
})

test('CSS never silently converts unsupported, alias, malformed or style-generated tracks', async () => {
  const f = await fixtureRuntime(), node = motionNode(rect(f))
  const bad = track(0,1); bad.keyframes[0].timelinePosition = .1
  node.manualKeyframeTracks = {OPACITY:track(0,1,1,{type:'CUSTOM_SPRING',easingFunctionSpring:{bounce:.4}}),WIDTH:track(10,20),TRANSLATION_X:bad}
  node.animationStyles = [{styleId:'Opacity',type:'FIGMA',duration:1}]
  const css = (await f.runtime.execute('get_motion_context',{nodeId:node.id,codeFormat:'css'})).value.conversion.nodes[0]
  assert.equal(css.complete,false); assert.equal(css.code,'')
  assert.deepEqual(json(css.unsupported.map(x => x.field)),['OPACITY','WIDTH','TRANSLATION_X','animationStyles'])
  assert.match(css.unsupported[0].reason,/Unsupported easing/)
})

test('native vector scales convert independently and conflicting vector/scalar tracks stay explicit', async () => {
  const f = await fixtureRuntime(), node = motionNode(rect(f))
  node.manualKeyframeTracks = {SCALE_XY:{id:'scale',baseValue:{type:'VECTOR',value:{x:1,y:1}},keyframes:[
    {timelinePosition:0,value:{type:'VECTOR',value:{x:1,y:1}},easing:{type:'LINEAR'}},
    {timelinePosition:1,value:{type:'VECTOR',value:{x:2,y:.5}},easing:{type:'CUSTOM_CUBIC_BEZIER',easingFunctionCubicBezier:{x1:.2,y1:0,x2:.8,y2:1}}}
  ]},SCALE_X:track(1,3)}
  const css = (await f.runtime.execute('get_motion_context',{nodeId:node.id,codeFormat:'css'})).value.conversion.nodes[0]
  assert.match(css.code,/_sx: 2;/); assert.match(css.code,/_sy: 0.5;/)
  assert.match(css.code,/cubic-bezier\(0.2, 0, 0.8, 1\)/)
  assert.equal(css.complete,false)
  assert.equal(css.unsupported[0].field,'SCALE_X')
  assert.match(css.unsupported[0].reason,/Overlapping/)
})

test('batch validates every target before font loading or any writes', async () => {
  const f = await fixtureRuntime(), n = text(f), other = rect(f)
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_text',nodeId:n.id,text:'After'},op(other,{width:-1})]}),/Unsupported property/)
  assert.equal(n.characters,'Before'); assert.equal(f.fonts.length,0); assert.equal(f.undo,0)
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(other,{opacity:.4},{expected:{opacity:.2}})]}),/Expected value mismatch/)
  assert.equal(other.opacity,1)
})

test('controlled text and solid fills apply after font preflight', async () => {
  const f = await fixtureRuntime(), n = text(f), r = rect(f)
  const result = await f.runtime.execute('batch_edit',{ops:[{type:'set_text',nodeId:n.id,text:'After',expected:{characters:'Before'}},{type:'set_fills',nodeId:r.id,fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]}]})
  assert.equal(result.value.applied,2); assert.equal(n.characters,'After'); assert.equal(r.fills[0].color.r,1); assert.equal(f.fonts.length,1); assert.equal(f.undo,0)
})

const nativePaints = paints => paints.map(p => ({...p,visible:p.visible ?? true,opacity:Math.fround(p.opacity ?? 1),blendMode:p.blendMode ?? 'NORMAL',boundVariables:p.boundVariables ?? {},color:Object.fromEntries(Object.entries(p.color).map(([key,value]) => [key,Math.fround(value)]))}))
test('solid paint verification accepts native defaults and float32 channels without weakening expected guards', async () => {
  const f = await fixtureRuntime(), n = rect(f)
  const original = [{type:'SOLID',color:{r:.2588235294,g:.5215686275,b:1}}]
  let stored = nativePaints(original), writes = 0
  Object.defineProperty(n,'fills',{get:() => stored,set(value){writes++;stored=nativePaints(value)}})
  const next = [{type:'SOLID',color:{r:.24,g:.74,b:.56},opacity:.3}]
  const result = await f.runtime.execute('batch_edit',{ops:[{type:'set_fills',nodeId:n.id,fills:next,expected:{fills:original}}]})
  assert.equal(result.value.ok,true); assert.equal(writes,1)
  assert.equal(stored[0].visible,true); assert.equal(stored[0].blendMode,'NORMAL')
  assert.equal(stored[0].color.r,Math.fround(.24)); assert.equal(stored[0].opacity,Math.fround(.3))
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_fills',nodeId:n.id,fills:[],expected:{fills:[{...next[0],color:{...next[0].color,r:.24001}}]}}]}),/Expected value mismatch/)
  assert.equal(writes,1); assert.equal(f.undo,0)
})

test('real color mismatch fails native paint verification and restores the captured paint', async () => {
  const f = await fixtureRuntime(), n = rect(f)
  const original = nativePaints([{type:'SOLID',color:{r:.1,g:.2,b:.3}}])
  let stored = original, writes = 0
  Object.defineProperty(n,'fills',{get:() => stored,set(value){stored=nativePaints(value);if(++writes===1)stored[0].color.g+=.00001}})
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_fills',nodeId:n.id,fills:[{type:'SOLID',color:{r:.24,g:.74,b:.56}}]}]}), error => {
    assert.match(error.message,/Write verification failed/)
    assert.equal(error.batchResult.rollback.complete,true)
    return true
  })
  assert.equal(writes,2); assert.deepEqual(json(stored),original); assert.equal(f.undo,0)
})

test('paint normalization still rejects binding, style, default and unknown-field changes', async () => {
  for (const kind of ['binding','style','visible','unknown']) {
    const f = await fixtureRuntime(), n = rect(f)
    n.fillStyleId = ''
    let stored = [], writes = 0
    Object.defineProperty(n,'fills',{get:() => stored,set(value){
      stored=nativePaints(value)
      if (++writes !== 1) return
      if (kind === 'binding') stored[0].boundVariables={color:{type:'VARIABLE_ALIAS',id:'unexpected'}}
      if (kind === 'style') n.fillStyleId='unexpected-style'
      if (kind === 'visible') stored[0].visible=false
      if (kind === 'unknown') stored[0].unexpected=true
    }})
    await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_fills',nodeId:n.id,fills:[{type:'SOLID',color:{r:.24,g:.74,b:.56}}]}]}), error => {
      assert.match(error.message,/Write verification failed/,kind)
      if (kind === 'style') assert.deepEqual(json(error.batchResult.rollback.residue),[{nodeId:n.id,fields:['fillStyleId']}])
      else assert.equal(error.batchResult.rollback.complete,true,kind)
      return true
    })
  }
})

test('native paint tolerance does not mask intervening preflight edits or unrelated numeric changes', async () => {
  const f = await fixtureRuntime(), n = rect(f), t = text(f)
  n.fills = nativePaints([{type:'SOLID',color:{r:.24,g:.74,b:.56}}])
  f.figma.loadFontAsync = async () => { n.fills[0].color.r += .0000005 }
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_fills',nodeId:n.id,fills:[]},{type:'set_text',nodeId:t.id,text:'After'}]}),/Target changed during preflight/)
  assert.equal(t.characters,'Before'); assert.equal(n.fills.length,1)
  let opacity=1
  Object.defineProperty(n,'opacity',{get:() => opacity,set(value){opacity=value===1 ? 1 : value+.0000005}})
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(n,{opacity:.2})]}),/Write verification failed/)
  assert.equal(opacity,1)
})

test('font errors and editor changes during font loading leave all targets untouched', async () => {
  const f = await fixtureRuntime(), n = text(f), r = rect(f)
  f.figma.loadFontAsync = async () => { throw Error('font missing') }
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(r,{opacity:.2}),{type:'set_text',nodeId:n.id,text:'After'}]}),/font missing/)
  assert.equal(r.opacity,1); assert.equal(n.characters,'Before')
  f.figma.loadFontAsync = async () => { n.characters = 'User edit' }
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(r,{opacity:.2}),{type:'set_text',nodeId:n.id,text:'After'}]}),/Target changed during preflight/)
  assert.equal(r.opacity,1); assert.equal(n.characters,'User edit')
})

test('batch rejects mixed text, instance ancestry and variable/style-linked edits', async () => {
  const f = await fixtureRuntime(), n = text(f), r = rect(f)
  n.getStyledTextSegments = () => [{start:0,end:2},{start:2,end:6}]
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_text',nodeId:n.id,text:'After'}]}),/Mixed/)
  r.boundVariables = {opacity:{type:'VARIABLE_ALIAS',id:'v'}}
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(r,{opacity:.4})]}),/Variable-bound/)
  r.boundVariables = {}; r.fillStyleId = 'style'
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[{type:'set_fills',nodeId:r.id,fills:[]}]}),/Style-linked/)
  const instance = frame(f); instance.type = 'INSTANCE'; instance.appendChild(r)
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(r,{name:'Changed'})]}),/inside instances/)
})

test('failure after mutation restores attempted node and previous nodes in reverse without global undo', async () => {
  const f = await fixtureRuntime(), a = rect(f), b = rect(f), events = []
  let av = 1, bv = 1
  Object.defineProperty(a,'opacity',{get:() => av,set(v){events.push('a:'+v);av=v}})
  Object.defineProperty(b,'opacity',{get:() => bv,set(v){events.push('b:'+v);bv=v;if(v===.2)throw Error('failed after write')}})
  let failure
  try { await f.runtime.run('batch_edit',{ops:[op(a,{opacity:.3}),op(b,{opacity:.2})]}) } catch (error) { failure = error }
  assert.ok(failure.batchResult)
  assert.equal(a.opacity,1); assert.equal(b.opacity,1)
  assert.deepEqual(events,['a:0.3','b:0.2','b:1','a:1'])
  assert.equal(failure.batchResult.rollback.complete,true)
  assert.equal(f.undo,0)
})

test('rollback failure identifies residual fields and never claims a transaction', async () => {
  const f = await fixtureRuntime(), a = rect(f)
  let value = 1
  Object.defineProperty(a,'opacity',{get:() => value,set(v){if(v===1)throw Error('restore forbidden');value=v;throw Error('write failed')}})
  let failure
  try { await f.runtime.execute('batch_edit',{ops:[op(a,{opacity:.3})]}) } catch (error) { failure = error }
  assert.equal(failure.batchResult.rollback.complete,false)
  assert.deepEqual(json(failure.batchResult.rollback.residue),[{nodeId:a.id,fields:['opacity']}])
  assert.equal(failure.batchResult.rollback.failures.length,1)
  assert.equal(failure.batchResult.requiresInspection,true)
  assert.match(failure.message,/not a document transaction/)
  assert.equal(f.undo,0)
})

test('controlled layout and dimension edits validate constraints and restore paired geometry', async () => {
  const f = await fixtureRuntime(), n = rect(f), layout = frame(f), bad = rect(f)
  Object.assign(layout,{layoutMode:'HORIZONTAL',primaryAxisSizingMode:'FIXED',counterAxisSizingMode:'FIXED',itemSpacing:8,paddingTop:4})
  await f.runtime.execute('batch_edit',{ops:[op(n,{width:200,x:20}),op(layout,{itemSpacing:24,paddingTop:12})]})
  assert.equal(n.width,200); assert.equal(n.height,100); assert.equal(n.x,20); assert.equal(layout.itemSpacing,24)
  layout.appendChild(n)
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(n,{x:30})]}),/inside auto layout/)
  f.page.appendChild(n)
  Object.defineProperty(bad,'opacity',{get:() => 1,set(){throw Error('blocked')}})
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(n,{width:300,height:250}),op(bad,{opacity:.2})]}),/Batch edit failed/)
  assert.equal(n.width,200); assert.equal(n.height,100)
  layout.primaryAxisSizingMode = 'AUTO'
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(layout,{itemSpacing:30})]}),/fixed-size/)
  n.boundVariables = {height:{type:'VARIABLE_ALIAS',id:'height'}}
  await assert.rejects(f.runtime.execute('batch_edit',{ops:[op(n,{width:300})]}),/both dimensions to be unbound/)
})
