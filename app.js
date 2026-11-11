'use strict';
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const fmt=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>fmt(new Date());
const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return fmt(d)};
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const categories={HEALTH:'Здоровье',EDUCATION:'Образование',PRODUCTIVITY:'Продуктивность',FITNESS:'Активность',CREATIVE:'Творчество',PERSONAL:'Личное',TECH:'Технологии'};
const rankNames=['РЕКРУТ','РЯДОВОЙ','ЕФРЕЙТОР','СЕРЖАНТ','ЛЕЙТЕНАНТ','КАПИТАН','МАЙОР','ПОЛКОВНИК','КОМАНДИР','ЭЛИТА','ЛЕГЕНДА'];
// Порог XP для каждого ранга (RECRUIT начинается с 0)
const rankThresholds=[0,100,200,350,550,800,1100,1500,2000,2700,3500];
const rankIcons=['Ⅰ','Ⅱ','Ⅲ','✦','✧','◆','◇','⬟','⬢','✪','★'];
const MAX_RANK=rankNames.length-1;
const skillMap={HEALTH:'FITNESS',FITNESS:'FITNESS',EDUCATION:'INTELLIGENCE',PRODUCTIVITY:'DISCIPLINE',CREATIVE:'CREATIVITY',PERSONAL:'SOCIAL',TECH:'TECHNICAL'};
const skillNames={INTELLIGENCE:'INTELLIGENCE',DISCIPLINE:'DISCIPLINE',FITNESS:'FITNESS',CREATIVITY:'CREATIVITY',SOCIAL:'SOCIAL',TECHNICAL:'TECHNICAL'};
const DAILY_LIMIT=10, XP_PER_MISSION=5, STORAGE_KEY='lifeProtocol';
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const medalDefs=[
 ['ПЕРВЫЙ ШАГ','Первая выполненная миссия',s=>s.completed.length>=1,'✦'],
 ['НЕДЕЛЯ В ДЕЛЕ','Активность в течение 7 разных дней',s=>activeDays(s)>=7,'▦'],
 ['СОТНЯ','100 выполненных миссий',s=>s.completed.length>=100,'Ⅰ'],
 ['ПЕРФЕКЦИОНИСТ','10 миссий за один день',s=>Object.values(groupByDay(s.completed)).some(a=>a.length>=10),'◇'],
 ['ДИСЦИПЛИНА','7 дней подряд с активностью',s=>bestStreak(s)>=7,'⬡'],
 ['ВЕТЕРАН','1000 заработанных XP',s=>s.xp>=1000,'★'],
 ['СПЕЦИАЛИСТ','50 миссий одной категории',s=>Object.values(countCats(s.completed)).some(n=>n>=50),'⌖']
];
const medalMig={'FIRST BLOOD':'ПЕРВЫЙ ШАГ','WEEK WARRIOR':'НЕДЕЛЯ В ДЕЛЕ','CENTURY':'СОТНЯ','PERFECTIONIST':'ПЕРФЕКЦИОНИСТ','DISCIPLINE':'ДИСЦИПЛИНА','VETERAN':'ВЕТЕРАН','SPECIALIST':'СПЕЦИАЛИСТ'};
const skillRu={INTELLIGENCE:'ИНТЕЛЛЕКТ',DISCIPLINE:'ДИСЦИПЛИНА',FITNESS:'ФИЗИКА',CREATIVITY:'ТВОРЧЕСТВО',TECHNICAL:'ТЕХНИКА',SOCIAL:'СОЦИУМ'};
const medalOk=(def,s=state)=>s.unlocked.includes(def[0])||def[2](s);

