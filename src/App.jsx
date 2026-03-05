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

const niceTime = (value) => {
  const d = parseTime(value)
  if (!d) return '--:--:--'
  return d.toLocaleTimeString([], { hour12: false })
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 flex flex-col items-center justify-center gap-4 p-8">
        <div className="h-10 w-64 animate-pulse rounded-2xl bg-slate-200/80" />
        <div className="h-4 w-40 animate-pulse rounded-xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className={stage === 'profiles'
      ? 'min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40'
      : 'min-h-screen bg-gradient-to-b from-white to-slate-100 p-4 md:p-8'
    }>
      <div className={stage === 'profiles' ? 'w-full' : 'mx-auto w-full max-w-7xl'}>

        {stage === 'dashboard' && (
          <header className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-soft">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500" />
            <h1 className="text-xl font-semibold">Analytics</h1>
            <div className="h-9 w-9 rounded-full border border-slate-200 bg-white" />
          </header>
        )}

        {stage === 'profiles' && (
          <div className="mx-auto w-full max-w-5xl px-6">
            {/* ── Hero Header ── */}
            <header className="pt-16 pb-14 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-indigo-50/90 px-4 py-1.5 mb-6 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulseSoft" />
                <span className="text-[11px] font-semibold tracking-widest uppercase text-indigo-600">
                  Emotion Analytics Platform
                </span>
              </div>

              <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 mb-4 leading-tight">
                Select a{' '}
                <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 bg-clip-text text-transparent">
                  Profile
                </span>
              </h1>

              <p className="text-slate-500 text-lg max-w-md mx-auto leading-relaxed">
                Choose a participant to explore their biometric emotional analytics and session history.
              </p>

              <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {users.length} active profiles
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  {users.reduce((s, u) => s + u.count, 0)} total sessions
                </span>
              </div>
            </header>

            {/* ── Profile Cards Grid ── */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-24">
              {users.slice(0, 9).map((u, idx) => (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => {
                    setSelectedUser(u.userId)
                    setStage('dashboard')
                  }}
                  className="profile-pop group relative overflow-hidden rounded-3xl bg-white text-left shadow-premium ring-1 ring-slate-200/80 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_28px_60px_rgba(15,23,42,0.13)] hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  style={{ animationDelay: `${idx * 65}ms` }}
                >
                  {/* Gradient banner */}
                  <div className={`h-28 bg-gradient-to-br ${profileColors[idx % profileColors.length]} relative`}>
                    <div className="absolute inset-0 bg-black/10" />
                    {/* Session count badge */}
                    <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/95">
                        {u.count} session{u.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Decorative circles */}
                    <div className="absolute -bottom-3 -right-3 h-20 w-20 rounded-full bg-white/10" />
                    <div className="absolute -bottom-6 right-8 h-12 w-12 rounded-full bg-white/8" />
                  </div>

                  {/* Floating avatar */}
                  <div className="absolute left-5 top-16 h-16 w-16 rounded-2xl bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-2 ring-white flex items-center justify-center">
                    <span className={`text-2xl font-extrabold bg-gradient-to-br ${profileColors[idx % profileColors.length]} bg-clip-text text-transparent`}>
                      {(u.name || '?')[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Card content */}
                  <div className="px-5 pt-12 pb-5">
                    {/* Name & last active */}
                    <div className="mb-4">
                      <h2 className="text-[17px] font-bold text-slate-900 leading-tight">{u.name}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Last active{' '}
                        {u.latest
                          ? new Date(u.latest).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>

                    {/* Weekly avg stats */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[
                        { label: 'Arousal', value: u.preview.a, color: 'text-sky-600', bg: 'bg-sky-50' },
                        { label: 'Valence', value: u.preview.v, color: 'text-orange-500', bg: 'bg-orange-50' },
                        { label: 'Expect.', value: u.preview.e, color: 'text-violet-600', bg: 'bg-violet-50' }
                      ].map(({ label, value, color, bg }) => (
                        <div key={label} className={`rounded-xl ${bg} px-2 py-2.5 text-center`}>
                          <p className={`text-sm font-bold ${color}`}>{formatValue(value)}</p>
                          <p className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* CTA row */}
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 transition-colors duration-200 group-hover:bg-indigo-50">
                      <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600 transition-colors">
                        View Analytics
                      </span>
                      <span className="text-slate-300 group-hover:text-indigo-400 transition-all duration-200 group-hover:translate-x-0.5">
                        →
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
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
