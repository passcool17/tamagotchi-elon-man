// Simple versioned service worker: network first (so a new deploy always wins), cache as offline fallback.
const VERSION = 'tem-v1';
const CORE = ['./', 'index.html', 'src/main.js', 'src/logic.js', 'src/face.js', 'src/audio.js', 'src/storage.js',
  'src/scenes/GameScene.js', 'src/ui/icons.js', 'src/ui/robot.js', 'vendor/phaser.min.js',
  'fonts/PressStart2P.woff2', 'fonts/Rubik-var.woff2', 'manifest.webmanifest', 'assets/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)),
  );
});
