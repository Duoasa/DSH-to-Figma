#!/usr/bin/env node
import { readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client'
import { bridgeToken, privateDirectory, readJson } from './lib/storage.mjs'
import { oauthProvider, callbackServer, oauthFetch, REMOTE_URL } from './lib/oauth.mjs'
const root=dirname(fileURLToPath(import.meta.url))
function options(args){const values={command:args.shift()??'help'};while(args.length){const key=args.shift();if(!['--home','--port','--client-id','--profile','--cli'].includes(key)||!args.length)throw new Error('Unknown or incomplete option');values[key.slice(2)]=args.shift()}return values}
async function main(){
  const opts=options(process.argv.slice(2)),home=resolve(opts.home??process.env.DSH_HOME??join(homedir(),'.dsh'))
  if(opts.command==='help'){console.log('dsh-figma pair|status|login|logout|install [--home PATH] [--port 3056] [--client-id ID] [--profile NAME] [--cli /path/to/dsh]\nInstall uses the native DSH plugin add command. Pair prints a local secret for the Figma companion only. Login uses the official Figma OAuth service; client approval may be required.');return}
  if(opts.command==='pair'){const token=await bridgeToken(home),state=await readJson(join(await privateDirectory(home),'bridge.json'));console.log(`Figma companion: ${join(root,'companion/manifest.json')}\nBridge port: ${state.port??3055}\nPairing token (paste into the Figma plugin; do not share):\n${token}`);return}
  if(opts.command==='status'){const directory=await privateDirectory(home),state=await readJson(join(directory,'bridge.json')),oauth=await readJson(join(directory,'oauth.json'));console.log(JSON.stringify({home,recordedBridge:state,bridgeLive:'Check figma_status inside DSH; the saved record alone does not prove liveness.',oauthSaved:!!oauth.tokens,companion:join(root,'companion/manifest.json')},null,2));return}
  if(opts.command==='logout'){await rm(join(await privateDirectory(home),'oauth.json'),{force:true});console.log('Local Figma OAuth credentials removed. Reconnect/restart the DSH plugin to close existing sessions. Revoke app access in Figma to revoke the server grant.');return}
  if(opts.command==='install'){
    const args=['plugin',...(opts.profile?['--profile',opts.profile]:[]),'add',`file:${root}`]
    const child=spawnSync(opts.cli??'dsh',args,{stdio:'inherit',env:{...process.env,DSH_HOME:home},shell:false})
    if(child.error||child.status!==0)throw new Error('Native DSH plugin installation failed; check CLI output')
    return
  }
  if(opts.command==='login'){
    const port=Number(opts.port??3056);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid OAuth callback port')
    const provider=await oauthProvider(home,{redirectUrl:`http://127.0.0.1:${port}/callback`,clientId:opts['client-id'],onRedirect:url=>console.log(`Open this Figma authorization URL in your browser:\n${url.href}`)})
    const callback=await callbackServer({port,state:provider.state}),client=new Client({name:'dsh-to-figma',version:'0.1.3'}),transport=new StreamableHTTPClientTransport(new URL(REMOTE_URL),{authProvider:provider,fetch:oauthFetch,reconnectionOptions:{maxRetries:0}})
    try{
      try{await client.connect(transport,{timeout:15000})}catch(error){if(!(error instanceof UnauthorizedError))throw error;const params=await callback.result;await transport.finishAuth(params)}
      if(!await provider.tokens())throw new Error('Login did not return credentials')
      console.log('Figma credentials saved privately. Set backend: remote, then use figma_reconnect in DSH. Availability still depends on Figma client/account access.')
    }finally{await callback.close();await client.close().catch(()=>{});await transport.close().catch(()=>{})}
    return
  }
  throw new Error('Unknown command; run dsh-figma help')
}
main().catch(()=>{console.error('dsh-figma: operation failed. Check the command, local port, DSH installation or Figma client approval. Credentials and server response bodies are not logged.');process.exitCode=1})
