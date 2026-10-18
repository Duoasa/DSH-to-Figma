const string={type:'string'}, boolean={type:'boolean'}, nodeId={type:'string',description:'Figma node ID, e.g. 12:34. Omit to use the editor selection where supported.'}
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false})
const node={nodeId,depth:{type:'integer',minimum:0,maximum:10}}, shot={nodeId,scale:{type:'number',minimum:0.01,maximum:4}}
export const LOCAL_TOOLS=[
  ['use_figma','Run JavaScript inside the selected Figma document using the public Plugin API. Supports Design, FigJam and Slides. Return IDs; await promises. All scripts are treated as mutations. No host filesystem/network APIs. Read the figma-workbench skill first.',schema({code:string},['code']),true],
  ['get_selection','Read the current page and selected nodes.',schema()],
  ['list_fonts','List the font families and exact styles available in this editor.',schema()],
  ['get_metadata','Read a bounded layer tree. Without nodeId, returns pages and the current page. Also reconciles a previous uncertain write.',schema(node),false,true],
  ['get_screenshot','Return an actual PNG screenshot as a DSH image attachment. Requires an exportable node.',schema(shot)],
  ['get_design_context','Read native layout, text, fills, component properties and CSS, with an actual screenshot. Adapt these to the target project. This local implementation does not use cloud code generation.',schema({...node,...shot,includeScreenshot:boolean})],
  ['get_figjam','Read FigJam structure with an actual screenshot of the selected node.',schema({...node,...shot,includeScreenshot:boolean})],
  ['get_variable_defs','Read local variable collections, modes, aliases, scopes and values.',schema()],
  ['get_libraries','Read available team variable libraries through the public Plugin API.',schema()],
  ['search_design_system','Search current-page components and local-file variables/styles. Does not search all cloud libraries.',schema({query:string},['query'])],
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
