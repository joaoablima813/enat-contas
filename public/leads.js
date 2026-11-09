/* Leads: contactos de potenciais clientes, com a fase, as soluções pretendidas e os orçamentos criados a partir de cada lead.
   Ficam em S.leads, sincronizadas entre dispositivos como as obras. Nenhum campo é obrigatório. */
const LEAD_STAGES={nova:'Nova lead',contacto:'Contacto',triagem:'Triagem',orcamento:'Em orçamento',enviada:'Proposta enviada',ganho:'Ganho / adjudicado',visita:'Visita agendada',perdido:'Perdido'};
const LEAD_SOLUTIONS=['Ar condicionado','Bomba de calor AQS','Bomba de calor climatização','Painéis fotovoltaicos','Painéis solares térmicos','Piso radiante','VMC','Carregador automóvel'];
const LEAD_HOUSES=['Moradia','Apartamento','Moradia antiga','Moradia geminada'];
// Soluções da lead que correspondem a tipologias dos orçamentos com outro nome; as escritas à mão ficam em Geral / outros.
const LEAD_TOPIC={'Painéis fotovoltaicos':'UPAC (fotovoltaico)'};
const LEAD_PV='Painéis fotovoltaicos';
const LEAD_FIELDS=['name','address','contact','email','coords','rooms','bill','area','notes','value','brand','timing','heating','visitAt','callDay','callAt'];
// Sugestões para os campos do formulário da campanha (pode escrever-se outra resposta).
const LEAD_HEATING=['Botija de gás','Gás natural','Esquentador','Caldeira a gás','Caldeira a gasóleo','Termoacumulador elétrico','Bomba de calor','Painel solar térmico','Lenha / salamandra'];
const LEAD_TIMINGS=['O mais rápido possível','Dentro de 1 mês','Dentro de 3 meses','Dentro de 6 meses','Ainda só a pedir valores'];
let leadDraft=null,leadOrig='',leadMsg='';
const leadCallOpen=new Set();

const leadToday=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const leadNew=()=>({...Object.fromEntries(LEAD_FIELDS.map(k=>[k,''])),stage:'nova',solutions:[],call:'',house:'',date:leadToday(),calls:[]});
/* Chamadas: cada lead guarda todas as chamadas feitas ao cliente (dia, hora, resultado e observações), em l.calls.
   O resultado da última chamada com resultado define l.call (Atendeu / Não atendeu) e o dia da última chamada fica em l.callDay. */
const leadNowTime=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(11,16)};
const leadCallNew=(result='')=>({id:uid(),day:leadToday(),time:leadNowTime(),result,notes:''});
const leadCallsSorted=l=>leadCallsOf(l).slice().sort((a,b)=>((a.day||'')+(a.time||'')).localeCompare((b.day||'')+(b.time||'')));
function leadCallsDerive(l){
 const c=leadCallsSorted(l);if(!c.length)return;
 const withRes=c.filter(x=>x.result==='atendeu'||x.result==='nao');
 if(withRes.length)l.call=withRes.at(-1).result;
 if(c.at(-1).day)l.callDay=c.at(-1).day;
}
const leadCallDay=c=>{const d=new Date((c.day||'')+'T12:00');return isNaN(d)?'Sem data':d.toLocaleDateString('pt-PT',{weekday:'short',day:'numeric',month:'short',year:'numeric'})};
// Leads antigas só tinham uma chamada (Atendeu / Não atendeu e o dia): passa a ser a primeira chamada do histórico.
const leadCallsOf=l=>Array.isArray(l.calls)&&l.calls.length?l.calls:l.call==='atendeu'||l.call==='nao'?[{id:'c0',day:l.callDay||l.date||'',time:'',result:l.call,notes:''}]:[];
const leadCallsCount=l=>leadCallsOf(l).length;
const leadName=l=>String(l.name||'').trim()||'Lead sem nome';
const leadList=()=>(S.leads||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.u||0)-(a.u||0));
const leadText=l=>[l.name,l.contact,l.email,l.address,l.brand,l.heating,...(l.solutions||[])].join(' ');
const leadQuotes=id=>(quoteRows||[]).filter(r=>r.document.lead===id);
const leadTopics=l=>[...new Set((l.solutions||[]).map(s=>LEAD_TOPIC[s]||(TOPICS.includes(s)?s:'Geral / outros')))];
const leadBadge=s=>`<span class="lead-badge lead-${s in LEAD_STAGES?s:'nova'}">${LEAD_STAGES[s]||LEAD_STAGES.nova}</span>`;
const leadCall=c=>c==='atendeu'?'<span class="lead-call pos">Atendeu</span>':c==='nao'?'<span class="lead-call neg">Não atendeu</span>':'';

