#!/usr/bin/env node
/** Offline, read-only DSH v4 session measurement. No model calls or credential reads. */
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as zlib from 'node:zlib'

const MAX_BYTES = 512 * 1024 * 1024
const usageKeys = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'totalTokens']
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0

// Node may emit bytes for an incomplete final frame. Check the Zstandard frame
// boundary before decoding so a truncated durable log never looks complete.
function frameEnd(bytes, start) {
  let at = start
  const requireBytes = count => {
    if (at + count > bytes.length) throw new Error(`Cannot decode a complete Zstandard frame at byte ${start}; wait for the session to finish and retry`)
  }
  requireBytes(5)
  if (bytes.readUInt32LE(at) !== 0xfd2fb528) throw new Error(`Invalid Zstandard frame at byte ${start}`)
  at += 4
  const descriptor = bytes[at++]
  if (descriptor & 24) throw new Error(`Invalid Zstandard frame descriptor at byte ${start}`)
  const single = Boolean(descriptor & 32), sizeFlag = descriptor >>> 6, dictionaryFlag = descriptor & 3
  const headerBytes = (single ? 0 : 1) + (dictionaryFlag === 3 ? 4 : dictionaryFlag) + (sizeFlag === 0 ? Number(single) : 2 ** sizeFlag)
  requireBytes(headerBytes); at += headerBytes
  let last = false
  while (!last) {
    requireBytes(3)
    const block = bytes.readUIntLE(at, 3); at += 3
    last = Boolean(block & 1)
    const kind = (block >>> 1) & 3
    if (kind === 3) throw new Error(`Invalid Zstandard block at byte ${at - 3}`)
    const size = kind === 1 ? 1 : block >>> 3
    requireBytes(size); at += size
  }
  if (descriptor & 4) { requireBytes(4); at += 4 }
  return at
}

export function decodeSession(bytes, compressed = false) {
  if (bytes.length > MAX_BYTES) throw new Error('Session exceeds the 512 MiB analysis limit')
  let text
  if (!compressed) text = bytes.toString('utf8')
  else {
    if (typeof zlib.zstdDecompressSync !== 'function') throw new Error('Zstandard sessions require a Node runtime with zstdDecompressSync (for example the bundled DSH Node 24 runtime)')
    const chunks = []
    let offset = 0, decodedBytes = 0
    while (offset < bytes.length) {
      const end = frameEnd(bytes, offset)
      let decoded
      try { decoded = zlib.zstdDecompressSync(bytes.subarray(offset, end), { info: true, maxOutputLength: MAX_BYTES - decodedBytes }) }
      catch { throw new Error(`Cannot decode a complete Zstandard frame at byte ${offset}; wait for the session to finish and retry`) }
      const consumed = decoded.engine.bytesWritten
      if (!Number.isSafeInteger(consumed) || consumed !== end - offset) throw new Error('Zstandard decoder made no valid progress')
      offset += consumed
      decodedBytes += decoded.buffer.length
      if (decodedBytes > MAX_BYTES) throw new Error('Decoded session exceeds the 512 MiB analysis limit')
      chunks.push(decoded.buffer)
    }
    text = Buffer.concat(chunks).toString('utf8')
  }
  const lines = text.trim().split('\n')
  const records = lines.map((line, index) => {
    try { return JSON.parse(line) } catch { throw new Error(`Invalid JSON in session line ${index + 1}`) }
  })
  if (records[0]?.type !== 'session' || records[0]?.version !== 4) throw new Error('Expected a DSH session format v4 header')
  return records
}

function streamUsage(stream) {
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index--) {
    const record = stream[index]
    if (record?.type === 'chunk' && record.chunk?.type === 'usage') return record.chunk.usage
  }
}

function summarizeUsage(samples) {
  const complete = samples.length > 0 && samples.every(sample => sample && finite(sample.inputTokens) && finite(sample.outputTokens))
  const totals = Object.fromEntries(usageKeys.map(key => [key,
    samples.length > 0 && samples.every(sample => sample && finite(sample[key]))
      ? samples.reduce((sum, sample) => sum + sample[key], 0) : null,
  ]))
  return { complete, samples: samples.length, missingSamples: samples.filter(sample => !sample || !finite(sample.inputTokens) || !finite(sample.outputTokens)).length, ...totals }
}

