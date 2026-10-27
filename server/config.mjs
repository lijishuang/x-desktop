import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '..')

/** 运行期配置：全部来自环境变量 */
export const config = {
  port: Number(process.env.PORT || 8790),
  host: process.env.HOST || '127.0.0.1',

  // 数据落盘位置（JSON 单文件，便于离线与迁移）
  dataFile: process.env.DATA_FILE || path.join(ROOT, 'data', 'state.json'),
  webRoot: path.join(ROOT, 'web'),

  // 真实 LLM（OpenAI 兼容协议）。必须配置后流水线才能调用模型。
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
  },

  // 流水线节奏（毫秒），调大可更清楚地观察各阶段推进
  pace: {
    stageStepMs: Number(process.env.PACE_STAGE_STEP_MS || 260),
    caseExecMs: Number(process.env.PACE_CASE_EXEC_MS || 170),
  },

  poolCap: Number(process.env.EXEC_POOL_CAP || 8),
  autoStart: process.env.AUTO_START === '1',     // 仅显式开启时自动跑常驻线（试用建议从导入需求开始）
  autoLoopSec: Number(process.env.AUTO_LOOP_SEC || 18), // 常驻线跑完后的下一轮间隔
  contextCompactRatio: Number(process.env.CTX_COMPACT_RATIO || 0.55),
}

export const llmReady = () => Boolean(config.llm.apiKey && config.llm.baseUrl)
