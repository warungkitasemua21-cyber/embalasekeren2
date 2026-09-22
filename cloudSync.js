const ENDPOINT = '/.netlify/functions/dashboard-sync'

const request = async (options = {}) => {
  const response = await fetch(ENDPOINT, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Sinkronisasi gagal (${response.status}).`)
  return result
}

export const fetchSharedState = () => request()

export const replaceSharedDashboard = (data) => request({
  method: 'POST',
  body: JSON.stringify({ action: 'replaceDashboard', data }),
})

export const saveSharedNote = (key, note) => request({
  method: 'POST',
  body: JSON.stringify({ action: 'saveNote', key, note }),
})
