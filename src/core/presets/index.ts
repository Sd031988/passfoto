import type { Preset, PresetRegistry } from '../types'
import { EU_PRESETS } from './eu'
import { US_PRESET, US_VISA_PRESET, CANADA_PRESET, BRAZIL_PRESET } from './americas'
import { UK_PRESET, AUSTRALIA_PRESET, INDIA_PRESET, CHINA_PRESET, JAPAN_PRESET } from './world'

export const PRESETS: Preset[] = [
  ...EU_PRESETS,
  US_PRESET,
  US_VISA_PRESET,
  UK_PRESET,
  CANADA_PRESET,
  AUSTRALIA_PRESET,
  INDIA_PRESET,
  CHINA_PRESET,
  BRAZIL_PRESET,
  JAPAN_PRESET,
]

export const REGISTRY: PresetRegistry = {
  presets: PRESETS,
  byId: Object.fromEntries(PRESETS.map((preset) => [preset.id, preset])),
}

export function getPreset(id: string): Preset {
  const preset = REGISTRY.byId[id]
  if (!preset) throw new Error(`Unbekanntes Preset: ${id}`)
  return preset
}

export const GROUP_LABELS: Record<Preset['group'], string> = {
  eu: 'Europa / Schengen',
  americas: 'Amerika',
  'asia-pacific': 'Asien & Pazifik',
  other: 'Weitere',
}

/** Altengruppenspezifisches Deutschland-Preset. */
export function presetForAge(preset: Preset, ageYears: number): Preset {
  if (preset.id !== 'nl-paspoort') return preset
  return {
    ...preset,
    head:
      ageYears <= 10
        ? { minMm: 19, maxMm: 30, targetMm: 27 }
        : { minMm: 26, maxMm: 30, targetMm: 28 },
  }
}