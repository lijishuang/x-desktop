import { api } from '../api.js'
import { $, $$, esc, fmt, toast, delegate, openModal, closeModal, empty } from '../ui.js'

const ROLE_META = {
  plan: { n: 'KEEL', role: '测试方案' },
  req: { n: 'ORACLE', role: '需求分析' },
  case: { n: 'WEAVE', role: '用例设计' },
  run: { n: 'SWARM', role: '自动执行' },
  bug: { n: 'SENTRY', role: '缺陷定级' },
}
const ui = { laneId: null, role: 'case' }

function providerCards(s) {
  return s.models.providers.map(p => {
    const hasKey = Boolean(p.keyMask && p.keyMask !== '未配置')
    return `
    <div class="prov ${p.enabled ? '' : 'off'}">
      <div class="prov-h">
        <span class="nm">${esc(p.name)}</span>
        <span class="badge ${p.enabled ? 'b-pass' : 'b-off'}">${p.enabled ? '已接入' : '未启用'}</span>
      </div>
      <div class="ep">${esc(p.endpoint)}</div>
      <div class="keyrow" style="display:flex;gap:6px;margin-top:8px">
        <input class="inp" type="password" data-key="${esc(p.id)}"
          placeholder="${hasKey ? '已配置 · 输入新 Key 可更换' : '粘贴 API Key'}" autocomplete="off" style="flex:1;min-width:0" />
        <button class="btn sm" data-keysave="${esc(p.id)}">保存</button>
        ${hasKey ? `<button class="btn sm ghost" data-keyclear="${esc(p.id)}" title="清除已保存的 Key">清除</button>` : ''}
      </div>
      <div class="key">${esc(p.keyMask)} · 窗口 ${fmt(p.window)}</div>
      <div class="models">${p.models.map(m => `<span>${esc(m)}</span>`).join('')}</div>
      <div class="prov-f">
        <span>今日 ${fmt(p.calls)} 次 · ¥${p.priceIn}/${p.priceOut} 每百万</span>
        <span style="display:flex;gap:6px;align-items:center">
          <span style="color:var(--lime)">${p.latency || '--'}ms</span>
          <button class="btn sm ghost" data-test="${esc(p.id)}">测试连接</button>
        </span>
      </div>
    </div>`
  }).join('')
}

function lookupModel(s, role) {
  const ovr = s.models.overrides[`${ui.laneId}|${role}`]
  const b = ovr || s.models.bindings[role]
  return { binding: b, overridden: Boolean(ovr) }
}

