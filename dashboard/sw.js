// QAPi Service Worker — safe caching that avoids streaming traps
// Strategy:
//   • Static shell (HTML/CSS/JS/fonts) → cache-first, update in background
//   • API calls (/api/*, /auth/*, /modules/*, /audit/*, /metrics/*) → network-only
//     (never cache streaming or dynamic responses)

const CACHE_VERSION = 'qapi-v1';
const STATIC_SHELL = [
  '/',
  '/index.html',
  '/signup.html',
  '/docs.html',
];

// Prefixes that belong to the Vercel Brain or core API — always pass through
const API_PREFIXES = ['/api/', '/auth/', '/modules/', '/audit/', '/metrics/'];

function isApiRequest(url) {
  const { pathname } = new URL(url);
  return API_PREFIXES.some((p) => pathname.startsWith(p));
}

// ── Install: pre-cache the static shell ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up stale caches ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route requests to the right strategy ──────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET/HEAD — let POST/PUT/DELETE go straight to network
  if (request.method !== 'GET' && request.method !== 'HEAD') return;

  // API / streaming endpoints → network-only (no caching, no interception)
  if (isApiRequest(request.url)) {
    // Simply do not call event.respondWith(); the browser handles it natively
    return;
  }

  // External resources (CDN, fonts) → network-first with cache fallback
  if (!request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Same-origin static assets → stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached); // fall back to stale cache if network fails
        // Return cached copy immediately and update in the background
        return cached || networkFetch;
      })
    )
  );
});
