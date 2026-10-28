const string={type:'string'}, boolean={type:'boolean'}, nodeId={type:'string',description:'Figma node ID, e.g. 12:34. Omit to use the editor selection where supported.'}
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false})
const profile={type:'string',enum:['summary','full'],description:'Use summary for discovery; full preserves detailed fields (default).'}
const read={profile,maxNodes:{type:'integer',minimum:1,maximum:1500},maxBytes:{type:'integer',minimum:1024,maximum:2097152,description:'Budget for returned JSON metadata; screenshots have separate limits.'}}
const page={offset:{type:'integer',minimum:0,maximum:1000000},limit:{type:'integer',minimum:1,maximum:200}}
const ids={type:'array',items:string,minItems:1,maxItems:200}
const executionContext={fileKey:{type:'string',description:'Must match the selected document fileKey from figma_status. Local-only documents use local:<connectionId>.'},sessionId:{type:'string',description:'Task UUID returned by create_session; scoped to this DSH Work session.'}}
const node={nodeId,depth:{type:'integer',minimum:0,maximum:10},...read}
const shot={nodeId,scale:{type:'number',minimum:0.01,maximum:4},quality:{type:'string',enum:['overview','detail'],description:'Overview caps the longest edge at 800px; detail/default at 1600px. Explicit scale overrides this preset.'}}
export const LOCAL_TOOLS=[
  ['create_session','Create a local task recording UUID for the selected Figma file. Reuse it across calls, including explicitly selected other files. This does not create a cloud session or switch documents.',schema({...executionContext,description:string},['fileKey','description'])],
  ['use_figma','Run JavaScript using the figma-use 16 contract in the selected local Figma document. Read figma-workbench first. Top-level await/return, query/QueryResult, matches/set/tree, auto layout, screenshots and io.write are supported. Include description, fileKey and sessionId from create_session. Page context starts at the first page every call; switch at most once. Return affected IDs. Errors include safeToRetryWithoutCanvasRead. Requires companion featureVersion 3.',schema({code:string,description:string,...executionContext,skillNames:{type:'string',description:'Comma-separated loaded skill names; local task metadata only.'}},['code']),true],
  ['get_selection','Read the current page and selected nodes. Prefer summary for discovery.',schema(read)],
  ['list_fonts','Find available font families and exact styles. No arguments returns the legacy array; filters or pagination return fonts and pagination.',schema({query:string,family:string,style:string,...page})],
  ['get_metadata','Read a bounded layer tree; prefer summary for discovery. Without nodeId, returns pages and current page. Offset/limit page direct children and require nodeId with depth >= 1. Follow truncation continuations. Only reads without profile, budget or paging options reconcile an uncertain write.',schema({...node,...page}),false,true],
  ['get_screenshot','Return an actual PNG screenshot as a DSH image attachment. Requires an exportable node.',schema(shot)],
  ['get_design_context','Read a target subtree and CSS for design-to-code work. For a few native properties prefer bounded get_metadata or one scoped script; do not read an entire subtree for a few descendant values. Set includeScreenshot:false unless an image is needed; screenshots are included by default. No cloud code generation.',schema({...node,...shot,includeScreenshot:boolean})],
  ['get_figjam','Read FigJam structure. Set includeScreenshot:false for structural checks; screenshots are included by default.',schema({...node,...shot,includeScreenshot:boolean})],
  ['get_variable_defs','Read local variables or collection inventory. collectionsOnly:true lists collections including empty ones without reading variables; query then matches collection names. Otherwise collections describe the returned variable page or requested IDs, not a complete collection inventory. Follow coverage and pagination before concluding absence. Summary omits values; no arguments preserves the full result.',schema({collectionsOnly:{type:'boolean',description:'Inventory collections, including empty ones; query filters collection names. Supports collectionIds, modeIds and paging, not variable ids/type. Variables are not read.'},collectionIds:ids,ids,type:{type:'string',enum:['COLOR','FLOAT','BOOLEAN','STRING']},modeIds:ids,query:string,profile,...page})],
  ['get_libraries','Read available team variable libraries through the public Plugin API.',schema()],
  ['search_design_system','Search local components, variables and styles. queries batches {entity,query} searches and returns results in order. Legacy query/kind also supported. Components use current page unless pageId supplied. Pagination is per kind; no cloud component-library or Code Connect search.',schema({query:string,queries:{type:'array',minItems:1,maxItems:50,items:schema({entity:{type:'string',enum:['component','variable','style']},query:string},['entity','query'])},...executionContext,includeLibraryKeys:{type:'array',items:string},disableCodeConnect:boolean,kind:{type:'string',enum:['all','components','variables','styles']},pageId:string,profile,...page})],
  ['get_component_context','Read component, component set or instance properties and descendants.',schema(node)],
  ['get_local_component_links','Read local DSH component-to-code links. These are plugin data, not published Code Connect mappings.',schema({nodeId},['nodeId'])],
  ['set_local_component_links','Save local component-to-code links in Figma plugin data. Does not publish Code Connect.',schema({nodeId,links:{type:'array',maxItems:100,items:{type:'object',properties:{name:string,source:string},required:['name','source'],additionalProperties:false}}},['nodeId','links']),true],
  ['get_motion_context','Read prototype reactions and public motion data when exposed. Cloud timeline/code conversion is not emulated.',schema({nodeId})],
  ['upload_assets','Import workspace raster/SVG files as editable SVG layers or image fills. Files must be inside the current Work workspace.',schema({files:{type:'array',items:string,minItems:1,maxItems:20},parentId:string},['files']),true],
  ['download_assets','Export nodes to workspace files as PNG/JPG/SVG/PDF, optionally with original image bytes. Outputs are saved under .figma/assets.',schema({nodeId,nodeIds:{type:'array',items:string,minItems:1,maxItems:20},format:{type:'string',enum:['PNG','JPG','SVG','PDF']},scale:shot.scale,includeOriginalImages:boolean})],
  ['import_scene','Import a local JSON scene as native editable Figma nodes. Prefer use_figma for complex components, variables, graphs or Slides. See the scene reference.',schema({nodes:{type:'array',items:{type:'object',properties:{type:string,props:{type:'object',additionalProperties:true},children:{type:'array',items:{}}},required:['type'],additionalProperties:false},minItems:1,maxItems:500},parentId:string},['nodes']),true],
].map(([name,description,inputSchema,mutation=false,inspect=false])=>({name,description,inputSchema,mutation,inspect}))
export const objectSchema=schema
export const SUPPORTED_BACKENDS=['local','desktop','remote']
const legacyQueryKeys={
  get_metadata:['nodeId','depth'],get_selection:[],list_fonts:[],
  get_design_context:['nodeId','depth','scale','includeScreenshot'],get_figjam:['nodeId','depth','scale','includeScreenshot'],
  get_screenshot:['nodeId','scale'],get_variable_defs:[],search_design_system:['query'],get_component_context:['nodeId','depth'],
}
export function requiresQueryFeatures(method,args={}){
  if(!Object.hasOwn(legacyQueryKeys,method)||!args||typeof args!=='object')return false
  const legacy=legacyQueryKeys[method]
  const properties=LOCAL_TOOLS.find(tool=>tool.name===method)?.inputSchema.properties??{}
  return Object.keys(args).some(key=>Object.hasOwn(properties,key)&&!legacy.includes(key))
}
export function requiredQueryFeatureVersion(method,args={}){
  if(method==='use_figma'||method==='create_session'||method==='search_design_system'&&args?.queries!==undefined)return 3
  if(method==='get_variable_defs'&&args&&typeof args==='object'&&Object.hasOwn(args,'collectionsOnly'))return 2
  return requiresQueryFeatures(method,args)?1:0
}
