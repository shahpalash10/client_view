const PERIOD_CONFIG = {
  daily: { buckets: 21, label: 'Daily', granularity: 'day' },
  weekly: { buckets: 16, label: 'Weekly', granularity: 'week' },
  monthly: { buckets: 12, label: 'Monthly', granularity: 'month' }
}

const EMOTION_KEYS = ['happy', 'neutral', 'sad']

const toDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const startOfWeek = (date) => {
  const copy = startOfDay(date)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  return copy
}

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)

const addStep = (date, period, amount = 1) => {
  const copy = new Date(date)
  if (period === 'daily') copy.setDate(copy.getDate() + amount)
  if (period === 'weekly') copy.setDate(copy.getDate() + (7 * amount))
  if (period === 'monthly') copy.setMonth(copy.getMonth() + amount)
  return copy
}

const getBucketStart = (date, period) => {
  if (period === 'daily') return startOfDay(date)
  if (period === 'weekly') return startOfWeek(date)
  return startOfMonth(date)
}

const formatBucketLabel = (date, period) => {
  if (period === 'daily') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  if (period === 'weekly') {
    const end = addStep(date, 'weekly', 1)
    end.setDate(end.getDate() - 1)
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
  }
  return date.toLocaleDateString([], { month: 'short', year: 'numeric' })
}

const normalizeMetrics = (sessionDetail) => {
  const sessionId = sessionDetail?.id
  const userId = sessionDetail?.userId
  const profileName = sessionDetail?.profileName
  const metrics = sessionDetail?.metrics || []

  if (!metrics.length && sessionDetail?.latestMetrics) {
    const latest = sessionDetail.latestMetrics
    return [{
      sessionId,
      userId,
      profileName,
      timestamp: latest.timestamp,
      avgArousal: Number(latest.avgArousal ?? 0),
      avgValence: Number(latest.avgValence ?? 0),
      avgExpectation: Number(latest.avgExpectation ?? 0),
      happyCount: Number(latest.happyCount ?? 0),
      neutralCount: Number(latest.neutralCount ?? 0),
      sadCount: Number(latest.sadCount ?? 0),
      sampleCount: Number(latest.happyCount ?? 0) + Number(latest.neutralCount ?? 0) + Number(latest.sadCount ?? 0)
    }]
  }

  return metrics
    .map((metric) => ({
      sessionId,
      userId,
      profileName,
      timestamp: metric.timestamp,
      avgArousal: Number(metric.avgArousal ?? 0),
      avgValence: Number(metric.avgValence ?? 0),
      avgExpectation: Number(metric.avgExpectation ?? 0),
      happyCount: Number(metric.happyCount ?? 0),
      neutralCount: Number(metric.neutralCount ?? 0),
      sadCount: Number(metric.sadCount ?? 0),
      sampleCount: Number(metric.happyCount ?? 0) + Number(metric.neutralCount ?? 0) + Number(metric.sadCount ?? 0)
    }))
    .filter((metric) => toDate(metric.timestamp))
}

const createBucket = (start, period) => ({
  key: start.toISOString(),
  start,
  label: formatBucketLabel(start, period),
  totalArousalWeighted: 0,
  totalValenceWeighted: 0,
  totalExpectationWeighted: 0,
  totalWeight: 0,
  samples: 0,
  sessionIds: new Set(),
  happy: 0,
  neutral: 0,
  sad: 0
})

const finalizeBucket = (bucket) => {
  const totalEmotion = bucket.happy + bucket.neutral + bucket.sad
  const avgArousal = bucket.totalWeight ? bucket.totalArousalWeighted / bucket.totalWeight : 0
  const avgValence = bucket.totalWeight ? bucket.totalValenceWeighted / bucket.totalWeight : 0
  const avgExpectation = bucket.totalWeight ? bucket.totalExpectationWeighted / bucket.totalWeight : 0

  const emotionPairs = [
    ['Happy', bucket.happy],
    ['Neutral', bucket.neutral],
    ['Sad', bucket.sad]
  ]
  const dominantEmotion = emotionPairs.sort((a, b) => b[1] - a[1])[0][0]

  return {
    key: bucket.key,
    label: bucket.label,
    startIso: bucket.start.toISOString(),
    avgArousal,
    avgValence,
    avgExpectation,
    samples: bucket.samples,
    sessionCount: bucket.sessionIds.size,
    happy: bucket.happy,
    neutral: bucket.neutral,
    sad: bucket.sad,
    happyPct: totalEmotion ? (bucket.happy / totalEmotion) * 100 : 0,
    neutralPct: totalEmotion ? (bucket.neutral / totalEmotion) * 100 : 0,
    sadPct: totalEmotion ? (bucket.sad / totalEmotion) * 100 : 0,
    dominantEmotion
  }
}

