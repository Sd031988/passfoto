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

export async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/png')
  return new Uint8Array(await blob.arrayBuffer())
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