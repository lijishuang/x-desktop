import { ok, fail, readBody } from '../lib/http.mjs'
import { state, save } from '../store/store.mjs'
import { emit } from '../services/events.mjs'

const FLOW = ['new', 'reproduced', 'fixing', 'verified', 'closed']

export function register(router) {
  router.get('/api/defects', ({ res, query }) => {
    const sev = query.get('sev')
    let list = state.defects.slice().sort((a, b) => b.at.localeCompare(a.at))
    if (sev && sev !== 'all') list = list.filter(d => d.sev === sev)
    ok(res, {
      total: state.defects.length,
      open: state.defects.filter(d => d.st !== 'closed').length,
      defects: list,
      flow: FLOW,
    })
  })

  // 缺陷流转：new → reproduced → fixing → verified → closed
  router.patch('/api/defects/:id', async ({ req, res, params }) => {
    const body = await readBody(req)
    const d = state.defects.find(x => x.id === params.id)
    if (!d) return fail(res, 404, '缺陷不存在')
    if (body.st) {
      if (!FLOW.includes(body.st)) return fail(res, 400, `状态需为 ${FLOW.join(' / ')}`)
      d.st = body.st
    } else {
      const idx = FLOW.indexOf(d.st)
      d.st = FLOW[Math.min(FLOW.length - 1, idx + 1)]
    }
    d.updatedAt = new Date().toISOString()
    emit('defect', d)
    save()
    ok(res, { defect: d })
  })
}