const aggregateByPeriod = (metrics, period, now = new Date()) => {
  const config = PERIOD_CONFIG[period] || PERIOD_CONFIG.daily
  const latestBucketStart = getBucketStart(now, period)
  const firstBucketStart = addStep(latestBucketStart, period, -(config.buckets - 1))

  const buckets = new Map()
  for (let i = 0; i < config.buckets; i += 1) {
    const start = addStep(firstBucketStart, period, i)
    buckets.set(start.toISOString(), createBucket(start, period))
  }

  metrics.forEach((metric) => {
    const ts = toDate(metric.timestamp)
    if (!ts) return
    const bucketStart = getBucketStart(ts, period)
    const key = bucketStart.toISOString()
    const bucket = buckets.get(key)
    if (!bucket) return

    const weight = Math.max(metric.sampleCount, 1)
    bucket.totalArousalWeighted += metric.avgArousal * weight
    bucket.totalValenceWeighted += metric.avgValence * weight
    bucket.totalExpectationWeighted += metric.avgExpectation * weight
    bucket.totalWeight += weight
    bucket.samples += metric.sampleCount
    bucket.sessionIds.add(metric.sessionId)
    bucket.happy += metric.happyCount
    bucket.neutral += metric.neutralCount
    bucket.sad += metric.sadCount
  })

  return Array.from(buckets.values()).map(finalizeBucket)
}

const computeSummary = (metrics, buckets, sessions) => {
  const totals = metrics.reduce((acc, metric) => {
    const weight = Math.max(metric.sampleCount, 1)
    acc.totalWeight += weight
    acc.weightedArousal += metric.avgArousal * weight
    acc.weightedValence += metric.avgValence * weight
    acc.weightedExpectation += metric.avgExpectation * weight
    acc.samples += metric.sampleCount
    acc.happy += metric.happyCount
    acc.neutral += metric.neutralCount
    acc.sad += metric.sadCount
    return acc
  }, {
    totalWeight: 0,
    weightedArousal: 0,
    weightedValence: 0,
    weightedExpectation: 0,
    samples: 0,
    happy: 0,
    neutral: 0,
    sad: 0
  })

  const latest = buckets[buckets.length - 1]
  const previous = buckets[buckets.length - 2]

  return {
    sessionCount: sessions.length,
    metricPoints: metrics.length,
    samples: totals.samples,
    avgArousal: totals.totalWeight ? totals.weightedArousal / totals.totalWeight : 0,
    avgValence: totals.totalWeight ? totals.weightedValence / totals.totalWeight : 0,
    avgExpectation: totals.totalWeight ? totals.weightedExpectation / totals.totalWeight : 0,
    emotionTotals: {
      happy: totals.happy,
      neutral: totals.neutral,
      sad: totals.sad
    },
    latest,
    deltas: {
      arousal: latest && previous ? latest.avgArousal - previous.avgArousal : 0,
      valence: latest && previous ? latest.avgValence - previous.avgValence : 0,
      expectation: latest && previous ? latest.avgExpectation - previous.avgExpectation : 0,
      samples: latest && previous ? latest.samples - previous.samples : 0
    }
  }
}

const buildInsights = (summary, period) => {
  const lines = []
  const totalEmotion = summary.emotionTotals.happy + summary.emotionTotals.neutral + summary.emotionTotals.sad
  const emotionRatios = EMOTION_KEYS
    .map((key) => ({ key, ratio: totalEmotion ? summary.emotionTotals[key] / totalEmotion : 0 }))
    .sort((a, b) => b.ratio - a.ratio)

  if (summary.sessionCount === 0) {
    return ['No sessions recorded for the selected user yet.']
  }

  lines.push(`Average mood profile is Arousal ${summary.avgArousal.toFixed(1)}, Valence ${summary.avgValence.toFixed(1)}, Expectation ${summary.avgExpectation.toFixed(1)}.`)

  if (emotionRatios[0]) {
    lines.push(`${emotionRatios[0].key[0].toUpperCase()}${emotionRatios[0].key.slice(1)} dominates ${period} activity at ${(emotionRatios[0].ratio * 100).toFixed(1)}%.`)
  }

  const trendWord = summary.deltas.valence >= 0 ? 'up' : 'down'
  lines.push(`Valence is ${trendWord} ${Math.abs(summary.deltas.valence).toFixed(1)} points versus the previous ${period.slice(0, -2)} window.`)

  return lines
}

export const preprocessUserReports = ({ sessions = [], details = [], period = 'daily', now = new Date() }) => {
  const metrics = details.flatMap(normalizeMetrics).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  const buckets = aggregateByPeriod(metrics, period, now)
  const summary = computeSummary(metrics, buckets, sessions)
  const insights = buildInsights(summary, period)

  return {
    period,
    buckets,
    summary,
    insights,
    generatedAt: new Date().toISOString()
  }
}

export const groupUsers = (sessions = []) => {
  const map = new Map()
  sessions.forEach((session) => {
    const userId = session.userId || 'unknown'
    const existing = map.get(userId) || {
      userId,
      profileName: session.profileName || userId,
      sessionCount: 0,
      liveCount: 0,
      latestStartedAt: session.startedAt
    }
    existing.sessionCount += 1
    if (!session.endedAt) existing.liveCount += 1
    if (!existing.latestStartedAt || new Date(session.startedAt) > new Date(existing.latestStartedAt)) {
      existing.latestStartedAt = session.startedAt
    }
    map.set(userId, existing)
  })

  return Array.from(map.values()).sort((a, b) => b.sessionCount - a.sessionCount)
}
