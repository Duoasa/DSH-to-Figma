import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { oauthProvider, oauthFetch, REMOTE_URL } from './oauth.mjs'
export function desktopUrl(value='http://127.0.0.1:3845/mcp'){
  const u=new URL(value)
  if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/mcp')throw new Error('Desktop MCP must use a literal loopback HTTP /mcp URL')
  return u.href
}
export async function connectOfficial({backend,home,desktopServerUrl,clientId,signal}){
  const remote=backend==='remote',url=remote?REMOTE_URL:desktopUrl(desktopServerUrl)
  const provider=remote?await oauthProvider(home,{clientId}):undefined
  const client=new Client({name:'dsh-to-figma',version:'0.1.5'})
  const transport=new StreamableHTTPClientTransport(new URL(url),{
    authProvider:provider,
    fetch:remote?oauthFetch:async(target,init)=>{if(new URL(target).origin!==new URL(url).origin)throw new Error('Unexpected desktop endpoint');return fetch(target,{...init,redirect:'error'})},
    reconnectionOptions:{maxRetries:0},
  })
  const close=async()=>{await client.close().catch(()=>{});await transport.close().catch(()=>{})}
  try{await client.connect(transport,{timeout:15000,signal});return {client,close}}catch(error){await close();throw error}
}
