import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connectOfficial } from '../lib/official.mjs'
test('real MCP SDK over HTTP negotiates, discovers schemas and calls without replay',async t=>{
  const calls=[]
  const server=createServer(async(req,res)=>{
    if(req.method!=='POST'){res.writeHead(405);res.end();return}
    let body='';for await(const chunk of req)body+=chunk
    const msg=JSON.parse(body);calls.push(msg.method)
    if(msg.id===undefined){res.writeHead(202);res.end();return}
    let result
    if(msg.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{},resources:{},prompts:{}},serverInfo:{name:'fixture-figma',version:'1'}}
    else if(msg.method==='tools/list')result={tools:[{name:'use_figma',description:'fixture',inputSchema:{type:'object',properties:{code:{type:'string'}},required:['code']}}]}
    else if(msg.method==='tools/call')result={content:[{type:'text',text:'canvas-result'}],structuredContent:{id:'1:2'}}
    else result={}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:msg.id,result}))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}))
  const connection=await connectOfficial({backend:'desktop',desktopServerUrl:`http://127.0.0.1:${server.address().port}/mcp`});t.after(()=>connection.close())
  const listed=await connection.client.listTools();assert.equal(listed.tools[0].name,'use_figma');assert.equal(calls.includes('tools/call'),false)
  const result=await connection.client.callTool({name:'use_figma',arguments:{code:'return 1'}});assert.equal(result.structuredContent.id,'1:2');assert.equal(calls.filter(n=>n==='tools/call').length,1)
})
