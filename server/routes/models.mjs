import { ok, fail, readBody } from '../lib/http.mjs'
import { state, save } from '../store/store.mjs'
import { emit } from '../services/events.mjs'
import { laneContext, buildPrompt } from '../services/context.mjs'
import { callLLM, endpointFor, rawCompletion, llmMode, sanitizeProvider } from '../services/llm.mjs'
import { ROLES } from '../domain/seed.mjs'

const maskKey = key => (key ? `${key.slice(0, 5)}••••••${key.slice(-4)}` : '未配置')

export function register(router) {
  router.get('/api/models', ({ res }) => {
    ok(res, {
      llmMode: llmMode(),
      providers: state.models.providers.map(sanitizeProvider),
      bindings: state.models.bindings,
      overrides: state.models.overrides,
      calls: state.models.calls.slice(0, 30),
      roles: ROLES,
      lanes: state.lanes.map(l => ({ id: l.id, no: l.no, name: l.name })),
      contexts: Object.fromEntries(state.lanes.map(l => [l.id, laneContext(l.id)])),
    })
  })

  // 供应商探活：优先用卡片里配置的 Key，其次全局环境变量；真实打一次极小的 completion
  router.post('/api/models/providers/:id/test', async ({ res, params }) => {
    const p = state.models.providers.find(x => x.id === params.id)
    if (!p) return fail(res, 404, '供应商不存在')
    const ep = endpointFor(p)
    if (!ep) return fail(res, 400, '请先在该供应商卡片粘贴 API Key 并保存（或设置环境变量 LLM_BASE_URL / LLM_API_KEY）')
    const t0 = Date.now()
    try {
      await rawCompletion({
        baseUrl: ep.baseUrl,
        apiKey: ep.apiKey,
        model: p.models[0],
        prompt: 'ping',
      })
    } catch (err) {
      return fail(res, 502, `探活失败：${err.message}`)
    }
    p.latency = Math.max(30, Math.round(Date.now() - t0))
    p.lastTestAt = new Date().toISOString()
    emit('provider', sanitizeProvider(p))
    save()
    ok(res, { provider: sanitizeProvider(p), latency: p.latency, mode: 'live', auth: ep.source })
  })

  // 供应商配置：启用/禁用、API Key（明文仅存服务端 state.json，接口永远返回掩码）、接口地址
  router.patch('/api/models/providers/:id', async ({ req, res, params }) => {
    const body = await readBody(req)
    const p = state.models.providers.find(x => x.id === params.id)
    if (!p) return fail(res, 404, '供应商不存在')
    if (typeof body.enabled === 'boolean') p.enabled = body.enabled
    if (typeof body.endpoint === 'string' && /^https?:\/\//.test(body.endpoint.trim())) {
      p.endpoint = body.endpoint.trim().replace(/\/+$/, '')
    }
    if (typeof body.keyMask === 'string' && body.keyMask.trim()) p.keyMask = body.keyMask.trim().slice(0, 40)
    if (body.apiKey !== undefined) {
      const key = String(body.apiKey).trim()
      if (key) {
        p.apiKey = key.slice(0, 200)
        p.keyMask = maskKey(p.apiKey)
      } else {
        delete p.apiKey
        p.keyMask = '未配置'
      }
    }
    emit('provider', sanitizeProvider(p))
    save()
    ok(res, { provider: sanitizeProvider(p) })
  })

  // 角色级绑定：机器人 → 模型
  router.patch('/api/models/bindings/:role', async ({ req, res, params }) => {
    const body = await readBody(req)
    const binding = state.models.bindings[params.role]
    if (!binding) return fail(res, 404, '角色不存在')
    const providerId = body.providerId || binding.providerId
    const provider = state.models.providers.find(p => p.id === providerId)
    if (!provider) return fail(res, 400, '供应商不存在')
    if (body.providerId) binding.providerId = providerId
    if (body.model) {
      if (!provider.models.includes(body.model) && !body.allowCustom) {
        return fail(res, 400, `模型 ${body.model} 不属于 ${provider.name}`)
      }
      binding.model = body.model
    } else if (body.providerId && !provider.models.includes(binding.model)) {
      binding.model = provider.models[0]
    }
    if (body.temperature !== undefined) {
      const t = Number(body.temperature)
      if (!Number.isFinite(t) || t < 0 || t > 1.5) return fail(res, 400, 'temperature 需在 0~1.5')
      binding.temperature = t
    }
    if (body.budget !== undefined) {
      const b = Number(body.budget)
      if (!Number.isFinite(b) || b < 4000) return fail(res, 400, '上下文预算过小')
      binding.budget = Math.round(b)
    }
    emit('bindings', state.models.bindings)
    save()
    ok(res, { role: params.role, binding })
  })

  // 实例级覆盖：L-02 的 WEAVE 可以用另一家的模型
  router.put('/api/models/overrides/:laneId/:role', async ({ req, res, params }) => {
    const body = await readBody(req)
    if (!state.lanes.find(l => l.id === params.laneId)) return fail(res, 404, '任务线不存在')
    if (!state.models.bindings[params.role]) return fail(res, 404, '角色不存在')
    const provider = state.models.providers.find(p => p.id === body.providerId)
    if (!provider) return fail(res, 400, '供应商不存在')
    const model = body.model || provider.models[0]
    state.models.overrides[`${params.laneId}|${params.role}`] = {
      providerId: provider.id,
      model,
      temperature: Number(body.temperature ?? state.models.bindings[params.role].temperature),
      budget: state.models.bindings[params.role].budget,
    }
    emit('bindings', state.models.bindings)
    save()
    ok(res, { key: `${params.laneId}|${params.role}`, override: state.models.overrides[`${params.laneId}|${params.role}`] })
  })

  router.del('/api/models/overrides/:laneId/:role', ({ res, params }) => {
    const key = `${params.laneId}|${params.role}`
    const existed = Boolean(state.models.overrides[key])
    delete state.models.overrides[key]
    emit('bindings', state.models.bindings)
    save()
    ok(res, { removed: existed, key })
  })

  router.get('/api/models/context/:laneId', ({ res, params }) => {
    if (!state.lanes.find(l => l.id === params.laneId)) return fail(res, 404, '任务线不存在')
    ok(res, laneContext(params.laneId))
  })

  // 实际发给模型的 Prompt（含共享上下文与私有记忆）
  router.get('/api/models/prompt/:laneId/:role', ({ res, params }) => {
    const lane = state.lanes.find(l => l.id === params.laneId)
    if (!lane) return fail(res, 404, '任务线不存在')
    const role = ROLES.find(r => r.k === params.role)
    if (!role) return fail(res, 404, '角色不存在')
    const prompt = buildPrompt({
      lane, roleKey: role.k, roleName: role.n,
      task: `按「${role.role}」职责推进任务线 ${lane.id}（${lane.name}）的当前环节。`,
    })
    const ctx = laneContext(lane.id)
    ok(res, { laneId: lane.id, role: role.k, roleName: role.n, prompt, tokens: ctx.tokens, budget: ctx.budget, items: ctx.items })
  })
}
