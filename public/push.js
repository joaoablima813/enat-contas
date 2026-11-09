/* Notificações no telemóvel com a app fechada (Web Push).
   Cada dispositivo ativa os avisos uma vez: o servidor guarda a subscrição e envia, a cada minuto, as chamadas em hora,
   as visitas marcadas, as leads novas do email e as respostas dos clientes aos orçamentos.
   No iPhone / iPad só funciona com a app instalada no ecrã principal (iOS 16.4 ou mais recente). */
let PUSH_ST=null,PUSH_MSG='';
const pushIOS=()=>typeof navigator!=='undefined'&&/iphone|ipad|ipod/i.test(navigator.userAgent||'');
const pushStandalone=()=>typeof window!=='undefined'&&(window.navigator?.standalone||window.matchMedia?.('(display-mode: standalone)')?.matches);
const pushSupported=()=>typeof navigator!=='undefined'&&!!navigator.serviceWorker&&typeof window!=='undefined'&&'PushManager' in window&&typeof Notification!=='undefined';
const pushOn=()=>{try{return localStorage.getItem('enat-push')==='1'&&typeof Notification!=='undefined'&&Notification.permission==='granted'}catch(e){return false}};
const pushKey=b=>{const s=atob((b+'='.repeat((4-b.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0))};
const pushPost=(p,b)=>API(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});

async function pushStatus(){
 if(!pushSupported())return pushIOS()&&!pushStandalone()?'ios-install':'unsupported';
 if(Notification.permission==='denied')return'denied';
 try{const r=await navigator.serviceWorker.getRegistration();const s=await r?.pushManager?.getSubscription();return s&&Notification.permission==='granted'?'on':'off'}catch(e){return'off'}
}
// Ativa os avisos neste dispositivo (pede autorização) e regista a subscrição no servidor.
async function pushEnable(quiet){
 if(!pushSupported())throw new Error(pushIOS()?'No iPhone, instale primeiro a app no ecrã principal (Partilhar › Adicionar ao ecrã principal) e abra-a a partir do ícone.':'Este navegador não suporta notificações push.');
 const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
 if(perm!=='granted')throw new Error('As notificações estão bloqueadas. Autorize-as nas definições do telemóvel para esta app.');
 const reg=await navigator.serviceWorker.ready;
 const r=await API('push/chave');if(!r.ok)throw new Error('Precisa de ligação à internet e de sessão iniciada.');
 const {key}=await r.json();
 let sub=await reg.pushManager.getSubscription();
 if(sub&&localStorage.getItem('enat-push-key')!==key){await sub.unsubscribe().catch(()=>{});sub=null}
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKey(key)});
 const ok=await pushPost('push/subscrever',{sub:sub.toJSON(),device:navigator.userAgent});
 if(!ok.ok)throw new Error('Não foi possível ativar as notificações. Tente novamente.');
 localStorage.setItem('enat-push','1');localStorage.setItem('enat-push-key',key);PUSH_ST='on';
 if(!quiet)PUSH_MSG='Notificações ativas neste dispositivo.';
}
async function pushDisable(){
 try{const r=await navigator.serviceWorker.getRegistration();const s=await r?.pushManager?.getSubscription();if(s){await pushPost('push/remover',{endpoint:s.endpoint}).catch(()=>{});await s.unsubscribe()}}catch(e){}
 localStorage.removeItem('enat-push');PUSH_ST='off';PUSH_MSG='Notificações desativadas neste dispositivo.';
}
// Ao entrar, volta a enviar a subscrição deste dispositivo (se já estava ativo) para o servidor a manter.
async function pushRefresh(){
 PUSH_ST=await pushStatus();
 if(PUSH_ST==='on'&&localStorage.getItem('enat-push')==='1')pushEnable(true).catch(()=>{});
 pushPaint();
}
function pushHtml(){
 const st=PUSH_ST,btn=(a,t,c='btn')=>`<button class="${c}" data-pu="${a}">${t}</button>`;
 const txt=st==='on'?'Ativas neste dispositivo. Recebe os avisos mesmo com a app fechada.':st==='denied'?'Bloqueadas. Autorize as notificações para a Enat app nas definições do telemóvel (ou do navegador) e volte aqui.':st==='ios-install'?'No iPhone / iPad: toque em Partilhar › «Adicionar ao ecrã principal», abra a app a partir do ícone e ative aqui.':st==='unsupported'?'Este navegador não suporta notificações push. No Android use o Chrome; no iPhone, a app instalada no ecrã principal.':st===null?'A verificar…':'Desativadas neste dispositivo.';
 return`<div class="grp">${kv('Estado',txt,'wrap')}</div>${st==='on'?btn('test','Enviar notificação de teste','btn alt')+btn('off','Desativar neste dispositivo','link'):st==='off'?btn('on','Ativar notificações neste dispositivo'):''}<p id="push-msg" role="status" class="note">${esc(PUSH_MSG)}</p><p class="note">Avisa das chamadas em hora (leads «Não atendeu»), das visitas 30 minutos antes, das leads novas do email e das respostas dos clientes aos orçamentos. Ative em cada telemóvel ou computador onde quer receber.</p>`;
}
function pushPaint(){const b=typeof document!=='undefined'&&document.querySelector?.('#pushbox');if(b)b.innerHTML=pushHtml()}
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',async e=>{
 const b=e.target.closest?.('[data-pu]');if(!b)return;e.stopImmediatePropagation();
 const a=b.dataset.pu;b.disabled=true;PUSH_MSG='';
 try{
  if(a==='on')await pushEnable();
  else if(a==='off')await pushDisable();
  else if(a==='test'){const r=await pushPost('push/teste');const j=await r.json().catch(()=>({}));PUSH_MSG=j.sent?'Notificação de teste enviada. Deve chegar dentro de segundos.':'Nenhum dispositivo ativo. Ative de novo neste dispositivo.';if(!j.sent)PUSH_ST='off'}
 }catch(err){PUSH_MSG=err.message||'Não foi possível concluir.'}
 pushPaint();
},true);

// Ao tocar numa notificação com a app fechada, a app abre em /?lead=… ou /?orc=…
function pushOpenQuote(id){V.tab='orc';V.obra=null;window.scrollTo?.(0,0);render();loadQuotes().then(()=>{quoteOpen(Number(id));render()}).catch(()=>{})}
function pushFromUrl(){
 if(typeof location==='undefined'||!location.search)return;
 const p=new URLSearchParams(location.search),l=p.get('lead'),q=p.get('orc');
 if(!l&&!q)return;
 try{history.replaceState(history.state,'','/')}catch(e){}
 if(q)return pushOpenQuote(q);
 const go=()=>{if(!(S.leads||[]).some(x=>x.id===l))return false;if(typeof notifClose==='function'){notifClose('call|'+l+'|'+((S.leads.find(x=>x.id===l)||{}).callAt||''));save()}leadOpenFromAlert(l);return true};
 // Uma lead nova do email pode ainda não estar neste dispositivo: espera pela sincronização.
 if(!go())setTimeout(go,4000);
}
function pushReady(){pushRefresh();pushFromUrl()}
if(typeof navigator!=='undefined')navigator.serviceWorker?.addEventListener?.('message',e=>{if(e.data?.quote&&!e.data.lead)pushOpenQuote(e.data.quote)});
