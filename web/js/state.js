import { api } from './api.js'

export const store = { snapshot: null, connection: 'connecting' }
const listeners = new Set()

export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(type) {
  for (const fn of listeners) fn(type)
}

export function setSnapshot(snap) {
  store.snapshot = snap
  notify('snapshot')
}

export async function refresh() {
  const snap = await api.snapshot()
  setSnapshot(snap)
  return snap
}

function upsert(list, item, key = 'id') {
  const i = list.findIndex(x => x[key] === item[key])
  if (i >= 0) list[i] = { ...list[i], ...item }
  else list.unshift(item)
}

function bumpResult(kpi, res) {
  const passed = Math.round((kpi.passRate / 100) * kpi.executed)
  kpi.executed += 1
  const nextPassed = passed + (res === 'pass' ? 1 : 0)
  kpi.passRate = Number(((nextPassed / kpi.executed) * 100).toFixed(1))
}

/** 把 SSE 事件合并进快照，避免每个事件都重新拉全量 */
export function applyEvent(type, data) {
  const s = store.snapshot
  if (!s) return

  switch (type) {
    case 'lane': {
      upsert(s.lanes, data)
      const primary = s.lanes.find(l => l.id === s.primaryLaneId) || s.lanes.find(l => l.primary)
      if (primary) {
        s.stages = s.stages.map(st => ({
          ...st,
          pct: primary.stages?.[st.k] ?? 0,
          gate: primary.gates?.[st.k] !== false,
          status: (primary.stages?.[st.k] ?? 0) >= 100 ? 'done' : (primary.stages?.[st.k] ?? 0) > 0 ? 'active' : 'idle',
        }))
        s.agents = s.agents.map(a => ({
          ...a,
          gate: primary.gates?.[a.k] !== false,
          inst: primary.no,
        }))
      }
      break
    }
    case 'log': {
      s.logs.unshift(data)
      if (s.logs.length > 140) s.logs.pop()
      break
    }
    case 'result': {
      s.results.unshift(data)
      if (s.results.length > 80) s.results.pop()
      bumpResult(s.kpi, data.res)
      const c = s.cases.find(x => x.id === data.caseId)
      if (c) { c.res = data.res; c.dur = data.dur }
      break
    }
    case 'run': {
      const i = s.runs.findIndex(r => r.id === data.id)
      if (i >= 0) s.runs[i] = { ...s.runs[i], ...data }
      else s.runs.unshift(data)
      break
    }
    case 'defect': {
      upsert(s.defects, data)
      if (!s.defects.some(d => d.id === data.id)) break
      if (!data.__counted) {
        s.kpi.defects += 1
        if (data.sev === 'P0') s.kpi.p0 += 1
        if (data.sev === 'P1') s.kpi.p1 += 1
        data.__counted = true
      }
      break
    }
    case 'timeline': {
      s.timeline.unshift(data)
      if (s.timeline.length > 30) s.timeline.pop()
      break
    }
    case 'context': {
      const ctx = s.contexts?.[data.laneId]
      if (ctx && data.total !== undefined) ctx.tokens = data.total
      break
    }
    case 'llm': {
      s.models.calls.unshift(data)
      if (s.models.calls.length > 40) s.models.calls.pop()
      const provider = s.models.providers.find(p => p.id === data.providerId)
      if (provider) provider.calls += 1
      break
    }
    case 'pool': {
      s.pool = { ...s.pool, ...data }
      s.executors = s.executors.map((e, i) => ({ ...e, busy: i < s.pool.used, job: i < s.pool.used ? '占机执行中' : '待命' }))
      break
    }
    case 'scheduler': {
      s.scheduler = { ...s.scheduler, ...data }
      break
    }
    case 'requirement': {
      upsert(s.requirements, data)
      break
    }
    case 'requirements': {
      for (const r of data.created || []) upsert(s.requirements, r)
      break
    }
    case 'case': {
      if (data.deleted) {
        const i = s.cases.findIndex(c => c.id === data.id)
        if (i >= 0) { s.cases.splice(i, 1); s.kpi.cases -= 1 }
      } else {
        const existed = s.cases.some(c => c.id === data.id)
        upsert(s.cases, data)
        if (!existed) s.kpi.cases += 1
      }
      break
    }
    case 'cases': {
      // 新用例批量生成，等下次快照对齐即可（这里是轻量提示）
      break
    }
    case 'bindings': {
      s.models.bindings = data
      break
    }
    case 'provider': {
      upsert(s.models.providers, data)
      break
    }
    default:
      break
  }
  notify(type)
}

/** 派生：当前主任务线的阶段进度（供场景与流水线面板使用） */
export function stageRows(s = store.snapshot) {
  if (!s) return []
  const lane = s.lanes.find(l => l.id === s.primaryLaneId) || s.lanes.find(l => l.primary) || s.lanes[0]
  return s.stages.map(st => ({
    ...st,
    pct: lane?.stages?.[st.k] ?? st.pct ?? 0,
    gate: lane?.gates?.[st.k] !== false,
    laneId: lane?.id,
    inst: lane?.no || 1,
  }))
}

export function activeLanes(s = store.snapshot) {
  if (!s) return []
  return s.lanes.filter(l => l.status === 'running' || l.status === 'queued')
}
