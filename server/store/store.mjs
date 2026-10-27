import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.mjs'
import { createInitialState } from '../domain/seed.mjs'

function migrate(s) {
  const fresh = createInitialState()
  for (const key of Object.keys(fresh)) {
    if (s[key] === undefined) s[key] = fresh[key]
  }
  // 重启后把「运行中」的任务线挂起，等待人工确认再续跑（避免重复消费执行机）
  for (const lane of s.lanes) {
    if (lane.status === 'running') {
      lane.status = 'paused'
      lane.note = '服务重启，任务线已挂起，可手动续跑'
    }
  }
  s.pool.used = 0
  // 旧版本数据缺 reqIds 时按需求归属推导
  for (const lane of s.lanes) {
    if (!lane.reqIds) lane.reqIds = s.requirements.filter(r => r.laneId === lane.id).map(r => r.id)
  }
  return s
}

function load() {
  try {
    if (fs.existsSync(config.dataFile)) {
      return migrate(JSON.parse(fs.readFileSync(config.dataFile, 'utf8')))
    }
  } catch (err) {
    console.warn('[store] 读取持久化数据失败，回退到种子数据：', err.message)
  }
  return createInitialState()
}

export const state = load()

let timer = null
export function save() {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    try {
      fs.mkdirSync(path.dirname(config.dataFile), { recursive: true })
      const tmp = `${config.dataFile}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
      fs.renameSync(tmp, config.dataFile)
    } catch (err) {
      console.warn('[store] 落盘失败：', err.message)
    }
  }, 250)
  timer.unref?.()
}

export function resetState() {
  const fresh = createInitialState()
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(state, fresh)
  save()
}

export function nextId(kind, pad = 4) {
  const map = { req: 'REQ', case: 'TC', defect: 'BUG', lane: 'L', run: 'RUN' }
  const prefix = map[kind]
  state.counters[`${kind}Seq`] = (state.counters[`${kind}Seq`] || 0) + 1
  const n = state.counters[`${kind}Seq`]
  if (kind === 'lane') return `${prefix}-${String(n).padStart(2, '0')}`
  if (kind === 'req') return `${prefix}-${300 + n}`
  return `${prefix}-${prefix === 'RUN' ? 2400 + n : n}`
}
