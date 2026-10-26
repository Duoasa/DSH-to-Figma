#!/usr/bin/env node
/** Collect one completed natural-language run; never sends a prompt or starts DSH. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { decodeSession, analyzeSession } from './analyze-dsh-session.mjs'

const argv = process.argv.slice(2), options = {}
if (!argv.length || argv.includes('--help')) {
  console.log('Usage: node scripts/collect-natural-benchmark.mjs --version 0.2.4 --task read|empty|edit --repeat RUN_NUMBER --session EXACT_LOG_PATH --out-dir REPORT_DIRECTORY [--turn N] [--private-answer NEW_FILE]\nCollects one already completed run. --repeat is its 1-based repetition number, not a request to run the model. Version is a caller-supplied label; verify the installed version separately. Private answer files contain design content and must not be published.')
} else {
  try {
    while (argv.length) {
      const key = argv.shift()
      if (!['--version', '--task', '--repeat', '--session', '--out-dir', '--turn', '--private-answer'].includes(key)) throw new Error(`Unknown option: ${key}`)
      const value = argv.shift()
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
      if (options[key] !== undefined) throw new Error(`Duplicate option: ${key}`)
      options[key] = value
    }
    for (const key of ['--version', '--task', '--repeat', '--session', '--out-dir']) if (!options[key]) throw new Error(`Missing ${key}`)
    const version = options['--version'], task = options['--task'], repeat = Number(options['--repeat'])
    if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Expected a semantic version label')
    if (!['read', 'empty', 'edit'].includes(task)) throw new Error('Expected task read, empty or edit')
    if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error('--repeat must be a positive run number')
    const turn = options['--turn'] === undefined ? undefined : Number(options['--turn'])
    if (turn !== undefined && (!Number.isSafeInteger(turn) || turn < 1)) throw new Error('--turn must be a positive turn number')
    const sessionPath = resolve(options['--session']), bytes = await readFile(sessionPath)
    const records = decodeSession(bytes, sessionPath.endsWith('.zstd'))
    const analysis = analyzeSession(records, { turn })
    if (analysis.totals.turns !== 1) throw new Error('Expected exactly one task turn; pass --turn to select one explicitly')
    if (analysis.totals.completedTurns !== 1 || !analysis.totals.usage.complete) throw new Error('The selected task is unfinished, unsuccessful, or has incomplete provider usage')
    const outDir = resolve(options['--out-dir']), output = join(outDir, `${version}-${task}-${repeat}.json`)
    const privateAnswer = options['--private-answer'] ? resolve(options['--private-answer']) : null
    if ([output, privateAnswer].includes(sessionPath) || privateAnswer === output) throw new Error('Outputs must not overwrite the session or each other')
    const report = { benchmark: { pluginVersionLabel: version, task, repetition: repeat, versionVerifiedByCollector: false, correctness: 'pending-independent-review' }, ...analysis, artifact: { sha256: createHash('sha256').update(bytes).digest('hex') } }
    await mkdir(outDir, { recursive: true })
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    if (privateAnswer) {
      const selected = analysis.turns[0].turn
      const messages = records.filter(event => event.type === 'assistant/message' && event.data?.turn === selected && (!event.surfaceOp || event.surfaceOp === 'append'))
      const answer = messages.map(event => (event.data?.message?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n')).filter(Boolean).at(-1) ?? ''
      await writeFile(privateAnswer, answer + '\n', { flag: 'wx', mode: 0o600 })
    }
    console.log(JSON.stringify({ output, ...(privateAnswer ? { privateAnswer } : {}), totals: analysis.totals }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
