import assert from 'node:assert/strict'
import test from 'node:test'
import * as zlib from 'node:zlib'
import { decodeSession, analyzeSession } from '../scripts/analyze-dsh-session.mjs'

const header = { type: 'session', version: 4, id: 'private-session', cwd: '/private/workspace' }
const event = (type, seq, data, time = seq * 10) => ({ type, seq, data, time })
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 40, totalTokens: 55 }

test('session analysis reads every concatenated zstd frame and rejects a torn suffix', { skip: typeof zlib.zstdCompressSync !== 'function' }, () => {
  const rows = [header, event('turn/start', 1, { turn: 1 }), event('turn/end', 2, { turn: 1, reason: { kind: 'completed' } })]
  const bytes = Buffer.concat(rows.map(row => zlib.zstdCompressSync(Buffer.from(JSON.stringify(row) + '\n'))))
  assert.deepEqual(decodeSession(bytes, true), rows)
  assert.throws(() => decodeSession(bytes.subarray(0, bytes.length - 2), true), /complete Zstandard frame/)
  assert.throws(() => decodeSession(Buffer.from('{sensitive invalid content}')), /Invalid JSON in session line 1/)
})

test('session analysis counts retry usage and tools while excluding content and identifiers', () => {
  const rows = [header,
    event('turn/start', 1, { turn: 1 }),
    event('user/message', 2, { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic task' }] }),
    event('user/message', 3, { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'private runtime context' }] }),
    event('request/header', 4, { header: { config: { provider: 'deepseek', model: 'test-model', reasoningEffort: 'high', apiKey: 'private-key' } } }),
    event('step/start', 5, { turn: 1, step: 1 }),
    event('assistant/attempt', 6, { turn: 1, step: 1, stream: [{ type: 'chunk', chunk: { type: 'usage', usage } }] }),
    event('assistant/message', 7, { turn: 1, step: 1, usage, message: { content: [{ type: 'text', text: 'private assistant answer' }] } }),
    event('tool/call', 8, { turn: 1, step: 1, callId: 'private-call', name: 'mcp__figma__get_metadata', arguments: JSON.stringify({ nodeId: 'private-node', profile: 'summary', depth: 1, query: 'private-query', code: 'private script' }) }),
    event('tool/result', 9, { message: { toolCallId: 'private-call', content: [{ type: 'text', text: 'private design content' }] } }),
    event('turn/end', 10, { turn: 1, reason: { kind: 'completed' } }),
  ]
  const report = analyzeSession(rows)
  assert.equal(report.totals.completedTurns, 1)
  assert.equal(report.totals.activeWallMs, 90)
  assert.equal(report.totals.modelRequests, 2)
  assert.equal(report.totals.usage.totalTokens, 110)
  assert.equal(report.totals.usage.cacheReadTokens, 80)
  assert.equal(report.turns[0].retriedAttempts, 1)
  assert.deepEqual(report.turns[0].calls[0].arguments, { depth: 1, profile: 'summary', hasNodeId: true, hasQuery: true, hasCode: true, scriptBytes: 14 })
  assert.equal(report.turns[0].calls[0].status, 'completed')
  assert.equal(report.turns[0].calls[0].wallMs, 10)
  assert.doesNotMatch(JSON.stringify(report), /private-|private |Synthetic task/)
  assert.deepEqual(analyzeSession(rows, { includePrompts: true }).turns[0].prompts, ['Synthetic task'])
})

test('session analysis does not present incomplete usage or a mid-turn cut as complete', () => {
  const rows = [header,
    event('turn/start', 1, { turn: 1 }),
    event('assistant/attempt', 2, { stream: [] }),
    event('assistant/message', 3, { usage }),
    event('turn/end', 4, { turn: 1, reason: { kind: 'completed' } }),
    event('turn/start', 5, { turn: 2 }),
    event('assistant/message', 6, { usage }),
  ]
  const report = analyzeSession(rows, { turn: 1 })
  assert.equal(report.totals.usage.complete, false)
  assert.equal(report.totals.usage.missingSamples, 1)
  assert.equal(report.totals.usage.totalTokens, null)
  const partial = analyzeSession(rows, { afterSeq: 2, turn: 1 })
  assert.equal(partial.turns[0].complete, false)
  assert.equal(partial.totals.activeWallMs, null)
  assert.equal(analyzeSession(rows, { turn: 2 }).turns[0].complete, false)
})