/** Keep decision parameters, never node IDs, queries, scripts, paths or design content. */
function normalizeArguments(raw) {
  let args
  try { args = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return { parseable: false } }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { parseable: false }
  const result = {}
  for (const key of ['depth', 'offset', 'limit', 'maxNodes', 'maxBytes', 'scale']) if (finite(args[key])) result[key] = args[key]
  for (const key of ['includeScreenshot', 'compact', 'includeMetrics', 'collectionsOnly']) if (typeof args[key] === 'boolean') result[key] = args[key]
  for (const [key, allowed] of Object.entries({ profile: ['summary', 'full'], quality: ['overview', 'detail'], kind: ['all', 'components', 'variables', 'styles'] })) if (allowed.includes(args[key])) result[key] = args[key]
  for (const key of ['nodeId', 'nodeIds', 'pageId', 'ids', 'collectionIds', 'modeIds', 'query', 'family', 'style', 'code']) if (args[key] !== undefined) result[`has${key[0].toUpperCase()}${key.slice(1)}`] = true
  if (typeof args.code === 'string') result.scriptBytes = Buffer.byteLength(args.code)
  return result
}

function safeName(name) { return typeof name === 'string' && /^[A-Za-z0-9_./:-]{1,200}$/.test(name) ? name : 'unknown' }

export function analyzeSession(records, { afterSeq = -1, turn: selectedTurn, includePrompts = false } = {}) {
  const turns = new Map(), calls = new Map(), models = new Map()
  let activeTurn = null, currentModel = null
  const included = event => Number.isSafeInteger(event.seq) && event.seq > afterSeq && (selectedTurn === undefined || activeTurn === selectedTurn)
  const ensureTurn = number => {
    if (!turns.has(number)) turns.set(number, { turn: number, start: null, end: null, reason: null, steps: 0, samples: [], attempts: 0, committedResponses: 0, calls: [], prompts: [], modelSelections: new Map() })
    return turns.get(number)
  }
  for (const event of records.slice(1)) {
    if (event.type === 'turn/start') activeTurn = event.data?.turn
    if (event.type === 'request/header') {
      const config = event.data?.header?.config
      if (config?.provider && config?.model) currentModel = { provider: safeName(config.provider), model: safeName(config.model), ...(config.reasoningEffort ? { reasoningEffort: safeName(config.reasoningEffort) } : {}) }
    }
    if (!included(event) || !Number.isInteger(activeTurn)) continue
    const turn = ensureTurn(activeTurn), data = event.data ?? {}
    if (currentModel) { const key = JSON.stringify(currentModel); models.set(key, currentModel); turn.modelSelections.set(key, currentModel) }
    if (event.type === 'turn/start') turn.start = finite(event.time) ? event.time : null
    if (event.type === 'turn/end') { turn.end = finite(event.time) ? event.time : null; turn.reason = safeName(data.reason?.kind ?? data.reason) }
    if (event.type === 'step/start') turn.steps++
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      // Surface replacements are not additional provider requests.
      if (event.surfaceOp && event.surfaceOp !== 'append') continue
      turn.samples.push(data.usage ?? streamUsage(data.stream))
      if (event.type === 'assistant/attempt') turn.attempts++
      else turn.committedResponses++
    }
    if (event.type === 'tool/call') {
      const call = { sequence: event.seq, tool: safeName(data.name), arguments: normalizeArguments(data.arguments), status: 'pending', startedAt: event.time, wallMs: null }
      calls.set(data.callId, call); turn.calls.push(call)
    }
    if (event.type === 'tool/result' && (!event.surfaceOp || event.surfaceOp === 'append')) {
      const call = calls.get(data.message?.toolCallId)
      if (call) { call.status = data.message?.isError === true ? 'error' : 'completed'; call.wallMs = finite(event.time) && finite(call.startedAt) ? Math.max(0, event.time - call.startedAt) : null }
    }
    // Only explicit human text, never injected runtime/skill/system content.
    if (includePrompts && event.type === 'user/message' && data.role === 'user' && data.source?.kind === 'user') {
      const content = Array.isArray(data.content) ? data.content : []
      const prompt = content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (prompt) turn.prompts.push(prompt)
    }
  }
  const outputTurns = [...turns.values()].map(turn => ({
    turn: turn.turn, startedAt: turn.start === null ? null : new Date(turn.start).toISOString(), endedAt: turn.end === null ? null : new Date(turn.end).toISOString(),
    complete: turn.start !== null && turn.end !== null, outcome: turn.reason,
    wallMs: turn.start !== null && turn.end !== null ? Math.max(0, turn.end - turn.start) : null,
    steps: turn.steps, modelRequests: turn.samples.length, retriedAttempts: turn.attempts, committedResponses: turn.committedResponses,
    usage: summarizeUsage(turn.samples), models: [...turn.modelSelections.values()],
    toolCalls: turn.calls.length, toolErrors: turn.calls.filter(call => call.status === 'error').length,
    toolCounts: turn.calls.reduce((counts, call) => { counts[call.tool] = (counts[call.tool] ?? 0) + 1; return counts }, {}),
    calls: turn.calls.map(({ startedAt, ...call }) => call),
    ...(includePrompts ? { prompts: turn.prompts } : {}),
  }))
  const allSamples = [...turns.values()].flatMap(turn => turn.samples)
  return {
    schemaVersion: 1, source: 'DSH persisted session events; provider-reported usage, including recorded retry attempts',
    redaction: 'Node IDs, query text, paths, script bodies, tool results, assistant text and credentials are omitted. Prompts are excluded unless explicitly requested.',
    scope: { afterSeq, turn: selectedTurn ?? null, sessionFormatVersion: records[0].version, recordedEvents: records.length - 1 },
    models: [...models.values()],
    totals: {
      turns: outputTurns.length, completedTurns: outputTurns.filter(turn => turn.complete && turn.outcome === 'completed').length,
      activeWallMs: outputTurns.length > 0 && outputTurns.every(turn => turn.wallMs !== null) ? outputTurns.reduce((sum, turn) => sum + turn.wallMs, 0) : null,
      modelRequests: allSamples.length, steps: outputTurns.reduce((sum, turn) => sum + turn.steps, 0),
      toolCalls: outputTurns.reduce((sum, turn) => sum + turn.toolCalls, 0), toolErrors: outputTurns.reduce((sum, turn) => sum + turn.toolErrors, 0),
      usage: summarizeUsage(allSamples),
    },
    turns: outputTurns,
    limitations: ['Excludes session-title generation and other sessions, subagents or background jobs.', 'Usage buckets preserve DSH adapter semantics; missing usage stays null, never estimated from text bytes.', 'Wall time is the sum of turn/start to turn/end intervals, excluding time between user turns.', 'Read completed logs. A partial turn or missing provider usage is not a complete benchmark result.'],
  }
}

