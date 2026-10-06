import { describe, expect, it } from 'vitest'
import { getPreset, PRESETS, REGISTRY } from '../core/presets'
import { inchToMm, mmToInch, mmToPx, pxToMm, roundToEven } from './units'

describe('Einheiten', () => {
  it('rechnet Millimeter und Pixel bei 300 dpi', () => {
    expect(mmToPx(25.4, 300)).toBeCloseTo(300, 6)
    expect(mmToPx(35, 300)).toBeCloseTo(413.3858, 3)
    expect(mmToPx(35, 600)).toBeCloseTo(826.7717, 3)
  })

  it('ist verlustfrei hin und zurück', () => {
    for (const mm of [25, 33, 35, 45, 50, 50.8, 70]) {
      expect(pxToMm(mmToPx(mm, 600), 600)).toBeCloseTo(mm, 6)
    }
  })

  it('rechnet Zoll in Millimeter', () => {
    expect(inchToMm(2)).toBeCloseTo(50.8, 6)
    expect(mmToInch(25.4)).toBeCloseTo(1, 6)
  })

  it('rundet auf gerade Pixelzahlen', () => {
    expect(roundToEven(413.3858)).toBe(412)
    expect(roundToEven(414)).toBe(414)
    expect(roundToEven(415)).toBe(414)
  })
})

describe('Preset-Registry', () => {
  it('enthält alle erwarteten Dokumente', () => {
    expect(REGISTRY.byId['de-personalausweis']).toBeDefined()
    expect(REGISTRY.byId['us-passport']).toBeDefined()
    expect(REGISTRY.byId['uk-passport']).toBeDefined()
    expect(REGISTRY.byId['eu-schengen-visum']).toBeDefined()
    expect(PRESETS.length).toBeGreaterThanOrEqual(18)
  })

  it('gibt bei unbekannter ID einen Fehler', () => {
    expect(() => getPreset('gibt-es-nicht')).toThrow()
  })

  it('hält die Ziel-Kopfhöhe im zulässigen Bereich', () => {
    for (const preset of PRESETS) {
      expect(preset.head.minMm, preset.id).toBeLessThanOrEqual(preset.head.maxMm)
      expect(preset.head.targetMm, preset.id).toBeGreaterThanOrEqual(preset.head.minMm)
      expect(preset.head.targetMm, preset.id).toBeLessThanOrEqual(preset.head.maxMm)
    }
  })

  it('lässt die Kopfhöhe in das Bild passen', () => {
    for (const preset of PRESETS) {
      expect(preset.head.maxMm, preset.id).toBeLessThan(preset.heightMm)
      expect(preset.widthMm, preset.id).toBeGreaterThan(0)
      expect(preset.heightMm, preset.id).toBeGreaterThan(0)
    }
  })

  it('hält die Prozentangaben konsistent zu den Millimetern', () => {
    for (const preset of PRESETS) {
      if (preset.head.minRatio === undefined || preset.head.maxRatio === undefined) continue
      const minFromRatio = preset.heightMm * preset.head.minRatio
      const maxFromRatio = preset.heightMm * preset.head.maxRatio
      expect(Math.abs(minFromRatio - preset.head.minMm), preset.id).toBeLessThan(1.5)
      expect(Math.abs(maxFromRatio - preset.head.maxMm), preset.id).toBeLessThan(1.5)
    }
  })

  it('gibt für jedes Preset eine amtliche oder gekennzeichnete Quelle an', () => {
    for (const preset of PRESETS) {
      expect(preset.source.url, preset.id).toMatch(/^https:\/\//)
      expect(preset.source.label.length, preset.id).toBeGreaterThan(3)
      expect(preset.verifiedAt, preset.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('fordert für die USA exakt 2 x 2 Zoll und 600 px', () => {
    const us = getPreset('us-passport')
    expect(us.widthMm).toBeCloseTo(50.8, 6)
    expect(us.heightMm).toBeCloseTo(50.8, 6)
    expect(us.digital.widthPx).toBe(600)
    expect(us.digital.heightPx).toBe(600)
    expect(us.glasses).toBe('verboten')
  })

  it('schließt für Frankreich reines Weiß aus', () => {
    const fr = getPreset('fr-france')
    expect(fr.background.allowPureWhite).toBe(false)
  })

  it('nutzt für Finnland 36 x 47 mm mit fester Pixelbreite', () => {
    const fi = getPreset('fi-passi')
    expect(fi.widthMm).toBe(36)
    expect(fi.heightMm).toBe(47)
    expect(fi.digital.widthPx).toBe(500)
    expect(fi.digital.heightPx).toBe(653)
  })

  it('behandelt Niederlande altersabhängig', () => {
    const adult = getPreset('nl-paspoort')
    expect(adult.head.minMm).toBe(26)
    expect(adult.faceWidth?.maxMm).toBe(20)
  })
})