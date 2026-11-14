/* FORM. v0.10 — облачная синхронизация: один аккаунт = один набор данных на всех устройствах.
   Таблица public.user_data (RLS: только владелец). Запись защищена номером версии (rev): если другое устройство успело
   записать раньше, изменения сливаются трёхсторонним слиянием (база · это устройство · облако), а не перезаписываются.
   Без сети всё сохраняется на устройстве и отправляется позже. Сервер хранит резервные копии (user_data_backups). */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const DEV=(()=>{let d='dev';try{d=localStorage.getItem('formDev')||'';if(!d){d=((window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).slice(0,36);localStorage.setItem('formDev',d)}}catch(_){}return d})();
let sb=null,uid=null,rev=0,base=null,busy=false,again=false,started=false,asking=false,status='idle',lastOk=0,errMsg='',tm=null,poll=null,chan=null,ver=0;

/* ---------- утилиты ---------- */
const sortKeys=v=>Array.isArray(v)?v.map(sortKeys):(v&&typeof v==='object')?Object.keys(v).sort().reduce((o,k)=>{if(v[k]!==undefined)o[k]=sortKeys(v[k]);return o},{}):v;
const eq=(a,b)=>JSON.stringify(sortKeys(a))===JSON.stringify(sortKeys(b));
const strip=d=>{if(!d)return d;const c={...d};delete c.updated;return c};
const snap=()=>JSON.parse(JSON.stringify(normalize(state)));
const pristine=d=>!d.xp&&!d.missions.length&&!d.completed.length&&!d.reports.length&&!d.unlocked.length&&!d.avatar&&d.callsign==='ПОЛЬЗОВАТЕЛЬ';
const keyC=x=>(x.id||x.title)+'|'+x.date;
const sum=a=>a.reduce((s,x)=>s+(Number.isFinite(+x.xp)?+x.xp:0),0);
const isNet=e=>!!e&&(e.name==='TypeError'||/failed to fetch|networkerror|load failed|network request|fetch/i.test(String(e.message||'')));

/* ---------- слияние ---------- */
function mergeMissions(B,L,R){
  const bm=new Map((B||[]).map(m=>[m.id,m])),lm=new Map(L.map(m=>[m.id,m])),rm=new Map(R.map(m=>[m.id,m]));
  const out=[];
  new Set([...lm.keys(),...rm.keys()]).forEach(id=>{
    const l=lm.get(id),r=rm.get(id),b=bm.get(id);
    if(l&&r){const m={...(b&&eq(l,b)?r:l)};m.done=!!(l.done||r.done);out.push(m)} // выполнение побеждает
    else{
      const x=l||r;
      // удалено на другом устройстве и здесь не менялось → удаляем; новое или изменённое → оставляем
      if(!(B&&bm.has(id)&&eq(x,b)))out.push(x);
    }
  });
  const seen=new Map(),res=[]; // ежедневные копии, созданные независимо на двух устройствах в один день
  out.forEach(m=>{
    if(m.sourceId){const k=m.sourceId+'|'+m.created,p=seen.get(k);
      if(p){if(m.done&&!p.done){res[res.indexOf(p)]=m;seen.set(k,m)}return}
      seen.set(k,m)}
    res.push(m);
  });
  return res;
}
function mergeDocs(B,L,R){
  const newer=(L.updated||0)>=(R.updated||0)?L:R,o={};
  const scalar=k=>{
    if(B){const lc=!eq(L[k],B[k]),rc=!eq(R[k],B[k]);
      if(lc&&!rc)return L[k];if(rc&&!lc)return R[k];if(!lc&&!rc)return R[k]}
    return newer[k];
  };
  ['callsign','theme','avatar','avatarOrig'].forEach(k=>{const v=scalar(k);if(v!==undefined)o[k]=v});
  o.created=L.created<R.created?L.created:R.created;
  o.missions=mergeMissions(B&&B.missions,L.missions,R.missions);
  const lk=new Set(L.completed.map(keyC)),rk=new Set(R.completed.map(keyC));
  const H=L.xp>=R.xp?L:R,O=H===L?R:L,hk=H===L?lk:rk;
  const onlyO=O.completed.filter(x=>!hk.has(keyC(x)));
  o.completed=[...H.completed,...onlyO].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  o.xp=H.xp+sum(onlyO); // опыт не дублируется: добавляем только задания, которых нет в «старшей» копии
  o.skills={...H.skills};
  onlyO.forEach(x=>{const k=skillMap[x.category]||'SOCIAL';o.skills[k]=(o.skills[k]||0)+1});
  o.unlocked=[...new Set([...L.unlocked,...R.unlocked])];
  o.treeSeen=[...new Set([...(L.treeSeen||[]),...(R.treeSeen||[])])];
  o.medalDates={...R.medalDates,...L.medalDates};
  Object.keys(R.medalDates).forEach(n=>{if(L.medalDates[n]&&L.medalDates[n]<R.medalDates[n])o.medalDates[n]=L.medalDates[n];else o.medalDates[n]=R.medalDates[n]});
  o.days={};
  new Set([...Object.keys(L.days),...Object.keys(R.days)]).forEach(d=>{
    const c=o.completed.filter(x=>x.date===d).length;
    o.days[d]={p:Math.min(50,Math.max((L.days[d]||{}).p||0,(R.days[d]||{}).p||0,c))};
  });
  const rep=new Map();
  [...R.reports,...L.reports].forEach(r=>{const p=rep.get(r.date);
    if(!p)rep.set(r.date,r);
    else if(B){const br=(B.reports||[]).find(x=>x.date===r.date);if(br&&eq(p,br))rep.set(r.date,r)} // изменённый отчёт важнее неизменённого
    else if(newer.reports.includes(r))rep.set(r.date,r);
  });
  o.reports=[...rep.values()].sort((a,b)=>a.date<b.date?1:-1).slice(0,30);
  const lb=Math.max(+L.lastBackup||0,+R.lastBackup||0);if(lb)o.lastBackup=lb;
  o.updated=Math.max(L.updated||0,R.updated||0);o.v=3;
  return normalize(o);
}

/* ---------- состояние синхронизации ---------- */
const TXT={synced:'Синхронизировано',syncing:'Синхронизация…',pending:'Есть несохранённые изменения',offline:'Нет сети: изменения сохранены на устройстве',error:'Ошибка синхронизации'};
function setStatus(s,msg){
  status=s;errMsg=msg||'';if(s==='synced')lastOk=Date.now();
  const dot=$('syncDot'),info=$('syncInfo');
  const t=s==='synced'&&lastOk?TXT.synced+' · '+new Date(lastOk).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):(s==='error'&&errMsg?errMsg:TXT[s]||'');
  if(dot){dot.hidden=false;dot.dataset.s=s;dot.title=t;dot.setAttribute('aria-label',t)}
  if(info)info.textContent=t;
}
function human(e){
  const m=String(e&&e.message||''),c=String(e&&e.code||'');
  if(c==='42P01'||c==='PGRST205'||/could not find the table|does not exist/i.test(m))return 'Облако не настроено: выполните supabase/setup.sql.';
  if(c==='42501'||/row-level security|permission denied/i.test(m))return 'Нет доступа к данным: войдите заново.';
  if(/JWT|expired/i.test(m))return 'Сессия истекла: войдите заново.';
  return 'Не удалось синхронизировать. Повторим автоматически.';
}
async function loadMeta(){
  let m=null;try{m=await idbGet('syncmeta:'+uid)}catch(_){}
  if(!m){try{m=JSON.parse(localStorage.getItem('form-syncmeta:'+uid)||'null')}catch(_){}}
  if(m&&typeof m==='object'){rev=+m.rev||0;base=m.base&&typeof m.base==='object'?normalize(m.base):null}
}
async function saveMeta(){
  const m={rev,base};
  try{await idbSet('syncmeta:'+uid,m)}catch(_){try{localStorage.setItem('form-syncmeta:'+uid,JSON.stringify(m))}catch(__){}}
}
const hasLocal=()=>!base||!eq(strip(snap()),strip(base));

