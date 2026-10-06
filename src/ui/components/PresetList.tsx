import { useEffect, useMemo, useState } from 'react'
import type { Preset } from '../../core/types'
import { GROUP_LABELS, PRESETS } from '../../core/presets'
import { formatInteger, translator, type Language, type TranslationKey } from '../../i18n'

interface PresetListProps {
  selectedId: string
  onSelect: (preset: Preset) => void
  language: Language
}

const SEPARATOR = ' – '
const PINNED_COUNTRIES = ['DE', 'EU']

export function countryKey(preset: Preset): string {
  return preset.region
}

export function countryName(preset: Preset, language: Language): string {
  if (preset.region === 'EU') return language === 'en' ? 'Schengen / EU visa' : 'Schengen / EU-Visum'
  const label = language === 'en' ? preset.labelEn : preset.label
  const cut = label.indexOf(SEPARATOR)
  return (cut > 0 ? label.slice(0, cut) : label).trim()
}

export function documentName(preset: Preset, language: Language): string {
  const label = language === 'en' ? preset.labelEn : preset.label
  if (preset.region === 'EU') return label
  const cut = label.indexOf(SEPARATOR)
  return cut > 0 ? label.slice(cut + SEPARATOR.length).trim() : label
}

interface Country {
  key: string
  name: string
  group: Preset['group']
}

export function PresetList({ selectedId, onSelect, language }: PresetListProps) {
  const t = translator(language)
  const selected = PRESETS.find((preset) => preset.id === selectedId) ?? PRESETS[0]
  const [country, setCountry] = useState(() => countryKey(selected))
  const [query, setQuery] = useState('')

  useEffect(() => {
    setCountry(countryKey(selected))
  }, [selected])

  const countryGroups = useMemo(() => {
    const byKey = new Map<string, Country>()
    for (const preset of PRESETS) {
      const key = countryKey(preset)
      if (!byKey.has(key)) byKey.set(key, { key, name: countryName(preset, language), group: preset.group })
    }
    const groups = new Map<Preset['group'], Country[]>()
    for (const entry of byKey.values()) {
      const list = groups.get(entry.group) ?? []
      list.push(entry)
      groups.set(entry.group, list)
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const pa = PINNED_COUNTRIES.indexOf(a.key)
        const pb = PINNED_COUNTRIES.indexOf(b.key)
        if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
        return a.name.localeCompare(b.name, language === 'en' ? 'en' : 'de')
      })
    }
    return [...groups.entries()]
  }, [language])

  const searching = query.trim().length > 0

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return PRESETS.filter((preset) => countryKey(preset) === country)
    return PRESETS.filter((preset) =>
      [preset.label, preset.labelEn, preset.region, preset.id, `${preset.widthMm}x${preset.heightMm}`, `${preset.widthMm} x ${preset.heightMm}`]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [query, country])

  const groupLabel = (group: Preset['group']): string => {
    const key = `preset.group.${group}` as TranslationKey
    const translated = t(key)
    return translated === key ? GROUP_LABELS[group] : translated
  }

  const chooseCountry = (key: string): void => {
    setCountry(key)
    setQuery('')
    const first = PRESETS.find((preset) => countryKey(preset) === key)
    if (first) onSelect(first)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <label className="block">
        <span className="block pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{t('preset.country')}</span>
        <select
          value={country}
          onChange={(event) => chooseCountry(event.target.value)}
          className="w-full rounded-lg border border-ink-600/40 bg-ink-900 px-3 py-2 text-sm font-medium outline-none focus:border-mint-500"
        >
          {countryGroups.map(([group, countries]) => (
            <optgroup key={group} label={groupLabel(group)}>
              {countries.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="sr-only">{t('preset.select')}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('preset.search')}
          className="w-full rounded-lg border border-ink-600/40 bg-ink-900/70 px-3 py-2 text-sm outline-none focus:border-mint-500"
        />
      </label>

      <div className="flex-1 overflow-y-auto pr-1">
        <h2 className="px-1 pb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {searching ? t('preset.searchResults') : t('preset.documents')}
        </h2>
        {visible.length === 0 && <p className="px-1 py-6 text-sm text-slate-400">{t('preset.noResults')}</p>}
        <ul className="space-y-1">
          {visible.map((preset) => {
            const active = preset.id === selectedId
            return (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => onSelect(preset)}
                  aria-pressed={active}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'border-mint-500 bg-mint-500/15 text-white'
                      : 'border-transparent text-slate-200 hover:border-ink-600/60 hover:bg-ink-800/60'
                  }`}
                >
                  <span className="block font-medium">
                    {searching ? (language === 'en' ? preset.labelEn : preset.label) : documentName(preset, language)}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {formatInteger(preset.widthMm, language)} × {formatInteger(preset.heightMm, language)} mm
                    {' · '}
                    {preset.confidence === 'offiziell' ? t('preset.confidence.offiziell') : t('preset.confidence.praxis')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
