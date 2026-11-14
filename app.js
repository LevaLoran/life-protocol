'use strict';
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const fmt=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>fmt(new Date());
const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return fmt(d)};
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const categories={HEALTH:'Здоровье',EDUCATION:'Образование',PRODUCTIVITY:'Продуктивность',FITNESS:'Активность',CREATIVE:'Творчество',PERSONAL:'Личное',TECH:'Технологии'};
const rankNames=['Новичок','Ученик','Практик','Знаток','Умелец','Профи','Эксперт','Наставник','Мастер','Виртуоз','Легенда'];
// Порог XP для каждого ранга (RECRUIT начинается с 0)
const rankThresholds=[0,100,200,350,550,800,1100,1500,2000,2700,3500];
const MAX_RANK=rankNames.length-1;
const skillMap={HEALTH:'FITNESS',FITNESS:'FITNESS',EDUCATION:'INTELLIGENCE',PRODUCTIVITY:'DISCIPLINE',CREATIVE:'CREATIVITY',PERSONAL:'SOCIAL',TECH:'TECHNICAL'};
const skillNames={INTELLIGENCE:'INTELLIGENCE',DISCIPLINE:'DISCIPLINE',FITNESS:'FITNESS',CREATIVITY:'CREATIVITY',SOCIAL:'SOCIAL',TECHNICAL:'TECHNICAL'};
const actLvl=n=>n<=0?0:n<=2?1:n<=4?2:n<=7?3:4;
// Ключи хранилища (lifeProtocol / lifeProtocolDB) намеренно не менялись при переименовании в FORM.: иначе сохранённый прогресс пропал бы.
const DAILY_LIMIT=10, XP_PER_MISSION=5;
let STORAGE_KEY='lifeProtocol',IDB_KEY='state'; // у первого аккаунта на устройстве ключи прежние (старый прогресс сохраняется), у остальных с суффиксом id
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const medalDefs=[
 ['ПЕРВЫЙ ШАГ','Первая выполненная задача',s=>s.completed.length>=1,'●'],
 ['НЕДЕЛЯ В ДЕЛЕ','Активность в течение 7 разных дней',s=>activeDays(s)>=7,'●'],
 ['СОТНЯ','100 выполненных задач',s=>s.completed.length>=100,'●'],
 ['ПЕРФЕКЦИОНИСТ','10 задач за один день',s=>Object.values(groupByDay(s.completed)).some(a=>a.length>=10),'●'],
 ['ДИСЦИПЛИНА','7 дней подряд с активностью',s=>bestStreak(s)>=7,'●'],
 ['ОПЫТНЫЙ','1000 заработанных XP',s=>s.xp>=1000,'●'],
 ['СПЕЦИАЛИСТ','50 задач одной категории',s=>Object.values(countCats(s.completed)).some(n=>n>=50),'●']
];
const medalMig={'FIRST BLOOD':'ПЕРВЫЙ ШАГ','WEEK WARRIOR':'НЕДЕЛЯ В ДЕЛЕ','CENTURY':'СОТНЯ','PERFECTIONIST':'ПЕРФЕКЦИОНИСТ','DISCIPLINE':'ДИСЦИПЛИНА','VETERAN':'ОПЫТНЫЙ','ВЕТЕРАН':'ОПЫТНЫЙ','SPECIALIST':'СПЕЦИАЛИСТ'};
const skillRu={INTELLIGENCE:'ИНТЕЛЛЕКТ',DISCIPLINE:'ДИСЦИПЛИНА',FITNESS:'ФИЗИКА',CREATIVITY:'ТВОРЧЕСТВО',TECHNICAL:'ТЕХНИКА',SOCIAL:'СОЦИУМ'};
const catColor=c=>'var(--c-'+(skillMap[c]||'SOCIAL')+')';
const medalOk=(def,s=state)=>s.unlocked.includes(def[0])||def[2](s);

