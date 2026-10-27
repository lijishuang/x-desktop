import { api } from '../api.js'
import { $, $$, esc, toast, delegate, laneStatus, empty } from '../ui.js'

const ROLE_ORDER = ['plan', 'req', 'case', 'run', 'bug']
const ROLE_NAME = { plan: 'KEEL', req: 'ORACLE', case: 'WEAVE', run: 'SWARM', bug: 'SENTRY' }

function laneCard(l, pool) {
  const gates = l.gates || {}
  const insts = ROLE_ORDER.map(k => {
    const on = gates[k] !== false
    const done = (l.stages?.[k] || 0) >= 100
    return `<span class="inst ${on ? '' : 'off'} ${done ? 'done' : ''}" data-gate="${esc(l.id)}" data-role="${k}"
      title="${ROLE_NAME[k]}·${l.no} · ${on ? '在岗，点击暂停' : '已暂停，点击恢复'}">${ROLE_NAME[k]}·${l.no}</span>`
  }).join('')

  return `
    <article class="lane-card ${l.status}">
      <div class="lane-h">
        <div>
          <div class="id">${esc(l.id)} · ${esc(l.batch || '')}</div>
          <div class="nm">${esc(l.name)}</div>
        </div>
        ${laneStatus(l.status)}
      </div>
      <div class="lane-b">
        <div class="lane-metrics">
          <div class="m"><div class="k">需求</div><div class="v">${l.req}</div></div>
          <div class="m"><div class="k">用例</div><div class="v">${l.cases}</div></div>
          <div class="m p"><div class="k">PASS</div><div class="v">${l.pass}</div></div>
          <div class="m f"><div class="k">FAIL</div><div class="v">${l.fail}</div></div>
        </div>
        <div class="lane-track"><i style="width:${l.pct}%"></i></div>
        <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;color:var(--dim)">
          <span>整线进度 ${l.pct}%</span>
          <span>${l.status === 'running' ? `占用执行机 ${l.slots || 1}` : l.status === 'done' ? '已归档' : '等待调度'}</span>
        </div>
        <div class="insts">${insts}</div>
      </div>
      <div class="lane-f">
        <span style="font-family:var(--mono);font-size:9.5px;color:var(--dim)">${esc(l.note || (l.status === 'running' ? '流水线运行中' : l.status === 'done' ? '本轮完成' : '排队中'))}</span>
        <span style="display:flex;gap:6px">
          ${l.status === 'done' || l.status === 'paused'
            ? `<button class="btn sm" data-resume="${esc(l.id)}">续跑</button>`
            : `<button class="btn sm ghost" data-freeze="${esc(l.id)}">冻结整线</button>`}
        </span>
      </div>
    </article>`
}

export function render(root, s) {
  if (!root.dataset.built) {
    root.innerHTML = `
      <section class="view">
        <div class="box">
          <div class="box-h"><div class="h">SCHEDULER</div><div class="n" id="schedMeta">--</div></div>
          <div class="tools">
            <span style="font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.06em">并行度</span>
            <span class="seg" id="concSeg">
              ${[1, 2, 3, 4].map(n => `<button data-conc="${n}" class="${s.scheduler.conc === n ? 'on' : ''}">${n} 线</button>`).join('')}
            </span>
            <span class="grow"></span>
            <button class="btn ghost" id="startPrimary">启动常驻线</button>
          </div>
          <div class="box-pad">
            <div style="display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:10px;color:var(--dim)">
              <span id="poolLabel">执行机池</span>
              <span class="bar" style="flex:1;height:4px;border-radius:2px;background:rgba(120,170,220,.13);overflow:hidden">
                <i id="poolBar" style="display:block;height:100%;width:0;background:linear-gradient(90deg,var(--blue),var(--cyan))"></i>
              </span>
              <span id="poolNum" style="color:#a9c8e2">--</span>
            </div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap" id="poolSlots"></div>
          </div>
        </div>

        <div class="box" style="margin-top:16px">
          <div class="box-h"><div class="h">LANES</div><div class="n" id="laneMeta">--</div></div>
          <div class="box-pad"><div class="lane-grid" id="laneGrid"></div></div>
        </div>

        <div class="box" style="margin-top:16px">
          <div class="box-h"><div class="h">HOW IT WORKS</div><div class="n">调度策略</div></div>
          <div class="box-pad" style="font-size:11.5px;color:var(--muted);line-height:1.75">
            每导入一批需求就新建一条任务线，线上 KEEL / ORACLE / WEAVE / SWARM / SENTRY 各起一个<b style="color:#cfe1f3">独立实例</b>——
            同角色不同实例，上下文与产物互不串味。并行度控制同时推进几条线，超出的自动排队；
            <b style="color:#cfe1f3">执行机是共享池</b>，SWARM 逐条用例占机执行，名额紧张时排队、释放后直接转交。
            点任一实例徽标可单独暂停该机器人，对应阶段立刻冻结，恢复后从断点继续。
          </div>
        </div>
      </section>`
    root.dataset.built = '1'
    bind(root)
  }

  const lanes = s.lanes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  $('#laneGrid', root).innerHTML = lanes.length ? lanes.map(l => laneCard(l, s.pool)).join('') : empty('还没有任务线，去需求库导入一批需求')
  $('#laneMeta', root).textContent = `${lanes.length} 条任务线 · ${lanes.length * 5} 个实例 · 运行中 ${lanes.filter(l => l.status === 'running').length}`
  $('#schedMeta', root).textContent = `并行 ${lanes.filter(l => l.status === 'running').length}/${s.scheduler.conc} · 排队 ${lanes.filter(l => l.status === 'queued').length}`

  const usedPct = Math.round((s.pool.used / Math.max(1, s.pool.cap)) * 100)
  $('#poolBar', root).style.width = `${usedPct}%`
  $('#poolNum', root).textContent = `${s.pool.used} / ${s.pool.cap}`
  $('#poolSlots', root).innerHTML = (s.executors || []).map(e => `
    <span class="inst ${e.busy ? '' : 'off'}" title="${esc(e.id)} · ${esc(e.job)}">${esc(e.id)}</span>`).join('')
  $$('[data-conc]', root).forEach(b => b.classList.toggle('on', Number(b.dataset.conc) === s.scheduler.conc))
}

function bind(root) {
  delegate(root, 'click', '[data-conc]', async (e, node) => {
    try {
      await api.setConcurrency(Number(node.dataset.conc))
      toast(`并行度已设为 ${node.dataset.conc} 条线`)
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '[data-gate]', async (e, node) => {
    const lane = window.__state.lanes.find(l => l.id === node.dataset.gate)
    if (!lane) return
    const on = lane.gates?.[node.dataset.role] !== false
    try {
      await api.setGate(lane.id, node.dataset.role, !on)
      toast(`${ROLE_NAME[node.dataset.role]}·${lane.no} ${on ? '已暂停' : '已恢复'}`)
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '[data-freeze]', async (e, node) => {
    try { await api.freezeLane(node.dataset.freeze); toast('任务线已冻结') } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '[data-resume]', async (e, node) => {
    try { await api.resumeLane(node.dataset.resume); toast('任务线已重新排队') } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '#startPrimary', async () => {
    const primary = window.__state.lanes.find(l => l.primary)
    if (!primary) return toast('没有常驻任务线')
    try {
      await api.resumeLane(primary.id)
      toast(`${primary.id} 已启动新一轮`)
    } catch (err) { toast(err.message) }
  })
}
