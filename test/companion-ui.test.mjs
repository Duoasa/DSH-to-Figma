import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('metadata and results accept Figma outer-window and parent messages, rejecting foreign senders', async () => {
  const html = await readFile(new URL('../companion/ui.html', import.meta.url), 'utf8')
  const elements = new Map()
  const parent = { postMessage() {} }, top = {}
  const window = {}
  const context = vm.createContext({ window, parent, top, setInterval() {}, document: {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {})
      return elements.get(selector)
    },
  } })
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context)
  const message = { data: { pluginMessage: { type: 'document', name: 'Canvas', editorType: 'figma' } } }
  window.onmessage({ ...message, source: top, origin: 'https://evil.example' })
  assert.equal(elements.get('#document'), undefined)
  window.onmessage({ ...message, source: {}, origin: 'https://www.figma.com' })
  assert.equal(elements.get('#document'), undefined)
  window.onmessage({ ...message, source: top, origin: 'https://www.figma.com' })
  assert.equal(elements.get('#document').textContent, 'Canvas · figma')
  for (const sender of [
    { source: top, origin: 'https://www.figma.com' },
    { source: top, origin: 'https://figma.com' },
    { source: parent, origin: 'null' },
  ]) {
    let received
    context.resolveResult = value => { received = value }
    vm.runInContext("pending.set('job-1', resolveResult)", context)
    const result = { type: 'result', id: 'job-1', ok: true, result: { value: 'readback' } }
    window.onmessage({ source: {}, origin: 'https://www.figma.com', data: { pluginMessage: result } })
    window.onmessage({ source: top, origin: 'https://www.figma.com.evil.example', data: { pluginMessage: result } })
    assert.equal(received, undefined)
    window.onmessage({ ...sender, data: { pluginMessage: result } })
    assert.equal(received, result)
    assert.equal(vm.runInContext("pending.has('job-1')", context), false)
  }
})

test('companion endpoint uses localhost and matches the manifest development allowlist', async () => {
  const html = await readFile(new URL('../companion/ui.html', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../companion/manifest.json', import.meta.url), 'utf8'))
  const endpoint = html.match(/const base='([^']+)'/)[1]
  assert.equal(endpoint, 'http://localhost:3055')
  assert.deepEqual(manifest.networkAccess.devAllowedDomains, [endpoint])
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none'])
})
