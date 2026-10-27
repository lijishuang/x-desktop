import { api } from './api.js'
import { store, setSnapshot, applyEvent } from './state.js'
import { connectStream, onEvent } from './stream.js'
import { $, esc, fmt, duration, hhmmss, openModal, closeModal, toast } from './ui.js'
import * as overview from './views/overview.js'
import * as requirements from './views/requirements.js'
import * as cases from './views/cases.js'
import * as lanes from './views/lanes.js'
import * as runs from './views/runs.js'
import * as defects from './views/defects.js'
import * as models from './views/models.js'

const views = { overview, requirements, cases, lanes, runs, defects, models }
const viewRoot = $('#view')
let current = 'overview'
let builtFor = null
let renderTimer = null
let lastSnapshotAt = Date.now()

const RERENDER_ON = {
  overview: ['lane', 'result', 'log', 'defect', 'pool', 'timeline', 'llm', 'scheduler', 'requirement'],
  requirements: ['requirement', 'requirements', 'lane'],
  cases: ['case', 'cases', 'result'],
  lanes: ['lane', 'pool', 'scheduler'],
  runs: ['result', 'log', 'run', 'lane', 'defect'],
  defects: ['defect'],
  models: ['bindings', 'provider', 'llm', 'context'],
}

/* ── KPI ── */
function renderKpi(s) {
  if (!s) return
  const running = s.lanes.filter(l => l.status === 'running').length
  const up = Math.floor(s.kpi.uptimeSec + (Date.now() - lastSnapshotAt) / 1000)
  const cells = [
    ['用例总量', fmt(s.kpi.cases), '条', `已执行 ${fmt(s.kpi.executed)} 步 · 停用 ${s.cases.filter(c => !c.on).length}`],
    ['通过率', s.kpi.passRate.toFixed(1), '%', `准出阈值 95% · 失败 ${s.cases.filter(c => c.res === 'fail').length}`],
    ['缺陷', fmt(s.kpi.defects), '条', `P0 ${s.kpi.p0} · P1 ${s.kpi.p1} · 未关闭 ${s.defects.filter(d => d.st !== 'closed').length}`],
    ['任务线', `${running}/${s.scheduler.conc}`, '', `共 ${s.lanes.length} 条 · 排队 ${s.lanes.filter(l => l.status === 'queued').length}`],
    ['连续运行', duration(up), '', '0 次人工介入 · 7×24'],
  ]
  $('#kpi').innerHTML = cells.map(([k, v, u, sub], i) => `
    <div class="cell ${i === 2 && s.kpi.p0 > 0 ? 'warn' : ''}">
      <div class="k">${esc(k)}</div>
      <div class="v">${esc(v)}${u ? `<span class="u">${esc(u)}</span>` : ''}</div>
      <div class="s">${esc(sub)}</div>
    </div>`).join('')
}

/* ── 视图调度 ── */
function renderView() {
  if (!store.snapshot) return
  const view = views[current]
  if (!view) return
  builtFor = current
  view.render(viewRoot, store.snapshot)
}

