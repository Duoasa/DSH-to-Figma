import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=resolveRoot()
function resolveRoot(){return dirname(dirname(fileURLToPath(import.meta.url)))}
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
const helpers=await readFile(join(root,'companion/helpers.js'),'utf8'),capabilities=await readFile(join(root,'companion/capabilities.js'),'utf8'),runtime=await readFile(join(root,'companion/runtime.js'),'utf8'),main=await readFile(join(root,'companion/main.js'),'utf8')
const icons=await readFile(join(root,'companion/icons.js'),'utf8')
const iconNames=Object.keys(JSON.parse(icons.match(/const paths=(.*);/)[1]))
await writeFile(join(root,'lib/icon-names.mjs'),'// Generated from companion/icons.js by scripts/check.mjs.\nexport const ICON_NAMES = Object.freeze('+JSON.stringify(iconNames)+')\n')
const extensions=await Promise.all(['context','media','authoring','operations','reference','icons','quality','recovery','readonly'].map(name=>readFile(join(root,'companion',name+'.js'),'utf8')))
await writeFile(join(root,'companion/code.js'),['globalThis.DSH_FIGMA_VERSION = '+JSON.stringify(pkg.version)+';',helpers,capabilities,...extensions,runtime,main].join('\n'))
const uiPath=join(root,'companion/ui.html'),compare=await readFile(join(root,'companion/compare.js'),'utf8')
let ui=await readFile(uiPath,'utf8')
const start='/* BEGIN GENERATED COMPARE */',end='/* END GENERATED COMPARE */'
if(ui.includes(start))ui=ui.slice(0,ui.indexOf(start))+start+'\n'+compare+'\n'+ui.slice(ui.indexOf(end))
else ui=ui.replace('<script>','<script>\n'+start+'\n'+compare+'\n'+end)
await writeFile(uiPath,ui)
for(const directory of [root,join(root,'lib'),join(root,'companion')])for(const name of await readdir(directory))if(/\.(mjs|js)$/.test(name)){const check=spawnSync(process.execPath,['--check',join(directory,name)],{encoding:'utf8'});if(check.status!==0)throw new Error(check.stderr)}
const manifest=JSON.parse(await readFile(join(root,'companion/manifest.json'),'utf8'))
for(const key of ['main','ui'])await readFile(join(root,'companion',manifest[key]))
for(const path of pkg.files)await import('node:fs/promises').then(fs=>fs.access(join(root,path)))
console.log('PASS: syntax, generated companion entry, manifest and package files')
