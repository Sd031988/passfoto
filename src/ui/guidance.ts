import type { CropPlan } from '../core/geometry'
import type { Preset } from '../core/types'
import type { PixelMetrics } from '../imaging/analyze'
import type { FaceObservation } from '../vision/faceEngine'
import type { TranslationKey } from '../i18n'

export interface LiveGuidanceInput {
  observation: FaceObservation | null
  preset: Preset
  plan: CropPlan | null
  pixels: PixelMetrics | null
}

/**
 * Priorisierte Hinweise für die Live-Anzeige: erst das, was am ehesten zur
 * Ablehnung führt, danach Komfort und Technik.
 */
export function liveGuidance({ observation, preset, plan, pixels }: LiveGuidanceInput): TranslationKey[] {
  const hints: TranslationKey[] = []

  if (!observation || !observation.detected) {
    return ['guide.noFace']
  }

  if (observation.facesDetected > 1) hints.push('guide.multipleFaces')

  if (plan) {
    if (plan.cropOutOfFrame) hints.push(plan.headHeightMm > preset.head.maxMm ? 'guide.tooClose' : 'guide.crownCut')
    if (plan.headHeightMm > preset.head.maxMm) hints.push('guide.tooLarge')
    else if (plan.headHeightMm < preset.head.minMm) hints.push('guide.tooSmall')
  }

  if (Math.abs(observation.yawDeg) > 4) hints.push('guide.turnHead')
  if (Math.abs(observation.rollDeg) > 3) hints.push('guide.tiltHead')
  if (Math.abs(observation.pitchDeg) > 5) hints.push('guide.lookAtCamera')
  if (Math.min(observation.eyeOpenLeft, observation.eyeOpenRight) < 0.35) hints.push('guide.openEyes')
  if (observation.mouthOpen > 0.15) hints.push('guide.closeMouth')
  if (observation.smile > 0.12) hints.push('guide.smile')
  if (preset.glasses === 'verboten') hints.push('guide.noGlasses')

  if (pixels) {
    if (pixels.faceLuminance < 0.28 || pixels.faceLuminance > 0.78) hints.push('guide.moreLight')
    if (pixels.faceShadowAsymmetry > 0.05) hints.push('guide.moreLight')
    if (pixels.backgroundSaturation > 0.1 || pixels.backgroundVariance > 0.05) {
      hints.push('guide.plainBackground')
    }
    if (pixels.sharpness < 0.35) hints.push('guide.sharpen')
  }

  return hints
}