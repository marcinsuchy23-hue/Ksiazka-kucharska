const CACHE = 'moja-kuchnia-v112';
const OCR_CACHE = 'moja-kuchnia-ocr-v1';
const path = file => new URL(file,self.registration.scope).href;
const INDEX = path('index.html');
const SHELL = new Set([
  INDEX, path('manifest.webmanifest'), path('icon.svg'), path('icon-192.png'),
  path('icon-512.png'), path('apple-touch-icon.png'), path('recipe-link-import.js?v=104'),
  path('cookbook-storage.js?v=105'), path('chatgpt-recipe-import.js?v=110')
]);
const OCR = new Set([
  path('tesseract.min.js'), path('worker.min.js'), path('tesseract-core-lstm.wasm.js'), path('pol.traineddata.gz')
]);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names = await caches.keys();
    if (!names.includes(OCR_CACHE)) {
      const previous = ['moja-kuchnia-v91','moja-kuchnia-v90'].find(name=>names.includes(name));
      if (previous) {
        const oldCache = await caches.open(previous);
        const newCache = await caches.open(OCR_CACHE);
        for (const file of OCR) {
          const saved = await oldCache.match(file);
          if (saved) await newCache.put(file,saved).catch(()=>{});
        }
      }
    }
    await Promise.all(names
      .filter(name=>/^moja-kuchnia-(?:ocr-)?v\d+$/.test(name) && name!==CACHE && name!==OCR_CACHE)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigate(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request,{cache:'no-cache'});
    if (response.ok) await cache.put(INDEX,response.clone()).catch(()=>{});
    return response;
  } catch {
    return await cache.match(INDEX) || Response.error();
  }
}

async function loadAsset(event,cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));
  return response;
}

self.addEventListener('fetch',event=>{
  const {request} = event;
  if (request.method!=='GET') return;
  const url = new URL(request.url);
  if (url.origin!==self.location.origin) return;
  if (request.mode==='navigate') {
    url.search = '';
    if (url.href===self.registration.scope || url.href===INDEX) event.respondWith(navigate(request));
    return;
  }
  if (SHELL.has(url.href)) event.respondWith(loadAsset(event,CACHE));
  else if (OCR.has(url.href)) event.respondWith(loadAsset(event,OCR_CACHE));
});
