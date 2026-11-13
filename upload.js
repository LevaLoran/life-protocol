/* FORM. v0.07 — загрузка оригиналов фото без лимита на стороне приложения.
   Протокол TUS (Supabase Storage): файл режется на куски по 6 МБ, прерванная загрузка продолжается с того же места.
   Предел размера задаёт только само хранилище (Dashboard → Storage → Settings), в приложении его нет. */
(function(){
'use strict';
const BUCKET='photos',TUS_SRC='https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js';
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif','image/avif':'avif','image/gif':'gif'};
const C=()=>window.FORM_CONFIG||{};
function loadTus(){
  if(window.tus)return Promise.resolve();
  return new Promise((res,rej)=>{const s=document.createElement('script');s.src=TUS_SRC;s.onload=res;s.onerror=()=>rej(new Error('Не удалось загрузить модуль передачи файлов'));document.head.appendChild(s)});
}
const endpoint=()=>C().storageEndpoint||(String(C().supabaseUrl||'').replace(/\/$/,'')+'/storage/v1/upload/resumable');
const sizeText=n=>n>=1073741824?(n/1073741824).toFixed(2)+' ГБ':n>=1048576?(n/1048576).toFixed(1)+' МБ':Math.max(1,Math.round(n/1024))+' КБ';
function human(e){
  const m=String(e&&e.message||e||''),code=e&&e.originalResponse&&e.originalResponse.getStatus&&e.originalResponse.getStatus();
  if(code===413||/exceeded the maximum allowed size|too large/i.test(m))return 'Хранилище не принимает файл такого размера: увеличьте лимит в Supabase (Storage → Settings).';
  if(code===404||/bucket not found/i.test(m))return 'Хранилище не настроено: выполните supabase/setup.sql.';
  if(code===401||code===403||/row-level security|unauthori[sz]ed/i.test(m))return 'Нет доступа к хранилищу: войдите заново или проверьте политики из supabase/setup.sql.';
  if(!navigator.onLine)return 'Нет соединения. Загрузка продолжится с того же места по кнопке «Повторить».';
  return 'Загрузка прервана. Её можно продолжить с того же места.';
}

/* start(file,{onProgress,onState}) → {cancel(),retry()}; состояния: uploading | done | error | cancelled */
function start(file,cb){
  cb=cb||{};
  const sb=window.formSb&&window.formSb(),u=window.formUser&&window.formUser();
  const ct=file.type||'application/octet-stream',ext=EXT[ct]||((file.name.match(/\.([a-z0-9]{2,5})$/i)||[])[1]||'bin').toLowerCase();
  const path=u.id+'/original-'+Date.now().toString(36)+'.'+ext;
  let up=null,st='idle',t0=0,last={t:0,b:0},speed=0;
  const set=(s,x)=>{st=s;cb.onState&&cb.onState(s,x||{})};
  async function run(fresh){
    set('uploading');
    try{await loadTus()}catch(e){return set('error',{message:e.message})}
    t0=Date.now();last={t:t0,b:0};speed=0;
    up=new tus.Upload(file,{
      endpoint:endpoint(),retryDelays:[0,3000,5000,10000,20000],chunkSize:6*1024*1024,
      uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,
      headers:{'x-upsert':'false'},
      metadata:{bucketName:BUCKET,objectName:path,contentType:ct,cacheControl:'3600'},
      onBeforeRequest:req=>sb.auth.getSession().then(r=>{const s=r.data&&r.data.session;if(!s)throw new Error('unauthorized');req.setHeader('Authorization','Bearer '+s.access_token)}),
      onProgress:(b,t)=>{
        const n=Date.now();if(n-last.t>700){const v=(b-last.b)/((n-last.t)/1000);speed=speed?speed*.6+v*.4:v;last={t:n,b}}
        cb.onProgress&&cb.onProgress({loaded:b,total:t,pct:t?b/t*100:0,speed,eta:speed>0?(t-b)/speed:null});
      },
      onError:e=>set('error',{message:human(e),raw:e}),
      onSuccess:()=>set('done',{path,size:file.size,name:file.name,type:ct})
    });
    if(!fresh){try{const prev=await up.findPreviousUploads();if(prev.length)up.resumeFromPreviousUpload(prev[0])}catch(_){}}
    up.start();
  }
  const h={
    cancel(){if(st!=='uploading')return;try{up.abort(true)}catch(_){}set('cancelled')}, // true — удалить недогруженные части на сервере
    retry(){if(st==='uploading')return;run(st==='cancelled')}
  };
  run(true);
  return h;
}

/* удаляет оригинал из облака (при замене или удалении аватара), чтобы хранилище не росло */
async function remove(path){
  const sb=window.formSb&&window.formSb(),u=window.formUser&&window.formUser();
  if(!sb||!u||!path||path.split('/')[0]!==u.id)return false;
  try{const {error}=await sb.storage.from(BUCKET).remove([path]);return !error}catch(_){return false}
}
const available=()=>!!(window.formSb&&window.formSb()&&window.formUser&&window.formUser());
window.FormUpload={start,remove,available,sizeText};
})();
