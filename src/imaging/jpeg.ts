/**
 * Setzt die Auflösungsangabe (dpi) in einen JPEG-Datenstrom.
 * Canvas erzeugt JPEG ohne JFIF-Header, dadurch wäre die Datei beim Ausdrucken
 * nicht maßstabsgetreu. Es wird ein APP0-Segment ergänzt oder ein vorhandenes
 * aktualisiert.
 */

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Bild konnte nicht kodiert werden'))
      },
      type,
      quality,
    )
  })
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function writeUint16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >> 8) & 0xff
  bytes[offset + 1] = value & 0xff
}

function findJfifSegment(bytes: Uint8Array): { markerIndex: number; dataIndex: number } | null {
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
    if (marker === 0xda || marker === 0xd9) return null
    const length = readUint16BE(bytes, index + 2)
    const isApp0 = marker === 0xe0
    if (isApp0 && length >= 16) {
      const dataIndex = index + 4
      let matches = true
      for (let i = 0; i < 5; i += 1) {
        const expected = i === 4 ? 0 : 'JFIF'.charCodeAt(i)
        if (bytes[dataIndex + i] !== expected) {
          matches = false
          break
        }
      }
      if (matches) return { markerIndex: index, dataIndex }
    }
    index += 2 + length
  }
  return null
}

function buildJfifSegment(dpi: number): Uint8Array {
  const segment = new Uint8Array(18)
  segment[0] = 0xff
  segment[1] = 0xe0
  writeUint16BE(segment, 2, 16)
  segment[4] = 0x4a // J
  segment[5] = 0x46 // F
  segment[6] = 0x49 // I
  segment[7] = 0x46 // F
  segment[8] = 0x00
  segment[9] = 1 // major version
  segment[10] = 1 // minor version
  segment[11] = 1 // units: dots per inch
  writeUint16BE(segment, 12, Math.round(dpi))
  writeUint16BE(segment, 14, Math.round(dpi))
  segment[16] = 0 // no thumbnail
  segment[17] = 0
  return segment
}

/** Gibt JPEG-Bytes mit korrekter Auflösungsangabe zurück. */
export function withDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  const existing = findJfifSegment(jpeg)
  if (existing) {
    const patched = jpeg.slice()
    patched[existing.dataIndex + 7] = 1 // units = dots per inch
    writeUint16BE(patched, existing.dataIndex + 8, Math.round(dpi))
    writeUint16BE(patched, existing.dataIndex + 10, Math.round(dpi))
    return patched
  }

  const segment = buildJfifSegment(dpi)
  const result = new Uint8Array(jpeg.length + segment.length)
  result.set(jpeg.subarray(0, 2), 0)
  result.set(segment, 2)
  result.set(jpeg.subarray(2), 2 + segment.length)
  return result
}

export async function encodeJpeg(canvas: HTMLCanvasElement, dpi: number, quality: number): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  const buffer = new Uint8Array(await blob.arrayBuffer())
  return withDpi(buffer, dpi)
}

export async function encodePng(canvas: HTMLCanvasElement, dpi?: number): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/png')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return dpi ? withPngDpi(bytes, dpi) : bytes
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

/**
 * Setzt die Auflösung (pHYs-Chunk, Pixel je Meter) in eine PNG-Datei, damit sie
 * maßstabsgetreu gedruckt wird. Ein vorhandener pHYs-Chunk wird ersetzt.
 */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (png.length < 33 || signature.some((b, i) => png[i] !== b)) return png
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  writeUint32BE(chunk, 0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4)
  writeUint32BE(chunk, 8, ppm)
  writeUint32BE(chunk, 12, ppm)
  chunk[16] = 1
  writeUint32BE(chunk, 17, crc32(chunk.subarray(4, 17)))

  const parts: Uint8Array[] = [png.subarray(0, 8)]
  let offset = 8
  let inserted = false
  while (offset + 8 <= png.length) {
    const length = ((png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3]) >>> 0
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7])
    const end = offset + 12 + length
    if (end > png.length) return png
    if (type !== 'pHYs') parts.push(png.subarray(offset, end))
    if (type === 'IHDR' && !inserted) {
      parts.push(chunk)
      inserted = true
    }
    offset = end
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function copyToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || !('write' in navigator.clipboard)) return false
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch {
    return false
  }
}