import { constants } from 'node:fs'
import { open, realpath, mkdir, lstat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

const LIMIT = 12 * 1024 * 1024
export function inside(root, candidate) { const rel = relative(root,candidate); return rel !== '..' && !rel.startsWith('..'+sep) && !isAbsolute(rel) }
export function imageMime(bytes) {
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png'
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg'
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp'
  if(bytes.length>=6&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))return 'image/gif'
  return null
}
export function decode(data, limit=LIMIT) {
  if(typeof data!=='string'||data.length>Math.ceil(limit/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw new Error('Invalid or oversized base64')
  const bytes=Buffer.from(data,'base64')
  if(!bytes.length||bytes.length>limit||bytes.toString('base64')!==data)throw new Error('Empty or oversized asset')
  return bytes
}
export async function readAssets(workspace, files) {
  if(!Array.isArray(files)||!files.length||files.length>20)throw new Error('Provide 1–20 workspace files')
  const root=await realpath(workspace), assets=[]; let total=0
  for(const path of files){
    if(typeof path!=='string')throw new Error('File paths must be strings')
    const candidate=resolve(root,path)
    if(!inside(root,candidate))throw new Error('Asset must stay inside the current workspace')
    const canonical=await realpath(candidate)
    if(!inside(root,canonical))throw new Error('Asset symlink escapes the workspace')
    const file=await open(canonical,constants.O_RDONLY|(constants.O_NOFOLLOW??0))
    let bytes
    try { const info=await file.stat(); if(!info.isFile()||info.size>LIMIT-total)throw new Error('Asset batch exceeds 12 MiB'); bytes=await file.readFile(); if(bytes.length!==info.size||await realpath(candidate)!==canonical)throw new Error('Asset changed while reading') }
    finally { await file.close() }
    total+=bytes.length; if(total>LIMIT)throw new Error('Asset batch exceeds 12 MiB')
    const mimeType=imageMime(bytes), name=basename(path)
    if(mimeType)assets.push({name,mimeType,data:bytes.toString('base64')})
    else if(/\.svg$/i.test(name)){
      const svg=bytes.toString('utf8')
      if(!/<svg[\s>]/i.test(svg)||/<!DOCTYPE|<!ENTITY|<script[\s>]|<foreignObject[\s>]|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:|\/\/)|url\(\s*["']?\s*(?:https?:|file:|\/\/)/i.test(svg))throw new Error('SVG must be self-contained with no executable or external content')
      for(const match of svg.matchAll(/\b(?:href|src)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
        if(!/^#[A-Za-z_][\w:.-]*$/.test(match[2])&&!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(match[2]))throw new Error('SVG must be self-contained; external references are not supported')
      }
      if(/@import|url\(\s*["']?\s*[^#\s]/i.test(svg))throw new Error('SVG must be self-contained; external styles are not supported')
      assets.push({name,mimeType:'image/svg+xml',svg})
    } else throw new Error('Use PNG, JPEG, WebP, GIF or self-contained SVG assets')
  }
  return assets
}
export async function saveAssets(workspace, assets) {
  if(!Array.isArray(assets)||assets.length>40)throw new Error('Invalid asset batch')
  // Decode and validate every byte before creating an output directory.
  let total=0
  const decoded=assets.map(asset=>{const bytes=decode(asset.data); total+=bytes.length;if(total>LIMIT)throw new Error('Asset batch exceeds 12 MiB');return {asset,bytes}})
  const root=await realpath(workspace)
  let directory=root
  for(const name of ['.figma','assets',randomUUID()]){
    directory=join(directory,name);await mkdir(directory,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e})
    if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)throw new Error('Asset output directory cannot be a symlink')
  }
  const files=[]
  for(const [index,{asset,bytes}] of decoded.entries()){
    const sniffed=imageMime(bytes), ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[sniffed]
    let name=String(asset.name||'asset').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^\.+/,'').slice(0,100)||'asset'
    if(ext&&name.endsWith('.bin'))name=name.slice(0,-4)+ext
    const path=join(directory,`${index+1}-${name}`), file=await open(path,'wx',0o600)
    try{await file.writeFile(bytes)}finally{await file.close()}
    files.push({path,name,mimeType:sniffed||asset.mimeType||'application/octet-stream',bytes:bytes.length})
  }
  return files
}
export function localResult(payload) {
  if(!payload||!Array.isArray(payload.images))throw new Error('Invalid Figma result')
  if(payload.images.length>4)throw new Error('Too many screenshots')
  let total=0
  const images=payload.images.map(block=>{const bytes=decode(block.data,8*1024*1024);total+=bytes.length;if(total>16*1024*1024||imageMime(bytes)!==block.mimeType)throw new Error('Invalid screenshot payload');return {type:'image',mimeType:block.mimeType,data:block.data}})
  const value=payload.value??null
  return {content:[{type:'text',text:JSON.stringify(value)},...images.flatMap((image,index)=>payload.images[index].name?[{type:'text',text:String(payload.images[index].name)},image]:[image])],structuredContent:{result:value}}
}
