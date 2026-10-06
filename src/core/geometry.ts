import type { Preset } from './types'
import { clamp, mmToPx, pxToMm, roundToEven } from './units'

export interface SourceSize {
  width: number
  height: number
}

/** Lage der Gesichtspunkte im Quellbild, in Quellbild-Pixeln. */
export interface FaceGeometry {
  crownY: number
  chinY: number
  faceCenterX: number
  faceWidthPx: number
  eyeLineY: number
}

export interface CropAdjustment {
  /** Gewünschte Kopfhöhe in mm; wird auf den zulässigen Bereich begrenzt. */
  headHeightMm?: number
  /** Manuelle Verschiebung nach oben in mm (positiv = nach oben). */
  topOffsetMm?: number
  /** Manuelle Verschiebung nach rechts in mm (positiv = nach rechts). */
  sideOffsetMm?: number
  /** Zusätzlicher Zoom-Faktor, 1 = automatische Kopfgröße. */
  zoomFactor?: number
}

export interface CropPlan {
  /** Ausschnitt in Quellbild-Pixeln. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Quellpixel je Ausgabepixel. */
  zoom: number
  /** Ausgabe in Pixeln. */
  outWidthPx: number
  outHeightPx: number
  dpi: number
  headHeightMm: number
  topMarginMm: number
  chinMarginMm: number
  /** Scheitel oder Kinn liegen außerhalb des Quellbildes. */
  cropOutOfFrame: boolean
  /** Der Zoom ist an der Grenze des Quellbildes. */
  qualityLimited: boolean
}

export function targetHeadHeightMm(preset: Preset, adjustment: CropAdjustment = {}): number {
  const requested = adjustment.headHeightMm ?? preset.head.targetMm
  return clamp(requested, preset.head.minMm, preset.head.maxMm)
}

export function resolveTopMarginMm(preset: Preset, headHeightMm: number): number {
  const free = preset.heightMm - headHeightMm
  if (free <= 0) return 0
  if (preset.topMarginMm !== undefined) return Math.min(preset.topMarginMm, free)
  const ratio = preset.freeSpaceTopRatio ?? 0.27
  return free * ratio
}

/**
 * Berechnet den Ausschnitt, der die Kopfhöhe und die freie Fläche des Presets einhält.
 * Der Scheitel wird aus der Gesichtserkennung geschätzt, deshalb bleibt eine manuelle
 * Korrektur über `adjustment` vorgesehen.
 */
export function planCrop(
  preset: Preset,
  source: SourceSize,
  face: FaceGeometry,
  adjustment: CropAdjustment = {},
): CropPlan {
  const headHeightMm = targetHeadHeightMm(preset, adjustment)
  // Negativer topOffsetMm verschiebt das Gesicht im fertigen Bild nach oben,
  // also weg vom Oberrand.
  const topMarginMm = resolveTopMarginMm(preset, headHeightMm) - (adjustment.topOffsetMm ?? 0)
  const chinMarginMm = Math.max(0, preset.heightMm - headHeightMm - topMarginMm)

  const headPx = Math.max(1, face.chinY - face.crownY)
  const zoomFactor = adjustment.zoomFactor ?? 1
  const pxPerMm = preset.dpi / 25.4
  // Quellpixel je Ausgabepixel. `headHeightMm` ist Sollmaß in mm, `pxPerMm` die
  // Ausgabepixel je mm – der Quotient liefert die Streckung des Quellbildes.
  const zoom = (headPx / (headHeightMm * pxPerMm)) * zoomFactor

  const outWidthPx = roundToEven(mmToPx(preset.widthMm, preset.dpi))
  const outHeightPx = roundToEven(mmToPx(preset.heightMm, preset.dpi))

  const sw = outWidthPx * zoom
  const sh = outHeightPx * zoom

  // Ein positiver Versatz schiebt das Gesicht im fertigen Bild in die Richtung.
  const sx = face.faceCenterX - sw / 2 - (adjustment.sideOffsetMm ?? 0) * pxPerMm * zoom
  const sy = face.crownY - topMarginMm * pxPerMm * zoom

  const cropOutOfFrame =
    sx < -0.5 || sy < -0.5 || sx + sw > source.width + 0.5 || sy + sh > source.height + 0.5

  // Ist der Ausschnitt größer als das Quellbild (Kopf zu nah), bleibt er unverändert
  // stehen. Das Festklemmen auf 0 würde ihn sonst beim Zeichnen stauchen.
  const clampedSx = sw <= source.width ? clamp(sx, 0, source.width - sw) : sx
  const clampedSy = sh <= source.height ? clamp(sy, 0, source.height - sh) : sy

  const qualityLimited = Math.abs(clampedSx - sx) > 0.5 || Math.abs(clampedSy - sy) > 0.5

  return {
    sx: clampedSx,
    sy: clampedSy,
    sw,
    sh,
    zoom,
    outWidthPx,
    outHeightPx,
    dpi: preset.dpi,
    headHeightMm,
    topMarginMm,
    chinMarginMm,
    cropOutOfFrame,
    qualityLimited,
  }
}

/** Umrechnung eines Punktes vom Quellbild in das Ausgabeformat. */
export function mapPoint(plan: CropPlan, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - plan.sx) / plan.zoom,
    y: (y - plan.sy) / plan.zoom,
  }
}

/** Gesichtshöhe (Kinn bis geschätztem Haaransatz) in mm im Ausgabeformat. */
export function faceHeightMm(plan: CropPlan, chinY: number, hairlineY: number): number {
  return pxToMm((chinY - hairlineY) / plan.zoom, plan.dpi)
}

/** Anteil der Bildbreite (0..1), an dem die Gesichtsmittellinie liegt. */
export function centerXRatio(plan: CropPlan, faceCenterX: number): number {
  return (faceCenterX - plan.sx) / (plan.outWidthPx * plan.zoom)
}

/** Anteil der Bildhöhe (0..1), auf dem die Augenlinie liegt. */
export function eyeLineFromTop(plan: CropPlan, eyeLineY: number): number {
  return (eyeLineY - plan.sy) / (plan.outHeightPx * plan.zoom)
}