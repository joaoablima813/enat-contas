/* Funcionamento sem rede: a app abre a partir da cópia guardada quando não há ligação.
   Com rede, vai sempre buscar a versão mais recente (primeiro a rede, depois a cópia). Os dados (/api) nunca ficam em cache. */
const CACHE = 'enat-app-v9';
const SHELL = ['/', '/enat-logo.png', '/manifest.json', '/quotes.css', '/app.css', '/sync.js', '/gestao.js', '/contabilista.js', '/quote-math.js', '/quote-obra.js', '/price-tables.js', '/quotes.js', '/leads.js', '/push.js', '/agenda.js', '/pv-sizing.js', '/pv.js', '/excel-export.js', '/vendor/jspdf.umd.min.js', '/vendor/jspdf.plugin.autotable.min.js', '/vendor/exceljs.min.js', '/apple-touch-icon.png', '/favicon-32x32.png', '/pwa-192x192.png'];

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
  if (own && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/proposta/') || url.pathname.startsWith('/.netlify/'))) return;
  if (!own && url.hostname !== 'esm.sh') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('/') : Response.error())));
});
// Notificações push enviadas pelo servidor: aparecem mesmo com a app fechada.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Enat app', {
    body: d.body || '', tag: d.tag || undefined, data: d.data || {}, icon: '/pwa-192x192.png', badge: '/favicon-32x32.png',
    requireInteraction: !!(d.data && d.data.lead), renotify: !!d.tag,
  }));
});
// Tocar numa notificação abre a app na lead ou no orçamento (ou foca a janela já aberta).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const q = data.lead ? '/?lead=' + encodeURIComponent(data.lead) : data.quote ? '/?orc=' + encodeURIComponent(data.quote) : '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list[0];
    if (c) { c.postMessage(data); return c.focus(); }
    return self.clients.openWindow(q);
  }));
});
