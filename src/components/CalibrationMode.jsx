import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../context/LanguageContext'

const CALIBRATION_STEPS = [
  {
    emotion: 'neutral',
    emoji: '😐',
    gradient: 'from-slate-500 to-gray-500',
    duration: 10,
    sentence: 'Today the weather is calm and clear.'
  },
  {
    emotion: 'happy',
    emoji: '😊',
    gradient: 'from-emerald-500 to-green-500',
    duration: 10,
    sentence: 'I am excited to share good news with you!'
  },
  {
    emotion: 'sad',
    emoji: '😢',
    gradient: 'from-blue-500 to-indigo-500',
    duration: 10,
    sentence: 'I am feeling a bit down today, but I know it will pass.'
  }
]

function CalibrationMode({ profile, onComplete, onCancel, onDataCollected, connectionState, sampleCounts, voiceSampleCounts = {}, predictionsReady = true }) {
  const { t } = useLanguage()
  const [currentStep, setCurrentStep] = useState(0)
  const [countdown, setCountdown] = useState(3) // 3 second countdown before starting
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const recordingInterval = useRef(null)
  const recordingTimeout = useRef(null)
  const isRecordingRef = useRef(false)

  const step = CALIBRATION_STEPS[currentStep]
  const localizedStep = step
    ? {
        ...step,
        title: t(`calibration.steps.${step.emotion}.title`),
        instruction: t(`calibration.steps.${step.emotion}.instruction`),
        sentence: step.sentence
      }
    : step
  const currentSampleCount = sampleCounts?.[step.emotion] || 0
  const currentVoiceSampleCount = voiceSampleCounts?.[step.emotion] || 0

  const handleEarlyStop = () => {
    const durationMet = recordingTime >= step.duration
    if (!durationMet) return
    stopRecording()
  }

  const readyToRecord = connectionState === 'connected' && predictionsReady

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    // Wait for the WebRTC connection AND active predictions before beginning countdown.
    if (!readyToRecord) return

    // Countdown before starting recording
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && !isRecording) {
      startRecording()
    }
  }, [countdown, isRecording, readyToRecord])

  useEffect(() => {
    if (!isRecording) return

    recordingInterval.current = setInterval(() => {
      setRecordingTime(prev => prev + 1)
    }, 1000)

    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current)
        recordingInterval.current = null
      }
    }
  }, [isRecording])

  useEffect(() => {
    if (!isRecording) return
    const durationMet = recordingTime >= step.duration
    if (durationMet) {
      stopRecording()
    }
  }, [isRecording, recordingTime, step.duration])

  const startRecording = () => {
    isRecordingRef.current = true
    setIsRecording(true)
    setRecordingTime(0)
    setCountdown(-1)
    if (recordingTimeout.current) {
      clearTimeout(recordingTimeout.current)
    }
    recordingTimeout.current = setTimeout(() => {
      stopRecording()
    }, (step.duration * 1000) + 500)
    
    // Signal parent to start collecting data
    if (onDataCollected) {
      onDataCollected(step.emotion, true)
    }
  }

  const stopRecording = () => {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false
    setIsRecording(false)
    setCountdown(-1)
    
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
    }
    if (recordingTimeout.current) {
      clearTimeout(recordingTimeout.current)
      recordingTimeout.current = null
    }

    // Signal parent to stop collecting and process data
    if (onDataCollected) {
      onDataCollected(step.emotion, false)
    }

    // Move to next step or complete
    if (currentStep < CALIBRATION_STEPS.length - 1) {
      setTimeout(() => {
        setCurrentStep(prev => prev + 1)
        setCountdown(3)
        setRecordingTime(0)
      }, 1500)
    } else {
      // All steps complete
      setTimeout(() => {
        if (onComplete) {
          onComplete()
        }
      }, 1500)
    }
  }

  useEffect(() => {
    return () => {
      if (recordingTimeout.current) {
        clearTimeout(recordingTimeout.current)
        recordingTimeout.current = null
      }
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current)
        recordingInterval.current = null
      }
    }
  }, [])

  const progress = ((currentStep) / CALIBRATION_STEPS.length) * 100
  const recordingProgress = (recordingTime / step.duration) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-2xl">
      <div className="relative mx-4 w-full max-w-3xl">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm text-zinc-500">
            <span>{t('calibration.progress')}</span>
            <span>{t('calibration.stepLabel', { current: currentStep + 1, total: CALIBRATION_STEPS.length })}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-gradient-to-r from-black via-zinc-600 to-zinc-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Main calibration card */}
        <div className="rounded-[32px] border border-black/5 bg-white p-12 shadow-[0_40px_120px_rgba(15,23,42,0.12)]">
          <div className="text-center">
            {/* Emoji display */}
            <div className="relative inline-block mb-8">
              <div className={`absolute inset-0 animate-pulse bg-gradient-to-r ${step.gradient} blur-3xl opacity-30`}></div>
              <div className="relative mb-4 text-9xl drop-shadow-[0_25px_40px_rgba(0,0,0,0.15)]">
                {step.emoji}
              </div>
            </div>

            {/* Title */}
            <h2 className={`mb-4 text-4xl font-light bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent`}>
              {localizedStep?.title}
            </h2>

            {/* Instruction */}
            <p className="mx-auto mb-8 max-w-lg text-xl font-light text-zinc-600">
              {localizedStep?.instruction}
            </p>

            <div className="mx-auto mb-8 max-w-xl rounded-2xl border border-black/5 bg-zinc-50 p-4 text-left text-zinc-700 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Voice prompt</p>
              <p className="mt-2 text-lg font-medium text-zinc-900">{localizedStep?.sentence}</p>
              <p className="mt-1 text-sm text-zinc-500">Read this line out loud while holding the expression.</p>
            </div>

            {/* Countdown or Recording indicator */}
            {!readyToRecord ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500">{t('calibration.waiting')}</p>
                <div className="flex items-center justify-center gap-2 text-zinc-600">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-zinc-400"></div>
                  <span className="text-lg">{t('calibration.initializing')}</span>
                </div>
              </div>
            ) : countdown > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500">{t('calibration.getReady')}</p>
                <div className="text-7xl font-bold text-zinc-900 animate-pulse">
                  {countdown}
                </div>
              </div>
            ) : isRecording ? (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-rose-500"></div>
                  <p className="text-lg font-medium text-zinc-900">{t('calibration.recording')}</p>
                </div>
                
                {/* Recording progress */}
                <div className="max-w-md mx-auto">
                  <div className="mb-2 flex items-center justify-between text-sm text-zinc-500">
                      <span>
                        {recordingTime}
                        {t('generic.seconds')}
                      </span>
                      <span>
                        {step.duration}
                        {t('generic.seconds')}
                      </span>
                    </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className={`h-full bg-gradient-to-r ${step.gradient} transition-all duration-300`}
                      style={{ width: `${recordingProgress}%` }}
                    ></div>
                  </div>
                </div>

                <p className="text-sm text-zinc-500">
                  {t('calibration.holdSteady')}
                </p>
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>{t('calibration.samplesCaptured', { count: currentSampleCount })} (face)</div>
                  <div>{t('calibration.samplesCaptured', { count: currentVoiceSampleCount })} (voice)</div>
                </div>

                <div className="mt-4">
                  <button
                    className={`text-xs transition ${recordingTime >= step.duration ? 'text-zinc-900' : 'cursor-not-allowed text-zinc-300'}`}
                    onClick={handleEarlyStop}
                    disabled={recordingTime < step.duration}
                  >
                    {t('calibration.stopNow')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-50 px-6 py-3">
                  <svg className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-emerald-600">{t('calibration.captured')}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cancel button */}
        <div className="mt-6 text-center">
          <button
            onClick={onCancel}
            className="text-sm font-light text-zinc-500 transition hover:text-zinc-900"
          >
            {t('calibration.cancel')}
          </button>
        </div>

        {/* Profile info */}
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-500">
            {t('calibration.calibratingProfile', { name: profile.name })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default CalibrationMode