/* ---------- ID ---------- */
function uid(){
 try{if(window.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID()}catch(e){}
 return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
const cleanId=v=>String(v==null?'':v).replace(/[^\w-]/g,'').slice(0,80);

/* ---------- Состояние ---------- */
const defaults=()=>({v:3,callsign:'ОПЕРАТОР',created:new Date().toISOString(),xp:0,missions:[],completed:[],reports:[],skills:{},unlocked:[],lastRank:0});
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
// Старые версии размножали ежедневные миссии: оставляем один шаблон и одну сегодняшнюю копию на серию
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
 s.callsign=String(s.callsign==null?'':s.callsign).trim().slice(0,18)||'ОПЕРАТОР';
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
 if(s.callsign==='OPERATOR')s.callsign='ОПЕРАТОР';
 if(Array.isArray(d.treeSeen))s.treeSeen=d.treeSeen.filter(x=>typeof x==='string');else delete s.treeSeen;
 if(!Number.isFinite(+s.lastBackup))delete s.lastBackup;
 s.lastRank=rankIndex(s.xp);
 return s;
}
let state=load();
const APP_VERSION='Бета 0.04',DB_NAME='lifeProtocolDB',DB_VER=1;
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
 if(idbOk)idbSet('state',state).catch(()=>{idbOk=false;toast('IndexedDB недоступна: данные в localStorage')});
}
async function boot(){
 let a=null,b=null;
 try{a=await idbGet('state')}catch(e){idbOk=false}
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

/* ---------- Ежедневные миссии ---------- */
// Шаблон серии — миссия repeat='daily' без sourceId. Копии создаются только из шаблонов.
function ensureDaily(){
 const t=today();
 // прошлые разовые миссии и копии не нужны: история хранится в state.completed
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
 ensureDaily();save();
 const r=rankProgress(),missionsToday=todaysMissions(),doneToday=missionsToday.filter(m=>m.done).length;
 $('dateTop').textContent=new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).toUpperCase();
 $('rankName').textContent=rankNames[r.i];$('rankLevel').textContent='УР. '+String(r.i+1).padStart(2,'0');$('rankCrest').innerHTML=crest(r.i);
 $('xpText').textContent=r.i===MAX_RANK?state.xp+' XP — максимальный ранг':`${state.xp-r.start} / ${r.end-r.start} XP`;
 $('xpPercent').textContent=Math.round(r.pct)+'%';$('rankBar').style.width=r.pct+'%';
 $('totalXp').textContent=state.xp;$('totalDone').textContent=state.completed.length;
 $('streak').innerHTML=currentStreak()+' <small style="font-size:11px">дн</small>';
 $('missionCount').textContent=doneToday+' / '+missionsToday.length;
 $('rankName2').textContent=rankNames[r.i];$('rankCrest2').innerHTML=crest(r.i);renderNext(r);
 $('rankDesc').textContent=r.i===MAX_RANK?'Максимальный ранг достигнут':`${Math.max(0,r.end-state.xp)} XP до следующего ранга`;
 renderMissions();renderGraphs();renderRanks();renderSkills();renderMedals();renderStats();renderProfile();renderHistory();renderReports();
}
function missionHTML(m){
 return `<div class="mission"><button class="check ${m.done?'done':''}" onclick="toggleMission('${m.id}')" aria-label="Выполнить">${m.done?'✓':''}</button><div style="min-width:0;flex:1"><div class="missiontitle" style="${m.done?'text-decoration:line-through;color:#748087':''}">${esc(m.title)}</div><div class="missionmeta">${esc(categories[m.category]||m.category)} · ${m.repeat==='daily'?'Каждый день':'Однократно'}</div></div><span class="xp">${m.done?'+'+XP_PER_MISSION+' XP':XP_PER_MISSION+' XP'}</span><button class="iconbtn" style="padding:5px 8px" onclick="editMission('${m.id}')" aria-label="Редактировать">⋯</button></div>`;
}
function renderMissions(){
 const todays=todaysMissions();
 $('dashMissions').innerHTML=todays.length?todays.map(missionHTML).join(''):'<div class="empty">Нет активных миссий. Добавь первую операцию.</div>';
 $('allMissions').innerHTML=todays.length?todays.map(missionHTML).join(''):'<div class="empty">Список миссий пуст.</div>';
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
 if(r>state.lastRank){state.lastRank=r;msgs.push('Новый ранг · '+rankNames[r])}else msgs.push('Миссия выполнена · +'+XP_PER_MISSION+' XP');
 checkMedals().forEach(n=>msgs.push('Достижение · '+n));
 save();render();toast(msgs.join('  ·  '));bump($('totalXp'));bump($('rankBar'));if(msgs[0].startsWith('Новый ранг'))bump($('rankCrest'),'rankup');
}
function openMission(m=null){
 $('modal').innerHTML=`<h3>${m?'Изменить миссию':'Новая миссия'}</h3><label>Название миссии</label><input class="field" id="mTitle" maxlength="70" placeholder="Например: прочитать 10 страниц" value="${m?esc(m.title):''}"><label>Категория</label><select class="field" id="mCategory">${Object.entries(categories).map(([k,v])=>`<option value="${k}" ${m&&m.category===k?'selected':''}>${v}</option>`).join('')}</select><label>Повторение</label><select class="field" id="mRepeat"><option value="once">Однократно</option><option value="daily" ${m&&m.repeat==='daily'?'selected':''}>Каждый день</option></select><div class="row" style="margin-top:17px"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn" onclick="saveMission('${m?m.id:''}')">Сохранить</button></div>${m?`<button class="btn secondary small" style="margin-top:12px;color:var(--red);border-color:var(--red)" onclick="deleteMission('${m.id}')">${m.repeat==='daily'?'Удалить серию':'Удалить миссию'}</button>`:''}`;
 showModal();
}
function editMission(id){const m=state.missions.find(x=>x.id===id);if(m)openMission(m)}
function saveMission(id){
 const title=$('mTitle').value.trim();
 if(!title){toast('Введи название миссии');return}
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
  if(todaysMissions().length>=DAILY_LIMIT){toast('Максимум '+DAILY_LIMIT+' миссий в день');return}
  state.missions.push({id:uid(),...data,created:today(),done:false});
 }
 save();closeModal();render();toast('Миссия сохранена');
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
 const lines=[`Оператор ${state.callsign}, протокол активен.`,`Сегодня выполнено миссий: ${done}. Не торопись — выбери одну реалистичную задачу и двигайся постепенно.`,`Твой текущий ранг — ${rankNames[rankIndex(state.xp)]}. Каждая завершённая миссия приносит ${XP_PER_MISSION} XP.`,`На сегодня доступно ещё ${Math.max(0,left)} слотов для новых миссий. Помни: отдых тоже часть устойчивого прогресса.`];
 $('briefing').textContent=lines[(new Date().getDate()+briefOffset)%lines.length];
}
function refreshBriefing(){briefOffset++;generateBriefing()}
function renderGraphs(){
 const groups=groupByDay(state.completed);
 const cell=d=>{const n=(groups[d]||[]).length;return `<div class="cell" data-level="${n===0?0:n<3?1:n<5?2:n<8?3:4}" title="${dateLabel(d)}: ${n} миссий"></div>`};
 const week=[],month=[];
 for(let i=6;i>=0;i--)week.push(daysAgo(i));
 for(let i=29;i>=0;i--)month.push(daysAgo(i));
 renderHeat();
 renderWeek();
}
function renderRanks(){
 const cur=rankIndex(state.xp);
 $('rankList').innerHTML='<div class="rgrid">'+rankNames.map((n,i)=>{const st=i<cur?'ОТКРЫТО':i===cur?'● ТЕКУЩИЙ':i===cur+1?'СЛЕДУЮЩИЙ':'ЗАКРЫТО';return `<div class="rcard ${i===cur?'cur':i===cur+1?'nxt':i>cur?'lk':''}" style="--c:${crestPal[i][0]}"><div class="row"><span class="rn">${String(i+1).padStart(2,'0')}</span><span class="tag">${st}</span></div><div class="remb">${crest(i)}</div><strong>${n}</strong><div class="tiny muted">${rankThresholds[i]} XP ДЛЯ ДОСТИЖЕНИЯ</div><i class="rline"></i></div>`}).join('')+'</div>';
}
function renderNext(r){
 const nx=r.i<MAX_RANK?r.i+1:null,op=$('opRank');
 if(op){op.textContent=String(r.i+1).padStart(2,'0')+' / '+rankNames[r.i];$('opName').textContent=state.callsign}
 const nr2=$('nextRank2');if(nr2)nr2.innerHTML=nx===null?'<strong>Максимальный ранг достигнут</strong>':`<div class="row"><div><div class="tiny nx">СЛЕДУЮЩИЙ СТАТУС</div><strong style="font-size:20px;display:block;margin:10px 0">${rankNames[nx]}</strong><div class="sub">${rankThresholds[nx]} XP · ранг ${String(nx+1).padStart(2,'0')}</div></div><div class="remb sm">${crest(nx)}</div></div>`;
 $('nextRank').innerHTML=nx===null?'<strong>Максимальный ранг достигнут</strong>':`<div class="tiny nx">СЛЕДУЮЩИЙ РАНГ / ${String(nx+1).padStart(2,'0')}</div><div class="row" style="margin:8px 0"><div><strong style="font-size:20px">${rankNames[nx]}</strong><div class="big nx">${Math.max(0,r.end-state.xp)} XP</div><div class="tiny muted">до нового статуса</div></div><div class="remb sm">${crest(nx)}</div></div><button class="btn ghost small" onclick="showScreen('ranks')">Все ранги →</button>`;
}
function renderSkills(){
 const desc={INTELLIGENCE:'Обучение и новые знания',DISCIPLINE:'Планы и организация',FITNESS:'Активность и здоровье',CREATIVITY:'Творчество и проекты',SOCIAL:'Общение и личные дела',TECHNICAL:'Технологии и инженерия'};
 $('skillList').innerHTML=Object.keys(skillNames).map(n=>{
  const xp=state.skills[n]||0,lvl=Math.floor(xp/10)+1,p=xp%10*10;
  return `<div class="skill"><div class="row"><strong>${skillRu[n]}</strong><span class="tag">УР. ${String(lvl).padStart(2,'0')}</span></div><div class="sub">${desc[n]}</div><div class="row tiny muted" style="margin-top:9px"><span>${xp} очков</span><span>${p}% до следующего уровня</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join('');
}
// Возвращает названия медалей, разблокированных прямо сейчас
function checkMedals(){
 const fresh=[];
 medalDefs.forEach(([name,,fn])=>{if(!state.unlocked.includes(name)&&fn(state)){state.unlocked.push(name);fresh.push(name)}});
 return fresh;
}
const medalLab=['01','07','100','10','7D','1K','50'];
function medalHTML(){return medalDefs.map((def,k)=>{const ok=medalOk(def);return `<div class="mc ${ok?'on':''}"><div class="row"><span class="mb">${medalLab[k]}</span><span class="tiny ${ok?'accent':'muted'}">${ok?'✓ ОТКРЫТО':'ЗАКРЫТО'}</span></div><strong>${def[0]}</strong><div class="sub">${def[1]}</div></div>`}).join('')}
function renderMedals(){
 renderTree();
 const n=medalDefs.filter(d=>medalOk(d)).length,hh=medalHTML();
 $('medalGrid').innerHTML=hh;$('profMedals').innerHTML=hh;$('profMedalCount').textContent=n+' ОТКРЫТО / '+medalDefs.length;
 $('medalsDone').textContent=n;$('medalsTotal').textContent=medalDefs.length;$('medalsPct').textContent=Math.round(n/medalDefs.length*100)+'%';
}
function renderStats(){
 const cats=countCats(state.completed),total=state.completed.length;
 $('statXp').textContent=state.xp;$('statMissions').textContent=total;$('statDays').textContent=activeDays(state);
 $('categoryStats').innerHTML=Object.keys(categories).map(c=>{const n=cats[c]||0,p=total?n/total*100:0;return `<div style="margin:10px 0"><div class="row"><span>${categories[c]}</span><span class="tiny muted">${n} / ${Math.round(p)}%</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join('');
}
function makeReport(){
 const t=today(),todayDone=state.completed.filter(x=>x.date===t),cats=countCats(todayDone),top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
 const xpToday=todayDone.reduce((s,x)=>s+x.xp,0);
 const report=`${dateLabel(t)}: выполнено ${todayDone.length} миссий, заработано ${xpToday} XP. ${top?'Самая активная категория: '+categories[top[0]]+'. ':''}Текущий общий прогресс: ${state.xp} XP. Двигайся в комфортном темпе и выбирай посильные задачи.`;
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
 $('callsignView').textContent=state.callsign;$('profileRank').textContent=pad(i+1)+' / '+rankNames[i];$('profileRank').style.color=crestPal[i][0];
 $('profileCrest').innerHTML=crest(i);$('profileXp').textContent=state.xp+' XP всего';
 $('profileNext').textContent=nx===null?'Максимальный ранг':Math.max(0,rp.end-state.xp)+' XP до '+rankNames[nx].toLowerCase();$('profileBar').style.width=rp.pct+'%';
 $('profileMissions').textContent=state.completed.length;
 $('profileMedals').textContent=medalDefs.filter(d=>medalOk(d)).length+' / '+medalDefs.length;
 $('appVer').textContent=APP_VERSION;renderData();
 $('bestStreak').textContent=bestStreak(state)+' дн.';$('createdAt').textContent=new Date(state.created).toLocaleDateString('ru-RU');
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
}
function showModal(){$('modalBack').classList.add('show')}
function closeModal(){$('modalBack').classList.remove('show')}
function openSettings(){
 $('modal').innerHTML=`<h3>Настройки</h3><label>Позывной</label><input class="field" id="settingCall" maxlength="18" value="${esc(state.callsign)}"><p class="sub">Данные сохраняются в локальном хранилище браузера. Установка: открой сайт в браузере телефона и выбери «Добавить на главный экран».</p><div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">Закрыть</button><button class="btn" onclick="saveSettings()">Сохранить</button></div>`;
 showModal();
}
function saveSettings(){state.callsign=$('settingCall').value.trim()||'ОПЕРАТОР';save();closeModal();render()}
function editProfile(){openSettings()}

/* ---------- Экспорт / импорт ---------- */
function exportData(){
 state.lastBackup=Date.now();save();renderData();
 const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download='life-protocol-backup.json';
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


/* ---------- Skill Tree ---------- */
const treeCats=[['INTELLIGENCE','ИНТЕЛЛЕКТ','#4cc9f0'],['DISCIPLINE','ДИСЦИПЛ.','#b6f23c'],['CREATIVITY','ТВОРЧЕСТВО','#a78bfa'],['FITNESS','ФИЗИКА','#1ed760'],['TECHNICAL','ТЕХНИКА','#60a5fa'],['SOCIAL','СОЦИУМ','#f472b6']];
const tierNames={INTELLIGENCE:['Ученик','Аналитик','Эрудит'],DISCIPLINE:['Режим','Фокус','Воля'],CREATIVITY:['Искра','Мастер','Визионер'],FITNESS:['Ходок','Атлет','Титан'],TECHNICAL:['Самоделкин','Инженер','Архитектор'],SOCIAL:['Связной','Оратор','Лидер']};
const tierAt=[0,10,30],cross={INTELLIGENCE:'TECHNICAL',DISCIPLINE:'FITNESS',CREATIVITY:'INTELLIGENCE',FITNESS:'DISCIPLINE',TECHNICAL:'DISCIPLINE',SOCIAL:'CREATIVITY'};
function nodeInfo(c,t){
 const p=state.skills[c]||0,pre=[];
 if(t>0)pre.push([c,t-1]);if(t===2)pre.push([cross[c],1]);
 const preOk=pre.every(([cc,tt])=>nodeInfo(cc,tt).lvl>=1),unlocked=p>=tierAt[t]&&preOk;
 const lvl=unlocked?Math.min(5,Math.floor((p-tierAt[t])/8)+1):0;
 return {p,pre,unlocked,lvl,avail:preOk&&!unlocked,pct:lvl>=5?100:unlocked?(p-tierAt[t])%8/8*100:preOk?Math.min(99,p/tierAt[t]*100):0};
}
function renderTree(){
 const X=i=>32+i*59,Y=t=>58+t*100,idx=Object.fromEntries(treeCats.map((c,i)=>[c[0],i]));
 let lines='',nodes='',unlockedNow=[];
 treeCats.forEach(([c,lab,col],i)=>{
  nodes+=`<text x="${X(i)}" y="16" class="tc" fill="${col}">${lab}</text>`;
  for(let t=0;t<3;t++){
   const n=nodeInfo(c,t);if(n.unlocked)unlockedNow.push(c+t);
   n.pre.forEach(([cc,tt])=>{lines+=`<line class="tl ${n.unlocked?'on':''}" x1="${X(idx[cc])}" y1="${Y(tt)}" x2="${X(i)}" y2="${Y(t)}" ${n.unlocked?`stroke="${col}"`:''}/>`});
   const isNew=state.treeSeen&&!state.treeSeen.includes(c+t)&&n.unlocked;
   nodes+=`<g class="tn ${n.unlocked?'':n.avail?'avail':'lock'} ${isNew?'new':''}" data-c="${c}" data-t="${t}"><circle cx="${X(i)}" cy="${Y(t)}" r="25" fill="none" stroke="#222226" stroke-width="3"/><circle cx="${X(i)}" cy="${Y(t)}" r="25" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(157*n.pct/100).toFixed(1)} 157" transform="rotate(-90 ${X(i)} ${Y(t)})" class="ring"/><circle class="n" cx="${X(i)}" cy="${Y(t)}" r="19" stroke="${n.unlocked?col:'#333'}"/><text x="${X(i)}" y="${Y(t)+4}" class="lv">${n.unlocked?n.lvl:n.avail?'+':'🔒'}</text><text x="${X(i)}" y="${Y(t)+40}">${tierNames[c][t]}</text></g>`;
  }});
 $('skillTree').innerHTML=`<svg viewBox="0 0 364 330" role="img" aria-label="Дерево навыков">${lines}${nodes}</svg>`;
 const fresh=state.treeSeen?unlockedNow.filter(x=>!state.treeSeen.includes(x)):[];
 if(!state.treeSeen||fresh.length){state.treeSeen=unlockedNow;save();if(fresh.length&&ready)toast('Навык открыт · '+fresh.map(f=>tierNames[f.slice(0,-1)][+f.slice(-1)]).join(', '))}
}
function openNode(c,t){
 const n=nodeInfo(c,t),lab=treeCats.find(x=>x[0]===c)[1],ok=b=>b?'✓':'✗';
 const conds=[`${ok(n.p>=tierAt[t])} ${tierAt[t]} очков навыка «${lab}» (сейчас ${n.p})`].concat(n.pre.map(([cc,tt])=>`${ok(nodeInfo(cc,tt).lvl>=1)} Навык «${tierNames[cc][tt]}» уровня 1+`));
 const d=['Базовый навык направления.','Продвинутый уровень: требует базу ветки.','Вершина ветки: требует связанный навык из другого направления.'][t];
 $('modal').innerHTML=`<h3>${tierNames[c][t].toUpperCase()}</h3><div class="tiny muted">${lab} · Ступень ${t+1}</div><p class="sub">${d} Прогресс растёт от выполненных миссий этого направления.</p><div class="row"><strong>УРОВЕНЬ ${n.lvl} / 5</strong><span class="tag">${n.unlocked?'ИЗУЧЕНО':n.avail?'ДОСТУПНО':'ЗАКРЫТО'}</span></div><div class="progress"><i style="width:${n.pct}%"></i></div><label>Условия</label>${conds.map(x=>`<div class="sub">${x}</div>`).join('')}<div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">Закрыть</button></div>`;showModal();
}
document.addEventListener('click',e=>{
 const g=e.target.closest&&e.target.closest('.tn');if(g)openNode(g.dataset.c,+g.dataset.t);
 const h=e.target.closest&&e.target.closest('.hc[data-d]');
 if(h){const k=h.dataset.d,list=state.completed.filter(x=>x.date===k),xp=list.reduce((s,x)=>s+x.xp,0);$('heatInfo').textContent=`${dateLabel(k)} · ${list.length} миссий · ${xp} XP`}
});
/* ---------- Contribution graph ---------- */
let heatSig='';
function renderHeat(){
 const sig=state.completed.length+'|'+today();if(sig===heatSig)return;heatSig=sig;
 const by={};state.completed.forEach(x=>{by[x.date]=(by[x.date]||0)+x.xp});
 const end=new Date();end.setHours(12,0,0,0);const d=new Date(end);d.setDate(d.getDate()-364);d.setDate(d.getDate()-(d.getDay()+6)%7);
 const lvl=xp=>xp<=0?0:xp<=5?1:xp<=15?2:xp<=30?3:4;
 let cols='',pm=-1,wi=0;
 while(d<=end){let col='',lab='';
  for(let r=0;r<7;r++){const k=fmt(d);
   if(r===0&&d.getMonth()!==pm){pm=d.getMonth();lab=d.toLocaleDateString('ru-RU',{month:'short'}).replace('.','')}
   col+=d>end?'<i class="hc off"></i>':`<i class="hc" data-d="${k}" data-l="${lvl(by[k]||0)}"></i>`;d.setDate(d.getDate()+1)}
  cols+=`<div class="hw" style="--i:${wi++}"><b>${lab}</b>${col}</div>`}
 const el=$('monthGraph');
 el.innerHTML=`<div class="heatwrap" id="heatScroll"><div class="heat"><div class="hd"><b></b><span>Пн</span><span></span><span>Ср</span><span></span><span>Пт</span><span></span><span></span></div>${cols}</div></div><div class="tiny" id="heatInfo" style="margin-top:8px;color:var(--accent)">Нажми на день, чтобы увидеть подробности</div><div class="legend tiny muted"><span>меньше</span><i class="hc" data-l="0"></i><i class="hc" data-l="1"></i><i class="hc" data-l="2"></i><i class="hc" data-l="3"></i><i class="hc" data-l="4"></i><span>больше</span></div>`;
 const sc=$('heatScroll');sc.scrollLeft=sc.scrollWidth;
}
let updating=false;
function showUpdate(w){
 if($('updBar'))return;
 const b=document.createElement('div');b.id='updBar';b.className='upd';
 b.innerHTML='<span>Доступно обновление приложения</span><button class="btn small" id="updBtn">ОБНОВИТЬ</button>';
 document.body.appendChild(b);
 $('updBtn').onclick=()=>{updating=true;save();setTimeout(()=>w.postMessage({type:'SKIP_WAITING'}),200)};
}

/* ---------- Ранги: уникальные знаки ---------- */
const crestPal=[['#9aa4ad','#4b5563'],['#7dd3fc','#2563eb'],['#6ee7b7','#059669'],['#fde047','#d97706'],['#fb923c','#dc2626'],['#f472b6','#9333ea'],['#a78bfa','#4f46e5'],['#22d3ee','#0ea5e9'],['#bef264','#16a34a'],['#fbbf24','#ef4444'],['#fff7ae','#f59e0b']];
const crestSides=[4,5,6,6,8,8,10,10,12,12,14];
const poly=(n,r,rot)=>Array.from({length:n},(_,k)=>{const a=(rot+360*k/n)*Math.PI/180;return (24+r*Math.cos(a)).toFixed(1)+','+(24+r*Math.sin(a)).toFixed(1)}).join(' ');
const star=(n,R,r)=>Array.from({length:2*n},(_,k)=>{const a=(-90+180*k/n)*Math.PI/180,d=k%2?r:R;return (24+d*Math.cos(a)).toFixed(1)+','+(24+d*Math.sin(a)).toFixed(1)}).join(' ');
let crestN=0;
const sp=(cx,cy,R,q,n)=>Array.from({length:2*n},(_,k)=>{const t=(-90+180*k/n)*Math.PI/180,d=k%2?q:R;return (cx+d*Math.cos(t)).toFixed(1)+','+(cy+d*Math.sin(t)).toFixed(1)}).join(' ');
function crest(i){
 const id='cg'+(crestN++),[a,b]=crestPal[i];
 const P=(cx,cy,R,q,n=5)=>sp(cx,cy,R,q,n);
 const sh='<path d="M24 3 40 8v15c0 9-7 16-16 21C15 39 8 32 8 23V8z"/>',hole='<path d="M24 9 35 13v10c0 6-5 11-11 14-6-3-11-8-11-14V13z" fill="#0b0e10"/>';
 const ch=y=>`<path d="M9 ${y}l15 9 15-9v6l-15 9-15-9z"/>`,wings='<path d="M7 12 1 18v12l6 6 4-8zM41 12l6 6v12l-6 6-4-8z"/>';
 const G=[
  '<rect x="12" y="10" width="24" height="4"/><path d="M10 26l14 9 14-9v-6l-14 9-14-9z"/>',
  ch(8)+ch(20),
  '<path d="M24 2l4 5-4 5-4-5z"/>'+ch(14)+ch(22)+ch(30),
  sh+hole+'<rect x="16" y="15" width="16" height="4"/><rect x="16" y="22" width="16" height="4"/><rect x="16" y="29" width="16" height="4"/>',
  '<path d="M24 3 38 24 24 45 10 24z"/><path d="M24 9 33 24 24 39 15 24z" fill="#0b0e10"/><polygon points="'+P(24,24,9,3,4)+'"/><path d="M7 15 3 24l4 9M41 15l4 9-4 9" fill="none" stroke="url(#'+id+')" stroke-width="3" stroke-linecap="round"/>',
  sh+hole+'<polygon points="'+P(24,21,8,3.4)+'"/><polygon points="'+P(24,32,4.5,2)+'"/>',
  '<path d="M24 0l4 8h-8z"/>'+sh+hole+'<polygon points="'+P(24,24,10,4)+'"/>',
  wings+sh+hole+'<path d="M24 19l5 6-5 6-5-6z"/><polygon points="'+P(13,6,3.4,1.5)+'"/><polygon points="'+P(24,2,3.4,1.5)+'"/><polygon points="'+P(35,6,3.4,1.5)+'"/>',
  wings+sh+hole+'<polygon points="'+P(24,24,9,3.6)+'"/><path d="M24 0l3 4-3 4-3-4z"/>',
  '<circle cx="24" cy="27" r="17" fill="none" stroke="url(#'+id+')" stroke-width="4" stroke-dasharray="5 2"/><circle cx="24" cy="27" r="11" fill="#0b0e10"/><polygon points="'+P(24,27,9,3.6)+'"/><path d="M13 12l5 4 6-10 6 10 5-4-2 8H15z"/>',
  '<path d="M8 36C3 24 6 14 13 11M40 36C45 24 42 14 35 11" fill="none" stroke="url(#'+id+')" stroke-width="3" stroke-linecap="round"/><path d="M14 4l4 4 6-7 6 7 4-4-2 9H16z"/><polygon points="'+P(24,29,12,5)+'"/>'
 ];
 return `<svg viewBox="0 0 48 48"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><g fill="url(#${id})">${G[i]}</g></svg>`;
}
/* ---------- Активность за 7 дней ---------- */
function renderWeek(){
 const by={},dn=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
 state.completed.forEach(x=>{by[x.date]=(by[x.date]||0)+1});
 let h='';
 for(let i=6;i>=0;i--){const k=daysAgo(i),n=by[k]||0,l=n===0?0:n<2?1:n<4?2:n<6?3:4;
  h+=`<button class="wd${i===0?' today':''}" data-wd="${k}" data-l="${l}" aria-label="${dateLabel(k)}: ${n}"><small>${dn[new Date(k+'T12:00:00').getDay()]}</small><b>${n}</b><small>${new Date(k+'T12:00:00').getDate()}</small></button>`}
 $('weekGraph').innerHTML=h;
}
function openDay(k){
 const list=state.completed.filter(x=>x.date===k),xp=list.reduce((s,x)=>s+x.xp,0);
 $('modal').innerHTML=`<h3>${dateLabel(k)}</h3><div class="tiny muted">${list.length} миссий · ${xp} XP</div>${list.map(x=>`<div class="mission"><div style="flex:1"><strong>${esc(x.title)}</strong><div class="missionmeta">${esc(categories[x.category]||x.category)}</div></div><span class="xp">+${x.xp} XP</span></div>`).join('')||'<div class="empty">В этот день миссий не было.</div>'}<div class="row" style="margin-top:14px"><button class="btn ghost" onclick="closeModal()">Закрыть</button></div>`;
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
boot();
