/* Leads: contactos de potenciais clientes, com a fase, as soluções pretendidas e os orçamentos criados a partir de cada lead.
   Ficam em S.leads, sincronizadas entre dispositivos como as obras. Nenhum campo é obrigatório. */
const LEAD_STAGES={nova:'Nova lead',contacto:'Contacto',triagem:'Triagem',orcamento:'Em orçamento',enviada:'Proposta enviada',ganho:'Ganho / adjudicado',visita:'Visita agendada',perdido:'Perdido'};
const LEAD_SOLUTIONS=['Ar condicionado','Bomba de calor AQS','Bomba de calor climatização','Painéis fotovoltaicos','Painéis solares térmicos','Piso radiante','VMC','Carregador automóvel'];
const LEAD_HOUSES=['Moradia','Apartamento','Moradia antiga','Moradia geminada'];
// Soluções da lead que correspondem a tipologias dos orçamentos com outro nome; as escritas à mão ficam em Geral / outros.
const LEAD_TOPIC={'Painéis fotovoltaicos':'UPAC (fotovoltaico)'};
const LEAD_PV='Painéis fotovoltaicos';
const LEAD_FIELDS=['name','address','contact','email','coords','rooms','bill','area','notes','value','brand','timing'];
let leadDraft=null,leadOrig='',leadMsg='';

const leadToday=()=>new Date().toISOString().slice(0,10);
const leadNew=()=>({...Object.fromEntries(LEAD_FIELDS.map(k=>[k,''])),stage:'nova',solutions:[],call:'',house:'',date:leadToday()});
const leadName=l=>String(l.name||'').trim()||'Lead sem nome';
const leadList=()=>(S.leads||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.u||0)-(a.u||0));
const leadText=l=>[l.name,l.contact,l.email,l.address,l.brand,...(l.solutions||[])].join(' ');
const leadQuotes=id=>(quoteRows||[]).filter(r=>r.document.lead===id);
const leadTopics=l=>[...new Set((l.solutions||[]).map(s=>LEAD_TOPIC[s]||(TOPICS.includes(s)?s:'Geral / outros')))];
const leadBadge=s=>`<span class="lead-badge lead-${s in LEAD_STAGES?s:'nova'}">${LEAD_STAGES[s]||LEAD_STAGES.nova}</span>`;
const leadCall=c=>c==='atendeu'?'<span class="lead-call pos">Atendeu</span>':c==='nao'?'<span class="lead-call neg">Não atendeu</span>':'';

function leadRow(l){
 const info=[(l.solutions||[]).join(', '),l.contact].filter(v=>String(v||'').trim()).map(esc).join(' · ');
 return`<button class="row invoice-row lead-row lead-${esc(l.stage||'nova')}" data-la="open" data-id="${esc(l.id)}"><div class="av">${esc(leadName(l)[0])}</div><div class="rt"><b>${esc(leadName(l))}</b><span>${info||'Sem soluções indicadas'}</span><span>${l.date?esc(fd(l.date)):''}${leadCall(l.call)}</span></div><div class="rr">${leadBadge(l.stage)}</div></button>`;
}
function leadsList(){
 const st=V.ls||'',q=V.lq||'',l=leadList().filter(x=>(!st||x.stage===st)&&(!q||match(leadText(x),q)));
 return l.length?l.map(leadRow).join(''):`<div class="empty">${(S.leads||[]).length?'Nenhuma lead com estes filtros.':'Ainda sem leads. Toque em «Nova lead» para registar o primeiro contacto.'}</div>`;
}
// Pesquisa global da página inicial.
const leadSearch=q=>q.trim()?leadList().filter(l=>match(leadText(l),q)):[];

