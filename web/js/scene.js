/**
 * 2.5D 等距流水线场景（纯 SVG，无第三方依赖）
 * 五个角色工位 + 流动管道 + 执行机农场 + 能源核心，全部由后端阶段进度驱动。
 */
import { stageRows } from './state.js'

const TW = 68
const TH = 27
const PLAT = 2.4
const SLAB = 10

const POS = [
  { gx: 1.6, gy: 2.0 },
  { gx: 5.2, gy: 3.6 },
  { gx: 8.8, gy: 2.0 },
  { gx: 12.4, gy: 3.6 },
  { gx: 16.0, gy: 2.0 },
]

const COLORS = ['#3ee7ff', '#5b9dff', '#9d7bff', '#9dff5e', '#ff3d87']
const HEX = ['#123243', '#122740', '#241a3a', '#1c3312', '#3a1424']

const P = (gx, gy) => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 })
const at = (p, h) => ({ x: p.x, y: p.y - h })
const poly = (...pts) => `M${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`
const n = v => Number(v).toFixed(1)

function box(gx, gy, w, d, h, opt = {}) {
  const { top = '#16202f', left = '#0b1320', right = '#101a28', stroke, sw = 1, so = 0.5 } = opt
  const a = P(gx, gy)
  const b = P(gx + w, gy)
  const c = P(gx + w, gy + d)
  const e = P(gx, gy + d)
  const s = stroke ? `stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${so}"` : ''
  return `
    <path d="${poly(b, c, at(c, h), at(b, h))}" fill="${right}" ${s}/>
    <path d="${poly(e, c, at(c, h), at(e, h))}" fill="${left}" ${s}/>
    <path d="${poly(at(a, h), at(b, h), at(c, h), at(e, h))}" fill="${top}" ${s}/>`
}

function flat(gx, gy, w, d, fill, opacity = 1) {
  return `<path d="${poly(P(gx, gy), P(gx + w, gy), P(gx + w, gy + d), P(gx, gy + d))}" fill="${fill}" opacity="${opacity}"/>`
}

/* ── 各工位上的设备 ── */
function device(kind, gx, gy, color) {
  const cx = gx + 1.2
  const cy = gy + 1.2
  if (kind === 'plan') {
    const p = P(cx, cy)
    return `
      ${box(gx + 0.5, gy + 1.0, 1.5, 0.22, 26, { top: '#1b2a3c', left: '#0d1826', right: '#12202e', stroke: color, sw: 0.7, so: 0.5 })}
      <g transform="translate(${n(p.x - 26)},${n(p.y - 34)})">
        <rect width="52" height="3" rx="1.5" fill="${color}" opacity=".7"/>
        <rect y="7" width="38" height="2" rx="1" fill="${color}" opacity=".4"/>
        <rect y="13" width="45" height="2" rx="1" fill="${color}" opacity=".3"/>
      </g>`
  }
  if (kind === 'req') {
    return `
      ${box(gx + 0.55, gy + 0.9, 1.3, 1.0, 9, { top: '#1c2a3b', left: '#0c1624', right: '#11202f', stroke: color, sw: 0.6, so: 0.4 })}
      ${box(gx + 0.7, gy + 1.02, 1.0, 0.8, 16, { top: '#203048', left: '#0e1a2a', right: '#142436', stroke: color, sw: 0.6, so: 0.45 })}
      ${box(gx + 0.85, gy + 1.14, 0.7, 0.6, 22, { top: '#26384f', left: '#101d2e', right: '#17283c', stroke: color, sw: 0.6, so: 0.5 })}`
  }
  if (kind === 'case') {
    let cells = ''
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const on = (r + c) % 3 !== 2
        cells += box(gx + 0.55 + c * 0.33, gy + 0.85 + r * 0.33, 0.24, 0.24, 7, {
          top: on ? color : '#1a2637',
          left: on ? 'rgba(0,0,0,.45)' : '#0c1624',
          right: on ? 'rgba(0,0,0,.35)' : '#101c2b',
        })
      }
    }
    return cells
  }
  if (kind === 'run') {
    let out = ''
    for (let i = 0; i < 3; i += 1) {
      const gx2 = gx + 0.45 + i * 0.56
      out += box(gx2, gy + 0.85, 0.42, 0.9, 20, { top: '#172536', left: '#0a1421', right: '#0e1b2a', stroke: color, sw: 0.5, so: 0.35 })
      const p = P(gx2 + 0.21, gy + 0.9)
      out += `<circle class="blink" cx="${n(p.x)}" cy="${n(p.y - 16)}" r="1.6" fill="${color}" style="animation-delay:${i * 0.35}s"/>`
    }
    return out
  }
  const bars = [12, 21, 32, 43]
  let out = ''
  bars.forEach((h, i) => {
    const gx2 = gx + 0.55 + i * 0.4
    out += box(gx2, gy + 1.1, 0.26, 0.5, h, {
      top: i === 3 ? color : 'rgba(255,61,135,.55)',
      left: 'rgba(0,0,0,.5)',
      right: 'rgba(0,0,0,.35)',
    })
  })
  return out
}

