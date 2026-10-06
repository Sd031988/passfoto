import type { Preset } from '../core/types'
import { PdfBuilder, type PdfImage } from './pdf'

export type PaperId = 'a4' | 'letter' | '4x6' | 'a6'

export interface Paper {
  id: PaperId
  label: string
  widthMm: number
  heightMm: number
  /** Mindestabstand zum Blattrand. */
  marginMm: number
  /** Abstand zwischen zwei Fotos. */
  gapMm: number
  defaultCopies: number
  /** Drucker, die das Papierformat nicht schlucken. */
  common: boolean
}

export const PAPERS: Record<PaperId, Paper> = {
  a4: { id: 'a4', label: 'DIN A4', widthMm: 210, heightMm: 297, marginMm: 10, gapMm: 3, defaultCopies: 8, common: true },
  letter: {
    id: 'letter',
    label: 'US Letter',
    widthMm: 215.9,
    heightMm: 279.4,
    marginMm: 10,
    gapMm: 3,
    defaultCopies: 8,
    common: true,
  },
  '4x6': {
    id: '4x6',
    label: '4 × 6 Zoll',
    widthMm: 101.6,
    heightMm: 152.4,
    marginMm: 6,
    gapMm: 2,
    defaultCopies: 4,
    common: true,
  },
  a6: {
    id: 'a6',
    label: 'DIN A6',
    widthMm: 105,
    heightMm: 148,
    marginMm: 6,
    gapMm: 2,
    defaultCopies: 4,
    common: false,
  },
}

export interface PrintLayout {
  columns: number
  rows: number
  perPage: number
  pages: number
  cellWidthMm: number
  cellHeightMm: number
  originXMm: number
  originYMm: number
}

/** Berechnet das Raster für ein Papierformat, ohne die Anzahl zu berücksichtigen. */
export function planLayout(preset: Preset, paper: Paper): PrintLayout {
  const usableWidth = paper.widthMm - 2 * paper.marginMm
  const usableHeight = paper.heightMm - 2 * paper.marginMm - 6
  const columns = Math.max(1, Math.floor((usableWidth + paper.gapMm) / (preset.widthMm + paper.gapMm)))
  const rows = Math.max(1, Math.floor((usableHeight + paper.gapMm) / (preset.heightMm + paper.gapMm)))
  const perPage = columns * rows
  const gridWidth = columns * preset.widthMm + (columns - 1) * paper.gapMm
  const gridHeight = rows * preset.heightMm + (rows - 1) * paper.gapMm
  return {
    columns,
    rows,
    perPage,
    pages: 1,
    cellWidthMm: preset.widthMm,
    cellHeightMm: preset.heightMm,
    originXMm: paper.marginMm + (usableWidth - gridWidth) / 2,
    originYMm: paper.marginMm + (usableHeight - gridHeight) / 2,
  }
}

export function planPrintLayout(preset: Preset, paper: Paper, copies: number): PrintLayout {
  const layout = planLayout(preset, paper)
  return { ...layout, pages: Math.max(1, Math.ceil(copies / layout.perPage)) }
}

const CORNER_ARM_MM = 4

function cropMarks(
  builder: PdfBuilder,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const arm = CORNER_ARM_MM
  const widthPt = 0.2
  const gray = 0.6
  const corners: Array<[number, number, number, number]> = [
    [x, y, x + arm, y],
    [x, y + height, x + arm, y + height],
    [x + width, y, x + width - arm, y],
    [x + width, y + height, x + width - arm, y + height],
    [x, y, x, y + arm],
    [x, y + height, x, y + arm],
    [x + width, y, x + width, y + arm],
    [x + width, y + height, x + width, y + height - arm],
  ]
  for (const [x1, y1, x2, y2] of corners) {
    builder.line({ x1Mm: x1, y1Mm: y1, x2Mm: x2, y2Mm: y2, widthPt, gray })
  }
}

export interface PrintSheetOptions {
  copies: number
  includeCutMarks: boolean
  /** Beschriftung mit Dokumentname und Datum. */
  caption?: string
  dateLabel?: string
}

/** Erzeugt einen mehrseitigen PDF-Druckbogen mit exakt maßstabsgetreuen Fotos. */
export function buildPrintSheet(
  jpeg: Uint8Array,
  preset: Preset,
  paper: Paper,
  options: PrintSheetOptions,
): { pdf: Uint8Array; layout: PrintLayout } {
  const layout = planPrintLayout(preset, paper, options.copies)
  const builder = new PdfBuilder(paper.widthMm, paper.heightMm)
  const anchor: PdfImage = {
    jpeg,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    xMm: 0,
    yMm: 0,
  }

  let remaining = options.copies
  for (let page = 0; page < layout.pages; page += 1) {
    builder.addPage()
    const onPage = Math.min(remaining, layout.perPage)
    for (let index = 0; index < onPage; index += 1) {
      const column = index % layout.columns
      const row = Math.floor(index / layout.columns)
      const x = layout.originXMm + column * (preset.widthMm + paper.gapMm)
      const yFromTop = layout.originYMm + row * (preset.heightMm + paper.gapMm)
      const y = paper.heightMm - yFromTop - preset.heightMm
      builder.image({ ...anchor, xMm: x, yMm: y })
      if (options.includeCutMarks) cropMarks(builder, x, y, preset.widthMm, preset.heightMm)
    }
    if (options.caption) {
      builder.text({
        xMm: paper.marginMm,
        yMm: paper.marginMm / 2,
        text: `${options.caption}${options.dateLabel ? ` – ${options.dateLabel}` : ''}`,
        sizePt: 7,
        gray: 0.4,
      })
    }
    remaining -= onPage
  }

  return { pdf: builder.build(anchor), layout }
}