function go(name) {
  if (!views[name]) name = 'overview'
  current = name
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`)
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === name))
  // 切页时清掉构建标记，让视图重新搭骨架
  delete viewRoot.dataset.built
  delete viewRoot.dataset.bound
  viewRoot.__logIds = null
  renderView()
}

function scheduleRender() {
  if (renderTimer) return
  renderTimer = setTimeout(() => {
    renderTimer = null
    renderKpi(store.snapshot)
    const ae = document.activeElement
    const editing = ae && viewRoot.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)
    if (!editing) renderView()
  }, 260)
}

/* ── 事件接入 ── */
onEvent(Object.keys(RERENDER_ON).reduce((all, k) => all.concat(RERENDER_ON[k]), []), type => {
  const allowed = RERENDER_ON[current] || []
  if (allowed.includes(type)) scheduleRender()
})

async function reloadSnapshot() {
  try {
    const snap = await api.snapshot()
    lastSnapshotAt = Date.now()
    setSnapshot(snap)
    if (builtFor !== current) renderView()
  } catch (err) {
    console.warn('[snapshot] 刷新失败', err.message)
  }
}

/* ── 使用指南 ── */
function helpModal() {
  openModal('X-DeskTop 使用指南', `
    <div class="steps">
      <div class="step">
        <div class="no">STEP 01</div>
        <div class="st">导入需求</div>
        <div class="sd2">需求库 →「＋ 导入需求」，每行一条：<span style="font-family:var(--mono)">标题 | 模块 | 测试点</span>，也可选 .txt/.md/.csv。<br/>点「解析并启动机器人」后自动建任务线，5 个角色接活。</div>
      </div>
      <div class="step">
        <div class="no">STEP 02</div>
        <div class="st">看它自己跑</div>
        <div class="sd2">总览的 2.5D 流水线会实时推进：方案 → 分析 → 用例 → 执行 → 缺陷。运行记录页有终端日志与逐条结果，失败会自动建缺陷单。</div>
      </div>
      <div class="step">
        <div class="no">STEP 03</div>
        <div class="st">管存量资源</div>
        <div class="sd2">用例库可启停删、需求库可流转确认、缺陷库按 新建→已复现→修复中→已验证→已关闭 流转、任务线可冻结与续跑。</div>
      </div>
      <div class="step">
        <div class="no">STEP 04</div>
        <div class="st">配模型</div>
        <div class="sd2">模型页：供应商接入 → 角色绑定 → 实例覆盖。五个角色可各用不同模型；同一条任务线的上下文是共享的，换模型不丢上下文。</div>
      </div>
    </div>
    <div class="modal-note">
      <b>暂停某个机器人</b>：点 AGENTS 面板任意一行，或任务线页点实例徽标，对应阶段立刻冻结，恢复后从断点继续。<br/>
      <b>接真实模型</b>：启动前设置 <span style="font-family:var(--mono)">LLM_BASE_URL / LLM_API_KEY / LLM_MODEL</span>（见 .env.example），统一走 OpenAI 兼容协议；未配置时模型调用会记录失败，流水线无法产出。<br/>
      <b>数据</b>：全部落在 <span style="font-family:var(--mono)">data/state.json</span>，重启不丢；<span style="font-family:var(--mono)">npm run reset</span> 可回到种子数据。
    </div>`)
}

/* ── 启动 ── */
async function boot() {
  $('#nav').addEventListener('click', e => {
    const a = e.target.closest('a[data-v]')
    if (a) go(a.dataset.v)
  })

  $('#helpBtn').addEventListener('click', helpModal)
  $('#modalClose').addEventListener('click', closeModal)
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal()
  })

  window.__go = go
  window.__refresh = snap => {
    lastSnapshotAt = Date.now()
    setSnapshot(snap)
    renderKpi(snap)
    renderView()
  }

  const hash = (location.hash || '#overview').slice(1)
  current = views[hash] ? hash : 'overview'
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === current))

  const tick = () => { $('#clock').textContent = hhmmss() }
  tick()
  setInterval(tick, 1000)

  try {
    await reloadSnapshot()
    renderKpi(store.snapshot)
    renderView()
    const mode = store.snapshot.meta.llmMode
    $('#modeTag').textContent = mode === 'live' ? 'LIVE 模型' : '模型未配置'
  } catch (err) {
    $('#view').innerHTML = `<div class="box"><div class="empty">无法连接后端：${esc(err.message)}<br/><br/>请确认已执行 <b>npm start</b></div></div>`
    return
  }

  connectStream(status => {
    const tag = $('#modeTag')
    if (status === 'live') {
      if (tag.textContent === '连接中' || tag.textContent === '重连中') {
        tag.textContent = store.snapshot?.meta.llmMode === 'live' ? 'LIVE 模型' : '模型未配置'
      }
      reloadSnapshot()
    } else {
      tag.textContent = '重连中'
    }
  })

  onEvent(['lane', 'result', 'log', 'run'], () => {
    const t = $('#upTime')
    if (t && store.snapshot) t.textContent = duration(Math.floor(store.snapshot.kpi.uptimeSec + (Date.now() - lastSnapshotAt) / 1000))
  })

  // 每 25s 对齐一次全量快照，防止增量事件丢包
  setInterval(reloadSnapshot, 25000)

  window.addEventListener('hashchange', () => {
    const target = (location.hash || '#overview').slice(1)
    if (views[target] && target !== current) go(target)
  })
}

boot()
