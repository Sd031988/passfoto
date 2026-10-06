import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { evaluateCompliance, summarize, type ComplianceSummary } from './core/compliance'
import type { CropAdjustment } from './core/geometry'
import { GROUP_LABELS, getPreset, presetForAge, PRESETS, REGISTRY } from './core/presets'
import {
  buildPlan,
  computeMetrics,
  exportFilename,
  MEASUREMENT_BASES,
  outputGeometry,
  targetGeometry,
  type MeasurementBasis,
} from './core/pipeline'
import type { CheckResult, PhotoMetrics } from './core/types'
import { mmToPx } from './core/units'
import { analyzePixels, scaleOutputGeometry, type PixelMetrics } from './imaging/analyze'
import { copyToClipboard, downloadBytes, encodeJpeg, encodePng } from './imaging/jpeg'
import { buildPrintSheet, PAPERS, planPrintLayout, type PaperId } from './imaging/printSheet'
import { getImageData, renderCrop } from './imaging/render'
import { faceEngine, type FaceObservation } from './vision/faceEngine'
import { formatInteger, translator, type Language, type TranslationKey } from './i18n'
import { useCamera } from './ui/useCamera'
import { drawOverlay } from './ui/overlay'
import { liveGuidance } from './ui/guidance'
import { PresetList } from './ui/components/PresetList'
import { CheckList, SummaryBadge } from './ui/components/CheckList'
import { ExportPanel, type SheetOptions } from './ui/components/ExportPanel'

type EngineStatus = 'idle' | 'loading' | 'ready' | 'failed'
type Step = 'preset' | 'capture' | 'check' | 'export'

interface Capture {
  frame: HTMLCanvasElement
  observation: FaceObservation
}

interface Result {
  previewUrl: string
  metrics: PhotoMetrics
  checks: CheckResult[]
  summary: ComplianceSummary
  jpeg: Uint8Array
}

const LIVE_ANALYSIS_INTERVAL_MS = 600
const LIVE_DETECT_INTERVAL_MS = 90
const PREVIEW_WIDTH = 420

function newAdjustment(): CropAdjustment {
  return { headHeightMm: undefined, topOffsetMm: 0, sideOffsetMm: 0, zoomFactor: 1 }
}

