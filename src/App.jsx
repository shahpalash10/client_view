import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts'
import { fetchAllSessions, fetchSessionById, fetchSessionsForUser } from './api'

const niceTime = (ts) => {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString([], { hour12: false })
}

const format = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-')

const profilePositions = [
  { left: '18%', top: '24%' },
  { left: '38%', top: '18%' },
  { left: '58%', top: '24%' },
  { left: '78%', top: '20%' },
  { left: '24%', top: '54%' },
  { left: '46%', top: '50%' },
  { left: '70%', top: '54%' },
  { left: '34%', top: '78%' },
  { left: '62%', top: '80%' }
]

export default function App() {
  const [stage, setStage] = useState('profiles')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [userSessions, setUserSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState('')
  const [sessionDetail, setSessionDetail] = useState(null)
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    let live = true
    ;(async () => {
      setLoading(true)
      const sessions = await fetchAllSessions()
      const grouped = new Map()
      sessions.forEach((s) => {
        const userId = s.userId || 'unknown'
        const current = grouped.get(userId) || {
          userId,
          name: s.profileName || userId,
          count: 0,
          latest: s.startedAt
        }
        current.count += 1
        if (!current.latest || new Date(s.startedAt) > new Date(current.latest)) {
          current.latest = s.startedAt
        }
        grouped.set(userId, current)
      })
      if (!live) return
      const list = Array.from(grouped.values()).sort((a, b) => b.count - a.count)
      setUsers(list)
      setLoading(false)
    })()

    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!selectedUser) return
    let live = true
    ;(async () => {
      const list = await fetchSessionsForUser(selectedUser)
      if (!live) return
      setUserSessions(list)
      setSelectedSession(list[0]?.id || '')
    })()
    return () => {
      live = false
    }
  }, [selectedUser])

  useEffect(() => {
    if (!selectedSession) return

    let cancelled = false

    const load = async () => {
      const detail = await fetchSessionById(selectedSession)
      if (cancelled) return
      setSessionDetail(detail)
      const points = (detail.metrics || []).map((m) => ({
        t: niceTime(m.timestamp),
        a: Number(m.avgArousal ?? 0),
        v: Number(m.avgValence ?? 0),
        e: Number(m.avgExpectation ?? 0)
      }))
      setChartData(points.slice(-240))
    }

    load()
    const timer = setInterval(load, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedSession])

  const latest = chartData[chartData.length - 1] || { a: 0, v: 0, e: 0 }

  const stats = useMemo(() => {
    if (!chartData.length) {
      return {
        avg: 0,
        current: 0,
        peak: 0
      }
    }
    const values = chartData.map((d) => d.v)
    return {
      avg: values.reduce((x, y) => x + y, 0) / values.length,
      current: values[values.length - 1],
      peak: Math.max(...values)
    }
  }, [chartData])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto h-10 w-56 animate-pulse rounded-xl bg-slate-200" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-soft">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500" />
            <span className="font-semibold">Session Vista</span>
          </div>
          <h1 className="text-xl font-semibold">Session Analytics</h1>
          <div className="h-9 w-9 rounded-full border border-slate-200 bg-white" />
        </header>

        {stage === 'profiles' && (
          <section className="relative h-[72vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-premium">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.12),transparent_40%),radial-gradient(circle_at_90%_80%,rgba(99,102,241,0.1),transparent_36%)]" />
            <div className="relative p-8 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Select Profile</p>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">Pick a person to open their analytics</h2>
            </div>

            {users.slice(0, 9).map((u, idx) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => {
                  setSelectedUser(u.userId)
                  setStage('dashboard')
                }}
                className="profile-pop absolute flex min-w-[180px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-soft transition hover:-translate-y-1 hover:shadow-premium"
                style={{ ...profilePositions[idx], animationDelay: `${idx * 80}ms` }}
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white">
                  {(u.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.count} sessions</p>
                </div>
              </button>
            ))}
          </section>
        )}

        {stage === 'dashboard' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
                onClick={() => setStage('profiles')}
              >
                Back to profiles
              </button>
              <p className="text-sm text-slate-600">User: {users.find((u) => u.userId === selectedUser)?.name || selectedUser}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[300px,1fr]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft">
                <p className="mb-2 px-2 text-xs uppercase tracking-wide text-slate-500">Sessions</p>
                <div className="space-y-2">
                  {userSessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSession(s.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        selectedSession === s.id
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-medium">{s.id}</p>
                      <p className="text-xs text-slate-500">{niceTime(s.startedAt)}</p>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="space-y-4">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-premium">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Live Graph</p>
                      <h3 className="text-xl font-semibold text-slate-900">{selectedSession || 'No session selected'}</h3>
                    </div>
                    <p className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">updates every second</p>
                  </div>

                  <div className="h-[360px] rounded-2xl bg-gradient-to-b from-cyan-50 to-white p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="a" name="Arousal" stroke="#0284c7" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="v" name="Valence" stroke="#f97316" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="e" name="Expectation" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Average value</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{format(stats.avg)}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Current value</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{format(stats.current)}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Session duration</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{Math.round(Number(sessionDetail?.durationSec || 0))}s</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Peak value</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{format(stats.peak)}</p>
                  </article>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Latest A/V/E</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
                    <span>A: {format(latest.a)}</span>
                    <span>V: {format(latest.v)}</span>
                    <span>E: {format(latest.e)}</span>
                  </div>
                </section>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