/* ---------- ID ---------- */
function uid(){
 try{if(window.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID()}catch(e){}
 return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
const cleanId=v=>String(v==null?'':v).replace(/[^\w-]/g,'').slice(0,80);

/* ---------- Состояние ---------- */
const defaults=()=>({v:3,callsign:'ПОЛЬЗОВАТЕЛЬ',created:new Date().toISOString(),xp:0,missions:[],completed:[],reports:[],skills:{},unlocked:[],lastRank:0});
function cleanMission(m){
 if(!m||typeof m!=='object')return null;
 const title=String(m.title==null?'':m.title).trim().slice(0,70);
 if(!title||!DATE_RE.test(String(m.created)))return null;
 const o={id:cleanId(m.id)||uid(),title,category:has(categories,m.category)?m.category:'PERSONAL',repeat:m.repeat==='daily'?'daily':'once',created:m.created,done:!!m.done};
 if(m.sourceId)o.sourceId=cleanId(m.sourceId);
 return o;
}
function cleanDone(x){
 if(!x||typeof x!=='object'||!DATE_RE.test(String(x.date)))return null;
 const xp=Number.isFinite(+x.xp)?+x.xp:XP_PER_MISSION;
 return {id:cleanId(x.id),title:String(x.title==null?'':x.title).slice(0,70),category:has(categories,x.category)?x.category:'PERSONAL',date:x.date,xp};
}
// Старые версии размножали ежедневные задачи: оставляем один шаблон и одну сегодняшнюю копию на серию
function migrateLegacy(s){
 const t=today(),groups={},drop=new Set();
 s.missions.filter(m=>m.repeat==='daily').forEach(m=>{const k=m.title+'|'+m.category;(groups[k]=groups[k]||[]).push(m)});
 Object.values(groups).forEach(g=>{
  g.sort((a,b)=>a.created<b.created?-1:a.created>b.created?1:0);
  const tpl=g[0];delete tpl.sourceId;
  const todays=tpl.created===t?[]:g.filter(m=>m!==tpl&&m.created===t);
  const keep=todays.find(m=>m.done)||todays[0];
  g.forEach(m=>{if(m!==tpl&&m!==keep)drop.add(m)});
  if(keep)keep.sourceId=tpl.id;
 });
 s.missions=s.missions.filter(m=>!drop.has(m));
}
function normalize(raw){
 const d=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const legacy=!d.v,s={...defaults(),...d};
 s.callsign=String(s.callsign==null?'':s.callsign).trim().slice(0,18)||'ПОЛЬЗОВАТЕЛЬ';
 s.xp=Number.isFinite(+s.xp)?Math.max(0,+s.xp):0;
 if(isNaN(new Date(s.created).getTime()))s.created=new Date().toISOString();
 s.missions=(Array.isArray(s.missions)?s.missions:[]).map(cleanMission).filter(Boolean);
 s.completed=(Array.isArray(s.completed)?s.completed:[]).map(cleanDone).filter(Boolean);
 s.reports=(Array.isArray(s.reports)?s.reports:[]).filter(r=>r&&DATE_RE.test(String(r.date))).map(r=>({date:r.date,text:String(r.text==null?'':r.text)})).slice(0,30);
 const sk={};if(s.skills&&typeof s.skills==='object')Object.keys(skillNames).forEach(k=>{if(Number.isFinite(+s.skills[k]))sk[k]=Math.max(0,+s.skills[k])});s.skills=sk;
 const names=medalDefs.map(m=>m[0]);
 s.unlocked=(Array.isArray(s.unlocked)?s.unlocked:[]).map(n=>medalMig[n]||n).filter((n,i,a)=>names.includes(n)&&a.indexOf(n)===i);
 if(legacy)migrateLegacy(s);
 s.v=3;
 if(s.callsign==='OPERATOR'||s.callsign==='\u041e\u041f\u0415\u0420\u0410\u0422\u041e\u0420')s.callsign='ПОЛЬЗОВАТЕЛЬ'; // старое имя по умолчанию
 if(Array.isArray(d.treeSeen))s.treeSeen=d.treeSeen.filter(x=>typeof x==='string');else delete s.treeSeen;
 if(!Number.isFinite(+s.lastBackup))delete s.lastBackup;
 s.lastRank=rankIndex(s.xp);
 s.days={};if(d.days&&typeof d.days==='object')Object.keys(d.days).forEach(k=>{const p=d.days[k]&&+d.days[k].p;if(DATE_RE.test(k)&&Number.isFinite(p)&&p>=0&&p<=50)s.days[k]={p:Math.floor(p)}});
 s.medalDates={};if(d.medalDates&&typeof d.medalDates==='object')names.forEach(n=>{const o=Object.keys(medalMig).find(k=>medalMig[k]===n&&d.medalDates[k]),v=d.medalDates[n]||(o&&d.medalDates[o]);if(DATE_RE.test(String(v)))s.medalDates[n]=v});
 const ao=d.avatarOrig;if(ao&&typeof ao==='object'&&typeof ao.path==='string'&&ao.path.length<200)s.avatarOrig={path:ao.path,name:String(ao.name||'').slice(0,100),size:Math.max(0,+ao.size||0),at:+ao.at||0};else delete s.avatarOrig;
 if(typeof s.avatar!=='string'||s.avatar.length>300000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s.avatar))delete s.avatar;
 return s;
}
let state=load();
const APP_VERSION='Бета 0.09',DB_NAME='lifeProtocolDB',DB_VER=1;
let dbp=null,ready=false,idbOk=true;
const getDb=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('kv'))r.result.createObjectStore('kv')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const idbGet=k=>getDb().then(db=>new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}));
const idbSet=(k,v)=>getDb().then(db=>new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)}));
function bump(el,c='bump'){if(!el)return;el.classList.remove(c);void el.offsetWidth;el.classList.add(c)}

function load(){
 let raw=null;
 try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){}
 return normalize(raw);
}
function save(){
 if(!ready)return; // до загрузки данных ничего не пишем: нельзя затереть прогресс пустым состоянием
 state.updated=Date.now();
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){}
 if(idbOk)idbSet(IDB_KEY,state).catch(()=>{idbOk=false;toast('IndexedDB недоступна: данные в localStorage')});
}
/* Данные привязаны к аккаунту: первый вошедший на устройстве получает прежний локальный прогресс, остальные — свои хранилища */
window.formSetUser=function(u){
 let o=null;try{o=localStorage.getItem('formOwner')}catch(e){}
 const id=cleanId(u&&u.id);if(!id)throw new Error('no user');
 if(!o){o=id;try{localStorage.setItem('formOwner',o)}catch(e){}}
 if(id!==o){STORAGE_KEY='lifeProtocol:'+id;IDB_KEY='state:'+id}
 state=load();
};
async function boot(){
 let a=null,b=null;
 try{a=await idbGet(IDB_KEY)}catch(e){idbOk=false}
 try{b=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){}
 // миграция: берём самую свежую копию (IndexedDB или localStorage Beta 0.01); ничего не удаляем
 const c=[a,b].filter(x=>x&&typeof x==='object').sort((x,y)=>(y.updated||0)-(x.updated||0)||(y.xp||0)-(x.xp||0));
 state=normalize(c[0]||null);ready=true;
 try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist()}catch(e){}
 checkMedals();render();generateBriefing();
}
async function renderData(){
 let kb='?',p=null;
 try{const e=await navigator.storage.estimate();kb=Math.round((e.usage||0)/1024)}catch(e){}
 try{p=await navigator.storage.persisted()}catch(e){}
 $('dataInfo').innerHTML=`Последняя копия: ${state.lastBackup?new Date(state.lastBackup).toLocaleString('ru-RU'):'ещё не было'}<br>Хранилище: IndexedDB ${idbOk?'работает':'ошибка'} · дубль в localStorage · ${p?'постоянное':'обычное'} · ${kb} КБ`;
}
let toastTimer=null;
function toast(t){const el=$('toast');el.textContent=t;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.style.display='none'},2400)}