/* ---------- окно выбора при первой синхронизации устройства ---------- */
function ask(L,R){
  return new Promise(res=>{
    asking=true;
    const el=document.createElement('div');el.id='syncAsk';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    const line=(t,d)=>'<div class="sa-l"><b>'+t+'</b><span>'+d.xp+' XP · задач выполнено: '+d.completed.length+'</span></div>';
    el.innerHTML='<div class="sa-box"><h3>Данные в облаке</h3><p class="sub">На этом устройстве уже есть прогресс, а в облаке сохранён другой. Ничего не будет удалено без вашего выбора.</p>'+line('Это устройство',L)+line('Облако',R)+
      '<button class="btn primary block" data-c="merge">Объединить (рекомендуется)</button><button class="btn block" data-c="cloud">Взять из облака</button><button class="btn ghost block" data-c="local">Оставить с этого устройства</button>'+
      '<p class="tiny muted">Выбранный вариант применится к аккаунту на всех устройствах. Предыдущая версия сохранится в резервных копиях.</p></div>';
    el.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('[data-c]');if(!c)return;el.remove();asking=false;res(c.dataset.c)});
    document.body.appendChild(el);
  });
}

/* ---------- применение данных на устройстве ---------- */
function applyLocal(d){
  if(typeof window.formApplyState==='function')window.formApplyState(d);
}

