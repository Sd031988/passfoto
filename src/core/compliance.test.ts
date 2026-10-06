import { describe, expect, it } from 'vitest'
import { getPreset } from './presets'
import { evaluateCompliance, summarize } from './compliance'
import type { PhotoMetrics } from './types'

function metrics(overrides: Partial<PhotoMetrics> = {}): PhotoMetrics {
  return {
    crownSource: 'segmentation',
    headHeightMm: 34,
    faceHeightMm: 30,
    centerXRatio: 0.5,
    eyeLineFromTop: 0.38,
    topMarginMm: 3,
    faceWidthMm: 18,
    rollDeg: 1,
    yawDeg: 1,
    pitchDeg: 1,
    eyeOpenLeft: 0.92,
    eyeOpenRight: 0.91,
    mouthOpen: 0.02,
    smile: 0.01,
    facesDetected: 1,
    crownInsideFrame: true,
    cropOutOfFrame: false,
    sharpness: 0.62,
    faceLuminance: 0.55,
    faceHighlightClip: 0.001,
    faceShadowClip: 0.002,
    faceShadowAsymmetry: 0.01,
    backgroundLuminance: 0.85,
    backgroundVariance: 0.012,
    backgroundTexture: 0.004,
    backgroundSaturation: 0.02,
    faceColorCast: 0.01,
    backgroundContrast: 0.3,
    outputWidthPx: 826,
    outputHeightPx: 1062,
    outputBytes: 120_000,
    ...overrides,
  }
}

function check(checks: ReturnType<typeof evaluateCompliance>, id: string) {
  const found = checks.find((item) => item.id === id)
  if (!found) throw new Error(`Prüfung ${id} fehlt`)
  return found
}