/* ---------- Расчёты ---------- */
function rankIndex(xp){let i=0;rankThresholds.forEach((n,k)=>{if(xp>=n)i=k});return i}
function rankProgress(){
 const i=rankIndex(state.xp),start=rankThresholds[i],end=rankThresholds[i+1]||start;
 return {i,start,end,pct:i===MAX_RANK?100:Math.max(0,Math.min(100,(state.xp-start)/(end-start)*100))};
}
function groupByDay(arr){return arr.reduce((o,x)=>((o[x.date]=(o[x.date]||[]).concat(x)),o),{})}
function countCats(arr){return arr.reduce((o,x)=>(o[x.category]=(o[x.category]||0)+1,o),{})}
function activeDays(s){return new Set(s.completed.map(x=>x.date)).size}
function bestStreak(s){
 const days=[...new Set(s.completed.map(x=>x.date))].sort();
 let best=0,cur=0,prev=null;
 days.forEach(d=>{const t=new Date(d+'T12:00:00');
  // round: между датами может быть 23 или 25 часов из-за перехода на летнее/зимнее время
  if(prev&&Math.round((t-prev)/86400000)===1)cur++;else cur=1;
  best=Math.max(best,cur);prev=t});
 return best;
}
function currentStreak(){
 const days=new Set(state.completed.map(x=>x.date));
 let i=days.has(today())?0:1,n=0;
 while(days.has(daysAgo(i))){n++;i++}
 return n;
}
const todaysMissions=()=>{const t=today();return state.missions.filter(m=>m.created===t)};

/* ---------- Ежедневные задачи ---------- */
// Шаблон серии — задача repeat='daily' без sourceId. Копии создаются только из шаблонов.
function ensureDaily(){
 const t=today();
 // прошлые разовые задачи и копии не нужны: история хранится в state.completed
 state.missions=state.missions.filter(m=>m.created>=t||(m.repeat==='daily'&&!m.sourceId));
 state.missions.filter(m=>m.repeat==='daily'&&!m.sourceId&&m.created<t).forEach(tpl=>{
  if(todaysMissions().length>=DAILY_LIMIT)return;
  if(state.missions.some(x=>x.sourceId===tpl.id&&x.created===t))return;
  state.missions.push({id:uid(),title:tpl.title,category:tpl.category,repeat:'daily',created:t,done:false,sourceId:tpl.id});
 });
}

