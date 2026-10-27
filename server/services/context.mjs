import { state, save } from '../store/store.mjs'
import { emit } from './events.mjs'
import { config } from '../config.mjs'

const estimateTokens = text => Math.max(24, Math.round(String(text).length / 2.6))

export function laneContext(laneId) {
  const items = state.contextItems.filter(i => i.laneId === laneId)
  const tokens = items.reduce((a, i) => a + i.tokens, 0)
  const budget = state.models.bindings.case?.budget || 64000
  return {
    laneId,
    items,
    tokens,
    budget,
    compacted: items.filter(i => i.kind === 'summary').length,
    ratio: budget ? tokens / budget : 0,
  }
}

/** 压缩：超过预算 55% 时，把除最近 3 条外的条目折成一条摘要（字段不丢） */
function compact(laneId) {
  const ctx = laneContext(laneId)
  if (ctx.ratio < config.contextCompactRatio || ctx.items.length <= 4) return
  const keep = ctx.items.slice(-3)
  const old = ctx.items.slice(0, -3)
  const summary = {
    id: `CTX-S-${Date.now().toString(36)}`,
    laneId,
    kind: 'summary',
    author: 'CTX-BUS',
    role: 'bus',
    model: '-',
    text: `已压缩 ${old.length} 条历史产物：${old.map(i => i.text.slice(0, 26)).join(' / ')}`,
    tokens: Math.max(120, Math.round(old.reduce((a, i) => a + i.tokens, 0) * 0.22)),
    at: new Date().toISOString(),
  }
  state.contextItems = state.contextItems.filter(i => !old.includes(i))
  state.contextItems.push(summary, ...keep)
  emit('context', { laneId, compacted: true, total: laneContext(laneId).tokens })
}

/**
 * 写入共享上下文总线。
 * 同一条任务线下、不同角色的实例读写同一份上下文 —— 换模型不换上下文。
 */
export function pushContext({ laneId, author, role, text, tokens }) {
  const item = {
    id: `CTX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    laneId,
    kind: 'note',
    author,
    role,
    model: state.models.overrides[`${laneId}|${role}`]?.model || state.models.bindings[role]?.model || '-',
    text,
    tokens: tokens ?? estimateTokens(text),
    at: new Date().toISOString(),
  }
  state.contextItems.push(item)
  compact(laneId)
  save()
  emit('context', { laneId, item, total: laneContext(laneId).tokens })
  return item
}

/** 组装真正发给模型的消息：SYSTEM / MODEL / SHARED CONTEXT / PRIVATE MEMORY / TASK / CONTRACT */
export function buildPrompt({ lane, roleKey, roleName, task }) {
  const ctx = laneContext(lane.id)
  const binding = state.models.overrides[`${lane.id}|${roleKey}`] || state.models.bindings[roleKey]
  const provider = state.models.providers.find(p => p.id === binding.providerId)
  const items = ctx.items.map((i, n) => `${n + 1}. [${i.author} · ${i.model} · ${i.tokens} tok] ${i.text}`).join('\n')
  return [
    '# SYSTEM',
    `你是 ${roleName}（${lane.id} 的 ${roleName}·${lane.no} 实例），负责「${roleName}」环节。`,
    '你必须只基于共享上下文与私有记忆作答；不确定的信息标为待确认，不要编造。',
    '',
    '# MODEL',
    `provider: ${provider?.name || binding.providerId} (${provider?.endpoint || '-'})`,
    `model: ${binding.model} · temperature: ${binding.temperature} · budget: ${binding.budget} tok`,
    '',
    '# SHARED CONTEXT',
    items || '（暂无，你是本线第一个写入者）',
    '',
    '# PRIVATE MEMORY',
    `- 本实例此前只服务任务线 ${lane.id}（${lane.name}）`,
    `- 记住：本线需求 ${lane.req ?? 0} 条 / 用例 ${lane.cases ?? 0} 条 / 失败 ${lane.fail ?? 0} 条`,
    '',
    '# TASK',
    task,
    '',
    '# OUTPUT CONTRACT',
    '- 结论先行，随后给结构化要点与风险；',
    '- 产物必须能被下游角色直接消费（清单/矩阵/断言）；',
    '- 不超过 400 字。',
  ].join('\n')
}
