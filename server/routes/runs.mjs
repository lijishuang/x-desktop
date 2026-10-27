import { ok, fail } from '../lib/http.mjs'
import { state } from '../store/store.mjs'

export function register(router) {
  router.get('/api/runs', ({ res }) => {
    const active = state.runs.filter(r => r.st === 'running')
    ok(res, {
      active,
      history: state.runs.filter(r => r.st !== 'running').slice(0, 12),
    })
  })

  router.get('/api/runs/:id/results', ({ res, params, query }) => {
    const run = state.runs.find(r => r.id === params.id)
    if (!run) return fail(res, 404, '运行记录不存在')
    const limit = Math.min(200, Number(query.get('limit') || 60))
    ok(res, {
      run,
      results: state.results.filter(r => r.runId === run.id).slice(-limit).reverse(),
    })
  })

  router.get('/api/results', ({ res, query }) => {
    const limit = Math.min(200, Number(query.get('limit') || 60))
    ok(res, { results: state.results.slice(-limit).reverse() })
  })
}