/* ---------- Рендер ---------- */
let currentDay=today();
function render(){
 currentDay=today();
 ensureDaily();window.noteDay&&noteDay();save();
 const r=rankProgress(),missionsToday=todaysMissions(),doneToday=missionsToday.filter(m=>m.done).length;
 $('dateTop').textContent=new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).toUpperCase();
 $('rankName').textContent=rankNames[r.i];$('rankLevel').textContent=String(r.i+1).padStart(2,'0');$('rankCrest').innerHTML=crest(r.i);
 $('xpText').textContent=r.i===MAX_RANK?state.xp+' XP — максимальный ранг':`${state.xp-r.start} / ${r.end-r.start} XP`;
 $('xpPercent').textContent=Math.round(r.pct)+'%';$('rankBar').style.width=r.pct+'%';
 $('totalXp').innerHTML=window.dotNum?dotNum(state.xp):state.xp;$('totalDone').textContent=state.completed.length;
 $('streak').textContent=currentStreak();
 $('missionCount').textContent=doneToday+' / '+missionsToday.length;
 $('rankName2').textContent=rankNames[r.i];$('rankCrest2').innerHTML=crest(r.i);renderNext(r);
 $('rankDesc').textContent=r.i===MAX_RANK?'Максимальный ранг достигнут':`${Math.max(0,r.end-state.xp)} XP до следующего ранга`;
 renderMissions();renderGraphs();renderRanks();renderSkills();renderMedals();renderStats();renderProfile();renderHistory();renderReports();
 window.renderAvatars&&renderAvatars();
}
function missionHTML(m){
 return `<div class="mission"><button class="check ${m.done?'done':''}" onclick="toggleMission('${m.id}')" aria-label="${m.done?'Выполнено':'Отметить выполненной'}" title="${m.done?'Выполнено':'Отметить выполненной'}">${m.done?'✓':''}</button><div style="min-width:0;flex:1"><div class="missiontitle" style="${m.done?'text-decoration:line-through;color:var(--dis)':''}">${esc(m.title)}</div><div class="missionmeta"><i class="cdot" style="background:${catColor(m.category)}"></i>${esc(categories[m.category]||m.category)} · ${m.repeat==='daily'?'Каждый день':'Однократно'}</div></div><span class="xp">${m.done?'+'+XP_PER_MISSION+' XP':XP_PER_MISSION+' XP'}</span><button class="iconbtn edit" onclick="editMission('${m.id}')" aria-label="Изменить задачу" title="Изменить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>`;
}
function renderMissions(){
 const todays=todaysMissions();
 $('dashMissions').innerHTML=todays.length?todays.map(missionHTML).join(''):'<div class="empty">Пока нет задач. Добавь первую.</div>';
 $('allMissions').innerHTML=todays.length?todays.map(missionHTML).join(''):'<div class="empty">Список задач пуст.</div>';
 $('missionLimit').textContent=todays.length+' / '+DAILY_LIMIT;
 $('missionSummary').textContent=`${todays.filter(m=>m.done).length} выполнено · ${todays.length} создано`;
}
function toggleMission(id){
 const m=state.missions.find(x=>x.id===id);
 if(!m||m.done)return;
 if(state.completed.filter(x=>x.date===today()).length>=DAILY_LIMIT){toast('Дневной лимит достигнут');return}
 m.done=true;state.xp+=XP_PER_MISSION;
 state.completed.push({id:m.id,title:m.title,category:m.category,date:today(),xp:XP_PER_MISSION});
 const sk=skillMap[m.category]||'SOCIAL';state.skills[sk]=(state.skills[sk]||0)+1;
 const msgs=[],r=rankIndex(state.xp);
 if(r>state.lastRank){state.lastRank=r;msgs.push('Новый ранг · '+rankNames[r])}else msgs.push('Задача выполнена · +'+XP_PER_MISSION+' XP');
 const extras=checkMedals().map(n=>['Достижение',n]);
 save();render();(window.freshSkills||[]).forEach(n=>extras.push(['Навык открыт',n]));if(window.fxBadge&&extras.length&&!matchMedia('(prefers-reduced-motion:reduce)').matches){extras.forEach(x=>fxBadge(x[0],x[1]));toast(msgs[0])}else toast(msgs.concat(extras.map(x=>x[0]+' · '+x[1])).join('  ·  '));bump($('totalXp'));bump($('rankBar'));window.fxGain&&fxGain('+'+XP_PER_MISSION+' XP');if(msgs[0].startsWith('Новый ранг')){bump($('rankCrest'),'rankup');window.fxRank&&fxRank(r)}
}
function openMission(m=null){
 $('modal').innerHTML=`<h3>${m?'Изменить задачу':'Новая задача'}</h3><label>Название задачи</label><input class="field" id="mTitle" maxlength="70" placeholder="Например: прочитать 10 страниц" value="${m?esc(m.title):''}"><label>Категория</label><select class="field" id="mCategory">${Object.entries(categories).map(([k,v])=>`<option value="${k}" ${m&&m.category===k?'selected':''}>${v}</option>`).join('')}</select><label>Повторение</label><select class="field" id="mRepeat"><option value="once">Однократно</option><option value="daily" ${m&&m.repeat==='daily'?'selected':''}>Каждый день</option></select><div class="row" style="margin-top:17px"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn" onclick="saveMission('${m?m.id:''}')">Сохранить</button></div>${m?`<button class="btn secondary small" style="margin-top:12px;color:var(--mut)" onclick="deleteMission('${m.id}')">${m.repeat==='daily'?'Удалить серию':'Удалить задачу'}</button>`:''}`;
 showModal();
}
function editMission(id){const m=state.missions.find(x=>x.id===id);if(m)openMission(m)}
function saveMission(id){
 const title=$('mTitle').value.trim();
 if(!title){toast('Введи название задачи');return}
 const data={title,category:$('mCategory').value,repeat:$('mRepeat').value};
 if(id){
  const m=state.missions.find(x=>x.id===id);
  if(!m){closeModal();render();return}
  Object.assign(m,data);
  if(m.sourceId){ // правка копии меняет и шаблон серии, иначе завтра вернётся старое название
   const tpl=state.missions.find(x=>x.id===m.sourceId);
   if(tpl)Object.assign(tpl,data);else if(data.repeat==='daily')delete m.sourceId;
   if(data.repeat==='once')delete m.sourceId;
  }
 }else{
  if(todaysMissions().length>=DAILY_LIMIT){toast('Максимум '+DAILY_LIMIT+' задач в день');return}
  state.missions.push({id:uid(),...data,created:today(),done:false});
 }
 save();closeModal();render();toast('Задача сохранена');
}
function deleteMission(id){
 const m=state.missions.find(x=>x.id===id);
 if(m&&m.repeat==='daily'){const root=m.sourceId||m.id;state.missions=state.missions.filter(x=>x.id!==root&&x.sourceId!==root&&x.id!==id)}
 else state.missions=state.missions.filter(x=>x.id!==id);
 save();closeModal();render();
}
function suggestMissions(){
 const pool=[['Прочитать 10 страниц','EDUCATION'],['Разобрать одну небольшую задачу','PRODUCTIVITY'],['Послушать новый альбом и записать впечатления','CREATIVE'],['Пройтись на свежем воздухе','FITNESS'],['Навести порядок на рабочем месте','PERSONAL'],['Сделать короткую паузу и отдохнуть','HEALTH'],['Изучить одну новую тему','EDUCATION'],['Продвинуть личный проект на один шаг','CREATIVE']];
 const used=new Set(todaysMissions().map(m=>m.title));
 const picks=pool.filter(x=>!used.has(x[0])).sort(()=>Math.random()-.5).slice(0,3);
 $('suggestions').innerHTML=picks.map(x=>`<div class="mission"><div style="flex:1"><strong>${x[0]}</strong><div class="missionmeta">${categories[x[1]]}</div></div><button class="btn secondary small" onclick="addSuggestion('${x[0]}','${x[1]}')" aria-label="Добавить">＋</button></div>`).join('')||'<p class="sub">Нет новых предложений.</p>';
}
function addSuggestion(title,category){
 if(todaysMissions().length>=DAILY_LIMIT){toast('Достигнут лимит');return}
 state.missions.push({id:uid(),title,category,repeat:'once',created:today(),done:false});
 save();render();suggestMissions();
}
let briefOffset=0;
function generateBriefing(){
 const done=state.completed.filter(x=>x.date===today()).length,left=DAILY_LIMIT-todaysMissions().length;
 const lines=[`Привет, ${state.callsign}. Выбери одну понятную задачу и начни с неё.`,`Сегодня выполнено задач: ${done}. Двигайся в своём темпе.`,`Твой ранг: ${rankNames[rankIndex(state.xp)]}. Каждая задача даёт ${XP_PER_MISSION} XP.`,`Сегодня можно добавить ещё задач: ${Math.max(0,left)}. Отдых — тоже часть прогресса.`];
 $('briefing').textContent=lines[(new Date().getDate()+briefOffset)%lines.length];
}
function refreshBriefing(){briefOffset++;generateBriefing()}
function renderGraphs(){
 window.renderCalendar&&renderCalendar();
 renderWeek();
}
function renderRanks(){
 const cur=rankIndex(state.xp);
 $('rankList').innerHTML='<div class="rgrid">'+rankNames.map((n,i)=>{const st=i<cur?'пройден':i===cur?'сейчас':i===cur+1?'следующий':'закрыт';return `<div class="rcard ${i===cur?'cur':i===cur+1?'nxt':i>cur?'lk':''}"><div class="row"><span class="rn">${String(i+1).padStart(2,'0')}</span><span class="tiny">${st}</span></div><div class="remb">${crest(i)}</div><strong>${n}</strong><div class="tiny">${rankThresholds[i]} XP</div></div>`}).join('')+'</div>';
}
function renderNext(r){
 const nx=r.i<MAX_RANK?r.i+1:null,op=$('opRank');
 if(op){op.textContent=String(r.i+1).padStart(2,'0')+' · '+rankNames[r.i];$('opName').textContent=state.callsign}
 $('nextRank').innerHTML=nx===null?'<strong>Максимальный ранг</strong>':`<div><div class="tiny">Следующий ранг</div><strong>${rankNames[nx]}</strong><div class="tiny">ещё ${Math.max(0,r.end-state.xp)} XP</div></div><div class="remb sm">${crest(nx)}</div>`;
}
function renderSkills(){
 $('skillList').innerHTML='<div class="sectiontitle"><span>Прогресс по направлениям</span></div>'+treeOrder.map(n=>{
  const xp=state.skills[n]||0,lvl=Math.floor(xp/10)+1,p=xp%10*10;
  return `<div class="skill" style="--c:var(--c-${n})"><div class="row"><strong><i class="cdot" style="background:var(--c)"></i>${skillRu[n]}</strong><span class="tag">ур. ${String(lvl).padStart(2,'0')}</span></div><div class="row tiny" style="margin-top:8px"><span>${xp} очк. · ${feeds(n)}</span><span>${p}%</span></div><div class="progress" style="margin-top:8px;--bar:var(--c)"><i style="width:${p}%"></i></div></div>`}).join('');
}
// Возвращает названия медалей, разблокированных прямо сейчас
function checkMedals(){
 const fresh=[];
 medalDefs.forEach(([name,,fn])=>{if(!state.unlocked.includes(name)&&fn(state)){state.unlocked.push(name);(state.medalDates=state.medalDates||{})[name]=today();fresh.push(name)}});
 return fresh;
}
const medalLab=['01','07','100','10','7D','1K','50'];
function medalHTML(){return medalDefs.map((def,k)=>{const ok=medalOk(def);return `<div class="mc ${ok?'on':''}"><div class="row"><span class="mb">${medalLab[k]}</span><span class="tiny">${ok?'открыто':'закрыто'}</span></div><strong>${def[0]}</strong><div class="sub">${def[1]}</div></div>`}).join('')}
function renderMedals(){
 renderTree();
 const n=medalDefs.filter(d=>medalOk(d)).length,hh=medalHTML();
 $('medalGrid').innerHTML=hh;$('profMedals').innerHTML=hh;$('profMedalCount').textContent=n+' ОТКРЫТО / '+medalDefs.length;
 $('medalsDone').textContent=n;$('medalsTotal').textContent=medalDefs.length;$('medalsPct').textContent=Math.round(n/medalDefs.length*100)+'%';
}
function renderStats(){
 const cats=countCats(state.completed),total=state.completed.length;
 $('statXp').textContent=state.xp;$('statMissions').textContent=total;$('statDays').textContent=activeDays(state);
 $('categoryStats').innerHTML=Object.keys(categories).map(c=>{const n=cats[c]||0,p=total?n/total*100:0;return `<div style="margin:10px 0"><div class="row"><span><i class="cdot" style="background:${catColor(c)}"></i>${categories[c]}</span><span class="tiny muted">${n} / ${Math.round(p)}%</span></div><div class="progress" style="--bar:${catColor(c)}"><i style="width:${p}%"></i></div></div>`}).join('');
}
function makeReport(){
 const t=today(),todayDone=state.completed.filter(x=>x.date===t),cats=countCats(todayDone),top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
 const xpToday=todayDone.reduce((s,x)=>s+x.xp,0);
 const report=`${dateLabel(t)}: выполнено ${todayDone.length} задач, заработано ${xpToday} XP. ${top?'Самая активная категория: '+categories[top[0]]+'. ':''}Текущий общий прогресс: ${state.xp} XP. Двигайся в комфортном темпе и выбирай посильные задачи.`;
 state.reports=state.reports.filter(r=>r.date!==t); // один отчёт в день
 state.reports.unshift({date:t,text:report});state.reports=state.reports.slice(0,30);
 save();renderReports();
}
function renderReports(){
 const t=today(),latest=state.reports[0];
 $('reportText').textContent=latest&&latest.date===t?latest.text:'Отчёт появится после генерации.';
 $('reportArchive').innerHTML=state.reports.filter(r=>r.date!==t).map(r=>`<div class="divider"></div><div class="tiny muted">${dateLabel(r.date)}</div><p class="sub">${esc(r.text)}</p>`).join('');
}
function renderProfile(){
 const rp=rankProgress(),i=rp.i,nx=i<MAX_RANK?i+1:null,pad=n=>String(n).padStart(2,'0');
 $('callsignView').textContent=state.callsign;$('profileRank').textContent=pad(i+1)+' · '+rankNames[i];
 $('profileCrest').innerHTML=crest(i);$('profileXp').textContent=state.xp+' XP';
 $('profileNext').textContent=nx===null?'Максимальный ранг':'До ранга «'+rankNames[nx]+'»: '+Math.max(0,rp.end-state.xp)+' XP';$('profileBar').style.width=rp.pct+'%';
 $('profileMissions').textContent=state.completed.length;
 $('profileMedals').textContent=medalDefs.filter(d=>medalOk(d)).length+' / '+medalDefs.length;
 $('appVer').textContent=APP_VERSION;renderData();
 $('bestStreak').textContent=bestStreak(state);$('createdAt').textContent=new Date(state.created).toLocaleDateString('ru-RU');
}
function renderHistory(){
 $('historyCount').textContent=state.completed.length;
 $('historyList').innerHTML=state.completed.slice().reverse().map(x=>`<div class="mission"><div style="flex:1"><strong>${esc(x.title)}</strong><div class="missionmeta">${dateLabel(x.date)} · ${esc(categories[x.category]||x.category)}</div></div><span class="xp">+${x.xp} XP</span></div>`).join('')||'<div class="empty">История пока пуста.</div>';
}

