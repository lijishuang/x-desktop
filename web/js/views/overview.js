import { stageRows } from '../state.js'
import { buildScene, updateScene } from '../scene.js'
import { api } from '../api.js'
import { $, esc, fmt, timeAgo, toast, openModal, delegate, laneStatus } from '../ui.js'

let spark = new Array(16).fill(3)

const stageMeta = {
  plan: '范围 / 策略 / 环境 / 准入准出，由 KEEL 拆解验收标准',
  req: '测试点抽取与歧义澄清，产出追溯矩阵',
  case: '用例设计：前置数据、步骤、断言、清理',
  run: '按执行机池调度，失败自动重试 2 次',
  bug: '失败样本归并去重、定级并派单',
}

function template(s) {
  return `
  <section class="view">
    <div class="deck">
      <svg id="scene" role="img" aria-label="自主测试流水线 2.5D 视图"></svg>
      <div class="hud hud-l">
        <div class="hud-card" id="hudRuntime"></div>
        <div class="hud-card" id="hudGuard"></div>
      </div>
      <div class="hud hud-r">
        <div class="hud-card" id="hudThrough"></div>
        <div class="hud-card" id="hudNext"></div>
      </div>
      <div class="deck-foot">
        <span class="tick-mask"><span class="tick" id="tick"></span></span>
        <span style="flex:none">点击工位 / 同事查看详情</span>
      </div>
    </div>

    <div class="cols">
      <div class="box">
        <div class="box-h"><div class="h">PIPELINE</div><div class="n" id="pipeMeta">--</div></div>
        <div class="box-b" id="stages"></div>
        <div class="box-pad" style="border-top:1px solid var(--line);font-family:var(--mono);font-size:10px;color:var(--dim)" id="pipeFoot"></div>
      </div>
      <div class="box">
        <div class="box-h"><div class="h">AGENTS</div><div class="n" id="agentMeta">7×24 在岗</div></div>
        <div id="agents"></div>
        <div class="box-pad" style="border-top:1px solid var(--line);font-family:var(--mono);font-size:10px;color:var(--dim);display:flex;justify-content:space-between" id="agentFoot"></div>
      </div>
      <div class="box">
        <div class="box-h"><div class="h">DEFECT STREAM</div><div class="n" id="feedMeta">实时</div></div>
        <div class="feed" id="feed"></div>
      </div>
    </div>

    <div class="cols">
      <div class="box">
        <div class="box-h"><div class="h">ACTIVITY TIMELINE</div><div class="n">六角色交接</div></div>
        <div class="tl-list" id="timeline"></div>
      </div>
      <div class="box">
        <div class="box-h"><div class="h">MODULE COVERAGE</div><div class="n">按模块通过率</div></div>
        <div class="cov-list" id="coverage"></div>
      </div>
      <div class="box">
        <div class="box-h"><div class="h">ENV MATRIX</div><div class="n">执行环境</div></div>
        <div class="env-grid" id="env"></div>
      </div>
    </div>
  </section>`
}

const toneColor = { cyan: 'var(--cyan)', blue: 'var(--blue)', violet: 'var(--violet)', lime: 'var(--lime)', magenta: 'var(--magenta)', amber: 'var(--amber)' }

function stagesHtml(s) {
  const rows = stageRows(s)
  return rows.map(st => `
    <div class="stage-row" data-stage="${st.k}">
      <div class="ix">0${st.i}</div>
      <div class="nm">${esc(st.label)} <i>${esc(st.n)}·${st.inst}</i>${st.gate ? '' : '<span class="paused-dot"></span>'}</div>
      <div class="pct">${Math.round(st.pct)}%</div>
      <div class="track" style="color:${['#3ee7ff', '#5b9dff', '#9d7bff', '#9dff5e', '#ff3d87'][st.i - 1]}"><i style="width:${Math.min(100, st.pct)}%"></i></div>
      <div class="meta">${esc(st.desc)} · ${st.gate ? '在岗' : '已暂停'}</div>
    </div>`).join('')
}

function agentsHtml(s) {
  return s.agents.map(a => `
    <div class="ag ${a.gate ? '' : 'off'}" data-agent="${a.k}" title="点击${a.gate ? '暂停' : '恢复'} ${a.n}·${a.inst}">
      <div class="id" style="color:${a.gate ? 'var(--cyan)' : 'var(--amber)'}">${esc(a.n)}</div>
      <div>
        <div class="nm">${esc(a.n)}·${a.inst} <i>${esc(a.role)}</i></div>
        <div class="tk">${esc(a.model)} · ${esc(a.task)}</div>
      </div>
      <div class="up2">${a.gate ? '在岗' : '暂停'}</div>
    </div>`).join('')
}

