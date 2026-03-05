import { useState, useEffect, useRef } from 'react'

/**
 * WebRTCClient Component
 * Manages WebRTC peer connection, data channel, and signaling
 * Handles ICE, STUN/TURN, reconnection, and latency measurement
 */
function WebRTCClient({
  sessionId,
  eegData,
  onPrediction,
  onConnectionStateChange,
  profileCalibration,
  profileThresholds,
  profileMetadata,
  onVoicePrediction,
  onVoiceActivity = () => {},
  enableVoice = false,
  onBlockingError = () => {}
}) {
  const [peerConnection, setPeerConnection] = useState(null)
  const [dataChannel, setDataChannel] = useState(null)
  const [iceConnectionState, setIceConnectionState] = useState('new')
  const [latencyMs, setLatencyMs] = useState(null)
  
  const dataChannelRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const pendingPingsRef = useRef(new Map()) // timestamp -> sent time
  const profileCalibrationRef = useRef(profileCalibration)
  const profileThresholdsRef = useRef(profileThresholds)
  const profileMetadataRef = useRef(profileMetadata)
  const audioContextRef = useRef(null)
  const audioStreamRef = useRef(null)
  const audioProcessorRef = useRef(null)
  const voiceBufferRef = useRef([])
  const lastVoiceSendRef = useRef(0)
  const packetCounterRef = useRef(0)

  // Configuration
  const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:8080'
  const STUN_SERVER = import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302'
  const TURN_SERVER = import.meta.env.VITE_TURN_URL || null
  const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || null
  const TURN_PASSWORD = import.meta.env.VITE_TURN_PASSWORD || null

  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY_MS = 2000
  const PING_INTERVAL_MS = 1000
  const VOICE_CHUNK_MS = 800
  const VOICE_SAMPLE_TARGET = 16000

  useEffect(() => {
    initializeConnection()

    return () => {
      cleanup()
    }
  }, [sessionId])

  // Update profile calibration and thresholds refs when they change, and push to backend if already connected
  useEffect(() => {
    profileCalibrationRef.current = profileCalibration
    profileThresholdsRef.current = profileThresholds
    profileMetadataRef.current = profileMetadata
    
    // If already connected, send updated calibration to backend
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open' && sessionId) {
      const url = `${SIGNALING_SERVER}/api/set-thresholds`
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId,
          calibration: profileCalibration,
          thresholds: profileThresholds
        })
      })
        .then(res => res.json())
        .then(data => console.log('✅ Updated calibration on backend:', data))
        .catch(err => console.error('❌ Failed to update calibration:', err))
    }
  }, [profileCalibration, profileThresholds, sessionId])

  // Toggle voice capture when flag changes
  useEffect(() => {
    if (!enableVoice) {
      stopVoiceCapture()
      return
    }
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      startVoiceCapture()
    }
  }, [enableVoice])

  // Send EEG data when available
  useEffect(() => {
    if (eegData && dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      sendEEGPacket(eegData)
    }
  }, [eegData])

  const initializeConnection = async () => {
    try {
      console.log('🔗 Initializing WebRTC connection...')
      onConnectionStateChange('connecting')

      // Create RTCPeerConnection with STUN/TURN servers
      const iceServers = [{ urls: STUN_SERVER }]
      
      if (TURN_SERVER && TURN_USERNAME && TURN_PASSWORD) {
        iceServers.push({
          urls: TURN_SERVER,
          username: TURN_USERNAME,
          credential: TURN_PASSWORD
        })
      }

      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      })

      // Create data channel
      const dc = pc.createDataChannel('eeg-emotion', {
        ordered: false, // Allow out-of-order delivery for lower latency
        maxRetransmits: 0 // No retransmission - prefer dropping old data
      })

      setupDataChannelHandlers(dc)
      setupPeerConnectionHandlers(pc)

      dataChannelRef.current = dc
      setPeerConnection(pc)
      setDataChannel(dc)

      // Create and send offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Send offer to signaling server
      const response = await fetch(`${SIGNALING_SERVER}/api/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          sdp: offer.sdp,
          type: offer.type,
          profileCalibration: profileCalibrationRef.current, // Send personalized calibration
          profileThresholds: profileThresholdsRef.current, // Send personalized thresholds (legacy)
          profileMetadata: profileMetadataRef.current
        })
      })

      if (!response.ok) {
        const raw = await response.text()
        let message = response.statusText
        let details = null
        if (raw) {
          try {
            details = JSON.parse(raw)
            message = details?.error || message
          } catch (err) {
            message = raw
          }
        }
        const signalingError = new Error(message)
        signalingError.status = response.status
        signalingError.details = details
        throw signalingError
      }

      const { sdp: answerSdp, type: answerType } = await response.json()
      const answer = new RTCSessionDescription({ sdp: answerSdp, type: answerType })
      await pc.setRemoteDescription(answer)

      console.log('✅ WebRTC connection established')

    } catch (error) {
      console.error('❌ Connection error:', error)
      if (error?.status === 409) {
        onConnectionStateChange('blocked')
        onBlockingError(error.message || 'Session already active for this profile.')
        cleanup()
        return
      }
      onConnectionStateChange('failed')
      scheduleReconnect()
    }
  }

  const setupDataChannelHandlers = (dc) => {
    dc.onopen = () => {
      console.log('📡 Data channel opened')
      onConnectionStateChange('connected')
      startPingInterval()
      startVoiceCapture()
    }

    dc.onclose = () => {
      console.log('📡 Data channel closed')
      onConnectionStateChange('disconnected')
      stopPingInterval()
      stopVoiceCapture()
      // Don't auto-reconnect on data channel close - only reconnect on explicit user action
    }

    dc.onerror = (error) => {
      console.error('📡 Data channel error:', error)
    }

    dc.onmessage = (event) => {
      const localDownloadReceivedMs = Date.now()
      const localDecodeStartMs = Date.now()
      try {
        const message = JSON.parse(event.data)
        const localDecodeEndMs = Date.now()
        handleServerMessage(message, {
          localDownloadReceivedMs,
          localDecodeStartMs,
          localDecodeEndMs
        })
      } catch (error) {
        console.error('Failed to parse message:', error)
      }
    }
  }

  const setupPeerConnectionHandlers = (pc) => {
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      console.log(`🧊 ICE connection state: ${state}`)
      setIceConnectionState(state)

      // Log state changes but don't auto-reconnect during live sessions
      // Let ICE recover naturally - reconnecting closes the backend session
      if (state === 'failed') {
        console.warn('⚠️ ICE connection failed - waiting for recovery')
      } else if (state === 'connected' || state === 'completed') {
        console.log('✅ ICE connection established')
      }
    }

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        // Send ICE candidate to signaling server
        try {
          await fetch(`${SIGNALING_SERVER}/api/ice-candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              candidate: event.candidate.toJSON()
            })
          })
        } catch (error) {
          console.error('Failed to send ICE candidate:', error)
        }
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state: ${pc.connectionState}`)
    }
  }

  const sendEEGPacket = (data) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      return
    }

    const localUploadSendMs = Date.now()
    packetCounterRef.current += 1
    const packetId = `${sessionId}_${packetCounterRef.current}`

    const packet = {
      type: 'eeg_packet',
      packetId,
      timestamp: data.timestamp,
      payload: data.features, // Send raw feature array
      metadata: {
        samplingRate: data.samplingRate,
        channels: data.channels,
        localUploadSendMs,
        ...data.metadata
      }
    }

    try {
      dataChannelRef.current.send(JSON.stringify(packet))
    } catch (error) {
      console.error('Failed to send EEG packet:', error)
    }
  }

  const floatTo16 = (floats) => {
    const pcm = new Int16Array(floats.length)
    for (let i = 0; i < floats.length; i += 1) {
      const s = Math.max(-1, Math.min(1, floats[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return pcm
  }

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }

  const flushVoiceBuffer = (sampleRate) => {
    if (!voiceBufferRef.current.length || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') return
    const floats = voiceBufferRef.current
    voiceBufferRef.current = []
    const pcm16 = floatTo16(floats)
    const b64 = arrayBufferToBase64(pcm16.buffer)

    const packet = {
      type: 'audio_chunk',
      timestamp: Date.now(),
      payload: {
        pcm16: b64,
        sampleRate
      }
    }

    try {
      dataChannelRef.current.send(JSON.stringify(packet))
      lastVoiceSendRef.current = Date.now()
    } catch (error) {
      console.error('Failed to send audio chunk:', error)
    }
  }

  const startVoiceCapture = async () => {
    if (!enableVoice) return
    if (audioContextRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: VOICE_SAMPLE_TARGET
        }
      })

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx({ sampleRate: VOICE_SAMPLE_TARGET })
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(2048, 1, 1)

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0)
        voiceBufferRef.current.push(...input)
        const now = Date.now()
        if (now - lastVoiceSendRef.current >= VOICE_CHUNK_MS) {
          flushVoiceBuffer(ctx.sampleRate)
        }
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      audioContextRef.current = ctx
      audioStreamRef.current = stream
      audioProcessorRef.current = processor
      lastVoiceSendRef.current = Date.now()
      console.log('🎤 Voice capture started')
      onVoiceActivity(true)
    } catch (error) {
      console.error('❌ Voice capture failed:', error)
      onVoiceActivity(false)
    }
  }

  const stopVoiceCapture = () => {
    if (audioProcessorRef.current) {
      try {
        audioProcessorRef.current.disconnect()
      } catch (_) {}
      audioProcessorRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch (_) {}
      audioContextRef.current = null
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }
    voiceBufferRef.current = []
    onVoiceActivity(false)
  }

  const handleServerMessage = (message, localTiming = {}) => {
    if (!message || typeof message !== 'object') return
    switch (message.type) {
      case 'prediction':
        // Handle emotion prediction from server
        if (onPrediction) {
          console.log('📊 Received prediction with feature_importance:', message.feature_importance)
          const baseTiming = message.metadata?.timing || {}
          onPrediction({
            packetId: message.packetId,
            timestamp: message.timestamp,
            arousal: message.arousal,
            valence: message.valence,
            expectation: message.expectation,
            emotion: message.emotion,
            confidence: message.confidence || 0,
            feature_importance: message.feature_importance || {},
            metadata: {
              ...(message.metadata || {}),
              timing: {
                ...baseTiming,
                local_download_received_ms: localTiming.localDownloadReceivedMs,
                local_decode_start_ms: localTiming.localDecodeStartMs,
                local_decode_end_ms: localTiming.localDecodeEndMs
              }
            }
          })
        }
        break

      case 'pong':
        // Calculate latency
        const sentTime = pendingPingsRef.current.get(message.timestamp)
        if (sentTime) {
          const latency = Date.now() - sentTime
          setLatencyMs(latency)
          pendingPingsRef.current.delete(message.timestamp)
        }
        break

      case 'error':
        console.error('Server error:', message.error)
        break

      case 'voice_prediction':
        if (onVoicePrediction) {
          onVoicePrediction({
            timestamp: message.timestamp,
            arousal: message.arousal,
            valence: message.valence,
            expectation: message.expectation,
            metadata: message.metadata || {}
          })
        }
        break

      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  const startPingInterval = () => {
    stopPingInterval()
    stopVoiceCapture()
    
    pingIntervalRef.current = setInterval(() => {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        const timestamp = Date.now()
        pendingPingsRef.current.set(timestamp, timestamp)
        
        // Clean up old pings (older than 5 seconds)
        const cutoff = timestamp - 5000
        for (const [ts] of pendingPingsRef.current) {
          if (ts < cutoff) {
            pendingPingsRef.current.delete(ts)
          }
        }

        dataChannelRef.current.send(JSON.stringify({
          type: 'ping',
          timestamp
        }))
      }
    }, PING_INTERVAL_MS)
  }

  const stopPingInterval = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    pendingPingsRef.current.clear()
  }

  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) {
      return // Already scheduled
    }

    console.log(`🔄 Scheduling reconnect in ${RECONNECT_DELAY_MS}ms...`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null
      cleanup(false)
      initializeConnection()
    }, RECONNECT_DELAY_MS)
  }

  const cleanup = (clearReconnect = true) => {
    console.log('🧹 Cleaning up WebRTC connection...')

    if (clearReconnect && reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    stopPingInterval()

    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close()
      } catch (e) {}
      dataChannelRef.current = null
    }

    if (peerConnection) {
      try {
        peerConnection.close()
      } catch (e) {}
      setPeerConnection(null)
    }

    setDataChannel(null)
    setIceConnectionState('closed')
  }

  // This component doesn't render anything - it just manages the connection
  // Display connection info in parent component
  return (
    <div className="hidden">
      {/* Connection managed in background */}
      {latencyMs !== null && (
        <span data-latency={latencyMs}></span>
      )}
    </div>
  )
}

export default WebRTCClient
