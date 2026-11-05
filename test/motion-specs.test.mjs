import test from 'node:test'
import assert from 'node:assert/strict'
import {fixtureRuntime, request, runJob} from './fixtures.mjs'
import {LocalBridge} from '../lib/bridge.mjs'
import {capabilityReport} from '../lib/capabilities.mjs'
import {requiredQueryFeatureVersion} from '../lib/catalog.mjs'
const plain = value => JSON.parse(JSON.stringify(value))

async function motionFixture() {
  const f = await fixtureRuntime(), frame = f.figma.createFrame(), text = f.figma.createText()
  f.page.appendChild(frame); frame.appendChild(text); text.characters = 'Editable words'; text.fontName = {family:'Inter',style:'Regular'}
  text.getStyledTextSegments = () => [{fontName:text.fontName}]
  text.manualKeyframeTracks = {OPACITY:{id:'keep-track',keyframes:[{id:'keep-key',timelinePosition:0,value:{type:'FLOAT',value:1}}]}}
  text.animationStyles = [{id:'keep-binding',styleId:'Opacity',type:'FIGMA',duration:1}]
  text.timelines = [{id:frame.id,duration:1}]
  text.animations = {manualOnly:true}
  text.applyManualKeyframeTrack = function(field, track) { assert.equal(this,text);this.manualKeyframeTracks[field.name] = plain(track) }
  text.removeManualKeyframeTrack = function(field) { assert.equal(this,text);delete this.manualKeyframeTracks[field.name] }
  text.setTimelineDuration = function(id, duration) { assert.equal(this,text);assert.equal(id,frame.id);this.timelines[0].duration = duration }
  let sequence = 0
  text.applyAnimationStyle = function(styleId, configuration) { assert.equal(this,text);const id='binding-'+(++sequence);this.animationStyles.push({id,styleId,type:'FIGMA',...plain(configuration)});return id }
  text.removeAnimationStyle = function(id) { assert.equal(this,text);this.animationStyles=this.animationStyles.filter(s=>s.id!==id) }
  const definitions = [{styleId:'Opacity',props:{}},{styleId:'TextStagger',props:{}}], styles = []
  f.figma.motion = {figmaAnimationStyles(){assert.equal(this,f.figma.motion);return definitions}}
  f.figma.getLocalCustomAnimationStylesAsync = async () => styles
  f.figma.createCustomAnimationStyle = () => {
    const style = {id:'style-'+(++sequence),name:'',type:'CUSTOM_ANIMATION',animationEntries:[],
      async addAnimationEntryAsync(definition,props){assert.equal(this,style);const entry={id:'entry-'+(++sequence),definition,props:plain(props)};this.animationEntries.push(entry);return entry},
      removeAnimationEntry(id){assert.equal(this,style);this.animationEntries=this.animationEntries.filter(e=>e.id!==id)},
      remove(){styles.splice(styles.indexOf(style),1)}}
    styles.push(style);return style
  }
  f.figma.moveLocalCustomAnimationStyleAfter = (target, reference) => {assert.ok(styles.includes(target));assert.equal(reference,null)}
  return {...f, frame, text, styles, definitions}
}

test('discovery distinguishes empty-page unknown from unavailable namespaces without writing or switching',async()=>{
  const f = await fixtureRuntime(), before=f.nodes.size
  const {value} = await f.runtime.run('get_capabilities')
  assert.equal(value.features.manualKeyframes.state,'unknown')
  assert.equal(value.features.textAnimation.state,'unavailable')
  assert.equal(value.features.specs.state,'unavailable')
  assert.equal(value.writesVerified,false);assert.equal(f.nodes.size,before);assert.equal(f.undo,0)
  assert.equal(f.figma.currentPage,f.page)
  await assert.rejects(f.runtime.run('get_capabilities',{nodeId:'missing'}),/existing nodeId/)
})

