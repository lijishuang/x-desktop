import { ok, fail, readBody } from '../lib/http.mjs'
import { state, save } from '../store/store.mjs'
import { createLane, enqueue, log, addTimeline } from '../services/pipeline.mjs'
import { requirementView, laneView } from '../services/snapshot.mjs'
import { emit } from '../services/events.mjs'

const STATUS_FLOW = ['draft', 'reviewing', 'confirmed']

/** 每行一条需求：标题 | 模块 | 测试点（后两项可省略） */
export function parseLines(input) {
  const rows = []
  for (const raw of String(input || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split('|').map(s => s.trim())
    const title = parts[0]
    if (!title) continue
    const mod = (parts[1] || 'general').replace(/[^\w\-.]/g, '').slice(0, 32) || 'general'
    const points = Math.min(20, Math.max(2, Number(parts[2]) || 4 + (title.length % 5)))
    rows.push({ title, mod, points })
    if (rows.length >= 12) break
  }
  return rows
}

export function register(router) {
  router.get('/api/requirements', ({ res }) => {
    ok(res, { requirements: state.requirements.map(requirementView) })
  })

  // 导入预览：先解析、不落库，让用户确认
  router.post('/api/requirements/preview', async ({ req, res }) => {
    const body = await readBody(req)
    const rows = parseLines(body.text)
    if (!rows.length) return fail(res, 400, '没有解析到有效需求行')
    ok(res, { count: rows.length, rows })
  })

  router.post('/api/requirements/import', async ({ req, res }) => {
    const body = await readBody(req)
    const rows = parseLines(body.text ?? (body.lines || []).join('\n'))
    if (!rows.length) return fail(res, 400, '没有解析到有效需求行')

    const batch = String(body.batch || '迭代 4.3').slice(0, 40)
    const created = rows.map((r, i) => ({
      id: `REQ-${300 + (state.counters.reqSeq += 1)}`,
      t: r.title,
      mod: r.mod,
      points: r.points,
      covered: 0,
      st: 'draft',
      laneId: null,
      createdAt: new Date(Date.now() + i).toISOString(),
    }))
    state.requirements.push(...created)

    const lane = createLane({ name: batch, batch: `${batch} · 导入`, requirements: created })
    created.forEach(r => { r.laneId = lane.id })
    state.importBatches.unshift({ id: `IMP-${Date.now().toString(36)}`, batch, count: created.length, laneId: lane.id, at: new Date().toISOString() })
    if (state.importBatches.length > 20) state.importBatches.pop()

    log(lane.id, 'sys', `[KEEL·${lane.no}] 收到 ${created.length} 条新需求（${batch}）· 任务线 ${lane.id} 已建立`)
    addTimeline('cyan', `${lane.id} 导入 ${created.length} 条需求（${batch}）`)
    emit('requirements', { created })
    emit('lane', laneView(lane))
    save()
    enqueue(lane)

    ok(res, { lane: laneView(lane), requirements: created.map(requirementView) })
  })

  // 需求状态流转：draft → reviewing → confirmed
  router.patch('/api/requirements/:id', async ({ req, res, params }) => {
    const body = await readBody(req)
    const target = state.requirements.find(r => r.id === params.id)
    if (!target) return fail(res, 404, '需求不存在')
    if (body.st) {
      if (!STATUS_FLOW.includes(body.st)) return fail(res, 400, `状态必须是 ${STATUS_FLOW.join(' / ')}`)
      target.st = body.st
    } else {
      const idx = STATUS_FLOW.indexOf(target.st)
      target.st = STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, idx + 1)]
    }
    emit('requirement', requirementView(target))
    save()
    ok(res, { requirement: requirementView(target) })
  })
}
