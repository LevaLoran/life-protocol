/* FORM. v0.09 — вход через GitHub и по почте с паролем (Supabase Auth).
   Подключение к Supabase задаёт только владелец (config.js / переменные GitHub). Формы подключения в приложении нет.
   Секретов в клиенте нет: client secret GitHub хранится в Supabase, здесь только публичный anon / publishable ключ. */
(function(){
'use strict';
const $=id=>document.getElementById(id),H=document.documentElement;
const RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
const PROV={github:'GitHub',email:'Почта'};
const C=window.FORM_CONFIG||{};
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(C.supabaseUrl||'')&&String(C.supabaseAnonKey||'').length>20;
try{localStorage.removeItem('formCfg')}catch(_){} // в 0.08 настройки можно было ввести в браузере: теперь они игнорируются
const SITE=location.origin+location.pathname.replace(/index\.html$/,'');
const urlErr=(()=>{try{const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));return q.get('error_description')||h.get('error_description')||''}catch(_){return ''}})();
let sb=null,user=null,entered=false,checked=false,recovering=false,mode='in',lastCheck=Date.now();
const setAuth=s=>{H.dataset.auth=s};
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function say(t,ok){const e=$('authErr'),o=$('authOk');if(e){e.textContent=ok?'':(t||'');e.hidden=ok||!t}if(o){o.textContent=ok?t:'';o.hidden=!ok||!t}}
function busy(p){
  document.querySelectorAll('.au-btn').forEach(b=>{b.disabled=!!p||b.dataset.off==='1';b.classList.toggle('busy',!!p&&b.dataset.provider===p)});
  ['auSubmit','recSubmit','auForgot'].forEach(id=>{const b=$(id);if(b){b.disabled=!!p||b.dataset.off==='1';b.classList.toggle('busy',p==='mail'&&id!=='auForgot')}});
}
function cleanUrl(){try{if(/[?&](code|error|error_description)=/.test(location.search)||/access_token|error_description/.test(location.hash))history.replaceState(null,'',location.pathname)}catch(_){}}
function human(e){
  const c=e&&e.code||'',m=String(e&&e.message||'');
  if(e&&(e.name==='AuthRetryableFetchError'||!navigator.onLine))return 'Нет соединения. Проверьте интернет и повторите.';
  if(c==='invalid_credentials'||/invalid login/i.test(m))return 'Неверная почта или пароль.';
  if(c==='email_not_confirmed'||/not confirmed/i.test(m))return 'Почта не подтверждена: откройте письмо со ссылкой и войдите снова.';
  if(c==='user_already_exists'||/already registered/i.test(m))return 'Этот адрес уже зарегистрирован. Войдите или восстановите пароль.';
  if(c==='weak_password'||/password should/i.test(m))return 'Пароль слишком простой: минимум 8 символов, лучше с цифрами и разными буквами.';
  if(c==='same_password')return 'Новый пароль должен отличаться от старого.';
  if(c==='signup_disabled'||/signups not allowed/i.test(m))return 'Регистрация закрыта владельцем приложения.';
  if(c==='email_address_invalid')return 'Некорректный адрес почты.';
  if(/rate limit|too many|over_.*limit/i.test(c+m)||e&&e.status===429)return 'Слишком много попыток. Подождите немного и повторите.';
  if(/not authorized/i.test(m))return 'Письмо не отправлено: на проекте не настроена почта для рассылки (см. README).';
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
function showLogin(problem){
  setAuth('out');
  const off=!!problem;
  document.querySelectorAll('.au-btn,#auSubmit,#auForgot').forEach(b=>{b.dataset.off=off?'1':'0';b.disabled=off});
  ['auEmail','auPass','auPass2'].forEach(id=>{const i=$(id);if(i)i.disabled=off});
  if(problem==='config')say('Вход временно недоступен: приложение ещё не подключено к серверу. Подключение выполняет владелец.');
  else if(problem==='lib')say('Не удалось загрузить модуль входа. Проверьте интернет и обновите страницу.');
  else if(urlErr)say('Вход не выполнен: '+urlErr);
  else say('');
}
function setMode(m){
  mode=m;const up=m==='up';
  document.querySelectorAll('.au-tabs button').forEach(b=>{const on=b.dataset.mode===m;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  $('auPass2').hidden=!up;$('auForgot').hidden=up;
  $('auSubmit').firstChild.textContent=up?'Создать аккаунт':'Войти';
  $('auPass').autocomplete=up?'new-password':'current-password';
  $('auPass').placeholder=up?'Пароль (от 8 символов)':'Пароль';
  say('');
}
function showRecovery(){
  setAuth('out');$('authCard').classList.add('rec');say('');
  const t=$('recPass');if(t)t.focus();
}

async function check(){
  if(!configured)return showLogin('config');
  if(!window.supabase||!window.supabase.createClient)return showLogin('lib');
  sb=window.supabase.createClient(C.supabaseUrl.replace(/\/$/,''),C.supabaseAnonKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'form-auth'}});
  sb.auth.onAuthStateChange((ev,session)=>{
    // вход засчитывается только после проверки в check() или явного входа пользователем; обработчик ничего не вызывает у supabase синхронно
    if(ev==='PASSWORD_RECOVERY'){recovering=true;if(checked&&!entered)setTimeout(showRecovery,0)}
    else if(ev==='SIGNED_OUT'&&entered)setTimeout(()=>location.replace(location.pathname),0);
    else if(ev==='SIGNED_IN'&&checked&&!entered&&!recovering&&session)setTimeout(()=>enter(session.user),0);
  });
  let session=null;
  try{session=(await sb.auth.getSession()).data.session}catch(_){}
  cleanUrl();
  if(recovering&&session){checked=true;return showRecovery()} // пришли по ссылке «забыли пароль»: сначала новый пароль, в приложение не пускаем
  if(session){
    if(navigator.onLine===false){checked=true;return enter(session.user)} // офлайн: проверить на сервере нельзя, берём сохранённую сессию
    const {data,error}=await sb.auth.getUser(); // токен проверяется сервером
    if(!error&&data&&data.user){checked=true;return enter(data.user)}
    if(error&&(error.name==='AuthRetryableFetchError'||!error.status)){checked=true;return enter(session.user)}
    try{await sb.auth.signOut({scope:'local'})}catch(_){}
  }
  checked=true;showLogin();
}

async function github(){
  if(!sb)return;
  say('');busy('github');
  try{
    const {error}=await sb.auth.signInWithOAuth({provider:'github',options:{redirectTo:SITE}});
    if(error)throw error;
  }catch(e){busy(null);say('Не удалось начать вход через GitHub. Попробуйте ещё раз.')}
}

async function submitMail(ev){
  ev.preventDefault();if(!sb)return;
  const email=$('auEmail').value.trim(),pass=$('auPass').value,up=mode==='up';
  if(!EMAIL.test(email))return say('Введите корректный адрес почты.');
  if(!pass)return say('Введите пароль.');
  if(up){
    if(pass.length<8)return say('Пароль должен быть не короче 8 символов.');
    if(pass!==$('auPass2').value)return say('Пароли не совпадают.');
  }
  say('');busy('mail');
  try{
    if(up){
      const {data,error}=await sb.auth.signUp({email,password:pass,options:{emailRedirectTo:SITE}});
      if(error)throw error;
      if(data.session){busy(null);return enter(data.user)} // подтверждение почты отключено: аккаунт сразу готов
      if(data.user&&Array.isArray(data.user.identities)&&!data.user.identities.length){busy(null);return say('Этот адрес уже зарегистрирован. Войдите или восстановите пароль.')}
      busy(null);setMode('in');say('Письмо с подтверждением отправлено на '+email+'. Откройте ссылку в письме, затем войдите.',true);
    }else{
      const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error)throw error;
      busy(null);enter(data.user);
    }
  }catch(e){busy(null);say(human(e))}
}