test('probe discovers actual definitions and independent gates; generic failures remain unknown',async()=>{
  const f = await motionFixture()
  const probe = () => f.runtime.run('get_capabilities',{nodeId:f.text.id}).then(r=>r.value)
  const yes=await probe()
  for(const name of ['manualKeyframes','animationStyles','timelines','textAnimation','customAnimationStyles'])assert.equal(yes.features[name].state,'available',name)
  assert.equal(yes.sampledNodeId,f.text.id);assert.equal(f.text.animationStyles.length,1)
  f.definitions.splice(1)
  f.figma.getLocalCustomAnimationStylesAsync=async()=>{throw Error('Custom animation styles are not available')}
  assert.equal((await probe()).features.textAnimation.state,'unavailable')
  assert.equal((await probe()).features.customAnimationStyles.state,'unavailable')
  f.figma.getLocalCustomAnimationStylesAsync=async()=>{throw Error('Temporary connection failure')}
  assert.equal((await probe()).features.customAnimationStyles.state,'unknown')
  Object.defineProperty(f.text,'manualKeyframeTracks',{get(){throw Error('manualKeyframeTracks is not a supported API')}})
  assert.equal((await probe()).features.manualKeyframes.state,'unavailable')
})

test('motion writes/readback/removal retain unrelated tracks, text, parenting and original method receiver',async()=>{
  const f=await motionFixture(),id=f.text.id
  await f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${id}');
    n.applyManualKeyframeTrack({type:'PROPERTY',name:'TRANSLATION_X'},{keyframes:[{timelinePosition:0,value:{type:'FLOAT',value:0}},{timelinePosition:2,value:{type:'FLOAT',value:120},easing:{type:'EASE_OUT'}}]});
    n.setTimelineDuration(n.timelines[0].id,2);return {mutatedNodeIds:[n.id,n.timelines[0].id]};`})
  const {value}=await f.runtime.run('get_motion_context',{nodeId:id})
  assert.equal(value.manualKeyframeTracks.TRANSLATION_X.keyframes[1].value.value,120)
  assert.equal(value.manualKeyframeTracks.OPACITY.id,'keep-track');assert.equal(value.timelines[0].duration,2)
  await f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${id}');n.removeManualKeyframeTrack({type:'PROPERTY',name:'TRANSLATION_X'});return {mutatedNodeIds:[n.id]};`})
  assert.deepEqual(Object.keys(f.text.manualKeyframeTracks),['OPACITY'])
  assert.equal(f.text.characters,'Editable words');assert.equal(f.text.parent,f.frame)
})

test('text animation application can be revised and removed by ID without stacking another animation',async()=>{
  const f=await motionFixture(),id=f.text.id
  const {value}=await f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${id}');
    const d=figma.motion.figmaAnimationStyles().find(s=>s.styleId==='TextStagger');
    for(const s of n.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);
    const appliedId=n.applyAnimationStyle(d.styleId,{duration:1,timelineOffset:0,props:{textDelayGrouping:'CHARACTER'}});
    return {appliedId,mutatedNodeIds:[n.id]};`})
  const revised=await f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${id}');const old=n.animationStyles.find(s=>s.id==='${value.appliedId}');const replacement=dsh.updateAnimationStyle(n,old.id,'TextStagger',{duration:2,timelineOffset:0,props:{...old.props,textDelayGrouping:'LINE'}});return {mutatedNodeIds:[n.id],replacement};`})
  assert.equal(f.text.animationStyles.length,2);assert.equal(f.text.animationStyles[1].props.textDelayGrouping,'LINE');assert.equal(f.text.characters,'Editable words')
  await f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${id}');n.removeAnimationStyle('${revised.value.replacement.id}');return {mutatedNodeIds:[n.id]};`})
  assert.deepEqual(f.text.animationStyles.map(s=>s.id),['keep-binding']);assert.equal(f.fonts.length,1)
})

