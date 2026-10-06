import type { CropAdjustment, CropPlan, FaceGeometry } from './geometry'
import { centerXRatio, eyeLineFromTop, mapPoint, planCrop, resolveTopMarginMm } from './geometry'
import type { PhotoMetrics, Preset } from './types'
import type { FaceObservation } from '../vision/faceEngine'
import { analyzePixels, type OutputGeometry } from '../imaging/analyze'
import { pxToMm } from './units'

/**
 * Deutschland und einzelne Konsulate messen unterschiedlich: mal bis zum
 * Scheitel, mal bis zum Haaransatz. Beide Varianten sind auswählbar.
 */
export type MeasurementBasis = 'scheitel' | 'haaransatz'

export const MEASUREMENT_BASES: Array<{ id: MeasurementBasis; label: string }> = [
  { id: 'scheitel', label: 'Kinn bis Scheitel' },
  { id: 'haaransatz', label: 'Kinn bis Haaransatz' },
]

export function basisY(observation: FaceObservation, basis: MeasurementBasis): number {
  return basis === 'haaransatz' ? observation.hairlineY : observation.crownY
}

export function buildFaceGeometry(observation: FaceObservation, basis: MeasurementBasis): FaceGeometry {
  return {
    crownY: basisY(observation, basis),
    chinY: observation.chinY,
    faceCenterX: observation.faceCenterX,
    faceWidthPx: observation.faceWidthPx,
    eyeLineY: observation.eyeLineY,
  }
}

export function buildPlan(
  preset: Preset,
  observation: FaceObservation,
  adjustment: CropAdjustment,
  basis: MeasurementBasis,
): CropPlan {
  return planCrop(preset, { width: observation.width, height: observation.height }, buildFaceGeometry(observation, basis), adjustment)
}

/** Gesichtspunkte im Koordinatensystem des fertig zugeschnittenen Bildes. */
export function outputGeometry(
  plan: CropPlan,
  observation: FaceObservation,
  basis: MeasurementBasis,
): OutputGeometry {
  const crown = mapPoint(plan, observation.faceCenterX, basisY(observation, basis))
  const hairline = mapPoint(plan, observation.faceCenterX, observation.hairlineY)
  const chin = mapPoint(plan, observation.faceCenterX, observation.chinY)
  const eyes = mapPoint(plan, observation.faceCenterX, observation.eyeLineY)
  const ovalLeft = mapPoint(plan, observation.faceOval.minX, observation.faceOval.minY)
  const ovalRight = mapPoint(plan, observation.faceOval.maxX, observation.faceOval.maxY)

  // Das Mesh misst die Kontur bis zum Stirnansatz; für die Auswertung wird der
  // Bereich bis knapp unter den Scheitel aufgenommen.
  const faceRect = {
    x: ovalLeft.x,
    y: Math.max(0, crown.y),
    width: Math.max(2, ovalRight.x - ovalLeft.x),
    height: Math.max(2, chin.y - crown.y),
  }

  return {
    crownY: crown.y,
    hairlineY: hairline.y,
    chinY: chin.y,
    eyeLineY: eyes.y,
    faceCenterX: crown.x,
    faceRect,
  }
}

export interface MetricsInput {
  preset: Preset
  plan: CropPlan
  observation: FaceObservation
  geometry: OutputGeometry
  image: ImageData
  basis: MeasurementBasis
  outputBytes: number
}

export function computeMetrics({
  plan,
  observation,
  geometry,
  image,
  outputBytes,
}: MetricsInput): PhotoMetrics {
  const pixels = analyzePixels(image, geometry)
  const topMarginMm = pxToMm(geometry.crownY, plan.dpi)

  return {
    crownSource: observation.crownSource,
    headHeightMm: plan.headHeightMm,
    faceHeightMm: pxToMm(geometry.chinY - geometry.hairlineY, plan.dpi),
    centerXRatio: centerXRatio(plan, observation.faceCenterX),
    eyeLineFromTop: eyeLineFromTop(plan, observation.eyeLineY),
    topMarginMm,
    faceWidthMm: pxToMm(observation.faceWidthPx / plan.zoom, plan.dpi),
    rollDeg: observation.rollDeg,
    yawDeg: observation.yawDeg,
    pitchDeg: observation.pitchDeg,
    eyeOpenLeft: observation.eyeOpenLeft,
    eyeOpenRight: observation.eyeOpenRight,
    mouthOpen: observation.mouthOpen,
    smile: observation.smile,
    facesDetected: observation.facesDetected,
    crownInsideFrame: topMarginMm >= 0.2,
    cropOutOfFrame: plan.cropOutOfFrame,
    outputWidthPx: plan.outWidthPx,
    outputHeightPx: plan.outHeightPx,
    outputBytes,
    ...pixels,
  }
}

/** Soll-Kopfhöhe und Ränder – für die Live-Anzeige. */
export interface TargetGeometry {
  headHeightMm: number
  topMarginMm: number
  chinMarginMm: number
}

export function targetGeometry(preset: Preset, adjustment: CropAdjustment = {}): TargetGeometry {
  const headHeightMm = Math.min(
    preset.head.maxMm,
    Math.max(preset.head.minMm, adjustment.headHeightMm ?? preset.head.targetMm),
  )
  const topMarginMm = resolveTopMarginMm(preset, headHeightMm)
  return {
    headHeightMm,
    topMarginMm,
    chinMarginMm: preset.heightMm - headHeightMm - topMarginMm,
  }
}

export function exportFilename(preset: Preset, suffix?: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const parts = [slug(preset.id), preset.widthMm + 'x' + preset.heightMm + 'mm', stamp]
  if (suffix) parts.push(suffix)
  return `${parts.join('_')}.jpg`
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}