let forgotAt=0;
async function forgot(){
  if(!sb)return;
  const email=$('auEmail').value.trim();
  if(!EMAIL.test(email))return say('Введите адрес почты в поле выше, и мы отправим ссылку для сброса пароля.');
  if(Date.now()-forgotAt<30000)return say('Ссылка уже отправлена. Подождите 30 секунд перед повтором.');
  say('');busy('mail');
  try{
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:SITE});
    if(error)throw error;
    forgotAt=Date.now();say('Если такой адрес зарегистрирован, на него отправлена ссылка для сброса пароля.',true);
  }catch(e){say(human(e))}
  busy(null);
}

async function submitRecovery(ev){
  ev.preventDefault();if(!sb)return;
  const p=$('recPass').value;
  if(p.length<8)return say('Пароль должен быть не короче 8 символов.');
  if(p!==$('recPass2').value)return say('Пароли не совпадают.');
  say('');busy('mail');
  try{
    const {data,error}=await sb.auth.updateUser({password:p});
    if(error)throw error;
    recovering=false;$('authCard').classList.remove('rec');busy(null);enter(data.user);
  }catch(e){busy(null);say(human(e))}
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
  el.innerHTML=`<div class="row start"><div style="min-width:0"><div class="acc-n">${esc(name||mail||'Аккаунт')}</div><div class="tiny" style="word-break:break-all">${esc(mail)}${prov?(mail?' · ':'')+esc(PROV[prov]||prov):''}</div></div><span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${prov==='email'?'<button class="btn ghost small" id="passBtn">Пароль</button>':''}<button class="btn ghost small" id="signOutBtn">Выйти</button></span></div>`;
  $('signOutBtn').onclick=window.formSignOut;
  const pb=$('passBtn');if(pb)pb.onclick=openPass;
}
function openPass(){
  $('modal').innerHTML='<h3>Смена пароля</h3><label for="npw">Новый пароль</label><input class="field" id="npw" type="password" autocomplete="new-password" placeholder="От 8 символов"><label for="npw2">Повторите пароль</label><input class="field" id="npw2" type="password" autocomplete="new-password"><div class="row" style="margin-top:17px"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn" id="npwSave">Сохранить</button></div>';
  showModal();
  $('npwSave').onclick=async()=>{
    const a=$('npw').value;
    if(a.length<8)return toast('Пароль не короче 8 символов');
    if(a!==$('npw2').value)return toast('Пароли не совпадают');
    $('npwSave').disabled=true;
    try{const {error}=await sb.auth.updateUser({password:a});if(error)throw error;closeModal();toast('Пароль изменён')}
    catch(e){$('npwSave').disabled=false;toast(human(e))}
  };
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
const gh=document.querySelector('.au-btn[data-provider=github]');if(gh)gh.addEventListener('click',github);
document.querySelectorAll('.au-tabs button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('authForm').addEventListener('submit',submitMail);$('recForm').addEventListener('submit',submitRecovery);$('auForgot').addEventListener('click',forgot);
setMode('in');
check().catch(e=>{console.error(e);showLogin('lib')});
})();
