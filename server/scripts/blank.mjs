import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.mjs'
import { PROVIDERS, BINDINGS } from '../domain/seed.mjs'

/**
 * 清空全部业务数据（需求/用例/任务线/运行/结果/缺陷/上下文/日志/时间线），
 * 并把模型页的演示统计归零（调用次数/延迟/密钥掩码），得到可直接试用的空白状态。
 * 与 reset.mjs 的区别：reset 会重建演示种子，本脚本产出零数据状态。
 */
const providers = PROVIDERS.map(p => ({
  ...p,
  calls: 0,
  latency: 0,
  keyMask: '未配置',
}))
const state = {
  meta: { version: '0.1.0', startedAt: new Date().toISOString(), seededAt: new Date().toISOString() },
  scheduler: { conc: 2 },
  pool: { cap: Number(process.env.EXEC_POOL_CAP || 8), used: 0 },
  counters: { reqSeq: 100, caseSeq: 1000, defectSeq: 0, laneSeq: 0, runSeq: 2400 },
  requirements: [],
  cases: [],
  lanes: [],
  runs: [],
  results: [],
  defects: [],
  contextItems: [],
  models: { providers, bindings: BINDINGS, overrides: {}, calls: [] },
  logs: [],
  timeline: [],
  importBatches: [],
}

fs.mkdirSync(path.dirname(config.dataFile), { recursive: true })
fs.writeFileSync(config.dataFile, JSON.stringify(state, null, 2))
console.log(`[blank] 已写入空白状态 → ${config.dataFile}`)
console.log('[blank] 需求/用例/任务线/运行/缺陷/日志 已清零，模型调用统计已归零，绑定配置保留')
