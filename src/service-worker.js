const BUILD_VERSION = "__BUILD_VERSION__";
const CACHE_PREFIX = "incoc-south-";
const SHELL_CACHE = `${CACHE_PREFIX}${BUILD_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_PREFIX}${BUILD_VERSION}-assets`;
const FONT_CACHE = `${CACHE_PREFIX}${BUILD_VERSION}-fonts`;
const MAX_ASSETS = 100;
const MAX_PRECACHE_ASSETS = 50;
const MAX_PRECACHE_BYTES = 25 * 1024 * 1024;
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const MAX_FONT_ASSETS = 30;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/incoc-mark.svg",
  "/incoc-icon-192.png",
  "/incoc-icon-512.png",
  "/incoc-icon-maskable-192.png",
  "/incoc-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.all(APP_SHELL.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.ok) await shell.put(url, response);
      } catch {
        // A failed optional precache entry should not prevent the worker installing.
      }
    }));

    try {
      const response = await fetch("/asset-manifest.json", { cache: "no-cache" });
      if (!response.ok) return;
      const manifest = await response.json();
      const files = new Set();
      const visited = new Set();
      function addStaticDependencies(key) {
        if (visited.has(key)) return;
        visited.add(key);
        const entry = manifest[key];
        if (!entry || typeof entry !== "object") return;
        if (typeof entry.file === "string" && /\.(?:js|css)$/i.test(entry.file)) files.add(`/${entry.file}`);
        for (const file of entry.css ?? []) {
          if (typeof file === "string") files.add(`/${file}`);
        }
        for (const imported of entry.imports ?? []) addStaticDependencies(imported);
      }
      for (const [key, entry] of Object.entries(manifest)) {
        if (entry && typeof entry === "object" && entry.isEntry) addStaticDependencies(key);
      }
      if (!files.size) {
        for (const entry of Object.values(manifest)) {
          if (entry && typeof entry === "object") {
            if (typeof entry.file === "string" && /\.(?:js|css)$/i.test(entry.file)) files.add(`/${entry.file}`);
            for (const file of entry.css ?? []) {
              if (typeof file === "string") files.add(`/${file}`);
            }
          }
        }
      }

      const assets = await caches.open(ASSET_CACHE);
      let totalBytes = 0;
      for (const url of files) {
        if (totalBytes >= MAX_PRECACHE_BYTES || (await assets.keys()).length >= MAX_PRECACHE_ASSETS) break;
        try {
          const asset = await fetch(url, { cache: "no-cache" });
          const size = Number(asset.headers.get("content-length") ?? 0);
          let actualSize = size;
          if (asset.ok && !actualSize) {
            const body = await asset.clone().blob();
            actualSize = body.size;
          }
          if (asset.ok && actualSize <= MAX_ASSET_BYTES
            && totalBytes + actualSize <= MAX_PRECACHE_BYTES) {
            await assets.put(url, asset);
            totalBytes += actualSize;
          }
        } catch {
          // A failed precache entry remains available through the normal online fetch path.
        }
      }
      await trimCache(assets, MAX_ASSETS);
    } catch {
      // The application shell is still usable if the optional build manifest is unavailable.
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/auth/")
      || url.pathname.startsWith("/account/")) return;

    if (request.mode === "navigate") {
      event.respondWith((async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const shell = await caches.open(SHELL_CACHE);
            await shell.put("/", response.clone());
          }
          return response;
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          return await shell.match("/") ?? new Response(
            "<!doctype html><meta name=\"viewport\" content=\"width=device-width\"><title>INCOC South</title><p>You are offline. Open a page you have previously loaded after reconnecting.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })());
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      event.respondWith((async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const size = Number(response.headers.get("content-length") ?? 0);
          let actualSize = size;
          if (!actualSize) actualSize = (await response.clone().blob()).size;
          if (actualSize <= MAX_ASSET_BYTES) await cache.put(request, response.clone());
          await trimCache(cache, MAX_ASSETS);
        }
        return response;
      })());
    }
    if (APP_SHELL.includes(url.pathname) && url.pathname !== "/") {
      event.respondWith((async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(url.pathname, response.clone());
          return response;
        } catch {
          return Response.error();
        }
      })());
    }
    return;
  }

  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") {
          await cache.put(request, response.clone());
          await trimCache(cache, MAX_FONT_ASSETS);
        }
        return response;
      } catch {
        return await cache.match(request) ?? Response.error();
      }
    })());
    return;
  }

});
