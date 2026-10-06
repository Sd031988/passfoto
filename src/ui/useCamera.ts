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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          audio: false,
        })
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
        }
        const devices = await navigator.mediaDevices.enumerateDevices()
        setHasMultipleCameras(devices.filter((device) => device.kind === 'videoinput').length > 1)
        setFacingMode(mode)
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