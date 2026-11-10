'use strict';
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const fmt=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>fmt(new Date());
const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return fmt(d)};
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const categories={HEALTH:'Здоровье',EDUCATION:'Образование',PRODUCTIVITY:'Продуктивность',FITNESS:'Активность',CREATIVE:'Творчество',PERSONAL:'Личное'};
const rankNames=['RECRUIT','PRIVATE','CORPORAL','SERGEANT','LIEUTENANT','CAPTAIN','MAJOR','COLONEL','COMMANDER','ELITE','LEGENDARY'];
// Порог XP для каждого ранга (RECRUIT начинается с 0)
const rankThresholds=[0,100,200,350,550,800,1100,1500,2000,2700,3500];
const rankIcons=['Ⅰ','Ⅱ','Ⅲ','✦','✧','◆','◇','⬟','⬢','✪','★'];
const MAX_RANK=rankNames.length-1;
const skillMap={HEALTH:'FITNESS',FITNESS:'FITNESS',EDUCATION:'INTELLIGENCE',PRODUCTIVITY:'DISCIPLINE',CREATIVE:'CREATIVITY',PERSONAL:'SOCIAL'};
const skillNames={INTELLIGENCE:'INTELLIGENCE',DISCIPLINE:'DISCIPLINE',FITNESS:'FITNESS',CREATIVITY:'CREATIVITY',SOCIAL:'SOCIAL'};
const DAILY_LIMIT=10, XP_PER_MISSION=5, STORAGE_KEY='lifeProtocol';
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const medalDefs=[
 ['FIRST BLOOD','Первая выполненная миссия',s=>s.completed.length>=1,'✦'],
 ['WEEK WARRIOR','Активность в течение 7 разных дней',s=>activeDays(s)>=7,'▦'],
 ['CENTURY','100 выполненных миссий',s=>s.completed.length>=100,'Ⅰ'],
 ['PERFECTIONIST','10 миссий за один день',s=>Object.values(groupByDay(s.completed)).some(a=>a.length>=10),'◇'],
 ['DISCIPLINE','7 дней подряд с активностью',s=>bestStreak(s)>=7,'⬡'],
 ['VETERAN','1000 заработанных XP',s=>s.xp>=1000,'★'],
 ['SPECIALIST','50 миссий одной категории',s=>Object.values(countCats(s.completed)).some(n=>n>=50),'⌖']
];
const medalOk=(def,s=state)=>s.unlocked.includes(def[0])||def[2](s);

