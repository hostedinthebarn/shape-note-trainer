// Service worker (SW-51), filled in by build.mjs: CACHE carries a hash of everything published,
// FILES the exact list. Cache-first for those files, so the app opens with no network.
// No skipWaiting/clients.claim: a new version waits until every tab of the old one is closed, so a
// running page never mixes deploys (the audio worklet and detector worker load lazily, and must
// come from the same cache as the page that loads them). The next launch picks up the update.
const CACHE = "sing-the-shapes-__VERSION__";
const FILES = __FILES__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = url.pathname.endsWith("/") ? "./" : e.request;
  e.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
