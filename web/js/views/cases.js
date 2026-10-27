import { api } from '../api.js'
import { $, $$, esc, fmt, toast, delegate, resultBadge, openModal, closeModal, empty } from '../ui.js'

const ui = { pri: 'all', q: '' }

function rowsHtml(list) {
  if (!list.length) return `<tr><td colspan="8">${empty('没有匹配的用例')}</td></tr>`
  return list.slice(0, 80).map(c => `
    <tr>
      <td class="mono">${esc(c.id)}</td>
      <td class="ti">${esc(c.t)}</td>
      <td class="mut">${esc(c.mod)}</td>
      <td>${`<span class="badge b-${c.pri.toLowerCase()}">${esc(c.pri)}</span>`}</td>
      <td>${c.on ? '<span class="badge b-ok">启用</span>' : '<span class="badge b-off">停用</span>'}</td>
      <td>${resultBadge(c.res)}</td>
      <td class="mut">${c.dur ? `${c.dur}s` : '--'}</td>
      <td>
        <button class="btn sm ghost" data-toggle="${esc(c.id)}" data-on="${c.on}">${c.on ? '停用' : '启用'}</button>
        <button class="btn sm danger" data-del="${esc(c.id)}">删除</button>
      </td>
    </tr>`).join('')
}

export function render(root, s) {
  if (!root.dataset.built) {
    root.innerHTML = `
      <section class="view">
        <div class="box">
          <div class="box-h"><div class="h">CASE LIBRARY</div><div class="n" id="caseCount">--</div></div>
          <div class="tools">
            <input class="inp grow" id="caseQ" placeholder="搜索用例编号 / 标题…" />
            <button class="chip on" data-p="all">全部</button>
            <button class="chip" data-p="P0">P0</button>
            <button class="chip" data-p="P1">P1</button>
            <button class="chip" data-p="P2">P2</button>
            <button class="btn" id="newCase">＋ 新建用例</button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编号</th><th>标题</th><th>模块</th><th>级别</th><th>状态</th><th>最近结果</th><th>耗时</th><th>操作</th></tr></thead>
              <tbody id="caseRows"></tbody>
            </table>
          </div>
        </div>
      </section>`
    root.dataset.built = '1'
    bind(root)
  }

  const list = s.cases.filter(c => {
    if (ui.pri !== 'all' && c.pri !== ui.pri) return false
    if (ui.q) {
      const q = ui.q.toLowerCase()
      return c.id.toLowerCase().includes(q) || c.t.toLowerCase().includes(q) || c.mod.toLowerCase().includes(q)
    }
    return true
  })

  $('#caseRows', root).innerHTML = rowsHtml(list)
  const executed = s.cases.filter(c => c.res !== 'skip').length
  $('#caseCount', root).innerHTML = `共 <b style="color:#cfe6fa">${fmt(s.cases.length)}</b> 条 · 已执行 ${executed} · 失败 ${s.cases.filter(c => c.res === 'fail').length} · 停用 ${s.cases.filter(c => !c.on).length}`
}

function bind(root) {
  delegate(root, 'click', '[data-p]', (e, node) => {
    ui.pri = node.dataset.p
    $$('[data-p]', root).forEach(x => x.classList.toggle('on', x === node))
    render(root, window.__state)
  })

  delegate(root, 'input', '#caseQ', (e, node) => {
    ui.q = node.value.trim()
    render(root, window.__state)
  })

  delegate(root, 'click', '[data-toggle]', async (e, node) => {
    try {
      await api.patchCase(node.dataset.toggle, { on: node.dataset.on !== 'true' })
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '[data-del]', async (e, node) => {
    try {
      await api.deleteCase(node.dataset.del)
      toast(`已删除 ${node.dataset.del}`)
    } catch (err) { toast(err.message) }
  })

  delegate(root, 'click', '#newCase', () => {
    const mods = [...new Set(window.__state.cases.map(c => c.mod))].slice(0, 12)
    openModal('新建用例', `
      <div style="display:grid;gap:11px">
        <label style="font-family:var(--mono);font-size:10.5px;color:var(--muted)">标题
          <input class="inp" id="ncT" style="width:100%;margin-top:6px" placeholder="例：支付回调重复通知不重复扣款" />
        </label>
        <div style="display:grid;grid-template-columns:1fr 120px;gap:11px">
          <label style="font-family:var(--mono);font-size:10.5px;color:var(--muted)">模块
            <input class="inp" id="ncMod" style="width:100%;margin-top:6px" list="modList" value="${esc(mods[0] || 'general')}" />
            <datalist id="modList">${mods.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist>
          </label>
          <label style="font-family:var(--mono);font-size:10.5px;color:var(--muted)">级别
            <select class="sel" id="ncPri" style="width:100%;margin-top:6px"><option>P0</option><option selected>P1</option><option>P2</option></select>
          </label>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:4px">
          <button class="btn ghost" id="ncCancel">取消</button>
          <button class="btn" id="ncGo">创建</button>
        </div>
      </div>`)
    $('#ncCancel').addEventListener('click', closeModal)
    $('#ncGo').addEventListener('click', async () => {
      const t = $('#ncT').value.trim()
      if (!t) return toast('标题必填')
      try {
        await api.createCase({ t, mod: $('#ncMod').value.trim() || 'general', pri: $('#ncPri').value })
        closeModal()
        toast('用例已创建')
      } catch (err) { toast(err.message) }
    })
  })
}
