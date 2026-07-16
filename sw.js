const CACHE_NAME = "jeonjeokmon-shell-20260716-backlog-finish";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/js/diagnostics.js",
  "/js/format.js",
  "/js/store.js",
  "/js/lookups.js",
  "/js/catalog.js",
  "/js/status.js",
  "/js/persistence.js",
  "/js/data-io.js",
  "/js/docx-export.js",
  "/js/share-image.js",
  "/js/card-effects.js",
  "/js/deck-import.js",
  "/js/stats.js",
  "/js/deck.js",
  "/js/cloud.js",
  "/js/calendar.js",
  "/js/views-stats.js",
  "/js/views-settings.js",
  "/js/views-tournaments.js",
  "/js/views-matches.js",
  "/js/views-home.js",
  "/js/views-decks.js",
  "/js/views-modals.js",
  "/js/controller.js",
  "/app.js",
  "/manifest.webmanifest",
  "/icon-d-cardback.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("/index.html");
        return Response.error();
      })
  );
});
