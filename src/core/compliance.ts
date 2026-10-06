import type { CheckResult, CheckStatus, PhotoMetrics, Preset } from './types'
import { formatBytes, round } from './units'

/**
 * Toleranzen. Die Maßangaben stammen aus den Quellen in den Presets.
 * Die Bildqualitäts-Schwellen sind heuristische Orientierungswerte: sie ersetzen
 * keine amtliche Prüfung, machen aber die typischen Ablehnungsgründe sichtbar.
 */
export const THRESHOLDS = {
  rollDeg: { pass: 3, warn: 5 },
  yawDeg: { pass: 4, warn: 6 },
  pitchDeg: { pass: 5, warn: 8 },
  eyeOpen: { pass: 0.35, warn: 0.2 },
  mouthOpen: { pass: 0.15, warn: 0.3 },
  smile: { pass: 0.12, warn: 0.3 },
  sharpness: { pass: 0.35, warn: 0.18 },
  faceLuminance: { minPass: 0.28, maxPass: 0.78, minWarn: 0.16, maxWarn: 0.9 },
  faceHighlightClip: { pass: 0.005, warn: 0.02 },
  faceShadowClip: { pass: 0.01, warn: 0.035 },
  faceShadowAsymmetry: { pass: 0.05, warn: 0.12 },
  backgroundVariance: { pass: 0.05, warn: 0.1 },
  backgroundTexture: { pass: 0.015, warn: 0.05 },
  backgroundSaturation: { pass: 0.1, warn: 0.2 },
  faceColorCast: { pass: 0.05, warn: 0.1 },
  /** Pure-Weiß-Schwelle für die Hintergrundfarbanalyse. */
  pureWhiteLuminance: 0.93,
  /** Toleranz der Mittellinie als Anteil der Bildbreite. */
  centerXTolerance: 0.03,
} as const

function band(value: number, pass: number, warn: number, symmetric = true): CheckStatus {
  if (symmetric) {
    const abs = Math.abs(value)
    if (abs <= pass) return 'pass'
    if (abs <= warn) return 'warn'
    return 'fail'
  }
  if (value >= pass && value <= warn) return 'pass'
  if (value >= pass - (warn - pass) && value <= warn + (warn - pass)) return 'warn'
  return 'fail'
}

function lowerBand(value: number, minPass: number, minFail: number): CheckStatus {
  if (value >= minPass) return 'pass'
  if (value >= minFail) return 'warn'
  return 'fail'
}

function upperBand(value: number, maxPass: number, maxFail: number): CheckStatus {
  if (value <= maxPass) return 'pass'
  if (value <= maxFail) return 'warn'
  return 'fail'
}

function rangeStatus(value: number, min: number, max: number, margin = 0): CheckStatus {
  if (value >= min && value <= max) return 'pass'
  const slackMin = min - margin
  const slackMax = max + margin
  if (value >= slackMin && value <= slackMax) return 'warn'
  return 'fail'
}

const pct = (value: number) => `${round(value * 100, 1)} %`

export interface ComplianceInput {
  preset: Preset
  metrics: PhotoMetrics
  /** Kopfhöhe wurde manuell korrigiert. */
  headHeightAdjusted?: boolean
}

