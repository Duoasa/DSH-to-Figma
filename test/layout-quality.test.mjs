import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import {fixtureRuntime} from './fixtures.mjs'
test('layout verification reports mixed layouts and explicit coverage without recursively reading children',async()=>{
 const f=await fixtureRuntime(),root=f.figma.createFrame();root.layoutMode='NONE';root.locked=true
 for(let i=0;i<25;i++){const child=f.figma.createFrame();child.layoutMode=i?'NONE':'VERTICAL';child.constraints={horizontal:'STRETCH',vertical:'MIN'};child.layoutPositioning=i?'ABSOLUTE':'AUTO';root.appendChild(child);Object.defineProperty(child,'children',{get(){throw Error('Descendant scan forbidden')}})}
 const out=await f.runtime.run('use_figma',{code:'return "'+root.id+'"',verify:{resultPath:'$',layout:true}})
 const report=out.verification.layout;assert.equal(out.verification.state,'image-returned');assert.equal(report.state,'observed');assert.equal(report.nodes.length,20);assert.equal(report.coverage.total,26);assert.equal(report.coverage.truncated,true)
 assert.equal(report.nodes[0].node.locked,true);assert.equal(report.nodes[1].node.layoutMode,'VERTICAL');assert.equal(report.nodes[2].node.layoutPositioning,'ABSOLUTE');assert.equal(report.nodes[2].node.constraints.horizontal,'STRETCH');assert.equal(report.behaviorValidation,'not-tested');assert.equal(report.layoutAcceptance,'not-established');assert.equal(root.layoutMode,'NONE');assert.equal(root.locked,true)
})
test('normal screenshot verification does not add layout-property reads',async()=>{
 const f=await fixtureRuntime(),root=f.figma.createFrame();let reads=0
 Object.defineProperty(root,'layoutSizingHorizontal',{get(){reads++;return 'FIXED'}})
 const out=await f.runtime.run('use_figma',{code:'return 1',verify:{nodeId:root.id}})
 assert.equal(reads,0);assert.equal(out.verification.layout,undefined)
})
test('layout observations survive image failure without replaying or changing the drawn result',async()=>{
 const f=await fixtureRuntime(),root=f.figma.createFrame();root.layoutMode='NONE';root.exportAsync=async()=>{throw Error('image export failed')}
 const out=await f.runtime.run('use_figma',{code:'return 42',verify:{nodeId:root.id,layout:true}})
 assert.equal(out.value,42);assert.equal(out.verification.state,'failed');assert.equal(out.verification.writeState,'completed');assert.equal(out.verification.layout.state,'observed');assert.equal(out.verification.reconcile.tool,'get_screenshot')
})
test('layout read failure does not discard a successfully returned image',async()=>{
 const f=await fixtureRuntime(),root=f.figma.createFrame();Object.defineProperty(root,'children',{get(){throw Error('unavailable children')}})
 const out=await f.runtime.run('use_figma',{code:'return 42',verify:{nodeId:root.id,layout:true}})
 assert.equal(out.value,42);assert.equal(out.images.length,1);assert.equal(out.verification.state,'image-returned');assert.equal(out.verification.layout.state,'failed')
})
test('comparison distinguishes flow from absolute children and preserves locks/constraints',async()=>{
 const context=vm.createContext({});vm.runInContext(await readFile(new URL('../companion/compare.js',import.meta.url),'utf8'),context)
 const advice=context.DshFigmaCompare.layoutAdvice
 const flow=advice({layoutContext:{node:{layoutPositioning:'AUTO'},parent:{layoutMode:'HORIZONTAL'}}});assert.ok(flow.suggestedProperties.includes('parent.itemSpacing'));assert.ok(!flow.suggestedProperties.includes('x'))
 const absolute=advice({layoutContext:{node:{layoutPositioning:'ABSOLUTE',locked:true},parent:{layoutMode:'HORIZONTAL'}}});assert.ok(absolute.suggestedProperties.includes('constraints'));assert.ok(absolute.suggestedProperties.includes('x'));assert.match(absolute.lockNotice,/not unlock/)
 const fixed=advice({layoutMode:'NONE'});assert.match(fixed.suggestion,/Auto Layout is not required/)
})
