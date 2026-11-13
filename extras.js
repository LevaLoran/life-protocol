(function(){
'use strict';
const q=id=>document.getElementById(id),P=n=>String(n).padStart(2,'0');
const RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
const MN=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const K=(y,m,d)=>y+'-'+P(m+1)+'-'+P(d);
let cur=null,sel=null,dir=0,E=null;
/* ---------- учёт планов дня (для «не выполнено») ---------- */
window.noteDay=function(){
 const t=today();if(!state.days)state.days={};
 const dn=state.completed.filter(x=>x.date===t).length,p=Math.max(todaysMissions().length,dn);
 if(!state.days[t]||state.days[t].p!==p)state.days[t]={p};
};
/* ---------- календарь ---------- */
const info=k=>{const l=state.completed.filter(x=>x.date===k),d=state.days&&state.days[k];return{l,n:l.length,xp:l.reduce((s,x)=>s+x.xp,0),p:d?d.p:null}};
window.dayHTML=function(k){
 const i=info(k),t=today(),dt=new Date(k+'T12:00:00');
 let lab=dt.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});lab=lab.charAt(0).toUpperCase()+lab.slice(1);
 const meds=Object.keys(state.medalDates||{}).filter(n=>state.medalDates[n]===k&&state.unlocked.includes(n));
 const pct=Math.min(100,Math.round(i.n/DAILY_LIMIT*100));
 const st=i.n===0?(k>t?'впереди':'нет активности'):(i.p&&i.n>=i.p?'день закрыт':'частично выполнено');
 const left=i.p!=null&&i.p>i.n&&k<=t?' · '+(k<t?'не выполнено':'осталось')+': '+(i.p-i.n):'';
 return `<h3>${esc(lab)}</h3><div class="dstat"><div><b>${i.n}${i.p!=null?' / '+i.p:''}</b><span>ВЫПОЛНЕНО</span></div><div><b>+${i.xp}</b><span>XP</span></div><div><b>${pct}%</b><span>АКТИВНОСТЬ</span></div></div><div class="progress"><i style="width:${pct}%"></i></div><div class="tiny muted" style="margin:6px 0 10px">${st}${left}</div>`
 +i.l.map(x=>`<div class="mission"><div style="flex:1"><strong>${esc(x.title)}</strong><div class="missionmeta">${esc(categories[x.category]||x.category)}</div></div><span class="xp">+${x.xp} XP</span></div>`).join('')
 +(meds.length?'<div class="chips">'+meds.map(n=>`<span class="tag">● ${esc(n)}</span>`).join('')+'</div>':'');
};
window.renderCalendar=function(){
 const el=q('monthGraph');if(!el)return;
 const t=today(),ty=+t.slice(0,4),tm=+t.slice(5,7)-1;
 if(!cur)cur={y:ty,m:tm,auto:true};
 if(cur.auto){cur.y=ty;cur.m=tm}
 const y=cur.y,m=cur.m,pre=y+'-'+P(m+1),lead=(new Date(y,m,1).getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
 const c={};let mxp=0;state.completed.forEach(x=>{c[x.date]=(c[x.date]||0)+1;if(x.date.slice(0,7)===pre)mxp+=x.xp});
 let cells='',ad=0,ms=0;
 for(let i=0;i<lead;i++)cells+='<i class="cd off"></i>';
 for(let d=1;d<=dim;d++){
  const k=K(y,m,d),n=c[k]||0,p=state.days&&state.days[k]?state.days[k].p:null,fut=k>t;
  if(n){ad++;ms+=n}
  const cl=['cd','l'+actLvl(n)];if(k===t)cl.push('today');if(fut)cl.push('fut');if(k===sel)cl.push('sel');
  let dot='';if(p!=null&&!fut){if(n>0&&n>=p)dot='<u class="ok"></u>';else if(k<t&&n<p)dot='<u class="no"></u>'}
  cells+=`<button class="${cl.join(' ')}" data-k="${k}"${fut?' disabled':''} aria-label="${k}: ${n}">${d}${dot}</button>`;
 }
 const atMax=y>ty||(y===ty&&m>=tm),atMin=y<ty-5||(y===ty-5&&m===0);
 let yr='',mx=1;const ys=[];
 for(let i=11;i>=0;i--){const dd=new Date(ty,tm-i,1),p2=dd.getFullYear()+'-'+P(dd.getMonth()+1);
  const v=state.completed.reduce((s,x)=>x.date.slice(0,7)===p2?s+x.xp:s,0);mx=Math.max(mx,v);ys.push([dd,p2,v])}
 ys.forEach(([dd,p2,v])=>{yr+=`<button class="ym${p2===pre?' on':''}" data-jm="${dd.getFullYear()}-${dd.getMonth()}" aria-label="${MN[dd.getMonth()]} ${dd.getFullYear()}: ${v} XP"><i style="height:${Math.max(6,v/mx*100)}%"></i><span>${MN[dd.getMonth()].slice(0,1)}</span></button>`});
 el.innerHTML=`<div class="cal"><div class="chead"><button class="cbtn" data-c="-12" aria-label="Год назад"${atMin?' disabled':''}>«</button><button class="cbtn" data-c="-1" aria-label="Предыдущий месяц"${atMin?' disabled':''}>‹</button><div class="ctitle">${MN[m]} ${y}</div><button class="cbtn" data-c="1" aria-label="Следующий месяц"${atMax?' disabled':''}>›</button><button class="cbtn" data-c="12" aria-label="Год вперёд"${atMax?' disabled':''}>»</button></div>`
 +`<div class="cwd">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span>${x}</span>`).join('')}</div><div class="cgrid${dir?(dir>0?' slr':' sll'):''}" id="cgrid">${cells}</div>`
 +`<div class="cmeta"><span><b>${ad}</b> акт. дней</span><span><b>${ms}</b> задач</span><span><b>${mxp}</b> XP</span><button class="cbtn wide" data-c="0">Сегодня</button></div>`
 +`<div class="dpanel" id="dpanel">${sel&&sel.slice(0,7)===pre?window.dayHTML(sel):'<div class="tiny muted">Нажмите на день, чтобы увидеть подробности</div>'}</div>`
 +`<div class="tiny muted" style="margin:14px 0 6px">12 МЕСЯЦЕВ · XP</div><div class="cyear">${yr}</div><div class="legend tiny muted"><span>меньше</span>${[0,1,2,3,4].map(l=>`<i class="cd l${l}" style="width:12px;height:12px;aspect-ratio:auto"></i>`).join('')}<span>больше</span><span style="margin-left:auto"><u class="ok"></u> день закрыт <u class="no"></u> не выполнено</span></div></div>`;
 dir=0;
};
function nav(delta){
 const t=today(),ty=+t.slice(0,4),tm=+t.slice(5,7)-1;
 if(delta===0){cur={y:ty,m:tm,auto:true};sel=t;dir=0;return window.renderCalendar()}
 const d=new Date(cur.y,cur.m+delta,1);
 if(d>new Date(ty,tm,1)||d<new Date(ty-5,0,1))return;
 cur={y:d.getFullYear(),m:d.getMonth(),auto:d.getFullYear()===ty&&d.getMonth()===tm};
 if(sel&&sel.slice(0,7)!==cur.y+'-'+P(cur.m+1))sel=null;
 dir=delta>0?1:-1;window.renderCalendar();
}
function pickDay(k){
 sel=sel===k?null:k;
 const g=q('cgrid');if(g)g.querySelectorAll('.cd.sel').forEach(x=>x.classList.remove('sel'));
 const b=g&&g.querySelector('[data-k="'+k+'"]');if(b&&sel)b.classList.add('sel');
 const p=q('dpanel');if(!p)return;
 p.innerHTML=sel?window.dayHTML(sel):'<div class="tiny muted">Нажмите на день, чтобы увидеть подробности</div>';
 p.classList.remove('dp');void p.offsetWidth;p.classList.add('dp');
}
/* ---------- аватары ---------- */
const V=300,ACCEPT='image/*,.heic,.heif,.avif';
const isImg=f=>/^image\//.test(f.type)||/\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(f.name);
const dflt=()=>{const ch=(String(state.callsign||'O').trim().charAt(0)||'O').toUpperCase();return `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" style="fill:var(--surf)"/><path d="M24 8 37 13.5v9.5c0 8.5-5.5 14-13 17.5C16.500 37 11 31.500 11 23v-9.500z" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="24" y="29.500" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="15" font-weight="700" fill="currentColor">${esc(ch)}</text></svg>`};
window.renderAvatars=function(pop){
 const ch=(String(state.callsign||'O').trim().charAt(0)||'O').toUpperCase();
 const sig=(state.avatar?state.avatar.length+':'+state.avatar.slice(-20):'d')+'|'+ch;
 document.querySelectorAll('.avslot').forEach(s=>{
  if(s.dataset.sig===sig)return;s.dataset.sig=sig;
  s.innerHTML=`<span class="av${pop?' pop':''}" style="--s:${+s.dataset.size||40}px">${state.avatar?`<img alt="" decoding="async" src="${state.avatar}" onload="this.classList.add('in')">`:dflt()}</span>`;
 });
 const a=q('statCall'),b=q('statRank');if(a)a.textContent=state.callsign;if(b)b.textContent=String(rankIndex(state.xp)+1).padStart(2,'0')+' / '+rankNames[rankIndex(state.xp)];
};
async function decode(f){
 let s=null;
 try{s=await createImageBitmap(f,{imageOrientation:'from-image'})}catch(_){
  try{s=await new Promise((res,rej)=>{const u=URL.createObjectURL(f),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>{URL.revokeObjectURL(u);rej()};i.src=u})}
  catch(__){s=await createImageBitmap(f,{resizeWidth:2400,resizeQuality:'high'})} // очень большое фото: уменьшаем только для обрезки, оригинал не трогаем
 }
 return {src:s,w:s.width||s.naturalWidth,h:s.height||s.naturalHeight};
}
function avHome(){
 E=null;
 q('avBody').innerHTML=`<div style="display:grid;place-items:center;margin:16px 0"><span class="av" style="--s:112px">${state.avatar?`<img class="in" alt="" src="${state.avatar}">`:dflt()}</span></div><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><label class="btn" style="margin:0;cursor:pointer;display:inline-block">${state.avatar?'Заменить':'Выбрать фото'}<input type="file" id="avFile" accept="${ACCEPT}" hidden></label>${state.avatar?'<button class="btn ghost" id="avDel">Удалить</button>':''}<button class="btn ghost" onclick="closeModal()">Закрыть</button></div>`;
 q('avFile').onchange=pick;
 const o=state.avatarOrig;if(o&&window.FormUpload)q('avBody').insertAdjacentHTML('beforeend','<div class="tiny muted" style="margin-top:12px">Оригинал в облаке: '+esc(o.name||'фото')+' · '+FormUpload.sizeText(o.size)+'</div>');
 const d=q('avDel');if(d)d.onclick=()=>{if(state.avatarOrig){window.FormUpload&&FormUpload.remove(state.avatarOrig.path);delete state.avatarOrig}delete state.avatar;save();window.renderAvatars();closeModal();toast('Аватар удалён')};
}
window.openAvatar=function(){q('modal').innerHTML='<h3>АВАТАР</h3><div class="tiny muted">JPG, PNG, WebP, HEIC · любой размер · оригинал сохраняется в облаке</div><div id="avBody"></div>';avHome();showModal()};
async function pick(e){
 const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
 if(!isImg(f))return toast('Это не изображение');
 let d=null;try{d=await decode(f)}catch(_){}
 if(!d||!d.w||!d.h){ // формат не читается браузером (например HEIC): аватар не меняем, оригинал всё равно загружаем
  if(!(window.FormUpload&&FormUpload.available()))return toast('Не удалось открыть изображение');
  toast('Предпросмотр недоступен для этого формата: загружаю оригинал');return upPanel(f,false);
 }
 crop(d,f);
}
function crop(d,file){
 const base=V/Math.min(d.w,d.h);E={file,src:d.src,w:d.w,h:d.h,base,z:1,s:base,ox:(V-d.w*base)/2,oy:(V-d.h*base)/2};
 q('avBody').innerHTML=`<div style="display:grid;place-items:center;margin:12px 0"><canvas id="avCv" width="${V}" height="${V}" style="width:100%;max-width:${V}px;touch-action:none;border-radius:14px;cursor:grab;background:var(--bg2)"></canvas></div><div class="row" style="gap:12px"><input id="avZ" type="range" min="1" max="4" step=".01" value="1" style="flex:1" aria-label="Масштаб"><span class="av" style="--s:56px"><canvas id="avPv" width="56" height="56"></canvas></span></div><div class="tiny muted" style="margin:8px 0 12px">Перетащите фото и выберите масштаб</div><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><button class="btn" id="avSave">Сохранить</button><label class="btn ghost" style="margin:0;cursor:pointer;display:inline-block">Другое<input type="file" id="avFile" accept="${ACCEPT}" hidden></label><button class="btn ghost" id="avBack">Отмена</button></div>`;
 q('avFile').onchange=pick;q('avBack').onclick=avHome;
 const cv=q('avCv'),pv=q('avPv'),cx=cv.getContext('2d'),px=pv.getContext('2d');
 const clamp=()=>{E.ox=Math.min(0,Math.max(V-E.w*E.s,E.ox));E.oy=Math.min(0,Math.max(V-E.h*E.s,E.oy))};
 const draw=()=>{
  clamp();cx.clearRect(0,0,V,V);cx.drawImage(E.src,E.ox,E.oy,E.w*E.s,E.h*E.s);
  cx.save();const dk=document.documentElement.dataset.theme==='dark';cx.fillStyle=dk?'rgba(0,0,0,.72)':'rgba(255,255,255,.72)';cx.beginPath();cx.rect(0,0,V,V);cx.arc(V/2,V/2,V/2-6,0,7,true);cx.fill('evenodd');cx.restore();
  cx.strokeStyle=dk?'#fff':'#000';cx.lineWidth=1.5;cx.beginPath();cx.arc(V/2,V/2,V/2-6,0,7);cx.stroke();
  px.clearRect(0,0,56,56);px.drawImage(E.src,-E.ox/E.s,-E.oy/E.s,V/E.s,V/E.s,0,0,56,56);
 };
 draw();
 q('avZ').oninput=ev=>{
  const mx=(V/2-E.ox)/E.s,my=(V/2-E.oy)/E.s;E.z=+ev.target.value;E.s=E.base*E.z;E.ox=V/2-mx*E.s;E.oy=V/2-my*E.s;draw();
 };
 let last=null;
 cv.onpointerdown=ev=>{last={x:ev.clientX,y:ev.clientY};cv.setPointerCapture(ev.pointerId);cv.style.cursor='grabbing'};
 cv.onpointermove=ev=>{if(!last)return;const k=V/cv.getBoundingClientRect().width;E.ox+=(ev.clientX-last.x)*k;E.oy+=(ev.clientY-last.y)*k;last={x:ev.clientX,y:ev.clientY};draw()};
 cv.onpointerup=cv.onpointercancel=()=>{last=null;cv.style.cursor='grab'};
 q('avSave').onclick=()=>{
  try{
   const o=document.createElement('canvas');o.width=o.height=256;const c=o.getContext('2d');
   c.drawImage(E.src,-E.ox/E.s,-E.oy/E.s,V/E.s,V/E.s,0,0,256,256);
   let u=o.toDataURL('image/webp',.86);if(u.indexOf('data:image/webp')!==0)u=o.toDataURL('image/jpeg',.88);
   if(u.length>280000)u=o.toDataURL('image/jpeg',.7);
   state.avatar=u;save();window.renderAvatars(true);
   if(E.file&&window.FormUpload&&FormUpload.available())upPanel(E.file,true);else{closeModal();toast('Аватар сохранён')}
  }catch(_){toast('Не удалось сохранить изображение')}
 };
}
/* ---------- загрузка оригинала: прогресс, отмена, повтор ---------- */
let UP=null;
function upPanel(file,thumbSaved){
 const S=FormUpload.sizeText,tm=n=>n==null||!isFinite(n)?'':n<60?Math.ceil(n)+' с':Math.ceil(n/60)+' мин';
 q('modal').innerHTML='<h3>ОРИГИНАЛ</h3>'+(thumbSaved?'<div class="tiny muted" style="margin-bottom:8px">Аватар сохранён. Оригинал загружается в облако в исходном качестве.</div>':'')+
  '<div class="up"><div class="row"><b class="upn">'+esc(file.name||'фото')+'</b><span id="upPct" class="tiny">0%</span></div><div class="upbar"><i id="upBar"></i></div><div class="tiny muted" id="upInfo">Подготовка…</div><div class="row" style="gap:8px;justify-content:flex-start;margin-top:14px;flex-wrap:wrap"><button class="btn ghost" id="upCancel">Отмена</button><button class="btn" id="upRetry" hidden>Повторить</button><button class="btn ghost" onclick="closeModal()">Закрыть</button></div></div>';
 const g=id=>q(id),old=state.avatarOrig;
 const ui=(pct,info)=>{const b=g('upBar');if(!b)return;b.style.width=pct+'%';g('upPct').textContent=Math.floor(pct)+'%';g('upInfo').textContent=info};
 UP=FormUpload.start(file,{
  onProgress:p=>ui(p.pct,S(p.loaded)+' из '+S(p.total)+(p.speed?' · '+S(p.speed)+'/с':'')+(p.eta?' · ещё '+tm(p.eta):'')),
  onState:(st,x)=>{
   const c=g('upCancel'),rt=g('upRetry');
   if(c)c.hidden=st!=='uploading';if(rt)rt.hidden=!(st==='error'||st==='cancelled');
   if(st==='uploading'&&g('upBar'))g('upBar').classList.remove('err');
   if(st==='error'){if(g('upBar'))g('upBar').classList.add('err');if(g('upInfo'))g('upInfo').textContent=x.message;toast('Загрузка оригинала не завершена')}
   if(st==='cancelled'&&g('upInfo'))g('upInfo').textContent='Отменено';
   if(st==='done'){
    state.avatarOrig={path:x.path,name:String(x.name||'').slice(0,100),size:x.size,at:Date.now()};save();
    if(old&&old.path&&old.path!==x.path)FormUpload.remove(old.path); // заменённый оригинал удаляем, хранилище не растёт
    ui(100,'Готово · '+S(x.size));toast('Оригинал загружен');UP=null;
   }
  }
 });
 g('upCancel').onclick=()=>UP&&UP.cancel();g('upRetry').onclick=()=>UP&&UP.retry();
}
/* ---------- эффекты ---------- */
let lp={x:innerWidth/2,y:innerHeight/2};
document.addEventListener('pointerdown',e=>{lp={x:e.clientX,y:e.clientY}},true);
window.fxGain=function(t){
 if(RM())return;const s=document.createElement('span');s.className='fxg';s.textContent=t;s.style.left=lp.x+'px';s.style.top=lp.y+'px';
 document.body.appendChild(s);setTimeout(()=>s.remove(),1300);
};
window.fxRank=function(i){
 if(RM())return;const d=document.createElement('div');d.className='fxr';
 d.innerHTML='<b>НОВЫЙ РАНГ</b><div class="crest" style="width:120px;height:120px">'+crest(i)+'</div>'+'<strong>'+esc(rankNames[i])+'</strong>';document.body.appendChild(d);setTimeout(()=>d.remove(),2600);
};

