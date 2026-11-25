/* Notificações (sininho no topo) e Calendário.
   - Notificações: histórico das chamadas em hora e das leads novas recebidas por email. Ficam em S.notifs, sincronizadas
     entre dispositivos. Podem ser marcadas como lidas / não lidas e apagadas (uma a uma ou todas).
   - Calendário: chamadas a fazer (leads «Não atendeu» com hora marcada), visitas marcadas nas leads, manutenções das obras
     e marcações próprias (obras e trabalhos escritos à mão num dia, em S.agenda, com cor própria, de um ou vários dias).
     Cada marcação pode ser dada como «Contactado» ou «Não contactado»; o estado fica na própria lead ou obra (campo ct). */
let notifOpen=false;
const notifAll=()=>(S.notifs||[]).slice().sort((a,b)=>(b.at||0)-(a.at||0));
const notifGet=id=>(S.notifs||[]).find(n=>n.id===id)||null;
const notifUnread=()=>(S.notifs||[]).filter(n=>!n.read).length;
// Acrescenta uma notificação nova. Não volta a criar as que já existem nem as que foram apagadas.
function notifAdd(n){
 S.notifs=S.notifs||[];
 if(notifGet(n.id)||(S.del||{})['notifs:'+n.id])return false;
 S.notifs.push({read:false,closed:false,...n});
 if(S.notifs.length>300){const keep=notifAll().slice(0,300).map(x=>x.id);S.notifs=S.notifs.filter(x=>keep.includes(x.id))}
 return true;
}
// Fecha o aviso no ecrã (e a notificação do sistema da mesma lead); fica no histórico como lida.
function notifClose(id){
 const n=notifGet(id);if(n){n.closed=true;n.read=true}
 const lead=n?.lead||String(id).split('|')[1];
 try{if(lead&&typeof navigator!=='undefined'&&navigator.serviceWorker?.getRegistration)navigator.serviceWorker.getRegistration().then(r=>r?.getNotifications?.({tag:'lead-'+lead})).then(l=>(l||[]).forEach(x=>x.close())).catch(()=>{})}catch(e){}
}
const notifTime=ms=>{const d=new Date(ms);return isNaN(d)?'':d.toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
const NOTIF_KIND={call:['bell','Chamada'],lead:['lead','Lead nova']};
function notifBell(){
 const b=document.querySelector('#bell');if(!b)return;
 const n=typeof SESS==='function'&&SESS()?notifUnread():0;
 b.innerHTML=`${ic('bell')}${n?`<span class="bell-n">${n>99?'99+':n}</span>`:''}`;
 b.setAttribute?.('aria-label',n?`Notificações, ${n} por ler`:'Notificações');
 b.setAttribute?.('aria-expanded',String(notifOpen));
 const p=document.querySelector('#notif');if(p){p.classList[notifOpen?'add':'remove']('on');p.innerHTML=notifOpen?notifPanel():''}
}
function notifItem(n){
 const [icon,kind]=NOTIF_KIND[n.kind]||NOTIF_KIND.call;
 return`<div class="notif-i${n.read?'':' unread'}"><button class="notif-main" data-nb="open" data-id="${esc(n.id)}"><span class="notif-ic">${ic(icon)}</span><span class="notif-t"><b>${esc(n.title||kind)}</b><span>${esc(n.text||'')}</span><small>${kind} · ${esc(notifTime(n.at))}</small></span></button><div class="notif-b"><button class="link" data-nb="read" data-id="${esc(n.id)}">${n.read?'Marcar como não lida':'Marcar como lida'}</button><button class="link del" data-nb="del" data-id="${esc(n.id)}">Apagar</button></div></div>`;
}
function notifPanel(){
 const l=notifAll(),unread=notifUnread();
 return`<div class="notif-h"><b>Notificações${unread?` · ${unread} por ler`:''}</b><button class="notif-x" data-nb="toggle" aria-label="Fechar notificações">×</button></div>
 <div class="notif-acts"><button class="link" data-nb="cal">${ic('cal')} Calendário</button>${unread?'<button class="link" data-nb="readall">Marcar todas como lidas</button>':''}${l.length?'<button class="link del" data-nb="delall">Apagar todas</button>':''}</div>
 <div class="notif-l">${l.length?l.map(notifItem).join(''):'<div class="empty">Sem notificações. Os avisos de chamadas e as leads novas ficam aqui.</div>'}</div>`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-nb]');if(!b)return;e.stopImmediatePropagation();
 const a=b.dataset.nb,id=b.dataset.id,n=id&&notifGet(id);
 if(a==='toggle'){notifOpen=!notifOpen;notifBell();return}
 if(a==='read'&&n){n.read=!n.read;if(n.read)n.closed=true}
 else if(a==='readall')(S.notifs||[]).forEach(x=>{x.read=true;x.closed=true});
 else if(a==='del'&&n)S.notifs=S.notifs.filter(x=>x.id!==id);
 else if(a==='delall'){if(!confirm('Apagar todas as notificações do histórico?'))return;S.notifs=[]}
 else if(a==='cal'){notifOpen=false;notifBell();V.tab='cal';V.obra=null;window.scrollTo?.(0,0);render();return}
 else if(a==='open'&&n){notifClose(id);save();notifOpen=false;leadRemind();if(n.lead)leadOpenFromAlert(n.lead);else render();return}
 else return;
 save();leadRemind();notifBell();
},true);
// Tocar fora do painel fecha-o.
document.addEventListener('pointerdown',e=>{if(notifOpen&&!e.target.closest?.('#notif,#bell')){notifOpen=false;notifBell()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&notifOpen){notifOpen=false;notifBell()}});

