import { useMemo, useState } from 'react'
import type { Preset } from '../../core/types'
import { GROUP_LABELS, PRESETS } from '../../core/presets'
import { formatInteger, translator, type Language, type TranslationKey } from '../../i18n'

interface PresetListProps {
  selectedId: string
  onSelect: (preset: Preset) => void
  language: Language
}

export function PresetList({ selectedId, onSelect, language }: PresetListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return PRESETS
    return PRESETS.filter((preset) => {
      const haystack = [
        preset.label,
        preset.labelEn,
        preset.region,
        preset.id,
        `${preset.widthMm}x${preset.heightMm}`,
        `${preset.widthMm} x ${preset.heightMm}`,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [query])

  const groups = useMemo(() => {
    const map = new Map<Preset['group'], Preset[]>()
    for (const preset of filtered) {
      const list = map.get(preset.group) ?? []
      list.push(preset)
      map.set(preset.group, list)
    }
    return [...map.entries()]
  }, [filtered])

  const t = translator(language)

  return (
    <div className="flex h-full flex-col gap-3">
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

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="px-1 py-6 text-sm text-slate-400">{t('preset.noResults')}</p>
        )}

        {groups.map(([group, presets]) => (
          <section key={group}>
            <h2 className="px-1 pb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {t(`preset.group.${group}` as TranslationKey) === `preset.group.${group}`
                ? GROUP_LABELS[group]
                : t(`preset.group.${group}` as TranslationKey)}
            </h2>
            <ul className="space-y-1">
              {presets.map((preset) => {
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
                      <span className="block font-medium">{preset.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {formatInteger(preset.widthMm, language)} × {formatInteger(preset.heightMm, language)} mm
                        {' · '}
                        {preset.confidence === 'offiziell'
                          ? t('preset.confidence.offiziell')
                          : t('preset.confidence.praxis')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}