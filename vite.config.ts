import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/**
 * Öffentlicher Basis-Pfad. Die App liegt als Unterordner `/passfoto/` im
 * Repository SDApp und wird über GitHub Pages unter diesem Pfad ausgeliefert.
 * Für lokale Tests in der Wurzel: `BASE_PATH=/ npm run dev`.
 */
const BASE_PATH = process.env.BASE_PATH ?? '/passfoto/'

/** Dateien, die Vite aus `public/` kopiert und die offline verfügbar sein sollen. */
const PUBLIC_ASSETS = [
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
]

/** Schreibt den Service Worker mit der Liste der gebauten Assets. */
function pwaServiceWorker(): Plugin {
  const root = process.cwd()
  return {
    name: 'passfoto-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const withBase = (file: string) => `${BASE_PATH}${file}`.replace(/\/{2,}/g, '/')
      const built = Object.keys(bundle).map(withBase)
      const version = Date.now().toString(36)
      const precache = [
        withBase(''),
        withBase('index.html'),
        ...PUBLIC_ASSETS.map(withBase),
        ...built.filter((file) => !file.endsWith('.map')),
      ]
      const template = readFileSync(resolve(root, 'pwa', 'sw-template.js'), 'utf8')
      const source = template
        .replaceAll('__VERSION__', version)
        .replaceAll('__BASE__', BASE_PATH)
        .replaceAll('__PRECACHE__', JSON.stringify([...new Set(precache)], null, 2))
      if (/__(VERSION|BASE|PRECACHE)__/.test(source)) {
        this.error('Service-Worker-Vorlage: Platzhalter wurden nicht ersetzt.')
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/** Erlaubt Tunnel- und LAN-Hostnamen für `vite dev` und `vite preview` (z. B. *.trycloudflare.com). */
const ALLOWED_HOSTS = ['.trycloudflare.com', '.localhost']

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss(), pwaServiceWorker()],
  server: {
    allowedHosts: ALLOWED_HOSTS,
  },
  preview: {
    allowedHosts: ALLOWED_HOSTS,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})