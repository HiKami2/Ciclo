// Service worker: abre a app a partir da cópia guardada (rápido, funciona sem rede).
// Quando há uma versão nova, este ficheiro muda: o browser instala-a em segundo plano e a app recarrega sozinha.
// Nunca guarda dados nem pedidos ao GitHub.
const CACHE = "eciclo-v28";
const FILES = ["./", "index.html", "app.css", "app.js", "importer.js", "xlsx.js", "theme.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === "navigate" ? await c.match("index.html") : null);
    if (hit) return hit;
    try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
    catch (_) { return (await c.match("index.html")) || Response.error(); }
  }));
});
