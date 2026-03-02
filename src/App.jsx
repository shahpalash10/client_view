import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  API_URL,
  fetchSessionDetailsBulk,
  fetchSessions,
  fetchSessionsForUser
} from './api'
import { groupUsers, preprocessUserReports } from './utils/reportPreprocessor'

const PERIOD_OPTIONS = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: '7 Days' },
  { key: 'monthly', label: '30 Days' }
]

const formatDelta = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
const formatNumber = (value) => Number.isFinite(value) ? value.toFixed(1) : '-'

const moodLabel = (valence) => {
  if (valence >= 70) return 'Strongly positive'
  if (valence >= 55) return 'Balanced positive'
  if (valence >= 45) return 'Neutral'
  if (valence >= 30) return 'Low mood tendency'
  return 'Strained mood tendency'
}

function App() {
  const [sessions, setSessions] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [period, setPeriod] = useState('daily')
  const [details, setDetails] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  const loadSessions = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingSessions(true)
      const data = await fetchSessions()
      setSessions(data)
      setLastSync(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoadingSessions(false)
    }
  }, [])

  useEffect(() => {
    loadSessions(false)
    const timer = setInterval(() => loadSessions(true), 15000)
    return () => clearInterval(timer)
  }, [loadSessions])

  const users = useMemo(() => groupUsers(sessions), [sessions])

  useEffect(() => {
    if (!selectedUserId && users.length) {
      setSelectedUserId(users[0].userId)
    }
  }, [users, selectedUserId])

  const loadUserDetails = useCallback(async () => {
    if (!selectedUserId) {
      setDetails([])
      return
    }

    setLoadingDetails(true)
    try {
      const userSessions = await fetchSessionsForUser(selectedUserId)
      const sessionIds = userSessions.slice(0, 180).map((session) => session.id)
      const fullDetails = await fetchSessionDetailsBulk(sessionIds, 6)
      setDetails(fullDetails)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingDetails(false)
    }
  }, [selectedUserId])

  useEffect(() => {
    loadUserDetails()
  }, [loadUserDetails])

  const selectedUserSessions = useMemo(
    () => sessions.filter((session) => session.userId === selectedUserId),
    [sessions, selectedUserId]
  )

  const report = useMemo(
    () => preprocessUserReports({ sessions: selectedUserSessions, details, period }),
    [selectedUserSessions, details, period]
  )

  const selectedUser = users.find((user) => user.userId === selectedUserId)
  const summary = report.summary

  const downloadReport = useCallback(() => {
    const payload = {
      api: API_URL,
      userId: selectedUserId,
      profileName: selectedUser?.profileName,
      ...report
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `emotion-report-${selectedUserId || 'user'}-${period}-${Date.now()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }, [period, report, selectedUser, selectedUserId])

  return (
    <div className="page-shell">
      <div className="gradient-orb orb-a" aria-hidden />
      <div className="gradient-orb orb-b" aria-hidden />

      <header className="hero">
        <div>
          <p className="eyebrow">Emotion Intelligence</p>
          <h1>How Are You Doing Over Time?</h1>
          <p className="subtitle">
            A clean, private summary of your daily, weekly, and monthly emotional trends.
          </p>
        </div>
        <div className="sync-chip">
          <span className="dot" />
          {lastSync ? `Updated ${lastSync.toLocaleTimeString()}` : 'Syncing'}
        </div>
      </header>

      <section className="control-panel">
        <label>
          Person
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            {users.length === 0 && <option value="">No users found</option>}
            {users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.profileName} ({user.sessionCount} sessions)
              </option>
            ))}
          </select>
        </label>

        <div className="period-tabs" role="tablist" aria-label="Report period">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={period === option.key ? 'active' : ''}
              onClick={() => setPeriod(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button type="button" className="outline" onClick={() => loadSessions(false)}>
          Refresh
        </button>
        <button type="button" className="solid" onClick={downloadReport} disabled={!selectedUserId}>
          Export Report
        </button>
      </section>

      {error && <div className="error-banner">{error}</div>}
      {(loadingSessions || loadingDetails) && <div className="loading">Loading your insights...</div>}

      <section className="kpi-grid">
        <article className="kpi-card">
          <p>Sessions</p>
          <h3>{summary.sessionCount}</h3>
          <small>{selectedUserSessions.filter((session) => !session.endedAt).length} live now</small>
        </article>
        <article className="kpi-card">
          <p>Energy</p>
          <h3>{formatNumber(summary.avgArousal)}</h3>
          <small>{formatDelta(summary.deltas.arousal)} vs previous window</small>
        </article>
        <article className="kpi-card">
          <p>Mood</p>
          <h3>{formatNumber(summary.avgValence)}</h3>
          <small>{moodLabel(summary.avgValence)}</small>
        </article>
        <article className="kpi-card">
          <p>Outlook</p>
          <h3>{formatNumber(summary.avgExpectation)}</h3>
          <small>{formatDelta(summary.deltas.expectation)} vs previous window</small>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel large">
          <div className="panel-header">
            <h2>Trend Story</h2>
            <span>{PERIOD_OPTIONS.find((p) => p.key === period)?.label}</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.buckets}>
                <defs>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip />
                <Area type="monotone" dataKey="avgArousal" stroke="#22d3ee" fill="url(#gA)" strokeWidth={2.2} />
                <Area type="monotone" dataKey="avgValence" stroke="#f97316" fill="url(#gV)" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Emotion Balance</h2>
            <span>Happy / Neutral / Sad</span>
          </div>
          <div className="chart-wrap small">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="label" stroke="#94a3b8" hide />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="happy" stackId="a" fill="#22c55e" />
                <Bar dataKey="neutral" stackId="a" fill="#0ea5e9" />
                <Bar dataKey="sad" stackId="a" fill="#fb7185" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Plain-Language Insights</h2>
            <span>{selectedUser?.profileName || 'User'}</span>
          </div>
          <ul className="insight-list">
            {report.insights.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>
              Latest pattern: <strong>{summary.latest?.dominantEmotion || 'n/a'}</strong> emotion dominates this window.
            </li>
            <li>
              Report includes <strong>{summary.metricPoints}</strong> metric snapshots across <strong>{summary.sessionCount}</strong> sessions.
            </li>
          </ul>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent Sessions</h2>
          <span>{selectedUserSessions.length} total</span>
        </div>
        <div className="session-table-wrap">
          <table className="session-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Started</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Latest A / V / E</th>
              </tr>
            </thead>
            <tbody>
              {selectedUserSessions.slice(0, 20).map((session) => (
                <tr key={session.id}>
                  <td>{session.id}</td>
                  <td>{new Date(session.startedAt).toLocaleString()}</td>
                  <td>{session.endedAt ? 'Completed' : 'Live'}</td>
                  <td>{session.durationSec ? `${Math.round(session.durationSec)}s` : 'Live'}</td>
                  <td>
                    {session.latestMetrics
                      ? `${formatNumber(session.latestMetrics.avgArousal)} / ${formatNumber(session.latestMetrics.avgValence)} / ${formatNumber(session.latestMetrics.avgExpectation)}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App
