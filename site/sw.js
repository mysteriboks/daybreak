// Offline shell. Every same-origin GET (page, scripts, styles, fonts, news.json) goes to the network first,
// revalidating with the server (cache: "no-cache") so a fresh deploy shows on the very next open rather than
// after the browser's own 10-minute cache expires. If the network has not answered within NETWORK_WAIT_MS
// and a cached copy exists, the cached copy is shown and the network answer still updates the cache; offline,
// the cached copy is used. Cross-origin requests (publisher images) are untouched.
// (Cache-first was tried on 2026-10-04: pages opened at once, but changes took two or more opens to appear.)
const CACHE = "daybreak-v4";
const NETWORK_WAIT_MS = 2500;
const SHELL = ["./", "index.html", "app.css", "app.js", "lib.js", "fallback.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "fonts/fraunces-latin.woff2", "fonts/public-sans-latin.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const network = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  const cached = () => caches.match(req, { ignoreSearch: true });
  // The stories never take the slow-network shortcut: a cached news.json shown after 2.5 s is the copy from the
  // last visit, which can be days old, and the page (and its refresh button) took it as the latest. On a slow
  // phone connection that made the news look stuck (2026-10-11). It falls back to the cache only when offline.
  if (new URL(req.url).pathname.endsWith("/news.json")) {
    e.respondWith(network.catch(() => cached().then((c) => c ?? Response.error())));
    return;
  }
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS)).then(cached);
  e.respondWith(
    Promise.race([network, slow.then((c) => c ?? network)]).catch(() => cached().then((c) => c ?? Response.error())),
  );
});
