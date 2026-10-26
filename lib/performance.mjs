import { randomUUID } from 'node:crypto'

// Bounded, in-memory diagnostic counters. Never retain arguments, design content,
// document/node IDs, error strings, image data, or credentials.
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null
const sum = (items, key) => items.reduce((total, item) => total + (item[key] ?? 0), 0)
export class PerformanceLog {
  constructor(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Performance capacity must be 1–100')
    this.limit = limit; this.entries = []; this.completed = 0; this.epoch = randomUUID()
  }
  record({ tool, status, hostMs, textBytes, imageBytes, imageCount, runtime, bridge } = {}) {
    const entry = {
      sequence: ++this.completed,
      tool: /^[a-z_]{1,64}$/.test(tool ?? '') ? tool : 'unknown',
      status: ['ok', 'failed', 'canceled'].includes(status) ? status : 'failed',
      hostMs: numeric(hostMs), queueMs: numeric(bridge?.queueMs), bridgeMs: numeric(bridge?.bridgeMs),
      runtimeMs: numeric(runtime?.runtimeMs), exportMs: numeric(runtime?.exportMs), serializationMs: numeric(runtime?.serializationMs),
      nodeCount: numeric(runtime?.nodeCount), textBytes: numeric(textBytes), imageCount: numeric(imageCount), imageBytes: numeric(imageBytes),
      imageDimensions: Array.isArray(runtime?.images) ? runtime.images.slice(0,4).map(image => ({width:numeric(image?.width),height:numeric(image?.height)})) : [],
    }
    this.entries.push(entry)
    if (this.entries.length > this.limit) this.entries.shift()
  }
  snapshot({ since, details = false } = {}) {
    if (since !== undefined) {
      if (!since || typeof since !== 'object' || Array.isArray(since) || typeof since.epoch !== 'string' || !Number.isSafeInteger(since.sequence) || since.sequence < 0) throw new Error('Invalid metrics cursor; use performance.cursor from figma_status')
      if (since.epoch !== this.epoch) throw new Error('Metrics cursor belongs to another session or plugin run. Start a new baseline with figma_status({compact:true,includeMetrics:true}).')
      if (since.sequence > this.completed) throw new Error('Metrics cursor is ahead of this log; start a new baseline with figma_status')
    }
    const after = since?.sequence ?? 0
    const selected = this.entries.filter(entry => entry.sequence > after)
    const expected = this.completed - after
    const entries = details ? selected.map(entry => ({...entry,imageDimensions:entry.imageDimensions.map(image=>({...image}))})) : undefined
    return { scope: 'Current Work session in this plugin run; completed local canvas calls only. Excludes status, guides, model requests and other sessions.',
      timingNote: 'Durations overlap: runtime includes export and serialization; bridge includes runtime; host includes bridge.',
      completed: this.completed, retained: this.entries.length, capacity: this.limit,
      cursor: { epoch: this.epoch, sequence: this.completed },
      window: { afterSequence: after, throughSequence: this.completed, expected, returned: selected.length, dropped: expected - selected.length, complete: expected === selected.length },
      totalsScope: 'Returned window only; check window.complete before treating totals as a complete interval.',
      totals: { succeeded: selected.filter(entry=>entry.status==='ok').length, failed: selected.filter(entry=>entry.status!=='ok').length,
        hostMs: sum(selected,'hostMs'), textBytes: sum(selected,'textBytes'), imageBytes: sum(selected,'imageBytes'), imageCount: sum(selected,'imageCount') },
      modelUsage: null, modelUsageNote: 'Model tokens, cached tokens, model turns and end-to-end task time require host/provider usage; byte counts are not tokens.', ...(details ? { entries } : {}) }
  }
}