export function evaluateCompliance({ preset, metrics }: ComplianceInput): CheckResult[] {
  const t = THRESHOLDS
  const checks: CheckResult[] = []
  const faceDetected = metrics.facesDetected > 0

  checks.push({
    id: 'faces',
    category: 'masse',
    labelKey: 'check.faces',
    status: metrics.facesDetected === 1 ? 'pass' : 'fail',
    measured: String(metrics.facesDetected),
    target: '1',
    value: metrics.facesDetected,
    hintKey: metrics.facesDetected === 0 ? 'hint.noFace' : 'hint.multipleFaces',
  })

  checks.push({
    id: 'frame',
    category: 'masse',
    labelKey: 'check.frame',
    status: metrics.cropOutOfFrame ? 'fail' : 'pass',
    measured: metrics.cropOutOfFrame ? 'ragt über den Bildrand' : 'vollständig im Bild',
    target: 'vollständig im Bild',
    value: metrics.cropOutOfFrame ? 1 : 0,
    hintKey: metrics.cropOutOfFrame ? 'hint.frame' : undefined,
  })

  checks.push({
    id: 'photoSize',
    category: 'masse',
    labelKey: 'check.photoSize',
    status: 'pass',
    measured: `${round(preset.widthMm, 1)} × ${round(preset.heightMm, 1)} mm`,
    target: `${preset.widthMm} × ${preset.heightMm} mm`,
    value: preset.widthMm,
  })

  const headShare = metrics.headHeightMm / preset.heightMm
  const headStatus = rangeStatus(metrics.headHeightMm, preset.head.minMm, preset.head.maxMm, 0.75)
  checks.push({
    id: 'headHeight',
    category: 'masse',
    labelKey: 'check.headHeight',
    status: headStatus,
    measured: `${round(metrics.headHeightMm, 1)} mm (${pct(headShare)})`,
    target:
      preset.head.minRatio !== undefined && preset.head.maxRatio !== undefined
        ? `${round(preset.head.minMm, 1)}–${round(preset.head.maxMm, 1)} mm (${Math.round(preset.head.minRatio * 100)}–${Math.round(preset.head.maxRatio * 100)} %)`
        : `${round(preset.head.minMm, 1)}–${round(preset.head.maxMm, 1)} mm`,
    value: metrics.headHeightMm,
    range: [preset.head.minMm, preset.head.maxMm],
    hintKey: metrics.crownSource !== 'manuell' ? 'hint.crownEstimated' : undefined,
  })

  checks.push({
    id: 'topMargin',
    category: 'masse',
    labelKey: 'check.topMargin',
    status: metrics.topMarginMm >= 0.5 && metrics.crownInsideFrame ? 'pass' : 'fail',
    measured: metrics.crownInsideFrame ? `${round(metrics.topMarginMm, 1)} mm` : 'abgeschnitten',
    target: 'Scheitel im Bild',
    value: metrics.topMarginMm,
    hintKey: metrics.crownInsideFrame ? undefined : 'hint.crownCutOff',
  })

  if (preset.faceWidth) {
    const fw = metrics.faceWidthMm
    checks.push({
      id: 'faceWidth',
      category: 'masse',
      labelKey: 'check.faceWidth',
      status: rangeStatus(fw, preset.faceWidth.minMm, preset.faceWidth.maxMm, 1),
      measured: `${round(fw, 1)} mm`,
      target: `${preset.faceWidth.minMm}–${preset.faceWidth.maxMm} mm`,
      value: fw,
      range: [preset.faceWidth.minMm, preset.faceWidth.maxMm],
    })
  }

  const centerDeviation = metrics.centerXRatio - 0.5
  checks.push({
    id: 'centering',
    category: 'masse',
    labelKey: 'check.centering',
    status: Math.abs(centerDeviation) <= THRESHOLDS.centerXTolerance ? 'pass' : 'warn',
    measured: pct(metrics.centerXRatio),
    target: '50 % (± 3 %)',
    value: metrics.centerXRatio,
  })

  if (preset.eyeLineRangeFromTop) {
    const [min, max] = preset.eyeLineRangeFromTop
    checks.push({
      id: 'eyeLine',
      category: 'masse',
      labelKey: 'check.eyeLine',
      status: rangeStatus(metrics.eyeLineFromTop, min, max, 0.02),
      measured: pct(metrics.eyeLineFromTop),
      target: `${pct(min)}–${pct(max)} von oben`,
      value: metrics.eyeLineFromTop,
      range: [min, max],
    })
  } else {
    checks.push({
      id: 'eyeLine',
      category: 'masse',
      labelKey: 'check.eyeLine',
      status: 'info',
      measured: pct(metrics.eyeLineFromTop),
      target: 'nicht amtlich festgelegt',
      value: metrics.eyeLineFromTop,
    })
  }

  checks.push({
    id: 'roll',
    category: 'haltung',
    labelKey: 'check.roll',
    status: faceDetected ? band(metrics.rollDeg, t.rollDeg.pass, t.rollDeg.warn) : 'info',
    measured: `${round(metrics.rollDeg, 1)}°`,
    target: 'gerade (≤ 3°)',
    value: metrics.rollDeg,
  })

  checks.push({
    id: 'yaw',
    category: 'haltung',
    labelKey: 'check.yaw',
    status: faceDetected ? band(metrics.yawDeg, t.yawDeg.pass, t.yawDeg.warn) : 'info',
    measured: `${round(metrics.yawDeg, 1)}°`,
    target: 'frontal (≤ 4°)',
    value: metrics.yawDeg,
  })

  checks.push({
    id: 'pitch',
    category: 'haltung',
    labelKey: 'check.pitch',
    status: faceDetected ? band(metrics.pitchDeg, t.pitchDeg.pass, t.pitchDeg.warn) : 'info',
    measured: `${round(metrics.pitchDeg, 1)}°`,
    target: 'Blick zur Kamera (≤ 5°)',
    value: metrics.pitchDeg,
  })

  checks.push({
    id: 'eyeOpen',
    category: 'ausdruck',
    labelKey: 'check.eyeOpen',
    status: faceDetected
      ? Math.min(metrics.eyeOpenLeft, metrics.eyeOpenRight) >= t.eyeOpen.pass
        ? 'pass'
        : Math.min(metrics.eyeOpenLeft, metrics.eyeOpenRight) >= t.eyeOpen.warn
          ? 'warn'
          : 'fail'
      : 'info',
    measured: faceDetected
      ? `${pct(1 - metrics.eyeOpenLeft)} / ${pct(1 - metrics.eyeOpenRight)} offen`
      : '–',
    target: 'beide Augen offen',
    value: Math.min(metrics.eyeOpenLeft, metrics.eyeOpenRight),
  })

  checks.push({
    id: 'mouthClosed',
    category: 'ausdruck',
    labelKey: 'check.mouthClosed',
    status: faceDetected ? upperBand(metrics.mouthOpen, t.mouthOpen.pass, t.mouthOpen.warn) : 'info',
    measured: pct(metrics.mouthOpen),
    target: 'Mund geschlossen',
    value: metrics.mouthOpen,
  })

  checks.push({
    id: 'expression',
    category: 'ausdruck',
    labelKey: 'check.expression',
    status: faceDetected ? upperBand(metrics.smile, t.smile.pass, t.smile.warn) : 'info',
    measured: pct(metrics.smile),
    target: 'neutraler Ausdruck',
    value: metrics.smile,
  })

  checks.push({
    id: 'sharpness',
    category: 'qualitaet',
    labelKey: 'check.sharpness',
    status: lowerBand(metrics.sharpness, t.sharpness.pass, t.sharpness.warn),
    measured: pct(metrics.sharpness),
    target: 'scharf, ohne Bewegungsunschärfe',
    value: metrics.sharpness,
    hintKey: 'hint.sharpness',
  })

  const lum = t.faceLuminance
  const lumStatus =
    metrics.faceLuminance >= lum.minPass && metrics.faceLuminance <= lum.maxPass
      ? 'pass'
      : metrics.faceLuminance >= lum.minWarn && metrics.faceLuminance <= lum.maxWarn
        ? 'warn'
        : 'fail'
  checks.push({
    id: 'exposure',
    category: 'licht',
    labelKey: 'check.exposure',
    status: lumStatus,
    measured: pct(metrics.faceLuminance),
    target: `${pct(lum.minPass)}–${pct(lum.maxPass)}`,
    value: metrics.faceLuminance,
  })

  checks.push({
    id: 'highlightClip',
    category: 'licht',
    labelKey: 'check.highlightClip',
    status: upperBand(metrics.faceHighlightClip, t.faceHighlightClip.pass, t.faceHighlightClip.warn),
    measured: pct(metrics.faceHighlightClip),
    target: '< 0,5 % der Fläche',
    value: metrics.faceHighlightClip,
  })

  checks.push({
    id: 'shadowClip',
    category: 'licht',
    labelKey: 'check.shadowClip',
    status: upperBand(metrics.faceShadowClip, t.faceShadowClip.pass, t.faceShadowClip.warn),
    measured: pct(metrics.faceShadowClip),
    target: '< 1 % der Fläche',
    value: metrics.faceShadowClip,
  })

  checks.push({
    id: 'faceShadow',
    category: 'licht',
    labelKey: 'check.faceShadow',
    status: upperBand(metrics.faceShadowAsymmetry, t.faceShadowAsymmetry.pass, t.faceShadowAsymmetry.warn),
    measured: pct(metrics.faceShadowAsymmetry),
    target: 'gleichmäßige Ausleuchtung',
    value: metrics.faceShadowAsymmetry,
    hintKey: 'hint.faceShadow',
  })

  const bg = preset.background
  let backgroundStatus = lowerBand(metrics.backgroundLuminance, bg.minLuminance, bg.minLuminance - 0.12)
  if (!bg.allowPureWhite && metrics.backgroundLuminance > THRESHOLDS.pureWhiteLuminance) {
    backgroundStatus = 'fail'
  }
  checks.push({
    id: 'backgroundTone',
    category: 'hintergrund',
    labelKey: 'check.backgroundTone',
    status: backgroundStatus,
    measured: `${pct(metrics.backgroundLuminance)}${!bg.allowPureWhite && metrics.backgroundLuminance > THRESHOLDS.pureWhiteLuminance ? ' (zu hell)' : ''}`,
    target: bg.allowPureWhite ? 'hell, einfarbig' : `hell, aber nicht reinweiß (${bg.tones.join('/')})`,
    value: metrics.backgroundLuminance,
    hintKey: !bg.allowPureWhite && metrics.backgroundLuminance > THRESHOLDS.pureWhiteLuminance ? 'hint.pureWhite' : undefined,
  })

  checks.push({
    id: 'backgroundUniform',
    category: 'hintergrund',
    labelKey: 'check.backgroundUniform',
    status: upperBand(metrics.backgroundVariance, t.backgroundVariance.pass, t.backgroundVariance.warn),
    measured: pct(metrics.backgroundVariance),
    target: 'einfarbig ohne Muster',
    value: metrics.backgroundVariance,
    hintKey: 'hint.backgroundPattern',
  })

  checks.push({
    id: 'backgroundTexture',
    category: 'hintergrund',
    labelKey: 'check.backgroundTexture',
    status: upperBand(metrics.backgroundTexture, t.backgroundTexture.pass, t.backgroundTexture.warn),
    measured: pct(metrics.backgroundTexture),
    target: 'glatte Fläche',
    value: metrics.backgroundTexture,
  })

  checks.push({
    id: 'backgroundColor',
    category: 'hintergrund',
    labelKey: 'check.backgroundColor',
    status: upperBand(metrics.backgroundSaturation, t.backgroundSaturation.pass, t.backgroundSaturation.warn),
    measured: pct(metrics.backgroundSaturation),
    target: 'neutral, ohne Farbe',
    value: metrics.backgroundSaturation,
    hintKey: 'hint.backgroundColor',
  })

  checks.push({
    id: 'backgroundContrast',
    category: 'hintergrund',
    labelKey: 'check.backgroundContrast',
    status: lowerBand(metrics.backgroundContrast, bg.minContrast, bg.minContrast * 0.6),
    measured: pct(metrics.backgroundContrast),
    target: `mindestens ${pct(bg.minContrast)}`,
    value: metrics.backgroundContrast,
  })

  checks.push({
    id: 'colorCast',
    category: 'licht',
    labelKey: 'check.colorCast',
    status: upperBand(metrics.faceColorCast, t.faceColorCast.pass, t.faceColorCast.warn),
    measured: pct(metrics.faceColorCast),
    target: 'natürliche Hauttöne',
    value: metrics.faceColorCast,
    hintKey: 'hint.colorCast',
  })

  const d = preset.digital
  const pxOk = digitalResolutionOk(preset, metrics.outputWidthPx, metrics.outputHeightPx)
  checks.push({
    id: 'resolution',
    category: 'datei',
    labelKey: 'check.resolution',
    status: pxOk.status,
    measured: `${metrics.outputWidthPx} × ${metrics.outputHeightPx} px`,
    target: digitalTargetText(preset),
    value: metrics.outputWidthPx,
    range: pxOk.range,
  })

  const bytesOk = byteSizeStatus(metrics.outputBytes, d)
  checks.push({
    id: 'fileSize',
    category: 'datei',
    labelKey: 'check.fileSize',
    status: bytesOk.status,
    measured: metrics.outputBytes > 0 ? formatBytes(metrics.outputBytes) : '–',
    target: digitalTargetBytes(preset),
    value: metrics.outputBytes,
  })

  checks.push({
    id: 'glasses',
    category: 'ausdruck',
    labelKey: 'check.glasses',
    status: 'info',
    measured: preset.glasses,
    target:
      preset.glasses === 'verboten'
        ? 'keine Brille'
        : preset.glasses === 'ohne-tinte'
          ? 'keine getönte Brille'
          : 'Brille ohne Reflexion',
    value: 0,
    hintKey: preset.glasses === 'verboten' ? 'hint.glassesForbidden' : undefined,
  })

  checks.push({
    id: 'age',
    category: 'datei',
    labelKey: 'check.age',
    status: 'info',
    measured: '–',
    target: `Aufnahme nicht älter als ${preset.maxAgeMonths} Monat${preset.maxAgeMonths === 1 ? '' : 'e'}`,
    value: preset.maxAgeMonths,
  })

  return checks
}

