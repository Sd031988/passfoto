import type { PhotoMetrics } from '../core/types'
import {
  clampRect,
  clippingFractions,
  faceShadowAsymmetry,
  meanLuminance,
  meanRedGreenDelta,
  meanSaturation,
  sharpnessScore,
  stdDevLuminance,
  textureScore,
  toGray,
  type Rect,
} from './pixels'

/** Gesichtspunkte im Koordinatensystem des Ausgabebildes. */
export interface OutputGeometry {
  crownY: number
  hairlineY: number
  chinY: number
  eyeLineY: number
  faceCenterX: number
  /** Rechteck der Gesichtskontur, im Ausgabebild. */
  faceRect: Rect
}

export interface PixelMetrics {
  sharpness: number
  faceLuminance: number
  faceHighlightClip: number
  faceShadowClip: number
  faceShadowAsymmetry: number
  backgroundLuminance: number
  backgroundVariance: number
  backgroundTexture: number
  backgroundSaturation: number
  faceColorCast: number
  backgroundContrast: number
}

function isUsable(rect: Rect): boolean {
  return rect.width >= 8 && rect.height >= 8
}

/**
 * Hintergrundflächen: Streifen oberhalb des Scheitels sowie links und rechts
 * des Gesichts. Flächen, die das Gesicht berühren oder zu klein sind, fallen weg.
 */
export function backgroundRects(image: ImageData, geometry: OutputGeometry): Rect[] {
  const { faceRect, crownY, chinY } = geometry
  const margin = Math.max(2, Math.round(faceRect.width * 0.06))
  const topHeight = Math.max(0, Math.round(crownY - margin))
  const rects: Rect[] = []

  if (topHeight >= 8) {
    rects.push(clampRect({ x: 0, y: 0, width: image.width, height: topHeight }, image.width, image.height))
  }

  const stripHeight = Math.max(0, Math.round(chinY - crownY))
  if (stripHeight >= 8) {
    const left = clampRect(
      { x: 0, y: Math.max(0, Math.round(crownY)), width: faceRect.x - margin, height: stripHeight },
      image.width,
      image.height,
    )
    const rightX = Math.min(image.width, faceRect.x + faceRect.width + margin)
    const right = clampRect(
      { x: rightX, y: Math.max(0, Math.round(crownY)), width: image.width - rightX, height: stripHeight },
      image.width,
      image.height,
    )
  if (isUsable(left)) rects.push(left)
  if (isUsable(right)) rects.push(right)
  }

  return rects.filter((rect) => isUsable(rect))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Bildbasierte Messwerte des fertig zugeschnittenen Passbilds. */
export function analyzePixels(image: ImageData, geometry: OutputGeometry): PixelMetrics {
  const gray = toGray(image)
  const faceRect = clampRect(geometry.faceRect, image.width, image.height)
  const rects = backgroundRects(image, geometry)

  const faceLuminance = meanLuminance(gray, image.width, faceRect)
  const clip = clippingFractions(image, faceRect)

  const bgLuminances = rects.map((rect) => meanLuminance(gray, image.width, rect))
  const bgVariances = rects.map((rect) => stdDevLuminance(gray, image.width, rect))
  const bgTextures = rects.map((rect) => textureScore(gray, image.width, image.height, rect))
  const bgSaturations = rects.map((rect) => meanSaturation(image, rect))

  const backgroundLuminance = average(bgLuminances)

  return {
    sharpness: sharpnessScore(gray, image.width, image.height, faceRect),
    faceLuminance,
    faceHighlightClip: clip.highlight,
    faceShadowClip: clip.shadow,
    faceShadowAsymmetry: faceShadowAsymmetry(gray, image.width, faceRect, geometry.faceCenterX),
    backgroundLuminance,
    backgroundVariance: Math.max(...bgVariances, 0),
    backgroundTexture: Math.max(...bgTextures, 0),
    backgroundSaturation: average(bgSaturations),
    faceColorCast: meanRedGreenDelta(image, faceRect),
    backgroundContrast: Math.abs(backgroundLuminance - faceLuminance),
  }
}

export function emptyPixelMetrics(): PixelMetrics {
  return {
    sharpness: 0,
    faceLuminance: 0,
    faceHighlightClip: 0,
    faceShadowClip: 0,
    faceShadowAsymmetry: 0,
    backgroundLuminance: 0,
    backgroundVariance: 0,
    backgroundTexture: 0,
    backgroundSaturation: 0,
    faceColorCast: 0,
    backgroundContrast: 0,
  }
}

/** Skaliert eine Ausgabegeometrie auf eine kleinere Darstellung. */
export function scaleOutputGeometry(geometry: OutputGeometry, ratio: number): OutputGeometry {
  return {
    crownY: geometry.crownY * ratio,
    hairlineY: geometry.hairlineY * ratio,
    chinY: geometry.chinY * ratio,
    eyeLineY: geometry.eyeLineY * ratio,
    faceCenterX: geometry.faceCenterX * ratio,
    faceRect: {
      x: geometry.faceRect.x * ratio,
      y: geometry.faceRect.y * ratio,
      width: geometry.faceRect.width * ratio,
      height: geometry.faceRect.height * ratio,
    },
  }
}

export function mergeMetrics(
  base: Omit<PhotoMetrics, keyof PixelMetrics>,
  pixels: PixelMetrics,
): PhotoMetrics {
  return { ...base, ...pixels }
}