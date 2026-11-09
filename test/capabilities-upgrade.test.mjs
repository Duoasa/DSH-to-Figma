import test from 'node:test'
import assert from 'node:assert/strict'
import {fixtureRuntime} from './fixtures.mjs'
import {capabilityReport,capabilityNames} from '../lib/capabilities.mjs'

const probe=(fixture,node)=>fixture.runtime.run('get_capabilities',node?{nodeId:node.id}:{}).then(r=>r.value)

test('native video capability does not equate generic image export with a working encoder',async()=>{
  const f=await fixtureRuntime(),frame=f.figma.createFrame();f.page.appendChild(frame)
  let exports=0;frame.exportAsync=()=>{exports++;throw Error('must not encode during capability reads')}
  const value=await probe(f)
  assert.equal(value.schemaVersion,1);assert.equal(value.features.nativeVideoExport.state,'unknown')
  assert.match(value.features.nativeVideoExport.reason,/unverified/);assert.equal(exports,0);assert.equal(value.writesVerified,false)
  frame.exportAsync=undefined
  assert.equal((await probe(f,frame)).features.nativeVideoExport.state,'unavailable')
  f.figma.editorType='figjam'
  assert.equal((await probe(f)).features.nativeVideoExport.state,'unavailable')
})

test('shader and team library probes preserve method receivers and discard all list metadata',async()=>{
  const f=await fixtureRuntime(),before=f.nodes.size;let shaders=0,libraries=0,imports=0
  f.figma.listAvailableShaders=function(){assert.equal(this,f.figma);shaders++;return [{get id(){throw Error('must not inspect items')},secret:'shader-source-private'}]}
  f.figma.importShaderById=()=>{imports++;throw Error('must not import')}
  f.figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync=function(){assert.equal(this,f.figma.teamLibrary);libraries++;return [{secret:'library-name-private'}]}
  const value=await probe(f)
  for(const name of ['shaderCatalog','shaderImport','teamLibraryRead'])assert.equal(value.features[name].state,'available')
  assert.equal(shaders,1);assert.equal(libraries,1);assert.equal(imports,0);assert.equal(f.nodes.size,before);assert.equal(f.undo,0)
  assert.doesNotMatch(JSON.stringify(value),/shader-source-private|library-name-private/)
  const transported=capabilityReport(value)
  assert.equal(transported.features.teamLibraryRead.state,'available');assert.equal(transported.writesVerified,false)
})

test('permission denials and transient read failures are classified without leaking error metadata',async()=>{
  const f=await fixtureRuntime()
  f.figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync=async()=>{throw Error('Permission denied for private-library-name and secret-key')}
  f.figma.listAvailableShaders=()=>{throw Error('Temporary service failure with private-shader-id')}
  const value=await probe(f)
  assert.equal(value.features.teamLibraryRead.state,'unavailable');assert.match(value.features.teamLibraryRead.reason,/permissions/)
  assert.equal(value.features.shaderCatalog.state,'unknown')
  assert.doesNotMatch(JSON.stringify(value),/private-library|secret-key|private-shader/)
  f.figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync=async()=>({resources:[]})
  assert.equal((await probe(f)).features.teamLibraryRead.state,'unknown')
})

test('editor constructors are exposed only in the matching editor and never invoked by a probe',async()=>{
  const f=await fixtureRuntime();let constructors=0
  for(const method of ['createSticky','createShapeWithText','createConnector','createSlide','createSlideRow','createText'])f.figma[method]=()=>{constructors++;throw Error('must not create')}
  const design=await probe(f)
  assert.equal(design.features.figjamConstructors.state,'unavailable');assert.equal(design.features.slidesConstructors.state,'unavailable')
  f.figma.editorType='figjam'
  assert.equal((await probe(f)).features.figjamConstructors.state,'available')
  f.figma.editorType='slides'
  assert.equal((await probe(f)).features.slidesConstructors.state,'available')
  f.figma.mode='inspect'
  assert.equal((await probe(f)).features.slidesConstructors.state,'unavailable')
  assert.equal(constructors,0);assert.equal(f.undo,0)
})

test('new capability transport keeps schema one, bounds values, strips extras and preserves v4 reports',()=>{
  const value=capabilityReport({schemaVersion:1,readOnly:true,features:{manualKeyframes:{state:'available',reason:'legacy'},shaderCatalog:{state:'available',reason:'x'.repeat(900),source:'private'}}})
  assert.equal(value.schemaVersion,1);assert.equal(value.features.manualKeyframes.state,'available')
  assert.equal(value.features.nativeVideoExport.state,'unknown');assert.match(value.features.nativeVideoExport.reason,/featureVersion 5/)
  assert.equal(value.features.shaderCatalog.reason.length,300);assert.doesNotMatch(JSON.stringify(value),/private/)
  assert.equal(Object.keys(value.features).length,capabilityNames.length)
  assert.equal(capabilityReport({schemaVersion:2,readOnly:true,features:{shaderCatalog:{state:'available'}}}).features.shaderCatalog.state,'unknown')
})
