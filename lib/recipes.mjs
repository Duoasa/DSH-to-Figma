import { join } from 'node:path'
import { parse } from 'acorn'
import { workspaceDirectory, readStored, mutateStored, revisionOf, boundedEntries } from './design-sync.mjs'

function validName(name){if(typeof name!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(name))throw Error('Recipe name must be 1–64 lowercase letters, digits, underscores or hyphens, starting with a letter');return name}
function validateRecord(record,name) {
  if(record===null)return
  if(record.formatVersion!==1||record.name!==name||typeof record.code!=='string'||typeof record.description!=='string'||record.revision!==revisionOf({name,description:record.description,code:record.code}))throw Error('Invalid recipe record')
}
export async function recipes(workspace,{action='list',name,code,description='',expectedRevision}={}) {
  if(!['list','read','save','remove'].includes(action))throw Error('Unknown recipe action')
  if(action!=='list')validName(name)
  const dir=await workspaceDirectory(workspace,'recipes',action==='save')
  if(action==='list'){
    if(!dir)return {recipes:[],complete:true}
    const files=await recipeFiles(dir)
    if(files.length>200)throw Error('Recipe inventory exceeds 200 records')
    const items=[]
    for(const f of files){const key=f.slice(0,-5),record=await readStored(join(dir,f),200000);validateRecord(record,key);if(record)items.push({name:key,description:record.description,revision:record.revision,updatedAt:record.updatedAt})}
    return {recipes:items,complete:true,execution:'Recipes are inert source. Run reviewed code through the bound use_figma tool.'}
  }
  if(action==='read'){
    const record=dir?await readStored(join(dir,name+'.json'),200000):null;validateRecord(record,name)
    if(!record)throw Error('Recipe not found')
    return {...record,execution:'Read only; no code was executed. Use the normal bound use_figma workflow.'}
  }
  if(action==='remove'&&!dir)throw Error('Recipe not found')
  if(action==='save'){
    if(typeof code!=='string'||!code.trim()||code.length>150000||Buffer.byteLength(code)>160000)throw Error('Recipe code must be nonempty JavaScript up to 150000 characters / 160000 bytes')
    if(typeof description!=='string'||description.length>2000)throw Error('Recipe description must be at most 2000 characters')
    try{parse('async function recipe(figma,dsh){\n'+code+'\n}',{ecmaVersion:'latest'})}catch(e){throw Error('Recipe JavaScript syntax is invalid: '+e.message)}
  }
  let existed=false
  const record=await mutateStored(dir,name+'.json',previous=>{
    validateRecord(previous,name);existed=!!previous
    if(previous&&previous.revision!==expectedRevision)throw Error('Recipe revision required or changed; read first and pass expectedRevision')
    if(!previous&&expectedRevision!==undefined)throw Error('Recipe no longer exists; do not overwrite from a stale read')
    if(action==='remove'){if(!previous)throw Error('Recipe not found');return null}
    if(!previous)return readCountGuard(dir).then(()=>make())
    return make()
  })
  function make(){return {formatVersion:1,name,description,code,revision:revisionOf({name,description,code}),updatedAt:new Date().toISOString()}}
  return action==='remove'?{removed:name}:{status:existed?'updated':'created',name,revision:record.revision,path:join(dir,name+'.json'),executed:false}
}
async function recipeFiles(dir){
  const inventory=await boundedEntries(dir,1000)
  if(inventory.truncated)throw Error('Recipe storage directory exceeds inventory budget')
  return inventory.entries.map(e=>e.name).filter(f=>/^[a-z][a-z0-9_-]{0,63}\.json$/.test(f)).sort()
}
async function readCountGuard(dir){if((await recipeFiles(dir)).length>=200)throw Error('Recipe limit reached (200)')}