test('custom animation style objects preserve native identity through creation, ordering and application',async()=>{
  const f=await motionFixture()
  const {value}=await f.runtime.run('use_figma',{code:`const style=figma.createCustomAnimationStyle();style.name='Reusable';
    await style.addAnimationEntryAsync('Opacity',{duration:0.4,easing:{type:'EASE_OUT'}});
    figma.moveLocalCustomAnimationStyleAfter(style,null);
    const n=await figma.getNodeByIdAsync('${f.text.id}');const appliedId=n.applyAnimationStyle(style.id,{type:'CUSTOM',timelineOffset:0.25});
    return {styleId:style.id,appliedId,entries:style.animationEntries,mutatedNodeIds:[n.id]};`})
  assert.equal(value.styleId,f.styles[0].id);assert.equal(value.entries[0].props.duration,0.4)
  assert.equal(f.text.animationStyles[1].type,'CUSTOM')
  const probe=(await f.runtime.run('get_capabilities',{nodeId:f.text.id})).value
  assert.equal(probe.features.customAnimationStyles.state,'available')
  const revised=await f.runtime.run('use_figma',{code:`const style=(await figma.getLocalCustomAnimationStylesAsync()).find(s=>s.id==='${value.styleId}');const previous=style.animationEntries[0];const replacement=await dsh.updateAnimationEntry(style,previous.id,'Opacity',{duration:0.8});return {replacement,entries:style.animationEntries};`})
  assert.equal(revised.value.entries.length,1);assert.equal(revised.value.entries[0].props.duration,0.8)
  assert.notEqual(revised.value.replacement.id,value.entries[0].id)
})

