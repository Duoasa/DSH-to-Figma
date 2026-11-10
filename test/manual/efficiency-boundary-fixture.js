// Disposable fixture for the existing DSH Upgrade Smoke file only.
if(figma.fileKey!=='Nv8MvrIMXU3tyApnbbEUef')throw Error('Use the designated smoke-test file');
const before=figma.currentPage.id;
const ref=figma.createFrame();
ref.name='DSH efficiency temporary reference';ref.resize(320,180);ref.x=18000;ref.y=18000;
ref.fills=[{type:'SOLID',color:{r:0.12,g:0.12,b:0.14}}];
const bar=figma.createRectangle();bar.resize(80,180);bar.fills=[{type:'SOLID',color:{r:0.2,g:0.4,b:0.8}}];ref.appendChild(bar);bar.x=0;bar.y=0;
const card=figma.createRectangle();card.resize(170,100);card.fills=[{type:'SOLID',color:{r:0.8,g:0.8,b:0.8}}];ref.appendChild(card);card.x=110;card.y=40;
const actual=ref.clone();actual.name='DSH efficiency temporary shadow';actual.x=18400;
actual.effects=[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:0.35},offset:{x:0,y:8},radius:24,spread:0,visible:true,blendMode:'NORMAL'}];
return {before,after:figma.currentPage.id,referenceId:ref.id,actualId:actual.id,actualBarId:actual.children[0].id,createdNodeIds:[ref.id,...ref.children.map(n=>n.id),actual.id,...actual.children.map(n=>n.id)],subject:actual.absoluteBoundingBox,render:actual.absoluteRenderBounds};
