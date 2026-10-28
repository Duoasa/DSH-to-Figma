import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=resolveRoot()
function resolveRoot(){return dirname(dirname(fileURLToPath(import.meta.url)))}
const helpers=await readFile(join(root,'companion/helpers.js'),'utf8'),runtime=await readFile(join(root,'companion/runtime.js'),'utf8'),main=await readFile(join(root,'companion/main.js'),'utf8')
await writeFile(join(root,'companion/code.js'),helpers+'\n'+runtime+'\n'+main)
for(const directory of [root,join(root,'lib'),join(root,'companion')])for(const name of await readdir(directory))if(/\.(mjs|js)$/.test(name)){const check=spawnSync(process.execPath,['--check',join(directory,name)],{encoding:'utf8'});if(check.status!==0)throw new Error(check.stderr)}
const manifest=JSON.parse(await readFile(join(root,'companion/manifest.json'),'utf8'))
for(const key of ['main','ui'])await readFile(join(root,'companion',manifest[key]))
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
for(const path of pkg.files)await import('node:fs/promises').then(fs=>fs.access(join(root,path)))
console.log('PASS: syntax, generated companion entry, manifest and package files')
