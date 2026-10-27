import { ok, fail, readBody } from '../lib/http.mjs'
import { state, save } from '../store/store.mjs'
import { emit } from '../services/events.mjs'
import { setGate, enqueue, pump, laneSummary, log, addTimeline } from '../services/pipeline.mjs'
import { laneView } from '../services/snapshot.mjs'
import { ROLES } from '../domain/seed.mjs'

export function register(router) {
  router.get('/api/lanes', ({ res }) => {
    ok(res, {
      lanes: laneSummary(),
      scheduler: state.scheduler,
      pool: state.pool,
      roles: ROLES,
    })
  })

  // 单个实例（角色）启停：停掉的阶段真的会冻结
  router.post('/api/lanes/:id/gates/:role', async ({ req, res, params }) => {
    const body = await readBody(req)
    const on = body.on === undefined ? true : Boolean(body.on)
    try {
      const lane = setGate(params.id, params.role, on)
      ok(res, { lane: laneView(lane) })
    } catch (err) {
      fail(res, 404, err.message)
    }
  })

  // 整线冻结 / 续跑
  router.post('/api/lanes/:id/freeze', ({ res, params }) => {
    const lane = state.lanes.find(l => l.id === params.id)
    if (!lane) return fail(res, 404, '任务线不存在')
    if (lane.status === 'done') return fail(res, 400, '任务线已完成，无需冻结')
    lane.status = 'paused'
    emit('lane', laneView(lane))
    log(lane.id, 'warn', `任务线 ${lane.id} 已冻结 · 进度保留，可随时续跑`)
    addTimeline('amber', `${lane.id} 冻结（${lane.pct || 0}% 处保留现场）`)
    save()
    ok(res, { lane: laneView(lane) })
  })

  router.post('/api/lanes/:id/resume', ({ res, params }) => {
    const lane = state.lanes.find(l => l.id === params.id)
    if (!lane) return fail(res, 404, '任务线不存在')
    if (lane.status === 'running') return ok(res, { lane: laneView(lane) })
    lane.status = 'queued'
    lane.note = ''
    emit('lane', laneView(lane))
    log(lane.id, 'sys', `任务线 ${lane.id} 已重新排队 · 从断点续跑`)
    save()
    pump()
    ok(res, { lane: laneView(lane) })
  })

  // 并行度：同时推进几条任务线
  router.patch('/api/scheduler', async ({ req, res }) => {
    const body = await readBody(req)
    const conc = Number(body.conc)
    if (!Number.isFinite(conc) || conc < 1 || conc > 4) return fail(res, 400, '并行度需在 1~4 之间')
    state.scheduler.conc = Math.round(conc)
    emit('scheduler', state.scheduler)
    save()
    pump()
    ok(res, { scheduler: state.scheduler })
  })
}
