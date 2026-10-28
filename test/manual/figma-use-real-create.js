const pageName='DSH Contract 20261028';
let page=figma.root.children.find(p=>p.name===pageName);
if(!page){page=figma.createPage();page.name=pageName}
await figma.setCurrentPageAsync(page);
const collectionName='DSH Contract 20261028';
let collection=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name===collectionName);
if(!collection){collection=figma.variables.createVariableCollection(collectionName);collection.renameMode(collection.defaultModeId,'Light');collection.addMode('Dark')}
const existing=await figma.variables.getLocalVariablesAsync();
function variable(name,type){return existing.find(v=>v.variableCollectionId===collection.id&&v.name===name)||figma.variables.createVariable(name,collection,type)}
const primitive=variable('primitive/brand','COLOR'),semantic=variable('semantic/primary','COLOR'),gap=variable('spacing/gap','FLOAT');
primitive.scopes=['ALL_FILLS'];semantic.scopes=['ALL_FILLS'];gap.scopes=['GAP'];
for(const mode of collection.modes){primitive.setValueForMode(mode.modeId,mode.name==='Dark'?{r:0.5,g:0.4,b:1}:{r:0.3,g:0.2,b:0.8});semantic.setValueForMode(mode.modeId,figma.variables.createVariableAlias(primitive));gap.setValueForMode(mode.modeId,12)}
semantic.setVariableCodeSyntax('WEB','var(--contract-primary)');
await figma.loadFontAsync({family:'Inter',style:'Regular'});
let set=page.query('COMPONENT_SET[name="DSH Contract Button"]').first();
if(!set){
 const variants=[];
 for(const state of ['Default','Hover']){
  const component=figma.createComponent();page.appendChild(component);
  component.set({width:220,height:64,layoutMode:'HORIZONTAL',name:'State='+state,itemSpacing:12,paddingLeft:20,paddingRight:20,paddingTop:16,paddingBottom:16,primaryAxisAlignItems:'CENTER',counterAxisAlignItems:'CENTER',cornerRadius:12});
  component.description='Local figma-use contract test button';
  const paint=figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',semantic);
  component.fills=[paint];component.setBoundVariable('itemSpacing',gap);
  const label=figma.createText();component.appendChild(label);label.fontName={family:'Inter',style:'Regular'};label.characters='Contract button';label.fontSize=16;label.fills=[{type:'SOLID',color:{r:1,g:1,b:1}}];
  const labelProperty=component.addComponentProperty('Label','TEXT','Contract button');
  label.componentPropertyReferences={characters:labelProperty};
  variants.push(component)
 }
 set=figma.combineAsVariants(variants,page);set.name='DSH Contract Button';set.set({x:80,y:80,layoutMode:'VERTICAL',itemSpacing:16,paddingTop:24,paddingBottom:24,paddingLeft:24,paddingRight:24,primaryAxisSizingMode:'AUTO',counterAxisSizingMode:'AUTO'});
}
let preview=page.query('FRAME[name="Contract preview"]').first();
if(!preview){preview=figma.createAutoLayout('VERTICAL',{name:'Contract preview',x:450,y:80,paddingTop:24,paddingBottom:24,paddingLeft:24,paddingRight:24,itemSpacing:16});page.appendChild(preview)}
preview.placeholder=true;
let instance=preview.query('INSTANCE').first();
if(!instance){instance=set.children[0].createInstance();preview.appendChild(instance)}
const labelKey=Object.keys(instance.componentProperties).find(key=>key.startsWith('Label#'));
instance.setProperties({[labelKey]:'Ready for DSH'});
await instance.getMainComponentAsync();
instance.setExplicitVariableModeForCollection(collection,collection.modes.find(m=>m.name==='Dark').modeId);
preview.placeholder=false;
const aliases=semantic.valuesByMode;
const result={pageId:page.id,collectionId:collection.id,modeCount:collection.modes.length,variableIds:[primitive.id,semantic.id,gap.id],componentSetId:set.id,componentIds:set.children.map(n=>n.id),previewId:preview.id,instanceId:instance.id,mainComponent:(await instance.getMainComponentAsync()).id,variantCount:page.query('COMPONENT_SET > COMPONENT[name^="State="]').length,instanceQueryCount:preview.query('INSTANCE[mainComponent.name="State=Default"]').length,label:instance.query('TEXT').values(['characters']),aliasTypes:Object.values(aliases).map(v=>v.type),bindings:set.children[0].boundVariables,tree:preview.tree({maxDepth:2,maxChildren:3})};
figma.io.write('contract-result.json',JSON.stringify(result,null,2));
await preview.screenshot();
return result;
