/** SSE 订阅：断线自动重连，按事件类型分发给订阅者 */
const handlers = new Map()
let source = null

export function connectStream(onStatus) {
  if (source) source.close()
  source = new EventSource('/api/stream')

  const types = ['lane', 'log', 'result', 'run', 'defect', 'timeline', 'context', 'llm', 'pool', 'scheduler', 'requirement', 'requirements', 'case', 'cases', 'bindings', 'provider']
  for (const t of types) {
    source.addEventListener(t, ev => {
      let data = null
      try { data = JSON.parse(ev.data) } catch { return }
      for (const fn of handlers.get(t) || []) fn(data, t)
    })
  }

  source.addEventListener('open', () => onStatus?.('live'))
  source.addEventListener('error', () => onStatus?.('retry'))
  return source
}

export function onEvent(types, fn) {
  for (const t of [].concat(types)) {
    if (!handlers.has(t)) handlers.set(t, new Set())
    handlers.get(t).add(fn)
  }
}
