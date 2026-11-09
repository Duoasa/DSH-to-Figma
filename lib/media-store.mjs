import {constants} from 'node:fs'
import {mkdir,realpath,lstat,open,link,rm,rmdir} from 'node:fs/promises'
import {join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {decode} from './assets.mjs'

const MAX_BYTES=256*1024*1024,CHUNK_BYTES=512*1024
const media={MP4:{extension:'mp4',mimeType:'video/mp4'},GIF:{extension:'gif',mimeType:'image/gif'},WEBM:{extension:'webm',mimeType:'video/webm'}}
async function checkDirectory(path){if((await lstat(path)).isSymbolicLink()||await realpath(path)!==path)throw Error('Media output directory cannot be a symlink')}
function checkSignature(bytes,format){
  const valid=format==='MP4'?bytes.length>=12&&bytes.toString('ascii',4,8)==='ftyp':format==='GIF'?bytes.length>=6&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)):bytes.length>=4&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
  if(!valid)throw Error('Native media output does not match '+format+' container signature')
}

/** Consume private bridge chunks directly to disk. The model receives metadata, never media bytes. */
export async function saveMediaTransfer(workspace,descriptor,{readChunk,release,signal}={}) {
  if(!descriptor||typeof descriptor.transferId!=='string'||!/^export-[a-z0-9-]{1,150}$/.test(descriptor.transferId))throw Error('Invalid export transfer ID')
  const transferId=descriptor.transferId
  let file,directory,partial,path,completed=false,releaseError
  try {
    const kind=media[descriptor.format]
    if(!kind||descriptor.mimeType!==kind.mimeType||!Number.isInteger(descriptor.byteLength)||descriptor.byteLength<1||descriptor.byteLength>MAX_BYTES||!Number.isInteger(descriptor.chunkSize)||descriptor.chunkSize<1||descriptor.chunkSize>CHUNK_BYTES)throw Error('Invalid export descriptor')
    if(typeof readChunk!=='function'||typeof release!=='function')throw Error('Export transfer callbacks are required')
    signal?.throwIfAborted()
    const root=await realpath(workspace)
    directory=root
    for(const name of ['.figma','assets']){directory=join(directory,name);await mkdir(directory,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e});await checkDirectory(directory)}
    directory=join(directory,randomUUID());await mkdir(directory,{mode:0o700});await checkDirectory(directory)
    let name=String(descriptor.name||'animation').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^\.+/,'').slice(0,100)||'animation'
    name=name.replace(/\.(mp4|gif|webm)$/i,'')+'.'+kind.extension
    path=join(directory,name);partial=join(directory,'.download.partial')
    file=await open(partial,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600)
    const hash=createHash('sha256');let offset=0,head=Buffer.alloc(0)
    while(offset<descriptor.byteLength){
      signal?.throwIfAborted();await checkDirectory(directory)
      const length=Math.min(descriptor.chunkSize,descriptor.byteLength-offset)
      const chunk=await readChunk({transferId,offset,length})
      signal?.throwIfAborted()
      if(!chunk||chunk.transferId!==transferId||chunk.offset!==offset||chunk.byteLength!==length||chunk.nextOffset!==offset+length||chunk.done!==(offset+length===descriptor.byteLength))throw Error('Invalid or out-of-order media chunk')
      const bytes=decode(chunk.data,CHUNK_BYTES)
      if(bytes.length!==length)throw Error('Media chunk length mismatch')
      if(head.length<12)head=Buffer.concat([head,bytes.subarray(0,12-head.length)])
      if(head.length>=12||offset+length===descriptor.byteLength)checkSignature(head,descriptor.format)
      hash.update(bytes);await file.writeFile(bytes);offset+=bytes.length
    }
    await file.sync();await file.close();file=null;signal?.throwIfAborted();await checkDirectory(directory)
    // link is atomic and rejects an existing destination; rename would overwrite it.
    await link(partial,path);completed=true;await rm(partial,{force:true}).catch(()=>{})
    return {path,name,mimeType:kind.mimeType,bytes:descriptor.byteLength,sha256:hash.digest('hex'),nodeId:descriptor.nodeId,format:descriptor.format}
  } finally {
    await file?.close().catch(()=>{})
    if(!completed&&partial)try{await checkDirectory(directory);await rm(partial,{force:true});await rmdir(directory)}catch{}
    // The export is immutable and can always be released, even after host cancellation.
    if(typeof release==='function')try{await release({transferId})}catch(e){releaseError=e}
    // A cleanup transport failure must not discard a successfully saved file or mask its error.
    void releaseError
  }
}
