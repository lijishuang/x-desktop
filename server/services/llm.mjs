import { config, llmReady } from '../config.mjs'
import { state, save } from '../store/store.mjs'
import { emit } from './events.mjs'

const estimateTokens = text => Math.max(24, Math.round(String(text).length / 2.6))

/** 取某个角色（可被任务线实例覆盖）的实际模型服务 */
export function resolveModel(roleKey, laneId) {
  const override = laneId ? state.models.overrides[`${laneId}|${roleKey}`] : null
  const binding = override || state.models.bindings[roleKey]
  const provider = state.models.providers.find(p => p.id === binding.providerId) || state.models.providers[0]
  return {
    provider,
    providerId: provider.id,
    model: binding.model,
    temperature: binding.temperature,
    budget: binding.budget,
    overridden: Boolean(override),
  }
}

/**
 * 凭据优先级：供应商卡片里配置的 API Key（走其自带 endpoint）→ 全局环境变量。
 * 返回 null 表示完全未配置。
 */
export function endpointFor(provider) {
  if (provider?.apiKey && provider?.endpoint) {
    return { baseUrl: String(provider.endpoint).replace(/\/+$/, ''), apiKey: provider.apiKey, source: 'provider' }
  }
  if (llmReady()) {
    return { baseUrl: config.llm.baseUrl, apiKey: config.llm.apiKey, source: 'env' }
  }
  return null
}

/** 当前整体模式：任一供应商配了 Key 或环境变量已配置即 live */
export function llmMode() {
  return llmReady() || state.models.providers.some(p => p.apiKey) ? 'live' : 'unset'
}

/** 对外展示用的供应商脱敏副本（抹掉明文 Key） */
export const sanitizeProvider = p => {
  const { apiKey, ...rest } = p
  return rest
}

/** 底层 OpenAI 兼容补全调用，失败抛错 */
export async function rawCompletion({ baseUrl, apiKey, model, temperature = 0.2, system, prompt, timeoutMs = config.llm.timeoutMs }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: system || '你是 X-DeskTop 测试工厂的测试角色，只输出结论与结构化要点。' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${body ? ` · ${body.slice(0, 160)}` : ''}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('模型返回空内容')
  return text
}

/**
 * 统一的模型调用入口 —— 只走真实模型（OpenAI 兼容协议）。
 * 凭据来源：角色绑定供应商卡片里的 Key → 全局环境变量，都没有则记录错误返回。
 * 不伪造任何内容：失败时调用记录带 error 字段，由流水线写入日志显式暴露。
 */
export async function callLLM({ roleKey, laneId, laneNo, prompt, purpose }) {
  const target = resolveModel(roleKey, laneId)
  const ep = endpointFor(target.provider)
  const inTok = estimateTokens(prompt)
  const t0 = Date.now()
  let text = ''
  let error = null
  let auth = null

  if (!ep) {
    error = '未配置 API Key：请在模型页该供应商卡片粘贴 Key（或设置环境变量 LLM_BASE_URL / LLM_API_KEY）'
  } else {
    auth = ep.source
    try {
      const model = ep.source === 'env' && config.llm.model ? config.llm.model : target.model
      text = await rawCompletion({
        baseUrl: ep.baseUrl,
        apiKey: ep.apiKey,
        model,
        temperature: target.temperature,
        system: `你是 X-DeskTop 测试工厂的 ${roleKey} 角色，只输出结论与结构化要点。`,
        prompt,
      })
    } catch (err) {
      error = err.message
    }
  }

  const outTok = text ? estimateTokens(text) : 0
  const ms = Date.now() - t0
  const call = {
    id: `C-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    laneId,
    laneNo,
    roleKey,
    providerId: target.providerId,
    model: target.model,
    purpose,
    inTok,
    outTok,
    ms,
    auth,
    error,
  }
  state.models.calls.unshift(call)
  if (state.models.calls.length > 120) state.models.calls.pop()
  const provider = state.models.providers.find(p => p.id === target.providerId)
  if (provider) provider.calls += 1
  save()
  emit('llm', call)
  return call
}
