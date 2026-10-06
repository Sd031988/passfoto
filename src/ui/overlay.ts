import type { CropAdjustment } from '../core/geometry'
import { mmToPx } from '../core/units'
import type { Preset } from '../core/types'
import { buildFaceGeometry, buildPlan, type MeasurementBasis } from '../core/pipeline'
import type { FaceObservation } from '../vision/faceEngine'

export interface OverlayOptions {
  observation: FaceObservation
  preset: Preset
  basis: MeasurementBasis
  adjustment: CropAdjustment
  /** Spiegeln wie ein Spiegelbild (Frontkamera). */
  mirrored: boolean
}

interface Rgba {
  color: string
  fill?: string
  lineWidth: number
}

function drawRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: Rgba,
): void {
  context.save()
  context.strokeStyle = style.color
  context.lineWidth = style.lineWidth
  if (style.fill) {
    context.fillStyle = style.fill
    context.fillRect(x, y, width, height)
  }
  context.strokeRect(x, y, width, height)
  context.restore()
}

/** Zeichnet Rahmen, Ziel-Kopfhöhe und Augenlinie über das Kamerabild. */
export function drawOverlay(context: CanvasRenderingContext2D, options: OverlayOptions): void {
  const { observation, preset, basis, adjustment, mirrored } = options
  const canvas = context.canvas
  const scale = canvas.width / observation.width
  const toX = (sourceX: number): number => (mirrored ? canvas.width - sourceX * scale : sourceX * scale)
  const toY = (sourceY: number): number => sourceY * scale

  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!observation.detected) return

  const plan = buildPlan(preset, observation, adjustment, basis)
  const pxPerMm = plan.dpi / 25.4
  const crownY = buildFaceGeometry(observation, basis).crownY
  const sourceTopY = crownY - plan.topMarginMm * pxPerMm * plan.zoom
  const sourceHeadEndY = sourceTopY + plan.headHeightMm * pxPerMm * plan.zoom

  // Linke Kante des Ausschnitts auf dem Bildschirm: gespiegelt (Frontkamera) ist das
  // die rechte Kante im Quellbild, ungespiegelt (Rückkamera) die linke.
  const cropX = mirrored ? toX(plan.sx + plan.sw) : toX(plan.sx)
  const cropY = toY(plan.sy)
  const cropW = plan.sw * scale
  const cropH = plan.sh * scale

  context.save()
  context.fillStyle = 'rgba(2, 6, 23, 0.55)'
  context.beginPath()
  context.rect(0, 0, canvas.width, canvas.height)
  context.rect(cropX, cropY, cropW, cropH)
  context.fill('evenodd')
  context.restore()

  // Bereich der zulässigen Kopfhöhe
  const minHeadEndY = sourceTopY + preset.head.minMm * pxPerMm * plan.zoom
  const maxHeadEndY = sourceTopY + preset.head.maxMm * pxPerMm * plan.zoom
  const bandX = cropX
  const bandW = cropW
  const bandTop = toY(minHeadEndY)
  const bandHeight = (maxHeadEndY - minHeadEndY) * scale
  context.save()
  context.globalAlpha = 0.22
  context.fillStyle = '#2dd4bf'
  context.fillRect(bandX, bandTop, bandW, bandHeight)
  context.restore()

  const inRange =
    plan.headHeightMm >= preset.head.minMm && plan.headHeightMm <= preset.head.maxMm
  drawRect(context, cropX, cropY, cropW, cropH, {
    color: inRange ? 'rgba(45, 212, 191, 0.95)' : 'rgba(248, 113, 113, 0.95)',
    lineWidth: Math.max(2, canvas.width * 0.004),
  })

  // Soll-Linie für den Scheitel
  const lineX = cropX
  const lineY = toY(sourceTopY)
  context.save()
  context.strokeStyle = 'rgba(226, 232, 240, 0.85)'
  context.lineWidth = Math.max(1, canvas.width * 0.002)
  context.setLineDash([8, 6])
  context.beginPath()
  context.moveTo(lineX, lineY)
  context.lineTo(lineX + bandW, lineY)
  context.stroke()
  context.restore()

  // Soll-Linie für das Kinn
  const chinLineY = toY(sourceHeadEndY)
  context.save()
  context.strokeStyle = 'rgba(226, 232, 240, 0.85)'
  context.lineWidth = Math.max(1, canvas.width * 0.002)
  context.setLineDash([8, 6])
  context.beginPath()
  context.moveTo(lineX, chinLineY)
  context.lineTo(lineX + bandW, chinLineY)
  context.stroke()
  context.restore()

  // Augenlinie
  const eyeY = toY(observation.eyeLineY)
  context.save()
  context.strokeStyle = 'rgba(96, 165, 250, 0.9)'
  context.lineWidth = Math.max(1, canvas.width * 0.002)
  context.beginPath()
  context.moveTo(lineX, eyeY)
  context.lineTo(lineX + bandW, eyeY)
  context.stroke()
  context.restore()

  // Gesichtsmitte
  const centerX = toX(observation.faceCenterX)
  context.save()
  context.strokeStyle = 'rgba(226, 232, 240, 0.4)'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(centerX, 0)
  context.lineTo(centerX, canvas.height)
  context.stroke()
  context.restore()

  if (plan.cropOutOfFrame) {
    context.save()
    context.fillStyle = 'rgba(248, 113, 113, 0.9)'
    context.font = `600 ${Math.max(14, canvas.width * 0.028)}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.fillText('Format passt nicht ins Bild', canvas.width / 2, canvas.height * 0.12)
    context.restore()
  }
}

export function presetAspectRatio(preset: Preset): number {
  return preset.widthMm / preset.heightMm
}

export function overlayHeightForPreset(preset: Preset, maxHeight: number): number {
  return Math.min(maxHeight, Math.round(maxHeight / presetAspectRatio(preset)))
}

export function frameSourceHeight(plan: { sh: number }): number {
  return plan.sh
}

export function mmToSourcePx(mm: number, dpi: number, zoom: number): number {
  return mmToPx(mm, dpi) * zoom
}