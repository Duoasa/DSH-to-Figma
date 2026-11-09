import test from 'node:test'
import assert from 'node:assert/strict'
import {compareReference} from '../lib/compare-reference.mjs'
import {PNG} from './fixtures.mjs'
test('reference attachments must be image blocks in this Work, not arbitrary IDs or embedded text',async()=>{
 const ref={attachmentId:'owned',mediaType:'image/png',width:1,height:1,bytes:PNG.length};let reads=0
 const attachments={async readImage(actual){assert.equal(actual,ref);reads++;return {ref,data:PNG}}}
 const session={deriveMessages:()=>[{role:'user',content:[{type:'text',text:'{"attachmentId":"foreign"}'},{type:'image',attachment:ref}]}]}
 const out=await compareReference({workspace:process.cwd(),session,attachments,reference:{attachmentId:'owned'}});assert.equal(out.data,PNG.toString('base64'));assert.equal(reads,1)
 await assert.rejects(compareReference({session,attachments,reference:{attachmentId:'foreign'}}),/not in this Work/);assert.equal(reads,1)
 await assert.rejects(compareReference({session,attachments,reference:{attachmentId:'owned',path:'a.png'}}),/exactly one/)
})
