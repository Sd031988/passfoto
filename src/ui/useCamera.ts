import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'starting' | 'running' | 'denied' | 'unavailable' | 'error'

export interface CameraState {
  status: CameraStatus
  facingMode: 'user' | 'environment'
  hasMultipleCameras: boolean
  errorMessage?: string
}

export interface UseCameraResult extends CameraState {
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: (facingMode?: 'user' | 'environment') => Promise<void>
  stop: () => void
  switchCamera: () => void
}

const RESOLUTION = { width: { ideal: 2560 }, height: { ideal: 1920 } }
const BACK_LABEL = /back|rear|environment|rück|hinten|arrière|trasera|posteriore/i
const FRONT_LABEL = /front|user|facetime|vorder|selfie/i

function actualFacing(stream: MediaStream): string | undefined {
  const track = stream.getVideoTracks()[0]
  const settings = track?.getSettings?.() as MediaTrackSettings | undefined
  return settings?.facingMode
}

/**
 * Öffnet die gewünschte Kamera. `facingMode` allein ist nur ein Wunsch und wird
 * von manchen Browsern ignoriert; deshalb zuerst `exact`, dann Auswahl über den
 * Gerätenamen und zuletzt eine Anfrage ohne Auflösungsvorgabe.
 */
async function openCamera(mode: 'user' | 'environment'): Promise<MediaStream> {
  const attempts: MediaTrackConstraints[] = [
    { facingMode: { exact: mode }, ...RESOLUTION },
    { facingMode: { exact: mode } },
  ]
  for (const video of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false })
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') throw error
    }
  }
  const fallback = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, ...RESOLUTION }, audio: false })
  const facing = actualFacing(fallback)
  if (facing === mode) return fallback
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput')
  const wanted = devices.find((device) => (mode === 'environment' ? BACK_LABEL : FRONT_LABEL).test(device.label))
  const current = fallback.getVideoTracks()[0]?.getSettings?.().deviceId
  if (!wanted || wanted.deviceId === current) return fallback
  fallback.getTracks().forEach((track) => track.stop())
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: wanted.deviceId }, ...RESOLUTION }, audio: false })
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false })
  }
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setStatus('idle')
  }, [])

  const start = useCallback(
    async (mode: 'user' | 'environment' = facingMode) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        setErrorMessage('getUserMedia wird von diesem Browser nicht unterstützt.')
        return
      }
      setStatus('starting')
      setErrorMessage(undefined)
      // Laufende Kamera zuerst freigeben: viele Handys erlauben nur eine
      // geöffnete Kamera – sonst schlägt der Wechsel auf die Rückkamera fehl.
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      try {
        const stream = await openCamera(mode)
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
        }
        const devices = await navigator.mediaDevices.enumerateDevices()
        setHasMultipleCameras(devices.filter((device) => device.kind === 'videoinput').length > 1)
        const facing = actualFacing(stream)
        setFacingMode(facing === 'user' || facing === 'environment' ? facing : mode)
        setStatus('running')
      } catch (error) {
        const name = error instanceof DOMException ? error.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('unavailable')
        else setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    },
    [facingMode],
  )

  const switchCamera = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    void start(next)
  }, [facingMode, start])

  useEffect(() => stop, [stop])

  return { status, facingMode, hasMultipleCameras, errorMessage, videoRef, start, stop, switchCamera }
}