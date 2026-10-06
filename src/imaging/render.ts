import type { CropPlan } from '../core/geometry'
import { roundToEven } from '../core/units'

export type DrawableSource = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement

export function sourceSize(source: DrawableSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight }
  }
  if ('naturalWidth' in source && source.naturalWidth > 0) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  return { width: source.width, height: source.height }
}

/**
 * Zeichnet den geplanten Ausschnitt in ein Canvas mit exakter Zielgröße.
 * Bei starker Verkleinerung wird in zwei Stufen skaliert, um Aliasing zu vermeiden.
 */
export function renderCrop(
  source: DrawableSource,
  plan: CropPlan,
  canvas?: HTMLCanvasElement,
): HTMLCanvasElement {
  const target = canvas ?? document.createElement('canvas')
  target.width = roundToEven(plan.outWidthPx)
  target.height = roundToEven(plan.outHeightPx)
  const context = target.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas-2D-Kontext nicht verfügbar')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  // Nur der Teil des Ausschnitts, der wirklich im Quellbild liegt, wird gezeichnet –
  // an seiner maßstabsgetreuen Stelle. Fehlende Bereiche bleiben weiß statt das
  // Bild zu stauchen oder zu strecken.
  const { width: srcW, height: srcH } = sourceSize(source)
  const kx = target.width / plan.sw
  const ky = target.height / plan.sh
  const x0 = Math.max(0, plan.sx)
  const y0 = Math.max(0, plan.sy)
  const x1 = Math.min(srcW, plan.sx + plan.sw)
  const y1 = Math.min(srcH, plan.sy + plan.sh)
  if (x0 > plan.sx + 0.5 || y0 > plan.sy + 0.5 || x1 < plan.sx + plan.sw - 0.5 || y1 < plan.sy + plan.sh - 0.5) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, target.width, target.height)
  }
  if (x1 <= x0 || y1 <= y0) return target
  const dx = (x0 - plan.sx) * kx
  const dy = (y0 - plan.sy) * ky
  const dw = (x1 - x0) * kx
  const dh = (y1 - y0) * ky

  const downscale = plan.sw / plan.outWidthPx
  if (downscale > 4) {
    const intermediateWidth = Math.max(1, Math.round(Math.max(dw, (x1 - x0) / 2)))
    const intermediateHeight = Math.max(1, Math.round(Math.max(dh, (y1 - y0) / 2)))
    const intermediate = document.createElement('canvas')
    intermediate.width = intermediateWidth
    intermediate.height = intermediateHeight
    const mid = intermediate.getContext('2d', { alpha: false })
    if (mid) {
      mid.imageSmoothingEnabled = true
      mid.imageSmoothingQuality = 'high'
      mid.drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, intermediateWidth, intermediateHeight)
      context.drawImage(intermediate, 0, 0, intermediateWidth, intermediateHeight, dx, dy, dw, dh)
      return target
    }
  }

  context.drawImage(source, x0, y0, x1 - x0, y1 - y0, dx, dy, dw, dh)
  return target
}

export function getImageData(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas-2D-Kontext nicht verfügbar')
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

/** Kleine Vorschau in natürlicher Kantenlänge – für die Oberfläche. */
export function renderPreview(source: DrawableSource, plan: CropPlan, maxEdge = 720): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(plan.outWidthPx, plan.outHeightPx))
  const previewPlan: CropPlan = {
    ...plan,
    outWidthPx: Math.round(plan.outWidthPx * scale),
    outHeightPx: Math.round(plan.outHeightPx * scale),
  }
  return renderCrop(source, previewPlan)
}