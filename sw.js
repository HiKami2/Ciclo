// Service worker: guarda a app para abrir depressa e sem rede. Nunca guarda dados nem pedidos ao GitHub.
const CACHE = "eciclo-v14";
const FILES = ["./", "index.html", "app.css", "app.js", "theme.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // Rede primeiro, sempre a confirmar com o servidor (ignora a cache do browser); sem rede, usa a cópia guardada.
  e.respondWith(fetch(u.href, { cache: "no-cache", credentials: "same-origin" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
