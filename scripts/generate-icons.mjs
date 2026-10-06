// Erzeugt die PWA-Icons ohne externe Abhängigkeiten (reines zlib + PNG-Container).
// Aufruf: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [15, 23, 42, 255]
const ACCENT = [45, 212, 191, 255]
const SKIN = [226, 232, 240, 255]

function blend(target, offset, color, alpha) {
  for (let i = 0; i < 3; i += 1) {
    target[offset + i] = Math.round(target[offset + i] * (1 - alpha) + color[i] * alpha)
  }
  target[offset + 3] = Math.round(target[offset + 3] * (1 - alpha) + color[3] * alpha)
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const inCorner =
        (x < radius && y < radius && Math.hypot(radius - x, radius - y) > radius) ||
        (x > size - radius && y < radius && Math.hypot(x - (size - radius), radius - y) > radius) ||
        (x < radius && y > size - radius && Math.hypot(radius - x, y - (size - radius)) > radius) ||
        (x > size - radius &&
          y > size - radius &&
          Math.hypot(x - (size - radius), y - (size - radius)) > radius)
      if (!inCorner) rgba.set(BG, offset)
    }
  }

  const frameInset = size * 0.14
  const frameSize = size - frameInset * 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const onFrame =
        x >= frameInset &&
        x <= size - frameInset &&
        y >= frameInset &&
        y <= size - frameInset &&
        (x < frameInset + 4 || x > size - frameInset - 4 || y < frameInset + 4 || y > size - frameInset - 4)
      if (onFrame) blend(rgba, (y * size + x) * 4, ACCENT, 1)
    }
  }

  const headCx = size / 2
  const headCy = size * 0.44
  const headR = size * 0.17
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - headCx, y - headCy)
      if (distance < headR) blend(rgba, (y * size + x) * 4, SKIN, 1)
    }
  }

  const shoulderTop = headCy + headR * 0.92
  const shoulderCx = headCx
  const shoulderRx = size * 0.3
  const shoulderRy = size * 0.28
  for (let y = Math.floor(shoulderTop); y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - shoulderCx) / shoulderRx
      const ny = (y - (shoulderTop + shoulderRy)) / shoulderRy
      if (nx * nx + ny * ny <= 1 && y > shoulderTop) blend(rgba, (y * size + x) * 4, SKIN, 1)
    }
  }

  const eyeR = size * 0.017
  for (const side of [-1, 1]) {
    const ex = headCx + side * headR * 0.42
    const ey = headCy - headR * 0.1
    for (let y = Math.floor(ey - eyeR); y <= ey + eyeR; y += 1) {
      for (let x = Math.floor(ex - eyeR); x <= ex + eyeR; x += 1) {
        if (Math.hypot(x - ex, y - ey) <= eyeR) blend(rgba, (y * size + x) * 4, BG, 1)
      }
    }
  }

  void frameSize
  return encodePng(size, size, rgba)
}

for (const size of [192, 512]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), drawIcon(size))
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f172a"/>
  <rect x="9" y="9" width="46" height="46" rx="6" fill="none" stroke="#2dd4bf" stroke-width="3"/>
  <circle cx="32" cy="28" r="11" fill="#e2e8f0"/>
  <path d="M32 40c-9 0-16 6-17 14h34c-1-8-8-14-17-14z" fill="#e2e8f0"/>
  <circle cx="27.5" cy="27" r="1.6" fill="#0f172a"/>
  <circle cx="36.5" cy="27" r="1.6" fill="#0f172a"/>
</svg>
`
writeFileSync(resolve(here, '..', 'public', 'favicon.svg'), svg)

console.log('Icons geschrieben:', outDir)