import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,stat,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {prepareCompanion,companionFiles} from '../lib/companion.mjs'
import {zipFiles} from '../lib/archive.mjs'
function unzipStored(buffer){const files={};let offset=0;while(buffer.readUInt32LE(offset)===0x04034b50){const size=buffer.readUInt32LE(offset+18),len=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),name=buffer.subarray(offset+30,offset+30+len).toString();const start=offset+30+len+extra;files[name]=buffer.subarray(start,start+size).toString();offset=start+size}assert.equal(buffer.readUInt32LE(offset),0x02014b50);return files}
test('private companion is paired, stable, permission-restricted, and has a standalone archive',async t=>{
 const home=await mkdtemp(join(tmpdir(),'figma-package-'));t.after(()=>rm(home,{recursive:true,force:true}))
 const one=await prepareCompanion(home,{port:41234}),two=await prepareCompanion(home,{port:41234})
 assert.equal(one.manifest,two.manifest)
 const token=(await readFile(join(home,'figma/bridge-token'),'utf8')).trim()
 assert.doesNotMatch(JSON.stringify(one),new RegExp(token))
 assert.match(await readFile(join(one.folder,'code.js'),'utf8'),new RegExp(token))
 assert.deepEqual(JSON.parse(await readFile(one.manifest,'utf8')).networkAccess.devAllowedDomains,['http://localhost:41234'])
 for(const path of [one.manifest,one.archive,join(one.folder,'code.js')])assert.equal((await stat(path)).mode&0o777,0o600)
 assert.equal((await stat(one.folder)).mode&0o777,0o700)
 const unpacked=unzipStored(await readFile(one.archive));assert.equal(unpacked['code.js'],await readFile(join(one.folder,'code.js'),'utf8'));assert.ok(unpacked['README.txt'].includes('PRIVATE'))
 await rm(join(one.folder,'ui.html'));await symlink(join(home,'outside'),join(one.folder,'ui.html'))
 await assert.rejects(prepareCompanion(home),/regular file/)
})
test('public companion archive has no credentials and custom ports are validated',async()=>{
 const files=await companionFiles();const bootstrap=files['code.js'].split('\n')[0]
 assert.doesNotMatch(bootstrap,/token/)
 assert.equal(JSON.parse(files['manifest.json']).id,'dsh-figma-workbench-local')
 assert.deepEqual(unzipStored(zipFiles(files)),files)
 await assert.rejects(companionFiles({token:'secret'}),/token/)
 await assert.rejects(companionFiles({port:1}),/port/)
 assert.throws(()=>zipFiles({'../escape':'x'}),/filename/)
})
