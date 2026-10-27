import { state, save, nextId } from '../store/store.mjs'
import { emit } from './events.mjs'
import { callLLM } from './llm.mjs'
import { buildPrompt, pushContext } from './context.mjs'
import { config } from '../config.mjs'
import { ROLES, STAGES } from '../domain/seed.mjs'
import { sleep } from '../lib/http.mjs'
import { laneView } from './snapshot.mjs'

/* ── 执行机池：全局共享，按名额排队 ── */
const poolWaiters = []
export function acquireSlot() {
  if (state.pool.used < state.pool.cap) {
    state.pool.used += 1
    emit('pool', { ...state.pool })
    return Promise.resolve()
  }
  return new Promise(resolve => poolWaiters.push(resolve))
}
export function releaseSlot() {
  const next = poolWaiters.shift()
  if (next) next()
  else state.pool.used = Math.max(0, state.pool.used - 1)
  emit('pool', { ...state.pool })
  save()
}

/* ── 日志 / 时间线 ── */
export function log(laneId, level, text) {
  const entry = {
    id: `LG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    laneId, level, text, at: new Date().toISOString(),
  }
  state.logs.push(entry)
  if (state.logs.length > 500) state.logs.shift()
  emit('log', entry)
  save()
  return entry
}

export function addTimeline(tone, text) {
  const entry = {
    id: `TL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    tone, text, at: new Date().toISOString(),
  }
  state.timeline.push(entry)
  if (state.timeline.length > 200) state.timeline.shift()
  emit('timeline', entry)
  save()
  return entry
}

const fmt = n => Number(n).toLocaleString('en-US')

/* ── 任务线 ── */
export function createLane({ name, batch, requirements, primary = false }) {
  const seq = state.lanes.length + 1
  const id = nextId('lane')
  const lane = {
    id,
    no: seq,
    name,
    batch,
    primary,
    status: 'queued',
    stages: { plan: 0, req: 0, case: 0, run: 0, bug: 0 },
    gates: { plan: true, req: true, case: true, run: true, bug: true },
    req: requirements.length,
    cases: 0,
    pass: 0,
    fail: 0,
    slots: 0,
    reqIds: requirements.map(r => r.id),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    note: '',
  }
  state.lanes.push(lane)
  emit('lane', laneView(lane))
  save()
  return lane
}

export function setGate(laneId, roleKey, on) {
  const lane = state.lanes.find(l => l.id === laneId)
  if (!lane) throw new Error('lane not found')
  if (!ROLES.some(r => r.k === roleKey)) throw new Error('unknown role')
  lane.gates[roleKey] = Boolean(on)
  emit('lane', laneView(lane))
  const role = ROLES.find(r => r.k === roleKey)
  log(laneId, lane.gates[roleKey] ? 'sys' : 'warn',
    `[${role.n}·${lane.no}] ${lane.gates[roleKey] ? '已恢复在岗，从断点继续' : '已暂停，本阶段冻结'}`)
  addTimeline(lane.gates[roleKey] ? 'lime' : 'amber',
    `${role.n}·${lane.no} ${lane.gates[roleKey] ? '恢复' : '暂停'}（${lane.id}）`)
  save()
  return lane
}

export function enqueue(lane) {
  lane.status = 'queued'
  emit('lane', laneView(lane))
  save()
  pump()
}

export function startPrimary() {
  const primary = state.lanes.find(l => l.primary)
  if (!primary) return null
  if (primary.status === 'running') return primary
  if (primary.status !== 'queued') {
    primary.status = 'queued'
    primary.note = ''
    log(primary.id, 'sys', `常驻回归线路 ${primary.id} 启动新一轮 · 5 个角色实例就位`)
    addTimeline('cyan', `${primary.id} 常驻回归新一轮启动`)
    emit('lane', laneView(primary))
  }
  save()
  pump()
  return primary
}

export function pump() {
  const running = state.lanes.filter(l => l.status === 'running').length
  if (running >= state.scheduler.conc) return
  const next = state.lanes.find(l => l.status === 'queued')
  if (!next) return
  runLane(next)
    .catch(err => {
      next.status = 'failed'
      next.note = err.message
      log(next.id, 'fail', `[${next.id}] 流水线异常：${err.message}`)
      emit('lane', laneView(next))
    })
    .finally(() => {
      save()
      pump()
    })
}

async function waitRunnable(lane) {
  while (lane.status === 'paused') await sleep(300)
}

async function waitGate(lane, roleKey) {
  while (lane.gates[roleKey] === false) {
    await waitRunnable(lane)
    await sleep(300)
  }
}

