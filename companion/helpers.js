/* MIT — Copyright (c) 2026 Duoasa. Public figma-use helper contract, local implementation. */
;(function (scope) {
  const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
  function propertyValues(object, path, mainComponent) {
    const parts = path.split('.')
    if (parts.some(part => !part || forbidden.has(part))) throw new Error('Invalid property path: ' + path)
    let values = [object]
    for (const part of parts) values = values.flatMap(value => {
      if (value == null || typeof value === 'symbol') return []
      if (part === '*') return Array.isArray(value) ? value : []
      if (part === 'mainComponent' && value.type === 'INSTANCE') return [mainComponent(value)]
      try { return [value[part]] } catch { return [] } // A type-specific getter is not available on every node.
    })
    return values
  }
  function compileSelector(source, mainComponent, depth = 0) {
    if (typeof source !== 'string' || !source.trim() || source.length > 8000 || depth > 20) throw new Error('Invalid or excessively nested query selector')
    let position = 0
    const fail = () => { throw new Error('Unsupported or malformed query selector near: ' + source.slice(position, position + 60)) }
    const space = () => { const start = position; while (/\s/.test(source[position] || '') && position < source.length) position++; return position > start }
    function enclosed(open, close) {
      if (source[position++] !== open) fail()
      const start = position
      let level = 1, quote = null, escaped = false
      for (; position < source.length; position++) {
        const c = source[position]
        if (escaped) { escaped = false; continue }
        if (c === '\\') { escaped = true; continue }
        if (quote) { if (c === quote) quote = null; continue }
        if (c === '"' || c === "'") { quote = c; continue }
        if (c === open) level++
        if (c === close && --level === 0) return source.slice(start, position++)
      }
      fail()
    }
    function compound() {
      const tests = []
      const rest = source.slice(position)
      const id = /^(?:#([\w-]+(?::\d+)?(?:;[\w-]+(?::\d+)?)*)|((?:I?\d+:\d+(?:;\d+:\d+)*)|(?:[0-9a-f]{8}-[0-9a-f-]{27,})))\b/i.exec(rest)
      if (id) { position += id[0].length; tests.push(node => node.id === (id[1] || id[2])) }
      else {
        const type = /^(\*|[a-z_][\w-]*)/i.exec(rest)
        if (type) { position += type[0].length; if (type[1] !== '*') tests.push(node => node.type === type[1].toUpperCase()); else tests.push(() => true) }
      }
      while (position < source.length) {
        if (source[position] === '[') {
          const attribute = enclosed('[', ']').trim()
          const match = /^(\w+(?:\.(?:\w+|\*))*)\s*(?:(\*=|\^=|\$=|=)\s*(.+))?$/.exec(attribute)
          if (!match || match[1].split('.').some(part => forbidden.has(part))) fail()
          const [, path, operator, input] = match
          let expected = input?.trim()
          if (expected?.startsWith('"') || expected?.startsWith("'")) {
            const quote = expected[0]
            if (expected.at(-1) !== quote || expected.length < 2) fail()
            expected = expected.slice(1, -1).replace(/\\(.)/g, '$1')
          } else if (expected === 'true' || expected === 'false') expected = expected === 'true'
          else if (expected && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(expected)) expected = Number(expected)
          tests.push(node => propertyValues(node, path, mainComponent).some(actual => {
            if (!operator) return actual !== undefined && actual !== null
            if (path === 'mainComponent' && actual && typeof actual === 'object') actual = actual.id
            if (operator === '=') return actual === expected
            if (typeof actual !== 'string' || typeof expected !== 'string') return false
            return operator === '*=' ? actual.includes(expected) : operator === '^=' ? actual.startsWith(expected) : actual.endsWith(expected)
          }))
        } else if (source[position] === ':') {
          position++
          const name = /^[a-z-]+/i.exec(source.slice(position))?.[0]?.toLowerCase()
          if (!name) fail()
          position += name.length
          if (['not', 'is', 'where'].includes(name)) {
            const match = compileSelector(enclosed('(', ')'), mainComponent, depth + 1)
            tests.push((node, boundary) => name === 'not' ? !match(node, boundary) : match(node, boundary))
          } else if (['first-child', 'last-child', 'nth-child'].includes(name)) {
            const number = name === 'nth-child' ? enclosed('(', ')').trim() : null
            if (number !== null && !/^[1-9]\d*$/.test(number)) fail()
            tests.push(node => {
              const siblings = node.parent?.children || [], index = siblings.indexOf(node)
              return index >= 0 && index === (name === 'first-child' ? 0 : name === 'last-child' ? siblings.length - 1 : Number(number) - 1)
            })
          } else fail()
        } else break
      }
      if (!tests.length) fail()
      return (node, boundary) => tests.every(test => test(node, boundary))
    }
    const groups = []
    while (position < source.length) {
      space()
      const parts = [compound()], links = []
      for (;;) {
        const separated = space(), c = source[position]
        if (!c || c === ',') break
        if ('>+~'.includes(c)) { links.push(c); position++; space() }
        else if (separated) links.push(' ')
        else fail()
        parts.push(compound())
      }
      function match(node, index, boundary) {
        if (!node || !parts[index](node, boundary)) return false
        if (index === 0) return true
        if (node === boundary) return false
        const relation = links[index - 1]
        if (relation === '>') return match(node.parent, index - 1, boundary)
        if (relation === ' ') {
          for (let parent = node.parent; parent; parent = parent.parent) {
            if (match(parent, index - 1, boundary)) return true
            if (parent === boundary) break
          }
          return false
        }
        const siblings = node.parent?.children || [], at = siblings.indexOf(node)
        if (relation === '+') return at > 0 && match(siblings[at - 1], index - 1, boundary)
        return siblings.slice(0, Math.max(0, at)).some(sibling => match(sibling, index - 1, boundary))
      }
      groups.push((node, boundary) => match(node, parts.length - 1, boundary))
      if (source[position] === ',') { position++; space(); if (position === source.length) fail() }
    }
    return (node, boundary) => groups.some(group => group(node, boundary))
  }
  scope.DshFigmaHelpers = { compileSelector, propertyValues }
})(globalThis)
