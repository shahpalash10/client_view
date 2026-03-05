import { useEffect, useRef, useState } from 'react';
import EEGCapture from './components/EEGCapture';
import WebRTCClient from './components/WebRTCClient';
import PredictionDisplay from './components/PredictionDisplay';
import ProfileManager from './components/ProfileManager';
import CalibrationMode from './components/CalibrationMode';
import PCAInspector from './components/PCAInspector';
import FeatureImportance from './components/FeatureImportance';
import { profileStorage } from './utils/profileStorage';
import logo from './work10.png';
import { useLanguage } from './context/LanguageContext';
import './NewApp.css';

const PCA_DIMENSIONS = ['arousal', 'valence', 'expectation'];

// ... (utility functions like buildPcaSignature, selectCalibrationSamples, etc. remain the same)
const buildPcaSignature = (samples = []) => {
  if (!samples.length) return null

  const signature = {}

  PCA_DIMENSIONS.forEach(dimension => {
    const contributions = {}
    let total = 0

    samples.forEach(sample => {
      const entries = sample.featureImportance?.[dimension] || []
      entries.forEach(entry => {
        const component = Number(entry.component)
        const contribution = Number(entry.contribution)
        if (!Number.isFinite(component) || !Number.isFinite(contribution) || contribution <= 0) return
        contributions[component] = (contributions[component] || 0) + contribution
        total += contribution
      })
    })

    if (total > 0) {
      signature[dimension] = Object.entries(contributions)
        .map(([component, weight]) => ({
          component: Number(component),
          weight: weight / total
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
    }
  })

  return Object.keys(signature).length ? signature : null
}

const selectCalibrationSamples = (samples = [], emotion) => {
    if (!samples.length) return samples;
    if (samples.length < 12) return samples;

    const sortedByArousal = [...samples].sort((a, b) => a.arousal - b.arousal);
    const portion = Math.max(6, Math.round(sortedByArousal.length * 0.4));

    if (emotion === 'happy') {
        return sortedByArousal.slice(-portion);
    }

    if (emotion === 'sad') {
        return sortedByArousal.slice(0, portion);
    }

    // Neutral: keep middle band near median arousal
    const medianIndex = Math.floor(sortedByArousal.length / 2);
    const medianArousal = sortedByArousal[medianIndex].arousal;
    const tolerance = 5;
    const neutralBand = samples.filter(sample => Math.abs(sample.arousal - medianArousal) <= tolerance);
    return neutralBand.length >= 6 ? neutralBand : samples;
};


const asNumber = (value) => (Number.isFinite(value) ? value : null)

const diffMs = (start, end) => (
  Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null
)

const formatTimestampMs = (value) => {
  if (!Number.isFinite(value)) return '-'
  const date = new Date(value)
  return `${date.toLocaleTimeString([], { hour12: false })}.${String(value % 1000).padStart(3, '0')}`
}

const normalizeTimingEvent = (event = {}) => {
  const localUpload = asNumber(event.local_upload_send_ms)
  const cloudReceived = asNumber(event.cloud_received_ms)
  const cloudStart = asNumber(event.cloud_compute_start_ms)
  const cloudEnd = asNumber(event.cloud_compute_end_ms)
  const cloudSend = asNumber(event.cloud_download_send_ms)
  const localReceived = asNumber(event.local_download_received_ms)
  const decodeStart = asNumber(event.local_decode_start_ms)
  const decodeEnd = asNumber(event.local_decode_end_ms)
  const drawStart = asNumber(event.drawing_start_ms)
  const drawEnd = asNumber(event.drawing_end_ms)

  return {
    packetId: event.packetId || null,
    timeline_ms: {
      local_upload_send_ms: localUpload,
      cloud_received_ms: cloudReceived,
      cloud_compute_start_ms: cloudStart,
      cloud_compute_end_ms: cloudEnd,
      cloud_download_send_ms: cloudSend,
      local_download_received_ms: localReceived,
      local_decode_start_ms: decodeStart,
      local_decode_end_ms: decodeEnd,
      drawing_start_ms: drawStart,
      drawing_end_ms: drawEnd
    },
    timeline_readable: {
      local_upload_send: formatTimestampMs(localUpload),
      cloud_received: formatTimestampMs(cloudReceived),
      cloud_compute_start: formatTimestampMs(cloudStart),
      cloud_compute_end: formatTimestampMs(cloudEnd),
      cloud_download_send: formatTimestampMs(cloudSend),
      local_download_received: formatTimestampMs(localReceived),
      local_decode_start: formatTimestampMs(decodeStart),
      local_decode_end: formatTimestampMs(decodeEnd),
      drawing_start: formatTimestampMs(drawStart),
      drawing_end: formatTimestampMs(drawEnd)
    },
    durations_ms: {
      cloud_compute_ms: diffMs(cloudStart, cloudEnd),
      cloud_pipeline_ms: diffMs(cloudReceived, cloudSend),
      local_decode_ms: diffMs(decodeStart, decodeEnd),
      local_draw_ms: diffMs(drawStart, drawEnd),
      local_post_download_to_draw_ms: diffMs(localReceived, drawEnd),
      client_end_to_end_ms: diffMs(localUpload, drawEnd)
    }
  }
}


function App() {
  const [sessionActive, setSessionActive] = useState(false)
  const [eegData, setEegData] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [voicePredictions, setVoicePredictions] = useState([])
  const [connectionState, setConnectionState] = useState('idle')
  const [sessionId, setSessionId] = useState(null)
  const [pcaLoadings, setPcaLoadings] = useState(null)
  const [selectedComponent, setSelectedComponent] = useState(null)
  const [activeProfile, setActiveProfile] = useState(null)
  const [calibrationMode, setCalibrationMode] = useState(false)
  const [calibrationProfile, setCalibrationProfile] = useState(null)
  const [calibrationData, setCalibrationData] = useState({})
  const [isCollectingCalibration, setIsCollectingCalibration] = useState(false)
  const [currentCalibrationEmotion, setCurrentCalibrationEmotion] = useState(null)
  const [calibrationSampleCounts, setCalibrationSampleCounts] = useState({})
  const [voiceCalibrationSampleCounts, setVoiceCalibrationSampleCounts] = useState({})
  const [calibrationStreamReady, setCalibrationStreamReady] = useState(false)
  const [sessionError, setSessionError] = useState(null)
  const [voiceCaptureActive, setVoiceCaptureActive] = useState(false)
  const [timingEvents, setTimingEvents] = useState([])
  const [latestTiming, setLatestTiming] = useState(null)
  const [activeView, setActiveView] = useState('dashboard');

  const calibrationBuffersRef = useRef({})
  const voiceCalibrationBuffersRef = useRef({})
  const calibrationActiveRef = useRef(false)
  const currentCalibrationEmotionRef = useRef(null)
  const calibrationDataRef = useRef({})
  const { t, language, toggleLanguage } = useLanguage()

  useEffect(() => {
      calibrationActiveRef.current = isCollectingCalibration
    }, [isCollectingCalibration])

    useEffect(() => {
      currentCalibrationEmotionRef.current = currentCalibrationEmotion
    }, [currentCalibrationEmotion])

  useEffect(() => {
    // Load active profile on mount
    const profile = profileStorage.getActiveProfile()
    if (profile && profile.isCalibrated) {
      setActiveProfile(profile)
    }
    // Fetch PCA loadings for inspector
    const signalingServer = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:8080'
    fetch(`${signalingServer}/api/pca-loadings`)
      .then(res => res.json())
      .then(data => setPcaLoadings(data))
      .catch(err => console.error('Failed to fetch PCA loadings', err))
  }, [])

  const handleProfileSelected = (profile) => {
    setActiveProfile(profile)
    setSessionError(null)
  }

  const handleStartCalibration = (profile) => {
    setCalibrationProfile(profile)
    setCalibrationMode(true)
    setCalibrationData({})
    setVoiceCalibrationSampleCounts({})
    setCalibrationStreamReady(false)
    calibrationDataRef.current = {}
    voiceCalibrationBuffersRef.current = {}
    
    // Start a calibration session with a unique ID
    const calibrationSessionId = `calibration_${Date.now()}`
    setSessionId(calibrationSessionId)
    setSessionActive(true) // Activate session to start WebRTC
    setPredictions([]) // Clear previous predictions
    setVoicePredictions([])
  }

  const handleCalibrationComplete = () => {
    // Use ref to ensure we have the latest finalized calibration data
    const latestData = calibrationDataRef.current
    console.log('📊 Calibration data to save:', latestData)
    const hasAllStates = ['neutral', 'happy', 'sad'].every(emotion => latestData[emotion])
    
    if (calibrationProfile && hasAllStates) {
      const updatedProfile = profileStorage.saveCalibration(calibrationProfile.userId, latestData)
      console.log('✅ Updated profile:', updatedProfile)
      console.log('📍 Reference points:', updatedProfile.referencePoints)
      
      setActiveProfile(updatedProfile)
      setCalibrationMode(false)
      setCalibrationProfile(null)
      setCalibrationData({})
      setCalibrationStreamReady(false)
      calibrationDataRef.current = {}

      // If a session is active, push FULL calibration to backend so it applies immediately
      if (sessionId) {
        const signalingServer = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:8080'
        fetch(`${signalingServer}/api/set-thresholds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sessionId, 
            calibration: updatedProfile.referencePoints,  // Send full reference points
            thresholds: updatedProfile.thresholds  // Legacy fallback
          })
        }).then(res => res.json())
          .then(data => console.log('✅ Calibration applied to backend:', data))
          .catch(err => console.error('❌ Failed to push calibration to server', err))
      }
    } else {
      console.error('❌ Calibration incomplete:', {
        hasProfile: !!calibrationProfile,
        dataKeys: Object.keys(latestData),
        calibrationData: latestData
      })
    }
  }

  const handleCalibrationCancel = () => {
    setCalibrationMode(false)
    setCalibrationProfile(null)
    setCalibrationData({})
    setVoiceCalibrationSampleCounts({})
    voiceCalibrationBuffersRef.current = {}
    setCalibrationStreamReady(false)
    calibrationDataRef.current = {}
    voiceCalibrationBuffersRef.current = {}
    setIsCollectingCalibration(false)
    setCurrentCalibrationEmotion(null)
    setVoicePredictions([])
    
    // Stop the calibration session
    setSessionActive(false)
    setConnectionState('idle')
    setPredictions([])
    setVoicePredictions([])
  }

  const handleCalibrationDataCollection = (emotion, isStarting) => {
    if (isStarting) {
      // Start collecting data for this emotion
      console.log(`🎬 Starting collection for ${emotion}`)
      setIsCollectingCalibration(true)
      setCurrentCalibrationEmotion(emotion)
      setCalibrationData(prev => {
        const next = { ...prev }
        delete next[emotion]
        calibrationDataRef.current = next
        return next
      })
      calibrationBuffersRef.current = {
        ...calibrationBuffersRef.current,
        [emotion]: []
      }
      voiceCalibrationBuffersRef.current = {
        ...voiceCalibrationBuffersRef.current,
        [emotion]: []
      }
      setCalibrationSampleCounts(prev => ({
        ...prev,
        [emotion]: 0
      }))
      setVoiceCalibrationSampleCounts(prev => ({
        ...prev,
        [emotion]: 0
      }))
      return
    }

    // Stop collecting and calculate averages using the *latest* state
    setIsCollectingCalibration(false)

    const faceData = calibrationBuffersRef.current[emotion] || []
    const voiceData = voiceCalibrationBuffersRef.current[emotion] || []
    console.log(`🛑 Stopping collection for ${emotion}, collected face ${faceData.length} / voice ${voiceData.length}`)

    let averaged = null
    if (faceData.length) {
      const selectedSamples = selectCalibrationSamples(faceData, emotion)
      if (selectedSamples.length !== faceData.length) {
        console.log(`🎯 Using ${selectedSamples.length}/${faceData.length} face samples for ${emotion}`)
      }

      const avgArousal = selectedSamples.reduce((sum, p) => sum + p.arousal, 0) / selectedSamples.length
      const avgValence = selectedSamples.reduce((sum, p) => sum + p.valence, 0) / selectedSamples.length
      const avgExpectation = selectedSamples.reduce((sum, p) => sum + p.expectation, 0) / selectedSamples.length
      const pcaSignature = buildPcaSignature(selectedSamples)

      averaged = {
        arousal: avgArousal,
        valence: avgValence,
        expectation: avgExpectation
      }

      if (pcaSignature) {
        averaged.pcaSignature = pcaSignature
        console.log(`🧬 PCA signature for ${emotion}:`, pcaSignature)
      }
    }

    if (voiceData.length) {
      const selectedVoice = selectCalibrationSamples(voiceData, emotion)
      if (selectedVoice.length !== voiceData.length) {
        console.log(`🔊 Using ${selectedVoice.length}/${voiceData.length} voice samples for ${emotion}`)
      }
      const voiceAvgArousal = selectedVoice.reduce((sum, p) => sum + p.arousal, 0) / selectedVoice.length
      const voiceAvgValence = selectedVoice.reduce((sum, p) => sum + p.valence, 0) / selectedVoice.length
      const voiceAvgExpectation = selectedVoice.reduce((sum, p) => sum + p.expectation, 0) / selectedVoice.length
      if (!averaged) averaged = { arousal: 0, valence: 0, expectation: 0 }
      averaged.voice = {
        arousal: voiceAvgArousal,
        valence: voiceAvgValence,
        expectation: voiceAvgExpectation
      }
    }

    if (averaged) {
      console.log(`📊 Averaged ${emotion}:`, averaged)
      setCalibrationData(prev => {
        const next = {
          ...prev,
          [emotion]: averaged
        }
        calibrationDataRef.current = next
        return next
      })
    } else {
      console.warn(`⚠️ No data collected for ${emotion}`)
    }

    setCurrentCalibrationEmotion(null)
  }

  const inviteLink = sessionId 
    ? `${window.location.origin}?session=${sessionId}`
    : null

  const handleStartSession = () => {
    if (!activeProfile || !activeProfile.isCalibrated) {
      setSessionError(t('app.errors.profileRequired'))
      return
    }
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    setSessionError(null)
    setConnectionState('idle')
    setSessionId(newSessionId)
    setSessionActive(true)
    setPredictions([])
    setVoicePredictions([])
  }

  const handleStopSession = async () => {
    // Call backend to explicitly stop the session
    if (sessionId) {
      try {
        const signalingServer = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:8080'
        await fetch(`${signalingServer}/api/stop-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
        console.log('✅ Session stopped on backend')
      } catch (error) {
        console.error('❌ Failed to stop session on backend:', error)
      }
    }
    
    setSessionActive(false)
    setConnectionState('idle')
    setSessionError(null)
    setPredictions([])
    setVoicePredictions([])
  }

  const handleEEGData = (data) => {
    setEegData(data)
  }

  const handlePrediction = (prediction) => {
    if (!prediction) return

    // Always log incoming predictions for debugging
    console.log('📨 Received prediction:', prediction)

    const nowMs = Date.now()
    const timing = prediction?.metadata?.timing || {}
    const eventRecord = {
      packetId: prediction.packetId || null,
      local_upload_send_ms: timing.local_upload_send_ms ?? null,
      cloud_received_ms: timing.cloud_received_ms ?? null,
      cloud_compute_start_ms: timing.cloud_compute_start_ms ?? null,
      cloud_compute_end_ms: timing.cloud_compute_end_ms ?? null,
      cloud_download_send_ms: timing.cloud_download_send_ms ?? null,
      local_download_received_ms: timing.local_download_received_ms ?? nowMs,
      local_decode_start_ms: timing.local_decode_start_ms ?? null,
      local_decode_end_ms: timing.local_decode_end_ms ?? null,
      drawing_start_ms: null,
      drawing_end_ms: null
    }

    requestAnimationFrame(() => {
      const drawingStartMs = Date.now()
      requestAnimationFrame(() => {
        const drawingEndMs = Date.now()
        const finalized = {
          ...eventRecord,
          drawing_start_ms: drawingStartMs,
          drawing_end_ms: drawingEndMs
        }
        setLatestTiming(finalized)
        setTimingEvents(prev => [...prev, finalized].slice(-200))
      })
    })

    if (calibrationMode && !calibrationStreamReady) {
      setCalibrationStreamReady(true)
    }

    // If collecting calibration data, store it in mutable buffer (avoids stale state)
    if (calibrationActiveRef.current && currentCalibrationEmotionRef.current) {
      const emotion = currentCalibrationEmotionRef.current
      const buffer = calibrationBuffersRef.current[emotion] || []
      buffer.push({
        arousal: prediction.arousal,
        valence: prediction.valence,
        expectation: prediction.expectation,
        featureImportance: prediction.feature_importance || null
      })
      calibrationBuffersRef.current[emotion] = buffer
      setCalibrationSampleCounts(prev => ({
        ...prev,
        [emotion]: buffer.length
      }))
      console.log(`📥 Collecting ${emotion}: sample #${buffer.length}`)
    }

    // Always update predictions display
    setPredictions(prev => {
      const updated = [...prev, prediction]
      return updated.slice(-100)
    })
  }

  const handleVoicePrediction = (prediction) => {
    if (calibrationMode && !calibrationStreamReady) {
      setCalibrationStreamReady(true)
    }

    if (calibrationActiveRef.current && currentCalibrationEmotionRef.current) {
      const emotion = currentCalibrationEmotionRef.current
      const buffer = voiceCalibrationBuffersRef.current[emotion] || []
      buffer.push({
        arousal: prediction.arousal,
        valence: prediction.valence,
        expectation: prediction.expectation
      })
      voiceCalibrationBuffersRef.current[emotion] = buffer
      setVoiceCalibrationSampleCounts(prev => ({
        ...prev,
        [emotion]: buffer.length
      }))
    }

    setVoicePredictions(prev => {
      const updated = [...prev, prediction]
      return updated.slice(-100)
    })
  }

  const downloadTimingLogs = () => {
    if (!timingEvents.length) return
    const normalizedLogs = timingEvents.map(normalizeTimingEvent)
    const exportPayload = {
      sessionId,
      exportedAt: new Date().toISOString(),
      totalEvents: normalizedLogs.length,
      events: normalizedLogs
    }
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `timing-logs-${sessionId || 'session'}-${Date.now()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
      // Add feedback to user
    }
  }

  const profileMetadata = activeProfile ? {
    userId: activeProfile.userId,
    name: activeProfile.name || activeProfile.userId,
    profileId: activeProfile.userId,
    profileName: activeProfile.name || activeProfile.userId,
    sessionType: calibrationMode ? 'calibration' : 'realtime'
  } : {
    userId: 'guest',
    name: 'Guest',
    profileId: 'guest'
  }

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <div>
            <PredictionDisplay
              predictions={predictions}
              connectionState={connectionState}
              activeThresholds={activeProfile ? activeProfile.thresholds : null}
              voicePredictions={voicePredictions}
              voiceCaptureActive={voiceCaptureActive}
            />
            <EEGCapture
              active={sessionActive || calibrationMode}
              onDataUpdate={handleEEGData}
              pcaLoadings={pcaLoadings}
              selectedComponent={selectedComponent}
            />
          </div>
        );
      case 'analysis':
        return (
          <div>
            <FeatureImportance
              latestPrediction={predictions.length > 0 ? predictions[predictions.length - 1] : null}
              pcaLoadings={pcaLoadings}
            />
            <PCAInspector
              onSelectComponent={setSelectedComponent}
              selectedComponent={selectedComponent}
              pcaLoadings={pcaLoadings}
            />
          </div>
        );
      case 'profiles':
        return (
          <ProfileManager
            onProfileSelected={handleProfileSelected}
            onStartCalibration={handleStartCalibration}
          />
        );
      default:
        return <div>Dashboard</div>;
    }
  };

  return (
    <div className="dashboard-layout">
      <div className="sidebar">
        <img src={logo} alt="Logo" style={{width: '100px', marginBottom: '20px'}} />
        <button onClick={() => setActiveView('dashboard')}>Dashboard</button>
        <button onClick={() => setActiveView('analysis')}>Analysis</button>
        <button onClick={() => setActiveView('profiles')}>Profiles</button>
        <div style={{marginTop: 'auto'}}>
          {!sessionActive ? (
            <button onClick={handleStartSession}>Start Session</button>
          ) : (
            <button onClick={handleStopSession}>Stop Session</button>
          )}
          <p>Status: {connectionState}</p>
        </div>
      </div>
      <div className="main-content">
        {renderContent()}
      </div>

      {sessionActive && (
        <WebRTCClient
          sessionId={sessionId}
          eegData={eegData}
          onPrediction={handlePrediction}
          onVoicePrediction={handleVoicePrediction}
          onVoiceActivity={setVoiceCaptureActive}
          onConnectionStateChange={setConnectionState}
          profileCalibration={activeProfile?.referencePoints || null}
          profileThresholds={activeProfile?.thresholds || null}
          profileMetadata={profileMetadata}
          enableVoice={true}
          onBlockingError={(message) => {
            setSessionError(message)
            setSessionActive(false)
          }}
        />
      )}

      {calibrationMode && (
        <CalibrationMode
          profile={calibrationProfile}
          onComplete={handleCalibrationComplete}
          onCancel={handleCalibrationCancel}
          onDataCollected={handleCalibrationDataCollection}
          connectionState={connectionState}
          sampleCounts={calibrationSampleCounts}
          voiceSampleCounts={voiceCalibrationSampleCounts}
          predictionsReady={calibrationStreamReady}
        />
      )}
    </div>
  )
}

export default App;
