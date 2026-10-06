import { describe, expect, it } from 'vitest'
import { getPreset } from '../core/presets'
import {
  clippingFractions,
  cropImageData,
  faceShadowAsymmetry,
  meanRedGreenDelta,
  meanSaturation,
  relativeLuminance,
  sharpnessScore,
  stdDevLuminance,
  textureScore,
  toGray,
  type Rect,
} from './pixels'
import { PAPERS, planLayout, planPrintLayout } from './printSheet'

function makeImage(width: number, height: number, fill: (x: number, y: number) => [number, number, number]) {
  const image = new ImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4
      const [r, g, b] = fill(x, y)
      image.data[p] = r
      image.data[p + 1] = g
      image.data[p + 2] = b
      image.data[p + 3] = 255
    }
  }
  return image
}

const FULL: Rect = { x: 0, y: 0, width: 0, height: 0 }

describe('Pixelanalyse', () => {
  it('berechnet die Relativluminanz nach BT.709', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 6)
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 6)
    expect(relativeLuminance(0, 255, 0)).toBeCloseTo(0.7152, 6)
  })

  it('gibt für eine konstante Fläche keine Varianz und keine Struktur', () => {
    const image = makeImage(40, 40, () => [200, 200, 200])
    const gray = toGray(image)
    const rect = { ...FULL, width: 40, height: 40 }
    expect(stdDevLuminance(gray, 40, rect)).toBeCloseTo(0, 9)
    expect(textureScore(gray, 40, 40, rect)).toBe(0)
    expect(meanSaturation(image, rect)).toBe(0)
  })

  it('bewertet eine gleichmäßige Fläche als scharf', () => {
    const flat = makeImage(60, 60, (x) => (x % 6 < 3 ? [40, 40, 40] : [220, 220, 220]))
    const rect = { ...FULL, width: 60, height: 60 }
    expect(sharpnessScore(toGray(flat), 60, 60, rect)).toBeGreaterThan(0.3)
  })

  it('bewertet eine glatte Fläche als unscharf', () => {
    const smooth = makeImage(60, 60, (x) => {
      const value = Math.round(120 + 40 * Math.sin((x / 60) * Math.PI))
      return [value, value, value]
    })
    const rect = { ...FULL, width: 60, height: 60 }
    expect(sharpnessScore(toGray(smooth), 60, 60, rect)).toBeLessThan(0.05)
  })

  it('erkennt gesättigte Flächen', () => {
    const image = makeImage(20, 20, () => [255, 0, 0])
    expect(meanSaturation(image, { ...FULL, width: 20, height: 20 })).toBeCloseTo(1, 6)
  })

  it('misst Über- und Unterbelichtung getrennt', () => {
    const image = makeImage(10, 10, (x) => (x < 5 ? [255, 255, 255] : [0, 0, 0]))
    const rect = { ...FULL, width: 10, height: 10 }
    const fractions = clippingFractions(image, rect)
    expect(fractions.highlight).toBeCloseTo(0.5, 6)
    expect(fractions.shadow).toBeCloseTo(0.5, 6)
  })

  it('ignoriert mittlere Helligkeit beim Clipping', () => {
    const image = makeImage(10, 10, () => [130, 130, 130])
    const fractions = clippingFractions(image, { ...FULL, width: 10, height: 10 })
    expect(fractions.highlight).toBe(0)
    expect(fractions.shadow).toBe(0)
  })

  it('erkennt einen Rotstich über die Differenz von Rot- und Grünkanal', () => {
    const red = makeImage(10, 10, () => [200, 100, 100])
    const neutral = makeImage(10, 10, () => [140, 140, 140])
    const rect = { ...FULL, width: 10, height: 10 }
    expect(meanRedGreenDelta(red, rect)).toBeGreaterThan(0.3)
    expect(meanRedGreenDelta(neutral, rect)).toBe(0)
  })

  it('misst die Asymmetrie der Ausleuchtung im Gesicht', () => {
    const rect = { x: 0, y: 0, width: 40, height: 40 }
    // Gleichmäßig beleuchtet: beide Hälften gleich hell.
    const even = makeImage(40, 40, () => [180, 180, 180])
    expect(faceShadowAsymmetry(toGray(even), 40, rect, 20)).toBeLessThan(0.01)

    // Linke Gesichtshälfte deutlich dunkler als die rechte.
    const skewed = makeImage(40, 40, (x) => (x < 20 ? [40, 40, 40] : [220, 220, 220]))
    expect(faceShadowAsymmetry(toGray(skewed), 40, rect, 20)).toBeGreaterThan(0.5)
  })

  it('schneidet Bilddaten exakt zu', () => {
    const image = makeImage(10, 10, (x, y) => [x * 10, y * 10, 0])
    const cropped = cropImageData(image, { x: 2, y: 3, width: 4, height: 5 })
    expect(cropped.width).toBe(4)
    expect(cropped.height).toBe(5)
    expect(cropped.data[0]).toBe(20)
    expect(cropped.data[1]).toBe(30)
  })

  it('begrenzt das Zuschnittfenster auf das Bild', () => {
    const image = makeImage(10, 10, () => [1, 2, 3])
    expect(cropImageData(image, { x: 8, y: 8, width: 50, height: 50 }).width).toBe(2)
  })
})

