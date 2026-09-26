// Bump VERSION whenever any cached file changes; the new worker installs a
// complete, separate cache and the page offers a reload to switch over.
const VERSION = '7';
const CACHE_PREFIX = 'nanajo-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// Every file the app can load. Precaching all of them (module code included)
// keeps each version self-consistent offline. Add new files here.
const SHELL = [
  './',
  'manifest.webmanifest',
  'styles/app.css',
  'assets/brand/logo.jpg',
  'assets/fonts/OFL.txt',
  'assets/fonts/gowun-batang.ttf.z',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'src/main.js',
  'src/app/app.js',
  'src/app/config.js',
  'src/app/errors.js',
  'src/app/navigation.js',
  'src/app/pwa.js',
  'src/app/registry.js',
  'src/app/state.js',
  'src/app/storage.js',
  'src/app/frames/error.js',
  'src/app/frames/home.js',
  'src/app/frames/loading.js',
  'src/app/frames/module.js',
  'src/app/letters/components/confirmSheet.js',
  'src/app/letters/components/entryCard.js',
  'src/app/letters/components/glyphs.js',
  'src/app/letters/components/photoAttachment.js',
  'src/app/letters/frames/archiveHome.js',
  'src/app/letters/frames/entryEditor.js',
  'src/app/letters/frames/entryViewer.js',
  'src/app/letters/frames/sendPage.js',
  'src/app/letters/frames/sendPreview.js',
  'src/app/letters/frames/settingsPage.js',
  'src/app/letters/index.js',
  'src/app/letters/logic/dates.js',
  'src/app/letters/logic/entries.js',
  'src/app/letters/logic/image.js',
  'src/app/letters/logic/pdf/font.js',
  'src/app/letters/logic/pdf/layout.js',
  'src/app/letters/logic/pdf/preview.js',
  'src/app/letters/logic/pdf/render.js',
  'src/app/letters/logic/pdf/shaper.js',
  'src/app/letters/logic/pdf/writer.js',
  'src/app/letters/logic/pdfExport.js',
  'src/app/letters/logic/photos.js',
  'src/app/letters/logic/storage.js',
  'src/app/modules/archive/entry.js',
  'src/app/modules/archive/index.js',
  'src/app/modules/index.js',
  'src/app/modules/newEntry/entry.js',
  'src/app/modules/newEntry/index.js',
  'src/app/modules/settings/entry.js',
  'src/app/modules/settings/index.js',
  'src/app/ui/backdrop.js',
  'src/app/ui/carousel.js',
  'src/app/ui/dom.js',
  'src/app/ui/icons.js',
  'src/app/ui/list.js',
  'src/app/ui/moduleIcon.js',
  'src/app/ui/motion.js',
  'src/app/ui/notice.js',
  'src/app/ui/pageDots.js',
  'src/app/ui/pageStack.js',
  'src/app/ui/ticker.js',
  'src/app/ui/toast.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `reload` bypasses the HTTP cache so a new version never captures stale files.
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
      // A first install has no running page to disrupt; updates wait for the user.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && isAppPage(url)) {
    event.respondWith(serveShell(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/** Page URLs (not direct links to assets) all render the single-page shell. */
function isAppPage(url) {
  const last = url.pathname.split('/').pop() ?? '';
  return last === '' || last.endsWith('.html') || !last.includes('.');
}

async function serveShell(request) {
  const cached = await caches.match(new URL('./', self.location.href).href, { cacheName: CACHE_NAME });
  return cached ?? fetch(request);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Files missing from SHELL still become available offline after first use.
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}
