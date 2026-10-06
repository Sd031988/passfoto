import type { CheckResult, PhotoMetrics, Preset } from '../../core/types'
import type { PaperId } from '../../imaging/printSheet'
import { PAPERS } from '../../imaging/printSheet'
import { formatBytes } from '../../core/units'
import { formatInteger, translator, type Language } from '../../i18n'

export interface SheetOptions {
  paperId: PaperId
  copies: number
  cutMarks: boolean
  caption: boolean
}

interface ExportPanelProps {
  preset: Preset
  metrics: PhotoMetrics | null
  checks: CheckResult[]
  jpegBytes: number | null
  perPage: number
  quality: number
  sheet: SheetOptions
  language: Language
  busy: boolean
  onQualityChange: (quality: number) => void
  onSheetChange: (sheet: SheetOptions) => void
  onDownloadPhoto: () => void
  onDownloadPng: () => void
  onDownloadSheet: () => void
  onCopyClipboard: () => void
  onBatchExport: () => void
}

export function ExportPanel({
  preset,
  metrics,
  checks,
  jpegBytes,
  perPage,
  quality,
  sheet,
  language,
  busy,
  onQualityChange,
  onSheetChange,
  onDownloadPhoto,
  onDownloadPng,
  onDownloadSheet,
  onCopyClipboard,
  onBatchExport,
}: ExportPanelProps) {
  const t = translator(language)
  const paper = PAPERS[sheet.paperId]
  const blocking = checks.some((check) => check.status === 'fail')
  const pages = Math.max(1, Math.ceil(sheet.copies / perPage))

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink-600/40 bg-ink-900/60 p-3">
        <h3 className="pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {t('export.single')}
        </h3>
        {metrics && jpegBytes ? (
          <p className="pb-2 text-xs text-slate-300">
            {t('export.sizeInfo', {
              width: formatInteger(metrics.outputWidthPx, language),
              height: formatInteger(metrics.outputHeightPx, language),
              dpi: preset.dpi,
              bytes: formatBytes(jpegBytes),
            })}
          </p>
        ) : null}

        <label className="block pb-3">
          <span className="flex justify-between text-xs text-slate-300">
            <span>{t('export.quality')}</span>
            <span>{Math.round(quality * 100)} %</span>
          </span>
          <input
            type="range"
            min={0.6}
            max={1}
            step={0.01}
            value={quality}
            onChange={(event) => onQualityChange(Number(event.target.value))}
            className="w-full"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDownloadPhoto}
            disabled={busy || blocking}
            className="rounded-lg bg-mint-500 px-3 py-2 text-sm font-semibold text-ink-950 disabled:opacity-40"
          >
            {t('export.downloadPhoto')}
          </button>
          <button
            type="button"
            onClick={onDownloadPng}
            disabled={busy || blocking}
            className="rounded-lg border border-ink-600/60 px-3 py-2 text-sm disabled:opacity-40"
          >
            {t('export.downloadPng')}
          </button>
          <button
            type="button"
            onClick={onCopyClipboard}
            disabled={busy || blocking}
            className="rounded-lg border border-ink-600/60 px-3 py-2 text-sm disabled:opacity-40"
          >
            {t('export.copyClipboard')}
          </button>
        </div>
        {blocking && <p className="pt-2 text-xs text-rose-300">{t('export.blockedByChecks')}</p>}
      </section>

      <section className="rounded-lg border border-ink-600/40 bg-ink-900/60 p-3">
        <h3 className="pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {t('export.sheet')}
        </h3>

        <label className="block pb-2 text-sm">
          <span className="block pb-1 text-xs text-slate-300">{t('export.paper')}</span>
          <select
            value={sheet.paperId}
            onChange={(event) => onSheetChange({ ...sheet, paperId: event.target.value as PaperId })}
            className="w-full rounded-lg border border-ink-600/50 bg-ink-900 px-2 py-1.5 text-sm"
          >
            {(Object.keys(PAPERS) as PaperId[])
              .filter((id) => preset.printSheets.includes(id) || PAPERS[id].common)
              .map((id) => (
                <option key={id} value={id}>
                  {PAPERS[id].label}
                </option>
              ))}
          </select>
        </label>

        <label className="block pb-2 text-sm">
          <span className="flex justify-between text-xs text-slate-300">
            <span>{t('export.copies')}</span>
            <span>
              {sheet.copies} · {perPage} {t('export.perPage')} · {pages} Seiten
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={32}
            value={sheet.copies}
            onChange={(event) => onSheetChange({ ...sheet, copies: Number(event.target.value) })}
            className="w-full"
          />
        </label>

        <div className="flex flex-col gap-1 pb-3 text-sm">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={sheet.cutMarks}
              onChange={(event) => onSheetChange({ ...sheet, cutMarks: event.target.checked })}
            />
            {t('export.cutMarks')}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={sheet.caption}
              onChange={(event) => onSheetChange({ ...sheet, caption: event.target.checked })}
            />
            {t('export.caption')}
          </label>
        </div>

        <button
          type="button"
          onClick={onDownloadSheet}
          disabled={busy || blocking}
          className="w-full rounded-lg border border-mint-500/60 px-3 py-2 text-sm font-semibold text-mint-300 disabled:opacity-40"
        >
          {t('export.downloadSheet')}
        </button>
        <p className="pt-2 text-xs text-slate-400">
          {paper.label}: {formatInteger(paper.widthMm, language)} × {formatInteger(paper.heightMm, language)} mm ·
          100 % Größe drucken
        </p>
      </section>

      <section className="rounded-lg border border-ink-600/40 bg-ink-900/60 p-3">
        <h3 className="pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {t('export.batch')}
        </h3>
        <p className="pb-2 text-xs text-slate-400">{t('export.batchHint')}</p>
        <button
          type="button"
          onClick={onBatchExport}
          disabled={busy || blocking}
          className="w-full rounded-lg border border-ink-600/60 px-3 py-2 text-sm disabled:opacity-40"
        >
          {t('export.batch')}
        </button>
      </section>
    </div>
  )
}