async function main(argv) {
  if (!argv.length || argv.includes('--help')) {
    console.log('Usage: node scripts/analyze-dsh-session.mjs SESSION.jsonl[.zstd] [--after-seq N] [--turn N] [--label TEXT] [--output NEW_FILE] [--include-prompts]\nRead-only offline analysis. --include-prompts is for synthetic benchmark prompts only; review before publishing.')
    return
  }
  const input = resolve(argv.shift()), options = {}
  let output, label
  while (argv.length) {
    const option = argv.shift()
    if (option === '--include-prompts') options.includePrompts = true
    else if (['--after-seq', '--turn'].includes(option)) {
      const value = Number(argv.shift())
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${option} requires a non-negative integer`)
      options[option === '--turn' ? 'turn' : 'afterSeq'] = value
    } else if (option === '--output' || option === '--label') {
      const value = argv.shift()
      if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
      if (option === '--output') output = resolve(value)
      else label = value
    } else throw new Error(`Unknown option: ${option}`)
  }
  if (output === input) throw new Error('Output must not overwrite the session')
  const bytes = await readFile(input)
  const report = { ...(label ? { label } : {}), ...analyzeSession(decodeSession(bytes, input.endsWith('.zstd')), options), artifact: { fileName: basename(input), sha256: createHash('sha256').update(bytes).digest('hex') } }
  const text = JSON.stringify(report, null, 2) + '\n'
  if (output) { await writeFile(output, text, { flag: 'wx', mode: 0o600 }); console.log(JSON.stringify({ output, totals: report.totals })) }
  else console.log(text)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
