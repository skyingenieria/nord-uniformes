// Service Worker de la NORD ERP (PWA de Flor).
// App-shell cache para que abra sin conexion; la API siempre va a la red.
const CACHE = "nord-erp-v3";
const SHELL = [
  "/erp",
  "/erp.html",
  "/manifest.webmanifest",
  "/nord-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // La API nunca se cachea.
  if (url.pathname.startsWith("/api/")) return;
  if (req.method !== "GET") return;

  // Navegaciones (abrir la app): red primero, cache como respaldo offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("/erp.html", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("/erp.html"))
    );
    return;
  }

  // Recursos del shell: cache primero.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});
