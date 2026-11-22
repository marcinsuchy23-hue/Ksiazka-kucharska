const CACHE='moja-kuchnia-v63';
const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./tesseract.min.js','./worker.min.js','./tesseract-core-lstm.wasm.js','./tesseract-core-lstm.wasm','./pol.traineddata.gz'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;if (event.request.mode === 'navigate') {
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(async response => {
    if (!response.ok) return response;
    const cache = await caches.open(CACHE).catch(()=>null);
    await cache?.put(event.request,response.clone()).catch(()=>{});
    return response;
  }).catch(async () => (await caches.match(event.request)) || (await caches.match('./index.html')) || Response.error()));
  return;
}
event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok&&new URL(event.request.url).origin===location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match('./index.html'))))});
