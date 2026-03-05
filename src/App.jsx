import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { fetchSessionDetailsBulk, fetchSessions, fetchSessionsForUser } from './api'
import { groupUsers, preprocessUserReports } from './utils/reportPreprocessor'

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' }
]

const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'graph', label: 'Graph' }
]

const formatNumber = (value) => (Number.isFinite(value) ? value.toFixed(1) : '-')

function App() {
  const [sessions, setSessions] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [period, setPeriod] = useState('weekly')
  const [view, setView] = useState('overview')
  const [details, setDetails] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState(null)
  const [stage, setStage] = useState('profiles')
  const [zoomingProfileId, setZoomingProfileId] = useState('')
  const [movingIndex, setMovingIndex] = useState(0)

  const loadSessions = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingSessions(true)
      const data = await fetchSessions()
      setSessions(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoadingSessions(false)
    }
  }, [])

  useEffect(() => {
    loadSessions(false)
    const timer = setInterval(() => loadSessions(true), 12000)
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

  useEffect(() => {
    if (view !== 'graph' || report.buckets.length === 0) return undefined
    setMovingIndex(0)
    const timer = setInterval(() => {
      setMovingIndex((prev) => (prev + 1) % report.buckets.length)
    }, 900)
    return () => clearInterval(timer)
  }, [view, report.buckets])

  const selectedUser = users.find((user) => user.userId === selectedUserId)

  const profileNodes = useMemo(() => {
    return users.slice(0, 9).map((user, index) => {
      const angle = (index / Math.max(users.length, 1)) * Math.PI * 2
      const radius = index % 2 === 0 ? 34 : 24
      return {
        ...user,
        left: 50 + Math.cos(angle) * radius,
        top: 52 + Math.sin(angle) * radius
      }
    })
  }, [users])

  const movingPoint = report.buckets[movingIndex] || null

  const openProfile = (userId) => {
    setZoomingProfileId(userId)
    setSelectedUserId(userId)
    setTimeout(() => {
      setStage('dashboard')
      setView('overview')
      setZoomingProfileId('')
    }, 520)
  }

  return (
    <div className="scene-root">
      {stage === 'profiles' && (
        <section className="profiles-stage">
          <div className="profiles-header">
            <p className="eyebrow">Repository Experience</p>
            <h1>Choose A Profile</h1>
            <p className="subcopy">Tap a floating profile card to open its emotional story with animated analytics.</p>
          </div>

          <div className="profile-galaxy">
            <svg className="connection-map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {profileNodes.map((node) => (
                <line key={node.userId} x1="50" y1="50" x2={node.left} y2={node.top} />
              ))}
              <circle cx="50" cy="50" r="5.2" className="core-node" />
            </svg>

            {profileNodes.map((node, index) => (
              <button
                key={node.userId}
                type="button"
                className="profile-card"
                style={{ left: `${node.left}%`, top: `${node.top}%`, animationDelay: `${index * 70}ms` }}
                onClick={() => openProfile(node.userId)}
              >
                <div className="avatar">{(node.profileName || node.userId || 'U').charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{node.profileName || node.userId}</strong>
                  <small>{node.sessionCount} sessions</small>
                </div>
              </button>
            ))}
          </div>

          {loadingSessions && <div className="loading-strip">Syncing profiles...</div>}
          {error && <div className="error-strip">{error}</div>}

          {zoomingProfileId && <div className="zoom-overlay" />}
        </section>
      )}

      {stage === 'dashboard' && (
        <section className="dashboard-stage">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => setStage('profiles')}>
              Profiles
            </button>
            <div>
              <p className="eyebrow">{selectedUser?.profileName || selectedUserId}</p>
              <h2>Emotion Timeline</h2>
            </div>
            <div className="status-chip">{loadingDetails ? 'Updating...' : 'Live linked'}</div>
          </header>

          <section className="controls-row">
            <div className="pill-group">
              {PERIODS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={period === item.key ? 'active' : ''}
                  onClick={() => setPeriod(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="pill-group secondary">
              {VIEWS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={view === item.key ? 'active' : ''}
                  onClick={() => setView(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section className="stat-grid">
            <article className="stat-card">
              <p>Sessions</p>
              <h3>{report.summary.sessionCount}</h3>
            </article>
            <article className="stat-card">
              <p>Arousal</p>
              <h3>{formatNumber(report.summary.avgArousal)}</h3>
            </article>
            <article className="stat-card">
              <p>Valence</p>
              <h3>{formatNumber(report.summary.avgValence)}</h3>
            </article>
            <article className="stat-card">
              <p>Expectation</p>
              <h3>{formatNumber(report.summary.avgExpectation)}</h3>
            </article>
          </section>

          <section className="content-grid">
            <article className={`panel chart-panel ${view === 'graph' ? 'open' : ''}`}>
              <div className="panel-head">
                <h3>{view === 'graph' ? 'Animated Graph Mode' : 'Trend Snapshot'}</h3>
                <span>{period}</span>
              </div>

              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.buckets}>
                    <defs>
                      <linearGradient id="arousalFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#33d4ff" stopOpacity={0.46} />
                        <stop offset="100%" stopColor="#33d4ff" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="valenceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff8e43" stopOpacity={0.43} />
                        <stop offset="100%" stopColor="#ff8e43" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.12)" />
                    <XAxis dataKey="label" stroke="#98abc5" minTickGap={12} />
                    <YAxis stroke="#98abc5" domain={[0, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="avgArousal" stroke="#33d4ff" fill="url(#arousalFill)" strokeWidth={2.1} />
                    <Area type="monotone" dataKey="avgValence" stroke="#ff8e43" fill="url(#valenceFill)" strokeWidth={2.1} />
                    {view === 'graph' && movingPoint && (
                      <ReferenceDot
                        x={movingPoint.label}
                        y={movingPoint.avgValence}
                        r={6}
                        fill="#ffffff"
                        stroke="#ff8e43"
                        strokeWidth={3}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {view === 'graph' && movingPoint && (
                <div className="moving-readout">
                  <strong>{movingPoint.label}</strong>
                  <span>Valence {formatNumber(movingPoint.avgValence)}</span>
                  <span>Arousal {formatNumber(movingPoint.avgArousal)}</span>
                </div>
              )}
            </article>

            <article className="panel side-panel">
              <div className="panel-head">
                <h3>Emotion Composition</h3>
              </div>
              <div className="mini-chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.buckets.slice(-8)}>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.12)" />
                    <XAxis dataKey="label" stroke="#98abc5" hide />
                    <YAxis stroke="#98abc5" />
                    <Tooltip />
                    <Bar dataKey="happy" stackId="m" fill="#22c55e" />
                    <Bar dataKey="neutral" stackId="m" fill="#2a9dff" />
                    <Bar dataKey="sad" stackId="m" fill="#ff5f8e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ul className="insight-list">
                {report.insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          </section>
        </section>
      )}
    </div>
  )
}

export default App
