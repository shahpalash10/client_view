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

const formatValue = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-')

const parseTime = (value) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const timeLabel = (value, mode) => {
  const d = parseTime(value)
  if (!d) return '--:--'
  if (mode === 'daily') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const profileColors = [
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-pink-600'
]

export default function App() {
  const [stage, setStage] = useState('profiles')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [userSessions, setUserSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState('')
  const [sessionDetail, setSessionDetail] = useState(null)
  const [trendMode, setTrendMode] = useState('weekly')

  useEffect(() => {
    let live = true

    ;(async () => {
      setLoading(true)
      const sessions = await fetchAllSessions()
      const grouped = new Map()
      const now = Date.now()

      sessions.forEach((s) => {
        const userId = s.userId || 'unknown'
        const started = parseTime(s.startedAt)
        const latest = s.latestMetrics || null

        const current = grouped.get(userId) || {
          userId,
          name: s.profileName || userId,
          count: 0,
          latest: s.startedAt,
          weeklyCount: 0,
          weeklyA: 0,
          weeklyV: 0,
          weeklyE: 0
        }

        current.count += 1
        if (!current.latest || (started && new Date(current.latest) < started)) {
          current.latest = s.startedAt
        }

        if (started && now - started.getTime() <= 7 * 24 * 60 * 60 * 1000 && latest) {
          current.weeklyCount += 1
          current.weeklyA += Number(latest.avgArousal ?? 0)
          current.weeklyV += Number(latest.avgValence ?? 0)
          current.weeklyE += Number(latest.avgExpectation ?? 0)
        }

        grouped.set(userId, current)
      })

      if (!live) return

      const list = Array.from(grouped.values())
        .map((u) => ({
          ...u,
          preview: {
            a: u.weeklyCount ? u.weeklyA / u.weeklyCount : null,
            v: u.weeklyCount ? u.weeklyV / u.weeklyCount : null,
            e: u.weeklyCount ? u.weeklyE / u.weeklyCount : null
          }
        }))
        .sort((a, b) => b.count - a.count)

      setUsers(list)
      if (list[0]) setSelectedUser(list[0].userId)
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
    }

    load()
    const timer = setInterval(load, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedSession])

  const chartData = useMemo(() => {
    if (!sessionDetail) return []

    const days = trendMode === 'daily' ? 1 : 7
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

    const points = (sessionDetail.metrics || [])
      .map((m) => {
        const ts = parseTime(m.timestamp)
        if (!ts) return null
        return {
          ts: ts.getTime(),
          t: timeLabel(ts, trendMode),
          a: Number(m.avgArousal ?? 0),
          v: Number(m.avgValence ?? 0),
          e: Number(m.avgExpectation ?? 0)
        }
      })
      .filter(Boolean)
      .filter((p) => p.ts >= cutoff)

    if (points.length) return points.slice(-280)

    const lm = sessionDetail.latestMetrics
    if (lm) {
      return [{
        ts: Date.now(),
        t: timeLabel(lm.timestamp || Date.now(), trendMode),
        a: Number(lm.avgArousal ?? 0),
        v: Number(lm.avgValence ?? 0),
        e: Number(lm.avgExpectation ?? 0)
      }]
    }

    return []
  }, [sessionDetail, trendMode])

  const latestPoint = chartData[chartData.length - 1] || { a: 0, v: 0, e: 0 }

  const avg = useMemo(() => {
    if (!chartData.length) return { a: 0, v: 0, e: 0, peakV: 0 }
    const total = chartData.reduce((acc, p) => ({ a: acc.a + p.a, v: acc.v + p.v, e: acc.e + p.e }), { a: 0, v: 0, e: 0 })
    return {
      a: total.a / chartData.length,
      v: total.v / chartData.length,
      e: total.e / chartData.length,
      peakV: Math.max(...chartData.map((p) => p.v))
    }
  }, [chartData])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto h-12 w-64 animate-pulse rounded-xl bg-slate-200" />
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
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-premium md:p-8">
            <div className="mb-7 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Profiles</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Tap a profile to open insights</h2>
              <p className="mt-2 text-sm text-slate-500">Preview shows weekly average Arousal, Valence, Expectation</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {users.slice(0, 9).map((u, idx) => (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => {
                    setSelectedUser(u.userId)
                    setStage('dashboard')
                  }}
                  className="profile-pop overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-soft transition hover:-translate-y-1 hover:shadow-premium"
                  style={{ animationDelay: `${idx * 70}ms` }}
                >
                  <div className={`h-24 bg-gradient-to-br ${profileColors[idx % profileColors.length]} opacity-95`} />
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.count} total sessions</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Open</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-[10px] uppercase text-slate-400">A</p>
                        <p className="text-sm font-semibold text-slate-900">{formatValue(u.preview.a)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-[10px] uppercase text-slate-400">V</p>
                        <p className="text-sm font-semibold text-slate-900">{formatValue(u.preview.v)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-[10px] uppercase text-slate-400">E</p>
                        <p className="text-sm font-semibold text-slate-900">{formatValue(u.preview.e)}</p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
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

              <div className="ml-auto inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-soft">
                <button
                  type="button"
                  onClick={() => setTrendMode('daily')}
                  className={`rounded-lg px-3 py-1.5 text-sm ${trendMode === 'daily' ? 'bg-cyan-600 text-white' : 'text-slate-600'}`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setTrendMode('weekly')}
                  className={`rounded-lg px-3 py-1.5 text-sm ${trendMode === 'weekly' ? 'bg-cyan-600 text-white' : 'text-slate-600'}`}
                >
                  Weekly
                </button>
              </div>
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
                      <p className="text-xs uppercase tracking-widest text-slate-500">Trend Graph</p>
                      <h3 className="text-xl font-semibold text-slate-900">{selectedSession || 'No session selected'}</h3>
                    </div>
                    <p className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">updates every second</p>
                  </div>

                  <div className="h-[360px] rounded-2xl bg-gradient-to-b from-cyan-50 to-white p-2">
                    {chartData.length ? (
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
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-slate-500">
                        No per-second metrics stored for this session.
                      </div>
                    )}
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Avg A / V / E</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatValue(avg.a)} / {formatValue(avg.v)} / {formatValue(avg.e)}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Current A / V / E</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatValue(latestPoint.a)} / {formatValue(latestPoint.v)} / {formatValue(latestPoint.e)}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Session duration</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{Math.round(Number(sessionDetail?.durationSec || 0))}s</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                    <p className="text-xs uppercase text-slate-400">Peak Valence</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{formatValue(avg.peakV)}</p>
                  </article>
                </section>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
