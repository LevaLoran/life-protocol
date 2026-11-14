const CACHE='form-b013';
const ASSETS=['./','./index.html','./app.js','./style.css','./extras.js','./auth.js','./upload.js','./sync.js','./config.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
// версионированные библиотеки с CDN: кэшируем, чтобы проверка входа работала офлайн
const CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).then(()=>c.add(new Request(CDN,{mode:'no-cors'})).catch(()=>{}))));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('life-protocol-')||k.startsWith('form-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  // CDN-скрипты с точной версией в адресе не меняются: сначала кэш
  if(url.hostname==='cdn.jsdelivr.net'&&/@\d+\.\d+\.\d+\//.test(url.pathname)){
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res})));
    return;
  }
  // API Supabase, OAuth и прочие чужие запросы никогда не перехватываются
  if(url.origin!==self.location.origin)return;
  // network-first: при сети всегда свежая версия, офлайн — из кэша
  e.respondWith(
    fetch(req).then(res=>{
      if(res&&res.ok&&!/[?&](code|error)=/.test(url.search)){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}
      return res;
    }).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):Response.error())))
  );
});
