import { getStore } from '@netlify/blobs'

const STORE_NAME = 'embalase-receivables-shared'
const STATE_KEY = 'dashboard-state'

const emptyState = () => ({
  revision: 0,
  updatedAt: null,
  data: null,
  accountNotes: {},
})

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  },
})

const getDashboardStore = () => getStore({
  name: STORE_NAME,
  consistency: 'strong',
})

const readState = async (store) => {
  const state = await store.get(STATE_KEY, { type: 'json' })
  return state || emptyState()
}

const mutateState = async (store, mutate) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const entry = await store.getWithMetadata(STATE_KEY, { type: 'json' })
    const current = entry?.data || emptyState()
    const next = {
      ...mutate(current),
      revision: (Number(current.revision) || 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    const result = await store.setJSON(
      STATE_KEY,
      next,
      entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
    )
    if (result.modified) return next
  }
  throw new Error('Data berubah bersamaan. Silakan simpan kembali.')
}

export const createDashboardHandler = (store) => async (request) => {
  try {
    if (request.method === 'GET') {
      return json(await readState(store))
    }

    if (request.method !== 'POST') {
      return json({ error: 'Metode tidak didukung.' }, 405)
    }

    const body = await request.json()

    if (body.action === 'replaceDashboard') {
      if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
        return json({ error: 'Data dashboard tidak valid.' }, 400)
      }
      const {
        accountNotes: ignoredNotes,
        syncRevision: ignoredRevision,
        syncPending: ignoredPending,
        pendingNoteKeys: ignoredPendingNotes,
        ...dashboardData
      } = body.data
      const next = await mutateState(store, (current) => ({
        ...current,
        data: dashboardData,
        accountNotes: current.accountNotes || {},
      }))
      return json(next)
    }

    if (body.action === 'saveNote') {
      const key = String(body.key || '').trim()
      const note = String(body.note || '').trim()
      if (!key || key.length > 500 || note.length > 5000) {
        return json({ error: 'Keterangan tidak valid atau terlalu panjang.' }, 400)
      }
      const savedAt = new Date().toISOString()
      const next = await mutateState(store, (current) => ({
        ...current,
        accountNotes: {
          ...(current.accountNotes || {}),
          [key]: { note, savedAt },
        },
      }))
      return json(next)
    }

    return json({ error: 'Aksi sinkronisasi tidak dikenali.' }, 400)
  } catch (error) {
    console.error('Dashboard sync error', error)
    return json({ error: error.message || 'Sinkronisasi gagal.' }, 500)
  }
}

export default async (request) => createDashboardHandler(getDashboardStore())(request)
