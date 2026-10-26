import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fixtureRuntime } from '../test/fixtures.mjs'

// Deterministic data; timings depend on this machine. No editor, model or API calls.
const options = { runs: 9, output: null }
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg === '--runs') options.runs = Number(process.argv[++i])
  else if (arg === '--output') {
    const path = process.argv[++i]
    if (!path || path.startsWith('--')) throw new Error('--output requires a file path')
    options.output = resolve(path)
  } else throw new Error('Usage: node scripts/benchmark.mjs [--runs 3..100] [--output report.json]')
}
if (!Number.isInteger(options.runs) || options.runs < 3 || options.runs > 100) throw new Error('--runs must be an integer from 3 to 100')

const f = await fixtureRuntime()
const root = f.figma.createFrame()
root.name = 'Benchmark page section'
f.page.appendChild(root)
const styleNode = node => Object.assign(node, {
  visible: true, locked: false, opacity: 1, rotation: 0, blendMode: 'PASS_THROUGH',
  fills: [{ type: 'SOLID', color: { r: 0.12, g: 0.24, b: 0.52 }, opacity: 1 }],
  strokes: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.92 }, opacity: 1 }],
  strokeWeight: 1, strokeAlign: 'INSIDE', cornerRadius: 8,
  effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 4 }, radius: 12, visible: true, blendMode: 'NORMAL' }],
  boundVariables: { cornerRadius: { type: 'VARIABLE_ALIAS', id: 'VariableID:radius' } },
})
styleNode(root)
for (let row = 0; row < 40; row++) {
  const card = styleNode(f.figma.createFrame())
  Object.assign(card, { name: `Card ${row}`, layoutMode: 'VERTICAL', itemSpacing: 12, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 })
  root.appendChild(card)
  for (let column = 0; column < 12; column++) {
    const text = styleNode(f.figma.createText())
    Object.assign(text, {
      name: `Label ${row}/${column}`, characters: `项目 ${row} 的字段 ${column}: editable design content`,
      fontName: { family: 'Bench Sans', style: 'Regular' }, fontSize: 14, fontWeight: 400,
      lineHeight: { unit: 'PIXELS', value: 20 }, letterSpacing: { unit: 'PIXELS', value: 0 },
      textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP', textAutoResize: 'HEIGHT',
    })
    text.getStyledTextSegments = () => [{ start: 0, end: text.characters.length, characters: text.characters, fontName: text.fontName, fontSize: 14, fills: text.fills, textDecoration: 'NONE', textCase: 'ORIGINAL', lineHeight: text.lineHeight, letterSpacing: text.letterSpacing }]
    card.appendChild(text)
  }
}
const fonts = Array.from({ length: 200 }, (_, index) => ['Regular', 'Medium', 'Semibold', 'Bold'].map(style => ({ fontName: { family: `Bench Sans ${String(index).padStart(3, '0')}`, style } }))).flat()
f.figma.listAvailableFontsAsync = async () => fonts
const variables = Array.from({ length: 300 }, (_, index) => ({
  id: `VariableID:bench-${index}`, key: `bench-${index}`, name: `color/bench/${index}`, resolvedType: 'COLOR',
  valuesByMode: { light: { r: index / 300, g: 0.2, b: 0.4 }, dark: { r: 0.1, g: 0.2, b: index / 300 } },
  scopes: ['ALL_SCOPES'], description: `Benchmark color ${index}`, variableCollectionId: 'collection-bench',
}))
f.figma.variables.getLocalVariablesAsync = async () => variables
f.figma.variables.getLocalVariableCollectionsAsync = async () => [{ id: 'collection-bench', name: 'Benchmark Theme', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }], defaultModeId: 'light', variableIds: variables.map(v => v.id) }]

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const round = value => Math.round(value * 1000) / 1000
async function measure(method, args) {
  for (let i = 0; i < 2; i++) await f.runtime.run(method, args)
  const elapsed = []
  let result
  for (let i = 0; i < options.runs; i++) {
    const start = performance.now()
    result = await f.runtime.run(method, args)
    elapsed.push(performance.now() - start)
  }
  assert.equal(result.images.length, 0)
  return {
    value: result.value,
    stats: {
      method, args, modelTextUtf8Bytes: Buffer.byteLength(JSON.stringify(result.value)),
      syntheticRuntimeP50Ms: round(median(elapsed)), syntheticRuntimeMinMs: round(Math.min(...elapsed)), syntheticRuntimeMaxMs: round(Math.max(...elapsed)),
      imageCount: result.images.length,
    },
  }
}
function identities(node, out = []) {
  out.push([node.id, node.name, node.type, node.x, node.y, node.width, node.height])
  for (const child of node.children ?? []) identities(child, out)
  return out
}
const full = await measure('get_metadata', { nodeId: root.id, depth: 3 })
const summary = await measure('get_metadata', { nodeId: root.id, depth: 3, profile: 'summary' })
assert.equal(identities(full.value).length, 521)
assert.deepEqual(identities(summary.value), identities(full.value), 'summary must preserve all discovery identities and bounds')
assert.ok(summary.stats.modelTextUtf8Bytes < full.stats.modelTextUtf8Bytes, 'summary should reduce discovery payload')
const allFonts = await measure('list_fonts', {})
const chosenFonts = await measure('list_fonts', { family: 'Bench Sans 025', limit: 10 })
assert.equal(chosenFonts.value.fonts.length, 4)
assert.ok(chosenFonts.value.fonts.every(font => font.fontName.family === 'Bench Sans 025'))
const allVariables = await measure('get_variable_defs', {})
const chosenIds = variables.slice(20, 25).map(v => v.id)
const chosenVariables = await measure('get_variable_defs', { ids: chosenIds, modeIds: ['light'], limit: 10 })
assert.deepEqual(Array.from(chosenVariables.value.variables, v => v.id), chosenIds)
assert.ok(chosenVariables.value.variables.every(v => Object.keys(v.valuesByMode).join(',') === 'light'))
const metadataPage = await measure('get_metadata', { nodeId: root.id, profile: 'summary', depth: 1, offset: 10, limit: 5 })
assert.deepEqual(Array.from(metadataPage.value.children, n => n.id), Array.from(root.children.slice(10, 15), n => n.id))
assert.equal(metadataPage.value.pagination.hasMore, true)
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const report = {
  schemaVersion: 1, packageVersion: pkg.version, fixture: 'phase-one-fixed-data-v1',
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  measurement: { source: 'synthetic Plugin API fixtures; no Figma editor or model calls', warmupRuns: 2, measuredRuns: options.runs, actualModelUsage: null, modelTurns: null, taskWallMs: null, screenshotExportMs: null },
  dataset: { subtreeNodes: 521, fonts: fonts.length, variables: variables.length },
  comparisons: [
    { task: 'Discover the same subtree identities and bounds', full: full.stats, optimized: summary.stats, identityCheck: 'passed', textByteReductionPercent: round((1 - summary.stats.modelTextUtf8Bytes / full.stats.modelTextUtf8Bytes) * 100) },
    { task: 'Find the four available styles for Bench Sans 025', full: allFonts.stats, optimized: chosenFonts.stats, matchCheck: 'passed' },
    { task: 'Read five known variables in Light mode', full: allVariables.stats, optimized: chosenVariables.stats, matchCheck: 'passed' },
  ],
  pagination: metadataPage.stats,
  limits: ['UTF-8 bytes are not model tokens or billed usage.', 'Fixture timings exclude model generation, host scheduling, bridge transfer and real Figma API work.', 'P50/min/max describe this run only; no P95 claim from a small sample.', 'Compare end-to-end task correctness and total calls before claiming user-visible savings.'],
}
const json = JSON.stringify(report, null, 2) + '\n'
if (options.output) await writeFile(options.output, json)
else process.stdout.write(json)