/**
 * Prüft die tatsächliche Ausgabeauflösung gegen die Vorgabe. Viele Portale
 * verlangen eine Mindest- oder exakte Pixelgröße – wird das unterschritten,
 * ist das Foto dort nicht einreichbar.
 */
function digitalResolutionOk(
  preset: Preset,
  outputWidthPx: number,
  outputHeightPx: number,
): { status: CheckStatus; range?: [number, number] } {
  const d = preset.digital

  // Feste Pixelvorgabe: beide Maße müssen passen, Abweichung ist zulässig,
  // solange das Format zum Beispiel hoch- oder querkantig bleibt.
  if (d.widthPx && d.heightPx) {
    const targetRatio = d.widthPx / d.heightPx
    const actualRatio = outputWidthPx / Math.max(1, outputHeightPx)
    if (Math.abs(actualRatio - targetRatio) > 0.02) return { status: 'fail' }
    if (outputWidthPx >= d.widthPx && outputHeightPx >= d.heightPx) {
      return { status: 'pass', range: [d.widthPx, d.heightPx] }
    }
    return { status: 'fail', range: [d.widthPx, d.heightPx] }
  }

  const minW = d.minWidthPx ?? Math.round((preset.widthMm / 25.4) * 300)
  const minH = d.minHeightPx ?? Math.round((preset.heightMm / 25.4) * 300)
  const maxW = d.maxWidthPx ?? Infinity
  const maxH = d.maxHeightPx ?? Infinity

  // Exakt die Vorgabe zu treffen ist bereits erfüllt; nur was darüber liegt
  // wird zur Warnung, damit ein sehr großes Bild nicht als Fehler gewertet wird.
  if (outputWidthPx < minW || outputHeightPx < minH) return { status: 'fail', range: [minW, minH] }
  if (outputWidthPx > maxW || outputHeightPx > maxH) return { status: 'fail', range: [minW, minH] }
  if (outputWidthPx > minW * 1.5 || outputHeightPx > minH * 1.5) return { status: 'warn', range: [minW, minH] }
  return { status: 'pass', range: [minW, minH] }
}

