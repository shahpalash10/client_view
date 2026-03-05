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

const profileColors = [
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-pink-600'
]

const dayMs = 24 * 60 * 60 * 1000

const mapPoint = (m, source) => {
  const ts = parseTime(m?.timestamp || m?.createdAt || m?.time)
  if (!ts) return null

  const a = Number(source === 'voice' ? (m?.arousal ?? m?.avgArousal) : (m?.avgArousal ?? m?.arousal))
  const v = Number(source === 'voice' ? (m?.valence ?? m?.avgValence) : (m?.avgValence ?? m?.valence))
  const e = Number(source === 'voice' ? (m?.expectation ?? m?.avgExpectation) : (m?.avgExpectation ?? m?.expectation))

  return {
    ts: ts.getTime(),
    t: ts.toLocaleTimeString([], { hour12: false }),
    a: Number.isFinite(a) ? a : null,
    v: Number.isFinite(v) ? v : null,
    e: Number.isFinite(e) ? e : null
  }
}

export default function App() {
  const [stage, setStage] = useState('profiles')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [userSessions, setUserSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState('')
  const [sessionDetail, setSessionDetail] = useState(null)
  const [trendMode, setTrendMode] = useState('weekly')
  const [signalType, setSignalType] = useState('face')
  const [analysisView, setAnalysisView] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

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

        if (started && now - started.getTime() <= 7 * dayMs && latest) {
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
      setSessionDetail(null)
      setAnalysisView('')
    })()

    return () => {
      live = false
    }
  }, [selectedUser])

  useEffect(() => {
    if (!selectedSession) return

    let cancelled = false

    const load = async () => {
      try {
        const detail = await fetchSessionById(selectedSession)
        if (cancelled) return
        setSessionDetail(detail)
      } catch {
        if (!cancelled) setSessionDetail(null)
      }
    }

    load()
    const timer = setInterval(load, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedSession])

  useEffect(() => {
    setSignalType('face')
    setAnalysisView('')
  }, [selectedSession])

  const hasVoiceData = (sessionDetail?.voiceMetrics?.length || 0) > 0

  const chartData = useMemo(() => {
    if (!sessionDetail) return []

    const sourceMetrics = signalType === 'voice'
      ? (sessionDetail.voiceMetrics || [])
      : (sessionDetail.metrics || [])

    const metrics = sourceMetrics
      .map((m) => mapPoint(m, signalType))
      .filter(Boolean)

    if (!metrics.length) return []

    if (trendMode === 'daily') {
      const start = selectedDate.getTime()
      const end = start + dayMs
      return metrics
        .filter((m) => m.ts >= start && m.ts < end)
        .sort((a, b) => a.ts - b.ts)
        .slice(-300)
    }

    const pts = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = selectedDate.getTime() - i * dayMs
      const dayEnd = dayStart + dayMs
      const dayMetrics = metrics.filter((m) => m.ts >= dayStart && m.ts < dayEnd)
      if (dayMetrics.length) {
        const total = dayMetrics.reduce(
          (acc, m) => ({
            a: acc.a + (Number.isFinite(m.a) ? m.a : 0),
            v: acc.v + (Number.isFinite(m.v) ? m.v : 0),
            e: acc.e + (Number.isFinite(m.e) ? m.e : 0)
          }),
          { a: 0, v: 0, e: 0 }
        )
        pts.push({
          ts: dayStart,
          t: new Date(dayStart).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          a: total.a / dayMetrics.length,
          v: total.v / dayMetrics.length,
          e: total.e / dayMetrics.length
        })
      } else {
        pts.push({
          ts: dayStart,
          t: new Date(dayStart).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          a: null,
          v: null,
          e: null
        })
      }
    }

    return pts
  }, [sessionDetail, signalType, trendMode, selectedDate])

  const latestPoint = chartData[chartData.length - 1] || { a: 0, v: 0, e: 0 }

  const avg = useMemo(() => {
    if (!chartData.length) return { a: 0, v: 0, e: 0, peakV: 0 }
    const numeric = chartData.filter((p) => Number.isFinite(p.a) || Number.isFinite(p.v) || Number.isFinite(p.e))
    if (!numeric.length) return { a: 0, v: 0, e: 0, peakV: 0 }
    const total = numeric.reduce(
      (acc, p) => ({
        a: acc.a + (Number.isFinite(p.a) ? p.a : 0),
        v: acc.v + (Number.isFinite(p.v) ? p.v : 0),
        e: acc.e + (Number.isFinite(p.e) ? p.e : 0)
      }),
      { a: 0, v: 0, e: 0 }
    )
    return {
      a: total.a / numeric.length,
      v: total.v / numeric.length,
      e: total.e / numeric.length,
      peakV: Math.max(...numeric.map((p) => (Number.isFinite(p.v) ? p.v : -Infinity))) || 0
    }
  }, [chartData])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 flex items-center justify-center p-8">
        <div className="h-10 w-64 animate-pulse rounded-2xl bg-slate-200/80" />
      </div>
    )
  }

  return (
    <div className={stage === 'profiles' ? 'min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-8' : 'min-h-screen bg-gradient-to-b from-white to-slate-100 p-4 md:p-8'}>
      {stage === 'profiles' && (
        <section className="relative mx-auto w-full max-w-6xl px-2 pb-12">
          <div className="relative overflow-hidden rounded-[44px] bg-gradient-to-br from-sky-600 via-indigo-600 to-cyan-500 px-8 py-12 text-white shadow-[0_30px_90px_rgba(14,37,102,0.35)]">
            <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.6em] text-white/70">Client Repository</p>
                <h1 className="text-[clamp(2rem,5vw,3.8rem)] font-semibold leading-tight">Immersive Emotion Profiles</h1>
                <p className="max-w-2xl text-base text-white/85">
                  Where every capture session becomes a living story. Pick a profile to drop straight into their
                  realtime dashboard, complete with face and voice mood trends.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-200" />
                    {users.length} active profiles
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-1.5">
                    <span className="h-2 w-2 animate-ping rounded-full bg-white/70" />
                    Live pipeline ready
                  </span>
                </div>
              </div>
              <div className="rounded-[28px] bg-white/15 p-6 text-sm text-white/90 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.4em] text-white/70">Now streaming</p>
                <p className="mt-3 text-3xl font-semibold">Face + Voice</p>
                <p className="mt-2 text-white/75">Switch sources inside each session analysis panel.</p>
              </div>
            </div>

            <div className="pointer-events-none">
              <div className="hero-bubble hero-bubble--one" />
              <div className="hero-bubble hero-bubble--two" />
              <div className="hero-bubble hero-bubble--three" />
            </div>
          </div>

          <div className="relative -mt-14 flex flex-wrap justify-center gap-8 rounded-[40px] bg-white/70 px-2 pb-6 pt-16 shadow-[0_35px_80px_rgba(15,23,42,0.15)] backdrop-blur">
            {users.map((u, idx) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => {
                  setSelectedUser(u.userId)
                  setStage('dashboard')
                }}
                className="profile-card group relative w-full max-w-sm overflow-hidden rounded-[32px] border border-white/40 bg-white/90 text-left shadow-[0_30px_60px_rgba(15,23,42,0.14)] transition-all hover:-translate-y-2 hover:border-cyan-200 hover:shadow-[0_35px_90px_rgba(15,23,42,0.2)]"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className={`h-40 bg-gradient-to-r ${profileColors[idx % profileColors.length]} relative overflow-hidden`}> 
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_55%)]" />
                  <span className="absolute -bottom-4 right-4 h-16 w-16 rounded-full bg-white/30 blur-2xl" />
                </div>
                <div className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">{u.name}</h2>
                      <p className="text-sm text-slate-500">{u.count} total sessions</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Open</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm font-semibold text-slate-900">
                    <div className="rounded-2xl bg-sky-50/90 p-3">
                      <p className="text-xs font-medium text-slate-500">Arousal</p>
                      <p className="text-lg">{formatValue(u.preview.a)}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50/90 p-3">
                      <p className="text-xs font-medium text-slate-500">Valence</p>
                      <p className="text-lg">{formatValue(u.preview.v)}</p>
                    </div>
                    <div className="rounded-2xl bg-violet-50/90 p-3">
                      <p className="text-xs font-medium text-slate-500">Expectation</p>
                      <p className="text-lg">{formatValue(u.preview.e)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Updated {u.latest ? new Date(u.latest).toLocaleDateString() : '—'}</span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Pipeline ready
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {stage === 'dashboard' && (
        <section className="mx-auto w-full max-w-7xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
              onClick={() => setStage('profiles')}
            >
              Back
            </button>
            <p className="text-sm text-slate-600">{users.find((u) => u.userId === selectedUser)?.name || selectedUser}</p>

            {analysisView && (
              <div className="ml-auto flex items-center gap-3">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
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

                <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate((d) => {
                        const nd = new Date(d)
                        nd.setDate(nd.getDate() - (trendMode === 'daily' ? 1 : 7))
                        nd.setHours(0, 0, 0, 0)
                        return nd
                      })
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1"
                  >
                    ‹
                  </button>

                  <div className="px-2">
                    {trendMode === 'daily'
                      ? selectedDate.toLocaleDateString()
                      : `${new Date(selectedDate.getTime() - 6 * dayMs).toLocaleDateString([], { month: 'short', day: 'numeric' })} — ${selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate((d) => {
                        const nd = new Date(d)
                        nd.setDate(nd.getDate() + (trendMode === 'daily' ? 1 : 7))
                        nd.setHours(0, 0, 0, 0)
                        return nd
                      })
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[300px,1fr]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
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
                {!userSessions.length && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    No sessions for this profile.
                  </div>
                )}
              </div>
            </aside>

            <div className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_40px_rgba(15,23,42,0.06)]">
                {!selectedSession && (
                  <div className="grid h-[360px] place-items-center rounded-2xl bg-gradient-to-b from-slate-50 to-white text-sm text-slate-500">
                    Select a session from the left panel.
                  </div>
                )}

                {selectedSession && !analysisView && (
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-slate-900">{selectedSession}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSignalType('face')
                          setAnalysisView('face')
                        }}
                        className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                      >
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">◉</div>
                        <p className="text-lg font-semibold text-slate-900">Face</p>
                        <p className="mt-1 text-sm text-slate-500">Open face emotion trend graph</p>
                      </button>

                      <button
                        type="button"
                        disabled={!hasVoiceData}
                        onClick={() => {
                          setSignalType('voice')
                          setAnalysisView('voice')
                        }}
                        className={`group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md ${!hasVoiceData ? 'cursor-not-allowed opacity-45' : ''}`}
                      >
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">◌</div>
                        <p className="text-lg font-semibold text-slate-900">Voice</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {hasVoiceData ? 'Open voice emotion trend graph' : 'No voice data for this session'}
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {selectedSession && analysisView && (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">{selectedSession}</h3>
                        <p className="text-xs text-slate-500">{signalType === 'face' ? 'Face' : 'Voice'} · updates every second</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAnalysisView('')}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600"
                      >
                        Change source
                      </button>
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
                          No {signalType} metrics stored for this session.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>

              <section className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${analysisView ? '' : 'opacity-40'}`}>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-400">Avg A / V / E</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatValue(avg.a)} / {formatValue(avg.v)} / {formatValue(avg.e)}
                  </p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-400">Current A / V / E</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatValue(latestPoint.a)} / {formatValue(latestPoint.v)} / {formatValue(latestPoint.e)}
                  </p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-400">Session duration</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{Math.round(Number(sessionDetail?.durationSec || 0))}s</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-400">Peak Valence</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{formatValue(avg.peakV)}</p>
                </article>
              </section>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