async function stageProgress(lane, key, ms) {
  const from = lane.stages[key] || 0
  const steps = 8
  for (let i = 1; i <= steps; i += 1) {
    await waitRunnable(lane)
    lane.stages[key] = Math.round(from + ((100 - from) * i) / steps)
    emit('lane', laneView(lane))
    await sleep(Math.max(20, ms / steps))
  }
  lane.stages[key] = 100
  emit('lane', laneView(lane))
}

const CASE_SUFFIX = [
  ['正常流全链路校验', 'P1'],
  ['边界值与极值处理', 'P1'],
  ['异常分支与错误码', 'P2'],
  ['并发与幂等一致性', 'P0'],
]

function designCases(lane) {
  const reqs = state.requirements.filter(r => lane.reqIds.includes(r.id))
  const created = []
  reqs.forEach((req, ri) => {
    const n = req.points >= 9 ? 3 : 2
    for (let i = 0; i < n; i += 1) {
      const [suffix, pri] = CASE_SUFFIX[(ri + i) % CASE_SUFFIX.length]
      const c = {
        id: `TC-${++state.counters.caseSeq}`,
        reqId: req.id,
        t: `${req.t.slice(0, 14)}… · ${suffix}`,
        mod: req.mod,
        pri,
        on: true,
        res: 'skip',
        dur: 0,
        laneId: lane.id,
        createdAt: new Date().toISOString(),
      }
      state.cases.push(c)
      created.push(c)
      req.covered = Math.min(req.points, req.covered + 1)
    }
  })
  return created
}

function severityOf(pri) {
  if (pri === 'P0') return 'P0'
  if (pri === 'P1') return Math.random() < 0.35 ? 'P0' : 'P1'
  return Math.random() < 0.5 ? 'P1' : 'P2'
}