function defectsHtml(s) {
  if (!s.defects.length) return '<div class="empty">暂无缺陷</div>'
  return s.defects.slice(0, 7).map(d => `
    <div class="df">
      <span class="badge b-${d.sev.toLowerCase()}">${esc(d.sev)}</span>
      <div>
        <div class="tt">${esc(d.t)}</div>
        <div class="md">${esc(d.id)} · ${esc(d.caseId)} · ${timeAgo(d.at)}</div>
      </div>
      <div class="stt ${d.st}">${({ new: '新建', reproduced: '已复现', fixing: '修复中', verified: '已验证', closed: '已关闭' })[d.st] || d.st}</div>
    </div>`).join('')
}

function timelineHtml(s) {
  if (!s.timeline.length) return '<div class="empty">暂无事件</div>'
  return s.timeline.slice(0, 12).map(t => `
    <div class="tl">
      <span class="dot" style="color:${toneColor[t.tone] || 'var(--cyan)'}"></span>
      <div class="tx">${esc(t.text)}</div>
      <div class="tm">${timeAgo(t.at)}</div>
    </div>`).join('')
}

function coverageHtml(s) {
  const mods = new Map()
  for (const c of s.cases) {
    if (!mods.has(c.mod)) mods.set(c.mod, { total: 0, pass: 0, fail: 0 })
    const m = mods.get(c.mod)
    m.total += 1
    if (c.res === 'pass') m.pass += 1
    if (c.res === 'fail') m.fail += 1
  }
  const list = [...mods.entries()].map(([mod, m]) => ({
    mod,
    ...m,
    rate: m.total ? (m.pass / m.total) * 100 : 0,
  })).sort((a, b) => b.total - a.total).slice(0, 6)

  return list.map(m => {
    const color = m.rate >= 90 ? 'var(--lime)' : m.rate >= 70 ? 'var(--amber)' : 'var(--magenta)'
    return `
      <div class="cov">
        <div class="cov-h"><span>${esc(m.mod)}</span><span class="pc" style="color:${color}">${m.rate.toFixed(1)}%</span></div>
        <div class="cov-bar"><i style="width:${Math.min(100, m.rate)}%;background:${color};box-shadow:0 0 8px ${color}"></i></div>
        <div class="cov-meta"><span>用例 ${m.total}</span><span>通过 ${m.pass}</span><span>失败 ${m.fail}</span></div>
      </div>`
  }).join('')
}

function envHtml(s) {
  const load = Math.round((s.pool.used / Math.max(1, s.pool.cap)) * 100)
  const envs = [
    { id: 'staging-sim', st: '运行中', color: 'var(--lime)', nodes: '8 / 8', use: '全量回归', net: '内网 · 代理', load: load + 40 },
    { id: 'smoke-lab', st: '健康', color: 'var(--cyan)', nodes: '4 / 4', use: '冒烟门禁', net: '内网', load: 12 },
    { id: 'perf-lab', st: '18:00 预约', color: 'var(--violet)', nodes: '12 台', use: '压测', net: '独立带宽', load: 0 },
  ]
  return envs.map(e => `
    <div class="env">
      <div class="env-h"><span>${e.id}</span><span style="color:${e.color}">${e.st}</span></div>
      <div class="env-grid2">
        <span>负载 <b>${Math.min(98, Math.max(2, Math.round(e.load)))}%</b></span>
        <span>节点 <b>${e.nodes}</b></span>
        <span>用途 <b>${e.use}</b></span>
        <span>网络 <b>${e.net}</b></span>
      </div>
    </div>`).join('')
}

function tickHtml(s) {
  const steps = [
    `<b>PIPE-07</b> 分支 release/4.2 · 环境 staging-sim`,
    `<b>执行机池</b> 占用 ${s.pool.used}/${s.pool.cap} · 并行任务线 ${s.lanes.filter(l => l.status === 'running').length}/${s.scheduler.conc}`,
    `<b>追溯矩阵</b> 需求 ${s.requirements.length} 条 · 用例 ${fmt(s.kpi.cases)} 条`,
    `<b>通过率</b> ${s.kpi.passRate}% · 已执行 ${fmt(s.kpi.executed)} 步`,
    `<b>缺陷</b> 累计 ${s.kpi.defects} 条 · P0 ${s.kpi.p0} · P1 ${s.kpi.p1}`,
    `<b>模型</b> ${s.models.providers.filter(p => p.enabled).length} 家接入 · 角色绑定 ${Object.keys(s.models.bindings).length} 项`,
    `<b>模型</b> ${s.meta.llmMode === 'live' ? '真实模型在线' : '未配置（调用将失败）'}`,
  ]
  const line = steps.map(t => `<span>${t}</span>`).join('')
  return line + line
}

