// Simple versioned service worker: network first (so a new deploy always wins), cache as offline fallback.
// Same origin as the frozen v1 archive (/tamagotchi-elon-man-v1/, caches "tem-v1-proto-*"):
// this worker only ever deletes its OWN old caches (tem-v1, tem-v2, older tem-2.x).
const VERSION = 'tem-2.0.1';
const OWN_OLD = (k) => /^tem-v\d+$/.test(k) || (k.startsWith('tem-2.') && k !== VERSION);
const CORE = ['./', 'index.html', 'src/main.js', 'src/logic.js', 'src/oled.js', 'src/servo.js', 'src/audio.js', 'src/voice.js', 'src/storage.js',
  'src/brain/demo.js', 'src/brain/gateway.js', 'src/scenes/GameScene.js', 'src/ui/icons.js', 'src/ui/robot.js', 'src/ui/chat.js',
  'vendor/phaser.min.js', 'vendor/motion.js',
  'fonts/PressStart2P.woff2', 'fonts/Rubik-var.woff2', 'fonts/ChakraPetch-700.woff2', 'fonts/JetBrainsMono-500.woff2', 'manifest.webmanifest', 'assets/icon-192.png',
  'assets/music/theme.ogg', 'assets/music/theme.mp3'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter(OWN_OLD).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
