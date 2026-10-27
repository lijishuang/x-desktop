import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

export function json(res, code, payload) {
  const raw = JSON.stringify(payload)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(raw),
  })
  res.end(raw)
}

export function fail(res, code, message, detail) {
  json(res, code, { ok: false, error: { message, detail: detail ?? null } })
}

export function ok(res, data = {}) {
  json(res, 200, { ok: true, data })
}

export async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('invalid JSON body')
  }
}

/** 极简路由：支持 /api/lanes/:id/gates/:role 形式的具名参数 */
export class Router {
  constructor() {
    this.routes = []
  }

  add(method, pattern, handler) {
    const keys = []
    const source = pattern
      .split('/')
      .map(seg => {
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1))
          return '([^/]+)'
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      })
      .join('/')
    this.routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handler })
    return this
  }

  get(p, h) { return this.add('GET', p, h) }
  post(p, h) { return this.add('POST', p, h) }
  patch(p, h) { return this.add('PATCH', p, h) }
  put(p, h) { return this.add('PUT', p, h) }
  del(p, h) { return this.add('DELETE', p, h) }

  async handle(req, res, url) {
    for (const route of this.routes) {
      if (route.method !== req.method) continue
      const m = route.re.exec(url.pathname)
      if (!m) continue
      const params = {}
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]) })
      try {
        await route.handler({ req, res, url, params, query: url.searchParams })
      } catch (err) {
        if (!res.headersSent) fail(res, 500, err.message)
        else res.end()
      }
      return true
    }
    return false
  }
}

export function serveStatic(req, res, root, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let file = path.join(root, rel)
  if (!file.startsWith(root)) {
    fail(res, 403, 'forbidden')
    return true
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA 兜底
    file = path.join(root, 'index.html')
    if (!fs.existsSync(file)) return false
  }
  const ext = path.extname(file).toLowerCase()
  const stream = fs.createReadStream(file)
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
  })
  stream.pipe(res)
  return true
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const parseUrl = req => new URL(req.url, `http://${req.headers.host || 'localhost'}`)