test('motion replacement validates before mutations and rejects changes that would reorder another application',async()=>{
  const f=await motionFixture(),before=plain(f.text.animationStyles)
  await assert.rejects(f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${f.text.id}');dsh.updateAnimationStyle(n,'keep-binding','unlisted',{});`}),/discovered/)
  assert.deepEqual(plain(f.text.animationStyles),before)
  f.text.applyAnimationStyle('TextStagger',{duration:1})
  await assert.rejects(f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${f.text.id}');dsh.updateAnimationStyle(n,'keep-binding','Opacity',{});`}),/reordering/)
  assert.equal(f.text.animationStyles.length,2)
  await assert.rejects(f.runtime.run('use_figma',{code:`const n=await figma.getNodeByIdAsync('${f.text.id}');n.set({animationStyles:[]});`}),/read-only/)
})

test('selected motion fields do not invoke unrelated getters; large Unicode tracks report explicit omissions',async()=>{
  const f=await motionFixture()
  Object.defineProperty(f.text,'animations',{get(){throw Error('Should not be read')}})
  const partial=await f.runtime.run('get_motion_context',{nodeId:f.text.id,fields:['timelines']})
  assert.deepEqual(Object.keys(partial.value.fieldStatus),['timelines'])
  f.text.manualKeyframeTracks.large={text:'字'.repeat(2000)}
  const {value}=await f.runtime.run('get_motion_context',{nodeId:f.text.id,maxBytes:4096})
  assert.equal(value.truncated,true);assert.deepEqual(plain(value.omittedFields),['manualKeyframeTracks'])
  assert.ok(Buffer.byteLength(JSON.stringify(value))<=4096)
  assert.equal(value.manualKeyframeTracks,undefined);assert.equal(value.continuation.nodeId,f.text.id)
  const full=await f.runtime.run('get_motion_context',{nodeId:f.text.id,fields:['manualKeyframeTracks'],maxBytes:16384})
  assert.equal(full.value.manualKeyframeTracks.large.text.length,2000)
  await assert.rejects(f.runtime.run('get_motion_context',{nodeId:f.text.id,fields:['private']}),/supported motion/)
})

test('unsupported getters are explicit, not mistaken for empty successful motion data',async()=>{
  const f=await motionFixture()
  Object.defineProperty(f.text,'animationStyles',{get(){throw Error('not a supported API')}})
  const {value}=await f.runtime.run('get_motion_context',{nodeId:f.text.id})
  assert.equal(value.fieldStatus.animationStyles.state,'unavailable');assert.equal(value.animationStyles,undefined)
  assert.equal(value.fieldStatus.manualKeyframeTracks.state,'available')
})

test('native Specs namespace receives exact arguments; surgical edits preserve anchors and fail without partial replacement',async()=>{
  const f=await fixtureRuntime(),docs=new Map();let count=0
  const api={
    async createOnCanvasAsync({title,content}){assert.equal(this,api);const id='spec-'+(++count);docs.set(id,{title,markdown:content});return {specNodeId:id}},
    async getContent({specNodeId}){assert.equal(this,api);return {specNodeId,...docs.get(specNodeId)}},
    async editContent({specNodeId,edits}){assert.equal(this,api);let text=docs.get(specNodeId).markdown;for(const e of edits){if(text.split(e.oldText).length!==2)throw Error('Expected exactly one match');text=text.replace(e.oldText,e.newText)}docs.get(specNodeId).markdown=text},
    comments:{async getThread({uuid}){return {root:{uuid},replies:[]}},async create(){throw Error('No unsolicited comments')},async reply(){throw Error('No unsolicited comments')}}
  }
  f.figma.spec=api
  const {value}=await f.runtime.run('use_figma',{code:`const {specNodeId}=await figma.spec.createOnCanvasAsync({title:'Test',content:'# Test\\n\\nKeep [comment:root]anchor[/comment:root].\\n\\nOld requirement.'});
    await figma.spec.editContent({specNodeId,edits:[{oldText:'Old requirement.',newText:'New requirement.'}]});
    return {createdNodeIds:[specNodeId],after:await figma.spec.getContent({specNodeId})};`})
  assert.match(value.after.markdown,/Keep \[comment:root\]anchor\[\/comment:root\]/)
  assert.match(value.after.markdown,/New requirement/)
  const id=value.createdNodeIds[0],before=docs.get(id).markdown
  await assert.rejects(f.runtime.run('use_figma',{code:`await figma.spec.editContent({specNodeId:'${id}',edits:[{oldText:'missing',newText:'bad'}]});`}),e=>e.safeToRetryWithoutCanvasRead===false)
  assert.equal(docs.get(id).markdown,before)
  const probe=(await f.runtime.run('get_capabilities')).value
  assert.equal(probe.features.specs.state,'available');assert.equal(probe.features.specCreation.state,'available');assert.equal(probe.features.specComments.state,'available');assert.equal(probe.writesVerified,false)
})

test('bridge refreshes only the selected document capability snapshot and does not clear uncertain writes',async t=>{
  const bridge=await new LocalBridge({token:'d'.repeat(64),port:0}).start();t.after(()=>bridge.close())
  const id=(await (await request(bridge,'/connect',{name:'A',editorType:'figma',featureVersion:4})).json()).connectionId
  const other=(await (await request(bridge,'/connect',{name:'B',editorType:'figma',featureVersion:3})).json()).connectionId
  const f=await motionFixture();bridge.documents.get(id).uncertain=true
  const call=bridge.call(id,'get_capabilities',{nodeId:f.text.id});await runJob(bridge,id,f.runtime);await call
  assert.equal(bridge.list().find(d=>d.connectionId===id).capabilities.features.textAnimation.state,'available')
  assert.equal(bridge.list().find(d=>d.connectionId===id).needsInspection,true)
  assert.equal(bridge.list().find(d=>d.connectionId===other).capabilities.features.textAnimation.state,'unknown')
  assert.equal(requiredQueryFeatureVersion('get_capabilities'),4);assert.equal(requiredQueryFeatureVersion('get_motion_context'),4)
  assert.equal(requiredQueryFeatureVersion('use_figma'),3)
})

test('capability transport strips unexpected fields and never accepts write-verification claims',()=>{
  const report=capabilityReport({schemaVersion:1,readOnly:true,writesVerified:true,secret:'private',features:{specs:{state:'available',reason:'x'.repeat(900),secret:'private'}}})
  assert.equal(report.writesVerified,false);assert.equal(report.features.specs.reason.length,300)
  assert.doesNotMatch(JSON.stringify(report),/private/);assert.equal(report.features.timelines.state,'unknown')
})

test('motion metadata budget also bounds long names and Unicode failure reasons',async()=>{
 const f=await motionFixture();f.text.name='超长名称'.repeat(4000)
 for(const key of ['motion','reactions','manualKeyframeTracks','animationStyles','timelines','animations'])Object.defineProperty(f.text,key,{get(){throw Error('错误'.repeat(1000))}})
 const {value}=await f.runtime.run('get_motion_context',{nodeId:f.text.id,maxBytes:4096,fields:['motion','reactions','manualKeyframeTracks','animationStyles','timelines','animations']})
 assert.equal(value.nameOmitted,true);assert.equal(value.name,null)
 assert.ok(Buffer.byteLength(JSON.stringify(value))<=4096)
})
