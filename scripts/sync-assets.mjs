/*
 * Passfoto Studio - Modelldateien in die Arbeitskopie holen.
 *
 * Die MediaPipe-Modelle und -WASM-Dateien (zusammen rund 52 MB) sind im
 * Repository nur einmal eingecheckt: im fertigen Stand unter passfoto/models
 * bzw. passfoto/mediapipe. Im Quellcode-Ordner passfoto/source/public fehlen
 * sie, damit sie nicht doppelt im Repository liegen. Dieses Skript kopiert sie
 * von dort nach public/, damit `npm run build` sie mit in das Ergebnis
 * uebernimmt.
 *
 * Aufruf: npm run sync:assets
 */

import { access, cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FOLDERS = ['models', 'mediapipe']
const TARGET_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Ordner von public/ aus nach oben, in denen die Modelle liegen koennen. */
function searchRoots() {
  const roots = []
  let current = resolve(TARGET_ROOT, '..', '..')
  for (let step = 0; step < 4; step += 1) {
    roots.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return roots
}

for (const folder of FOLDERS) {
  const target = join(TARGET_ROOT, folder)
  if (await exists(target)) {
    console.log(`${folder}: liegt bereits in public/`)
    continue
  }

  let source
  for (const root of searchRoots()) {
    const candidate = join(root, folder)
    if (await exists(candidate)) {
      source = candidate
      break
    }
  }

  if (!source) {
    console.error(`${folder}: nicht gefunden. Erwartet wird der Ordner neben public/.`)
    process.exitCode = 1
    continue
  }

  await mkdir(target, { recursive: true })
  await cp(source, target, { recursive: true })
  const entries = await readdir(target, { recursive: true, withFileTypes: true })
  const count = entries.filter((entry) => entry.isFile()).length
  console.log(`${folder}: ${count} Dateien aus ${source} kopiert`)
}
