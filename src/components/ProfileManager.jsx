import { useState, useEffect } from 'react'
import { profileStorage } from '../utils/profileStorage'
import { useLanguage } from '../context/LanguageContext'

function ProfileManager({ onProfileSelected, onStartCalibration }) {
  const [profiles, setProfiles] = useState({})
  const [showNewProfile, setShowNewProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [showExplanation, setShowExplanation] = useState(true)
  const { t } = useLanguage()
  const explanationSteps = t('profiles.explanationSteps') || []

  useEffect(() => {
    loadProfiles()
    const activeProfile = profileStorage.getActiveProfile()
    if (activeProfile) {
      setSelectedProfile(activeProfile)
    }
  }, [])

  const loadProfiles = () => {
    const allProfiles = profileStorage.getAllProfiles()
    setProfiles(allProfiles)
  }

  const handleCreateProfile = (e) => {
    e.preventDefault()
    if (!newProfileName.trim()) return

    const userId = `user_${Date.now()}`
    const profile = profileStorage.saveProfile(userId, {
      name: newProfileName.trim(),
      isCalibrated: false
    })

    setProfiles(prev => ({ ...prev, [userId]: profile }))
    setNewProfileName('')
    setShowNewProfile(false)
    handleSelectProfile(profile)
  }

  const handleSelectProfile = (profile) => {
    setSelectedProfile(profile)
    profileStorage.setActiveProfile(profile.userId)
    
    if (profile.isCalibrated) {
      onProfileSelected(profile)
    } else {
      // New profile needs calibration
      onStartCalibration(profile)
    }
  }

  const handleDeleteProfile = (userId, e) => {
    e.stopPropagation()
    if (confirm(t('profiles.deleteConfirm'))) {
      profileStorage.deleteProfile(userId)
      loadProfiles()
      if (selectedProfile?.userId === userId) {
        setSelectedProfile(null)
        profileStorage.clearActiveProfile()
      }
    }
  }

  const handleRecalibrate = () => {
    if (selectedProfile) {
      onStartCalibration(selectedProfile)
    }
  }

  return (
    <div className="relative rounded-[32px] border border-black/5 bg-white p-8 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-zinc-50">
            <svg className="h-6 w-6 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{t('profiles.eyebrow')}</p>
            <h2 className="text-xl font-light text-zinc-900">{t('profiles.title')}</h2>
          </div>
        </div>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="text-zinc-400 transition hover:text-black"
          title={t('profiles.toggleExplanation')}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Explanation panel */}
      {showExplanation && (
        <div className="mb-6 rounded-3xl border border-black/5 bg-zinc-50 p-5 text-sm text-zinc-600">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{t('profiles.explanationTitle')}</p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed">
            {Array.isArray(explanationSteps) && explanationSteps.map((step, index) => (
              <li key={`${step}-${index}`} className="text-zinc-600">
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedProfile ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-black/5 bg-zinc-50 p-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-medium text-zinc-900">{selectedProfile.name}</h3>
              <button
                onClick={() => {
                  setSelectedProfile(null)
                  profileStorage.clearActiveProfile()
                }}
                className="text-zinc-400 transition hover:text-black"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-zinc-500">
              {selectedProfile.isCalibrated ? (
                <span className="flex items-center gap-2 text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />{t('profiles.calibrated')}
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-600">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />{t('profiles.needsCalibration')}
                </span>
              )}
            </p>
            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-zinc-400">{t('profiles.userId')}</p>
            <p className="text-sm text-zinc-600">{selectedProfile.userId}</p>
          </div>

          {selectedProfile.isCalibrated && (
            <button
              onClick={handleRecalibrate}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black bg-black px-4 py-3 text-xs uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5"
            >
              {t('profiles.recalibrate')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.values(profiles).length > 0 ? (
            <>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {Object.values(profiles).map(profile => (
                  <div
                    key={profile.userId}
                    className="group flex cursor-pointer items-center justify-between rounded-2xl border border-black/5 bg-white p-4 transition hover:-translate-y-0.5"
                    onClick={() => handleSelectProfile(profile)}
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{profile.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {profile.isCalibrated ? t('profiles.calibrated') : t('profiles.needsCalibration')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteProfile(profile.userId, e)}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <svg className="h-5 w-5 text-zinc-400 hover:text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-black/5 pt-3" />
            </>
          ) : null}

          {showNewProfile ? (
            <form onSubmit={handleCreateProfile} className="space-y-3">
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder={t('profiles.placeholder')}
                autoFocus
                className="w-full rounded-2xl border border-black/10 bg-zinc-50 px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-black focus:bg-white focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border border-black bg-black px-4 py-3 text-xs uppercase tracking-[0.3em] text-white"
                >
                  {t('profiles.create')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewProfile(false)
                    setNewProfileName('')
                  }}
                  className="rounded-2xl border border-black/10 px-4 py-3 text-xs uppercase tracking-[0.3em] text-zinc-500"
                >
                  {t('profiles.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowNewProfile(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-black/20 px-4 py-3 text-xs uppercase tracking-[0.3em] text-zinc-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('profiles.newProfile')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ProfileManager
