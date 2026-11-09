/* MIT — read-only scripts are interpreted, never passed to Function/eval. */
;(function(scope){
 const denied=new Set(['constructor','prototype','__proto__','caller','callee','arguments','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__'])
 const nativeReads=new Set(['getNodeByIdAsync','getLocalPaintStylesAsync','getLocalTextStylesAsync','getLocalEffectStylesAsync','getLocalGridStylesAsync','listAvailableFontsAsync','getLocalVariablesAsync','getLocalVariableCollectionsAsync','getVariableByIdAsync','getVariableCollectionByIdAsync','getCSSAsync','getMainComponentAsync','getPluginData','getPluginDataKeys','getSharedPluginData','getSharedPluginDataKeys','getRangeFontName','getRangeFontSize','getStyledTextSegments','getAvailableLibraryVariableCollectionsAsync'])
 function readonlyFacade(figma){
  const cache=new WeakMap()
  const wrap=value=>{
   if(!value||typeof value!=='object')return value
   if(Array.isArray(value))return value.map(wrap)
   if(cache.has(value))return cache.get(value)
   const proxy=new Proxy({}, {get(_,key){
    if(denied.has(key))throw Error('Restricted property in readOnly script')
    const v=value[key]
    if(typeof v==='function'){
     if(!nativeReads.has(key))throw Error('Native method '+String(key)+' is unavailable in readOnly mode')
     return async(...args)=>wrap(await v.apply(value,args))
    }
    return wrap(v)
   },has(_,key){return !denied.has(key)&&key in value},ownKeys(){return Object.keys(value).filter(k=>!denied.has(k)&&typeof value[k]!=='function')},getOwnPropertyDescriptor(){return {configurable:true,enumerable:true}},set(){throw Error('Canvas writes are forbidden in readOnly mode')},defineProperty(){throw Error('Canvas writes are forbidden in readOnly mode')},deleteProperty(){throw Error('Canvas writes are forbidden in readOnly mode')}})
   cache.set(value,proxy);return proxy
  }
  return wrap(figma)
 }
 async function execute(figma,program){
  if(program?.type!=='Program')throw Error('Missing validated read-only program; update both host and companion')
  const funcs=new WeakSet(),maxSteps=100000;let steps=0
  const globals=Object.assign(Object.create(null),{figma:readonlyFacade(figma),undefined,NaN,Infinity,Math:Object.fromEntries(Object.getOwnPropertyNames(Math).filter(k=>!denied.has(k)).map(k=>[k,Math[k]])),JSON:{parse:JSON.parse,stringify:JSON.stringify},Object:{keys:Object.keys,values:Object.values,entries:Object.entries,fromEntries:Object.fromEntries},Array:{isArray:Array.isArray},Number:{isFinite:Number.isFinite,isInteger:Number.isInteger},String:v=>String(v),Boolean:v=>Boolean(v),Error:message=>Error(message)})
  const env=(parent)=>({values:Object.create(null),parent}),root=env(null);Object.assign(root.values,globals)
  const find=(e,key)=>Object.hasOwn(e.values,key)?e:e.parent?find(e.parent,key):null
  const read=(e,key)=>{const owner=find(e,key);if(!owner)throw Error('Unknown identifier in readOnly script: '+key);return owner.values[key]}
  const write=(e,key,value)=>{const owner=find(e,key);if(!owner||owner===root)throw Error('Cannot assign a global in readOnly script');owner.values[key]=value;return value}
  const keyOf=async(n,e)=>n.computed?await value(n.property,e):n.property.name
  const get=(object,key)=>{if(denied.has(String(key))||typeof key!=='string'&&typeof key!=='number')throw Error('Restricted property in readOnly script');if(funcs.has(object))throw Error('Functions are opaque in readOnly scripts');if(object==null)throw Error('Cannot read '+String(key)+' of '+object);return object[key]}
  async function invoke(fn,args){
   if(funcs.has(fn)){const e=env(fn.env);fn.node.params.forEach((p,i)=>e.values[p.name]=args[i]);if(fn.node.body.type==='BlockStatement'){const r=await block(fn.node.body.body,e);return r?.kind==='return'?r.value:undefined}return value(fn.node.body,e)}
   if(typeof fn!=='function')throw Error('Value is not callable in readOnly script')
   return fn(...args)
  }
  async function value(n,e){
   if(++steps>maxSteps)throw Error('readOnly script exceeded 100000 interpreter steps')
   if(!n)return undefined
   switch(n.type){
    case 'Literal':return n.value
    case 'Identifier':return read(e,n.name)
    case 'ChainExpression':case 'AwaitExpression':return value(n.expression??n.argument,e)
    case 'MemberExpression':{const object=await value(n.object,e);return n.optional&&object==null?undefined:get(object,await keyOf(n,e))}
    case 'ArrayExpression':{const a=[];for(const item of n.elements)a.push(await value(item,e));return a}
    case 'ObjectExpression':{const o=Object.create(null);for(const p of n.properties){const k=p.computed?await value(p.key,e):p.key.name??p.key.value;if(denied.has(String(k)))throw Error('Restricted object key');o[k]=await value(p.value,e)}return o}
    case 'ArrowFunctionExpression':case 'FunctionExpression':{const f={node:n,env:e};funcs.add(f);return f}
    case 'ConditionalExpression':return await value(n.test,e)?value(n.consequent,e):value(n.alternate,e)
    case 'LogicalExpression':{const a=await value(n.left,e);return n.operator==='&&'?(a?value(n.right,e):a):n.operator==='||'?(a?a:value(n.right,e)):(a??await value(n.right,e))}
    case 'UnaryExpression':{const a=await value(n.argument,e);if(n.operator==='!')return !a;if(n.operator==='-')return -a;if(n.operator==='+')return +a;if(n.operator==='typeof')return typeof a;if(n.operator==='void')return undefined;throw Error('Unsupported unary operator')}
    case 'BinaryExpression':{const a=await value(n.left,e),b=await value(n.right,e);switch(n.operator){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '**':return a**b;case '===':return a===b;case '!==':return a!==b;case '==':return a==b;case '!=':return a!=b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;case 'in':return a in b;default:throw Error('Unsupported binary operator')}}
    case 'AssignmentExpression':return write(e,n.left.name,await value(n.right,e))
    case 'UpdateExpression':{const old=read(e,n.argument.name),next=n.operator==='++'?old+1:old-1;write(e,n.argument.name,next);return n.prefix?next:old}
    case 'TemplateLiteral':{let out=n.quasis[0].value.cooked;for(let i=0;i<n.expressions.length;i++)out+=String(await value(n.expressions[i],e))+n.quasis[i+1].value.cooked;return out}
    case 'NewExpression':return Error(await value(n.arguments[0],e))
    case 'CallExpression':{
     const args=[];for(const arg of n.arguments)args.push(await value(arg,e))
     if(n.callee.type==='MemberExpression'){
      const receiver=await value(n.callee.object,e),key=await keyOf(n.callee,e);if(n.callee.optional&&receiver==null)return undefined
      if(Array.isArray(receiver)&&['map','filter','find','some','every','forEach','reduce'].includes(key)){
       const output=[];let accumulator=args[1],start=0;if(key==='reduce'&&args.length<2){if(!receiver.length)throw Error('Reduce of empty array');accumulator=receiver[0];start=1}
       for(let i=start;i<receiver.length;i++){const r=await invoke(args[0],key==='reduce'?[accumulator,receiver[i],i]:[receiver[i],i]);if(key==='map')output.push(r);if(key==='filter'&&r)output.push(receiver[i]);if(key==='find'&&r)return receiver[i];if(key==='some'&&r)return true;if(key==='every'&&!r)return false;if(key==='reduce')accumulator=r}
       return key==='reduce'?accumulator:key==='some'?false:key==='every'?true:['find','forEach'].includes(key)?undefined:output
      }
      const method=get(receiver,key);if(typeof method!=='function')return invoke(method,args)
      return method.apply(receiver,args)
     }
     return invoke(await value(n.callee,e),args)
    }
    default:throw Error('Unsupported readOnly expression: '+n.type)
   }
  }
  async function statement(n,e){
   if(++steps>maxSteps)throw Error('readOnly script exceeded 100000 interpreter steps')
   switch(n.type){
    case 'EmptyStatement':return
    case 'BlockStatement':return block(n.body,env(e))
    case 'ExpressionStatement':await value(n.expression,e);return
    case 'VariableDeclaration':for(const d of n.declarations)e.values[d.id.name]=await value(d.init,e);return
    case 'FunctionDeclaration':{const f={node:n,env:e};funcs.add(f);e.values[n.id.name]=f;return}
    case 'ReturnStatement':return {kind:'return',value:await value(n.argument,e)}
    case 'ThrowStatement':throw await value(n.argument,e)
    case 'BreakStatement':return {kind:'break'}
    case 'ContinueStatement':return {kind:'continue'}
    case 'IfStatement':return await value(n.test,e)?statement(n.consequent,e):n.alternate?statement(n.alternate,e):undefined
    case 'ForOfStatement':{
     const items=await value(n.right,e);if(!Array.isArray(items)&&typeof items!=='string')throw Error('readOnly for-of requires an array or string')
     for(const item of items){const local=env(e);if(n.left.type==='VariableDeclaration')local.values[n.left.declarations[0].id.name]=item;else write(e,n.left.name,item);const r=await statement(n.body,local);if(r?.kind==='return')return r;if(r?.kind==='break')break}return
    }
    case 'ForStatement':case 'WhileStatement':{const local=env(e);if(n.init){if(n.init.type==='VariableDeclaration')await statement(n.init,local);else await value(n.init,local)}while(!n.test||await value(n.test,local)){const r=await statement(n.body,local);if(r?.kind==='return')return r;if(r?.kind==='break')break;if(n.update)await value(n.update,local)}return}
    default:throw Error('Unsupported readOnly statement: '+n.type)
   }
  }
  async function block(nodes,e){for(const n of nodes){const r=await statement(n,e);if(r)return r}}
  return (await block(program.body,env(root)))?.value
 }
 scope.DshFigmaReadonly={execute}
})(globalThis)
