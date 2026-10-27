import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 必须在 import 业务模块之前设置：关闭常驻线自启，改用临时数据文件
process.env.AUTO_START = '0'
process.env.AUTO_LOOP_SEC = '999'
process.env.DATA_FILE = path.join(os.tmpdir(), `x-desktop-test-${Date.now()}.json`)
process.env.PACE_STAGE_STEP_MS = '24'
process.env.PACE_CASE_EXEC_MS = '12'

const { createServer } = await import('../server/app.mjs')

const server = createServer()
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

async function api(pathname, init = {}) {
  const res = await fetch(base + pathname, {
    headers: { 'content-type': 'application/json' },
    ...init,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json()
  return { status: res.status, ...json }
}

const waitFor = async (fn, timeout = 20000, interval = 120) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

test('健康检查与快照结构', async () => {
  const health = await api('/api/health')
  assert.equal(health.status, 200)
  assert.equal(health.data.service, 'x-desktop')
  assert.ok(['live', 'unset'].includes(health.data.llmMode), `llmMode 应为 live/unset，实际 ${health.data.llmMode}`)

  const snap = await api('/api/snapshot')
  assert.equal(snap.ok, true)
  const s = snap.data
  assert.equal(s.stages.length, 5)
  assert.equal(s.agents.length, 5)
  assert.equal(s.models.providers.length, 5)
  assert.ok(s.kpi.cases > 0)
  assert.ok(s.requirements.length >= 8)
  assert.ok(s.lanes.length >= 1)
})

test('导入需求 → 新建任务线 → 全流程跑完', async () => {
  const before = (await api('/api/snapshot')).data
  const imp = await api('/api/requirements/import', {
    method: 'POST',
    body: {
      batch: '测试批次 · 冒烟',
      text: '重复通知幂等不得重复扣款 | order-payment | 6\n退款金额按分存储 | settle-job | 4',
    },
  })
  assert.equal(imp.status, 200)
  assert.equal(imp.data.requirements.length, 2)
  const laneId = imp.data.lane.id
  assert.match(laneId, /^L-\d+$/)

  const done = await waitFor(async () => {
    const lanes = (await api('/api/lanes')).data.lanes
    const lane = lanes.find(l => l.id === laneId)
    return lane && lane.status === 'done'
  }, 25000)
  assert.equal(done, true, '任务线应在超时前完成')

  const after = (await api('/api/snapshot')).data
  assert.ok(after.cases.length > before.cases.length, '用例应增加')
  assert.ok(after.results.length > before.results.length, '执行结果应增加')

  const lane = after.lanes.find(l => l.id === laneId)
  assert.equal(lane.pct, 100)
  assert.ok(lane.cases >= 4)

  const run = after.runs.find(r => r.laneId === laneId)
  assert.ok(run, '应生成运行记录')
  assert.equal(run.st, 'done')
  assert.ok(after.contexts[laneId].items.length >= 3, '共享上下文应有各环节产物')
})

test('实例开关冻结单个角色，不影响其他角色', async () => {
  const lanes = (await api('/api/lanes')).data.lanes
  const lane = lanes.find(l => l.status === 'done') || lanes[0]
  const off = await api(`/api/lanes/${lane.id}/gates/run`, { method: 'POST', body: { on: false } })
  assert.equal(off.data.lane.gates.run, false)
  const on = await api(`/api/lanes/${lane.id}/gates/run`, { method: 'POST', body: { on: true } })
  assert.equal(on.data.lane.gates.run, true)

  const bad = await api('/api/lanes/NOPE/gates/run', { method: 'POST', body: { on: false } })
  assert.equal(bad.status, 404)
})

test('调度并行度校验', async () => {
  const ok = await api('/api/scheduler', { method: 'PATCH', body: { conc: 3 } })
  assert.equal(ok.data.scheduler.conc, 3)
  const bad = await api('/api/scheduler', { method: 'PATCH', body: { conc: 9 } })
  assert.equal(bad.status, 400)
  await api('/api/scheduler', { method: 'PATCH', body: { conc: 2 } })
})

test('用例增删改与停用', async () => {
  const created = await api('/api/cases', { method: 'POST', body: { t: '接口幂等重放校验', mod: 'order-payment', pri: 'P0' } })
  assert.equal(created.status, 200)
  const id = created.data.case.id

  const patched = await api(`/api/cases/${id}`, { method: 'PATCH', body: { on: false, pri: 'P2' } })
  assert.equal(patched.data.case.on, false)
  assert.equal(patched.data.case.pri, 'P2')

  const removed = await api(`/api/cases/${id}`, { method: 'DELETE' })
  assert.equal(removed.data.deleted, id)

  const missing = await api('/api/cases/TC-0000', { method: 'PATCH', body: { on: true } })
  assert.equal(missing.status, 404)
})

test('缺陷状态流转移', async () => {
  const list = await api('/api/defects')
  const d = list.data.defects.find(x => x.st !== 'closed')
  const next = await api(`/api/defects/${d.id}`, { method: 'PATCH', body: {} })
  assert.notEqual(next.data.defect.st, d.st)
  const set = await api(`/api/defects/${d.id}`, { method: 'PATCH', body: { st: 'closed' } })
  assert.equal(set.data.defect.st, 'closed')
})

test('模型绑定 / 实例覆盖 / 上下文 Prompt', async () => {
  const models = await api('/api/models')
  assert.equal(models.data.providers.length, 5)
  assert.ok(models.data.bindings.plan.model)

  const bind = await api('/api/models/bindings/case', { method: 'PATCH', body: { providerId: 'openai', model: 'gpt-4.1', temperature: 0.4 } })
  assert.equal(bind.data.binding.providerId, 'openai')
  assert.equal(bind.data.binding.model, 'gpt-4.1')

  const badModel = await api('/api/models/bindings/case', { method: 'PATCH', body: { providerId: 'openai', model: 'not-exist' } })
  assert.equal(badModel.status, 400)

  const laneId = models.data.lanes[0].id
  const ovr = await api(`/api/models/overrides/${laneId}/case`, { method: 'PUT', body: { providerId: 'deepseek', model: 'deepseek-chat' } })
  assert.equal(ovr.data.override.model, 'deepseek-chat')

  const prompt = await api(`/api/models/prompt/${laneId}/case`)
  assert.match(prompt.data.prompt, /# SHARED CONTEXT/)
  assert.match(prompt.data.prompt, /# OUTPUT CONTRACT/)

  const del = await api(`/api/models/overrides/${laneId}/case`, { method: 'DELETE' })
  assert.equal(del.data.removed, true)

  // 未配置 LLM 环境变量时探活直接 400；配置了则真实探活返回延迟
  const test = await api('/api/models/providers/deepseek/test', { method: 'POST' })
  if (test.status === 200) {
    assert.ok(test.data.provider.latency > 0)
    assert.equal(test.data.mode, 'live')
  } else {
    assert.equal(test.status, 400)
    assert.match(test.error.message, /粘贴 API Key/)
  }
})

test('未知接口返回 404 且结构统一', async () => {
  const res = await api('/api/nope')
  assert.equal(res.status, 404)
  assert.equal(res.ok, false)
  assert.ok(res.error.message)
})

test('静态页面可访问', async () => {
  const res = await fetch(base + '/')
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /X-DeskTop/)
  assert.match(html, /js\/main\.js/)
})

test.after(async () => {
  await new Promise(resolve => server.close(resolve))
  try { fs.rmSync(process.env.DATA_FILE, { force: true }) } catch {}
})
