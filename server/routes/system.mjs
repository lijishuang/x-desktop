import { ok, json, fail } from '../lib/http.mjs'
import { buildSnapshot } from '../services/snapshot.mjs'
import { subscribe, clientCount } from '../services/events.mjs'
import { state, resetState, save } from '../store/store.mjs'
import { config } from '../config.mjs'
import { llmMode } from '../services/llm.mjs'

export function register(router) {
  router.get('/api/health', ({ res }) => {
    json(res, 200, {
      ok: true,
      data: {
        service: 'x-desktop',
        version: state.meta.version,
        uptimeSec: Math.floor((Date.now() - new Date(state.meta.startedAt).getTime()) / 1000),
        clients: clientCount(),
        llmMode: llmMode(),
        lanes: state.lanes.length,
        cases: state.cases.length,
      },
    })
  })

  // 首屏快照：前端一次拉全，之后靠 SSE 增量
  router.get('/api/snapshot', ({ res }) => ok(res, buildSnapshot()))

  router.get('/api/stream', ({ req, res }) => {
    subscribe(res, req.headers['last-event-id'])
  })

  router.get('/api/config', ({ res }) => ok(res, {
    llmMode: llmMode(),
    llmBaseUrl: config.llm.baseUrl || null,
    defaultModel: config.llm.model || null,
    pace: config.pace,
    poolCap: config.poolCap,
  }))

  // 演示/测试用：把状态重置回种子数据
  router.post('/api/admin/reset', ({ res }) => {
    resetState()
    ok(res, { reset: true })
  })

  router.get('/api/logs', ({ res, query }) => {
    const limit = Math.min(200, Number(query.get('limit') || 60))
    ok(res, { logs: state.logs.slice(-limit).reverse() })
  })

  router.get('/api/timeline', ({ res, query }) => {
    const limit = Math.min(100, Number(query.get('limit') || 24))
    ok(res, { timeline: state.timeline.slice(-limit).reverse() })
  })

  router.post('/api/admin/save', ({ res }) => {
    save()
    ok(res, { saved: true })
  })

  router.get('/api/unknown', ({ res }) => fail(res, 404, 'not found'))
}
