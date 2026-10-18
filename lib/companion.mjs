import {readFile,mkdir,lstat,chmod,open,rename,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import {bridgeToken,privateDirectory} from './storage.mjs'
import {zipFiles} from './archive.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
export async function companionFiles({token,port=3055}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid companion bridge port')
  if(token!==undefined&&!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid companion pairing token')
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
  const manifest=JSON.parse(await readFile(join(root,'companion/manifest.json'),'utf8'))
  if(token){manifest.id='dsh-to-figma-local-'+createHash('sha256').update(token).digest('hex').slice(0,12);manifest.name='DSH to Figma · Local'}
  manifest.networkAccess.devAllowedDomains=[`http://localhost:${port}`]
  const bootstrap={version:pkg.version,port,...(token?{token}:{})}
  const code=`globalThis.DSH_FIGMA_BOOTSTRAP = ${JSON.stringify(bootstrap)};\n`+await readFile(join(root,'companion/code.js'),'utf8')
  return {
    'manifest.json':JSON.stringify(manifest,null,2)+'\n',
    'code.js':code,
    'ui.html':await readFile(join(root,'companion/ui.html'),'utf8'),
    'README.txt':`DSH to Figma ${pkg.version}\n\n${token?'PRIVATE PAIRED COPY — contains a local credential. Do not publish or share.\n本机专用已配对版本，含本机凭证，请勿上传或分享。':'Generic companion — contains no credentials. For automatic pairing, ask DSH to run figma_setup and import its generated manifest instead.\n通用版不含凭证。推荐让 DSH 调用 figma_setup，导入它生成的已配对 manifest。'}\n\nFigma desktop > Plugins > Development > Import plugin from manifest… > manifest.json\nKeep this folder in place. Open a Design file and run the plugin; keep its window open.\n保留此文件夹位置，在目标文件运行插件并保持窗口打开。DSH 本地模式默认端口为 3055。\n${token?'It connects automatically. One connected file is selected automatically; multiple files require an explicit choice.\n启动后自动连接。只有一个连接文件时自动选用，多个文件时明确选择。':'Manual fallback: run dsh-figma pair, then paste the token into Advanced in the plugin.\n手动备用方式：运行 dsh-figma pair，把密钥粘贴到插件高级设置。'}\n`,
    'LICENSE':await readFile(join(root,'LICENSE'),'utf8'),
  }
}
async function safeDirectory(path){await mkdir(path,{recursive:true,mode:0o700});const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Companion directory must be a real directory');await chmod(path,0o700)}
async function privateFile(path,value){
  try{const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Companion output must be a regular file')}catch(error){if(error.code!=='ENOENT')throw error}
  const temp=path+'.'+randomUUID()+'.tmp'
  try{const file=await open(temp,'wx',0o600);try{await file.writeFile(value);await file.sync()}finally{await file.close()}await rename(temp,path)}finally{await rm(temp,{force:true})}
}
export async function prepareCompanion(home,{port=3055,token}={}){
  const directory=await privateDirectory(home),folder=join(directory,'companion')
  await safeDirectory(folder)
  const files=await companionFiles({port,token:token??await bridgeToken(home)})
  // Publish the manifest last; Figma retains this stable folder across upgrades.
  for(const [name,bytes] of Object.entries(files))if(name!=='manifest.json')await privateFile(join(folder,name),bytes)
  await privateFile(join(folder,'manifest.json'),files['manifest.json'])
  const archive=join(directory,'DSH-to-Figma-paired.zip');await privateFile(archive,zipFiles(files))
  return {manifest:join(folder,'manifest.json'),folder,archive,paired:true,port,private:true}
}
