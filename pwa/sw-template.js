/*
 * Passfoto Studio - Service Worker.
 * Die Platzhalter in diesem File werden beim Build durch ein Vite-Plugin
 * ersetzt: der Versions-Hash, der Basis-Pfad und die Liste der gebauten Assets.
 */

const VERSION = '__VERSION__'
const BASE = '__BASE__'
const APP_SHELL = `${BASE}index.html`
const SHELL_CACHE = `passfoto-shell-${VERSION}`
const LARGE_CACHE = 'passfoto-large'

const SHELL_ASSETS = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith('passfoto-shell-') && key !== SHELL_CACHE) ||
                key.startsWith('sd-passfoto-'),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isLargeAsset(url) {
  return url.pathname.includes('/models/') || url.pathname.includes('/mediapipe/')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(APP_SHELL, copy))
          return response
        })
        .catch(() => caches.match(APP_SHELL).then((cached) => cached ?? Response.error())),
    )
    return
  }

  if (isLargeAsset(url)) {
    event.respondWith(
      caches.open(LARGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
          .catch(() => cached ?? Response.error())
        return cached ?? network
      }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && SHELL_ASSETS.includes(url.pathname)) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached ?? Response.error())
      return cached ?? network
    }),
  )
})