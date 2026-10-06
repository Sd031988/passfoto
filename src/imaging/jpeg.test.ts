import { describe, expect, it, test } from 'vitest'
import { imageJpegSize, PdfBuilder } from './pdf'
import { withDpi } from './jpeg'

/**
 * Minimaler, aber vollständig gültiger JPEG-Rumpf:
 * SOI + APP0/JFIF + SOF0 mit 16x12 Pixeln + SOS/EOI.
 */
function makeJpeg(app0: boolean, dpi = 96): Uint8Array {
  const parts: number[] = [0xff, 0xd8]
  if (app0) {
    parts.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 1)
    parts.push((dpi >> 8) & 0xff, dpi & 0xff, (dpi >> 8) & 0xff, dpi & 0xff, 0, 0)
  }
  // SOF0: Länge 17, Präzision 8, Höhe 12, Breite 16, 3 Kanäle
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x0c, 0x00, 0x10, 0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1)
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00)
  parts.push(0x7b, 0x40, 0xff, 0xd9)
  return new Uint8Array(parts)
}

function readJfif(jpeg: Uint8Array) {
  // Das JFIF-Segment muss unmittelbar nach SOI stehen; davor liegen die
  // 2 Markerbytes plus die 2-Byte-Länge, die Nutzdaten beginnen bei +4.
  const hasMarker = jpeg[2] === 0xff && jpeg[3] === 0xe0
  const dataIndex = hasMarker ? 6 : null
  if (dataIndex === null) return null
  return {
    units: jpeg[dataIndex + 7],
    xDensity: (jpeg[dataIndex + 8] << 8) | jpeg[dataIndex + 9],
    yDensity: (jpeg[dataIndex + 10] << 8) | jpeg[dataIndex + 11],
  }
}

describe('JPEG-DPI', () => {
  it('fügt einen JFIF-Header ein, wenn keiner vorhanden ist', () => {
    const patched = withDpi(makeJpeg(false), 300)
    expect(readJfif(patched)).toEqual({ units: 1, xDensity: 300, yDensity: 300 })
    expect(patched[0]).toBe(0xff)
    expect(patched[1]).toBe(0xd8)
    expect(patched.subarray(patched.length - 2)).toEqual(new Uint8Array([0xff, 0xd9]))
  })

  it('aktualisiert einen vorhandenen JFIF-Header, ohne die Länge zu ändern', () => {
    const original = makeJpeg(true, 72)
    const patched = withDpi(original, 600)
    expect(patched.length).toBe(original.length)
    expect(readJfif(patched)).toEqual({ units: 1, xDensity: 600, yDensity: 600 })
  })

  it('verändert die Originaldaten nicht', () => {
    const original = makeJpeg(true, 72)
    withDpi(original, 600)
    expect(readJfif(original)).toEqual({ units: 1, xDensity: 72, yDensity: 72 })
  })

  it('ignoriert fremde APP0-Segmente', () => {
    // Exif-APP0 statt JFIF: eigenes JFIF-Segment wird ergänzt, Exif bleibt erhalten
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x65, 0x78, 0x69, 0x66, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9,
    ])
    const patched = withDpi(jpeg, 300)
    expect(readJfif(patched)).toEqual({ units: 1, xDensity: 300, yDensity: 300 })
    expect(patched.length).toBe(jpeg.length + 18)
    // Das eigene 18-Byte-Segment steht direkt hinter SOI, danach folgt das Exif-Segment.
    expect(patched.subarray(20, 25)).toEqual(new Uint8Array([0xff, 0xe0, 0x00, 0x10, 0x65]))
  })

  it('liest Bildmaße aus dem SOF-Marker', () => {
    expect(imageJpegSize(makeJpeg(true))).toEqual({ width: 16, height: 12 })
  })

  it('wirft bei kaputten Daten', () => {
    expect(() => imageJpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow()
  })
})