/* ---------- ID ---------- */
function uid(){
 try{if(window.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID()}catch(e){}
 return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
const cleanId=v=>String(v==null?'':v).replace(/[^\w-]/g,'').slice(0,80);

/* ---------- Состояние ---------- */
const defaults=()=>({v:2,callsign:'OPERATOR',created:new Date().toISOString(),xp:0,missions:[],completed:[],reports:[],skills:{},unlocked:[],lastRank:0});
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
 s.callsign=String(s.callsign==null?'':s.callsign).trim().slice(0,18)||'OPERATOR';
 s.xp=Number.isFinite(+s.xp)?Math.max(0,+s.xp):0;
 if(isNaN(new Date(s.created).getTime()))s.created=new Date().toISOString();
 s.missions=(Array.isArray(s.missions)?s.missions:[]).map(cleanMission).filter(Boolean);
 s.completed=(Array.isArray(s.completed)?s.completed:[]).map(cleanDone).filter(Boolean);
 s.reports=(Array.isArray(s.reports)?s.reports:[]).filter(r=>r&&DATE_RE.test(String(r.date))).map(r=>({date:r.date,text:String(r.text==null?'':r.text)})).slice(0,30);
 const sk={};if(s.skills&&typeof s.skills==='object')Object.keys(skillNames).forEach(k=>{if(Number.isFinite(+s.skills[k]))sk[k]=Math.max(0,+s.skills[k])});s.skills=sk;
 const names=medalDefs.map(m=>m[0]);
 s.unlocked=(Array.isArray(s.unlocked)?s.unlocked:[]).filter((n,i,a)=>names.includes(n)&&a.indexOf(n)===i);
 if(legacy)migrateLegacy(s);
 s.v=2;
 s.lastRank=rankIndex(s.xp);
 return s;
}
let state=load();
function load(){
 let raw=null;
 try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){}
 return normalize(raw);
}
let saveWarned=false;
function save(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
 catch(e){if(!saveWarned){saveWarned=true;toast('Не удалось сохранить данные: хранилище недоступно')}}
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
 $('rankName').textContent=rankNames[r.i];$('rankLevel').textContent='LVL '+String(r.i+1).padStart(2,'0');$('rankCrest').textContent=rankIcons[r.i];
 $('xpText').textContent=r.i===MAX_RANK?state.xp+' XP — MAX RANK':`${state.xp-r.start} / ${r.end-r.start} XP`;
 $('xpPercent').textContent=Math.round(r.pct)+'%';$('rankBar').style.width=r.pct+'%';
 $('totalXp').textContent=state.xp;$('totalDone').textContent=state.completed.length;
 $('streak').innerHTML=currentStreak()+' <small style="font-size:11px">D</small>';
 $('missionCount').textContent=doneToday+' / '+missionsToday.length;
 $('rankName2').textContent=rankNames[r.i];$('rankCrest2').textContent=rankIcons[r.i];
 $('rankDesc').textContent=r.i===MAX_RANK?'Максимальный ранг достигнут':`${Math.max(0,r.end-state.xp)} XP до следующего ранга`;
 renderMissions();renderGraphs();renderRanks();renderSkills();renderMedals();renderStats();renderProfile();renderHistory();renderReports();
}
function missionHTML(m){
 return `<div class="mission"><button class="check ${m.done?'done':''}" onclick="toggleMission('${m.id}')" aria-label="Выполнить">${m.done?'✓':''}</button><div style="min-width:0;flex:1"><div class="missiontitle" style="${m.done?'text-decoration:line-through;color:#748087':''}">${esc(m.title)}</div><div class="missionmeta">${esc(categories[m.category]||m.category)} · ${m.repeat==='daily'?'DAILY':'ONE-TIME'}</div></div><span class="xp">${m.done?'+'+XP_PER_MISSION+' XP':XP_PER_MISSION+' XP'}</span><button class="iconbtn" style="padding:5px 8px" onclick="editMission('${m.id}')" aria-label="Редактировать">⋯</button></div>`;
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
 if(r>state.lastRank){state.lastRank=r;msgs.push('RANK UP // '+rankNames[r])}else msgs.push('MISSION COMPLETE // +'+XP_PER_MISSION+' XP');
 checkMedals().forEach(n=>msgs.push('ACHIEVEMENT UNLOCKED // '+n));
 save();render();toast(msgs.join('  ·  '));
}
function openMission(m=null){
 $('modal').innerHTML=`<h3>${m?'EDIT MISSION':'NEW MISSION'}</h3><label>Название миссии</label><input class="field" id="mTitle" maxlength="70" placeholder="Например: прочитать 10 страниц" value="${m?esc(m.title):''}"><label>Категория</label><select class="field" id="mCategory">${Object.entries(categories).map(([k,v])=>`<option value="${k}" ${m&&m.category===k?'selected':''}>${v}</option>`).join('')}</select><label>Повторение</label><select class="field" id="mRepeat"><option value="once">Однократно</option><option value="daily" ${m&&m.repeat==='daily'?'selected':''}>Каждый день</option></select><div class="row" style="margin-top:17px"><button class="btn ghost" onclick="closeModal()">CANCEL</button><button class="btn" onclick="saveMission('${m?m.id:''}')">SAVE MISSION</button></div>${m?`<button class="btn secondary small" style="margin-top:12px;color:var(--red);border-color:var(--red)" onclick="deleteMission('${m.id}')">${m.repeat==='daily'?'DELETE SERIES':'DELETE MISSION'}</button>`:''}`;
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
 save();closeModal();render();toast('MISSION SAVED');
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
 $('weekGraph').innerHTML=week.map(cell).join('');
 $('monthGraph').innerHTML=month.map(cell).join('');
}
function renderRanks(){
 const current=rankIndex(state.xp);
 $('rankList').innerHTML=rankNames.map((n,i)=>`<div class="panel" style="padding:11px;display:flex;align-items:center;gap:12px;opacity:${i<=current?1:.45}"><div class="crest" style="width:43px;height:43px;font-size:18px">${rankIcons[i]}</div><div style="flex:1"><strong>${n}</strong><div class="tiny muted">${rankThresholds[i]} XP REQUIRED</div></div><span class="tag">${i<current?'UNLOCKED':i===current?'CURRENT':'LOCKED'}</span></div>`).join('');
}
function renderSkills(){
 const desc={INTELLIGENCE:'Обучение и новые знания',DISCIPLINE:'Планы и организация',FITNESS:'Активность и здоровье',CREATIVITY:'Творчество и проекты',SOCIAL:'Общение и личные дела'};
 $('skillList').innerHTML=Object.keys(skillNames).map(n=>{
  const xp=state.skills[n]||0,lvl=Math.floor(xp/10)+1,p=xp%10*10;
  return `<div class="skill"><div class="row"><strong>${n}</strong><span class="tag">LVL ${String(lvl).padStart(2,'0')}</span></div><div class="sub">${desc[n]}</div><div class="row tiny muted" style="margin-top:9px"><span>${xp} SKILL POINTS</span><span>${p}% TO NEXT LEVEL</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join('');
}
// Возвращает названия медалей, разблокированных прямо сейчас
function checkMedals(){
 const fresh=[];
 medalDefs.forEach(([name,,fn])=>{if(!state.unlocked.includes(name)&&fn(state)){state.unlocked.push(name);fresh.push(name)}});
 return fresh;
}
function renderMedals(){
 $('medalGrid').innerHTML=medalDefs.map(def=>{const ok=medalOk(def);return `<div class="medal ${ok?'':'locked'}"><div class="medalicon">${def[3]}</div><strong>${def[0]}</strong><div class="sub">${def[1]}</div><div class="tiny ${ok?'accent':'muted'}" style="margin-top:8px">${ok?'UNLOCKED':'LOCKED'}</div></div>`}).join('');
 const n=medalDefs.filter(d=>medalOk(d)).length;
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
 $('callsignView').textContent=state.callsign;$('profileRank').textContent=rankNames[rankIndex(state.xp)];
 $('profileXp').textContent=state.xp;$('profileMissions').textContent=state.completed.length;
 $('profileMedals').textContent=medalDefs.filter(d=>medalOk(d)).length;
 $('bestStreak').textContent=bestStreak(state)+' days';$('createdAt').textContent=new Date(state.created).toLocaleDateString('ru-RU');
}
function renderHistory(){
 $('historyCount').textContent=state.completed.length;
 $('historyList').innerHTML=state.completed.slice().reverse().map(x=>`<div class="mission"><div style="flex:1"><strong>${esc(x.title)}</strong><div class="missionmeta">${dateLabel(x.date)} · ${esc(categories[x.category]||x.category)}</div></div><span class="xp">+${x.xp} XP</span></div>`).join('')||'<div class="empty">История пока пуста.</div>';
}

/* ---------- Навигация и модалки ---------- */
const parentScreen={achievements:'profile',stats:'profile',history:'profile'};
function showScreen(id){
 const navId=parentScreen[id]||id;
 document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
 document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.screen===navId));
 window.scrollTo({top:0,behavior:'smooth'});
 if(id==='dashboard')generateBriefing();
}
function showModal(){$('modalBack').classList.add('show')}
function closeModal(){$('modalBack').classList.remove('show')}
function openSettings(){
 $('modal').innerHTML=`<h3>SYSTEM SETTINGS</h3><label>CALLSIGN</label><input class="field" id="settingCall" maxlength="18" value="${esc(state.callsign)}"><p class="sub">Данные сохраняются в локальном хранилище браузера. Установка: открой сайт в браузере телефона и выбери «Добавить на главный экран».</p><div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">CLOSE</button><button class="btn" onclick="saveSettings()">SAVE</button></div>`;
 showModal();
}
function saveSettings(){state.callsign=$('settingCall').value.trim()||'OPERATOR';save();closeModal();render()}
function editProfile(){openSettings()}

/* ---------- Экспорт / импорт ---------- */
function exportData(){
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
   state=normalize(d);save();render();toast('BACKUP RESTORED');
  }catch(_){toast('INVALID BACKUP')}
  input.value=''; // позволяет импортировать тот же файл повторно
 };
 r.onerror=()=>{toast('INVALID BACKUP');input.value=''};
 r.readAsText(f);
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* ---------- Запуск ---------- */
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
// PWA может часами лежать в фоне: пересчитываем день при возврате и по таймеру
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&today()!==currentDay)render()});
setInterval(()=>{if(today()!==currentDay)render()},30000);
checkMedals();render();generateBriefing();
