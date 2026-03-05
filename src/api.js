const DEFAULT_API_URL = 'http://localhost:8001'

const resolveBaseUrl = () => {
  const raw = (import.meta.env.VITE_REPOSITORY_API_URL || DEFAULT_API_URL).toString().trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    return new URL(withScheme).origin
  } catch {
    return DEFAULT_API_URL
  }
}

export const API_URL = resolveBaseUrl()

const fetchJson = async (path) => {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) ${path}`)
  }
  return res.json()
}

export const fetchAllSessions = async () => {
  try {
    return await fetchJson('/sessions')
  } catch {
    return []
  }
}

export const fetchSessionsForUser = async (userId) => {
  if (!userId) return []
  try {
    return await fetchJson(`/users/${userId}/sessions`)
  } catch {
    return []
  }
}

export const fetchSessionById = async (sessionId) => {
  if (!sessionId) throw new Error('Missing session id')

  try {
    return await fetchJson(`/api/session/${sessionId}`)
  } catch (err) {
    if (!String(err.message).includes('(404)')) throw err
    return fetchJson(`/sessions/${sessionId}`)
  }
}