/* ---------- точечные цифры (дот-матрица) ---------- */
const DG={0:['01110','10001','10011','10101','11001','10001','01110'],1:['00100','01100','00100','00100','00100','00100','01110'],2:['01110','10001','00001','00010','00100','01000','11111'],3:['11110','00001','00001','01110','00001','00001','11110'],4:['00010','00110','01010','10010','11111','00010','00010'],5:['11111','10000','11110','00001','00001','10001','01110'],6:['00110','01000','10000','11110','10001','10001','01110'],7:['11111','00001','00010','00100','01000','01000','01000'],8:['01110','10001','10001','01110','10001','10001','01110'],9:['01110','10001','10001','01111','00001','00010','01100']};
window.dotNum=function(v){
 const s=String(Math.max(0,Math.floor(+v||0))),W=s.length*6-1;let c='';
 [...s].forEach((ch,n)=>DG[ch].forEach((row,y)=>[...row].forEach((b,x)=>{if(b==='1')c+='<circle cx="'+(n*6+x+.5)+'" cy="'+(y+.5)+'" r=".4"/>'})));
 return '<svg class="dn" viewBox="0 0 '+W+' 7" fill="currentColor" role="img" aria-label="'+s+'" style="aspect-ratio:'+W+'/7">'+c+'</svg>';
};
/* ---------- события ---------- */
document.addEventListener('click',e=>{
 const t=e.target.closest&&e.target.closest('#monthGraph [data-c],#monthGraph [data-k],#monthGraph [data-jm]');
 if(t){
  if(t.dataset.c!==undefined)nav(+t.dataset.c);
  else if(t.dataset.k)pickDay(t.dataset.k);
  else if(t.dataset.jm){const [y,m]=t.dataset.jm.split('-').map(Number),tt=today(),ty=+tt.slice(0,4),tm=+tt.slice(5,7)-1;
   dir=(y*12+m)>(cur.y*12+cur.m)?1:-1;cur={y,m,auto:y===ty&&m===tm};if(sel&&sel.slice(0,7)!==y+'-'+P(m+1))sel=null;window.renderCalendar()}
 }
 const a=e.target.closest&&e.target.closest('.avslot[data-edit]');if(a)window.openAvatar();
});
})();