function vLeads(){
 leadEnsureQuotes();
 if(leadDraft)return leadEditor();
 const all=S.leads||[],count=s=>all.filter(l=>l.stage===s).length;
 return`<h1>Leads</h1><p class="sub">Contactos de clientes, da primeira chamada à adjudicação.</p><button class="btn" data-la="new">Nova lead</button><div class="sbar" style="margin-top:14px">${ic('search')}<input id="lq" type="search" value="${esc(V.lq||'')}" aria-label="Procurar leads" placeholder="Nome, contacto, morada ou solução" autocomplete="off"></div><div class="chips">${[['','Todas'],...Object.entries(LEAD_STAGES)].map(([k,l])=>`<button class="${(V.ls||'')===k?'on':''}" data-la="filter" data-id="${k}">${l}${k&&count(k)?' · '+count(k):''}</button>`).join('')}</div><div class="grp" id="llist">${leadsList()}</div>`;
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
function leadEditor(){
 const l=leadDraft,maps=String(l.coords||'').trim()||String(l.address||'').trim();
 return`<button class="back" data-la="close">${ic('back')} Leads</button><h1>${l.id?esc(leadName(l)):'Nova lead'}</h1><p class="sub">Nenhum campo é obrigatório. Pode guardar e completar mais tarde.</p>
 <div class="lead-ed lead-${esc(l.stage)}"><h2>Fase da lead</h2><div class="lead-opts lead-stages">${Object.entries(LEAD_STAGES).map(([k,t])=>leadChoice('stage',k,t,'lead-'+k)).join('')}</div></div>
 <h2>Cliente</h2><div class="q-card">${leadField('Nome do cliente','name','text','maxlength="2000" autocomplete="off"')}${leadField('Morada','address','text','maxlength="4000" autocomplete="off"')}${leadField('Contacto','contact','tel','maxlength="2000" inputmode="tel" autocomplete="off"')}${leadField('Email','email','email','maxlength="320" autocomplete="off" placeholder="cliente@exemplo.pt"')}${leadField('Coordenadas (opcional)','coords','text','maxlength="200" autocomplete="off" placeholder="Ex.: 41.7672, -8.5836"')}${maps?`<a class="link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(maps)}" target="_blank" rel="noopener">Abrir no mapa</a>`:''}${leadField('Data','date','date')}</div>
 <h2>Solução pretendida</h2><p class="note">Selecione todas as que o cliente pretende.</p><div class="lead-opts">${[...LEAD_SOLUTIONS,...l.solutions.filter(s=>!LEAD_SOLUTIONS.includes(s))].map(s=>`<button type="button" class="lead-opt ${l.solutions.includes(s)?'on':''}" data-la="sol" data-v="${esc(s)}" aria-pressed="${l.solutions.includes(s)}">${esc(s)}</button>`).join('')}</div><div class="lead-add"><input id="lead-sol" maxlength="100" placeholder="Outra solução" aria-label="Outra solução" autocomplete="off"><button type="button" class="btn alt" data-la="sol-add">Adicionar</button></div>
 <h2>Chamada</h2><div class="lead-opts">${leadChoice('call','atendeu','Atendeu','lead-yes')}${leadChoice('call','nao','Não atendeu','lead-no')}</div>
 <h2>Tipo de casa</h2><div class="lead-opts">${LEAD_HOUSES.map(h=>leadChoice('house',h,h)).join('')}</div>
 <h2>Detalhes técnicos</h2><div class="q-card">${leadArea('Divisões a climatizar','rooms','Ex.: sala, 3 quartos, escritório')}${l.solutions.includes(LEAD_PV)?leadField('Fatura elétrica','bill','text','maxlength="2000" placeholder="Ex.: 120 € por mês"'):''}${leadArea('Área das divisões','area','Ex.: sala 30 m², quartos 12 m²')}${leadArea('Observações técnicas','notes')}${leadField('Valor orçamentado','value','text','maxlength="200"')}${leadField('Marca','brand','text','maxlength="200" list="quote-brands" autocomplete="off"')}<datalist id="quote-brands">${quoteTables().map(t=>`<option value="${esc(t.brand)}">`).join('')}</datalist>${leadField('Timing','timing','text','maxlength="2000" placeholder="Ex.: obra em março"')}</div>
 <p id="lead-msg" role="status" class="note">${esc(leadMsg)}</p><button class="btn" data-la="save">Guardar lead</button><button class="btn alt" data-la="quote">Criar orçamento para esta lead</button>
 ${leadQuotesHtml(l)}${l.id?'<button class="btn del" data-la="delete">Eliminar lead</button>':''}`;
}

function leadOpen(id){const l=(S.leads||[]).find(x=>x.id===id);if(!l)return false;leadDraft={...leadNew(),...structuredClone(l)};delete leadDraft.u;leadOrig=JSON.stringify(leadDraft);leadMsg='';return true}
const leadDirty=()=>leadDraft&&JSON.stringify(leadDraft)!==leadOrig;
function leadSave(){
 const l={...leadDraft};LEAD_FIELDS.forEach(k=>l[k]=String(l[k]||'').trim());
 if(!l.solutions.includes(LEAD_PV))l.bill='';
 l.date=/^\d{4}-\d{2}-\d{2}$/.test(l.date)?l.date:leadToday();
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
 if(t.id==='lq'){V.lq=t.value;navEntries[navIndex].v=navView();const l=document.querySelector('#llist');if(l)l.innerHTML=leadsList();return}
 if(t.dataset?.lf&&leadDraft)leadDraft[t.dataset.lf]=t.value;
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-la]');if(!b)return;e.stopImmediatePropagation();
 const a=b.dataset.la,id=b.dataset.id;
 if(a==='new'){leadDraft=leadNew();leadOrig=JSON.stringify(leadDraft);leadMsg='';window.scrollTo?.(0,0)}
 else if(a==='open'){if(!leadOpen(id)){alert('Lead não encontrada.');return}V.tab='leads';V.obra=null;window.scrollTo?.(0,0)}
 else if(a==='filter')V.ls=id;
 else if(a==='close'){if(leadDirty()&&!confirm('Sair sem guardar as alterações desta lead?'))return;leadDraft=null;leadMsg='';window.scrollTo?.(0,0)}
 else if(a==='set'){const f=b.dataset.f,v=b.dataset.v;leadDraft[f]=f!=='stage'&&leadDraft[f]===v?'':v}
 else if(a==='sol'){const v=b.dataset.v,s=leadDraft.solutions;leadDraft.solutions=s.includes(v)?s.filter(x=>x!==v):[...s,v]}
 else if(a==='sol-add'){const inp=document.querySelector('#lead-sol'),v=String(inp?.value||'').trim();if(!v)return;if(!leadDraft.solutions.includes(v))leadDraft.solutions=[...leadDraft.solutions,v]}
 else if(a==='save')leadSave();
 else if(a==='quote')leadQuote();
 else if(a==='pdf'){const r=(quoteRows||[]).find(r=>r.id===Number(id));if(!r)return;b.disabled=true;b.textContent='A preparar PDF…';try{await downloadQuotePdf({...r.document,id:r.id})}catch(err){alert('Não foi possível gerar o PDF.')}b.disabled=false;b.textContent='Descarregar PDF do orçamento';return}
 else if(a==='delete'){if(!confirm('Eliminar a lead '+leadName(leadDraft)+'? Os orçamentos criados continuam em Orçamentos.'))return;S.leads=(S.leads||[]).filter(x=>x.id!==leadDraft.id);save();leadDraft=null;leadMsg=''}
 render();
},true);
