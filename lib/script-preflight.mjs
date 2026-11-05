import { parse } from 'acorn'

const prefix = '"use strict"; (async () => {\n'
const property = node => node?.computed ? node.property.type === 'Literal' ? node.property.value : null : node?.property?.name
const children = node => Object.values(node).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => value && typeof value.type === 'string')

export class ScriptPreflightError extends Error {
  constructor(diagnostic) {
    super(`${diagnostic.code}${diagnostic.line ? ` at line ${diagnostic.line}, column ${diagnostic.column}` : ''}: ${diagnostic.message} ${diagnostic.hint}`)
    this.diagnostic = diagnostic
  }
}

// Parse only: submitted code is never evaluated in the DSH host.
export function preflightScript(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > 150000) {
    throw new ScriptPreflightError({code:'INVALID_SCRIPT',message:'Provide a script of 1–150000 characters.',hint:'Send JavaScript with top-level await/return; no Markdown fences.'})
  }
  if (code.trimStart().startsWith('```')) throw new ScriptPreflightError({code:'INVALID_SCRIPT',message:'Markdown code fences are not executable script input.',hint:'Remove the opening and closing fences and send only JavaScript. No script ran.'})
  const lines = code.split(/\r\n|[\n\r\u2028\u2029]/)
  const diagnostic = (name, loc, message, hint) => ({code:name,line:Math.max(1,Math.min(lines.length,loc.line-1)),column:loc.line-1>lines.length?lines.at(-1).length+1:loc.column+1,message,hint})
  let ast
  try { ast = parse(prefix + code + '\n})()', {ecmaVersion:'latest',locations:true}) }
  catch (error) {
    if (!error.loc) throw error
    throw new ScriptPreflightError(diagnostic('SCRIPT_SYNTAX',error.loc,error.message.replace(/ \(\d+:\d+\)$/,''),'Fix the indicated JavaScript syntax and retry. No script ran; do not inspect or recreate canvas objects for this error.'))
  }

  // Conservative provenance: only reject known Figma receivers. Ordinary JSON fields,
  // strings/selectors, shadowed names and unproven helper results remain valid.
  const scopes = new WeakMap(), accesses = [], patterns = [], writes = [], varNames = new Set()
  const root = {parent:null,bindings:new Map([['figma',{kind:'figma'}]])}
  const lookup = (scope, name) => scope ? scope.bindings.get(name) ?? lookup(scope.parent,name) : null
  function bind(pattern, scope, init = null, infer = false) {
    if (pattern.type === 'Identifier') {
      const entry = {init,scope,infer,dirty:false}
      scope.bindings.set(pattern.name,entry)
    } else if (pattern.type === 'RestElement') bind(pattern.argument,scope)
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left,scope)
    else for (const part of pattern.properties ?? pattern.elements ?? []) if (part) bind(part.value ?? part.argument ?? part,scope)
  }
  function visit(node, parentScope) {
    let scope = parentScope
    if (['BlockStatement','ForStatement','ForOfStatement','ForInStatement','CatchClause'].includes(node.type) || /Function/.test(node.type)) scope = {parent:parentScope,bindings:new Map()}
    scopes.set(node,scope)
    if (/Function/.test(node.type)) {
      if (node.id) bind(node.id,node.type === 'FunctionDeclaration' ? parentScope : scope)
      for (const param of node.params) bind(param,scope)
    }
    if (node.type === 'CatchClause' && node.param) bind(node.param,scope)
    if (node.type === 'ClassDeclaration' && node.id) bind(node.id,scope)
    if (node.type === 'VariableDeclaration') for (const decl of node.declarations) {
      // Do not infer names with function-scoped var declarations (including hoisting).
      if (node.kind === 'var') {
        const collect = part => { if(part.type==='Identifier')varNames.add(part.name);else for(const child of children(part))collect(child) }
        collect(decl.id)
      }
      bind(decl.id,scope,decl.init,node.kind !== 'var')
      if (decl.id.type === 'ObjectPattern') patterns.push({pattern:decl.id,init:decl.init,scope})
    }
    if (node.type === 'AssignmentExpression') writes.push({target:node.left,scope})
    if (node.type === 'UpdateExpression') writes.push({target:node.argument,scope})
    if (['ForOfStatement','ForInStatement'].includes(node.type) && node.left.type !== 'VariableDeclaration') writes.push({target:node.left,scope})
    if (node.type === 'MemberExpression' && property(node) === 'mainComponent') accesses.push(node)
    for (const child of children(node)) visit(child,scope)
  }
  visit(ast,root)
  function dirty(target,scope) {
    if (target.type === 'Identifier') { const entry=lookup(scope,target.name);if(entry)entry.dirty=true }
    else if (target.type !== 'MemberExpression') for (const child of children(target)) dirty(child,scope)
  }
  for (const write of writes) dirty(write.target,write.scope)
  const nodeFactories = new Set(['getNodeByIdAsync','createRectangle','createText','createEllipse','createLine','createVector','createPolygon','createStar','createSection','createNodeFromSvg','createComponent','createComponentFromNode','createFrame','createPage','createAutoLayout','combineAsVariants','importComponentByKeyAsync','importComponentSetByKeyAsync'])
  function kind(node, scope, seen = new Set()) {
    if (!node) return null
    if (node.type === 'Identifier') {
      if (varNames.has(node.name)) return null
      const entry=lookup(scope,node.name)
      if (!entry || entry.dirty || seen.has(entry)) return null
      if (entry.kind) return entry.kind
      if (!entry.infer) return null
      return kind(entry.init,entry.scope,new Set([...seen,entry]))
    }
    if (['AwaitExpression','ChainExpression'].includes(node.type)) return kind(node.argument ?? node.expression,scope,seen)
    if (node.type === 'MemberExpression') {
      const owner=kind(node.object,scope,seen), key=property(node)
      if (owner === 'figma' && ['root','currentPage'].includes(key)) return 'node'
      if (owner === 'node' && ['children','selection'].includes(key)) return 'nodes'
      if (owner === 'node' && key === 'parent') return 'node'
      if (['nodes','query'].includes(owner) && node.computed && typeof key === 'number') return 'node'
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const owner=kind(node.callee.object,scope,seen), key=property(node.callee)
      if (owner === 'figma' && nodeFactories.has(key)) return 'node'
      if (owner === 'node' && ['createInstance','clone','getMainComponentAsync','findOne'].includes(key)) return 'node'
      if (owner === 'node' && ['findAll','findAllWithCriteria'].includes(key)) return 'nodes'
      if (owner === 'node' && key === 'query') return 'query'
      if (owner === 'query' && ['first','last'].includes(key) || ['nodes','query'].includes(owner) && key === 'at') return 'node'
      if (owner === 'query' && key === 'toArray') return 'nodes'
    }
    return null
  }
  const fail = node => { throw new ScriptPreflightError(diagnostic('FIGMA_ASYNC_MAIN_COMPONENT',node.loc.start,'Synchronous mainComponent access is not supported in dynamic-page scripts.','Use const main = await instance.getMainComponentAsync(); then return main?.id or main?.name. No script ran; fix this access and retry.')) }
  for (const {target,scope} of writes) if (target.type === 'MemberExpression' && kind(target.object,scope) === 'node' && ['animationStyles','manualKeyframeTracks','timelines','animations'].includes(property(target))) {
    throw new ScriptPreflightError(diagnostic('FIGMA_READONLY_MOTION_COLLECTION',target.loc.start,'Native motion collections are read-only in the local editor.', 'Use applyManualKeyframeTrack/removeManualKeyframeTrack, setTimelineDuration, or dsh.updateAnimationStyle(node, applicationId, discoveredDefinitionId, configuration). Read the motion guide; replacement returns a new application ID. No script ran.'))
  }
  for (const node of accesses) if (kind(node.object,scopes.get(node)) === 'node') fail(node)
  for (const {pattern,init,scope} of patterns) if (kind(init,scope) === 'node') {
    for (const prop of pattern.properties) if (prop.type === 'Property' && (prop.computed ? prop.key.value : prop.key.name ?? prop.key.value) === 'mainComponent') fail(prop)
  }
}