function label(st, i, gx, gy) {
  const color = COLORS[i]
  const p = P(gx + 1.2, gy + 1.2)
  const top = p.y - 118
  return `
    <g id="card-${st.k}" transform="translate(${n(p.x - 70)},${n(top)})">
      <rect width="140" height="46" rx="6" fill="rgba(5,11,19,.9)" stroke="${color}" stroke-opacity=".45"/>
      <text x="9" y="15" font-family="ui-monospace,Menlo,monospace" font-size="12.5" fill="#6f8ca8" letter-spacing="1.2">0${i + 1} · ${st.n}</text>
      <text x="9" y="29" font-size="12.5" fill="#e4f2ff">${st.label}</text>
      <text id="pct-${st.k}" x="131" y="29" text-anchor="end" font-family="ui-monospace,Menlo,monospace" font-size="12.5" fill="${color}">0%</text>
      <rect x="9" y="37" width="122" height="2" rx="1" fill="rgba(120,170,220,.14)"/>
      <rect id="bar-${st.k}" x="9" y="37" width="0" height="2" rx="1" fill="${color}"/>
    </g>`
}

function defs() {
  return `<defs>
    <linearGradient id="floor" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#0d1c30"/><stop offset="1" stop-color="#060b14"/>
    </linearGradient>
    <linearGradient id="wall" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#060c16"/><stop offset="1" stop-color="#0a1524"/>
    </linearGradient>
    <linearGradient id="screenA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d3b4a"/><stop offset="1" stop-color="#08202c"/>
    </linearGradient>
    <linearGradient id="screenB" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a1748"/><stop offset="1" stop-color="#140d24"/>
    </linearGradient>
    <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#9d7bff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#9d7bff" stop-opacity="0"/>
    </linearGradient>
    ${COLORS.map((c, i) => `
      <radialGradient id="glow${i}">
        <stop offset="0" stop-color="${c}" stop-opacity=".38"/>
        <stop offset="1" stop-color="${c}" stop-opacity="0"/>
      </radialGradient>`).join('')}
  </defs>`
}

function walls() {
  const a = P(0, 0.4)
  const b = P(21, 0.4)
  const h = 66
  const screen = (gx1, gx2, fill) => {
    const p1 = P(gx1, 0.4)
    const p2 = P(gx2, 0.4)
    return `<path d="${poly(at(p1, 12), at(p2, 12), at(p2, 52), at(p1, 52))}" fill="${fill}" stroke="#3ee7ff" stroke-opacity=".18" stroke-width=".8"/>`
  }
  let bars = ''
  for (let gx = 1.6; gx < 20; gx += 0.22) {
    const p1 = P(gx, 0.4)
    const hh = 14 + ((gx * 37) % 28)
    bars += `<line x1="${n(p1.x)}" y1="${n(p1.y - 14)}" x2="${n(p1.x)}" y2="${n(p1.y - 14 - hh)}" stroke="#3ee7ff" stroke-opacity=".22" stroke-width="1.4"/>`
  }
  return `
    <path d="${poly(a, b, at(b, h), at(a, h))}" fill="url(#wall)" stroke="#3ee7ff" stroke-opacity=".12"/>
    <line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#3ee7ff" stroke-opacity=".35" stroke-width="1.1"/>
    ${bars}
    ${screen(1.4, 8.6, 'url(#screenA)')}
    ${screen(12.2, 19.6, 'url(#screenB)')}
    <text x="${n(P(1.6, 0.4).x)}" y="${n(P(1.6, 0.4).y - 56)}" font-family="ui-monospace,Menlo,monospace" font-size="9.5" fill="#3ee7ff" opacity=".55">CASE MATRIX · 3,120</text>
    <text x="${n(P(12.4, 0.4).x)}" y="${n(P(12.4, 0.4).y - 56)}" font-family="ui-monospace,Menlo,monospace" font-size="9.5" fill="#9d7bff" opacity=".55">DEFECT SPECTRUM</text>`
}

