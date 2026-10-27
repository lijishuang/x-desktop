import { $, esc, fmt, hhmmss, timeAgo, delegate, resultBadge, empty } from '../ui.js'

function pickRun(s) {
  return s.runs.find(r => r.st === 'running') || s.runs[0] || null
}

function resultsHtml(s) {
  const list = s.results.slice(0, 14)
  if (!list.length) return `<tr><td colspan="6">${empty('还没有执行结果')}</td></tr>`
  return list.map(r => `
    <tr>
      <td class="mono">${esc(r.id.slice(-10))}</td>
      <td class="mono">${esc(r.caseId)}</td>
      <td>${resultBadge(r.res)}</td>
      <td class="mut">${esc(r.ex)}</td>
      <td class="mut">${r.dur}s</td>
      <td class="mut">${hhmmss(r.at)}</td>
    </tr>`).join('')
}

function historyHtml(s, active) {
  const list = s.runs.filter(r => r.id !== active?.id).slice(0, 8)
  if (!list.length) return empty('暂无历史批次')
  return list.map(r => {
    const rate = r.total ? (r.pass / Math.max(1, r.done || r.total)) * 100 : 0
    return `
      <div class="df">
        <span class="badge ${r.st === 'done' ? 'b-pass' : 'b-p1'}">${r.st === 'done' ? 'DONE' : r.st.toUpperCase()}</span>
        <div>
          <div class="tt">${esc(r.batch)}</div>
          <div class="md">${esc(r.id)} · ${r.done}/${r.total} · 通过率 ${rate.toFixed(1)}%</div>
        </div>
        <div class="stt">${timeAgo(r.at)}</div>
      </div>`
  }).join('')
}

export function render(root, s) {
  const run = pickRun(s)
  if (!root.dataset.built) {
    root.innerHTML = `
      <section class="view">
        <div class="cols two" style="margin-top:0">
          <div class="box">
            <div class="box-h"><div class="h">ACTIVE RUN</div><div class="n" id="runMeta">--</div></div>
            <div class="run-head">
              <div>
                <div class="run-pct" id="runPct">0<span>%</span></div>
                <div style="font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:8px" id="runEta">--</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:12.5px;color:#e2f0fd" id="runBatch">--</div>
                <div style="font-family:var(--mono);font-size:10px;color:var(--dim);margin-top:5px" id="runId">--</div>
              </div>
            </div>
            <div class="run-bar"><i id="runBar" style="width:0"></i></div>
            <div class="run-stats">
              <div class="m"><div class="k">TOTAL</div><div class="v" id="rTotal">0</div></div>
              <div class="m"><div class="k">DONE</div><div class="v" id="rDone">0</div></div>
              <div class="m"><div class="k">PASS</div><div class="v" id="rPass" style="color:var(--lime)">0</div></div>
              <div class="m"><div class="k">FAIL</div><div class="v" id="rFail" style="color:var(--magenta)">0</div></div>
            </div>
            <div class="box-h" style="border-top:1px solid var(--line);border-bottom:0"><div class="h" style="font-size:10.5px">TERMINAL</div><div class="n" id="termMeta">实时日志</div></div>
            <div class="term" id="term"></div>
          </div>

          <div class="stack">
            <div class="box">
              <div class="box-h"><div class="h">RESULTS</div><div class="n">逐条执行结果</div></div>
              <div class="tbl-wrap" style="max-height:330px">
                <table class="tbl">
                  <thead><tr><th>结果</th><th>用例</th><th>结论</th><th>执行机</th><th>耗时</th><th>时间</th></tr></thead>
                  <tbody id="resultRows"></tbody>
                </table>
              </div>
            </div>
            <div class="box">
              <div class="box-h"><div class="h">RUN HISTORY</div><div class="n">历史批次</div></div>
              <div id="runHistory"></div>
            </div>
          </div>
        </div>
      </section>`
    root.dataset.built = '1'
    root.__logIds = new Set()
    bind(root)
  }

  // 顶部指标
  const pct = run && run.total ? (run.done / run.total) * 100 : 0
  $('#runPct', root).innerHTML = `${pct.toFixed(1)}<span>%</span>`
  $('#runBar', root).style.width = `${Math.min(100, pct)}%`
  $('#rTotal', root).textContent = fmt(run?.total || 0)
  $('#rDone', root).textContent = fmt(run?.done || 0)
  $('#rPass', root).textContent = fmt(run?.pass || 0)
  $('#rFail', root).textContent = fmt(run?.fail || 0)
  $('#runBatch', root).textContent = run?.batch || '等待批次'
  $('#runId', root).textContent = run ? `${run.id} · ${run.laneId}` : '--'
  $('#runMeta', root).innerHTML = run
    ? `<span class="badge ${run.st === 'running' ? 'b-ok' : 'b-pass'}">${run.st.toUpperCase()}</span>`
    : '<span class="badge b-off">IDLE</span>'
  const remain = Math.max(0, (run?.total || 0) - (run?.done || 0))
  $('#runEta', root).textContent = run?.st === 'running'
    ? `剩余 ${fmt(remain)} 条用例 · 执行机池 ${s.pool.used}/${s.pool.cap}`
    : run ? `批次已结束 · ${timeAgo(run.endAt || run.at)}` : '暂无进行中的批次'

  // 终端：只追加新日志，避免整块重绘
  const term = $('#term', root)
  const seen = root.__logIds
  const logs = s.logs.slice().reverse()
  let appended = 0
  for (const l of logs) {
    if (seen.has(l.id)) continue
    seen.add(l.id)
    const div = document.createElement('div')
    div.className = 'ln'
    div.innerHTML = `<span class="ts">${hhmmss(l.at)}</span><span class="tx ${esc(l.level)}">${esc(l.text)}</span>`
    term.appendChild(div)
    appended += 1
  }
  if (appended) {
    while (term.childElementCount > 220) term.removeChild(term.firstElementChild)
    term.scrollTop = term.scrollHeight
  }
  $('#termMeta', root).textContent = `${s.logs.length} 条 · 实时`

  $('#resultRows', root).innerHTML = resultsHtml(s)
  $('#runHistory', root).innerHTML = historyHtml(s, run)
}

function bind(root) {
  delegate(root, 'click', '[data-run]', () => {})
}