function bindingRows(s) {
  return Object.entries(ROLE_META).map(([key, meta]) => {
    const { binding, overridden } = lookupModel(s, key)
    const provider = s.models.providers.find(p => p.id === binding.providerId) || s.models.providers[0]
    const calls = s.models.calls.filter(c => c.roleKey === key).length
    return `
      <div class="bind-row">
        <div class="rn">${meta.n}<i>${meta.role}</i></div>
        <select class="sel" data-prov="${key}">
          ${s.models.providers.map(p => `<option value="${esc(p.id)}" ${p.id === binding.providerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <select class="sel" data-model="${key}" style="flex:1;min-width:0">
            ${provider.models.map(m => `<option value="${esc(m)}" ${m === binding.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
          ${overridden ? '<span class="badge b-p1">实例覆盖</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input class="inp" data-temp="${key}" value="${binding.temperature}" style="width:52px;text-align:center" />
          <span style="font-family:var(--mono);font-size:9px;color:var(--dim)">T</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">
          <span style="font-family:var(--mono);font-size:9.5px;color:var(--dim)">${fmt(binding.budget / 1000)}k · ${calls} 次</span>
          <button class="btn sm ghost" data-ovr="${key}">覆盖</button>
        </div>
      </div>`
  }).join('')
}

function contextHtml(s) {
  const laneId = ui.laneId || s.lanes[0]?.id
  const ctx = s.contexts?.[laneId]
  if (!ctx) return empty('该任务线还没有上下文')
  const items = ctx.items || []
  const ratio = Math.min(100, (ctx.tokens / Math.max(1, ctx.budget)) * 100)
  const legend = Object.entries(ROLE_META).map(([k, meta]) => {
    const { binding } = lookupModel(s, k)
    const used = items.filter(i => i.role === k).reduce((a, i) => a + i.tokens, 0)
    return `<span><b>${meta.n}</b> ${esc(binding.model)} · ${fmt(used)} tok</span>`
  }).join('')

  const list = items.slice().reverse().map(i => `
    <div class="ctx-item ${i.kind === 'summary' ? 'summary' : ''}">
      <div class="who"><b>${esc(i.author)}</b><span class="md">${esc(i.model)}</span><span style="margin-left:auto">${fmt(i.tokens)} tok</span></div>
      <div class="tx">${esc(i.text)}</div>
    </div>`).join('')

  return `
    <div class="ctx-bar">
      <select class="sel" id="ctxLane">
        ${s.lanes.map(l => `<option value="${esc(l.id)}" ${l.id === laneId ? 'selected' : ''}>${esc(l.id)} · ${esc(l.name)}</option>`).join('')}
      </select>
      <span class="bar"><i style="width:${ratio}%"></i></span>
      <span style="font-family:var(--mono);font-size:10px;color:#a9c8e2">${fmt(ctx.tokens)} / ${fmt(ctx.budget)} tok</span>
      <select class="sel" id="ctxRole">
        ${Object.entries(ROLE_META).map(([k, m]) => `<option value="${k}" ${k === ui.role ? 'selected' : ''}>${m.n}</option>`).join('')}
      </select>
      <button class="btn" id="ctxPrompt">查看实际 Prompt</button>
    </div>
    <div class="ctx-list">${items.length ? list : empty('该任务线还没有写入上下文')}</div>
    <div class="legend">${legend}</div>`
}

export function render(root, s) {
  if (!ui.laneId || !s.lanes.some(l => l.id === ui.laneId)) ui.laneId = s.lanes[0]?.id || null

  if (!root.dataset.built) {
    root.innerHTML = `
      <section class="view">
        <div class="stack">
          <div class="box">
            <div class="box-h"><div class="h">LLM PROVIDERS</div><div class="n" id="provMeta">--</div></div>
            <div class="box-pad"><div class="prov-grid" id="provGrid"></div></div>
            <div class="box-pad" style="border-top:1px solid var(--line);font-size:11px;color:var(--dim);line-height:1.7">
              在上方供应商卡片直接粘贴 <b>API Key</b> 并保存即可调用（Key 明文只保存在服务端 <span style="font-family:var(--mono)">data/state.json</span>，页面与接口只显示掩码）。
              也可以用环境变量 <span style="font-family:var(--mono)">LLM_BASE_URL / LLM_API_KEY</span> 全局兜底；卡片 Key 优先。配置后点「测试连接」验证。
            </div>
          </div>

          <div class="box">
            <div class="box-h"><div class="h">ROLE BINDING</div><div class="n">机器人 → 模型</div></div>
            <div class="bind-row bind-head" style="padding-top:10px;padding-bottom:6px">
              <span>角色</span><span>供应商</span><span>模型</span><span>温度</span><span style="text-align:right">预算 / 调用</span>
            </div>
            <div id="bindRows"></div>
            <div class="box-pad" style="border-top:1px solid var(--line);font-size:11px;color:var(--dim);line-height:1.7">
              点「覆盖」可让某条任务线的该角色实例改用另一个模型——同角色不同实例可以有不同模型，但读的是同一份上下文。
            </div>
          </div>

          <div class="box">
            <div class="box-h"><div class="h">CONTEXT BUS</div><div class="n">跨模型共享上下文 · 按任务线隔离</div></div>
            <div id="ctxBody"></div>
          </div>
        </div>
      </section>`
    root.dataset.built = '1'
    bind(root)
  }

  $('#provGrid', root).innerHTML = providerCards(s)
  $('#provMeta', root).innerHTML = `${s.models.providers.filter(p => p.enabled).length} 家已接入 · ${s.meta.llmMode === 'live' ? '真实模型在线' : '模型未配置'}`
  $('#bindRows', root).innerHTML = bindingRows(s)
  $('#ctxBody', root).innerHTML = contextHtml(s)
}

function bind(root) {
  delegate(root, 'click', '[data-keysave]', async (e, node) => {
    const id = node.dataset.keysave
    const input = $(`[data-key="${id}"]`, root)
    const key = (input?.value || '').trim()
    if (!key) return toast('请先粘贴 API Key（留空保存=清除）')
    node.disabled = true
    try {
      await api.setProvider(id, { apiKey: key })
      input.value = ''
      toast('API Key 已保存（仅显示掩码）')
    } catch (err) { toast(err.message) }
    finally { node.disabled = false }
  })

  delegate(root, 'click', '[data-keyclear]', async (e, node) => {
    const id = node.dataset.keyclear
    node.disabled = true
    try {
      await api.setProvider(id, { apiKey: '' })
      toast('已清除该供应商的 API Key')
    } catch (err) { toast(err.message) }
    finally { node.disabled = false }
  })

  delegate(root, 'click', '[data-test]', async (e, node) => {
    node.disabled = true
    node.textContent = '测试中…'
    try {
      const res = await api.testProvider(node.dataset.test)
      toast(`${res.provider.name} 握手成功 · ${res.latency}ms`)
    } catch (err) {
      toast(err.message)
    } finally {
      node.disabled = false
      node.textContent = '测试连接'
    }
  })

  delegate(root, 'change', '[data-prov]', async (e, node) => {
    const role = node.dataset.prov
    const provider = window.__state.models.providers.find(p => p.id === node.value)
    try {
      await api.setBinding(role, { providerId: node.value, model: provider.models[0] })
      toast(`${ROLE_META[role].n} 已切到 ${provider.name} · ${provider.models[0]}`)
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'change', '[data-model]', async (e, node) => {
    try {
      await api.setBinding(node.dataset.model, { model: node.value })
      toast(`${ROLE_META[node.dataset.model].n} → ${node.value}`)
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'change', '[data-temp]', async (e, node) => {
    try {
      await api.setBinding(node.dataset.temp, { temperature: Number(node.value) })
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'change', '#ctxLane', (e, node) => {
    ui.laneId = node.value
    render(root, window.__state)
  })

  delegate(root, 'change', '#ctxRole', (e, node) => {
    ui.role = node.value
  })

  delegate(root, 'click', '#ctxPrompt', async () => {
    const laneId = ui.laneId || window.__state.lanes[0]?.id
    if (!laneId) return toast('还没有任务线')
    const role = $('#ctxRole', root)?.value || ui.role
    try {
      const res = await api.prompt(laneId, role)
      openModal(`实际 Prompt · ${laneId} · ${ROLE_META[role].n}`, `
        <pre>${esc(res.prompt)}</pre>
        <div class="modal-note">
          共享上下文 ${fmt(res.tokens)} tok / 预算 ${fmt(res.budget)} tok ·
          这条 Prompt 会随实例走，换模型时上下文不变，只有 SYSTEM 与模型参数变化。
        </div>`)
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '[data-ovr]', (e, node) => {
    const role = node.dataset.ovr
    const s = window.__state
    openModal(`实例级覆盖 · ${ROLE_META[role].n}`, `
      <div style="display:grid;gap:10px">
        ${s.lanes.map(l => {
          const key = `${l.id}|${role}`
          const ovr = s.models.overrides[key]
          const b = ovr || s.models.bindings[role]
          const provider = s.models.providers.find(p => p.id === b.providerId) || s.models.providers[0]
          return `
            <div style="display:grid;grid-template-columns:150px 150px 1fr auto;gap:9px;align-items:center">
              <span style="font-family:var(--mono);font-size:11px;color:#cfe1f3">${esc(l.id)} · ${esc(l.name)}</span>
              <select class="sel" data-ovp="${esc(l.id)}|${role}">
                ${s.models.providers.map(p => `<option value="${esc(p.id)}" ${p.id === b.providerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select>
              <select class="sel" data-ovm="${esc(l.id)}|${role}">
                ${provider.models.map(m => `<option value="${esc(m)}" ${m === b.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}
              </select>
              <button class="btn sm ${ovr ? 'danger' : ''}" data-ovset="${esc(l.id)}|${role}">${ovr ? '清除覆盖' : '设为覆盖'}</button>
            </div>`
        }).join('')}
      </div>
      <div class="modal-note">实例覆盖只影响该任务线的该角色实例；同角色在其他任务线上仍用默认绑定。上下文总线按任务线隔离，因此换模型不会丢产物。</div>`)

    $$('[data-ovset]').forEach(btn => btn.addEventListener('click', async () => {
      const [laneId, r] = btn.dataset.ovset.split('|')
      try {
        if (window.__state.models.overrides[`${laneId}|${r}`]) {
          await api.clearOverride(laneId, r)
          toast(`${laneId} 的 ${ROLE_META[r].n} 已恢复默认模型`)
        } else {
          const sel = document.querySelector(`[data-ovp="${laneId}|${r}"]`)
          const modelSel = document.querySelector(`[data-ovm="${laneId}|${r}"]`)
          await api.setOverride(laneId, r, { providerId: sel.value, model: modelSel.value })
          toast(`${laneId} 的 ${ROLE_META[r].n} 已改用 ${modelSel.value}`)
        }
        closeModal()
      } catch (err) { toast(err.message) }
    }))
  })
}