/* ---------- Calendário ---------- */
const CAL_KIND={obra:'Obra',call:'Chamada',visit:'Visita',man:'Manutenção'};
let CAL_AG=null; // marcação própria a ser criada ou editada
const CAL_MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const calValid=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))&&!isNaN(new Date(v));
const calStatus=(x,key,fallback='')=>(x.ct||{})[key]||fallback;
function calEvents(){
 const out=[];
 for(const l of S.leads||[]){
  const base={src:'lead',id:l.id,name:leadName(l),tel:l.contact||'',info:(l.solutions||[]).join(', ')};
  if(l.call==='nao'&&calValid(l.callAt)){const key='call|'+l.callAt;out.push({...base,key,kind:'call',at:l.callAt,st:calStatus(l,key,l.callDone===l.callAt?'sim':'')})}
  if(calValid(l.visitAt)){const key='visit|'+l.visitAt;out.push({...base,key,kind:'visit',at:l.visitAt,info:l.address||base.info,st:calStatus(l,key)})}
 }
 for(const o of S.obras||[])if(/^\d{4}-\d{2}-\d{2}$/.test(o.done||'')&&(o.equip||[]).length){
  const at=(+o.done.slice(0,4)+1)+o.done.slice(4),key='man|'+at;
  out.push({src:'obra',id:o.id,key,kind:'man',at,allDay:true,name:o.client||o.name,tel:o.phone||'',info:o.name+' · '+o.equip.join(', '),st:calStatus(o,key)});
 }
 for(const a of S.agenda||[])if(calValid(a.data)){
  const ate=calValid(a.ate)&&a.ate>a.data?a.ate:'';
  out.push({src:'ag',id:a.id,key:'ag|'+a.id,kind:'obra',at:a.data+(a.hora?'T'+a.hora:''),allDay:!a.hora,ate,name:a.titulo||'Obra',tel:'',obra:a.obra||'',info:[a.local,a.notas].filter(Boolean).join(' · '),st:a.feito?'sim':''});
 }
 return out.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
}
// Dias ocupados por uma marcação (as próprias podem durar vários dias).
const calDays=e=>{const d0=calDay(e);if(!e.ate)return [d0];const out=[];for(let t=Date.parse(d0+'T12:00:00Z');out.length<62;t+=864e5){const k=new Date(t).toISOString().slice(0,10);out.push(k);if(k>=e.ate)break}return out};
const calIn=(e,d)=>e.ate?calDay(e)<=d&&d<=e.ate:calDay(e)===d;
const calDm=d=>d.slice(8,10)+'/'+d.slice(5,7);
const calDay=e=>String(e.at).slice(0,10);
const calHour=e=>e.allDay?'Todo o dia':String(e.at).slice(11,16);
const calDayTxt=d=>new Date(d+'T12:00').toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'});
const calNow=()=>leadLocalAt(Date.now());
function calCard(e){
 if(e.src==='ag')return calAgCard(e);
 const tel=String(e.tel||'').replace(/[^\d+]/g,''),late=!e.st&&String(e.at)<(e.allDay?leadToday():calNow());
 return`<div class="cal-ev cal-${e.kind}${e.st?' st-'+e.st:''}${late?' late':''}"><div class="cal-ev-t"><span class="cal-k">${CAL_KIND[e.kind]}</span><b>${esc(e.name)}</b><span>${esc(calDayTxt(calDay(e)))} · ${esc(calHour(e))}${late?' · <span class="neg">por contactar</span>':''}</span>${e.info?`<span>${esc(e.info)}</span>`:''}</div>
 <div class="cal-ev-b"><button class="cal-st yes${e.st==='sim'?' on':''}" data-ca="st" data-v="sim" data-src="${e.src}" data-id="${esc(e.id)}" data-k="${esc(e.key)}" aria-pressed="${e.st==='sim'}">Contactado</button><button class="cal-st no${e.st==='nao'?' on':''}" data-ca="st" data-v="nao" data-src="${e.src}" data-id="${esc(e.id)}" data-k="${esc(e.key)}" aria-pressed="${e.st==='nao'}">Não contactado</button>${tel?`<a class="cal-a" href="tel:${esc(tel)}">Ligar</a>`:''}<button class="cal-a" data-ca="open" data-src="${e.src}" data-id="${esc(e.id)}">${e.src==='lead'?'Abrir lead':'Abrir obra'}</button></div></div>`;
}
function calAgCard(e){
 const quando=(e.ate?calDm(calDay(e))+' a '+calDm(e.ate):calDayTxt(calDay(e)))+(e.allDay?'':' · '+calHour(e));
 return`<div class="cal-ev cal-obra${e.st?' st-sim':''}"><div class="cal-ev-t"><span class="cal-k">Obra</span><b>${esc(e.name)}</b><span>${esc(quando)}</span>${e.info?`<span>${esc(e.info)}</span>`:''}</div>
 <div class="cal-ev-b"><button class="cal-st yes${e.st?' on':''}" data-ca="ag-feito" data-id="${esc(e.id)}" aria-pressed="${!!e.st}">Feita</button><button class="cal-a" data-ca="ag-edit" data-id="${esc(e.id)}">Editar</button>${e.obra&&(S.obras||[]).some(o=>o.id===e.obra)?`<button class="cal-a" data-ca="open" data-src="obra" data-id="${esc(e.obra)}">Abrir obra</button>`:''}</div></div>`;
}
// Formulário da marcação própria (nova ou a editar).
function calAgForm(){
 const a=CAL_AG,obras=(S.obras||[]).filter(o=>o.status!=='concluida'||o.id===a.obra).sort((x,y)=>String(x.name||'').localeCompare(String(y.name||'')));
 const f=(k,l,t='text',x='')=>`<label><span>${l}</span><input data-agf="${k}" type="${t}" value="${esc(a[k]||'')}" ${x}></label>`;
 return`<div class="grp tpad cal-form"><h2 style="margin-top:0">${a.novo?'Nova marcação':'Editar marcação'}</h2>
 ${f('titulo','O quê / cliente','text','maxlength="120" placeholder="Ex.: Instalação AC · Sr. Silva"')}
 <label><span>Obra da app (opcional)</span><select data-agf="obra"><option value="">Nenhuma</option>${obras.map(o=>`<option value="${esc(o.id)}" ${o.id===a.obra?'selected':''}>${esc(o.name||o.client||'Obra')}${o.client&&o.name?' · '+esc(o.client):''}</option>`).join('')}</select></label>
 <div class="cal-form-2">${f('data','Dia','date','required')}${f('ate','Até (opcional)','date')}</div>
 ${f('hora','Hora (opcional)','time','step="900"')}
 ${f('local','Local (opcional)','text','maxlength="160" placeholder="Ex.: Arcozelo, Ponte de Lima"')}
 <label><span>Notas (opcional)</span><textarea data-agf="notas" rows="2" maxlength="600">${esc(a.notas||'')}</textarea></label>
 <p class="note neg" id="ag-err" role="alert"></p>
 <button class="btn" data-ca="ag-save">Guardar</button><button class="btn alt" data-ca="ag-cancel" style="margin-top:8px">Cancelar</button>
 ${a.novo?'':'<button class="btn alt neg" data-ca="ag-del" style="margin-top:8px">Apagar marcação</button>'}</div>`;
}
function calMonth(evs){
 const [y,m]=(V.cm||leadToday().slice(0,7)).split('-').map(Number),first=new Date(y,m-1,1),days=new Date(y,m,0).getDate(),pad=(first.getDay()+6)%7,today=leadToday();
 const by={};for(const e of evs)for(const k of calDays(e))(by[k]=by[k]||[]).push(e);
 let cells='';for(let i=0;i<pad;i++)cells+='<span class="cal-c empty"></span>';
 for(let d=1;d<=days;d++){
  const k=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,l=by[k]||[];
  cells+=`<button class="cal-c${k===today?' today':''}${k===V.cd?' on':''}${l.length?' has':''}" data-ca="day" data-id="${k}" aria-label="${esc(calDayTxt(k))}${l.length?', '+l.length+' marcações':''}"><span>${d}</span><i>${l.slice(0,4).map(e=>`<b class="dot cal-${e.kind}${e.st?' st-'+e.st:''}"></b>`).join('')}</i></button>`;
 }
 return`<div class="cal-m"><div class="cal-mh"><button class="cal-nav" data-ca="mon" data-id="-1" aria-label="Mês anterior">‹</button><b>${CAL_MONTHS[m-1]} ${y}</b><button class="cal-nav" data-ca="mon" data-id="1" aria-label="Mês seguinte">›</button></div><div class="cal-g">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=>`<span class="cal-wd">${d}</span>`).join('')}${cells}</div></div>`;
}
function vCal(){
 const evs=calEvents(),today=leadToday(),now=calNow();
 const late=evs.filter(e=>e.src!=='ag'&&!e.st&&String(e.at)<(e.allDay?today:now));
 const next=evs.filter(e=>e.ate>=today||(e.allDay?calDay(e)>=today:String(e.at)>=now)).slice(0,40);
 const day=V.cd?evs.filter(e=>calIn(e,V.cd)):null;
 const noDate=(S.leads||[]).filter(l=>l.stage==='visita'&&!calValid(l.visitAt));
 const legend=`<div class="cal-leg">${Object.entries(CAL_KIND).map(([k,t])=>`<span><b class="dot cal-${k}"></b>${t}</span>`).join('')}</div>`;
 if(CAL_AG)return`${backHome}<h1>Calendário</h1>${calAgForm()}`;
 return`${backHome}<h1>Calendário</h1><p class="sub">As suas obras e trabalhos, chamadas a fazer, visitas a clientes e manutenções. Toque num dia e em «Marcar obra» para escrever uma marcação.</p>
 <button class="btn" data-ca="ag-new" data-id="${esc(V.cd||today)}">${ic('cal')}Marcar obra${V.cd?' a '+esc(calDm(V.cd)):''}</button>
 ${calMonth(evs)}${legend}
 ${day?`<h2>${esc(calDayTxt(V.cd))}</h2>${day.length?day.map(calCard).join(''):'<div class="grp"><div class="empty">Nada marcado neste dia.</div></div>'}<button class="link" data-ca="day" data-id="">Ver próximas marcações</button>`:''}
 ${!day&&late.length?`<h2 class="neg">Por contactar (${late.length})</h2>${late.map(calCard).join('')}`:''}
 ${!day?`<h2>Próximas marcações${next.length?' ('+next.length+')':''}</h2>${next.length?next.map(calCard).join(''):'<div class="grp"><div class="empty">Sem marcações futuras. As chamadas das leads «Não atendeu» com hora marcada e as visitas com data aparecem aqui.</div></div>'}`:''}
 ${noDate.length?`<h2>Visitas sem data (${noDate.length})</h2><div class="grp">${noDate.map(leadRow).join('')}</div><p class="note">Abra a lead e indique a data e hora da visita para a ver no calendário.</p>`:''}`;
}
// Contactado / Não contactado: tocar outra vez no mesmo botão limpa a marcação. Numa chamada, «Contactado» também fecha o aviso.
function calSet(src,id,key,v){
 const x=(src==='lead'?S.leads:S.obras||[]).find(i=>i.id===id);if(!x)return;
 const ct={...(x.ct||{})},cur=ct[key]||(src==='lead'&&key==='call|'+x.callAt&&x.callDone===x.callAt?'sim':'');
 if(cur===v)delete ct[key];else ct[key]=v;x.ct=ct;
 if(src==='lead'&&key==='call|'+x.callAt){
  if(ct[key]==='sim'){x.callDone=x.callAt;if(!x.callDay||x.callDay<leadToday())x.callDay=leadToday()}else if(x.callDone===x.callAt)x.callDone='';
  notifClose(leadCallNotif(x));
 }
 if(src==='lead')leadPatchDraft(x,['ct','callDone','callDay']);
 save();
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-ca]');if(!b)return;e.stopImmediatePropagation();
 const a=b.dataset.ca,id=b.dataset.id;
 if(a==='day')V.cd=V.cd===id?'':id;
 else if(a==='mon'){const [y,m]=(V.cm||leadToday().slice(0,7)).split('-').map(Number),d=new Date(y,m-1+Number(id),1);V.cm=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');V.cd=''}
 else if(a==='st')calSet(b.dataset.src,id,b.dataset.k,b.dataset.v);
 else if(a==='ag-new')CAL_AG={novo:true,id:uid(),data:id||leadToday(),ate:'',hora:'',titulo:'',local:'',notas:'',obra:''};
 else if(a==='ag-edit'){const x=(S.agenda||[]).find(i=>i.id===id);if(x)CAL_AG={...x}}
 else if(a==='ag-cancel')CAL_AG=null;
 else if(a==='ag-feito'){const x=(S.agenda||[]).find(i=>i.id===id);if(x){x.feito=!x.feito;save()}}
 else if(a==='ag-del'){if(!CAL_AG||!confirm('Apagar esta marcação do calendário?'))return;S.agenda=(S.agenda||[]).filter(i=>i.id!==CAL_AG.id);CAL_AG=null;save()}
 else if(a==='ag-save'){
  const x=CAL_AG,err=t=>{const p=document.querySelector('#ag-err');if(p)p.textContent=t};
  if(!x)return;x.titulo=String(x.titulo||'').trim();
  if(!x.titulo&&x.obra){const o=(S.obras||[]).find(i=>i.id===x.obra);x.titulo=o?.name||o?.client||''}
  if(!x.titulo){err('Escreva o que vai fazer ou escolha a obra.');return}
  if(!calValid(x.data)){err('Escolha o dia.');return}
  if(x.ate&&x.ate<x.data){err('A data «Até» tem de ser depois do dia de início.');return}
  const {novo,...item}=x;S.agenda=(S.agenda||[]).filter(i=>i.id!==item.id).concat([item]);
  CAL_AG=null;V.cd=item.data;V.cm=item.data.slice(0,7);save();
 }
 else if(a==='open'){if(b.dataset.src==='lead'){leadOpenFromAlert(id);return}V.obra=id;V.seg='contas';window.scrollTo?.(0,0)}
 render();
},true);

// Campos do formulário da marcação própria.
document.addEventListener('input',e=>{const t=e.target;if(!CAL_AG||!t.dataset?.agf)return;CAL_AG[t.dataset.agf]=t.value});
document.addEventListener('change',e=>{const t=e.target;if(!CAL_AG||!t.dataset?.agf)return;CAL_AG[t.dataset.agf]=t.value});