/* ---------- Навигация и модалки ---------- */
const parentScreen={achievements:'profile',stats:'profile',history:'profile'};
function showScreen(id){
 const nb=[...document.querySelectorAll('.nav button')].find(x=>x.dataset.screen===id&&x.offsetParent!==null),navId=nb?id:(parentScreen[id]||id);
 document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
 document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.screen===navId));
 window.scrollTo({top:0,behavior:'smooth'});
 if(id==='dashboard')generateBriefing();
 if(id==='skills'){treeApply();setTimeout(()=>pulse.clear(),2000)}
}
function showModal(){$('modalBack').classList.add('show')}
function closeModal(){
 $('modalBack').classList.remove('show');
 if(TV.sel){const s=TV.sel;TV.sel=null;renderTree();const n=document.querySelector(`.tnode[data-c="${s.slice(0,-1)}"][data-t="${s.slice(-1)}"]`);if(n)n.focus({preventScroll:true})}
}
function openSettings(){
 $('modal').innerHTML=`<h3>Настройки</h3><label>Имя</label><input class="field" id="settingCall" maxlength="18" value="${esc(state.callsign)}"><p class="sub">Прогресс хранится в браузере этого устройства и привязан к твоему аккаунту. Установка: открой сайт в браузере телефона и выбери «Добавить на главный экран».</p><div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">Закрыть</button><button class="btn" onclick="saveSettings()">Сохранить</button></div><button class="btn ghost small" style="margin-top:12px" onclick="formSignOut()">Выйти из аккаунта</button>`;
 showModal();
}
function saveSettings(){state.callsign=$('settingCall').value.trim()||'ПОЛЬЗОВАТЕЛЬ';save();closeModal();render()}
function editProfile(){openSettings()}