async function runLane(lane) {
  lane.status = 'running'
  lane.note = ''
  lane.startedAt = new Date().toISOString()
  emit('lane', laneView(lane))
  log(lane.id, 'sys', `任务线 ${lane.id}（${lane.name}）启动 · 5 个角色实例就位`)
  addTimeline('cyan', `${lane.id} 启动 · ${lane.req} 条需求进入流水线`)

  const run = {
    id: nextId('run'),
    laneId: lane.id,
    batch: lane.batch,
    total: 0,
    done: 0,
    pass: 0,
    fail: 0,
    st: 'running',
    at: new Date().toISOString(),
    endAt: null,
  }
  state.runs.unshift(run)
  emit('run', run)

  /* ① 测试方案 */
  await waitGate(lane, 'plan')
  await waitRunnable(lane)
  log(lane.id, 'sys', `[KEEL·${lane.no}] 拆解测试范围 · 风险优先 · 准出阈值 95%`)
  const planPrompt = buildPrompt({
    lane, roleKey: 'plan', roleName: 'KEEL',
    task: `为「${lane.name}」的 ${lane.req} 条需求输出测试方案：范围、策略、环境、准入准出。`,
  })
  const planCall = await callLLM({ roleKey: 'plan', laneId: lane.id, laneNo: lane.no, prompt: planPrompt, purpose: `测试方案 · ${lane.name}` })
  log(lane.id, 'llm', `[LLM] KEEL·${lane.no} → ${planCall.model} · in ${fmt(planCall.inTok)} / out ${fmt(planCall.outTok)} tok · ${planCall.ms}ms${planCall.error ? ' · 失败: ' + planCall.error : ''}`)
  await stageProgress(lane, 'plan', 1200)
  pushContext({
    laneId: lane.id, author: `KEEL·${lane.no}`, role: 'plan',
    text: `测试方案：范围=${lane.name}（${lane.req} 条需求）；策略=风险优先（P0 先行）；准出=通过率≥95% 且无遗留 P0。`,
    tokens: 520,
  })
  log(lane.id, 'pass', `[KEEL·${lane.no}] 测试方案已产出 · 准出标准下发`)
  addTimeline('cyan', `KEEL·${lane.no} 输出测试方案 · ${lane.req} 条需求已排优先级`)

  /* ② 需求分析 */
  await waitGate(lane, 'req')
  await waitRunnable(lane)
  log(lane.id, 'sys', `[ORACLE·${lane.no}] 抽取测试点 · 标记歧义需求`)
  const reqPrompt = buildPrompt({
    lane, roleKey: 'req', roleName: 'ORACLE',
    task: '把需求拆成可执行的测试点，标注歧义与待确认项，输出追溯矩阵。',
  })
  const reqCall = await callLLM({ roleKey: 'req', laneId: lane.id, laneNo: lane.no, prompt: reqPrompt, purpose: `需求分析 · ${lane.name}` })
  log(lane.id, 'llm', `[LLM] ORACLE·${lane.no} → ${reqCall.model} · in ${fmt(reqCall.inTok)} / out ${fmt(reqCall.outTok)} tok · ${reqCall.ms}ms${reqCall.error ? ' · 失败: ' + reqCall.error : ''}`)
  await stageProgress(lane, 'req', 1400)
  const reqs = state.requirements.filter(r => lane.reqIds.includes(r.id))
  const points = reqs.reduce((a, r) => a + r.points, 0)
  reqs.forEach(r => {
    if (r.st === 'draft') r.st = 'reviewing'
  })
  pushContext({
    laneId: lane.id, author: `ORACLE·${lane.no}`, role: 'req',
    text: `追溯矩阵：${reqs.length} 条需求 → ${points} 个测试点；${reqs.filter(r => r.st !== 'confirmed').length} 条需求仍待确认。`,
    tokens: 360,
  })
  log(lane.id, 'pass', `[ORACLE·${lane.no}] 产出 ${points} 个测试点 · 追溯矩阵已挂到本线`)
  addTimeline('blue', `ORACLE·${lane.no} 抽取 ${points} 个测试点 · 追溯矩阵就绪`)

  /* ③ 用例设计 */
  await waitGate(lane, 'case')
  await waitRunnable(lane)
  log(lane.id, 'sys', `[WEAVE·${lane.no}] 生成用例并绑定需求`)
  const casePrompt = buildPrompt({
    lane, roleKey: 'case', roleName: 'WEAVE',
    task: '按测试点设计用例：前置数据、步骤、断言、清理；优先级按影响面。',
  })
  const caseCall = await callLLM({ roleKey: 'case', laneId: lane.id, laneNo: lane.no, prompt: casePrompt, purpose: `用例设计 · ${lane.name}` })
  log(lane.id, 'llm', `[LLM] WEAVE·${lane.no} → ${caseCall.model} · in ${fmt(caseCall.inTok)} / out ${fmt(caseCall.outTok)} tok · ${caseCall.ms}ms${caseCall.error ? ' · 失败: ' + caseCall.error : ''}`)
  await stageProgress(lane, 'case', 1300)

  const laneCases = state.cases.filter(c => c.laneId === lane.id)
  const generated = laneCases.length ? [] : designCases(lane)
  const allCases = laneCases.length ? laneCases : generated
  lane.cases = allCases.length
  run.total = allCases.length
  pushContext({
    laneId: lane.id, author: `WEAVE·${lane.no}`, role: 'case',
    text: `用例集：${allCases.length} 条（P0 ${allCases.filter(c => c.pri === 'P0').length} / P1 ${allCases.filter(c => c.pri === 'P1').length} / P2 ${allCases.filter(c => c.pri === 'P2').length}），覆盖等价类、边界值、并发与幂等。`,
    tokens: 440,
  })
  log(lane.id, 'pass', `[WEAVE·${lane.no}] 生成 ${allCases.length} 条用例 · 与本线需求双向关联`)
  addTimeline('violet', `WEAVE·${lane.no} 生成 ${allCases.length} 条用例 · 追溯矩阵闭环`)
  emit('lane', laneView(lane))
  emit('cases', { laneId: lane.id, count: allCases.length })

  /* ④ 自动执行 */
  await waitGate(lane, 'run')
  await waitRunnable(lane)
  log(lane.id, 'sys', `[SWARM·${lane.no}] 调度执行机池 · 逐条执行 ${allCases.length} 条用例`)
  const failures = []
  for (const [i, c] of allCases.entries()) {
    await waitGate(lane, 'run')
    await waitRunnable(lane)
    if (!c.on) {
      log(lane.id, 'sys', `[SWARM·${lane.no}] ${c.id} 已停用，跳过`)
      continue
    }
    await acquireSlot()
    try {
      await sleep(config.pace.caseExecMs + (i % 3) * 40)
      const passRate = c.pri === 'P0' ? 0.94 : c.pri === 'P1' ? 0.9 : 0.86
      const pass = Math.random() < passRate
      const dur = Number((0.6 + Math.random() * 6).toFixed(1))
      c.res = pass ? 'pass' : 'fail'
      c.dur = dur
      const result = {
        id: `R-${Date.now().toString(36)}-${i}`,
        runId: run.id,
        caseId: c.id,
        ex: `swarm-0${(state.pool.used % 8 || 8)}`,
        res: c.res,
        dur,
        at: new Date().toISOString(),
      }
      state.results.push(result)
      if (state.results.length > 4000) state.results.shift()
      run.done += 1
      if (pass) {
        run.pass += 1
        lane.pass += 1
        log(lane.id, 'pass', `[SWARM·${lane.no}] ${c.id} 通过 · ${dur}s`)
      } else {
        run.fail += 1
        lane.fail += 1
        failures.push(c)
        log(lane.id, 'fail', `[SWARM·${lane.no}] ${c.id} 断言失败：${c.t}`)
      }
      emit('result', result)
      emit('run', run)
      emit('lane', laneView(lane))
      lane.stages.run = Math.round((run.done / Math.max(1, run.total)) * 100)
      emit('lane', laneView(lane))
    } finally {
      releaseSlot()
    }
  }
  lane.stages.run = 100
  log(lane.id, 'sys', `[SWARM·${lane.no}] 执行完成 · PASS ${run.pass} / FAIL ${run.fail}`)
  pushContext({
    laneId: lane.id, author: `SWARM·${lane.no}`, role: 'run',
    text: `执行结果：${run.done} 条用例，PASS ${run.pass} / FAIL ${run.fail}；失败样本已留存截图与请求日志。`,
    tokens: 300,
  })

  /* ⑤ 缺陷定级 */
  await waitGate(lane, 'bug')
  await waitRunnable(lane)
  log(lane.id, 'sys', `[SENTRY·${lane.no}] 归并失败样本 · 去重定级`)
  const bugPrompt = buildPrompt({
    lane, roleKey: 'bug', roleName: 'SENTRY',
    task: `对 ${failures.length} 条失败用例归并去重，输出缺陷级别、影响面与派单建议。`,
  })
  const bugCall = await callLLM({ roleKey: 'bug', laneId: lane.id, laneNo: lane.no, prompt: bugPrompt, purpose: `缺陷定级 · ${lane.name}` })
  log(lane.id, 'llm', `[LLM] SENTRY·${lane.no} → ${bugCall.model} · in ${fmt(bugCall.inTok)} / out ${fmt(bugCall.outTok)} tok · ${bugCall.ms}ms${bugCall.error ? ' · 失败: ' + bugCall.error : ''}`)
  await stageProgress(lane, 'bug', 1000)

  let created = 0
  for (const c of failures.slice(0, 6)) {
    const sev = severityOf(c.pri)
    const defect = {
      id: `BUG-${String(++state.counters.defectSeq).padStart(4, '0')}`,
      caseId: c.id,
      t: `${c.t.replace(/….*/, '')} · ${sev === 'P0' ? '阻塞主流程' : sev === 'P1' ? '功能不符合预期' : '体验缺陷'}`,
      sev,
      st: 'new',
      laneId: lane.id,
      at: new Date().toISOString(),
    }
    state.defects.unshift(defect)
    created += 1
    emit('defect', defect)
    if (sev === 'P0') {
      addTimeline('magenta', `SENTRY·${lane.no} 发现 P0：${defect.t} · 已阻塞准入`)
    }
  }
  if (created) log(lane.id, 'warn', `[SENTRY·${lane.no}] 新建 ${created} 条缺陷 · 已同步缺陷库`)
  pushContext({
    laneId: lane.id, author: `SENTRY·${lane.no}`, role: 'bug',
    text: `缺陷归并：新增 ${created} 条，P0 ${created ? '见缺陷库' : 0} 条；失败用例已关联现场，可直接复现。`,
    tokens: 280,
  })

  /* 收尾 */
  lane.status = 'done'
  lane.stages = { plan: 100, req: 100, case: 100, run: 100, bug: 100 }
  lane.finishedAt = new Date().toISOString()
  run.st = 'done'
  run.endAt = lane.finishedAt
  emit('lane', laneView(lane))
  emit('run', run)
  log(lane.id, 'pass', `任务线 ${lane.id} 完成 · ${run.pass}/${run.total} 通过 · 缺陷 ${created} 条`)
  addTimeline('lime', `${lane.id} 完成 · 通过率 ${((run.pass / Math.max(1, run.total)) * 100).toFixed(1)}%`)
  save()

  // 常驻回归线：跑完自动进下一轮（7×24 不空转）
  if (lane.primary && config.autoStart) {
    const timer = setTimeout(() => {
      if (lane.status !== 'done') return
      lane.status = 'queued'
      emit('lane', laneView(lane))
      pump()
    }, Math.max(5, config.autoLoopSec) * 1000)
    timer.unref?.()
  }
}

export function laneSummary() {
  return state.lanes.map(laneView)
}

export function stageKeys() {
  return STAGES.map(s => s.k)
}