describe('Compliance für das deutsche Passbild', () => {
  const preset = getPreset('de-personalausweis')

  it('bewertet ein gutes Foto als erfüllt', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics() })
    const summary = summarize(checks)
    expect(summary.failed).toBe(0)
    expect(summary.status).not.toBe('fail')
  })

  it('erkennt mehr als eine Person', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ facesDetected: 2 }) })
    expect(check(checks, 'faces').status).toBe('fail')
  })

  it('meldet eine zu große Kopfhöhe', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ headHeightMm: 40 }) })
    expect(check(checks, 'headHeight').status).toBe('fail')
  })

  it('meldet einen abgeschnittenen Scheitel', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ topMarginMm: -1, crownInsideFrame: false }) })
    expect(check(checks, 'topMargin').status).toBe('fail')
  })

  it('meldet Gesichtsbreite nur bei Presets mit Vorgabe', () => {
    const nl = getPreset('nl-paspoort')
    const wide = evaluateCompliance({ preset: nl, metrics: metrics({ faceWidthMm: 24 }) })
    expect(check(wide, 'faceWidth').status).toBe('fail')
    const de = evaluateCompliance({ preset, metrics: metrics({ faceWidthMm: 24 }) })
    expect(de.some((item) => item.id === 'faceWidth')).toBe(false)
  })

  it('bewertet die Augenlinie nur bei amtlicher Vorgabe', () => {
    const de = evaluateCompliance({ preset, metrics: metrics() })
    expect(check(de, 'eyeLine').status).toBe('info')
    const us = evaluateCompliance({ preset: getPreset('us-passport'), metrics: metrics({ eyeLineFromTop: 0.2 }) })
    expect(check(us, 'eyeLine').status).toBe('fail')
  })

  it('erkennt zu starkes Neigen und Drehen', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ rollDeg: 9, yawDeg: 12, pitchDeg: 14 }) })
    expect(check(checks, 'roll').status).toBe('fail')
    expect(check(checks, 'yaw').status).toBe('fail')
    expect(check(checks, 'pitch').status).toBe('fail')
  })

  it('erkennt geschlossene Augen, offenen Mund und Lächeln', () => {
    const checks = evaluateCompliance({
      preset,
      metrics: metrics({ eyeOpenLeft: 0.1, eyeOpenRight: 0.9, mouthOpen: 0.7, smile: 0.6 }),
    })
    expect(check(checks, 'eyeOpen').status).toBe('fail')
    expect(check(checks, 'mouthClosed').status).toBe('fail')
    expect(check(checks, 'expression').status).toBe('fail')
  })

  it('erkennt Unschärfe', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ sharpness: 0.08 }) })
    expect(check(checks, 'sharpness').status).toBe('fail')
  })

  it('erkennt Unter- und Überbelichtung', () => {
    expect(check(evaluateCompliance({ preset, metrics: metrics({ faceLuminance: 0.1 }) }), 'exposure').status).toBe(
      'fail',
    )
    expect(check(evaluateCompliance({ preset, metrics: metrics({ faceLuminance: 0.97 }) }), 'exposure').status).toBe(
      'fail',
    )
  })

  it('bewertet überstrahlte und abgeschnittene Stellen', () => {
    const checks = evaluateCompliance({
      preset,
      metrics: metrics({ faceHighlightClip: 0.08, faceShadowClip: 0.09 }),
    })
    expect(check(checks, 'highlightClip').status).toBe('fail')
    expect(check(checks, 'shadowClip').status).toBe('fail')
  })

  it('erkennt asymmetrische Schatten', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ faceShadowAsymmetry: 0.3 }) })
    expect(check(checks, 'faceShadow').status).toBe('fail')
  })

  it('beanstandet reinweißen bei Dokumenten ohne Weißerlaubnis', () => {
    const fr = getPreset('fr-france')
    const checks = evaluateCompliance({ preset: fr, metrics: metrics({ backgroundLuminance: 0.98 }) })
    const tone = check(checks, 'backgroundTone')
    expect(tone.status).toBe('fail')
    expect(tone.hintKey).toBe('hint.pureWhite')
  })

  it('erlaubt Weiß, wo es vorgeschrieben ist', () => {
    const us = getPreset('us-passport')
    const checks = evaluateCompliance({ preset: us, metrics: metrics({ backgroundLuminance: 0.98 }) })
    expect(check(checks, 'backgroundTone').status).toBe('pass')
  })

  it('erkennt Muster und Farbe im Hintergrund', () => {
    const checks = evaluateCompliance({
      preset,
      metrics: metrics({ backgroundVariance: 0.2, backgroundTexture: 0.2, backgroundSaturation: 0.5 }),
    })
    expect(check(checks, 'backgroundUniform').status).toBe('fail')
    expect(check(checks, 'backgroundTexture').status).toBe('fail')
    expect(check(checks, 'backgroundColor').status).toBe('fail')
  })

  it('erkennt zu geringen Kontrast zum Hintergrund', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ backgroundContrast: 0.02 }) })
    expect(check(checks, 'backgroundContrast').status).toBe('fail')
  })

  it('erkennt einen Farbstich', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ faceColorCast: 0.25 }) })
    expect(check(checks, 'colorCast').status).toBe('fail')
  })

  it('prüft die Dateigröße gegen die Portalvorgabe', () => {
    const visa = getPreset('us-visa')
    expect(check(evaluateCompliance({ preset: visa, metrics: metrics({ outputBytes: 500_000 }) }), 'fileSize').status).toBe(
      'fail',
    )
    expect(check(evaluateCompliance({ preset: visa, metrics: metrics({ outputBytes: 120_000 }) }), 'fileSize').status).toBe(
      'pass',
    )
  })

  it('prüft die Mindestauflösung', () => {
    const ca = getPreset('ca-passport')
    const tooSmall = evaluateCompliance({
      preset: ca,
      metrics: metrics({ outputWidthPx: 600, outputHeightPx: 840 }),
    })
    expect(check(tooSmall, 'resolution').status).toBe('fail')

    const exact = evaluateCompliance({
      preset: ca,
      metrics: metrics({ outputWidthPx: 1200, outputHeightPx: 1800 }),
    })
    expect(check(exact, 'resolution').status).toBe('pass')
  })

  it('beanstandet eine zu große Ausgabe, wenn das Portal eine Obergrenze setzt', () => {
    const ca = getPreset('ca-passport')
    const tooBig = evaluateCompliance({
      preset: ca,
      metrics: metrics({ outputWidthPx: 3600, outputHeightPx: 5400 }),
    })
    expect(check(tooBig, 'resolution').status).toBe('fail')
  })

  it('prüft feste Pixelvorgaben mit Toleranz', () => {
    const us = getPreset('us-passport')
    const square = evaluateCompliance({ preset: us, metrics: metrics({ outputWidthPx: 600, outputHeightPx: 600 }) })
    expect(check(square, 'resolution').status).toBe('pass')

    const landscape = evaluateCompliance({
      preset: us,
      metrics: metrics({ outputWidthPx: 600, outputHeightPx: 400 }),
    })
    expect(check(landscape, 'resolution').status).toBe('fail')

    const tooSmall = evaluateCompliance({ preset: us, metrics: metrics({ outputWidthPx: 400, outputHeightPx: 400 }) })
    expect(check(tooSmall, 'resolution').status).toBe('fail')
  })

  it('weist auf eine geschätzte Scheitelposition hin', () => {
    const checks = evaluateCompliance({ preset, metrics: metrics({ crownSource: 'schaetzung' }) })
    expect(check(checks, 'headHeight').hintKey).toBe('hint.crownEstimated')
  })

  it('liefert bei jedem Preset prüfbare Kriterien', () => {
    for (const id of ['de-personalausweis', 'us-passport', 'uk-passport', 'ca-passport', 'cn-passport']) {
      const checks = evaluateCompliance({ preset: getPreset(id), metrics: metrics() })
      expect(summarize(checks).total, id).toBeGreaterThan(10)
    }
  })
})