function floor() {
  const x0 = 0
  const y0 = 0.4
  const x1 = 21
  const y1 = 8.8
  let grid = ''
  for (let gx = x0; gx <= x1; gx += 1) {
    const p1 = P(gx, y0)
    const p2 = P(gx, y1)
    grid += `<line x1="${n(p1.x)}" y1="${n(p1.y)}" x2="${n(p2.x)}" y2="${n(p2.y)}" stroke="#4b8dc0" stroke-opacity=".14"/>`
  }
  for (let gy = y0; gy <= y1; gy += 1) {
    const p1 = P(x0, gy)
    const p2 = P(x1, gy)
    grid += `<line x1="${n(p1.x)}" y1="${n(p1.y)}" x2="${n(p2.x)}" y2="${n(p2.y)}" stroke="#4b8dc0" stroke-opacity=".14"/>`
  }
  return `
    <path d="${poly(P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1))}" fill="url(#floor)" stroke="#31648c" stroke-opacity=".3"/>
    ${grid}`
}

function executorFarm() {
  let out = ''
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const gx = 1.6 + c * 1.55
      const gy = 6.3 + r * 1.5
      out += box(gx, gy, 0.95, 0.95, r === 0 ? 22 : 17, {
        top: '#16212f', left: '#0a1320', right: '#0f1a28', stroke: '#2b6f96', sw: 0.6, so: 0.5,
      })
      const p = P(gx + 0.47, gy + 0.47)
      out += `<circle class="blink" cx="${n(p.x)}" cy="${n(p.y - (r === 0 ? 18 : 13))}" r="1.7" fill="#9dff5e" style="animation-delay:${(c * 0.27 + r * 0.6).toFixed(2)}s"/>`
    }
  }
  return `
    <g>
      ${flat(1.4, 6.1, 7.4, 3.9, '#3ee7ff', 0.03)}
      ${out}
      <text x="${n(P(1.5, 6.1).x - 6)}" y="${n(P(1.5, 6.1).y + 22)}" font-family="ui-monospace,Menlo,monospace" font-size="9.5" fill="#5b93b8" letter-spacing="1.4">EXECUTOR FARM · 8</text>
    </g>`
}

function energyCore() {
  const p = P(18.6, 6.9)
  return `
    <g>
      ${flat(17.4, 5.9, 3.2, 3.2, '#9d7bff', 0.05)}
      <path d="M${n(p.x - 18)},${n(p.y)} L${n(p.x - 10)},${n(p.y - 118)} L${n(p.x + 10)},${n(p.y - 118)} L${n(p.x + 18)},${n(p.y)}Z" fill="url(#beam)"/>
      <ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="30" ry="11" fill="none" stroke="#9d7bff" stroke-opacity=".55" stroke-width="1"/>
      <ellipse class="pulse" cx="${n(p.x)}" cy="${n(p.y - 46)}" rx="20" ry="7" fill="none" stroke="#9d7bff" stroke-opacity=".45"/>
      <ellipse class="pulse" cx="${n(p.x)}" cy="${n(p.y - 82)}" rx="11" ry="4" fill="none" stroke="#c9b6ff" stroke-opacity=".4" style="animation-delay:.8s"/>
      ${box(16.6, 7.9, 0.8, 0.8, 12, { top: '#1d2436', left: '#0c1220', right: '#131a2a', stroke: '#9d7bff', sw: 0.5, so: 0.4 })}
      ${box(20.8, 8.0, 0.7, 0.7, 9, { top: '#1d2436', left: '#0c1220', right: '#131a2a', stroke: '#9d7bff', sw: 0.5, so: 0.35 })}
    </g>`
}

