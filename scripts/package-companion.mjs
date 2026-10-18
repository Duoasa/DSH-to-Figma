import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {companionFiles} from '../lib/companion.mjs'
import {zipFiles} from '../lib/archive.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
await mkdir(join(root,'dist'),{recursive:true})
const path=join(root,'dist',`DSH-to-Figma-companion-${pkg.version}.zip`)
await writeFile(path,zipFiles(await companionFiles()))
console.log(`Standalone Figma companion (no credentials): ${path}`)
