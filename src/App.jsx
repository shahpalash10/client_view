import { useEffect, useMemo, useState } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  ComposedChart
} from 'recharts'
import { fetchAllSessions, fetchSessionById } from './api'

const FALLBACK_SESSIONS = Array.from({ length: 7 }, (_, i) => ({ id: `Session ${i + 1}` }))

const asMetricValue = (metric = {}) => {
  if (Number.isFinite(metric.value)) return metric.value
  if (Number.isFinite(metric.avgValence)) return metric.avgValence
  if (Number.isFinite(metric.avgArousal)) return metric.avgArousal
  if (Number.isFinite(metric.avgExpectation)) return metric.avgExpectation
  return null
}

const formatClock = (stamp) => {
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString([], { hour12: false })
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulseSoft rounded-xl bg-slate-100" />
      <div className="h-72 animate-pulseSoft rounded-3xl bg-slate-100" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulseSoft rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [expandedSession, setExpandedSession] = useState('')
  const [selectedSession, setSelectedSession] = useState('')
  const [stream, setStream] = useState([])
  const [durationSec, setDurationSec] = useState(0)

  useEffect(() => {
    let active = true

    ;(async () => {
      setLoading(true)
      const apiSessions = await fetchAllSessions()
      const normalized = (apiSessions || []).map((s) => ({ id: s.id || s.sessionId })).filter((s) => s.id)
      const finalSessions = normalized.length ? normalized.slice(0, 7) : FALLBACK_SESSIONS
      if (!active) return
      setSessions(finalSessions)
      setExpandedSession(finalSessions[0]?.id || '')
      setSelectedSession(finalSessions[0]?.id || '')
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedSession) return undefined

    let cancelled = false

    const poll = async () => {
      try {
        const detail = await fetchSessionById(selectedSession)
        if (cancelled) return

        const metrics = detail.metrics || []
        const lastMetric = metrics[metrics.length - 1] || detail.latestMetrics || {}
        const currentValue = asMetricValue(lastMetric)
        if (!Number.isFinite(currentValue)) return

        setDurationSec(Math.round(Number(detail.durationSec || 0)))

        setStream((prev) => {
          const nextPoint = {
            t: formatClock(lastMetric.timestamp || Date.now()),
            value: Number(currentValue.toFixed(2)),
            rawTs: lastMetric.timestamp || Date.now()
          }
          return [...prev.slice(-59), nextPoint]
        })
      } catch {
        // keep UI stable if one poll fails
      }
    }

    setStream([])
    poll()
    const timer = setInterval(poll, 1000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedSession])

  const metrics = useMemo(() => {
    const values = stream.map((p) => p.value)
    const current = values[values.length - 1] || 0
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    const peak = values.length ? Math.max(...values) : 0

    return [
      { label: 'Average Value', value: avg.toFixed(2) },
      { label: 'Current Value', value: current.toFixed(2) },
      { label: 'Session Duration', value: `${durationSec}s` },
      { label: 'Peak Value', value: peak.toFixed(2) }
    ]
  }, [durationSec, stream])

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 px-4 py-6 text-slate-900 md:px-10">
      <nav className="mx-auto mb-6 flex w-full max-w-7xl items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-soft backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500" />
          <span className="text-sm font-semibold tracking-wide">SV</span>
        </div>

        <h1 className="text-lg font-semibold md:text-2xl">Session Analytics</h1>

        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white shadow-soft transition hover:scale-[1.03]"
          >
            <span className="text-sm font-bold">P</span>
          </button>

          {dropdownOpen && (
            <div className="animate-slideDown absolute right-0 z-20 mt-3 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-premium">
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white">
                  PS
                </div>
                <div>
                  <p className="text-sm font-semibold">Palash Shah</p>
                  <p className="text-xs text-slate-500">Premium plan</p>
                </div>
              </div>

              <div className="space-y-2">
                {sessions.map((session) => (
                  <div key={session.id} className="rounded-xl border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium transition hover:bg-slate-50"
                      onClick={() => setExpandedSession((prev) => (prev === session.id ? '' : session.id))}
                    >
                      {session.id}
                      <span className="text-slate-400">{expandedSession === session.id ? '−' : '+'}</span>
                    </button>
                    {expandedSession === session.id && (
                      <button
                        type="button"
                        className="w-full rounded-b-xl bg-slate-50 px-3 py-2 text-left text-xs font-medium text-cyan-700 transition hover:bg-cyan-50"
                        onClick={() => {
                          setSelectedSession(session.id)
                          setDropdownOpen(false)
                        }}
                      >
                        Open analytics
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl space-y-6">
        {loading ? (
          <Skeleton />
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-premium md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Live Graph</p>
                  <h2 className="text-xl font-semibold">{selectedSession || 'Session'}</h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
                  Updates every second
                </span>
              </div>

              <div className="h-[360px] w-full rounded-2xl bg-gradient-to-b from-cyan-50/70 to-white p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stream}>
                    <defs>
                      <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe7f3" />
                    <XAxis dataKey="t" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)'
                      }}
                    />
                    <Area type="monotone" dataKey="value" fill="url(#lineFill)" stroke="none" />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#0891b2"
                      strokeWidth={3}
                      dot={{ r: 0 }}
                      activeDot={{ r: 6, fill: '#fff', stroke: '#0891b2', strokeWidth: 3 }}
                      isAnimationActive
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {metrics.map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-premium"
                >
                  <p className="text-xs uppercase tracking-wider text-slate-400">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                </article>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