describe('PDF-Generator', () => {
  const jpeg = makeJpeg(true, 300)
  const decoder = new TextDecoder('latin1')

  it('erzeugt eine strukturell gültige Datei', () => {
    const pdf = new PdfBuilder(210, 297).addPage().build()
    const text = decoder.decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.endsWith('%%EOF\n')).toBe(true)
    expect(text).toContain('/Type/Catalog')
    expect(text).toContain('/MediaBox[0 0 595.276 841.890]')
  })

  it('hält die xref-Offsets gültig', () => {
    const pdf = new PdfBuilder(148, 210)
      .addPage()
      .image({ jpeg, widthMm: 35, heightMm: 45, xMm: 10, yMm: 10 })
      .text({ xMm: 10, yMm: 5, text: 'Hallo', sizePt: 8, gray: 0.2 })
      .build({ jpeg, widthMm: 35, heightMm: 45, xMm: 0, yMm: 0 })
    const text = decoder.decode(pdf)

    const xrefStart = text.indexOf('xref')
    expect(xrefStart).toBeGreaterThan(0)
    // Der erste xref-Eintrag ist der reservierte freie Eintrag (Objekt 0) und
    // wird nicht mitgezählt – die `n`-Einträge beginnen bei Objekt 1.
    const entries = [...text.slice(xrefStart).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]))
    expect(entries.length).toBeGreaterThan(4)

    entries.forEach((offset, index) => {
      const objectNumber = index + 1
      expect(text.startsWith(`${objectNumber} 0 obj`, offset), `Objekt ${objectNumber}`).toBe(true)
    })
    expect(text).toContain('/Filter/DCTDecode')
    expect(text).toContain('startxref')
  })

  it('rechnet Millimeter exakt in Punkte um', () => {
    const pdf = new PdfBuilder(25.4, 12.7).addPage().build()
    // 25,4 mm = 72 pt, 12,7 mm = 36 pt
    expect(decoder.decode(pdf)).toContain('/MediaBox[0 0 72 36]')
  })

  it('verwendet für jede Seite ein eigenes Seitenobjekt', () => {
    const pdf = new PdfBuilder(210, 297).addPage().addPage().addPage().build()
    const text = decoder.decode(pdf)
    // Ohne Bild beginnen die Seitenobjekte bei 3 und liegen je zwei Object auseinander.
    expect(text).toContain('/Kids[3 0 R 5 0 R 7 0 R]/Count 3')
    expect(text.match(/\/Type\/Page[^s]/g)).toHaveLength(3)
  })

  it('nummeriert Seitenobjekte hinter dem Bildobjekt, wenn ein Bild eingebettet ist', () => {
    const anchor = { jpeg, widthMm: 35, heightMm: 45, xMm: 0, yMm: 0 }
    const pdf = new PdfBuilder(210, 297).addPage().addPage().build(anchor)
    const text = decoder.decode(pdf)
    expect(text).toContain('/Kids[5 0 R 7 0 R]/Count 2')
  })

  test.each([
    ['Klammer (', '\\('],
    ['Klammer )', '\\)'],
    ['Backslash \\', '\\\\'],
  ])('maskiert %s im Text', (input, expected) => {
    const pdf = new PdfBuilder(100, 100).addPage().text({ xMm: 5, yMm: 5, text: input, sizePt: 8, gray: 0 }).build()
    expect(decoder.decode(pdf)).toContain(expected)
  })

  it('ersetzt Zeichen außerhalb von WinAnsi', () => {
    const pdf = new PdfBuilder(100, 100).addPage().text({ xMm: 5, yMm: 5, text: '日本', sizePt: 8, gray: 0 }).build()
    expect(decoder.decode(pdf)).toContain('(??) Tj')
  })

  test.each([
    [35, 45],
    [50.8, 50.8],
  ])('skaliert die Bildplatzierung auf %s x %s mm exakt', (widthMm, heightMm) => {
    const anchor = { jpeg, widthMm, heightMm, xMm: 0, yMm: 0 }
    const pdf = new PdfBuilder(210, 297).addPage().image(anchor).build(anchor)
    const placement = decoder.decode(pdf).match(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/)
    expect(placement).not.toBeNull()
    expect(Number(placement![1])).toBeCloseTo(widthMm * (72 / 25.4), 2)
    expect(Number(placement![2])).toBeCloseTo(heightMm * (72 / 25.4), 2)
  })

  it('rechnet A4 in Punkte um', () => {
    const pdf = new PdfBuilder(210, 297).addPage().build()
    expect(decoder.decode(pdf)).toContain('/MediaBox[0 0 595.276 841.890]')
  })

  it('platziert mehrere Bilder auf einer Seite mit eigenen Transformationen', () => {
    const anchor = { jpeg, widthMm: 35, heightMm: 45, xMm: 0, yMm: 0 }
    const pdf = new PdfBuilder(210, 297)
      .addPage()
      .image(anchor)
      .image({ ...anchor, xMm: 40 })
      .image({ ...anchor, yMm: 60 })
      .build(anchor)
    const text = decoder.decode(pdf)
    expect(text.match(/\/Im1 Do/g)).toHaveLength(3)
  })

  it('teilt ein JPEG unverändert in den Stream', () => {
    const anchor = { jpeg, widthMm: 35, heightMm: 45, xMm: 0, yMm: 0 }
    const pdf = new PdfBuilder(210, 297).addPage().image(anchor).build(anchor)
    const text = decoder.decode(pdf)
    expect(text).toContain(`/Length ${jpeg.length}>>`)
  })

  it('erlaubt Zeichnen und Text ohne Bild', () => {
    const pdf = new PdfBuilder(100, 100)
      .addPage()
      .line({ x1Mm: 0, y1Mm: 0, x2Mm: 10, y2Mm: 10, widthPt: 0.2, gray: 0 })
      .text({ xMm: 1, yMm: 1, text: 'x', sizePt: 6, gray: 0 })
      .build()
    const text = decoder.decode(pdf)
    expect(text).toContain(' l S')
    expect(text).toContain('Tj')
    expect(text).not.toContain('/Im1 Do')
  })
})