function hudHtml(s) {
  const running = s.lanes.filter(l => l.status === 'running').length
  const queued = s.lanes.filter(l => l.status === 'queued').length
  const p0 = s.defects.filter(d => d.sev === 'P0' && d.st !== 'closed').length
  const nextCase = s.cases.find(c => c.res === 'skip' && c.on)

  const throughput = Math.max(1, Math.round(s.kpi.executed / Math.max(1, s.kpi.uptimeSec / 60)))
  spark.push(throughput)
  if (spark.length > 16) spark.shift()
  const max = Math.max(...spark, 1)

  $('#hudRuntime').innerHTML = `
    <div class="hud-h"><span>RUNTIME</span><i>LIVE</i></div>
    <div class="hud-row"><span>并行任务线</span><b>${running}/${s.scheduler.conc}</b></div>
    <div class="hud-row"><span>执行机池</span><b>${s.pool.used}/${s.pool.cap}</b></div>
    <div class="hud-row"><span>排队</span><b>${queued} 条</b></div>
    <div class="hud-row"><span>分支</span><b>release/4.2</b></div>`

  $('#hudGuard').innerHTML = `
    <div class="hud-h"><span>GUARDRAIL</span></div>
    <div class="hud-row"><span>P0 阻塞</span><b style="color:${p0 ? 'var(--magenta)' : 'var(--lime)'}">${p0}</b></div>
    <div class="hud-row"><span>准出阈值</span><b>95%</b></div>
    <div class="hud-row"><span>当前通过率</span><b>${s.kpi.passRate}%</b></div>
    <div class="hud-row"><span>快照保留</span><b>72h</b></div>`

  $('#hudThrough').innerHTML = `
    <div class="hud-h"><span>THROUGHPUT</span></div>
    <div class="hud-big">${throughput}<span>步/分钟</span></div>
    <div class="spark">${spark.map(v => `<i style="height:${Math.max(8, (v / max) * 100)}%"></i>`).join('')}</div>`

  $('#hudNext').innerHTML = `
    <div class="hud-h"><span>NEXT UP</span></div>
    <div style="font-family:var(--mono);font-size:10px;color:#a9c8e2;line-height:1.5">${nextCase ? esc(nextCase.id) : '队列已清空'}</div>
    <div style="font-size:10.5px;color:var(--dim);margin-top:4px;line-height:1.45">${nextCase ? esc(nextCase.t) : '等待新需求导入'}</div>`
}

function bind(root) {
  if (root.dataset.bound) return
  root.dataset.bound = '1'

  delegate(root, 'click', '[data-agent]', async (e, node) => {
    const key = node.dataset.agent
    const agent = (window.__state?.agents || []).find(a => a.k === key)
    const laneId = window.__state?.primaryLaneId
    if (!agent || !laneId) return
    try {
      await api.setGate(laneId, key, !agent.gate)
      toast(`${agent.n}·${agent.inst} ${agent.gate ? '已暂停' : '已恢复'}`)
    } catch (err) {
      toast(err.message)
    }
  })

  delegate(root, 'click', '[data-stage]', (e, node) => {
    const key = node.dataset.stage
    const s = window.__state
    const lane = s.lanes.find(l => l.id === s.primaryLaneId)
    openModal(`环节说明 · ${key.toUpperCase()}`, `
      <p>${stageMeta[key] || ''}</p>
      <div class="modal-note">
        当前任务线：<b>${esc(lane?.id)} · ${esc(lane?.name)}</b><br/>
        阶段进度：<b>${Math.round(lane?.stages?.[key] || 0)}%</b> ·
        实例状态：<b>${lane?.gates?.[key] === false ? '已暂停' : '在岗'}</b><br/>
        该阶段的产物会写入任务线的共享上下文，供后续任意模型的实例读取。
      </div>`)
  })
}

export function render(root, s) {
  window.__state = s
  if (!root.dataset.built) {
    root.innerHTML = template(s)
    buildScene($('#scene', root), s)
    root.dataset.built = '1'
    bind(root)
    $('#tick', root).innerHTML = tickHtml(s)
  }
  updateScene($('#scene', root), s)
  $('#stages', root).innerHTML = stagesHtml(s)
  $('#agents', root).innerHTML = agentsHtml(s)
  $('#feed', root).innerHTML = defectsHtml(s)
  $('#timeline', root).innerHTML = timelineHtml(s)
  $('#coverage', root).innerHTML = coverageHtml(s)
  $('#env', root).innerHTML = envHtml(s)
  hudHtml(s)

  const lane = s.lanes.find(l => l.id === s.primaryLaneId)
  $('#pipeMeta', root).innerHTML = lane ? `${laneStatus(lane.status)} <span style="margin-left:6px">${lane.pct}%</span>` : '--'
  $('#pipeFoot', root).textContent = lane
    ? `${lane.id} · ${lane.name} · 需求 ${lane.req} / 用例 ${lane.cases} / PASS ${lane.pass} / FAIL ${lane.fail}`
    : '暂无任务线'
  $('#agentMeta', root).textContent = `${s.agents.filter(a => a.gate).length}/${s.agents.length} 在岗`
  $('#agentFoot', root).innerHTML = `<span>上下文共享 · 模型可换</span><span>${s.models.providers.filter(p => p.enabled).length} 家接入</span>`
  $('#feedMeta', root).textContent = `实时 · 累计 ${s.kpi.defects}`
  $('#tick', root).innerHTML = tickHtml(s)
}
