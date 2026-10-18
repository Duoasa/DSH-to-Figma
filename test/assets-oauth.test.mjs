import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, symlink, mkdir, rm, stat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from './fixtures.mjs'
import { readAssets, saveAssets, localResult } from '../lib/assets.mjs'
import { bridgeToken } from '../lib/storage.mjs'
import { oauthProvider, callbackServer, oauthFetch } from '../lib/oauth.mjs'
import { desktopUrl } from '../lib/official.mjs'
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'dsh-figma-'));t.after(()=>rm(root,{recursive:true,force:true}));const workspace=join(root,'workspace');await mkdir(workspace);return {root,workspace}}
test('workspace assets preserve bytes; output never overwrites existing files',async t=>{
  const {workspace}=await fixture(t);await writeFile(join(workspace,'image.png'),PNG)
  const assets=await readAssets(workspace,['image.png']);assert.equal(assets[0].mimeType,'image/png')
  const first=await saveAssets(workspace,assets),second=await saveAssets(workspace,assets)
  assert.notEqual(first[0].path,second[0].path);assert.deepEqual(await readFile(first[0].path),PNG)
  assert.equal((await stat(first[0].path)).mode&0o777,0o600)
  assert.equal(localResult({value:{id:'1'},images:[{type:'image',mimeType:'image/png',data:PNG.toString('base64')}]}).content[1].type,'image')
})
test('rejects traversal, symlink escapes, unsafe SVG, corrupt image and symlink output',async t=>{
  const {root,workspace}=await fixture(t);await writeFile(join(root,'secret.png'),PNG);await symlink(join(root,'secret.png'),join(workspace,'link.png'))
  await assert.rejects(readAssets(workspace,['../secret.png']),/workspace/)
  await assert.rejects(readAssets(workspace,['link.png']),/symlink/)
  await writeFile(join(workspace,'unsafe.svg'),'<svg><image href="https://evil.example/x"/></svg>')
  await assert.rejects(readAssets(workspace,['unsafe.svg']),/self-contained/)
  assert.throws(()=>localResult({value:{},images:[{mimeType:'image/png',data:Buffer.from('fake').toString('base64')}]}),/Invalid screenshot/)
  await symlink(root,join(workspace,'.figma'));await assert.rejects(saveAssets(workspace,[{name:'../escape.png',data:PNG.toString('base64')}]),/symlink/)
})
test('pairing and OAuth use private isolated storage and explicit credential invalidation',async t=>{
  const {root}=await fixture(t),token=await bridgeToken(root);assert.equal(token.length,64);assert.equal(await bridgeToken(root),token)
  const provider=await oauthProvider(root);await provider.saveClientInformation({client_id:'test'});await provider.saveTokens({access_token:'test-secret',token_type:'Bearer'})
  assert.equal((await provider.tokens()).access_token,'test-secret');assert.equal((await stat(join(root,'figma/oauth.json'))).mode&0o777,0o600)
  await provider.invalidateCredentials('tokens');assert.equal(await provider.tokens(),undefined);assert.equal((await provider.clientInformation()).client_id,'test')
  await assert.rejects(provider.redirectToAuthorization(new URL('https://www.figma.com/oauth')),/login required/)
  await assert.rejects(provider.redirectToAuthorization(new URL('https://evil.example/oauth')),/Figma HTTPS/)
  await assert.rejects(oauthFetch('http://127.0.0.1/private'),/Figma HTTPS/)
})
test('OAuth callback rejects incorrect state and accepts one exact callback',async t=>{
  const callback=await callbackServer({port:0,state:()=>'abcdef',timeoutMs:2000});t.after(()=>callback.close())
  const base=`http://127.0.0.1:${callback.port}/callback`
  assert.equal((await fetch(base+'?state=wrong&code=x')).status,400)
  assert.equal((await fetch(base+'?state='+encodeURIComponent('éééééé')+'&code=x')).status,400)
  assert.equal((await fetch(base+'?state=abcdef&code=valid')).status,200)
  assert.equal((await callback.result).get('code'),'valid')
  assert.equal((await fetch(base+'?state=abcdef&code=again')).status,400)
})
test('desktop URLs reject nonloopback/credential/query endpoints',()=>{
  assert.equal(desktopUrl(),'http://127.0.0.1:3845/mcp')
  for(const url of ['https://example.com/mcp','http://localhost:3845/mcp','http://u:p@127.0.0.1/mcp','http://127.0.0.1/mcp?x=1'])assert.throws(()=>desktopUrl(url),/loopback/)
})
test('SVG cannot hide external references in encoded attributes or styles',async t=>{
  const {workspace}=await fixture(t)
  for(const svg of ['<svg><image href="&#104;ttps://evil.example/x"/></svg>','<svg><image href="/internal"/></svg>','<svg><style>@import "evil.css";</style></svg>']){
    await writeFile(join(workspace,'asset.svg'),svg)
    await assert.rejects(readAssets(workspace,['asset.svg']),/self-contained/)
  }
  await writeFile(join(workspace,'asset.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="shape" d="M0 0L1 1"/></defs><use href="#shape"/></svg>')
  assert.equal((await readAssets(workspace,['asset.svg']))[0].mimeType,'image/svg+xml')
})
