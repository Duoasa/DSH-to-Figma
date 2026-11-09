import {readAssets} from './assets.mjs'
export async function compareReference({workspace,session,attachments,reference,signal}){
 if(!reference||Boolean(reference.path)===Boolean(reference.attachmentId))throw Error('Provide exactly one reference.path or reference.attachmentId')
 let asset
 if(reference.path){[asset]=await readAssets(workspace,[reference.path])}
 else {
  const messages=session.deriveMessages?.()??[]
  const ref=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).find(b=>b.type==='image'&&b.attachment?.attachmentId===reference.attachmentId)?.attachment
  if(!ref)throw Error('Reference image is not in this Work session’s current message history; provide a workspace image path')
  if(!attachments?.readImage)throw Error('This DSH host does not expose image attachments; provide a workspace image path')
  const stored=await attachments.readImage(ref,signal)
  asset={mimeType:stored.ref.mediaType,data:Buffer.from(stored.data).toString('base64')}
 }
 if(!['image/png','image/jpeg','image/webp'].includes(asset.mimeType)||!asset.data)throw Error('Comparison reference must be PNG, JPEG or WebP')
 if(Buffer.byteLength(asset.data,'base64')>8*1024*1024)throw Error('Reference exceeds 8 MiB; crop or resize it first')
 return {mimeType:asset.mimeType,data:asset.data}
}
