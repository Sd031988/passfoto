export const MM_PER_INCH = 25.4

/** Millimeter -> Pixel bei gegebener Auflösung. */
export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi
}

/** Pixel -> Millimeter bei gegebener Auflösung. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH
}

export function inchToMm(inch: number): number {
  return inch * MM_PER_INCH
}

export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Rundet auf eine durch 2 teilbare Pixelzahl.
 * Konsistent beim Anwenden mehrerer Filter, damit das Ergebnis reproduzierbar bleibt.
 */
export function roundToEven(value: number): number {
  const rounded = Math.round(value)
  return rounded % 2 === 0 ? rounded : rounded - 1
}

export function formatMm(value: number, decimals = 1): string {
  return `${round(value, decimals).toLocaleString('de-DE')} mm`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${round(bytes / 1024, 0)} KB`
  return `${round(bytes / (1024 * 1024), 1)} MB`
}