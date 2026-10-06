/**
 * Minimaler PDF-Generator für Druckbögen.
 * Bilder werden als JPEG (DCTDecode) eingebettet, damit keine erneute
 * Qualitätsverluste durch PNG-Kodierung entstehen. Maße werden in
 * Millimetern übergeben und exakt umgerechnet (1 mm = 72/25,4 pt).
 */

const MM_TO_PT = 72 / 25.4

export interface PdfImage {
  jpeg: Uint8Array
  /** Zielgröße in Millimetern. */
  widthMm: number
  heightMm: number
  /** Position der linken unteren Ecke in Millimetern. */
  xMm: number
  yMm: number
}

export interface PdfLine {
  x1Mm: number
  y1Mm: number
  x2Mm: number
  y2Mm: number
  widthPt: number
  gray: number
}

export interface PdfText {
  xMm: number
  yMm: number
  text: string
  sizePt: number
  gray: number
}

interface PdfPage {
  images: PdfImage[]
  lines: PdfLine[]
  texts: PdfText[]
}

export class PdfBuilder {
  private pages: PdfPage[] = []
  private current: PdfPage | null = null
  private pageWidthMm: number
  private pageHeightMm: number

  constructor(pageWidthMm: number, pageHeightMm: number) {
    this.pageWidthMm = pageWidthMm
    this.pageHeightMm = pageHeightMm
  }

  addPage(): this {
    const page: PdfPage = { images: [], lines: [], texts: [] }
    this.current = page
    this.pages.push(page)
    return this
  }

  image(image: PdfImage): this {
    this.requirePage().images.push(image)
    return this
  }

  line(line: PdfLine): this {
    this.requirePage().lines.push(line)
    return this
  }

  text(text: PdfText): this {
    this.requirePage().texts.push(text)
    return this
  }

  private requirePage(): PdfPage {
    if (!this.current) this.addPage()
    return this.current as { images: PdfImage[]; lines: PdfLine[]; texts: PdfText[] }
  }

  build(image?: PdfImage): Uint8Array {
    const chunks: Uint8Array[] = []
    const offsets: number[] = []
    let length = 0

    const push = (chunk: Uint8Array): void => {
      chunks.push(chunk)
      length += chunk.length
    }
    const beginObject = (): void => {
      offsets.push(length)
    }

  const encoder = new TextEncoder()
  const text = (value: string): Uint8Array => encoder.encode(value)

  // Binärmarkierung als echte Einzelbytes, nicht als UTF-8-Sequenz:
  // sonst stimmen die Byte-Offsets der xref-Tabelle nicht mehr.
  push(text('%PDF-1.4\n%'))
  push(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))


    const imageObjectNumber = image ? 4 : 0
    const pageObjectNumbers = this.pages.map((_, index) => (image ? 5 + index * 2 : 3 + index * 2))

    beginObject()
    push(text(`1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n`))

    beginObject()
    push(
      text(
        `2 0 obj\n<</Type/Pages/Kids[${pageObjectNumbers
          .map((number) => `${number} 0 R`)
          .join(' ')}]/Count ${this.pages.length}>>\nendobj\n`,
      ),
    )

    beginObject()
    push(text(`3 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>\nendobj\n`))

    if (image && imageObjectNumber) {
      const size = imageJpegSize(image.jpeg)
      beginObject()
      const header = `4 0 obj\n<</Type/XObject/Subtype/Image/Width ${size.width}/Height ${
        size.height
      }/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${image.jpeg.length}>>\nstream\n`
      push(text(header))
      push(image.jpeg)
      push(text('\nendstream\nendobj\n'))
    }

    this.pages.forEach((page, pageIndex) => {
      const pageNumber = pageObjectNumbers[pageIndex]
      const contentNumber = pageNumber + 1
      const stream = this.buildContentStream(page, image)

      beginObject()
      push(
        text(
          `${pageNumber} 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${fmt(this.pageWidthMm * MM_TO_PT)} ${fmt(
            this.pageHeightMm * MM_TO_PT,
          )}]/Resources<</Font<</F1 3 0 R>>/XObject<</Im1 ${imageObjectNumber} 0 R>>>>/Contents ${contentNumber} 0 R>>\nendobj\n`,
        ),
      )

      beginObject()
      push(
        text(
          `${contentNumber} 0 obj\n<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj\n`,
        ),
      )
    })

    const xrefOffset = length
    const maxRef = 3 + this.pages.length * 2 + (imageObjectNumber ? 1 : 0)
    let xref = `xref\n0 ${maxRef + 1}\n0000000000 65535 f \n`
    for (let index = 0; index < maxRef; index += 1) {
      xref += `${String(offsets[index] ?? 0).padStart(10, '0')} 00000 n \n`
    }
    xref += `trailer\n<</Size ${maxRef + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`
    push(text(xref))

    const result = new Uint8Array(length)
    let position = 0
    for (const chunk of chunks) {
      result.set(chunk, position)
      position += chunk.length
    }
    return result
  }

  private buildContentStream(page: PdfPage, image?: PdfImage): string {
    const parts: string[] = []
    if (image) {
      for (const item of page.images) {
        parts.push('q')
        parts.push(
          `${fmt(item.widthMm * MM_TO_PT)} 0 0 ${fmt(item.heightMm * MM_TO_PT)} ${fmt(item.xMm * MM_TO_PT)} ${fmt(
            item.yMm * MM_TO_PT,
          )} cm`,
        )
        parts.push('/Im1 Do')
        parts.push('Q')
      }
    }
    for (const line of page.lines) {
      parts.push('q')
      parts.push(`${fmt(line.widthPt)} w`)
      parts.push(`${fmt(line.gray)} G`)
      parts.push(
        `${fmt(line.x1Mm * MM_TO_PT)} ${fmt(line.y1Mm * MM_TO_PT)} m ${fmt(line.x2Mm * MM_TO_PT)} ${fmt(
          line.y2Mm * MM_TO_PT,
        )} l S`,
      )
      parts.push('Q')
    }
    for (const item of page.texts) {
      parts.push('BT')
      parts.push(`/${fmt(item.sizePt)} Tf`)
      parts.push(`${fmt(item.gray)} g`)
      parts.push(
        `1 0 0 1 ${fmt(item.xMm * MM_TO_PT)} ${fmt(item.yMm * MM_TO_PT)} Tm (${escapePdfText(item.text)}) Tj`,
      )
      parts.push('ET')
    }
    return parts.join('\n')
  }
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

/** Liest Breite und Höhe aus einem JPEG-Header (SOF-Marker). */
export function imageJpegSize(bytes: Uint8Array): { width: number; height: number } {
  let index = 2
  while (index < bytes.length - 1) {
    if (bytes[index] !== 0xff) {
      index += 1
      continue
    }
    const marker = bytes[index + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2
      continue
    }
    const length = (bytes[index + 2] << 8) | bytes[index + 3]
    const isFrame =
      (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrame) {
      return { height: (bytes[index + 5] << 8) | bytes[index + 6], width: (bytes[index + 7] << 8) | bytes[index + 8] }
    }
    index += 2 + length
  }
  throw new Error('JPEG-Kopf konnte nicht gelesen werden')
}