/* ---------- основной цикл ---------- */
async function sync(){
  if(!started||!sb||!uid||asking)return;
  if(busy){again=true;return}
  busy=true;
  try{
    if(!navigator.onLine){setStatus('offline');return}
    setStatus('syncing');
    let done=false;
    for(let attempt=0;attempt<5&&!done;attempt++){
      const v0=ver,L=snap();
      const {data:row,error}=await sb.from('user_data').select('data,rev').eq('user_id',uid).maybeSingle();
      if(error)throw error;
      if(!row){
        const r=await sb.from('user_data').insert({user_id:uid,data:L,rev:1,device:DEV}).select('rev').single();
        if(r.error){if(r.error.code==='23505')continue;throw r.error}
        rev=r.data.rev;base=L;await saveMeta();done=true;break;
      }
      const R=normalize(row.data);
      let M;
      if(base){
        if(row.rev===rev&&!hasLocal()){setStatus('synced');done=true;break}
        M=row.rev===rev?L:mergeDocs(base,L,R);
      }else{
        let c='merge';
        if(pristine(L)||eq(strip(L),strip(R)))c='cloud';else c=await ask(L,R);
        if(v0!==ver&&c!=='cloud'){continue}
        if(c==='cloud'){try{await idbSet('prelocal:'+uid,{at:Date.now(),state:L})}catch(_){}M=R}
        else if(c==='local')M=L;
        else M=mergeDocs(null,L,R);
      }
      if(v0!==ver)continue; // пока шёл запрос, на устройстве что-то изменилось: пересчитываем
      if(!eq(M,L))applyLocal(M);
      if(eq(strip(M),strip(R))){rev=row.rev;base=M;await saveMeta();done=true;break}
      const up=await sb.from('user_data').update({data:M,rev:row.rev+1,device:DEV}).eq('user_id',uid).eq('rev',row.rev).select('rev');
      if(up.error)throw up.error;
      if(up.data&&up.data.length===1){rev=up.data[0].rev;base=M;await saveMeta();done=true;break}
      // 0 строк: другое устройство записало раньше — повторяем со свежими данными
    }
    if(done){setStatus(hasLocal()?'pending':'synced');if(hasLocal())schedule(800)}
    else{setStatus('pending');schedule(2000)}
  }catch(e){
    if(isNet(e)||!navigator.onLine){setStatus('offline');schedule(20000)}
    else{console.error('sync',e);setStatus('error',human(e));schedule(60000)}
  }finally{busy=false;if(again){again=false;schedule(400)}}
}
function schedule(ms){clearTimeout(tm);tm=setTimeout(sync,ms)}

