import { api } from '../api.js'
import { $, $$, esc, toast, delegate, statusBadge, empty } from '../ui.js'

const ui = { filter: 'all', q: '', open: false, busy: false }

function statusOf(st) {
  return ({ draft: '待确认', reviewing: '评审中', confirmed: '已确认' })[st] || st
}

function cardsHtml(list) {
  if (!list.length) return empty('没有匹配的需求')
  return list.map(r => `
    <article class="req-card ${r.st}">
      <div class="req-h">
        <span class="req-id">${esc(r.id)}</span>
        ${statusBadge(r.st)}
      </div>
      <div class="req-t">${esc(r.t)}</div>
      <div class="req-cov">
        <span class="num">${r.covered}/${r.points}</span>
        <span class="bar"><i style="width:${Math.min(100, r.covPct)}%"></i></span>
        <span class="num">${r.covPct}%</span>
      </div>
      <div class="req-meta">
        <span>${esc(r.mod)}</span>
        <span>用例 ${r.caseCount}</span>
        <span>通过 ${r.passed}</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="btn sm ghost" data-flow="${esc(r.id)}" data-st="${esc(r.st)}">${r.st === 'confirmed' ? '已完成' : '推进状态'}</button>
          <button class="btn sm ghost" data-lane="${esc(r.laneId || '')}">本线</button>
        </span>
      </div>
    </article>`).join('')
}

export function render(root, s) {
  if (!root.dataset.built) {
    root.innerHTML = `
      <section class="view">
        <div class="box">
          <div class="box-h">
            <div class="h">REQUIREMENTS</div>
            <div class="n" id="reqCount">--</div>
          </div>
          <div class="tools">
            <input class="inp grow" id="reqQ" placeholder="搜索需求标题 / 编号 / 模块…" />
            <button class="chip on" data-f="all">全部</button>
            <button class="chip" data-f="confirmed">已确认</button>
            <button class="chip" data-f="reviewing">评审中</button>
            <button class="chip" data-f="draft">待确认</button>
            <button class="btn" id="reqImportBtn">＋ 导入需求</button>
          </div>
          <div class="imp" id="impBox" style="display:none">
            <div class="imp-h"><span>IMPORT · 每行一条需求，格式：标题 | 模块 | 测试点</span><span>≤ 12 行</span></div>
            <textarea id="impText" placeholder="重复通知幂等，不得重复扣款 | order-payment | 8&#10;退款金额按分存储，展示按元换算 | settle-job | 6"></textarea>
            <div class="imp-f">
              <input class="inp" id="impBatch" value="迭代 4.3" style="min-width:150px" title="任务线名称" />
              <label class="chip" style="cursor:pointer">选择文件
                <input type="file" id="impFile" accept=".txt,.md,.csv" hidden />
              </label>
              <span class="imp-tip" id="impTip">解析后自动建任务线，派给 KEEL → ORACLE → WEAVE → SWARM → SENTRY</span>
              <button class="btn" id="impGo">解析并启动机器人</button>
            </div>
          </div>
          <div class="box-pad" style="padding:14px 15px"><div class="req-grid" id="reqGrid"></div></div>
        </div>
      </section>`
    root.dataset.built = '1'
    bind(root)
  }

  const list = s.requirements.filter(r => {
    if (ui.filter !== 'all' && r.st !== ui.filter) return false
    if (ui.q) {
      const q = ui.q.toLowerCase()
      return r.t.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.mod.toLowerCase().includes(q)
    }
    return true
  })

  $('#reqGrid', root).innerHTML = cardsHtml(list)
  $('#reqCount', root).innerHTML = `共 <b style="color:#cfe6fa">${s.requirements.length}</b> 条 · 已确认 ${s.requirements.filter(r => r.st === 'confirmed').length} · 覆盖率中位 ${Math.round(s.requirements.reduce((a, r) => a + r.covPct, 0) / Math.max(1, s.requirements.length))}%`
  $('#impBox', root).style.display = ui.open ? 'block' : 'none'
}

function bind(root) {
  delegate(root, 'click', '#reqImportBtn', () => {
    ui.open = !ui.open
    $('#impBox', root).style.display = ui.open ? 'block' : 'none'
    if (ui.open) $('#impText', root).focus()
  })

  delegate(root, 'input', '#reqQ', (e, node) => {
    ui.q = node.value.trim()
    render(root, window.__state)
  })

  delegate(root, 'click', '[data-f]', (e, node) => {
    ui.filter = node.dataset.f
    $$('[data-f]', root).forEach(x => x.classList.toggle('on', x === node))
    render(root, window.__state)
  })

  delegate(root, 'change', '#impFile', async (e, node) => {
    const file = node.files?.[0]
    if (!file) return
    const text = await file.text()
    $('#impText', root).value = text.slice(0, 6000)
    $('#impTip', root).textContent = `已读取 ${file.name} · ${text.split(/\r?\n/).filter(Boolean).length} 行`
  })

  delegate(root, 'click', '#impGo', async () => {
    if (ui.busy) return
    const text = $('#impText', root).value.trim()
    if (!text) return toast('先粘贴需求内容或选择文件')
    ui.busy = true
    const btn = $('#impGo', root)
    btn.disabled = true
    btn.textContent = '解析中…'
    try {
      const batch = $('#impBatch', root).value.trim() || '迭代 4.3'
      const res = await api.importRequirements(text, batch)
      toast(`已建立 ${res.lane.id} · ${res.requirements.length} 条需求 · 机器人已接活`)
      $('#impText', root).value = ''
      $('#impTip', root).textContent = `已创建 ${res.lane.id} · 实例 ${res.lane.id} 的 5 个角色已就位`
      await api.snapshot().then(snap => window.__refresh?.(snap))
      setTimeout(() => window.__go?.('lanes'), 400)
    } catch (err) {
      toast(err.message)
    } finally {
      ui.busy = false
      btn.disabled = false
      btn.textContent = '解析并启动机器人'
    }
  })

  delegate(root, 'click', '[data-flow]', async (e, node) => {
    const id = node.dataset.flow
    const st = node.dataset.st
    if (st === 'confirmed') return toast('该需求已确认')
    try {
      await api.setRequirementStatus(id, st === 'draft' ? 'reviewing' : 'confirmed')
      toast(`${id} 已推进`)
    } catch (err) {
      toast(err.message)
    }
  })

  delegate(root, 'click', '[data-lane]', (e, node) => {
    if (node.dataset.lane) window.__go?.('lanes')
  })
}
