const DEFAULT_API_URL = 'http://localhost:8001'

const resolveBaseUrl = () => {
  const rawValue = import.meta.env.VITE_REPOSITORY_API_URL
  const cleanedEnv = rawValue && !['undefined', 'null', ''].includes(String(rawValue).toLowerCase())
    ? rawValue
    : null
  const raw = (cleanedEnv ?? DEFAULT_API_URL).toString().trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    return new URL(withScheme).origin
  } catch {
    return DEFAULT_API_URL
  }
}

const API_URL = resolveBaseUrl()

const buildUrl = (path, params) => {
  const url = new URL(path, `${API_URL}/`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }
  return url.toString()
}

const fetchJson = async (url, options) => {
  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`)
  }
  return res.json()
}

export const fetchSessions = (userId) => fetchJson(buildUrl('/sessions', userId ? { userId } : undefined))

export const fetchSessionsForUser = (userId) => {
  if (!userId) return Promise.resolve([])
  return fetchJson(buildUrl(`/users/${userId}/sessions`))
}

export const fetchSessionDetail = (sessionId) => fetchJson(buildUrl(`/sessions/${sessionId}`))

export async function fetchSessionDetailsBulk(sessionIds, concurrency = 5) {
  const ids = [...new Set((sessionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const results = []
  let cursor = 0

  const worker = async () => {
    while (cursor < ids.length) {
      const index = cursor
      cursor += 1
      const id = ids[index]
      try {
        const detail = await fetchSessionDetail(id)
        results.push(detail)
      } catch (error) {
        console.warn(`Failed to fetch session detail for ${id}`, error)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export { API_URL }