describe('Druckbogen-Raster', () => {
  const de = getPreset('de-personalausweis')

  it('berechnet 35 x 45 mm auf A4 ein 5 x 5 Raster', () => {
    const layout = planLayout(de, PAPERS.a4)
    expect(layout.columns).toBe(5)
    expect(layout.rows).toBe(5)
    expect(layout.perPage).toBe(25)
  })

  it('passt das Raster vollständig auf das Blatt', () => {
    for (const paper of Object.values(PAPERS)) {
      const layout = planLayout(de, paper)
      const gridWidth = layout.columns * de.widthMm + (layout.columns - 1) * paper.gapMm
      const gridHeight = layout.rows * de.heightMm + (layout.rows - 1) * paper.gapMm
      expect(layout.originXMm + gridWidth, paper.id).toBeLessThanOrEqual(paper.widthMm - paper.marginMm + 0.001)
      expect(layout.originYMm + gridHeight, paper.id).toBeLessThanOrEqual(paper.heightMm - paper.marginMm + 0.001)
    }
  })

  it('zentriert das Raster auf dem Blatt', () => {
    const layout = planLayout(de, PAPERS.a4)
    const gridWidth = layout.columns * de.widthMm + (layout.columns - 1) * PAPERS.a4.gapMm
    const left = layout.originXMm
    const right = PAPERS.a4.widthMm - (left + gridWidth)
    expect(Math.abs(left - right)).toBeLessThan(0.001)
  })

  it('berechnet die Seitenzahl aus der Kopienzahl', () => {
    expect(planPrintLayout(de, PAPERS.a4, 1).pages).toBe(1)
    expect(planPrintLayout(de, PAPERS.a4, 25).pages).toBe(1)
    expect(planPrintLayout(de, PAPERS.a4, 26).pages).toBe(2)
    expect(planPrintLayout(de, PAPERS.a4, 75).pages).toBe(3)
  })

  it('rechnet bei US-Fotos mit 2 x 2 Zoll weniger Fotos pro Blatt', () => {
    const us = getPreset('us-passport')
    expect(planLayout(us, PAPERS.a4).perPage).toBe(15)
    expect(planLayout(us, PAPERS.a4).perPage).toBeLessThan(planLayout(de, PAPERS.a4).perPage)
  })

  it('kommt auf kleinen Formaten mit mindestens einem Foto zurecht', () => {
    for (const preset of ['de-personalausweis', 'us-passport', 'cn-passport', 'in-passport', 'jp-visa']) {
      expect(planLayout(getPreset(preset), PAPERS['4x6']).perPage, preset).toBeGreaterThanOrEqual(1)
    }
  })
})