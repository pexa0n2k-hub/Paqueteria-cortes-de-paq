const C="corte-paquetes-v1-28-3-2";
const A=["./","./index.html","./style.css","./app.js?v=1.13","./manifest.webmanifest"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(A)))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(C).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});