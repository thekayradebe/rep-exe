// REP.exe offline cache. Network first (so updates arrive), cache as fallback (so the gym-floor works offline).
const CACHE = 'repexe-v6';
const V = '6';
const SHELL = ['./', 'index.html', `css/styles.css?v=${V}`, `js/app.js?v=${V}`, `js/model.js?v=${V}`, `js/plan.js?v=${V}`, `js/sync.js?v=${V}`, 'manifest.webmanifest', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // always revalidate so files never mix versions
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