/* ---------- v0.06: тема, заставка, всплывающие достижения ---------- */
(function(){
'use strict';
const q=id=>document.getElementById(id),RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
function sync(){
 const dk=document.documentElement.dataset.theme==='dark',m=document.querySelector('meta[name="theme-color"]'),b=q('themeBtn');
 if(m)m.setAttribute('content',dk?'#0b0b0c':'#ffffff');
 if(b){b.setAttribute('aria-pressed',dk?'true':'false');b.setAttribute('aria-label',dk?'Включить светлую тему':'Включить тёмную тему')}
}
window.toggleTheme=function(){
 const h=document.documentElement,n=h.dataset.theme==='dark'?'light':'dark';
 if(!RM()){h.classList.add('tswap');setTimeout(()=>h.classList.remove('tswap'),450)}
 h.dataset.theme=n;try{localStorage.setItem('formTheme',n)}catch(_){}sync();
};
sync();
const sp=q('splash');
if(sp){
 const kill=()=>{if(sp.parentNode)sp.remove()};
 sp.addEventListener('click',()=>{sp.classList.add('out');setTimeout(kill,350)});
 sp.addEventListener('animationend',ev=>{if(ev.target===sp&&ev.animationName==='spOut')kill()});
 setTimeout(kill,3500);
}
window.fxBadge=function(kind,text){
 if(RM())return false;
 let c=q('fxq');if(!c){c=document.createElement('div');c.id='fxq';document.body.appendChild(c)}
 const el=document.createElement('div');el.className='fxb';el.innerHTML='<i></i><div><small>'+esc(kind)+'</small><b>'+esc(text)+'</b></div>';
 c.appendChild(el);setTimeout(()=>el.remove(),3300);return true;
};
})();

