import http from 'node:http'
import { Router, parseUrl, fail, serveStatic } from './lib/http.mjs'
import { config } from './config.mjs'
import { register as system } from './routes/system.mjs'
import { register as requirements } from './routes/requirements.mjs'
import { register as cases } from './routes/cases.mjs'
import { register as lanes } from './routes/lanes.mjs'
import { register as runs } from './routes/runs.mjs'
import { register as defects } from './routes/defects.mjs'
import { register as models } from './routes/models.mjs'

export function createServer() {
  const router = new Router()
  for (const register of [system, requirements, cases, lanes, runs, defects, models]) register(router)

  return http.createServer(async (req, res) => {
    const url = parseUrl(req)

    // 同源部署，省掉 CORS；如果前端单独起 dev server，允许跨域
    res.setHeader('access-control-allow-origin', req.headers.origin || '*')
    res.setHeader('access-control-allow-headers', 'content-type,last-event-id')
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    if (url.pathname.startsWith('/api/')) {
      const handled = await router.handle(req, res, url)
      if (!handled) fail(res, 404, `未找到接口 ${req.method} ${url.pathname}`)
      return
    }

    if (!serveStatic(req, res, config.webRoot, url.pathname)) fail(res, 404, 'not found')
  })
}
