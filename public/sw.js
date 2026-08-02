// Fluent service worker — app-shell cache for offline + instant loads.
// Bump SHELL_CACHE on every release that must invalidate clients.
const SHELL_CACHE = 'fluent-v6'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Never intercept API calls or cross-origin requests
  if (url.origin !== location.origin) return
  if (e.request.method !== 'GET') return

  // Hashed build assets are immutable → cache-first is safe (filename changes on rebuild)
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy))
            return res
          }),
      ),
    )
    return
  }

  // Everything else (crucially index.html): network-first so a deploy is picked up
  // immediately; cache is only a fallback for genuine offline use.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  )
})
