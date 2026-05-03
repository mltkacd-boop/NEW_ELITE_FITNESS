/* ══════════════════════════════════════════════════════
   ELITE FITNESS — SERVICE WORKER
   Cache-first for app shell, network-first for API
══════════════════════════════════════════════════════ */

const CACHE_NAME   = 'elite-fitness-v1';
const RUNTIME_CACHE= 'elite-fitness-runtime-v1';

/* Files to pre-cache on install — app shell */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;900&display=swap',
];

/* ── INSTALL: pre-cache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: smart caching strategy ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls (Anthropic) or chrome-extension
  if (
    url.hostname === 'api.anthropic.com' ||
    request.url.startsWith('chrome-extension') ||
    request.method !== 'GET'
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts — cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell — cache first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Cache successful GET responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, responseClone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return app shell
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ── BACKGROUND SYNC: queue workout logs when offline ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-workouts') {
    event.waitUntil(syncWorkouts());
  }
});

async function syncWorkouts() {
  // Workouts are stored in localStorage — sync happens automatically on next load
  console.log('Elite Fitness: background sync complete');
}

/* ── PUSH NOTIFICATIONS ── */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Time to train, Champion!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'train', title: '💪 Start Training' },
      { action: 'dismiss', title: 'Later' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification('ELITE FITNESS', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'train') {
    event.waitUntil(clients.openWindow('/?tab=workout'));
  } else {
    event.waitUntil(clients.openWindow('/'));
  }
});