export default function App() {
  const [language, setLanguage] = useState<Language>('de')
  // Deep-Link ?preset=us-passport wird direkt in den Ausgangszustand übernommen.
  const [initialPresetId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('preset')
    return requested && REGISTRY.byId[requested] ? requested : 'de-personalausweis'
  })
  const [step, setStep] = useState<Step>(initialPresetId === 'de-personalausweis' ? 'preset' : 'capture')
  const [presetId, setPresetId] = useState<string>(initialPresetId)
  const [basis, setBasis] = useState<MeasurementBasis>('scheitel')
  const [ageYears, setAgeYears] = useState<number>(30)
  const [adjustment, setAdjustment] = useState<CropAdjustment>(newAdjustment)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle')
  const [liveObservation, setLiveObservation] = useState<FaceObservation | null>(null)
  const [livePixels, setLivePixels] = useState<PixelMetrics | null>(null)
  const [capture, setCapture] = useState<Capture | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)
  const [quality, setQuality] = useState(0.92)
  const [sheet, setSheet] = useState<SheetOptions>({ paperId: 'a4', copies: 2, cutMarks: true, caption: true })

  const {
    videoRef,
    facingMode,
    status: cameraStatus,
    hasMultipleCameras,
    errorMessage: cameraError,
    start: startCamera,
    stop: stopCamera,
    switchCamera,
  } = useCamera()
  const mirrored = facingMode === 'user'
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)
  const qualityRef = useRef(quality)
  const lastDetectRef = useRef(0)
  const lastAnalysisRef = useRef(0)

  const preset = useMemo(() => presetForAge(getPreset(presetId), ageYears), [presetId, ageYears])

  useEffect(() => {
    qualityRef.current = quality
  }, [quality])

  const t = useMemo(() => translator(language), [language])

  const ensureEngine = useCallback(async () => {
    if (engineStatus === 'ready') return true
    if (engineStatus === 'failed') return false
    setEngineStatus('loading')
    try {
      await faceEngine.load()
      setEngineStatus('ready')
      return true
    } catch {
      setEngineStatus('failed')
      return false
    }
  }, [engineStatus])

  const livePlan = useMemo(() => {
    if (!liveObservation?.detected) return null
    return buildPlan(preset, liveObservation, adjustment, basis)
  }, [liveObservation, preset, adjustment, basis])

  const guidance = useMemo(
    () => liveGuidance({ observation: liveObservation, preset, plan: livePlan, pixels: livePixels }),
    [liveObservation, preset, livePlan, livePixels],
  )

  const analyseLivePixels = useCallback(
    (observation: FaceObservation) => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      const liveCrop = buildPlan(preset, observation, adjustment, basis)
      const ratio = PREVIEW_WIDTH / liveCrop.outWidthPx
      const smallPlan = {
        ...liveCrop,
        outWidthPx: PREVIEW_WIDTH,
        outHeightPx: Math.max(1, Math.round(liveCrop.outHeightPx * ratio)),
      }
      try {
        const canvas = renderCrop(video, smallPlan)
        const geometry = scaleOutputGeometry(outputGeometry(liveCrop, observation, basis), ratio)
        setLivePixels(analyzePixels(getImageData(canvas), geometry))
      } catch {
        setLivePixels(null)
      }
    },
    [preset, adjustment, basis, videoRef],
  )

  /** Aus dem eingefrorenen Bild Ergebnis, Prüfung und Vorschau erzeugen. */
  const processCapture = useCallback(
    async (source: Capture, qualityOverride?: number) => {
      setBusy(true)
      try {
        const activePlan = buildPlan(preset, source.observation, adjustment, basis)
        const full = renderCrop(source.frame, activePlan)
        const ratio = PREVIEW_WIDTH / full.width
        const preview = renderCrop(source.frame, {
          ...activePlan,
          outWidthPx: Math.max(1, Math.round(full.width * ratio)),
        })
        const previewUrl = preview.toDataURL('image/jpeg', 0.82)
        const geometry = outputGeometry(activePlan, source.observation, basis)
        const jpeg = await encodeJpeg(full, preset.dpi, qualityOverride ?? qualityRef.current)
        const metrics = computeMetrics({
          preset,
          plan: activePlan,
          observation: source.observation,
          geometry,
          image: getImageData(full),
          basis,
          outputBytes: jpeg.length,
        })
        const checks = evaluateCompliance({ preset, metrics })
        setResult({ previewUrl, metrics, checks, summary: summarize(checks), jpeg })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    },
    [adjustment, basis, preset],
  )

  useEffect(() => {
    if (!capture) return
    // Das Ergebnis wird im Effekt erzeugt, damit der Klick-Handler nicht
    // blockiert; die Aufnahme selbst löst die Verarbeitung aus.
    const run = requestAnimationFrame(() => void processCapture(capture))
    return () => cancelAnimationFrame(run)
  }, [capture, processCapture])

  // Vorschaubild zeichnen, sobald ein neues Ergebnis vorliegt.
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !result) return
    const image = new Image()
    image.onload = () => {
      const context = canvas.getContext('2d')
      if (!context) return
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      context.drawImage(image, 0, 0)
    }
    image.src = result.previewUrl
  }, [result])

  // Beim Wechsel des Presets Einstellungen und Druckblatt zurücksetzen.
  const presetIdRef = useRef(preset.id)
  useEffect(() => {
    if (presetIdRef.current === preset.id) return
    presetIdRef.current = preset.id
    setAdjustment(newAdjustment())
    setSheet((previous) => ({
      ...previous,
      paperId: (preset.printSheets[0] ?? 'a4') as PaperId,
      copies: preset.printCopies,
    }))
    setQuality(preset.digital.quality)
  }, [preset])

  useEffect(() => {
    if (step !== 'export') return
    exportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [step])

  useEffect(() => () => faceEngine.close(), [])

  useEffect(() => {
    let raf = 0
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      if (!video || video.readyState < 2 || engineStatus !== 'ready') return
      if (now - lastDetectRef.current < LIVE_DETECT_INTERVAL_MS) return
      lastDetectRef.current = now

      const observation = faceEngine.detectVideo(video, now)
      setLiveObservation(observation)

      if (observation.detected && now - lastAnalysisRef.current >= LIVE_ANALYSIS_INTERVAL_MS) {
        lastAnalysisRef.current = now
        analyseLivePixels(observation)
      }

      const overlay = overlayRef.current
      const context = overlay?.getContext('2d')
      if (!overlay || !context) return
      const rect = overlay.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))
      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width
        overlay.height = height
      }
      drawOverlay(context, {
        observation,
        preset,
        basis,
        adjustment,
        mirrored,
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineStatus, preset, basis, adjustment, mirrored, analyseLivePixels, videoRef])

  const takePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    setBusy(true)
    try {
      const frame = document.createElement('canvas')
      frame.width = video.videoWidth
      frame.height = video.videoHeight
      frame.getContext('2d')?.drawImage(video, 0, 0)
      const observation = await faceEngine.detectImage(frame)
      if (!observation.detected) {
        setMessage(t('guide.noFace'))
        return
      }
      setCapture({ frame, observation })
      setLiveObservation(observation)
      setStep('check')
    } finally {
      setBusy(false)
    }
  }, [videoRef, t])

  const handleUpload = useCallback(
    async (file: File) => {
      setBusy(true)
      try {
        const bitmap = await createImageBitmap(file)
        const frame = document.createElement('canvas')
        const maxEdge = 4000
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
        frame.width = Math.round(bitmap.width * scale)
        frame.height = Math.round(bitmap.height * scale)
        frame.getContext('2d')?.drawImage(bitmap, 0, 0, frame.width, frame.height)
        bitmap.close()
        if (!(await ensureEngine())) {
          setMessage(t('camera.modelFailed'))
          return
        }
        const observation = await faceEngine.detectImage(frame)
        if (!observation.detected) {
          setMessage(t('guide.noFace'))
          return
        }
        setCapture({ frame, observation })
        setStep('check')
      } catch {
        setMessage(t('camera.modelFailed'))
      } finally {
        setBusy(false)
      }
    },
    [ensureEngine, t],
  )

  const retake = useCallback(() => {
    setCapture(null)
    setResult(null)
    setStep('capture')
  }, [])

  const handleDownloadPhoto = useCallback(() => {
    if (!result) return
    downloadBytes(result.jpeg, exportFilename(preset), 'image/jpeg')
  }, [result, preset])

  const handleDownloadPng = useCallback(async () => {
    if (!capture || !result) return
    setBusy(true)
    try {
      const canvas = renderCrop(capture.frame, buildPlan(preset, capture.observation, adjustment, basis))
      const png = await encodePng(canvas, preset.dpi)
      downloadBytes(png, exportFilename(preset).replace(/\.jpg$/, '.png'), 'image/png')
    } finally {
      setBusy(false)
    }
  }, [capture, result, preset, adjustment, basis])

  const handleCopy = useCallback(async () => {
    if (!result) return
    const ok = await copyToClipboard(new Blob([result.jpeg as BlobPart], { type: 'image/jpeg' }))
    setMessage(ok ? t('export.clipboardOk') : t('export.clipboardFailed'))
  }, [result, t])

  const handleDownloadSheet = useCallback(() => {
    if (!result) return
    const { pdf } = buildPrintSheet(result.jpeg, preset, PAPERS[sheet.paperId], {
      copies: sheet.copies,
      includeCutMarks: sheet.cutMarks,
      caption: sheet.caption ? preset.label : undefined,
      dateLabel: new Date().toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE'),
    })
    downloadBytes(pdf, exportFilename(preset, 'bogen').replace(/\.jpg$/, '.pdf'), 'application/pdf')
  }, [result, preset, sheet, language])

  const handleBatchExport = useCallback(async () => {
    if (!capture) return
    setBusy(true)
    try {
      const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
      for (const target of PRESETS.filter((candidate) => candidate.group === preset.group)) {
        const canvas = renderCrop(capture.frame, buildPlan(target, capture.observation, adjustment, basis))
        const jpeg = await encodeJpeg(canvas, target.dpi, target.digital.quality)
        downloadBytes(jpeg, exportFilename(target), 'image/jpeg')
        await wait(400)
      }
    } finally {
      setBusy(false)
    }
  }, [capture, adjustment, basis])

  const handleStartCamera = useCallback(async () => {
    await startCamera()
    if (!(await ensureEngine())) setMessage(t('camera.modelFailed'))
  }, [startCamera, ensureEngine, t])

  const layout = useMemo(
    () => planPrintLayout(preset, PAPERS[sheet.paperId], sheet.copies),
    [preset, sheet.paperId, sheet.copies],
  )

  const target = targetGeometry(preset, adjustment)
  const headPxMin = Math.round(mmToPx(preset.head.minMm, preset.dpi))
  const headPxMax = Math.round(mmToPx(preset.head.maxMm, preset.dpi))

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">{t('app.title')}</h1>
          <p className="text-sm text-slate-400">{t('app.tagline')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            {t('app.privacyBadge')}
          </span>
          <div className="flex overflow-hidden rounded-lg border border-ink-600/50">
            {(['de', 'en'] as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  language === code ? 'bg-mint-500 text-ink-950' : 'text-slate-300'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="flex gap-1 rounded-lg border border-ink-600/40 bg-ink-900/60 p-1 text-sm">
        {(['preset', 'capture', 'check', 'export'] as Step[]).map((id, index) => {
          const active = step === id
          const reachable = id === 'preset' || id === 'capture' || Boolean(capture)
          return (
            <button
              key={id}
              type="button"
              disabled={!reachable}
              onClick={() => setStep(id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium transition disabled:opacity-40 ${
                active ? 'bg-ink-700 text-white' : 'text-slate-300 hover:bg-ink-800/70'
              }`}
            >
              <span className="mr-1.5 text-xs opacity-60">{index + 1}</span>
              {t(`step.${id}` as TranslationKey)}
            </button>
          )
        })}
      </nav>

      <div className="grid flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="rounded-xl border border-ink-600/40 bg-ink-900/60 p-3">
          <PresetList
            selectedId={preset.id}
            onSelect={(next) => {
              setPresetId(next.id)
              setStep('capture')
            }}
            language={language}
          />
        </aside>

        <main className="space-y-4">
          <section className="rounded-xl border border-ink-600/40 bg-ink-900/60 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
              <h2 className="text-sm font-semibold text-slate-100">{preset.label}</h2>
              <span className="text-xs text-slate-400">
                {GROUP_LABELS[preset.group]} · {t('preset.verifiedAt')} {preset.verifiedAt}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-ink-800/60 p-2">
                <dt className="text-slate-400">{t('preset.size')}</dt>
                <dd className="font-semibold text-slate-100">
                  {formatInteger(preset.widthMm, language)} × {formatInteger(preset.heightMm, language)} mm
                </dd>
              </div>
              <div className="rounded-lg bg-ink-800/60 p-2">
                <dt className="text-slate-400">{t('preset.head')}</dt>
                <dd className="font-semibold text-slate-100">
                  {preset.head.minMm}–{preset.head.maxMm} mm
                </dd>
              </div>
              <div className="rounded-lg bg-ink-800/60 p-2">
                <dt className="text-slate-400">{t('preset.background')}</dt>
                <dd className="font-semibold text-slate-100">
                  {preset.background.tones.map((tone) => t(`preset.tones.${tone}` as TranslationKey)).join(' / ')}
                </dd>
              </div>
              <div className="rounded-lg bg-ink-800/60 p-2">
                <dt className="text-slate-400">{t('preset.age')}</dt>
                <dd className="font-semibold text-slate-100">{preset.maxAgeMonths} Monate</dd>
              </div>
            </dl>

            {preset.authorityRestriction && (
              <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                <strong>{t('preset.authority')}: </strong>
                {preset.authorityRestriction}
              </p>
            )}

            {preset.notes.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-400">
                {preset.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-xs text-slate-500">
              {t('preset.source')}:{' '}
              <a
                href={preset.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-mint-400 underline"
              >
                {preset.source.label}
              </a>{' '}
              · {preset.confidence === 'offiziell' ? t('preset.confidence.offiziell') : t('preset.confidence.praxis')}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-600/30 pt-3 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-slate-400">{t('basis.label')}</span>
                <select
                  value={basis}
                  onChange={(event) => setBasis(event.target.value as MeasurementBasis)}
                  className="rounded-lg border border-ink-600/50 bg-ink-900 px-2 py-1"
                >
                  {MEASUREMENT_BASES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {language === 'en' && option.id === 'scheitel' ? 'chin to crown' : option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-slate-400">Alter</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={ageYears}
                  onChange={(event) => setAgeYears(Number(event.target.value))}
                  className="w-16 rounded-lg border border-ink-600/50 bg-ink-900 px-2 py-1"
                />
              </label>
              <p className="max-w-md text-slate-500">{t('basis.hint')}</p>
            </div>
          </section>

          <section className="rounded-xl border border-ink-600/40 bg-ink-900/60 p-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="w-full md:max-w-sm">
                <div
                  className="relative w-full overflow-hidden rounded-lg bg-black/40"
                  style={{
                    aspectRatio:
                      videoSize && cameraStatus === 'running'
                        ? `${videoSize.width} / ${videoSize.height}`
                        : '4 / 5',
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    onLoadedMetadata={(event) => {
                      const element = event.currentTarget
                      setVideoSize({ width: element.videoWidth, height: element.videoHeight })
                    }}
                    className={`h-full w-full object-cover ${
                      mirrored ? '-scale-x-100' : ''
                    } ${cameraStatus === 'running' ? '' : 'hidden'}`}
                  />
                  <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                  {cameraStatus !== 'running' && (
                    <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-slate-400">
                      {engineStatus === 'loading' ? t('camera.loadingModel') : t('camera.title')}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {cameraStatus === 'running' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void takePhoto()}
                        disabled={busy}
                        className="rounded-lg bg-mint-500 px-3 py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"
                      >
                        {t('camera.capture')}
                      </button>
                      {hasMultipleCameras && (
                        <button
                          type="button"
                          onClick={switchCamera}
                          className="rounded-lg border border-ink-600/60 px-3 py-2 text-sm"
                        >
                          {t('camera.switch')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="rounded-lg border border-ink-600/60 px-3 py-2 text-sm"
                      >
                        {t('camera.stop')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStartCamera()}
                      className="rounded-lg bg-mint-500 px-3 py-2 text-sm font-semibold text-ink-950"
                    >
                      {t('camera.start')}
                    </button>
                  )}

                  <label className="cursor-pointer rounded-lg border border-ink-600/60 px-3 py-2 text-sm">
                    {t('camera.upload')}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void handleUpload(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>

                {cameraStatus === 'denied' && (
                  <p className="mt-2 text-xs text-rose-300">{t('camera.permissionDenied')}</p>
                )}
                {cameraStatus === 'unavailable' && (
                  <p className="mt-2 text-xs text-amber-300">{t('camera.notFound')}</p>
                )}
                {cameraError && cameraStatus === 'error' && (
                  <p className="mt-2 text-xs text-amber-300">{cameraError}</p>
                )}
                {engineStatus === 'failed' && (
                  <p className="mt-2 text-xs text-amber-300">{t('camera.modelFailed')}</p>
                )}
                {message && <p className="mt-2 text-xs text-slate-300">{message}</p>}
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                    {t('check.title')}
                  </h3>
                  <ul className="space-y-1">
                    {guidance.length === 0 ? (
                      <li className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">
                        {t('guide.sizeOk')}
                      </li>
                    ) : (
                      guidance.map((hint) => (
                        <li key={hint} className="rounded-lg bg-ink-800/60 px-2.5 py-1.5 text-xs text-slate-200">
                          {t(hint)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                {livePlan && (
                  <p className="text-xs text-slate-400">
                    {t('guide.headSize')}:{' '}
                    <span
                      className={
                        livePlan.headHeightMm < preset.head.minMm || livePlan.headHeightMm > preset.head.maxMm
                          ? 'font-semibold text-amber-300'
                          : 'font-semibold text-emerald-300'
                      }
                    >
                      {livePlan.headHeightMm.toFixed(1)} mm
                    </span>{' '}
                    / {preset.head.minMm}–{preset.head.maxMm} mm
                  </p>
                )}

                {capture && (
                  <div className="space-y-2 rounded-lg border border-ink-600/40 p-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                        {t('adjust.head')}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setAdjustment(newAdjustment())}
                        className="text-xs text-mint-400 underline"
                      >
                        {t('adjust.reset')}
                      </button>
                    </div>

                    <label className="block text-xs">
                      <span className="flex justify-between text-slate-300">
                        <span>{t('adjust.head')}</span>
                        <span>
                          {target.headHeightMm.toFixed(1)} mm · {t('adjust.target')} {preset.head.minMm}–
                          {preset.head.maxMm}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={preset.head.minMm}
                        max={preset.head.maxMm}
                        step={0.1}
                        value={target.headHeightMm}
                        onChange={(event) =>
                          setAdjustment((previous) => ({ ...previous, headHeightMm: Number(event.target.value) }))
                        }
                        className="w-full"
                      />
                      <span className="text-[10px] text-slate-500">
                        {headPxMin}–{headPxMax} px bei {preset.dpi} dpi
                      </span>
                    </label>

                    <label className="block text-xs">
                      <span className="flex justify-between text-slate-300">
                        <span>{t('adjust.vertical')}</span>
                        <span>{(adjustment.topOffsetMm ?? 0).toFixed(1)} mm</span>
                      </span>
                      <input
                        type="range"
                        min={-8}
                        max={8}
                        step={0.1}
                        value={adjustment.topOffsetMm ?? 0}
                        onChange={(event) =>
                          setAdjustment((previous) => ({ ...previous, topOffsetMm: Number(event.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <label className="block text-xs">
                      <span className="flex justify-between text-slate-300">
                        <span>{t('adjust.horizontal')}</span>
                        <span>{(adjustment.sideOffsetMm ?? 0).toFixed(1)} mm</span>
                      </span>
                      <input
                        type="range"
                        min={-8}
                        max={8}
                        step={0.1}
                        value={adjustment.sideOffsetMm ?? 0}
                        onChange={(event) =>
                          setAdjustment((previous) => ({ ...previous, sideOffsetMm: Number(event.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <p className="text-[11px] text-slate-500">
                      {t(`adjust.crownSource.${capture.observation.crownSource}` as TranslationKey)}
                    </p>

                    <button
                      type="button"
                      onClick={retake}
                      className="w-full rounded-lg border border-ink-600/60 px-3 py-2 text-sm"
                    >
                      {t('camera.retake')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {result && (
            <section className="rounded-xl border border-ink-600/40 bg-ink-900/60 p-3">
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="flex flex-col items-center gap-2">
                  <canvas
                    ref={previewRef}
                    className="max-h-[420px] rounded-lg border border-ink-600/40 bg-black/40 object-contain"
                  />
                  <div className="text-center text-xs text-slate-400">
                    {formatInteger(result.metrics.outputWidthPx, language)} ×{' '}
                    {formatInteger(result.metrics.outputHeightPx, language)} px · {preset.dpi} dpi
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <SummaryBadge
                    status={result.summary.status}
                    passed={result.summary.passed}
                    total={result.summary.total}
                    language={language}
                  />
                  <CheckList checks={result.checks} language={language} />
                </div>
              </div>
            </section>
          )}
        </main>

        <aside className="space-y-4">
          <div ref={exportRef}>
            <ExportPanel
              preset={preset}
              metrics={result?.metrics ?? null}
              checks={result?.checks ?? []}
              jpegBytes={result?.jpeg.length ?? null}
              perPage={layout.perPage}
              quality={quality}
              sheet={sheet}
              language={language}
              busy={busy}
              onQualityChange={(value) => {
                setQuality(value)
                if (capture) void processCapture(capture, value)
              }}
              onSheetChange={setSheet}
              onDownloadPhoto={handleDownloadPhoto}
              onDownloadPng={handleDownloadPng}
              onDownloadSheet={handleDownloadSheet}
              onCopyClipboard={() => void handleCopy()}
              onBatchExport={() => void handleBatchExport()}
            />
          </div>

          <section className="rounded-xl border border-ink-600/40 bg-ink-900/60 p-3 text-xs text-slate-400">
            <h3 className="pb-1 font-semibold text-slate-200">{t('privacy.title')}</h3>
            <p>{t('privacy.text')}</p>
          </section>
          <section className="rounded-xl border border-ink-600/40 bg-ink-900/60 p-3 text-xs text-slate-400">
            <h3 className="pb-1 font-semibold text-slate-200">{t('disclaimer.title')}</h3>
            <p>{t('disclaimer.text')}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}