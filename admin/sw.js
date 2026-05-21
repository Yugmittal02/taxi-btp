const CACHE_NAME = "admin-v4";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./admin.js",
  "./admin-style.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "../style.css",
  "../firebase-service.js",
  "../favicon.svg",
  "../assets/car-5seater.png",
  "../assets/hero-car.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && request.method === "GET") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === "GET") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cache.match(request) || cache.match("./index.html");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isFirebaseModule = url.hostname === "www.gstatic.com" && url.pathname.includes("/firebasejs/");
  const isAdminNavigation = request.mode === "navigate";

  if (isAdminNavigation) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isFirebaseModule || url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});
