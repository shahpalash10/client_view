import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

/**
 * FeatureImportance Component
 * Displays ranked PCA components by their contribution to current predictions
 */
function FeatureImportance({ latestPrediction, pcaLoadings }) {
  const [selectedEmotion, setSelectedEmotion] = useState('arousal')
  const { t } = useLanguage()

  useEffect(() => {
    console.log('FeatureImportance received prediction:', latestPrediction)
    if (latestPrediction) {
      console.log('Feature importance data:', latestPrediction.feature_importance)
    }
  }, [latestPrediction])

  const hasFeatureImportance = Boolean(
    latestPrediction?.feature_importance &&
    Object.keys(latestPrediction.feature_importance).length > 0
  )

  const getComponentLabel = (componentIdx) => {
    if (!pcaLoadings?.components) return `PC${componentIdx + 1}`
    const match = pcaLoadings.components.find(c => c.component === componentIdx)
    return match?.label
      ? `PC${componentIdx + 1} (${match.label})`
      : `PC${componentIdx + 1}`
  }

  if (!hasFeatureImportance) {
    return (
      <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <h3 className="mb-4 text-xs uppercase tracking-[0.3em] text-zinc-400">{t('importance.title')}</h3>
        <div className="py-8 text-center text-sm text-zinc-500">
          <div className="mb-2 animate-pulse text-2xl">⏳</div>
          <div>{latestPrediction ? t('importance.processing') : t('importance.startSession')}</div>
        </div>
      </div>
    )
  }

  const importance = latestPrediction.feature_importance[selectedEmotion] || []
  const maxContribution = importance[0]?.contribution || 1
  const selectedEmotionLabel = t(`importance.filters.${selectedEmotion}`) || selectedEmotion

  return (
    <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-400">{t('importance.title')}</h3>
        <div className="flex gap-2">
          {['arousal', 'valence', 'expectation'].map(emotion => (
            <button
              key={emotion}
              onClick={() => setSelectedEmotion(emotion)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedEmotion === emotion
                  ? 'bg-black text-white'
                  : 'border border-black/10 text-zinc-500'
              }`}
            >
              {t(`importance.filters.${emotion}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {importance.map((item, idx) => {
          const percentage = maxContribution ? (item.contribution / maxContribution) * 100 : 0
          return (
            <div key={`${item.component}-${idx}`} className="relative">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-800">{getComponentLabel(item.component)}</span>
                <span className="text-xs text-zinc-400">{item.contribution.toFixed(3)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-black via-zinc-600 to-zinc-300 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 text-xs text-zinc-500">
        {t('importance.footer', { emotion: selectedEmotionLabel })}
      </div>
    </div>
  )
}

export default FeatureImportance