/* ---------- v0.07: рябь на кнопках, всплески при наградах ---------- */
(function(){
'use strict';
const RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
document.addEventListener('pointerdown',e=>{
 if(RM())return;const b=e.target.closest&&e.target.closest('.btn,.au-btn');if(!b||b.disabled)return;
 const r=b.getBoundingClientRect(),d=Math.max(r.width,r.height)*2,s=document.createElement('span');
 s.className='rip';s.style.cssText='width:'+d+'px;height:'+d+'px;left:'+(e.clientX-r.left-d/2)+'px;top:'+(e.clientY-r.top-d/2)+'px';
 b.appendChild(s);setTimeout(()=>s.remove(),600);
},true);
function burst(x,y,n){
 if(RM())return;
 for(let i=0;i<n;i++){const a=Math.PI*2*i/n+Math.random()*.4,l=40+Math.random()*50,p=document.createElement('i');
  p.className='pbit';p.style.cssText='left:'+x+'px;top:'+y+'px;--dx:'+Math.cos(a)*l+'px;--dy:'+Math.sin(a)*l+'px';
  document.body.appendChild(p);setTimeout(()=>p.remove(),900)}
}
const g=window.fxGain,r=window.fxRank;
window.fxGain=function(t){g&&g(t);const e=document.querySelector('.fxg');if(e)burst(parseFloat(e.style.left)||innerWidth/2,parseFloat(e.style.top)||innerHeight/2,8)};
window.fxRank=function(i){r&&r(i);burst(innerWidth/2,innerHeight/2,28)};
})();
