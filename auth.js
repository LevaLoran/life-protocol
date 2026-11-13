/* FORM. v0.07 — вход через Google / GitHub (Supabase Auth, PKCE).
   Секретов в клиенте нет: client secret провайдеров хранятся в Supabase, здесь только публичный anon-ключ. */
(function(){
'use strict';
const $=id=>document.getElementById(id),H=document.documentElement;
const OK_URL=/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i,okCfg=c=>!!c&&OK_URL.test(c.supabaseUrl||'')&&String(c.supabaseAnonKey||'').length>20;
// конфиг берётся из config.js (деплой) или, если там пусто, из формы на экране входа (localStorage браузера; ключ публичный)
let local=null;try{local=JSON.parse(localStorage.getItem('formCfg')||'null')}catch(_){}
const C=okCfg(window.FORM_CONFIG)?window.FORM_CONFIG:(okCfg(local)?local:(window.FORM_CONFIG||{}));
const fromLocal=C===local;window.FORM_CONFIG=C;
const SITE=location.origin+location.pathname.replace(/index\.html$/,'');
const RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
const PROV={google:'Google',github:'GitHub'};
const configured=okCfg(C);
const urlErr=(()=>{try{const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));return q.get('error_description')||h.get('error_description')||''}catch(_){return ''}})();
let sb=null,user=null,entered=false,checked=false,lastCheck=Date.now();
const setAuth=s=>{H.dataset.auth=s};
function showErr(t){const e=$('authErr');if(!e)return;e.textContent=t||'';e.hidden=!t}
function busy(p){document.querySelectorAll('.au-btn').forEach(b=>{b.disabled=!!p||b.dataset.off==='1';b.classList.toggle('busy',!!p&&b.dataset.provider===p)})}
function cleanUrl(){try{if(/[?&](code|error|error_description)=/.test(location.search)||/access_token|error_description/.test(location.hash))history.replaceState(null,'',location.pathname)}catch(_){}}

function showLogin(problem){
  setAuth('out');
  const off=!!problem;
  document.querySelectorAll('.au-btn').forEach(b=>{b.dataset.off=off?'1':'0';b.disabled=off});
  if(problem==='config')showErr('Вход ещё не подключён к Supabase. Открой «Подключить Supabase» ниже и вставь Project URL и ключ.');
  else if(problem==='lib')showErr('Не удалось загрузить модуль входа. Проверьте подключение к интернету и обновите страницу.');
  else if(urlErr)showErr('Вход не выполнен: '+urlErr);
  else showErr('');
}

async function check(){
  if(!configured)return showLogin('config');
  if(!window.supabase||!window.supabase.createClient)return showLogin('lib');
  sb=window.supabase.createClient(C.supabaseUrl.replace(/\/$/,''),C.supabaseAnonKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'form-auth'}});
  sb.auth.onAuthStateChange((ev,session)=>{
    // вход засчитывается только после серверной проверки в check(), поэтому до неё события игнорируются
    if(ev==='SIGNED_OUT'&&entered)setTimeout(()=>location.replace(location.pathname),0);
    else if(ev==='SIGNED_IN'&&checked&&!entered&&session)setTimeout(()=>enter(session.user),0);
  });
  let session=null;
  try{session=(await sb.auth.getSession()).data.session}catch(_){}
  cleanUrl();
  if(session){
    if(navigator.onLine===false){checked=true;return enter(session.user)} // офлайн: проверить на сервере нельзя, берём сохранённую сессию
    const {data,error}=await sb.auth.getUser(); // токен проверяется сервером
    if(!error&&data&&data.user){checked=true;return enter(data.user)}
    if(error&&(error.name==='AuthRetryableFetchError'||!error.status)){checked=true;return enter(session.user)} // сеть недоступна, а не сессия недействительна
    try{await sb.auth.signOut({scope:'local'})}catch(_){}
  }
  checked=true;showLogin();
}

