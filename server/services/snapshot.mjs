import { state } from '../store/store.mjs'
import { ROLES, STAGES } from '../domain/seed.mjs'
import { laneContext } from './context.mjs'
import { resolveModel, llmMode, sanitizeProvider } from './llm.mjs'

const REQ_STATUS_LABEL = { draft: '待确认', reviewing: '评审中', confirmed: '已确认' }

export function requirementView(r) {
  const cases = state.cases.filter(c => c.reqId === r.id)
  const passed = cases.filter(c => c.res === 'pass').length
  return {
    ...r,
    statusLabel: REQ_STATUS_LABEL[r.st] || r.st,
    caseCount: cases.length,
    passed,
    covPct: r.points ? Math.min(100, Math.round((r.covered / r.points) * 100)) : 0,
  }
}

export function buildKpi() {
  const executed = state.results.length
  const passed = state.results.filter(r => r.res === 'pass').length
  const openDefects = state.defects.filter(d => d.st !== 'closed')
  return {
    cases: state.cases.length,
    executed,
    passRate: executed ? Number(((passed / executed) * 100).toFixed(1)) : 0,
    defects: state.defects.length,
    p0: openDefects.filter(d => d.sev === 'P0').length,
    p1: openDefects.filter(d => d.sev === 'P1').length,
    uptimeSec: Math.floor((Date.now() - new Date(state.meta.startedAt).getTime()) / 1000),
  }
}

export function laneView(lane) {
  const pct = Math.round(Object.values(lane.stages).reduce((a, b) => a + b, 0) / STAGES.length)
  const run = state.runs.find(r => r.laneId === lane.id && r.st === 'running')
  return {
    ...lane,
    pct,
    runningRun: run ? { id: run.id, total: run.total, done: run.done, pass: run.pass, fail: run.fail } : null,
    slotsUsed: lane.status === 'running' ? 1 : 0,
  }
}

export function agentView() {
  const primary = state.lanes.find(l => l.primary) || state.lanes[0]
  return ROLES.map(role => {
    const target = resolveModel(role.k, primary?.id)
    const lastCall = state.models.calls.find(c => c.roleKey === role.k)
    const lane = primary
    return {
      ...role,
      gate: lane ? lane.gates[role.k] !== false : true,
      inst: lane?.no || 1,
      model: target.model,
      provider: target.provider.name,
      task: lastCall?.purpose || role.task,
      tokens: state.models.calls.filter(c => c.roleKey === role.k).reduce((a, c) => a + c.inTok + c.outTok, 0),
    }
  })
}

export function stagesView() {
  const primary = state.lanes.find(l => l.primary) || state.lanes[0]
  return STAGES.map((s, i) => {
    const pct = primary?.stages[s.k] ?? 0
    return {
      ...s,
      i: i + 1,
      pct,
      gate: primary ? primary.gates[s.k] !== false : true,
      status: pct >= 100 ? 'done' : pct > 0 ? 'active' : 'idle',
    }
  })
}

export function buildSnapshot() {
  const lanes = state.lanes.map(laneView)
  const primary = lanes.find(l => l.primary) || lanes[0] || null
  return {
    meta: { ...state.meta, llmMode: llmMode(), llmBaseUrlHint: llmMode() === 'live' ? 'env' : null },
    kpi: buildKpi(),
    scheduler: state.scheduler,
    pool: { ...state.pool, used: state.pool.used },
    executors: Array.from({ length: state.pool.cap }, (_, i) => ({
      id: `swarm-0${i + 1}`,
      busy: i < state.pool.used,
      job: i < state.pool.used ? '占机执行中' : '待命',
    })),
    stages: stagesView(),
    agents: agentView(),
    primaryLaneId: primary?.id || null,
    lanes,
    requirements: state.requirements.map(requirementView).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    cases: state.cases.slice(-200).reverse(),
    runs: state.runs.slice(0, 12),
    results: state.results.slice(-60).reverse(),
    defects: state.defects.slice().sort((a, b) => b.at.localeCompare(a.at)),
    timeline: state.timeline.slice(-24).reverse(),
    logs: state.logs.slice(-120).reverse(),
    models: {
      providers: state.models.providers.map(sanitizeProvider),
      bindings: state.models.bindings,
      overrides: state.models.overrides,
      calls: state.models.calls.slice(0, 40),
    },
    contexts: Object.fromEntries(state.lanes.map(l => [l.id, laneContext(l.id)])),
  }
}
