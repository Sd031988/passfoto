import { describe, expect, it } from 'vitest'
import { getPreset } from '../core/presets'
import { planCrop, resolveTopMarginMm, targetHeadHeightMm, type FaceGeometry, type SourceSize } from './geometry'
import { mapPoint } from './geometry'

const SOURCE: SourceSize = { width: 3000, height: 4000 }

function face(overrides: Partial<FaceGeometry> = {}): FaceGeometry {
  return {
    crownY: 900,
    chinY: 1500,
    faceCenterX: 1500,
    faceWidthPx: 520,
    eyeLineY: 1290,
    ...overrides,
  }
}

describe('Kopfhöhe', () => {
  it('begrenzt den Wunschwert auf den zulässigen Bereich', () => {
    const de = getPreset('de-personalausweis')
    expect(targetHeadHeightMm(de, { headHeightMm: 10 })).toBe(de.head.minMm)
    expect(targetHeadHeightMm(de, { headHeightMm: 99 })).toBe(de.head.maxMm)
    expect(targetHeadHeightMm(de, { headHeightMm: 34 })).toBe(34)
  })

  it('verteilt die freie Fläche bei 35 x 45 mm mit 3 mm Oberrand', () => {
    const de = getPreset('de-personalausweis')
    expect(resolveTopMarginMm(de, 34)).toBe(3)
    expect(de.heightMm - 34 - 3).toBe(8)
  })
})

describe('planCrop', () => {
  it('hält die Kopfhöhe im Ausgabeformat exakt ein', () => {
    const de = getPreset('de-personalausweis')
    const plan = planCrop(de, SOURCE, face())
    // cropTop + topMargin = Scheitel, cropTop + topMargin + Kopfhöhe = Kinn
    const topMarginPx = 3 * (plan.dpi / 25.4) * plan.zoom
    const crown = plan.sy + topMarginPx
    const chin = crown + plan.headHeightMm * (plan.dpi / 25.4) * plan.zoom
    expect(chin - crown).toBeCloseTo(plan.headHeightMm * (plan.dpi / 25.4) * plan.zoom, 6)
    expect(plan.headHeightMm).toBe(34)
  })

  it('liefert geradzahlige Pixelmaße', () => {
    for (const preset of [getPreset('de-personalausweis'), getPreset('us-passport'), getPreset('ca-passport')]) {
      const plan = planCrop(preset, SOURCE, face())
      expect(plan.outWidthPx % 2).toBe(0)
      expect(plan.outHeightPx % 2).toBe(0)
    }
  })

  it('hält das Seitenverhältnis des Presets ein', () => {
    const preset = getPreset('de-personalausweis')
    const plan = planCrop(preset, SOURCE, face())
    expect(plan.outWidthPx / plan.outHeightPx).toBeCloseTo(35 / 45, 3)
  })

  it('zentriert das Gesicht horizontal', () => {
    const preset = getPreset('de-personalausweis')
    const plan = planCrop(preset, SOURCE, face({ faceCenterX: 1200 }))
    const mapped = mapPoint(plan, 1200, 900)
    expect(mapped.x / plan.outWidthPx).toBeCloseTo(0.5, 6)
  })

  it('verschiebt das Gesicht seitlich mit sideOffsetMm', () => {
    const preset = getPreset('de-personalausweis')
    const plan = planCrop(preset, SOURCE, face(), { sideOffsetMm: 4 })
    const mapped = mapPoint(plan, 1500, 900)
    const ratio = mapped.x / plan.outWidthPx
    expect(ratio).toBeGreaterThan(0.5)
    expect((ratio - 0.5) * preset.widthMm).toBeCloseTo(4, 2)
  })

  it('verschiebt das Gesicht mit topOffsetMm nach oben', () => {
    const preset = getPreset('de-personalausweis')
    const auto = planCrop(preset, SOURCE, face())
    // topOffsetMm 3 verringert den Oberrand um 3 mm: der Scheitel rückt nach oben.
    const shifted = planCrop(preset, SOURCE, face(), { topOffsetMm: 3 })
    expect(shifted.topMarginMm).toBeCloseTo(auto.topMarginMm - 3, 6)
    expect(shifted.sy).toBeGreaterThan(auto.sy)
    // Der Kinnrand wird entsprechend größer.
    expect(shifted.chinMarginMm).toBeCloseTo(auto.chinMarginMm + 3, 6)
  })

  it('hält die Crop-Höhe unabhängig vom Versatz konstant', () => {
    const preset = getPreset('de-personalausweis')
    const auto = planCrop(preset, SOURCE, face())
    const shifted = planCrop(preset, SOURCE, face(), { topOffsetMm: 2, sideOffsetMm: -1 })
    expect(shifted.sh).toBeCloseTo(auto.sh, 6)
    expect(shifted.sw).toBeCloseTo(auto.sw, 6)
    expect(shifted.headHeightMm).toBe(auto.headHeightMm)
  })

  it('meldet und begrenzt Ausschnitte außerhalb des Bildes', () => {
    const de = getPreset('de-personalausweis')
    const tiny = planCrop(de, { width: 600, height: 800 }, face())
    expect(tiny.cropOutOfFrame).toBe(true)
    expect(tiny.qualityLimited).toBe(true)
    expect(tiny.sx).toBeGreaterThanOrEqual(0)
    expect(tiny.sy).toBeGreaterThanOrEqual(0)
  })

  it('vergrößert das Bild, wenn die Kopfhöhe manuell reduziert wird', () => {
    const preset = getPreset('de-personalausweis')
    const auto = planCrop(preset, SOURCE, face())
    const manual = planCrop(preset, SOURCE, face(), { headHeightMm: preset.head.minMm })
    expect(manual.zoom).toBeGreaterThan(auto.zoom)
  })

  it('nutzt für die USA ein quadratisches Format mit Augenband', () => {
    const us = getPreset('us-passport')
    const plan = planCrop(us, SOURCE, face())
    expect(plan.outWidthPx).toBe(plan.outHeightPx)
    expect(us.eyeLineRangeFromTop).toBeDefined()
  })
})