/* ---------- Экспорт / импорт ---------- */
function exportData(){
 state.lastBackup=Date.now();save();renderData();
 const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download='form-backup.json';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importData(e){
 const input=e.target,f=input.files&&input.files[0];
 if(!f)return;
 const r=new FileReader();
 r.onload=()=>{
  try{
   const d=JSON.parse(r.result);
   if(!d||!Array.isArray(d.missions)||!Array.isArray(d.completed))throw new Error('format');
   state=normalize(d);save();render();toast('Копия восстановлена');
  }catch(_){toast('Файл копии повреждён')}
  input.value=''; // позволяет импортировать тот же файл повторно
 };
 r.onerror=()=>{toast('Файл копии повреждён');input.value=''};
 r.readAsText(f);
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}


/* ---------- Дерево навыков ---------- */
// Три направления по два навыка; колонки подобраны так, что все связи между ветками идут только между соседними колонками.
const treeGroups=[['Люди и творчество',['SOCIAL','CREATIVITY']],['Разум',['INTELLIGENCE','TECHNICAL']],['Воля и тело',['DISCIPLINE','FITNESS']]];
const treeOrder=treeGroups.flatMap(g=>g[1]);
const treeLab={INTELLIGENCE:'Интеллект',DISCIPLINE:'Дисциплина',FITNESS:'Физика',CREATIVITY:'Творчество',TECHNICAL:'Техника',SOCIAL:'Социум'};
const tierNames={INTELLIGENCE:['Ученик','Аналитик','Эрудит'],DISCIPLINE:['Режим','Фокус','Воля'],CREATIVITY:['Искра','Мастер','Визионер'],FITNESS:['Ходок','Атлет','Титан'],TECHNICAL:['Самоделкин','Инженер','Архитектор'],SOCIAL:['Связной','Оратор','Лидер']};
const tierAt=[0,10,30],cross={INTELLIGENCE:'TECHNICAL',DISCIPLINE:'FITNESS',CREATIVITY:'INTELLIGENCE',FITNESS:'DISCIPLINE',TECHNICAL:'DISCIPLINE',SOCIAL:'CREATIVITY'};
const tierDesc=['Базовая ступень направления, открыта сразу.','Продвинутая ступень: нужна база ветки и 10 очков направления.','Вершина ветки: нужны 30 очков и навык из соседнего направления.'];
const feeds=c=>Object.keys(skillMap).filter(k=>skillMap[k]===c).map(k=>categories[k]).join(', ');
const PADX=14,COLW=150,NW=128,NH=92,ROWH=138,TOP=70,TW=PADX*2+5*COLW+NW,TH=TOP+2*ROWH+NH+16;
const TV={k:1,x:0,init:false,sel:null},pulse=new Set();
const TI={learned:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'};
function nodeInfo(c,t){
 const p=state.skills[c]||0,pre=[];
 if(t>0)pre.push([c,t-1]);if(t===2)pre.push([cross[c],1]);
 const preOk=pre.every(([cc,tt])=>nodeInfo(cc,tt).lvl>=1),unlocked=p>=tierAt[t]&&preOk;
 const lvl=unlocked?Math.min(5,Math.floor((p-tierAt[t])/8)+1):0;
 return {p,pre,unlocked,lvl,avail:preOk&&!unlocked,pct:lvl>=5?100:unlocked?(p-tierAt[t])%8/8*100:preOk?Math.min(99,p/tierAt[t]*100):0};
}
function renderTree(){
 const el=$('skillTree');if(!el)return;
 const cx=i=>PADX+i*COLW+NW/2,ty=t=>TOP+t*ROWH,idx=Object.fromEntries(treeOrder.map((c,i)=>[c,i])),info={},now=[];
 treeOrder.forEach(c=>[0,1,2].forEach(t=>{const n=info[c+t]=nodeInfo(c,t);if(n.unlocked)now.push(c+t)}));
 const fresh=state.treeSeen?now.filter(x=>!state.treeSeen.includes(x)):[];
 fresh.forEach(f=>pulse.add(f));
 window.freshSkills=fresh.map(f=>tierNames[f.slice(0,-1)][+f.slice(-1)]);
 if(!state.treeSeen||fresh.length){state.treeSeen=now;save()}
 let ln='',nd='',hd='';
 treeGroups.forEach((g,gi)=>{hd+=`<div class="tg" style="left:${PADX+gi*2*COLW}px;width:${COLW+NW}px">${g[0]}</div>`});
 treeOrder.forEach((c,i)=>{
  hd+=`<div class="tb" style="left:${PADX+i*COLW}px;--c:var(--c-${c})">${treeLab[c]}</div>`;
  for(let t=0;t<3;t++){
   const n=info[c+t],st=n.unlocked?'learned':n.avail?'avail':'lock',key=c+t;
   n.pre.forEach(([cc,tt])=>{
    const x1=cx(idx[cc]),y1=ty(tt)+NH,x2=cx(i),y2=ty(t),m=(y1+y2)/2,hl=TV.sel&&(TV.sel===key||TV.sel===cc+tt);
    ln+=`<path class="tl${n.unlocked?' on':''}${cc!==c?' x':''}${hl?' hl':''}" style="--c:var(--c-${cc})" d="M${x1} ${y1}C${x1} ${m} ${x2} ${m} ${x2} ${y2}"/>`;
   });
   const sub=n.unlocked?`Уровень ${n.lvl} из 5`:n.avail?`${n.p} / ${tierAt[t]} очков`:'Закрыто';
   nd+=`<button class="tnode st-${st}${pulse.has(key)?' new':''}${TV.sel===key?' sel':''}" style="left:${PADX+i*COLW}px;top:${ty(t)}px;--c:var(--c-${c})" data-c="${c}" data-t="${t}" aria-label="${tierNames[c][t]}, ${treeLab[c]}: ${sub}"><b>${tierNames[c][t]}</b><span class="ti">${st==='learned'?TI.learned:st==='lock'?TI.lock:''}</span><small>${sub}</small><div class="progress"><i style="width:${n.pct}%"></i></div></button>`;
  }
 });
 el.innerHTML=`<div class="tree-tools"><div class="tchips">${treeOrder.map(c=>`<button class="chip" style="--c:var(--c-${c})" onclick="treeFocus('${c}')"><i></i>${treeLab[c]}</button>`).join('')}</div><span class="zoomb"><button onclick="treeZoom(.85)" aria-label="Уменьшить">−</button><button onclick="treeZoom(1.18)" aria-label="Увеличить">+</button><button class="t" onclick="treeFit()">Сброс вида</button></span></div><div id="treeVp"><div id="treeCv" style="width:${TW}px;height:${TH}px"><svg width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}" aria-hidden="true">${ln}</svg>${hd}${nd}</div></div><div class="tleg"><span><i class="sw l"></i>изучено</span><span><i class="sw a"></i>доступно</span><span><i class="sw k"></i>закрыто</span><span>сплошная линия — ступени ветки, тонкая — связь с соседним направлением</span></div>`;
 treeApply();
}
function treeApply(){
 const vp=$('treeVp'),cv=$('treeCv');if(!vp||!cv)return;
 const vw=vp.clientWidth;if(!vw)return;
 if(!TV.init){
  TV.init=true;TV.k=Math.max(Math.min(vw/TW,1),.8);
  const best=treeOrder.slice().sort((a,b)=>(state.skills[b]||0)-(state.skills[a]||0))[0];
  TV.x=vw/2-(PADX+treeOrder.indexOf(best)*COLW+NW/2)*TV.k;
 }
 TV.k=Math.min(1.5,Math.max(.5,TV.k));
 const cw=TW*TV.k;TV.x=cw<=vw?(vw-cw)/2:Math.min(0,Math.max(vw-cw,TV.x));
 vp.style.height=Math.ceil(TH*TV.k)+'px';cv.style.transform=`translate(${TV.x}px,0) scale(${TV.k})`;
}
function treeZoom(f){const vp=$('treeVp');if(!vp||!vp.clientWidth)return;const vw=vp.clientWidth,mid=(vw/2-TV.x)/TV.k,k=Math.min(1.5,Math.max(.5,TV.k*f));TV.x=vw/2-mid*k;TV.k=k;treeApply()}
function treeFit(){TV.init=false;treeApply()}
function treeFocus(c){const vp=$('treeVp');if(!vp||!vp.clientWidth)return;TV.x=vp.clientWidth/2-(PADX+treeOrder.indexOf(c)*COLW+NW/2)*TV.k;treeApply()}
(function(){
 let d=null;
 document.addEventListener('pointerdown',e=>{const vp=e.target.closest&&e.target.closest('#treeVp');if(vp&&e.button!==2)d={x:e.clientX,x0:TV.x,m:false,id:e.pointerId}});
 document.addEventListener('pointermove',e=>{
  if(!d)return;const dx=e.clientX-d.x;
  if(!d.m&&Math.abs(dx)>6){d.m=true;$('treeCv').classList.add('drag');try{$('treeVp').setPointerCapture(d.id)}catch(_){}}
  if(d.m){TV.x=d.x0+dx;treeApply()}
 });
 const end=()=>{if(d&&d.m){window.__td=Date.now();const cv=$('treeCv');if(cv)cv.classList.remove('drag')}d=null};
 document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
 document.addEventListener('wheel',e=>{if(e.ctrlKey&&e.target.closest&&e.target.closest('#treeVp')){e.preventDefault();treeZoom(e.deltaY<0?1.1:.9)}},{passive:false});
 document.addEventListener('focusin',e=>{
  const n=e.target.closest&&e.target.closest('.tnode'),vp=$('treeVp');if(!n||!vp)return;
  vp.scrollLeft=0;vp.scrollTop=0;
  const l=TV.x+n.offsetLeft*TV.k;if(l<0||l+NW*TV.k>vp.clientWidth)treeFocus(n.dataset.c);
 });
 window.addEventListener('resize',()=>treeApply());
 document.addEventListener('click',e=>{const g=e.target.closest&&e.target.closest('.tnode');if(g&&Date.now()-(window.__td||0)>250)openNode(g.dataset.c,+g.dataset.t)});
})();
function openNode(c,t){
 const n=nodeInfo(c,t),lab=treeLab[c],grp=treeGroups.find(g=>g[1].includes(c))[0];
 TV.sel=c+t;renderTree();
 const conds=[[n.p>=tierAt[t],t===0?'Особых условий нет':`${tierAt[t]} очков направления «${lab}» (сейчас ${n.p})`]].concat(n.pre.map(([cc,tt])=>[nodeInfo(cc,tt).lvl>=1,`Изучен навык «${tierNames[cc][tt]}» (${treeLab[cc]})`]));
 const status=n.unlocked?'Изучено':n.avail?'Доступно':'Закрыто';
 const prog=n.unlocked?(n.lvl<5?`До уровня ${n.lvl+1}: ещё ${tierAt[t]+n.lvl*8-n.p} очк.`:'Максимальный уровень'):n.avail?`Набрано ${n.p} из ${tierAt[t]} очков`:'Сначала изучите требуемые навыки';
 $('modal').innerHTML=`<div class="tiny">${grp} · ${lab} · ступень ${t+1} из 3</div><h3 style="margin-top:6px">${tierNames[c][t]}</h3><p class="sub">${tierDesc[t]} Очки дают задачи: ${feeds(c)}.</p><div class="row"><strong>${n.unlocked?'Уровень '+n.lvl+' из 5':'Не изучено'}</strong><span class="tag">${status}</span></div><div class="progress" style="--bar:var(--c-${c})"><i style="width:${n.pct}%"></i></div><div class="tiny" style="margin-top:6px">${prog}</div><label>Условия открытия</label>${conds.map(([ok,x])=>`<div class="cond${ok?' met':''}" style="--c:var(--c-${c})"><span>${ok?'✓':'○'}</span>${x}</div>`).join('')}<label>Стоимость</label><div class="sub" style="margin:0">${t===0?'Бесплатно: открыто с самого начала.':`Порог ${tierAt[t]} очков направления. Очки не тратятся, а копятся от выполненных задач.`}</div><div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">Закрыть</button></div>`;
 showModal();
}
/* ---------- Contribution graph ---------- */
let updating=false;
function showUpdate(w){
 if($('updBar'))return;
 const b=document.createElement('div');b.id='updBar';b.className='upd';
 b.innerHTML='<span>Доступно обновление приложения</span><button class="btn small" id="updBtn">Обновить</button>';
 document.body.appendChild(b);
 $('updBtn').onclick=()=>{updating=true;save();setTimeout(()=>w.postMessage({type:'SKIP_WAITING'}),200)};
}

/* ---------- Ранги: уникальные знаки ---------- */
function crest(i){
 const D=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
 const ring=(n,R,r,o=0)=>Array.from({length:n},(_,k)=>{const a=o+2*Math.PI*k/n;return D((24+R*Math.cos(a)).toFixed(1),(24+R*Math.sin(a)).toFixed(1),r)}).join('');
 const G=[
  D(24,24,4.5),
  '<circle cx="24" cy="24" r="14"/>',
  '<circle cx="24" cy="24" r="14"/>'+D(24,24,4),
  '<path d="M24 9 40 37H8z"/>'+D(24,28,3),
  '<rect x="9" y="9" width="30" height="30"/><circle cx="24" cy="24" r="8"/>'+D(24,24,2.5),
  '<circle cx="24" cy="24" r="15"/><path d="M9 24h30"/>'+D(9,24,2.6)+D(39,24,2.6)+D(24,24,2.6),
  '<circle cx="24" cy="24" r="18"/>'+[14,24,34].map(y=>[14,24,34].map(x=>D(x,y,2.2)).join('')).join(''),
  '<circle cx="18" cy="24" r="11"/><circle cx="30" cy="24" r="11"/>'+D(24,24,2.8),
  '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="12"/><circle cx="24" cy="24" r="6"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10"/>',
  ring(12,18,2)+'<circle cx="24" cy="24" r="10"/>'+D(24,24,3),
  ring(12,19.5,2.1)+ring(6,12,2.1,.52)+'<circle cx="24" cy="24" r="5.5"/>'+D(24,24,2)
 ];
 return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${G[i]}</svg>`;
}
/* ---------- Активность за 7 дней ---------- */
function renderWeek(){
 const by={},dn=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
 state.completed.forEach(x=>{by[x.date]=(by[x.date]||0)+1});
 let h='';
 const dow=(new Date().getDay()+6)%7;
 for(let c=0;c<7;c++){const i=dow-c,k=daysAgo(i),n=by[k]||0,l=actLvl(n),fut=i<0;
  h+=`<button class="wd${i===0?' today':''}${fut?' fut':''}" data-wd="${k}" data-l="${l}"${fut?' disabled':''} aria-label="${dateLabel(k)}: ${n}"><small>${dn[new Date(k+'T12:00:00').getDay()]}</small><b>${n}</b><small>${new Date(k+'T12:00:00').getDate()}</small></button>`}
 $('weekGraph').innerHTML=h;
}
function openDay(k){
 $('modal').innerHTML=(window.dayHTML?dayHTML(k):'<h3>'+dateLabel(k)+'</h3>')+'<div class="row" style="margin-top:14px"><button class="btn ghost" onclick="closeModal()">Закрыть</button></div>';
 showModal();
}
document.addEventListener('click',e=>{const w=e.target.closest&&e.target.closest('.wd');if(w)openDay(w.dataset.wd)});
/* ---------- Запуск ---------- */
if('serviceWorker'in navigator){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>{
  const offer=w=>{if(navigator.serviceWorker.controller)showUpdate(w)};
  if(reg.waiting)offer(reg.waiting);
  reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')offer(w)})});
  setInterval(()=>reg.update().catch(()=>{}),3600000);
 }).catch(()=>{}));
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload()});
}
// PWA может часами лежать в фоне: пересчитываем день при возврате и по таймеру
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&today()!==currentDay)render()});
setInterval(()=>{if(today()!==currentDay)render()},30000);
window.__boot=boot; // запускается из auth.js только после успешной проверки входа
