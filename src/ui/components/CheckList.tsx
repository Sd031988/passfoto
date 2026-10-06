import type { CheckCategory, CheckResult, CheckStatus } from '../../core/types'
import { translator, type Language, type TranslationKey } from '../../i18n'

const CATEGORY_ORDER: CheckCategory[] = [
  'masse',
  'gesicht',
  'haltung',
  'ausdruck',
  'licht',
  'hintergrund',
  'qualitaet',
  'datei',
]

const CATEGORY_LABELS: Record<CheckCategory, TranslationKey> = {
  masse: 'category.masse',
  gesicht: 'category.gesicht',
  haltung: 'category.haltung',
  ausdruck: 'category.ausdruck',
  licht: 'category.licht',
  hintergrund: 'category.hintergrund',
  qualitaet: 'category.qualitaet',
  datei: 'category.datei',
}

const STATUS_STYLES: Record<CheckStatus, string> = {
  pass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  fail: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  info: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
}

const STATUS_MARK: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  info: 'i',
}

interface CheckListProps {
  checks: CheckResult[]
  language: Language
}

export function CheckList({ checks, language }: CheckListProps) {
  const t = translator(language)

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((category) => {
        const items = checks.filter((check) => check.category === category)
        if (items.length === 0) return null
        return (
          <section key={category}>
            <h3 className="pb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {t(CATEGORY_LABELS[category])}
            </h3>
            <ul className="space-y-1">
              {items.map((check) => (
                <li
                  key={check.id}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                    STATUS_STYLES[check.status]
                  }`}
                >
                  <span aria-hidden className="mt-0.5 w-4 shrink-0 text-center font-bold">
                    {STATUS_MARK[check.status]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t(check.labelKey as TranslationKey)}</span>
                    <span className="mt-0.5 block text-xs opacity-90">
                      {check.measured}
                      {check.status !== 'info' && ` · ${t(`status.${check.status}` as TranslationKey)}: ${check.target}`}
                    </span>
                    {check.hintKey && (
                      <span className="mt-0.5 block text-xs opacity-80">
                        {t(check.hintKey as TranslationKey)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

interface SummaryBadgeProps {
  status: CheckStatus
  passed: number
  total: number
  language: Language
}

export function SummaryBadge({ status, passed, total, language }: SummaryBadgeProps) {
  const t = translator(language)
  const label =
    status === 'pass'
      ? t('check.summary.pass')
      : status === 'warn'
        ? t('check.summary.warn')
        : status === 'fail'
          ? t('check.summary.fail')
          : ''
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${STATUS_STYLES[status]}`}>
      <span className="font-semibold">{label}</span>
      <span className="ml-2 text-xs opacity-90">
        {t('check.counts', { passed, total })}
      </span>
    </div>
  )
}