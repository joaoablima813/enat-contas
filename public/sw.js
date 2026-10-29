/* Funcionamento sem rede: a app abre a partir da cópia guardada quando não há ligação.
   Com rede, vai sempre buscar a versão mais recente (primeiro a rede, depois a cópia). Os dados (/api) nunca ficam em cache. */
const CACHE = 'enat-app-v1';
const SHELL = ['/', '/enat-logo.png', '/manifest.json', '/quotes.css', '/app.css', '/sync.js', '/gestao.js', '/contabilista.js', '/quote-math.js', '/price-tables.js', '/quotes.js', '/pv-sizing.js', '/pv.js', '/excel-export.js', '/vendor/jspdf.umd.min.js', '/vendor/jspdf.plugin.autotable.min.js', '/vendor/exceljs.min.js', '/apple-touch-icon.png', '/favicon-32x32.png', '/pwa-192x192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const own = url.origin === self.location.origin;
  if (own && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/'))) return;
  if (!own && url.hostname !== 'esm.sh') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('/') : Response.error())));
});
