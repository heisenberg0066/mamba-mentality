const VERSION = '4.1.0';
const CACHE = 'mamba-v' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=' + VERSION,
  './js/i18n.js?v=' + VERSION,
  './js/i18n-v2.js?v=' + VERSION,
  './js/data.js?v=' + VERSION,
  './js/storage.js?v=' + VERSION,
  './js/ics.js?v=' + VERSION,
  './js/prayertimes.js?v=' + VERSION,
  './js/planner.js?v=' + VERSION,
  './js/core.js?v=' + VERSION,
  './js/calendar.js?v=' + VERSION,
  './js/items.js?v=' + VERSION,
  './js/tabs-study.js?v=' + VERSION,
  './js/notes.js?v=' + VERSION,
  './js/tabs-life.js?v=' + VERSION,
  './fonts/Wnz6HAc5bAfYB2Q7YjYYiAzcPDKo.woff2',
  './fonts/Wnz6HAc5bAfYB2Q7ZjYYiAzcPA.woff2',
  './fonts/Wnz6HAc5bAfYB2Q7aDYYiAzcPDKo.woff2',
  './fonts/Wnz6HAc5bAfYB2Q7azYYiAzcPDKo.woff2',
  './fonts/WwkYxPW1E165rajQKDulKDwNQNAY2f34Fdj3cQ.woff2',
  './fonts/WwkYxPW1E165rajQKDulKDwNQNUY2f34Fdg.woff2',
  './fonts/WwkYxPW1E165rajQKDulKDwNQNsY2f34Fdj3cQ.woff2',
  './fonts/WwkbxPW1E165rajQKDulIIIoVfg61NfCHA.woff2',
  './fonts/WwkbxPW1E165rajQKDulIIcoVfg61Nc.woff2',
  './fonts/WwkbxPW1E165rajQKDulIIkoVfg61NfCHA.woff2',
  './fonts/fonts.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return navigator.onLine === false ? (cached || fetched) : fetched.then((r) => r || cached);
    })
  );
});
