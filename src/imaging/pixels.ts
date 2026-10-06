export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.round(rect.x)))
  const y = Math.max(0, Math.min(height - 1, Math.round(rect.y)))
  const w = Math.max(1, Math.min(width - x, Math.round(rect.width)))
  const h = Math.max(1, Math.min(height - y, Math.round(rect.height)))
  return { x, y, width: w, height: h }
}

/** sRGB-Relativluminanz nach ITU-R BT.709, Wertebereich 0..1. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function toGray(image: ImageData): Float32Array {
  const { data } = image
  const gray = new Float32Array(image.width * image.height)
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = relativeLuminance(data[p], data[p + 1], data[p + 2])
  }
  return gray
}

export function luminanceAt(image: ImageData, x: number, y: number): number {
  const p = (y * image.width + x) * 4
  return relativeLuminance(image.data[p], image.data[p + 1], image.data[p + 2])
}

/** Mittlere Helligkeit in einem Rechteck. */
export function meanLuminance(gray: Float32Array, width: number, rect: Rect): number {
  let sum = 0
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      sum += gray[y * width + x]
      count += 1
    }
  }
  return count > 0 ? sum / count : 0
}

/** Standardabweichung der Helligkeit – Maß für Farb- und Strukturwechsel. */
export function stdDevLuminance(gray: Float32Array, width: number, rect: Rect): number {
  const mean = meanLuminance(gray, width, rect)
  let sum = 0
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const diff = gray[y * width + x] - mean
      sum += diff * diff
      count += 1
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0
}

/** Laplace-Operator als Schärfemaß. */
export function laplacianAt(gray: Float32Array, width: number, height: number, x: number, y: number): number {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return 0
  const i = y * width + x
  return (
    4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]
  )
}

/**
 * Varianz des Laplace-Operators, normiert auf den Wertebereich.
 * 0 = flach oder unscharf, 1 = sehr kontrastreich.
 */
export function sharpnessScore(gray: Float32Array, width: number, height: number, rect: Rect): number {
  let sum = 0
  let sumSq = 0
  let count = 0
  const scale = 4
  for (let y = rect.y + scale; y < rect.y + rect.height - scale; y += 1) {
    for (let x = rect.x + scale; x < rect.x + rect.width - scale; x += 1) {
      const value = laplacianAt(gray, width, height, x, y)
      sum += value
      sumSq += value * value
      count += 1
    }
  }
  if (count === 0) return 0
  const mean = sum / count
  const variance = Math.max(0, sumSq / count - mean * mean)
  return Math.min(1, Math.sqrt(variance) / 0.35)
}

/** Mittlere Kantenenergie – für „glatter Hintergrund". */
export function textureScore(gray: Float32Array, width: number, height: number, rect: Rect): number {
  let sum = 0
  let count = 0
  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y += 1) {
    for (let x = rect.x + 1; x < rect.x + rect.width - 1; x += 1) {
      sum += Math.abs(laplacianAt(gray, width, height, x, y))
      count += 1
    }
  }
  if (count === 0) return 0
  return Math.min(1, sum / count / 0.08)
}

/** Mittlere Farbsättigung (HSL-Sättigung) in einem Rechteck. */
export function meanSaturation(image: ImageData, rect: Rect): number {
  const { data } = image
  let sum = 0
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const p = (y * image.width + x) * 4
      const r = data[p]
      const g = data[p + 1]
      const b = data[p + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      sum += max === 0 ? 0 : (max - min) / max
      count += 1
    }
  }
  return count > 0 ? sum / count : 0
}

/** Anteil rein weißer bzw. rein schwarzer Pixel in einem Rechteck. */
export function clippingFractions(image: ImageData, rect: Rect): { highlight: number; shadow: number } {
  const { data } = image
  let highlight = 0
  let shadow = 0
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const p = (y * image.width + x) * 4
      const lum = relativeLuminance(data[p], data[p + 1], data[p + 2])
      if (lum > 0.97) highlight += 1
      if (lum < 0.06) shadow += 1
      count += 1
    }
  }
  return {
    highlight: count > 0 ? highlight / count : 0,
    shadow: count > 0 ? shadow / count : 0,
  }
}

/** Mittlere Differenz des Rot- zum Grünkanal – Indikator für einen Farbstich. */
export function meanRedGreenDelta(image: ImageData, rect: Rect): number {
  const { data } = image
  let sum = 0
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const p = (y * image.width + x) * 4
      sum += (data[p] - data[p + 1]) / 255
      count += 1
    }
  }
  return count > 0 ? Math.abs(sum / count) : 0
}

/**
 * Asymmetrische Ausleuchtung im Gesicht: Differenz der mittleren Helligkeit
 * der linken und rechten Gesichtshälfte. 0 = symmetrisch.
 */
export function faceShadowAsymmetry(
  gray: Float32Array,
  width: number,
  rect: Rect,
  centerX: number,
): number {
  const split = Math.round(centerX)
  const left: Rect = {
    x: rect.x,
    y: rect.y,
    width: Math.max(1, Math.min(rect.width, split - rect.x) - Math.round(rect.width * 0.15)),
    height: rect.height,
  }
  const right: Rect = {
    x: Math.min(rect.x + rect.width - 1, split + Math.round(rect.width * 0.15)),
    y: rect.y,
    width: rect.width - (split + Math.round(rect.width * 0.15) - rect.x),
    height: rect.height,
  }
  if (left.width < 4 || right.width < 4) return 0
  return Math.abs(meanLuminance(gray, width, left) - meanLuminance(gray, width, right))
}

/** Bildinhalt in ein Rechteck kopieren. */
export function cropImageData(image: ImageData, rect: Rect): ImageData {
  const x = Math.max(0, Math.round(rect.x))
  const y = Math.max(0, Math.round(rect.y))
  const width = Math.min(image.width - x, Math.round(rect.width))
  const height = Math.min(image.height - y, Math.round(rect.height))
  const out = new ImageData(width, height)
  for (let row = 0; row < height; row += 1) {
    const srcStart = ((y + row) * image.width + x) * 4
    out.data.set(image.data.subarray(srcStart, srcStart + width * 4), row * width * 4)
  }
  return out
}