import { useLanguage } from '../context/LanguageContext'

function PCAInspector({ onSelectComponent, selectedComponent, pcaLoadings }) {
  const { t } = useLanguage()

  if (!pcaLoadings) return (
    <div className="rounded-[24px] border border-black/5 bg-white p-6 text-center text-sm text-zinc-500 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
      {t('pca.loading')}
    </div>
  )

  const components = pcaLoadings.components || []
  const nComponents = pcaLoadings.n_components || 0

  return (
    <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500">{t('pca.title')}</h3>
        <div className="text-xs text-zinc-400">{t('pca.components')}: {nComponents}</div>
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {components.map(comp => (
          <button
            key={comp.component}
            onClick={() => onSelectComponent(comp.component)}
            className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
              selectedComponent === comp.component
                ? 'border-black text-zinc-900'
                : 'border-black/5 text-zinc-600 hover:border-black/10'
            }`}
          >
            <div>
              <div className="font-medium text-zinc-900">PCA {comp.component + 1}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {comp.label ? (
                  <span>{t('pca.regionsPrefix')}{comp.label}</span>
                ) : (
                  <span>{t('pca.topLandmarksPrefix')}{comp.top_landmarks.slice(0,5).map(t => t.landmark).join(', ')}{comp.top_landmarks.length > 5 ? '...' : ''}</span>
                )}
              </div>
            </div>
            <div className="text-xs text-zinc-400">{t('pca.view')}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 text-xs text-zinc-500">{t('pca.helper')}</div>
      {selectedComponent != null && (
        <div className="mt-3 rounded-2xl border border-black/5 bg-zinc-50 p-4 text-sm text-zinc-600">
          <strong className="font-medium text-zinc-900">Component {selectedComponent + 1}:</strong>
          <div className="mt-1 text-xs">
            {(() => {
              const comp = components.find(c => c.component === selectedComponent)
              if (!comp) return t('pca.detail.noData')
              if (comp.label) {
                return t('pca.detail.majorRegionTemplate', { region: comp.label })
              }
              return `${t('pca.detail.topLandmarksPrefix')}${comp.top_landmarks.slice(0,5).map(t => t.landmark).join(', ')}${comp.top_landmarks.length > 5 ? '...' : ''}`
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default PCAInspector
