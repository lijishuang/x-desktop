import { ok, fail, readBody } from '../lib/http.mjs'
import { state, save } from '../store/store.mjs'
import { emit } from '../services/events.mjs'

const PRIOS = ['P0', 'P1', 'P2']

export function register(router) {
  router.get('/api/cases', ({ res, query }) => {
    const mod = query.get('mod')
    const pri = query.get('pri')
    const q = (query.get('q') || '').toLowerCase()
    let list = state.cases.slice().reverse()
    if (mod && mod !== 'all') list = list.filter(c => c.mod === mod)
    if (pri && pri !== 'all') list = list.filter(c => c.pri === pri)
    if (q) list = list.filter(c => c.id.toLowerCase().includes(q) || c.t.toLowerCase().includes(q))
    ok(res, { total: state.cases.length, cases: list.slice(0, 200) })
  })

  router.post('/api/cases', async ({ req, res }) => {
    const body = await readBody(req)
    const title = String(body.t || '').trim()
    if (!title) return fail(res, 400, '用例标题必填')
    const c = {
      id: `TC-${++state.counters.caseSeq}`,
      reqId: body.reqId || null,
      t: title.slice(0, 80),
      mod: String(body.mod || 'general').slice(0, 32),
      pri: PRIOS.includes(body.pri) ? body.pri : 'P1',
      on: true,
      res: 'skip',
      dur: 0,
      laneId: body.laneId || null,
      createdAt: new Date().toISOString(),
    }
    state.cases.push(c)
    emit('case', c)
    save()
    ok(res, { case: c })
  })

  router.patch('/api/cases/:id', async ({ req, res, params }) => {
    const body = await readBody(req)
    const c = state.cases.find(x => x.id === params.id)
    if (!c) return fail(res, 404, '用例不存在')
    if (typeof body.on === 'boolean') c.on = body.on
    if (PRIOS.includes(body.pri)) c.pri = body.pri
    if (typeof body.t === 'string' && body.t.trim()) c.t = body.t.trim().slice(0, 80)
    emit('case', c)
    save()
    ok(res, { case: c })
  })

  router.del('/api/cases/:id', ({ res, params }) => {
    const idx = state.cases.findIndex(x => x.id === params.id)
    if (idx < 0) return fail(res, 404, '用例不存在')
    const [removed] = state.cases.splice(idx, 1)
    emit('case', { ...removed, deleted: true })
    save()
    ok(res, { deleted: removed.id })
  })
}
