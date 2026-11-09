import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFile,writeFile,mkdtemp,rm,symlink,readdir,stat,realpath} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fixtureRuntime,PNG} from './fixtures.mjs'
import {saveMediaTransfer} from '../lib/media-store.mjs'

const MP4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(128,7)])
async function fixture(clock=Date){const f=await fixtureRuntime();const ctx=vm.createContext({Uint8Array,Date:clock,Math,setTimeout,clearTimeout});vm.runInContext(await readFile(new URL('../companion/media.js',import.meta.url),'utf8'),ctx);return {...f,execute:ctx.DshFigmaMedia.execute,run:(method,args={})=>ctx.DshFigmaMedia.execute(f.runtime,method,args)}}
async function workspace(t){const root=await mkdtemp(join(tmpdir(),'dsh-media-'));t.after(()=>rm(root,{recursive:true,force:true}));return root}
const raster={name:'photo.png',mimeType:'image/png',data:PNG.toString('base64')}

test('targeted replacement preserves image crop, filters, other fill slots and geometry',async()=>{
  const f=await fixture(),n=f.figma.createRectangle();f.page.appendChild(n)
  const image={type:'IMAGE',imageHash:'old',scaleMode:'CROP',imageTransform:[[.5,0,.25],[0,.5,.1]],filters:{contrast:.2},rotation:12,opacity:.8}
  const solid={type:'SOLID',color:{r:1,g:0,b:0}}
  n.fills=[solid,image];n.resize(200,100)
  const {value}=await f.run('upload_assets',{assets:[raster],nodeIds:[n.id],fillIndex:1})
  assert.deepEqual(JSON.parse(JSON.stringify(n.fills[0])),solid);assert.deepEqual(JSON.parse(JSON.stringify(n.fills[1])),{...image,imageHash:'imagehash'})
  assert.equal(n.width,200);assert.equal(n.height,100);assert.equal(value.replacements[0].nodeId,n.id)
  assert.equal(await f.run('upload_assets',{assets:[raster]}),null)
})
test('replacement validates every target before writing and rejects mixed text and SVG replacement',async()=>{
  const f=await fixture(),a=f.figma.createRectangle(),b=f.figma.createText();a.fills=[{type:'IMAGE',imageHash:'old',scaleMode:'FILL'}];b.fills=Symbol('mixed')
  await assert.rejects(f.run('upload_assets',{assets:[raster,raster],nodeIds:[a.id,b.id]}),/uniform fills/)
  assert.equal(a.fills[0].imageHash,'old')
  await assert.rejects(f.run('upload_assets',{assets:[{mimeType:'image/svg+xml',svg:'<svg/>'}],nodeIds:[a.id]}),/raster/)
  await assert.rejects(f.run('upload_assets',{assets:[raster],nodeIds:[a.id],fillIndex:3}),/fillIndex/)
  b.fills=[];b.fontName={family:'Inter',style:'Regular'};let images=0;f.figma.createImage=()=>{if(++images===2)throw Error('Corrupt image');return {hash:'decoded'}}
  await assert.rejects(f.run('upload_assets',{assets:[raster,raster],nodeIds:[a.id,b.id]}),/Corrupt/)
  assert.equal(a.fills[0].imageHash,'old')
})
test('changing image scale mode removes incompatible crop while preserving opacity',async()=>{
  const f=await fixture(),n=f.figma.createRectangle();n.fills=[{type:'IMAGE',imageHash:'old',scaleMode:'CROP',imageTransform:[[1,0,0],[0,1,0]],scalingFactor:2,opacity:.7}]
  await f.run('upload_assets',{assets:[raster],nodeIds:[n.id],scaleMode:'FIT'})
  assert.equal(n.fills[0].scaleMode,'FIT');assert.equal(n.fills[0].imageTransform,undefined);assert.equal(n.fills[0].opacity,.7)
})
test('enhanced downloads honor node settings, include vector and original mapping, preserve explicit overrides',async()=>{
  const f=await fixture(),root=f.figma.createFrame(),child=f.figma.createRectangle();child.type='VECTOR';root.appendChild(child);f.page.appendChild(root)
  root.name='Card';root.exportSettings=[{format:'SVG',suffix:'-icon'},{format:'PNG',constraint:{type:'SCALE',value:2}}];child.fills=[{type:'IMAGE',imageHash:'source',scaleMode:'FILL'}]
  const seen=[];root.exportAsync=async options=>{seen.push(options);return new Uint8Array(PNG)}
  const {value,assets}=await f.run('download_assets',{nodeId:root.id,respectExportSettings:true,includeSvgAssets:true,includeOriginalImages:true})
  assert.equal(seen[0].format,'SVG');assert.equal(seen[1].constraint.value,2);assert.equal(assets[0].name,'Card-icon.svg')
  assert.equal(value.exportCount,4);assert.deepEqual(Array.from(value.mapping,m=>m.assetIndex),[0,1,2,3]);assert.equal(value.mapping[2].imageHash,'source');assert.equal(value.mapping[3].role,'vector')
  await f.run('download_assets',{nodeId:root.id,respectExportSettings:true,format:'JPG',scale:3})
  assert.equal(seen[2].format,'JPG');assert.equal(seen[2].constraint.value,3)
})
test('asset subtree budget is explicit and never silently omits descendants',async()=>{
  const f=await fixture(),root=f.figma.createFrame();root.appendChild(f.figma.createRectangle());root.appendChild(f.figma.createRectangle())
  await assert.rejects(f.run('download_assets',{nodeId:root.id,includeSvgAssets:true,maxNodes:1}),/maxNodes/)
})
test('native video export resolves containing frame, gates editor/settings, and isolates per-runtime transfers',async()=>{
  const f=await fixture(),frame=f.figma.createFrame(),child=f.figma.createRectangle();f.page.appendChild(frame);frame.appendChild(child)
  let settings;frame.exportAsync=async value=>{settings=value;return new Uint8Array(MP4)}
  const {value}=await f.run('export_video',{nodeId:child.id,format:'MP4',fps:30,quality:'HIGH'}),t=value.transfer
  assert.equal(t.nodeId,frame.id);assert.equal(t.byteLength,MP4.length);assert.equal(settings.format,'MP4');assert.equal(t.mimeType,'video/mp4')
  await assert.rejects(f.run('export_video',{nodeId:frame.id}),/already active/)
  const a=(await f.run('read_export_chunk',{transferId:t.transferId,offset:0,length:20})).value
  assert.equal(a.nextOffset,20);assert.deepEqual(Buffer.from(a.data,'base64'),MP4.subarray(0,20))
  await assert.rejects(f.run('read_export_chunk',{transferId:t.transferId,offset:-1}),/offset/)
  await assert.rejects(f.run('read_export_chunk',{transferId:t.transferId,length:1024*1024}),/length/)
  assert.equal((await f.run('release_export',{transferId:t.transferId})).value.released,true)
  await assert.rejects(f.run('read_export_chunk',{transferId:t.transferId}),/expired/)
  await assert.rejects(f.run('export_video',{nodeId:frame.id,format:'GIF',fps:60}),/fps/)
  await assert.rejects(f.run('export_video',{nodeId:frame.id,constraint:{type:'SCALE',value:1.25}}),/constraint/)
  f.figma.editorType='figjam';await assert.rejects(f.run('export_video',{nodeId:frame.id}),/Design editor/)
})
test('native transfer reserves one encoder, expires completed transfers and isolates runtime state',async()=>{
  let now=Date.now();class Clock extends Date{static now(){return now}}
  const f=await fixture(Clock),frame=f.figma.createFrame();f.page.appendChild(frame)
  let finish,started;const ready=new Promise(resolve=>{started=resolve})
  frame.exportAsync=()=>new Promise(resolve=>{finish=resolve;started()})
  const first=f.run('export_video',{nodeId:frame.id});await ready
  now+=11*60*1000;await assert.rejects(f.run('export_video',{nodeId:frame.id}),/already active/)
  finish(new Uint8Array(MP4));const descriptor=(await first).value.transfer
  const other=await fixtureRuntime()
  await assert.rejects(f.execute(other.runtime,'read_export_chunk',{transferId:descriptor.transferId}),/expired/)
  now+=11*60*1000;await assert.rejects(f.run('read_export_chunk',{transferId:descriptor.transferId}),/expired/)
})
test('native encoder failure releases transfer slot and preserves original error',async()=>{
  const f=await fixture(),frame=f.figma.createFrame();f.page.appendChild(frame);frame.exportAsync=async()=>{throw Error('No animation')}
  await assert.rejects(f.run('export_video',{nodeId:frame.id}),/No animation/)
  frame.exportAsync=async()=>new Uint8Array(MP4)
  assert.ok((await f.run('export_video',{nodeId:frame.id})).value.transfer)
})
test('chunk transfer saves verified bytes, hashes, permissions and releases memory',async t=>{
  const root=await workspace(t),f=await fixture(),frame=f.figma.createFrame();f.page.appendChild(frame);frame.name='../animated';frame.exportAsync=async()=>new Uint8Array(MP4)
  const descriptor=(await f.run('export_video',{nodeId:frame.id})).value.transfer
  const saved=await saveMediaTransfer(root,descriptor,{readChunk:async args=>(await f.run('read_export_chunk',args)).value,release:args=>f.run('release_export',args)})
  assert.deepEqual(await readFile(saved.path),MP4);assert.equal(saved.mimeType,'video/mp4');assert.equal(saved.sha256.length,64);assert.equal((await stat(saved.path)).mode&0o777,0o600)
  assert.ok(saved.path.startsWith(join(await realpath(root),'.figma','assets')));assert.equal(saved.name.includes('/'),false)
  await assert.rejects(f.run('read_export_chunk',{transferId:descriptor.transferId}),/expired/)
})
test('host rejects out of order chunks and removes partial output; release still happens',async t=>{
  const root=await workspace(t);let released=false
  const descriptor={transferId:'export-test-1',format:'MP4',mimeType:'video/mp4',byteLength:MP4.length,chunkSize:32,name:'a.mp4'}
  await assert.rejects(saveMediaTransfer(root,descriptor,{readChunk:async()=>({offset:3}),release:async()=>{released=true}}),/out-of-order/)
  assert.equal(released,true);assert.deepEqual(await readdir(join(root,'.figma','assets')),[])
})
test('host rejects symlink output roots and pre-aborted work without reading media',async t=>{
  const root=await workspace(t),outside=await workspace(t);await symlink(outside,join(root,'.figma'))
  const descriptor={transferId:'export-test-2',format:'MP4',mimeType:'video/mp4',byteLength:MP4.length,chunkSize:32};let calls=0,releases=0
  const callbacks={readChunk:async()=>{calls++},release:async()=>{releases++}}
  await assert.rejects(saveMediaTransfer(root,descriptor,callbacks),/symlink/)
  await assert.rejects(saveMediaTransfer(outside,descriptor,{...callbacks,signal:AbortSignal.abort()}),/abort/i)
  assert.equal(calls,0);assert.equal(releases,2)
})
test('host rejects wrong media signature and oversized descriptors',async t=>{
  const root=await workspace(t),descriptor={transferId:'export-test-3',format:'MP4',mimeType:'video/mp4',byteLength:PNG.length,chunkSize:512}
  const readChunk=async({offset,length})=>({transferId:descriptor.transferId,offset,byteLength:length,nextOffset:offset+length,done:offset+length===PNG.length,data:PNG.subarray(offset,offset+length).toString('base64')})
  await assert.rejects(saveMediaTransfer(root,descriptor,{readChunk,release:async()=>{}}),/signature/)
  await assert.rejects(saveMediaTransfer(root,{...descriptor,byteLength:300*1024*1024},{readChunk,release:async()=>{}}),/descriptor/)
})
test('host never overwrites a colliding destination and preserves the existing file',async t=>{
  const root=await workspace(t),descriptor={transferId:'export-test-4',format:'MP4',mimeType:'video/mp4',byteLength:MP4.length,chunkSize:512,name:'existing.mp4'};let existing
  const readChunk=async({offset,length})=>{const [id]=await readdir(join(root,'.figma','assets'));existing=join(root,'.figma','assets',id,'existing.mp4');await writeFile(existing,'keep');return {transferId:descriptor.transferId,offset,byteLength:length,nextOffset:offset+length,done:true,data:MP4.toString('base64')}}
  await assert.rejects(saveMediaTransfer(root,descriptor,{readChunk,release:async()=>{}}),{code:'EEXIST'})
  assert.equal(await readFile(existing,'utf8'),'keep')
})
