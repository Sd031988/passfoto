import type { Preset, PresetRegistry } from '../types'
import { EU_PRESETS } from './eu'
import { US_PRESET, US_VISA_PRESET, CANADA_PRESET, BRAZIL_PRESET } from './americas'
import { UK_PRESET, AUSTRALIA_PRESET, INDIA_PRESET, CHINA_PRESET, JAPAN_PRESET } from './world'
import { MORE_PRESETS } from './more'

const GROUP_ORDER: Preset['group'][] = ['eu', 'mena-africa', 'asia-pacific', 'americas', 'other']
const PINNED = ['de-personalausweis', 'eu-schengen-visum']

function ordered(list: Preset[]): Preset[] {
  return [...list].sort((a, b) => {
    const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (g !== 0) return g
    const pa = PINNED.indexOf(a.id), pb = PINNED.indexOf(b.id)
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    return a.label.localeCompare(b.label, 'de')
  })
}

export const PRESETS: Preset[] = ordered([
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
  ...MORE_PRESETS,
])

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
  'mena-africa': 'Türkei, Naher Osten & Afrika',
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