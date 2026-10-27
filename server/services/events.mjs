/**
 * 事件总线：所有状态变更通过 SSE 推给前端。
 * 保留最近 80 条事件，便于断线重连后补齐（EventSource 自带 Last-Event-ID）。
 */
const clients = new Set()
const backlog = []
const MAX_BACKLOG = 80

let seq = 0

export function subscribe(res, lastEventId = 0) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')

  const since = Number(lastEventId) || 0
  for (const ev of backlog) {
    if (ev.id > since) res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`)
  }

  const client = { res }
  clients.add(client)
  const ping = setInterval(() => res.write(': ping\n\n'), 20000)
  ping.unref?.()

  const close = () => {
    clearInterval(ping)
    clients.delete(client)
    try { res.end() } catch {}
  }
  res.on('close', close)
  res.on('error', close)
}

export function emit(type, data = {}) {
  const ev = { id: ++seq, type, data }
  backlog.push(ev)
  if (backlog.length > MAX_BACKLOG) backlog.shift()
  const payload = `id: ${ev.id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) {
    try { c.res.write(payload) } catch { clients.delete(c) }
  }
}

export const clientCount = () => clients.size
