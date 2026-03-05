import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

const QUADRANT_STYLES = {
  waku: {
    gradient: 'from-orange-500/30 to-pink-500/30',
    glow: 'rgba(249,115,22,0.45)',
    palette: ['#f97316', '#ec4899']
  },
  doki: {
    gradient: 'from-purple-500/30 to-indigo-500/30',
    glow: 'rgba(168,85,247,0.45)',
    palette: ['#a855f7', '#6366f1']
  },
  ease: {
    gradient: 'from-emerald-500/30 to-teal-500/30',
    glow: 'rgba(16,185,129,0.45)',
    palette: ['#10b981', '#14b8a6']
  },
  discourage: {
    gradient: 'from-slate-600/30 to-gray-600/30',
    glow: 'rgba(148,163,184,0.35)',
    palette: ['#475569', '#94a3b8']
  }
}

const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(255,255,255,${alpha})`
  let normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    normalized = normalized.split('').map((char) => char + char).join('')
  }
  const intVal = parseInt(normalized, 16)
  const r = (intVal >> 16) & 255
  const g = (intVal >> 8) & 255
  const b = intVal & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const quadrantBackgroundStyle = (key, isActive) => {
  const palette = QUADRANT_STYLES[key]?.palette || ['#d4d4d8', '#f4f4f5']
  const depth = isActive ? 0.55 : 0.15
  const secondary = isActive ? depth * 0.65 : depth * 0.4
  const greyOverlay = isActive ? 'rgba(15,23,42,0.12)' : 'rgba(15,23,42,0.04)'
  const glow = QUADRANT_STYLES[key]?.glow
  return {
    backgroundImage: `linear-gradient(135deg, ${hexToRgba(palette[0], depth)}, ${hexToRgba(palette[1], secondary)})`,
    boxShadow: isActive && glow ? `0 35px 70px -45px ${glow}` : 'inset 0 0 0 1px rgba(15,23,42,0.03)',
    borderColor: isActive ? 'rgba(15,23,42,0.18)' : 'rgba(15,23,42,0.08)',
    filter: isActive ? 'saturate(1.05)' : 'saturate(0.75)',
    transition: 'all 220ms ease',
    backgroundBlendMode: 'multiply',
    backgroundColor: greyOverlay
  }
}

const clampMetric = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(100, Math.max(0, numeric))
}

const formatTimestamp = (timestamp, fallback) => {
  if (!timestamp) return `t-${fallback}`
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? `t-${fallback}`
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const resolveQuadrantKey = (arousal, valence, arousalPivot, valencePivot) => {
  const highArousal = clampMetric(arousal) >= arousalPivot
  const highValence = clampMetric(valence) >= valencePivot

  if (highArousal && highValence) return 'waku'
  if (highArousal && !highValence) return 'doki'
  if (!highArousal && highValence) return 'ease'
  return 'discourage'
}

function PredictionDisplay({ predictions, connectionState, activeThresholds, voicePredictions = [], voiceCaptureActive = false }) {
  const { t, language } = useLanguage()
  const latestPrediction = predictions.length ? predictions[predictions.length - 1] : null
  const latestVoicePrediction = voicePredictions.length ? voicePredictions[voicePredictions.length - 1] : null

  const arousalPivot = useMemo(() => {
    const happy = Number(activeThresholds?.happyArousal)
    const sad = Number(activeThresholds?.sadArousal)
    if (Number.isFinite(happy) && Number.isFinite(sad)) {
      return (happy + sad) / 2
    }
    if (Number.isFinite(happy)) return happy
    return 55
  }, [activeThresholds])

  const avgStats = useMemo(() => {
    if (!predictions.length) {
      return { arousal: 0, valence: 0, expectation: 0 }
    }
    const totals = predictions.reduce((acc, pred) => {
      acc.arousal += clampMetric(pred.arousal)
      acc.valence += clampMetric(pred.valence)
      acc.expectation += clampMetric(pred.expectation)
      return acc
    }, { arousal: 0, valence: 0, expectation: 0 })

    return {
      arousal: totals.arousal / predictions.length,
      valence: totals.valence / predictions.length,
      expectation: totals.expectation / predictions.length
    }
  }, [predictions])

  const valencePivot = predictions.length ? avgStats.valence : 55
  const voiceArousalPivot = useMemo(() => {
    if (!voicePredictions.length) return 55
    const vals = voicePredictions.map(v => clampMetric(v.arousal))
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }, [voicePredictions])

  const voiceValencePivot = useMemo(() => {
    if (!voicePredictions.length) return 55
    const vals = voicePredictions.map(v => clampMetric(v.valence))
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }, [voicePredictions])

  const chartData = useMemo(() => (
    predictions.slice(-60).map((pred, idx) => ({
      idx,
      time: formatTimestamp(pred.timestamp, idx),
      arousal: clampMetric(pred.arousal),
      valence: clampMetric(pred.valence),
      expectation: clampMetric(pred.expectation)
    }))
  ), [predictions])

  const quadrantCounts = useMemo(() => {
    return predictions.reduce((acc, pred) => {
      const key = resolveQuadrantKey(pred.arousal, pred.valence, arousalPivot, valencePivot)
      acc[key] += 1
      return acc
    }, { waku: 0, doki: 0, ease: 0, discourage: 0 })
  }, [predictions, arousalPivot, valencePivot])

  const voiceQuadrantCounts = useMemo(() => {
    return voicePredictions.reduce((acc, pred) => {
      const key = resolveQuadrantKey(pred.arousal, pred.valence, voiceArousalPivot, voiceValencePivot)
      acc[key] += 1
      return acc
    }, { waku: 0, doki: 0, ease: 0, discourage: 0 })
  }, [voicePredictions, voiceArousalPivot, voiceValencePivot])

  const totalQuadrantSamples = Object.values(quadrantCounts).reduce((sum, count) => sum + count, 0)
  const totalVoiceQuadrantSamples = Object.values(voiceQuadrantCounts).reduce((sum, count) => sum + count, 0)
  const latestQuadrantKey = latestPrediction
    ? resolveQuadrantKey(latestPrediction.arousal, latestPrediction.valence, arousalPivot, valencePivot)
    : null

  const visualQuadrantKey = latestPrediction
    ? resolveQuadrantKey(latestPrediction.arousal, latestPrediction.valence, 50, 50)
    : null
  const voiceVisualQuadrantKey = latestVoicePrediction
    ? resolveQuadrantKey(latestVoicePrediction.arousal, latestVoicePrediction.valence, 50, 50)
    : null
  const localizedQuadrants = useMemo(() => {
    return Object.entries(QUADRANT_STYLES).reduce((acc, [key, style]) => {
      acc[key] = {
        ...style,
        label: t(`quadrants.${key}.label`),
        tagline: t(`quadrants.${key}.tagline`),
        description: t(`quadrants.${key}.description`)
      }
      return acc
    }, {})
  }, [language, t])

  const latestQuadrant = latestQuadrantKey ? localizedQuadrants[latestQuadrantKey] : null
  const latestVoiceQuadrant = voiceVisualQuadrantKey ? localizedQuadrants[voiceVisualQuadrantKey] : null

  const [displayValues, setDisplayValues] = useState({ arousal: 0, valence: 0, expectation: 0 })

  useEffect(() => {
    if (!latestPrediction) return
    const timer = setTimeout(() => {
      setDisplayValues((prev) => ({
        arousal: prev.arousal + (clampMetric(latestPrediction.arousal) - prev.arousal) * 0.25,
        valence: prev.valence + (clampMetric(latestPrediction.valence) - prev.valence) * 0.25,
        expectation: prev.expectation + (clampMetric(latestPrediction.expectation) - prev.expectation) * 0.25
      }))
    }, 60)
    return () => clearTimeout(timer)
  }, [latestPrediction])

  const latestPointStyle = latestPrediction ? {
    left: `calc(${clampMetric(latestPrediction.valence)}% - 8px)`,
    bottom: `calc(${clampMetric(latestPrediction.arousal)}% - 8px)`
  } : { left: 'calc(50% - 8px)', bottom: 'calc(50% - 8px)' }

  const hasConfidence = Number.isFinite(Number(latestPrediction?.confidence))

  const quadrantGrid = [
    ['doki', 'waku'],
    ['discourage', 'ease']
  ]
  const connectionLabel = t(`app.connection.states.${connectionState}`) || connectionState
  const expectationIntensity = clampMetric(displayValues.expectation) / 100 || 0
  const metricCards = [
    { key: 'arousal', label: t('predictions.metrics.arousal'), value: displayValues.arousal },
    { key: 'valence', label: t('predictions.metrics.valence'), value: displayValues.valence },
    { key: 'expectation', label: t('predictions.metrics.expectation'), value: displayValues.expectation }
  ]
  const activeDotPalette = QUADRANT_STYLES[visualQuadrantKey]?.palette
  const quadrantDotStyle = {
    ...latestPointStyle,
    background: activeDotPalette
      ? `radial-gradient(circle at 25% 30%, ${hexToRgba('#ffffff', 0.95)}, ${hexToRgba(activeDotPalette[0], 0.55)} 65%)`
      : '#ffffff',
    boxShadow: activeDotPalette
      ? `0 12px 25px ${hexToRgba(activeDotPalette[0], 0.35)}`
      : '0 10px 25px rgba(0,0,0,0.15)',
    borderColor: 'rgba(255,255,255,0.9)'
  }

  const voiceDotStyle = latestVoicePrediction ? {
    left: `calc(${clampMetric(latestVoicePrediction.valence)}% - 8px)`,
    bottom: `calc(${clampMetric(latestVoicePrediction.arousal)}% - 8px)`
  } : { left: 'calc(50% - 8px)', bottom: 'calc(50% - 8px)' }

  const voiceActivePalette = QUADRANT_STYLES[voiceVisualQuadrantKey]?.palette
  const voiceQuadrantDotStyle = {
    ...voiceDotStyle,
    background: voiceActivePalette
      ? `radial-gradient(circle at 25% 30%, ${hexToRgba('#ffffff', 0.95)}, ${hexToRgba(voiceActivePalette[0], 0.55)} 65%)`
      : '#ffffff',
    boxShadow: voiceActivePalette
      ? `0 12px 25px ${hexToRgba(voiceActivePalette[0], 0.35)}`
      : '0 10px 25px rgba(0,0,0,0.15)',
    borderColor: 'rgba(255,255,255,0.9)'
  }

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-white p-8 shadow-[0_40px_120px_rgba(15,23,42,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.08),_transparent_45%)]" />
      <div className="relative space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{t('predictions.headingEyebrow')}</p>
            <h2 className="text-3xl font-semibold text-zinc-900">{t('predictions.headingTitle')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
              connectionState === 'connected'
                ? 'border-emerald-500/40 text-emerald-600'
                : connectionState === 'connecting'
                ? 'border-amber-500/40 text-amber-600'
                : 'border-zinc-300 text-zinc-500'
            }`}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
              <span className="capitalize">{connectionLabel}</span>
            </div>
            <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              voiceCaptureActive
                ? 'border-indigo-500/40 text-indigo-600'
                : 'border-zinc-300 text-zinc-500'
            }`}>
              <span className={`h-2 w-2 rounded-full ${voiceCaptureActive ? 'bg-indigo-500' : 'bg-zinc-300'}`} />
              <span>{voiceCaptureActive ? 'Mic active' : 'Mic idle'}</span>
              <span className="text-zinc-400">• {voicePredictions.length} samples</span>
            </div>
          </div>
        </div>

        {latestPrediction || latestVoicePrediction ? (
          <>
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{t('predictions.quadrantLabel')}</p>
                    <p className="text-4xl font-light text-zinc-900">{latestQuadrant?.label || t('predictions.headingTitle')}</p>
                    <p className="text-sm text-zinc-500">{latestQuadrant?.tagline}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-500">{latestQuadrant?.description}</p>
                  <div className="grid gap-4 md:grid-cols-3">
                    {metricCards.map(({ key, label, value }) => {
                      const isExpectation = key === 'expectation'
                      const glowStrength = isExpectation ? 0.25 + expectationIntensity * 0.5 : 0
                      return (
                        <div
                          key={key}
                          className="relative overflow-hidden rounded-2xl border border-black/5 bg-zinc-50 p-4"
                          style={isExpectation ? { boxShadow: `0 25px 60px rgba(255,255,255,${glowStrength})` } : undefined}
                        >
                          {isExpectation && (
                            <div
                              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.8),_transparent_65%)]"
                              style={{ opacity: glowStrength }}
                            />
                          )}
                          <p className="relative text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
                          <p className="relative text-3xl font-light text-zinc-900">{value.toFixed(1)}%</p>
                          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className={`h-full rounded-full ${isExpectation ? 'bg-gradient-to-r from-white via-zinc-300 to-zinc-200' : 'bg-gradient-to-r from-black via-zinc-600 to-zinc-300'}`}
                              style={{ width: `${clampMetric(value)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {hasConfidence && (
                    <p className="text-xs text-zinc-500">{t('predictions.confidence', { value: latestPrediction.confidence.toFixed(1) })}</p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-black/5 bg-gradient-to-br from-white to-zinc-50 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{t('predictions.digestTitle')}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-black/5 bg-white p-4">
                    <p className="text-xs text-zinc-500">{t('predictions.samplesCaptured')}</p>
                    <p className="text-3xl font-light text-zinc-900">{predictions.length}</p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-white p-4">
                    <p className="text-xs text-zinc-500">{t('predictions.avgExpectation')}</p>
                    <p className="text-3xl font-light text-zinc-900">{avgStats.expectation.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-white p-4">
                    <p className="text-xs text-zinc-500">{t('predictions.valencePivot')}</p>
                    <p className="text-3xl font-light text-zinc-900">{valencePivot.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-white p-4">
                    <p className="text-xs text-zinc-500">{t('predictions.lastUpdate')}</p>
                    <p className="text-lg font-medium text-zinc-800">{formatTimestamp(latestPrediction.timestamp, '--')}</p>
                  </div>
                </div>

                {latestVoicePrediction && (
                  <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Voice channel</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {[{
                        key: 'arousal', label: 'Arousal', value: latestVoicePrediction.arousal
                      }, {
                        key: 'valence', label: 'Valence', value: latestVoicePrediction.valence
                      }, {
                        key: 'expectation', label: 'Expectation', value: latestVoicePrediction.expectation
                      }].map(({ key, label, value }) => (
                        <div key={key} className="rounded-2xl border border-black/5 bg-gradient-to-br from-zinc-50 to-white p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
                          <p className="text-3xl font-light text-zinc-900">{value?.toFixed ? value.toFixed(1) : '0.0'}%</p>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-zinc-700 to-zinc-400" style={{ width: `${clampMetric(value)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-zinc-500">Last mic update • {formatTimestamp(latestVoicePrediction.timestamp, '--')}</p>
                  </div>
                )}
              </div>
            </div>

            {latestVoicePrediction && (
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Voice quadrant</h3>
                    <span className="text-xs text-zinc-400">A/V/E</span>
                  </div>
                  <div className="relative h-64 rounded-2xl border border-black/5 bg-gradient-to-br from-white to-zinc-100">
                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                      {quadrantGrid.map((row, rowIdx) => (
                        row.map((key) => {
                          const baseStyle = QUADRANT_STYLES[key] || {}
                          const quadrant = localizedQuadrants[key] || { ...baseStyle, label: key, tagline: '' }
                          const isActive = voiceVisualQuadrantKey === key
                          const cellStyle = quadrantBackgroundStyle(key, isActive)
                          return (
                            <div
                              key={`voice-${rowIdx}-${key}`}
                              className="relative border border-black/10 p-4 text-xs text-zinc-500 transition-all"
                              style={cellStyle}
                            >
                              <p className="text-sm font-medium text-zinc-900">{quadrant.label}</p>
                              <p>{quadrant.tagline}</p>
                            </div>
                          )
                        })
                      ))}
                    </div>
                    <div className="absolute inset-0">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-zinc-300" />
                      <div className="absolute bottom-1/2 left-0 h-px w-full bg-zinc-300" />
                    </div>
                    <div
                      className="absolute -ml-2 -mb-2 h-4 w-4 rounded-full border-2 transition-all"
                      style={voiceQuadrantDotStyle}
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Voice signal</h3>
                    <span className="text-xs text-zinc-400">{voicePredictions.length} samples</span>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={voicePredictions.slice(-60).map((pred, idx) => ({
                        idx,
                        time: formatTimestamp(pred.timestamp, idx),
                        arousal: clampMetric(pred.arousal),
                        valence: clampMetric(pred.valence),
                        expectation: clampMetric(pred.expectation)
                      }))}>
                        <defs>
                          <linearGradient id="voiceArousal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f172a" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="voiceValence" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#52525b" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#52525b" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="voiceExpectation" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a1a1aa" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#a1a1aa" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" opacity={0.6} />
                        <XAxis dataKey="time" stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#78716c' }} />
                        <YAxis domain={[0, 100]} stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#78716c' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 16,
                            color: '#0f172a',
                            backdropFilter: 'blur(12px)'
                          }}
                        />
                        <Line type="monotone" dataKey="arousal" stroke="#0f172a" strokeWidth={2.5} dot={false} fill="url(#voiceArousal)" />
                        <Line type="monotone" dataKey="valence" stroke="#52525b" strokeWidth={2.5} dot={false} fill="url(#voiceValence)" />
                        <Line type="monotone" dataKey="expectation" stroke="#a1a1aa" strokeWidth={2.5} dot={false} fill="url(#voiceExpectation)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-500">{t('predictions.quadrantMap')}</h3>
                  <span className="text-xs text-zinc-400">{t('predictions.axisLabel')}</span>
                </div>
                <div className="relative h-64 rounded-2xl border border-black/5 bg-gradient-to-br from-white to-zinc-100">
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                    {quadrantGrid.map((row, rowIdx) => (
                      row.map((key) => {
                        const baseStyle = QUADRANT_STYLES[key] || {}
                        const quadrant = localizedQuadrants[key] || { ...baseStyle, label: key, tagline: '' }
                        const isActive = visualQuadrantKey === key
                        const cellStyle = quadrantBackgroundStyle(key, isActive)
                        return (
                          <div
                            key={`${rowIdx}-${key}`}
                            className="relative border border-black/10 p-4 text-xs text-zinc-500 transition-all"
                            style={cellStyle}
                          >
                            <p className="text-sm font-medium text-zinc-900">{quadrant.label}</p>
                            <p>{quadrant.tagline}</p>
                          </div>
                        )
                      })
                    ))}
                  </div>
                  <div className="absolute inset-0">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-zinc-300" />
                    <div className="absolute bottom-1/2 left-0 h-px w-full bg-zinc-300" />
                  </div>
                  <div
                    className="absolute -ml-2 -mb-2 h-4 w-4 rounded-full border-2 transition-all"
                    style={quadrantDotStyle}
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-500">{t('predictions.signalTimeline')}</h3>
                  <span className="text-xs text-zinc-400">{t('predictions.lastSamples', { count: chartData.length })}</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <defs>
                        <linearGradient id="arousalGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f172a" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="valenceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#52525b" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#52525b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expectationGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a1a1aa" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#a1a1aa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" opacity={0.6} />
                      <XAxis dataKey="time" stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#78716c' }} />
                      <YAxis domain={[0, 100]} stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#78716c' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.95)',
                          border: '1px solid rgba(0,0,0,0.08)',
                          borderRadius: 16,
                          color: '#0f172a',
                          backdropFilter: 'blur(12px)'
                        }}
                      />
                      <Line type="monotone" dataKey="arousal" stroke="#0f172a" strokeWidth={2.5} dot={false} fill="url(#arousalGradient)" />
                      <Line type="monotone" dataKey="valence" stroke="#52525b" strokeWidth={2.5} dot={false} fill="url(#valenceGradient)" />
                      <Line type="monotone" dataKey="expectation" stroke="#a1a1aa" strokeWidth={2.5} dot={false} fill="url(#expectationGradient)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-500">{t('predictions.dwellTime')}</h3>
                <div className="mt-5 space-y-4">
                  {Object.entries(localizedQuadrants).map(([key, quadrant]) => {
                    const count = quadrantCounts[key]
                    const percentage = totalQuadrantSamples ? (count / totalQuadrantSamples) * 100 : 0
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-900">{quadrant.label}</span>
                          <span className="text-zinc-500">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-black via-zinc-600 to-transparent"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
                <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-500">{t('predictions.sessionAverages')}</h3>
                <div className="mt-5 grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: t('predictions.metrics.arousal'), value: avgStats.arousal },
                    { label: t('predictions.metrics.valence'), value: avgStats.valence },
                    { label: t('predictions.metrics.expectation'), value: avgStats.expectation }
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-2xl border border-black/5 bg-zinc-50 p-4">
                      <p className="text-xs text-zinc-500">{label}</p>
                      <p className="text-3xl font-light text-zinc-900">{value.toFixed(1)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center text-xs text-zinc-500">
                  {t('predictions.predictionsAnalyzed', { count: predictions.length, suffix: predictions.length === 1 ? '' : 's' })}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="py-20 text-center">
            <div className="relative mx-auto mb-6 h-20 w-20">
              <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-br from-black to-zinc-500 opacity-10 blur-2xl" />
              <div className="relative flex h-full w-full items-center justify-center rounded-full border border-dashed border-zinc-200 text-4xl text-zinc-400" aria-label={t('predictions.emptyIconLabel')}>
                📡
              </div>
            </div>
            <p className="text-zinc-500">
              {connectionState === 'connected'
                ? t('predictions.waiting')
                : t('predictions.startSession')}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export default PredictionDisplay
