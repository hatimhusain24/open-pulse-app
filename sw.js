// Open Pulse service worker.
// Offline: always try the network first and keep a copy of each answer, so the last data
// can still be shown when the device is offline.
// Background alerts: shows the push notifications the alert server sends.
const CACHE = 'open-pulse-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
// Large or endless resources that are not worth keeping offline.
const SKIP = /tile\.openstreetmap\.org|fonts\.gstatic\.com|coin-images\.coingecko\.com|upload\.wikimedia\.org|archive-api\.open-meteo\.com|flagcdn\.com|thespacedevs/;
const MAX_ENTRIES = 250;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || !/^https?:$/.test(url.protocol) || SKIP.test(req.url)) return;
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) return; // our own server: never serve stale answers
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(async c => { await c.put(req, copy); await trim(c); }));
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreVary: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Open Pulse', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => c.url.startsWith(self.registration.scope));
    if (win) { win.navigate(target).catch(() => {}); return win.focus(); }
    return self.clients.openWindow(target);
  }));
});
