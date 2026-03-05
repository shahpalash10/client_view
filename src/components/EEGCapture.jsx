import { useEffect, useRef, useState } from 'react'
import { FaceMesh, FACEMESH_TESSELATION } from '@mediapipe/face_mesh'
import { useLanguage } from '../context/LanguageContext'

/**
 * EEGCapture Component (Camera-only)
 * - Uses webcam + MediaPipe FaceMesh
 * - Extracts landmarks 1..467 and emits 1401 features
 * - No simulated data or device placeholders included
 */
function EEGCapture({ active, onDataUpdate, pcaLoadings, selectedComponent }) {
  const videoRef = useRef(null)
  const videoRef2 = useRef(null)
  const faceMeshRef = useRef(null)
  const cameraRef = useRef(null)
  const lastSentRef = useRef(0)
  const [connected, setConnected] = useState(false)
  const [sendHz, setSendHz] = useState(5)
  const canvasRef = useRef(null)
  const lastLandmarksRef = useRef(null)
  const { t } = useLanguage()

  useEffect(() => {
    if (active) startCamera()
    else stopCamera()

    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sendHz])

  // redraw overlay when selected component or pca loadings change
  useEffect(() => {
    drawOverlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComponent, pcaLoadings])

  const sendIntervalMs = () => Math.max(1, Math.floor(1000 / sendHz))

  const onResults = (results) => {
    const now = Date.now()
    if (now - lastSentRef.current < sendIntervalMs()) return
    lastSentRef.current = now

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return

    const landmarks = results.multiFaceLandmarks[0]
    // store last landmarks for overlay drawing
    lastLandmarksRef.current = landmarks
    drawOverlay()
    const features = []
    // use indices 1..467 (skip index 0 to match model training)
    for (let i = 1; i <= 467; i++) {
      const lm = landmarks[i]
      features.push(lm.x, lm.y, lm.z)
    }

    if (onDataUpdate) {
      onDataUpdate({
        timestamp: now,
        features: features,
        samplingRate: sendHz,
        channels: 467,
        metadata: { source: 'camera', deviceId: 'webcam' }
      })
    }
  }

  const startCamera = async () => {
    try {
      if (!videoRef.current) return

      const FaceMeshCtor =
        typeof FaceMesh === 'function'
          ? FaceMesh
          : (FaceMesh && typeof FaceMesh.FaceMesh === 'function' ? FaceMesh.FaceMesh : null)

      if (!FaceMeshCtor) {
        throw new Error('MediaPipe FaceMesh constructor unavailable')
      }

      const faceMesh = new FaceMeshCtor({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      })

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      faceMesh.onResults(onResults)
      faceMeshRef.current = faceMesh

      // Use getUserMedia + requestAnimationFrame loop instead of Camera helper
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      videoRef.current.srcObject = stream
      // if the optional second view exists, attach same stream for side-by-side
      if (videoRef2.current) {
        try { videoRef2.current.srcObject = stream } catch (e) { /* some browsers may restrict multiple srcObject attachments */ }
      }
      await videoRef.current.play()
      if (videoRef2.current) {
        try { await videoRef2.current.play() } catch (e) { /* ignore */ }
      }

      let rafId = null
      const frameLoop = async () => {
        try {
          if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoRef.current })
        } catch (e) {
          // ignore frame errors
        }
        rafId = requestAnimationFrame(frameLoop)
      }

      rafId = requestAnimationFrame(frameLoop)
      cameraRef.current = { stream, rafId }
      setConnected(true)
    } catch (err) {
      console.error('Failed to start camera/MediaPipe', err)
      setConnected(false)
    }
  }

  const drawOverlay = () => {
    const canvas = canvasRef.current
    const video = videoRef.current
    const landmarks = lastLandmarksRef.current
    if (!canvas || !video || !landmarks) return

    const ctx = canvas.getContext('2d')
    // Use video element's display dimensions to match the visible area
    const displayWidth = video.clientWidth
    const displayHeight = video.clientHeight
    
    // Set canvas to match display size for pixel-perfect overlay
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth
      canvas.height = displayHeight
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // ALWAYS draw mesh connections (tesselation) regardless of selected component
    try {
      // Draw mesh with anti-aliasing and proper scaling
      ctx.save()
      ctx.strokeStyle = 'rgba(0, 255, 200, 0.9)'  // Very bright for visibility
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      
      // Draw all tesselation connections
      for (const edge of FACEMESH_TESSELATION) {
        const i = edge[0]
        const j = edge[1]
        
        if (i >= landmarks.length || j >= landmarks.length) continue
        
        const li = landmarks[i]
        const lj = landmarks[j]
        
        if (!li || !lj) continue
        
        // Convert normalized coordinates to canvas coordinates
        const x1 = li.x * canvas.width
        const y1 = li.y * canvas.height
        const x2 = lj.x * canvas.width
        const y2 = lj.y * canvas.height
        
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      
      ctx.restore()
    } catch (e) {
      // ignore if FACEMESH_TESSELATION not available or malformed
      console.warn('Failed to draw face mesh:', e)
    }

    // ONLY draw landmark highlights if a component is selected
    if (selectedComponent == null || !pcaLoadings) return

    // find component entry
    const comp = pcaLoadings.components.find(c => c.component === selectedComponent)
    if (!comp) return

    // map weights by landmark
    const weightMap = new Map()
    comp.top_landmarks.forEach(item => weightMap.set(item.landmark, item.weight_pct))

    // draw circles for top landmarks
    for (const [landmarkIdx, weightPct] of weightMap.entries()) {
      // PCA landmark indices are 0-based for the original feature groups.
      // Our MediaPipe landmarks used when building features skip index 0 (we sent 1..467).
      // Map PCA landmark index to MediaPipe landmark by adding 1 where possible.
      const mappedIdx = Math.min(landmarks.length - 1, landmarkIdx + 1)
      const lm = landmarks[mappedIdx]
      if (!lm) continue
      const x = lm.x * canvas.width
      const y = lm.y * canvas.height
      const radius = Math.max(6, (weightPct / 100) * 30)

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
      grad.addColorStop(0, `rgba(255,255,255,${Math.min(0.9, weightPct/100)})`)
      grad.addColorStop(1, 'rgba(59,130,246,0)')

      ctx.beginPath()
      ctx.fillStyle = grad
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const stopCamera = () => {
    try {
      if (cameraRef.current) {
        if (cameraRef.current.rafId) cancelAnimationFrame(cameraRef.current.rafId)
        if (cameraRef.current.stream) {
          cameraRef.current.stream.getTracks().forEach((t) => t.stop())
        }
        cameraRef.current = null
      }
      if (videoRef.current) {
        try { videoRef.current.pause(); videoRef.current.srcObject = null } catch(e) {}
      }
    } catch (e) {}

    try {
      if (faceMeshRef.current) {
        faceMeshRef.current.close()
        faceMeshRef.current = null
      }
    } catch (e) {}

    setConnected(false)
  }

  return (
    <div className="group relative rounded-[32px] border border-black/5 bg-white p-8 shadow-[0_25px_80px_rgba(15,23,42,0.08)] transition-all duration-500 hover:-translate-y-1">
      <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,#ffffff,transparent_70%)] opacity-70" />

      <div className="relative">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-zinc-50">
            <svg className="h-6 w-6 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{t('capture.eyebrow')}</p>
            <h2 className="text-xl font-light text-zinc-900">{t('capture.title')}</h2>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-xs uppercase tracking-[0.3em] text-zinc-400">{t('capture.sendRate')}</label>
          <div className="relative">
            <input 
              type="number" 
              value={sendHz} 
              onChange={(e) => setSendHz(Math.max(1, Number(e.target.value) || 1))} 
              min={1} 
              max={30} 
              className="w-full rounded-2xl border border-black/10 bg-zinc-50 px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-black focus:bg-white focus:outline-none"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">{t('generic.hz')}</div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">{t('capture.sendRateHelp')}</p>
        </div>

        <div className="space-y-4">
          <div className="relative group/video">
            <div className={`grid w-full grid-cols-1 gap-3 overflow-hidden rounded-[28px] border bg-zinc-100 transition duration-500 md:grid-cols-2 ${
              connected ? 'shadow-[0_20px_60px_rgba(15,23,42,0.15)] border-black/10' : 'border-dashed border-black/10'
            }`}>
              {/* MediaPipe overlay view with mesh */}
              <div className="relative w-full aspect-video overflow-hidden">
                <div className="absolute left-2 top-2 z-10 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-700">
                  {t('capture.meshOverlay')}
                </div>
                {connected && (
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
                )}
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                {!connected && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <svg className="mx-auto mb-2 h-12 w-12 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-zinc-500">{t('capture.cameraInactive')}</p>
                      <p className="text-sm text-zinc-500">{t('capture.cameraInactive')}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Plain camera view (side-by-side) */}
              <div className="relative w-full aspect-video overflow-hidden hidden md:block">
                <div className="absolute left-2 top-2 z-10 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-700">
                  {t('capture.original')}
                </div>
                <video ref={videoRef2} className="w-full h-full object-cover" autoPlay muted playsInline />
                <div className="absolute inset-0 pointer-events-none" />
              </div>
            </div>
            {connected && (
              <div className="absolute -top-2 -right-2">
                <div className="relative">
                  <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-400 blur-md"></div>
                  <div className="relative h-4 w-4 rounded-full border-2 border-white bg-emerald-500"></div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-400">{t('capture.status')}</div>
              <div className={`text-base font-medium ${connected ? 'text-emerald-600' : 'text-zinc-500'}`}>
                {connected ? t('capture.active') : t('capture.inactive')}
              </div>
            </div>
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-400">{t('capture.features')}</div>
              <div className="text-base font-medium text-zinc-800">1401</div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/5 bg-zinc-50 p-4 text-sm text-zinc-600">
            {t('capture.description')}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EEGCapture
