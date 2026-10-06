/** Punkt- und Indizesammlung für das MediaPipe-Gesichtsmesh (468 Punkte). */
export const LM = {
  chin: 152,
  noseTip: 1,
  noseBottom: 2,
  foreheadTop: 10,
  upperLipTop: 13,
  lowerLipBottom: 14,
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  rightCheek: 234,
  leftCheek: 454,
  rightIris: 468,
  leftIris: 473,
} as const

export const FACE_OVAL: readonly number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

export interface Landmark {
  x: number
  y: number
  z: number
}

export function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function rollFromLandmarks(landmarks: Landmark[]): number {
  const a = landmarks[LM.rightEyeOuter]
  const b = landmarks[LM.leftEyeOuter]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export function faceOvalRect(landmarks: Landmark[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const index of FACE_OVAL) {
    const point = landmarks[index]
    if (!point) continue
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Heuristische Schätzung des Scheitels aus dem Stirn-Punkt des Meshes.
 * Verwendet das Verhältnis Kinn–Stirn (≈ 0,48 der Kopfhöhe) und wird nur genutzt,
 * wenn die Haarsegmentierung nicht verfügbar ist.
 */
export function estimateCrownFromLandmarks(landmarks: Landmark[]): number {
  const forehead = landmarks[LM.foreheadTop]
  const chin = landmarks[LM.chin]
  return forehead.y - 0.48 * (chin.y - forehead.y)
}

/**
 * Nimmt das 2D-Netz (0..1 normalisiert) und liefert die Eckpunkte in Bildpixeln.
 */
export function toPixelLandmarks(landmarks: Landmark[], width: number, height: number): Landmark[] {
  return landmarks.map((point) => ({ x: point.x * width, y: point.y * height, z: point.z * width }))
}

/**
 * Euler-Winkel aus der 3x3-Rotationsmatrix der facial transformation matrix.
 * Spaltenweise Ablage (MediaPipe / OpenGL-Konvention).
 */
export function eulerFromTransformMatrix(matrix: ArrayLike<number>): {
  pitchDeg: number
  yawDeg: number
  rollDeg: number
} {
  const get = (row: number, col: number): number => matrix[col * 4 + row]

  const m00 = get(0, 0)
  const m01 = get(0, 1)
  const m02 = get(0, 2)
  const m10 = get(1, 0)
  const m11 = get(1, 1)
  const m12 = get(2, 0)
  const m22 = get(2, 2)

  const clamp = (value: number) => Math.min(1, Math.max(-1, value))
  const sy = clamp(m02)
  const yaw = Math.asin(sy)
  let pitch: number
  let roll: number
  if (Math.abs(sy) < 0.9999) {
    pitch = Math.atan2(-m12, m22)
    roll = Math.atan2(m01, m00)
  } else {
    pitch = Math.atan2(m10, m11)
    roll = 0
  }

  const rad = 180 / Math.PI
  return { pitchDeg: pitch * rad, yawDeg: yaw * rad, rollDeg: roll * rad }
}

export function blendScore(categories: Array<{ categoryName: string; score: number }>, name: string): number {
  const found = categories.find((item) => item.categoryName === name)
  return found?.score ?? 0
}