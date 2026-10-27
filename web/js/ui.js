export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const fmt = n => Number(n || 0).toLocaleString('en-US')
export const clampPct = n => Math.max(0, Math.min(100, n || 0))

export const resultBadge = res => {
  if (res === 'pass') return '<span class="badge b-pass">PASS</span>'
  if (res === 'fail') return '<span class="badge b-fail">FAIL</span>'
  return '<span class="badge b-skip">SKIP</span>'
}

export const sevBadge = sev => `<span class="badge b-${String(sev).toLowerCase()}">${esc(sev)}</span>`

export const statusBadge = st => {
  const map = {
    confirmed: ['已确认', 'b-pass'],
    reviewing: ['评审中', 'b-p1'],
    draft: ['待确认', 'b-skip'],
  }
  const [label, cls] = map[st] || [st, 'b-skip']
  return `<span class="badge ${cls}">${label}</span>`
}

export const laneStatus = st => {
  const map = {
    running: ['RUNNING', 'b-ok'],
    queued: ['QUEUED', 'b-p2'],
    paused: ['PAUSED', 'b-p1'],
    done: ['DONE', 'b-pass'],
    failed: ['FAILED', 'b-fail'],
  }
  const [label, cls] = map[st] || [st, 'b-skip']
  return `<span class="badge ${cls}">${label}</span>`
}

export const defectStatus = st => {
  const map = { new: '新建', reproduced: '已复现', fixing: '修复中', verified: '已验证', closed: '已关闭' }
  return `<span class="stt ${esc(st)}">${map[st] || st}</span>`
}

export function timeAgo(iso) {
  if (!iso) return '--'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.max(1, Math.round(diff))}s 前`
  if (diff < 3600) return `${Math.round(diff / 60)}m 前`
  if (diff < 86400) return `${Math.round(diff / 3600)}h 前`
  return `${Math.round(diff / 86400)}d 前`
}

export const hhmmss = iso => {
  const d = iso ? new Date(iso) : new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

export const duration = sec => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

let toastTimer = null
export function toast(msg, ms = 2000) {
  const el = $('#toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('on'), ms)
}

export function openModal(title, html) {
  $('#modalTitle').textContent = title
  $('#modalBody').innerHTML = html
  $('#modal').classList.add('on')
}

export function closeModal() {
  $('#modal').classList.remove('on')
}

export const empty = (text = '暂无数据') => `<div class="empty">${esc(text)}</div>`

/** 在容器上做事件委托，省掉逐个绑定 */
export function delegate(root, event, selector, handler) {
  root.addEventListener(event, e => {
    const target = e.target.closest(selector)
    if (target && root.contains(target)) handler(e, target)
  })
}