// Leads novas: chegaram por email (sincronizadas do Outlook) e ainda não foram marcadas como recebidas.
// Têm cor própria e ficam separadas das leads criadas na app. Saem ao marcar como recebida, ao marcar a chamada ou ao mudar a fase.
const leadIsNew=l=>l.src==='meta'&&!l.seen&&(l.stage||'nova')==='nova'&&!l.call&&!leadCallsCount(l);
const leadNews=()=>leadList().filter(leadIsNew);
const LEAD_PAGE=10,LEAD_COL=20;
function leadRow(l){
 const nova=leadIsNew(l),info=[(l.solutions||[]).join(', '),l.contact].filter(v=>String(v||'').trim()).map(esc).join(' · ');
 return`<button class="row invoice-row lead-row ${nova?'lead-email':'lead-'+esc(l.stage||'nova')}" data-la="open" data-id="${esc(l.id)}"><div class="av">${esc(leadName(l)[0])}</div><div class="rt"><b>${esc(leadName(l))}</b><span>${info||'Sem soluções indicadas'}</span><span>${nova?'Sincronizada do Outlook · ':''}${l.date?esc(fd(l.date)):''}${leadCallsCount(l)?` · ${leadCallsCount(l)} chamada${leadCallsCount(l)>1?'s':''}`:''}${leadCall(l.call)}</span></div><div class="rr">${nova?'<span class="lead-badge lead-email">Lead nova</span>':leadBadge(l.stage)}</div></button>`;
}
// Junta as leads recebidas por email que este dispositivo ainda não tem (nem foram eliminadas).
function leadInbox(list){
 if(!Array.isArray(list))return false;S.leads=S.leads||[];
 const have=new Set(S.leads.map(l=>l.id)),del=S.del||{};let added=false;
 for(const l of list)if(l&&typeof l.id==='string'&&!have.has(l.id)&&!del['leads:'+l.id]){const {received,...x}=l;S.leads.push({...leadNew(),...x,solutions:[...(x.solutions||[])]});have.add(l.id);added=true;if(typeof notifAdd==='function')notifAdd({id:'lead|'+l.id,kind:'lead',lead:l.id,title:'Nova lead: '+leadName(x),text:[x.contact,x.heating,x.timing].filter(Boolean).join(' · ')||'Sincronizada do Outlook',at:new Date(received||Date.now()).getTime()||Date.now()})}
 return added;
}
const leadMore=(n,kind)=>n>LEAD_PAGE?`<button class="btn alt lead-more" data-la="all" data-id="${kind}">Mostrar mais (${n-LEAD_PAGE})</button>`:'';
const leadQ=()=>V.lq||'';
const leadNewFiltered=()=>leadNews().filter(x=>!leadQ()||match(leadText(x),leadQ()));
const leadFilt=x=>!leadIsNew(x)&&(!V.ls||x.stage===V.ls)&&(!leadQ()||match(leadText(x),leadQ()));
const leadOldFiltered=()=>leadList().filter(x=>x.call!=='nao'&&leadFilt(x));
// Leads «Não atendeu»: saem da tabela principal e ficam numa coluna à direita, com o dia da chamada e a hora a que o cliente quer ser contactado.
// As que têm hora marcada aparecem primeiro, da mais próxima para a mais distante.
const leadNoFiltered=()=>leadList().filter(x=>x.call==='nao'&&leadFilt(x)).sort((a,b)=>(a.callAt?0:1)-(b.callAt?0:1)||String(a.callAt||'').localeCompare(String(b.callAt||'')));
const leadAtTxt=v=>{const d=new Date(v);return isNaN(d)?'':d.toLocaleString('pt-PT',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
function leadNoCard(l){
 const due=leadDueOne(l);
 return`<div class="lead-no-card${due?' due':''}">${leadRow(l)}<div class="lead-no-f"><label><span>Dia em que liguei</span><input type="date" data-ln="callDay" data-id="${esc(l.id)}" value="${esc(l.callDay||'')}"></label><label><span>Contactar em</span><input type="datetime-local" data-ln="callAt" data-id="${esc(l.id)}" value="${esc(l.callAt||'')}"></label></div>${due?`<p class="lead-no-due">${ic('bell')} Está na hora de ligar${l.contact?` · <a href="tel:${esc(String(l.contact).replace(/\s/g,''))}">${esc(l.contact)}</a>`:''}</p>`:l.callAt&&l.callDone!==l.callAt?`<p class="note lead-no-at">Aviso: ${esc(leadAtTxt(l.callAt))}</p>`:''}</div>`;
}
function leadsNoHtml(){
 const l=leadNoFiltered(),perm=typeof Notification!=='undefined'&&(typeof pushOn==='function'?!pushOn()&&Notification.permission!=='denied':Notification.permission==='default');
 return`<h2 class="lead-no-h">Não atendeu${l.length?' ('+l.length+')':''}</h2>${perm&&l.length?'<button class="btn alt lead-perm" data-la="perm">Ativar notificações no telemóvel</button>':''}${l.length?l.map(leadNoCard).join(''):'<div class="grp"><div class="empty">Sem leads por voltar a ligar. As leads marcadas como «Não atendeu» aparecem aqui.</div></div>'}`;
}
function leadsNewHtml(){
 const l=leadNewFiltered();
 return l.length?`<h2 class="lead-new-h">Leads novas (${l.length})</h2><p class="note">Sincronizadas do Outlook (emails da campanha). Abra uma lead e toque em «Marcar como recebida» para a passar para as Leads.</p><div class="grp lead-new">${l.slice(0,LEAD_PAGE).map(leadRow).join('')}</div>${leadMore(l.length,'novas')}`:'';
}
const leadNewHome=()=>{const l=leadNews();return l.length?`<h2 class="lead-new-h">Leads novas (${l.length})</h2><div class="grp lead-new">${l.slice(0,LEAD_PAGE).map(leadRow).join('')}</div>${leadMore(l.length,'novas')}`:''};
function leadsList(){
 if(V.lall)return leadsAllList();
 const l=leadOldFiltered();
 return leadsNewHtml()+`<h2>Leads${l.length?' ('+l.length+')':''}</h2>`+(l.length?`<div class="grp">${l.slice(0,LEAD_PAGE).map(leadRow).join('')}</div>${leadMore(l.length,'todas')}`:`<div class="grp"><div class="empty">${(S.leads||[]).some(x=>!leadIsNew(x))?'Nenhuma lead com estes filtros.':'Ainda sem leads. Toque em «Nova lead» para registar o primeiro contacto.'}</div></div>`);
}
// Página «Mostrar mais»: todas as leads em colunas de 20, lado a lado (no telemóvel desliza-se para o lado).
function leadsAllList(){
 const l=V.lall==='novas'?leadNewFiltered():leadOldFiltered();
 if(!l.length)return'<div class="grp"><div class="empty">Nenhuma lead com estes filtros.</div></div>';
 const cols=[];for(let i=0;i<l.length;i+=LEAD_COL)cols.push(l.slice(i,i+LEAD_COL));
 return`<p class="note">${l.length} lead${l.length>1?'s':''}${cols.length>1?' em '+cols.length+' colunas de '+LEAD_COL:''}.</p><div class="lead-cols">${cols.map((c,i)=>`<section class="lead-col"><h3>${i*LEAD_COL+1}–${i*LEAD_COL+c.length}</h3><div class="grp${V.lall==='novas'?' lead-new':''}">${c.map(leadRow).join('')}</div></section>`).join('')}</div>`;
}
// Pesquisa global da página inicial.
const leadSearch=q=>q.trim()?leadList().filter(l=>match(leadText(l),q)):[];

const leadSplit=()=>`<div class="lead-split"><div id="llist">${leadsList()}</div><aside id="lno" class="lead-no">${leadsNoHtml()}</aside></div>`;
const leadSearchBar=()=>`<div class="sbar" style="margin-top:14px">${ic('search')}<input id="lq" type="search" value="${esc(V.lq||'')}" aria-label="Procurar leads" placeholder="Nome, contacto, morada ou solução" autocomplete="off"></div>`;
function vLeads(){
 leadEnsureQuotes();
 if(leadDraft)return leadEditor();
 const all=S.leads||[],count=s=>all.filter(l=>l.stage===s&&!leadIsNew(l)).length;
 const chips=`<div class="chips">${[['','Todas'],...Object.entries(LEAD_STAGES)].map(([k,l])=>`<button class="${(V.ls||'')===k?'on':''}" data-la="filter" data-id="${k}">${l}${k&&count(k)?' · '+count(k):''}</button>`).join('')}</div>`;
 if(V.lall)return`<div class="lead-wide"><button class="back" data-la="less">${ic('back')} Leads</button><h1>${V.lall==='novas'?'Leads novas':'Todas as leads'}</h1>${leadSearchBar()}${V.lall==='novas'?'':chips}<div id="llist">${leadsList()}</div></div>`;
 return`<div class="lead-wide lead-main"><div class="lead-head"><h1>Leads</h1><p class="sub">Contactos de clientes, da primeira chamada à adjudicação.</p><button class="btn" data-la="new">Nova lead</button>${leadSearchBar()}${chips}</div>${leadSplit()}</div>`;
}

const leadField=(label,k,type='text',extra='')=>`<label class="q-field"><span>${label}</span><input type="${type}" data-lf="${k}" value="${esc(leadDraft[k])}" ${extra}></label>`;
const leadArea=(label,k,ph='')=>`<label class="q-field"><span>${label}</span><textarea data-lf="${k}" rows="3" maxlength="4000" placeholder="${ph}">${esc(leadDraft[k])}</textarea></label>`;
const leadChoice=(f,v,label,cls='')=>`<button type="button" class="lead-opt ${cls} ${leadDraft[f]===v?'on':''}" data-la="set" data-f="${f}" data-v="${esc(v)}" aria-pressed="${leadDraft[f]===v}">${label}</button>`;
function leadQuotesHtml(l){
 if(!l.id)return '';
 const rows=leadQuotes(l.id);
 const list=quoteRows===null?'<div class="empty">A carregar orçamentos…</div>':rows.length?rows.map(r=>`<div class="lead-q"><button class="row invoice-row" data-a="openquote" data-id="${r.id}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${quoteNumber(r.id,r.document.date)} ${quoteBadge(r.document,r.events)}</b><span>${esc(quoteTitle(r.document).replace('Orçamento para ',''))}</span></div><div class="rr"><b>${eur(quoteTotals(r.document).total)}</b><span>com IVA</span></div></button><button type="button" class="link" data-la="pdf" data-id="${r.id}">Descarregar PDF do orçamento</button></div>`).join(''):'<div class="empty">Ainda sem orçamentos para esta lead.</div>';
 return`<h2>Orçamentos desta lead</h2><div class="grp">${list}</div><p class="note">Toque num orçamento para o abrir em Orçamentos.</p>`;
}
// Histórico de chamadas da lead: tocar numa chamada abre-a com as observações dessa chamada.
function leadCallsHtml(l){
 const c=leadCallsSorted(l),n=c.length;
 const item=(x,i)=>{const open=leadCallOpen.has(x.id),prev=String(x.notes||'').trim().split('\n')[0].slice(0,80),res=(v,t,cls)=>`<button type="button" class="lead-opt ${cls} ${x.result===v?'on':''}" data-la="call-res" data-i="${esc(x.id)}" data-v="${v}" aria-pressed="${x.result===v}">${t}</button>`;
  return`<details class="lead-callx" data-ci="${esc(x.id)}"${open?' open':''}><summary><span class="lead-callx-n">${i+1}</span><span class="lead-callx-t"><b>Chamada ${i+1} · ${esc(leadCallDay(x))}${x.time?' · '+esc(x.time):''}</b><span>${leadCall(x.result)||'<span class="lead-call">Sem resultado</span>'}<span class="lead-callx-p">${prev?esc(prev):'Sem observações'}</span></span></span></summary>
  <div class="lead-callx-b"><div class="lead-callx-f"><label class="q-field"><span>Dia</span><input type="date" data-lc="day" data-i="${esc(x.id)}" value="${esc(x.day||'')}"></label><label class="q-field"><span>Hora</span><input type="time" data-lc="time" data-i="${esc(x.id)}" value="${esc(x.time||'')}"></label></div>
  <div class="lead-opts">${res('atendeu','Atendeu','lead-yes')}${res('nao','Não atendeu','lead-no')}</div>
  <label class="q-field"><span>Observações desta chamada</span><textarea data-lc="notes" data-i="${esc(x.id)}" rows="4" maxlength="4000" placeholder="O que foi falado, o que ficou combinado…">${esc(x.notes||'')}</textarea></label>
  <button type="button" class="link del" data-la="call-del" data-i="${esc(x.id)}">Eliminar esta chamada</button></div></details>`};
 return`<h2>Chamadas${n?' ('+n+')':''}</h2><p class="note">Registe cada chamada a este cliente, com o resultado e as observações. Toque numa chamada para ver o que deixou escrito.</p>
 <div class="grp lead-calls">${n?c.map((x,i)=>({x,i})).reverse().map(({x,i})=>item(x,i)).join(''):'<div class="empty">Ainda sem chamadas registadas.</div>'}</div>
 <div class="lead-call-add"><button type="button" class="btn alt" data-la="call-add" data-v="atendeu">Registar chamada · Atendeu</button><button type="button" class="btn alt" data-la="call-add" data-v="nao">Registar chamada · Não atendeu</button></div>
 ${l.call==='nao'?`<div class="q-card lead-no-ed">${leadField('Voltar a ligar em (horário em que o cliente quer ser contactado)','callAt','datetime-local')}<p class="note">Chegada esta hora, a app avisa para ligar ao cliente, também no telemóvel com a app fechada (ative em Definições › Notificações no telemóvel).</p></div>`:''}`;
}
function leadEditor(){
 const l=leadDraft,maps=String(l.coords||'').trim()||String(l.address||'').trim(),saved=(S.leads||[]).find(x=>x.id===l.id),nova=!!saved&&leadIsNew(saved);
 return`<button class="back" data-la="close">${ic('back')} Leads</button><h1>${l.id?esc(leadName(l)):'Nova lead'}</h1><p class="sub">Nenhum campo é obrigatório. Pode guardar e completar mais tarde.</p>
 ${nova?`<div class="lead-ed lead-email lead-inbox"><h2>Lead nova · sincronizada do Outlook</h2><p class="note">Chegou por email da campanha. Ao marcar como recebida, passa para as Leads com a cor normal.</p><button class="btn" data-la="seen">Marcar como recebida</button></div>`:''}
 <div class="lead-ed lead-${esc(l.stage)}"><h2>Fase da lead</h2><div class="lead-opts lead-stages">${Object.entries(LEAD_STAGES).map(([k,t])=>leadChoice('stage',k,t,'lead-'+k)).join('')}</div>${l.stage==='visita'||l.visitAt?`<div class="q-card lead-visit">${leadField('Data e hora da visita','visitAt','datetime-local')}<p class="note">A visita aparece no Calendário.</p></div>`:''}</div>
 <h2>Cliente</h2><div class="q-card">${leadField('Nome do cliente','name','text','maxlength="2000" autocomplete="off"')}${leadField('Morada','address','text','maxlength="4000" autocomplete="off"')}${leadField('Contacto','contact','tel','maxlength="2000" inputmode="tel" autocomplete="off"')}${leadField('Email','email','email','maxlength="320" autocomplete="off" placeholder="cliente@exemplo.pt"')}${leadField('Coordenadas (opcional)','coords','text','maxlength="200" autocomplete="off" placeholder="Ex.: 41.7672, -8.5836"')}${maps?`<a class="link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(maps)}" target="_blank" rel="noopener">Abrir no mapa</a>`:''}${leadField('Data','date','date')}</div>
 <h2>Pedido do cliente</h2><div class="q-card">${leadField('Que sistema usa hoje para aquecer a água?','heating','text','maxlength="2000" list="lead-heating" autocomplete="off" placeholder="Ex.: Botija de gás"')}<datalist id="lead-heating">${LEAD_HEATING.map(v=>`<option value="${esc(v)}">`).join('')}</datalist>${leadField('Quando pretende fazer a instalação?','timing','text','maxlength="2000" list="lead-timing" autocomplete="off" placeholder="Ex.: O mais rápido possível"')}<datalist id="lead-timing">${LEAD_TIMINGS.map(v=>`<option value="${esc(v)}">`).join('')}</datalist></div>
 <h2>Solução pretendida</h2><p class="note">Selecione todas as que o cliente pretende.</p><div class="lead-opts">${[...LEAD_SOLUTIONS,...l.solutions.filter(s=>!LEAD_SOLUTIONS.includes(s))].map(s=>`<button type="button" class="lead-opt ${l.solutions.includes(s)?'on':''}" data-la="sol" data-v="${esc(s)}" aria-pressed="${l.solutions.includes(s)}">${esc(s)}</button>`).join('')}</div><div class="lead-add"><input id="lead-sol" maxlength="100" placeholder="Outra solução" aria-label="Outra solução" autocomplete="off"><button type="button" class="btn alt" data-la="sol-add">Adicionar</button></div>
 ${leadCallsHtml(l)}
 <h2>Tipo de casa</h2><div class="lead-opts">${LEAD_HOUSES.map(h=>leadChoice('house',h,h)).join('')}</div>
 <h2>Detalhes técnicos</h2><div class="q-card">${leadArea('Divisões a climatizar','rooms','Ex.: sala, 3 quartos, escritório')}${l.solutions.includes(LEAD_PV)?leadField('Fatura elétrica','bill','text','maxlength="2000" placeholder="Ex.: 120 € por mês"'):''}${leadArea('Área das divisões','area','Ex.: sala 30 m², quartos 12 m²')}${leadArea('Observações técnicas','notes')}${leadField('Valor orçamentado','value','text','maxlength="200"')}${leadField('Marca','brand','text','maxlength="200" list="quote-brands" autocomplete="off"')}<datalist id="quote-brands">${quoteTables().map(t=>`<option value="${esc(t.brand)}">`).join('')}</datalist></div>
 <p id="lead-msg" role="status" class="note">${esc(leadMsg)}</p><button class="btn" data-la="save">Guardar lead</button><button class="btn alt" data-la="quote">Criar orçamento para esta lead</button>
 ${leadQuotesHtml(l)}${l.id?'<button class="btn del" data-la="delete">Eliminar lead</button>':''}`;
}

function leadOpen(id){const l=(S.leads||[]).find(x=>x.id===id);if(!l)return false;leadDraft={...leadNew(),...structuredClone(l)};delete leadDraft.u;
 leadDraft.calls=structuredClone(leadCallsOf(leadDraft));
 leadOrig=JSON.stringify(leadDraft);leadMsg='';leadCallOpen.clear();return true}
const leadDirty=()=>leadDraft&&JSON.stringify(leadDraft)!==leadOrig;
function leadSave(){
 const l={...leadDraft};LEAD_FIELDS.forEach(k=>l[k]=String(l[k]||'').trim());
 if(!l.solutions.includes(LEAD_PV))l.bill='';
 l.date=/^\d{4}-\d{2}-\d{2}$/.test(l.date)?l.date:leadToday();
 l.calls=(Array.isArray(l.calls)?l.calls:[]).map(c=>({id:String(c.id||uid()),day:/^\d{4}-\d{2}-\d{2}$/.test(c.day)?c.day:'',time:/^\d{2}:\d{2}$/.test(c.time)?c.time:'',result:['atendeu','nao'].includes(c.result)?c.result:'',notes:String(c.notes||'').trim().slice(0,4000)}));
 leadCallsDerive(l);
 if(!l.id)l.id=uid();
 S.leads=S.leads||[];const i=S.leads.findIndex(x=>x.id===l.id);if(i<0)S.leads.push(l);else S.leads[i]={...S.leads[i],...l};
 save();leadDraft={...l};leadOrig=JSON.stringify(leadDraft);leadMsg='Lead guardada.';
 return l;
}
// O orçamento abre já com os dados do cliente e fica ligado à lead; ao guardar aparece também em Orçamentos.
function leadQuote(){
 const l=leadSave();
 quoteWa.key=null;quotePick=null;quotePickLast=null;quotePickOff=null;quoteClient=null;quoteError='';
 quoteDraft=newQuote();Object.assign(quoteDraft,{client:l.name,address:l.address,contact:l.contact,email:l.email,brand:l.brand,topics:leadTopics(l),lead:l.id});
 V.tab='orc';V.obra=null;window.scrollTo?.(0,0);
}

// Os orçamentos ligados fazem avançar a fase: guardado, enviado, aceite ou adjudicado pelo cliente. Nunca recua nem mexe numa lead perdida.
const LEAD_RANK=['nova','contacto','triagem','visita','orcamento','enviada','ganho'];
function leadFromQuote(doc,stage){
 const l=doc?.lead&&(S.leads||[]).find(x=>x.id===doc.lead);
 if(!l||l.stage==='perdido'||LEAD_RANK.indexOf(l.stage)>=LEAD_RANK.indexOf(stage))return false;
 l.stage=stage;if(leadDraft?.id===l.id){leadDraft.stage=stage;leadOrig=JSON.stringify({...JSON.parse(leadOrig),stage})}
 save();return true;
}
const leadQuoteStage=(doc,events)=>quoteTrack(events).answer?.kind==='adjudicar'||doc.status==='aceite'?'ganho':doc.status==='enviado'||quoteTrack(events).sent.length?'enviada':'orcamento';
function leadSyncQuotes(){let changed=false;for(const r of quoteRows||[])if(r.document.lead&&leadFromQuote(r.document,leadQuoteStage(r.document,r.events)))changed=true;return changed}
function leadEnsureQuotes(){
 if(quoteRows===null&&!quoteLoading&&SESS())loadQuotes().then(()=>{leadSyncQuotes();if(V.tab==='leads'&&!V.obra&&!document.activeElement?.matches?.('input,textarea,select'))render()});
}

document.addEventListener('input',e=>{
 const t=e.target;
 if(t.id==='lq'){V.lq=t.value;navEntries[navIndex].v=navView();const l=document.querySelector('#llist');if(l)l.innerHTML=leadsList();const n=document.querySelector('#lno');if(n)n.innerHTML=leadsNoHtml();return}
 if(t.dataset?.lf&&leadDraft)leadDraft[t.dataset.lf]=t.value;
 if(t.dataset?.lc&&leadDraft){const c=(leadDraft.calls||[]).find(x=>x.id===t.dataset.i);if(c)c[t.dataset.lc]=t.value}
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-la]');if(!b)return;e.stopImmediatePropagation();
 const a=b.dataset.la,id=b.dataset.id;
 if(a==='new'){leadDraft=leadNew();leadOrig=JSON.stringify(leadDraft);leadMsg='';window.scrollTo?.(0,0)}
 else if(a==='open'){if(!leadOpen(id)){alert('Lead não encontrada.');return}V.tab='leads';V.obra=null;window.scrollTo?.(0,0)}
 else if(a==='filter')V.ls=id;
 else if(a==='all'){V.tab='leads';V.obra=null;V.lall=id;leadDraft=null;window.scrollTo?.(0,0)}
 else if(a==='less'){V.lall='';window.scrollTo?.(0,0)}
 else if(a==='seen'){leadDraft.seen=true;leadSave();leadMsg='Lead marcada como recebida. Passou para as Leads.'}
 else if(a==='close'){if(leadDirty()&&!confirm('Sair sem guardar as alterações desta lead?'))return;leadDraft=null;leadMsg='';window.scrollTo?.(0,0)}
 else if(a==='set'){const f=b.dataset.f,v=b.dataset.v;leadDraft[f]=f!=='stage'&&leadDraft[f]===v?'':v;if(f==='call'&&leadDraft.call==='nao'&&!leadDraft.callDay)leadDraft.callDay=leadToday()}
 else if(a==='perm'){await leadAskPerm();}
 else if(a==='call-add'){const c=leadCallNew(b.dataset.v||'');leadDraft.calls=[...(leadDraft.calls||[]),c];leadCallOpen.add(c.id);
  // Uma chamada nova responde ao aviso que estava em hora.
  if(leadDraft.callAt&&new Date(leadDraft.callAt).getTime()<=Date.now())leadDraft.callDone=leadDraft.callAt;
  leadCallsDerive(leadDraft);if(leadDraft.call==='nao')leadAskPerm()}
 else if(a==='call-res'){const c=(leadDraft.calls||[]).find(x=>x.id===b.dataset.i);if(!c)return;c.result=c.result===b.dataset.v?'':b.dataset.v;leadCallOpen.add(c.id);leadCallsDerive(leadDraft)}
 else if(a==='call-del'){const c=(leadDraft.calls||[]).find(x=>x.id===b.dataset.i);if(!c||((c.notes||'').trim()&&!confirm('Eliminar esta chamada e as observações?')))return;leadDraft.calls=leadDraft.calls.filter(x=>x!==c);leadCallsDerive(leadDraft)}
 else if(a==='sol'){const v=b.dataset.v,s=leadDraft.solutions;leadDraft.solutions=s.includes(v)?s.filter(x=>x!==v):[...s,v]}
 else if(a==='sol-add'){const inp=document.querySelector('#lead-sol'),v=String(inp?.value||'').trim();if(!v)return;if(!leadDraft.solutions.includes(v))leadDraft.solutions=[...leadDraft.solutions,v]}
 else if(a==='save')leadSave();
 else if(a==='quote')leadQuote();
 else if(a==='pdf'){const r=(quoteRows||[]).find(r=>r.id===Number(id));if(!r)return;b.disabled=true;b.textContent='A preparar PDF…';try{await downloadQuotePdf({...r.document,id:r.id})}catch(err){alert('Não foi possível gerar o PDF.')}b.disabled=false;b.textContent='Descarregar PDF do orçamento';return}
 else if(a==='delete'){if(!confirm('Eliminar a lead '+leadName(leadDraft)+'? Os orçamentos criados continuam em Orçamentos.'))return;S.leads=(S.leads||[]).filter(x=>x.id!==leadDraft.id);save();leadDraft=null;leadMsg=''}
 render();
},true);

// Guarda que chamadas estão abertas, para continuarem abertas quando o ecrã se atualiza.
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('toggle',e=>{const d=e.target;if(!d?.dataset?.ci)return;d.open?leadCallOpen.add(d.dataset.ci):leadCallOpen.delete(d.dataset.ci)},true);

// Campos da coluna «Não atendeu»: guardam logo na lead (e sincronizam com os outros dispositivos).
document.addEventListener('change',e=>{
 const t=e.target,k=t.dataset?.ln;if(!k)return;
 const l=(S.leads||[]).find(x=>x.id===t.dataset.id);if(!l)return;
 l[k]=String(t.value||'').trim();save();
 if(k==='callAt'&&l.callAt)leadAskPerm();
 const n=document.querySelector('#lno');if(n)n.innerHTML=leadsNoHtml();leadRemind();
});

/* Avisos de chamada: quando chega a hora marcada numa lead «Não atendeu», a app mostra um aviso no topo do ecrã
   (em qualquer separador) e, se o dispositivo o permitir, uma notificação. O aviso fica até tocar em «Já liguei» ou «Adiar». */
const LEAD_SNOOZE=15;
const leadDueOne=l=>l.call==='nao'&&!!l.callAt&&l.callDone!==l.callAt&&!isNaN(new Date(l.callAt))&&new Date(l.callAt).getTime()<=Date.now();
const leadDue=()=>(S?.leads||[]).filter(leadDueOne).sort((a,b)=>String(a.callAt).localeCompare(String(b.callAt)));
// Pede autorização e ativa as notificações push (chegam também com a app fechada).
async function leadAskPerm(){try{if(typeof pushEnable==='function'&&typeof pushOn==='function'&&!pushOn()){await pushEnable(true);pushPaint?.()}else if(typeof Notification!=='undefined'&&Notification.permission==='default')await Notification.requestPermission()}catch(e){}}
function leadNotify(l){
 const key='enat-lead-notif',seen=(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(e){return{}}})(),id=l.id+'|'+l.callAt;
 if(seen[id])return;seen[id]=Date.now();
 for(const k of Object.keys(seen))if(Date.now()-seen[k]>30*864e5)delete seen[k];
 try{localStorage.setItem(key,JSON.stringify(seen))}catch(e){}
 if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
 // Com as notificações push ativas, o aviso do sistema vem do servidor (evita aviso repetido).
 if(typeof pushOn==='function'&&pushOn())return;
 const title='Ligar a '+leadName(l),opts={body:(l.contact?l.contact+' · ':'')+'O cliente pediu contacto a esta hora.',tag:'lead-'+l.id,data:{lead:l.id},icon:'/pwa-192x192.png',badge:'/favicon-32x32.png',requireInteraction:true};
 const fallback=()=>{try{new Notification(title,opts)}catch(e){}};
 if(typeof navigator!=='undefined'&&navigator.serviceWorker?.getRegistration)navigator.serviceWorker.getRegistration().then(r=>r?r.showNotification(title,opts):fallback()).catch(fallback);else fallback();
}
// Cada chamada em hora fica no histórico de notificações (sininho). O aviso no topo mostra só as que ainda não foram fechadas:
// qualquer botão do aviso (Ligar, Abrir lead, Adiar, Já liguei ou ×) fecha-o logo.
const leadCallNotif=l=>'call|'+l.id+'|'+l.callAt;
function leadRemind(){
 const box=document.querySelector('#lead-alert');if(!box)return;
 const due=typeof SESS==='function'&&SESS()?leadDue():[];
 let added=false;
 for(const l of due)if(typeof notifAdd==='function'&&notifAdd({id:leadCallNotif(l),kind:'call',lead:l.id,title:'Ligar a '+leadName(l),text:'Pediu contacto '+leadAtTxt(l.callAt)+(l.contact?' · '+l.contact:''),at:new Date(l.callAt).getTime()||Date.now()}))added=true;
 if(added)save();
 due.forEach(leadNotify);
 const open=due.filter(l=>{const n=typeof notifGet==='function'?notifGet(leadCallNotif(l)):null;return n?!n.closed:typeof notifGet!=='function'});
 box.classList[open.length?'add':'remove']('on');
 box.innerHTML=open.slice(0,3).map(l=>{const tel=String(l.contact||'').replace(/\s/g,'');return`<div class="lead-alert-i" role="alert"><button class="lead-alert-x" data-lr="dismiss" data-id="${esc(l.id)}" aria-label="Fechar aviso">×</button><div class="lead-alert-t"><b>${ic('bell')} Ligar a ${esc(leadName(l))}</b><span>Pediu contacto ${esc(leadAtTxt(l.callAt))}${l.contact?' · '+esc(l.contact):''}</span></div><div class="lead-alert-b">${tel?`<a class="btn" href="tel:${esc(tel)}" data-lr="call" data-id="${esc(l.id)}">Ligar</a>`:''}<button class="btn alt" data-lr="open" data-id="${esc(l.id)}">Abrir lead</button><button class="btn alt" data-lr="snooze" data-id="${esc(l.id)}">Adiar ${LEAD_SNOOZE} min</button><button class="btn alt" data-lr="done" data-id="${esc(l.id)}">Já liguei</button></div></div>`}).join('')+(open.length>3?`<p class="lead-alert-more">E mais ${open.length-3} lead${open.length-3>1?'s':''} por ligar. Veja no sininho ou na coluna «Não atendeu».</p>`:'');
 if(typeof notifBell==='function')notifBell();
}
const leadLocalAt=ms=>{const d=new Date(ms);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16)};
// Copia para a lead aberta no editor as alterações feitas fora dele, sem a marcar como alterada.
function leadPatchDraft(l,keys){
 if(leadDraft?.id!==l.id)return;
 const o=JSON.parse(leadOrig);for(const k of keys){leadDraft[k]=structuredClone(l[k]);o[k]=structuredClone(l[k])}leadOrig=JSON.stringify(o);
}
function leadOpenFromAlert(id){
 if(leadDraft&&leadDraft.id!==id&&leadDirty()&&!confirm('Sair sem guardar as alterações desta lead?'))return;
 if(!leadOpen(id))return;V.tab='leads';V.obra=null;V.lall='';window.scrollTo?.(0,0);render();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-lr]');if(!b)return;
 const l=(S.leads||[]).find(x=>x.id===b.dataset.id);if(!l)return;
 const a=b.dataset.lr;
 if(typeof notifClose==='function')notifClose(leadCallNotif(l));
 if(a==='snooze')l.callAt=leadLocalAt(Date.now()+LEAD_SNOOZE*6e4);
 else if(a==='done'){l.callDone=l.callAt;l.callDay=leadToday();l.ct={...(l.ct||{}),['call|'+l.callAt]:'sim'};l.calls=[...leadCallsOf(l),leadCallNew('')]}
 save();leadPatchDraft(l,['callAt','callDay','callDone','ct','calls']);
 if(a==='open'){leadRemind();leadOpenFromAlert(l.id);return}
 leadRemind();if(['leads','cal'].includes(V.tab)&&!document.activeElement?.matches?.('input,textarea,select'))render();
});
// Tocar na notificação do sistema abre a lead na app.
if(typeof navigator!=='undefined')navigator.serviceWorker?.addEventListener?.('message',e=>{const l=e.data?.lead&&(S.leads||[]).find(x=>x.id===e.data.lead);if(!l)return;if(typeof notifClose==='function'){notifClose(leadCallNotif(l));save()}leadRemind();leadOpenFromAlert(l.id)});
if(typeof setInterval==='function'&&typeof document!=='undefined'&&document.querySelector)setInterval(leadRemind,20000);