function digitalTargetText(preset: Preset): string {
  const d = preset.digital
  if (d.widthPx && d.heightPx) return `${d.widthPx} × ${d.heightPx} px`
  const minW = d.minWidthPx ?? Math.round((preset.widthMm / 25.4) * 300)
  const minH = d.minHeightPx ?? Math.round((preset.heightMm / 25.4) * 300)
  if (d.maxWidthPx && d.maxHeightPx) {
    return `${minW} × ${minH} bis ${d.maxWidthPx} × ${d.maxHeightPx} px`
  }
  return `ab ${minW} × ${minH} px`
}

function digitalTargetBytes(preset: Preset): string {
  const d = preset.digital
  if (d.minBytes && d.maxBytes) return `${formatBytes(d.minBytes)}–${formatBytes(d.maxBytes)}`
  if (d.maxBytes) return `max. ${formatBytes(d.maxBytes)}`
  return 'ohne Vorgabe'
}

function byteSizeStatus(bytes: number, d: Preset['digital']): { status: CheckStatus } {
  if (bytes <= 0) return { status: 'info' }
  if (d.maxBytes && bytes > d.maxBytes) return { status: 'fail' }
  if (d.minBytes && bytes < d.minBytes) return { status: 'warn' }
  return { status: 'pass' }
}

export interface ComplianceSummary {
  status: CheckStatus
  passed: number
  warnings: number
  failed: number
  /** Zählweise nur der prüfbaren Kriterien ohne `info`. */
  total: number
}

export function summarize(checks: CheckResult[]): ComplianceSummary {
  const relevant = checks.filter((check) => check.status !== 'info')
  const passed = relevant.filter((check) => check.status === 'pass').length
  const warnings = relevant.filter((check) => check.status === 'warn').length
  const failed = relevant.filter((check) => check.status === 'fail').length
  const status: CheckStatus = failed > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass'
  return { status, passed, warnings, failed, total: relevant.length }
}