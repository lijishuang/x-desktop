import { api } from '../api.js'
import { $, $$, esc, toast, delegate, sevBadge, empty } from '../ui.js'

const ui = { sev: 'all' }
const FLOW_LABEL = { new: '新建', reproduced: '已复现', fixing: '修复中', verified: '已验证', closed: '已关闭' }
const FLOW_NEXT = { new: '复现', reproduced: '开始修复', fixing: '验证', verified: '关闭', closed: '已关闭' }

function rowsHtml(list) {
  if (!list.length) return `<tr><td colspan="8">${empty('没有匹配的缺陷')}</td></tr>`
  return list.map(d => {
    const closed = d.st === 'closed'
    return `
      <tr>
        <td class="mono">${esc(d.id)}</td>
        <td>${sevBadge(d.sev)}</td>
        <td class="ti">${esc(d.t)}</td>
        <td class="mono">${esc(d.caseId)}</td>
        <td class="mut">${esc(d.laneId || '--')}</td>
        <td><span class="badge ${d.st === 'closed' ? 'b-off' : d.st === 'verified' ? 'b-pass' : d.st === 'fixing' ? 'b-p1' : 'b-p2'}">${FLOW_LABEL[d.st] || d.st}</span></td>
        <td class="mut">${esc((d.at || '').slice(5, 16).replace('T', ' '))}</td>
        <td><button class="btn sm ${closed ? 'ghost' : ''}" data-adv="${esc(d.id)}" ${closed ? 'disabled' : ''}>${FLOW_NEXT[d.st] || '流转'}</button></td>
      </tr>`
  }).join('')
}

export function render(root, s) {
  if (!root.dataset.built) {
    root.innerHTML = `
      <section class="view">
        <div class="box">
          <div class="box-h"><div class="h">DEFECT LIBRARY</div><div class="n" id="defMeta">--</div></div>
          <div class="tools">
            <input class="inp grow" id="defQ" placeholder="搜索缺陷描述 / 编号 / 用例…" />
            <button class="chip on" data-sev="all">全部</button>
            <button class="chip" data-sev="P0">P0</button>
            <button class="chip" data-sev="P1">P1</button>
            <button class="chip" data-sev="P2">P2</button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编号</th><th>级别</th><th>描述</th><th>关联用例</th><th>任务线</th><th>状态</th><th>上报时间</th><th>流转</th></tr></thead>
              <tbody id="defRows"></tbody>
            </table>
          </div>
          <div class="box-pad" style="border-top:1px solid var(--line);font-size:11px;color:var(--dim);line-height:1.7">
            流转路径：新建 → 已复现 → 修复中 → 已验证 → 已关闭。SWARM 执行失败会自动经 SENTRY 归并定级并写入本库。
          </div>
        </div>
      </section>`
    root.dataset.built = '1'
    bind(root)
  }

  const q = (ui.q || '').toLowerCase()
  const list = s.defects.filter(d => {
    if (ui.sev !== 'all' && d.sev !== ui.sev) return false
    if (q) return d.t.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.caseId.toLowerCase().includes(q)
    return true
  })

  $('#defRows', root).innerHTML = rowsHtml(list)
  const open = s.defects.filter(d => d.st !== 'closed')
  $('#defMeta', root).innerHTML = `共 <b style="color:#cfe6fa">${s.defects.length}</b> 条 · 未关闭 ${open.length} · P0 ${open.filter(d => d.sev === 'P0').length} · P1 ${open.filter(d => d.sev === 'P1').length}`
}

function bind(root) {
  delegate(root, 'click', '[data-sev]', (e, node) => {
    ui.sev = node.dataset.sev
    $$('[data-sev]', root).forEach(x => x.classList.toggle('on', x === node))
    render(root, window.__state)
  })

  delegate(root, 'input', '#defQ', (e, node) => {
    ui.q = node.value.trim()
    render(root, window.__state)
  })

  delegate(root, 'click', '[data-adv]', async (e, node) => {
    try {
      await api.advanceDefect(node.dataset.adv)
    } catch (err) { toast(err.message) }
  })
}
