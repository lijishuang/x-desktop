/** 后端接口封装：统一错误处理，返回 data 本体 */
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let payload = null
  try {
    payload = await res.json()
  } catch {
    throw new Error(`响应不是 JSON（HTTP ${res.status}）`)
  }
  if (!res.ok || payload.ok === false) {
    throw new Error(payload?.error?.message || `HTTP ${res.status}`)
  }
  return payload.data
}

export const api = {
  snapshot: () => request('/api/snapshot'),
  config: () => request('/api/config'),

  importRequirements: (text, batch) => request('/api/requirements/import', { method: 'POST', body: { text, batch } }),
  previewRequirements: text => request('/api/requirements/preview', { method: 'POST', body: { text } }),
  setRequirementStatus: (id, st) => request(`/api/requirements/${id}`, { method: 'PATCH', body: { st } }),

  createCase: c => request('/api/cases', { method: 'POST', body: c }),
  patchCase: (id, patch) => request(`/api/cases/${id}`, { method: 'PATCH', body: patch }),
  deleteCase: id => request(`/api/cases/${id}`, { method: 'DELETE' }),

  setGate: (laneId, role, on) => request(`/api/lanes/${laneId}/gates/${role}`, { method: 'POST', body: { on } }),
  freezeLane: laneId => request(`/api/lanes/${laneId}/freeze`, { method: 'POST' }),
  resumeLane: laneId => request(`/api/lanes/${laneId}/resume`, { method: 'POST' }),
  setConcurrency: conc => request('/api/scheduler', { method: 'PATCH', body: { conc } }),

  advanceDefect: (id, st) => request(`/api/defects/${id}`, { method: 'PATCH', body: st ? { st } : {} }),

  testProvider: id => request(`/api/models/providers/${id}/test`, { method: 'POST' }),
  setProvider: (id, patch) => request(`/api/models/providers/${id}`, { method: 'PATCH', body: patch }),
  setBinding: (role, patch) => request(`/api/models/bindings/${role}`, { method: 'PATCH', body: patch }),
  setOverride: (laneId, role, patch) => request(`/api/models/overrides/${laneId}/${role}`, { method: 'PUT', body: patch }),
  clearOverride: (laneId, role) => request(`/api/models/overrides/${laneId}/${role}`, { method: 'DELETE' }),
  prompt: (laneId, role) => request(`/api/models/prompt/${laneId}/${role}`),
}
