// Dedicated acceptance page only. Reuses its own objects on subsequent runs.
const pages=figma.root.children.filter(p=>p.name==='DSH Acceptance 20261104');
if(pages.length!==1)throw Error('Run static acceptance first; expected one test page');
const page=pages[0];await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({family:'Inter',style:'Regular'});
const createdNodeIds=[],mutatedNodeIds=[];
function named(parent,name,type,create){
 const matches=parent.query(type+'[name="'+name+'"]').toArray();
 if(matches.length>1)throw Error('Ambiguous test object: '+name);
 if(matches.length)return matches[0];
 const n=create();n.name=name;parent.appendChild(n);createdNodeIds.push(n.id);return n;
}
const board=named(page,'DSH Motion','FRAME',()=>figma.createFrame());
board.set({x:80,y:400,width:720,height:400,cornerRadius:24});board.fills=[{type:'SOLID',color:{r:0.06,g:0.08,b:0.12}}];
const heading=named(board,'Motion heading','TEXT',()=>figma.createText());
heading.fontName={family:'Inter',style:'Regular'};heading.characters='DSH to Figma';heading.fontSize=32;heading.fills=[{type:'SOLID',color:{r:0.95,g:0.96,b:1}}];heading.x=40;heading.y=32;
const square=named(board,'Motion square','RECTANGLE',()=>figma.createRectangle());
square.set({x:40,y:128,width:64,height:64,cornerRadius:16});square.fills=[{type:'SOLID',color:{r:0.3,g:0.5,b:1}}];square.effects=[{type:'LAYER_BLUR',radius:0,visible:true}];
const numberTrack=(a,b)=>({keyframes:[{timelinePosition:0,value:{type:'FLOAT',value:a}},{timelinePosition:1.2,value:{type:'FLOAT',value:b},easing:{type:'EASE_IN_AND_OUT'}}]});
square.applyManualKeyframeTrack({type:'PROPERTY',name:'TRANSLATION_X'},numberTrack(0,500));
square.applyManualKeyframeTrack({type:'PROPERTY',name:'ROTATION'},numberTrack(0,-180));
square.applyManualKeyframeTrack({type:'INDEXED_ITEM',collection:'fills',index:0},{keyframes:[{timelinePosition:0,value:{type:'COLOR',value:{r:0.3,g:0.5,b:1,a:1}}},{timelinePosition:1.2,value:{type:'COLOR',value:{r:0.7,g:0.3,b:1,a:1}},easing:{type:'LINEAR'}}]});
square.applyManualKeyframeTrack({type:'INDEXED_ITEM',collection:'effects',index:0,field:'RADIUS'},numberTrack(0,6));
const caption=named(board,'Animated caption','TEXT',()=>figma.createText());
caption.fontName={family:'Inter',style:'Regular'};caption.characters='Editable text. Native motion.';caption.fontSize=26;caption.fills=[{type:'SOLID',color:{r:0.75,g:0.8,b:0.9}}];caption.x=40;caption.y=250;
const defs=figma.motion.figmaAnimationStyles(),textDef=defs.find(d=>d.styleId==='TextStagger'),fadeDef=defs.find(d=>d.styleId==='Opacity');
if(!textDef||!fadeDef)throw Error('Required native definitions unavailable');
const existingText=caption.animationStyles;
let textBinding=existingText[0]?.id;
const config={duration:1.2,timelineOffset:0,props:{animationDirection:'in',textDelayGrouping:'CHARACTER',textDelayOrder:'LEFT_RIGHT',presetStaggerOverlap:0,delay:0,easing:{type:'LINEAR'},opacityEnabled:true,opacityVisible:true,opacityAmount:0,positionEnabled:false,rotationEnabled:false,scaleEnabled:false,blurEnabled:false}};
if(!textBinding)textBinding=caption.applyAnimationStyle(textDef.styleId,config);
// Existing test application is retained on repeat; edits are tested separately.
const styles=(await figma.getLocalCustomAnimationStylesAsync()).filter(s=>s.name==='DSH/Gentle entrance');
if(styles.length>1)throw Error('Ambiguous test animation style');
const custom=styles[0]||figma.createCustomAnimationStyle();custom.name='DSH/Gentle entrance';
if(!custom.animationEntries.length)await custom.addAnimationEntryAsync(fadeDef.styleId,{duration:0.4,easing:{type:'EASE_OUT'}});
let customBinding=heading.animationStyles.find(s=>s.type==='CUSTOM'&&s.styleId===custom.id)?.id;
if(!customBinding)customBinding=heading.applyAnimationStyle(custom.id,{type:'CUSTOM',timelineOffset:0});
const timeline=square.timelines[0];if(timeline&&timeline.duration<1.5)square.setTimelineDuration(timeline.id,1.5);
mutatedNodeIds.push(board.id,heading.id,square.id,caption.id);
figma.currentPage.selection=[board];figma.viewport.scrollAndZoomIntoView([board]);
return {pageId:page.id,createdNodeIds,mutatedNodeIds,boardId:board.id,squareId:square.id,headingId:heading.id,captionId:caption.id,textBinding,customBinding,customStyleId:custom.id,customEntries:custom.animationEntries,captionStyles:caption.animationStyles,tracks:square.manualKeyframeTracks,timelines:square.timelines};