async function login(provider){
  if(!sb)return;
  showErr('');busy(provider);
  try{
    const {error}=await sb.auth.signInWithOAuth({provider,options:{redirectTo:SITE,queryParams:provider==='google'?{prompt:'select_account'}:undefined}});
    if(error)throw error;
  }catch(e){busy(null);showErr('Не удалось начать вход через '+PROV[provider]+'. Попробуйте ещё раз.')}
}

async function enter(u){
  if(entered)return;entered=true;user=u;
  try{window.formSetUser(u)}catch(e){console.error(e)}
  H.classList.add('hydrating');setAuth('in');renderAccount();
  const t0=Date.now();
  try{await window.__boot()}catch(e){console.error(e)}
  setTimeout(()=>H.classList.remove('hydrating'),RM()?0:Math.max(0,420-(Date.now()-t0)));
}

function renderAccount(){
  const el=$('accountCard');if(!el||!user)return;
  const m=user.user_metadata||{},prov=(user.app_metadata&&user.app_metadata.provider)||'',name=m.full_name||m.name||m.user_name||'',mail=user.email||m.email||'';
  el.innerHTML=`<div class="row start"><div style="min-width:0"><div class="acc-n">${esc(name||mail||'Аккаунт')}</div><div class="tiny" style="word-break:break-all">${esc(mail)}${prov?(mail?' · ':'')+esc(PROV[prov]||prov):''}</div></div><button class="btn ghost small" id="signOutBtn">Выйти</button></div>`;
  $('signOutBtn').onclick=window.formSignOut;
}

window.formUser=()=>user;
window.formSb=()=>sb;
window.formSignOut=async function(){
  try{save()}catch(_){}
  const b=$('signOutBtn');if(b){b.disabled=true;b.textContent='…'}
  try{await sb.auth.signOut()}catch(_){try{await sb.auth.signOut({scope:'local'})}catch(__){}}
  location.replace(location.pathname);
};

// повторная проверка сессии, если приложение долго лежало в фоне
document.addEventListener('visibilitychange',async()=>{
  if(document.hidden||!entered||!sb||navigator.onLine===false||Date.now()-lastCheck<300000)return;
  lastCheck=Date.now();
  try{const {error}=await sb.auth.getUser();if(error&&error.name!=='AuthRetryableFetchError'&&error.status)await window.formSignOut()}catch(_){}
});
window.addEventListener('pageshow',e=>{if(e.persisted)busy(null)});
document.querySelectorAll('.au-btn').forEach(b=>b.addEventListener('click',()=>login(b.dataset.provider)));
const setup=$('auSetup');
if(setup){
  setup.hidden=!(!configured||fromLocal);
  if(!configured)setup.open=true;
  $('cfgRedirect').textContent='Адрес сайта: '+SITE;
  $('cfgReset').hidden=!fromLocal;
  const role=k=>{try{return JSON.parse(atob(k.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role}catch(_){return ''}};
  $('cfgSave').onclick=()=>{
    const u=$('cfgUrl').value.trim().replace(/\/$/,''),k=$('cfgKey').value.trim();
    if(!okCfg({supabaseUrl:u,supabaseAnonKey:k}))return showErr('Проверь данные: URL вида https://xxxx.supabase.co и полный ключ anon / publishable.');
    if(/service_role|secret/i.test(k)||role(k)==='service_role')return showErr('Это секретный ключ. Нужен публичный anon / publishable ключ.');
    try{localStorage.setItem('formCfg',JSON.stringify({supabaseUrl:u,supabaseAnonKey:k}))}catch(_){return showErr('Браузер не даёт сохранить настройки (приватный режим?).')}
    location.reload();
  };
  $('cfgReset').onclick=()=>{try{localStorage.removeItem('formCfg')}catch(_){}location.reload()};
}
check().catch(e=>{console.error(e);showLogin('lib')});
})();
