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

  const sourceWidth = sourceSize(source).width
  const downscale = plan.sw / plan.outWidthPx

  if (downscale > 4) {
    const intermediateWidth = Math.max(plan.outWidthPx, Math.round(plan.sw / 2))
    const intermediateHeight = Math.max(plan.outHeightPx, Math.round(plan.sh / 2))
    const intermediate = document.createElement('canvas')
    intermediate.width = intermediateWidth
    intermediate.height = intermediateHeight
    const mid = intermediate.getContext('2d', { alpha: false })
    if (mid) {
      mid.imageSmoothingEnabled = true
      mid.imageSmoothingQuality = 'high'
      mid.drawImage(source, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, intermediateWidth, intermediateHeight)
      context.drawImage(intermediate, 0, 0, intermediateWidth, intermediateHeight, 0, 0, target.width, target.height)
      return target
    }
  }

  const sw = Math.min(plan.sw, Math.max(0, sourceWidth - plan.sx))
  const sh = Math.min(plan.sh, Math.max(0, sourceSize(source).height - plan.sy))
  context.drawImage(source, plan.sx, plan.sy, sw, sh, 0, 0, target.width, target.height)
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