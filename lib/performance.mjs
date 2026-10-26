// Bounded, in-memory diagnostic counters. Never retain arguments, design content,
// document/node IDs, error strings, image data, or credentials.
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null
const sum = (items, key) => items.reduce((total, item) => total + (item[key] ?? 0), 0)
export class PerformanceLog {
  constructor(limit = 100) { this.limit = limit; this.entries = []; this.completed = 0 }
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
  snapshot() {
    const entries = this.entries.map(entry => ({...entry,imageDimensions:entry.imageDimensions.map(image=>({...image}))}))
    return { scope: 'Current plugin process; local canvas calls only. Durations overlap: runtime includes export and serialization; bridge includes runtime; host includes bridge.',
      completed: this.completed, retained: entries.length, capacity: this.limit,
      totals: { succeeded: entries.filter(entry=>entry.status==='ok').length, failed: entries.filter(entry=>entry.status!=='ok').length,
        hostMs: sum(entries,'hostMs'), textBytes: sum(entries,'textBytes'), imageBytes: sum(entries,'imageBytes'), imageCount: sum(entries,'imageCount') },
      modelUsage: null, modelUsageNote: 'Model tokens, cached tokens, model turns and end-to-end task time require host/provider usage; byte counts are not tokens.', entries }
  }
}