/* ---------- резервные копии ---------- */
function overlay(html){
  const el=document.createElement('div');el.id='syncAsk';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
  el.innerHTML='<div class="sa-box">'+html+'</div>';
  el.addEventListener('click',e=>{if(e.target===el)el.remove()});
  document.body.appendChild(el);return el;
}
async function openBackups(){
  if(!sb||!uid)return;
  const el=overlay('<h3>Резервные копии</h3><p class="sub" id="bkInfo">Загрузка…</p><div id="bkList"></div><button class="btn ghost block" id="bkClose">Закрыть</button>');
  el.querySelector('#bkClose').onclick=()=>el.remove();
  const {data,error}=await sb.from('user_data_backups').select('id,created_at,xp:data->xp,name:data->callsign').eq('user_id',uid).order('created_at',{ascending:false}).limit(15);
  const info=el.querySelector('#bkInfo');
  if(error){info.textContent=isNet(error)?'Нет соединения.':human(error);return}
  if(!data.length){info.textContent='Копий пока нет: сервер создаёт их автоматически при изменениях.';return}
  info.textContent='Выберите версию, чтобы вернуть её. Текущая версия тоже сохранится.';
  const list=el.querySelector('#bkList');
  data.forEach(b=>{
    const row=document.createElement('div');row.className='sa-l';
    row.innerHTML='<b>'+new Date(b.created_at).toLocaleString('ru-RU')+'</b><span>'+(+b.xp||0)+' XP</span>';
    const btn=document.createElement('button');btn.className='btn ghost small';btn.textContent='Вернуть';
    btn.onclick=()=>restore(b.id,el);row.appendChild(btn);list.appendChild(row);
  });
}
async function restore(id,el){
  if(!confirm('Вернуть эту версию на всех устройствах? Текущая версия сохранится в копиях.'))return;
  try{
    const {data,error}=await sb.from('user_data_backups').select('data').eq('id',id).eq('user_id',uid).single();
    if(error)throw error;
    const M=normalize(data.data);M.updated=Date.now();
    for(let i=0;i<4;i++){
      const cur=await sb.from('user_data').select('rev').eq('user_id',uid).single();
      if(cur.error)throw cur.error;
      const up=await sb.from('user_data').update({data:M,rev:cur.data.rev+1,device:'restore:'+DEV}).eq('user_id',uid).eq('rev',cur.data.rev).select('rev');
      if(up.error)throw up.error;
      if(up.data&&up.data.length===1){rev=up.data[0].rev;base=M;await saveMeta();applyLocal(M);setStatus('synced');if(el)el.remove();toast('Версия восстановлена');return}
    }
    toast('Не удалось восстановить: повторите');
  }catch(e){toast(isNet(e)?'Нет соединения':'Не удалось восстановить версию')}
}

/* ---------- интерфейс ---------- */
function mountUI(){
  const card=$('accountCard');
  if(card&&!$('syncInfo')){
    const d=document.createElement('div');d.className='syncrow';
    d.innerHTML='<span class="tiny" id="syncInfo" role="status"></span><span><button class="btn ghost small" id="syncNow">Синхронизировать</button> <button class="btn ghost small" id="syncBak">Копии</button></span>';
    card.appendChild(d);
    $('syncNow').onclick=()=>{if(!navigator.onLine)return setStatus('offline');sync()};
    $('syncBak').onclick=openBackups;
  }
  const dot=$('syncDot');if(dot)dot.onclick=()=>{if(status==='offline'||status==='error'||status==='pending')sync();toast($('syncDot').title)};
}

/* ---------- публичный интерфейс ---------- */
async function start(client,user){
  sb=client;uid=String(user.id).replace(/[^\w-]/g,'');started=true;
  mountUI();setStatus('syncing');
  await loadMeta();
  await sync();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(200)});
  window.addEventListener('online',()=>schedule(300));
  window.addEventListener('offline',()=>setStatus('offline'));
  window.addEventListener('pagehide',()=>{if(hasLocal())sync()});
  poll=setInterval(()=>{if(!document.hidden)sync()},45000);
  try{ // мгновенные обновления с других устройств; без Realtime работает опрос раз в 45 секунд
    chan=sb.channel('ud:'+uid).on('postgres_changes',{event:'UPDATE',schema:'public',table:'user_data',filter:'user_id=eq.'+uid},p=>{const n=p&&p.new;if(n&&n.rev>rev&&n.device!==DEV)schedule(300)}).subscribe();
  }catch(_){}
}
window.FormSync={
  start,
  changed(){ver++;if(!started)return;if(status!=='syncing')setStatus('pending');schedule(1200)},
  async flush(){if(!started)return;clearTimeout(tm);await Promise.race([sync(),new Promise(r=>setTimeout(r,4000))])},
  openBackups,
  _merge:mergeDocs
};
})();