function radar() {
  const p = P(19.6, 1.1)
  return `
    <g>
      <ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="52" ry="19" fill="none" stroke="#3ee7ff" stroke-opacity=".12"/>
      <ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="36" ry="13" fill="none" stroke="#3ee7ff" stroke-opacity=".18"/>
      <ellipse class="pulse" cx="${n(p.x)}" cy="${n(p.y)}" rx="20" ry="7" fill="none" stroke="#3ee7ff" stroke-opacity=".3"/>
      <circle cx="${n(p.x)}" cy="${n(p.y)}" r="2" fill="#3ee7ff" opacity=".8"/>
    </g>`
}

function pipes() {
  let out = ''
  for (let i = 0; i < POS.length - 1; i += 1) {
    const a = P(POS[i].gx + 1.2, POS[i].gy + 1.2)
    const b = P(POS[i + 1].gx + 1.2, POS[i + 1].gy + 1.2)
    const ra = 16
    const rb = 16
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 10 }
    out += `
      <g id="pipe-${i}">
        <path d="M${n(a.x)},${n(a.y - ra)} Q${n(mid.x)},${n(mid.y - 26)} ${n(b.x)},${n(b.y - rb)}"
              fill="none" stroke="${COLORS[i]}" stroke-opacity=".22" stroke-width="7" stroke-linecap="round"/>
        <path d="M${n(a.x)},${n(a.y - ra)} Q${n(mid.x)},${n(mid.y - 26)} ${n(b.x)},${n(b.y - rb)}"
              fill="none" stroke="${COLORS[i]}" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>
        <path class="flow" d="M${n(a.x)},${n(a.y - ra)} Q${n(mid.x)},${n(mid.y - 26)} ${n(b.x)},${n(b.y - rb)}"
              fill="none" stroke="${COLORS[i + 1]}" stroke-opacity=".9" stroke-width="2.4"
              stroke-dasharray="7 16" stroke-linecap="round" style="animation-delay:${i * 0.3}s"/>
      </g>`
  }
  return out
}

export function buildScene(svg, state) {
  const stages = stageRows(state)
  const platforms = stages.map((st, i) => {
    const { gx, gy } = POS[i]
    const color = COLORS[i]
    const p = P(gx + 1.2, gy + 1.2)
    return `
      <g>
        <ellipse cx="${n(p.x)}" cy="${n(p.y + 4)}" rx="86" ry="30" fill="url(#glow${i})"/>
        ${flat(gx - 0.15, gy - 0.15, PLAT + 0.3, PLAT + 0.3, color, 0.05)}
        ${box(gx, gy, PLAT, PLAT, SLAB, {
          top: HEX[i], left: '#070d16', right: '#0b131f', stroke: color, sw: 1, so: 0.55,
        })}
        <path d="${poly(P(gx, gy), P(gx + PLAT, gy), P(gx + PLAT, gy + 0.05), P(gx, gy + 0.05))}" fill="${color}" opacity=".55"/>
        ${device(st.k, gx, gy, color)}
        ${label(st, i, gx, gy)}
      </g>`
  }).join('')

  svg.setAttribute('viewBox', '-346 -150 1080 566')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.innerHTML = `${defs()}
    ${floor()}
    ${walls()}
    ${radar()}
    ${executorFarm()}
    ${energyCore()}
    ${pipes()}
    ${platforms}`
  updateScene(svg, state)
}

export function updateScene(svg, state) {
  const stages = stageRows(state)
  for (const st of stages) {
    const pct = Math.round(st.pct || 0)
    const pctEl = svg.querySelector(`#pct-${st.k}`)
    const barEl = svg.querySelector(`#bar-${st.k}`)
    const cardEl = svg.querySelector(`#card-${st.k}`)
    if (pctEl) pctEl.textContent = `${pct}%`
    if (barEl) barEl.setAttribute('width', String((122 * pct) / 100))
    if (cardEl) cardEl.setAttribute('stroke-opacity', st.gate ? '0.45' : '0.15')
    const idx = ['plan', 'req', 'case', 'run', 'bug'].indexOf(st.k)
    const pipe = svg.querySelector(`#pipe-${idx}`)
    if (pipe) pipe.setAttribute('opacity', st.gate ? String(0.45 + pct / 220) : '0.18')
  }
}
