import {parse} from 'acorn'
import {ScriptPreflightError} from './script-preflight.mjs'
const allowed=new Set(['Program','BlockStatement','ExpressionStatement','VariableDeclaration','VariableDeclarator','Identifier','Literal','ReturnStatement','AwaitExpression','MemberExpression','CallExpression','ChainExpression','ArrayExpression','ObjectExpression','Property','ArrowFunctionExpression','FunctionExpression','FunctionDeclaration','IfStatement','ConditionalExpression','BinaryExpression','LogicalExpression','UnaryExpression','AssignmentExpression','UpdateExpression','ForOfStatement','ForStatement','WhileStatement','BreakStatement','ContinueStatement','ThrowStatement','NewExpression','TemplateLiteral','TemplateElement','EmptyStatement'])
export function readOnlyProgram(code){
 const ast=parse(code,{ecmaVersion:'latest',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true,locations:true})
 function visit(node){
  if(!allowed.has(node.type)||node.type==='Literal'&&(node.regex||node.bigint)||node.type==='Property'&&(node.kind!=='init'||node.method)||node.type==='NewExpression'&&(node.callee.type!=='Identifier'||node.callee.name!=='Error')||node.type==='VariableDeclarator'&&node.id.type!=='Identifier'||/Function/.test(node.type)&&node.params.some(p=>p.type!=='Identifier')||node.type==='AssignmentExpression'&&(node.left.type!=='Identifier'||node.operator!=='=')||node.type==='UpdateExpression'&&node.argument.type!=='Identifier')throw new ScriptPreflightError({code:'READ_ONLY_SCRIPT_SUBSET',line:node.loc.start.line,column:node.loc.start.column+1,message:'This syntax is not available in readOnly scripts.',hint:'Use simple local variables, native reads, arrays/map/filter and bounded loops; canvas writes require a normal call.'})
  const clean={}
  if(node.type==='TemplateElement')clean.value={cooked:node.value.cooked}
  for(const [key,value] of Object.entries(node)){
   if(['start','end','loc','raw','regex','bigint'].includes(key))continue
   if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.type==='string')clean[key]=visit(value)
   else if(Array.isArray(value))clean[key]=value.map(x=>x?.type?visit(x):x)
   else if(value===null||['string','number','boolean'].includes(typeof value))clean[key]=value
  }
  return clean
 }
 return visit(ast)
}
