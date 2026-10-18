import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { privateDirectory, privateJson, readJson } from './storage.mjs'
export const REMOTE_URL='https://mcp.figma.com/mcp'
const trusted=url=>{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='figma.com'||u.hostname.endsWith('.figma.com')))throw new Error('OAuth endpoint is not a Figma HTTPS origin');return u}
export const oauthFetch=async(url,init={})=>{trusted(typeof url==='string'||url instanceof URL?url:url.url);return fetch(url,{...init,redirect:'error'})}
export async function oauthProvider(home,{redirectUrl='http://127.0.0.1:3056/callback',onRedirect,clientId}={}){
  const path=join(await privateDirectory(home),'oauth.json')
  let verifier, state=randomBytes(24).toString('hex'), tail=Promise.resolve()
  const read=()=>readJson(path)
  const update=change=>{const next=tail.then(async()=>{const data=await read();await privateJson(path,change(data))});tail=next.catch(()=>{});return next}
  return {
    redirectUrl,
    clientMetadata:{client_name:'DSH to Figma',redirect_uris:[redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},
    state:()=>state,
    async clientInformation(){return clientId?{client_id:clientId}:(await read()).client},
    saveClientInformation:client=>update(data=>({...data,client})),
    async tokens(){return (await read()).tokens},
    saveTokens:tokens=>update(data=>({...data,tokens})),
    async redirectToAuthorization(url){trusted(url);if(!onRedirect)throw new Error('Figma login required. Run dsh-figma login; this client may require Figma approval.');await onRedirect(url)},
    saveCodeVerifier:value=>{verifier=value},
    codeVerifier:()=>{if(!verifier)throw new Error('No active PKCE login');return verifier},
    invalidateCredentials:scope=>update(data=>{if(scope==='all')return {};if(scope==='tokens')delete data.tokens;if(scope==='client')delete data.client;if(scope==='discovery')delete data.discovery;if(scope==='verifier')verifier=undefined;return data}),
    saveDiscoveryState:discovery=>update(data=>({...data,discovery})),
    async discoveryState(){return (await read()).discovery},
  }
}
export async function callbackServer({port=3056,state,timeoutMs=180000}){
  let resolveResult,rejectResult,timer,done=false
  const result=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject});result.catch(()=>{})
  const server=createServer((req,res)=>{
    let url
    try{url=new URL(req.url,'http://127.0.0.1')}catch{res.writeHead(400);res.end('Invalid OAuth callback');return}
    const received=Buffer.from(url.searchParams.get('state')||''),expected=Buffer.from(state())
    if(done||req.method!=='GET'||req.headers.host!==`127.0.0.1:${server.address().port}`||url.pathname!=='/callback'||received.length!==expected.length||!timingSafeEqual(received,expected)){res.writeHead(400);res.end('Invalid OAuth callback');return}
    done=true;clearTimeout(timer)
    res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'"})
    if(url.searchParams.has('error')||!url.searchParams.get('code')){res.end('Figma authorization was not completed.');rejectResult(new Error('Figma authorization denied'))}
    else{res.end('Authorization received. Return to the terminal to check completion.');resolveResult(url.searchParams)}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  timer=setTimeout(()=>rejectResult(new Error('Figma login timed out')),timeoutMs)
  return {port:server.address().port,result,close:async()=>{clearTimeout(timer);if(!done){done=true;rejectResult(new Error('Login closed'))}await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})}}
}
