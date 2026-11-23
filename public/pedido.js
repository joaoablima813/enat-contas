/* «Pedir detalhes ao cliente» na ficha da lead: cria o link do questionário, abre o WhatsApp ou o email com a mensagem
   pronta e, quando o cliente responde, preenche a lead (morada, soluções, tipo de casa, prazo…) e mostra as respostas.
   O mesmo link é a página do cliente: a ficha mostra também as mensagens (com resposta) e os orçamentos de outras
   empresas que o cliente enviou. As mensagens e os ficheiros ficam só no servidor e são lidos ao abrir a lead. */
let PED_MSG='',PED_BUSY=false,PED_AT=0;
const PED_URL={},PED_CONV={};
const pedWhen=t=>new Date(t).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function pedConv(id,force){
 const c=PED_CONV[id];if(c&&!force&&(c.loading||Date.now()-c.at<6e4))return c;
 PED_CONV[id]={...(c||{}),loading:true,at:Date.now()};
 API('pedido/conversa/'+encodeURIComponent(id)).then(r=>r.ok?r.json():null).then(j=>{PED_CONV[id]={...(j||PED_CONV[id]),loading:false,at:Date.now(),err:!j};if((leadDraft?.id===id||V.lt==='msg')&&V.tab==='leads'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))render()}).catch(()=>{PED_CONV[id]={...PED_CONV[id],loading:false,err:true}});
 return PED_CONV[id];
}
function pedPortal(l){
 const c=pedConv(l.id);if(!c.token)return '';
 const msgs=c.msgs||[],ax=c.anexos||[],mail=String(l.email||'').trim();
 return `<h2>Página do cliente</h2><p class="note" style="margin:-4px 6px 10px">O cliente usa sempre este link: respostas, orçamentos, mensagens e orçamentos de outras empresas.</p>
 <div class="grp tpad"><p style="margin:0 0 10px;word-break:break-all;font-size:14px">${esc(c.url)}</p><div class="lead-call-add"><button type="button" class="btn alt" data-ped="copy">Copiar link</button><button type="button" class="btn alt" data-ped="abrir">Abrir</button></div>
 <button type="button" class="mini" data-ped="novo" ${PED_BUSY?'disabled':''} style="margin-top:10px">Gerar link novo (o atual deixa de funcionar)</button></div>
 <h2>Mensagens${msgs.length?' ('+msgs.length+')':''}</h2><div class="grp tpad">${msgs.length?`<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">${msgs.map(m=>`<div style="max-width:85%;align-self:${m.de==='e'?'flex-end':'flex-start'};background:${m.de==='e'?'var(--blue)':'var(--chip)'};color:${m.de==='e'?'#fff':'inherit'};border-radius:14px;padding:8px 11px"><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.texto)}</div><div style="font-size:11.5px;opacity:.75;margin-top:3px">${m.de==='e'?'ENAT':esc(leadName(l))} · ${esc(pedWhen(m.at))}</div></div>`).join('')}</div>`:'<p class="note" style="margin:0 0 10px">Ainda sem mensagens.</p>'}
 <label class="q-field" style="margin:0"><span>Responder ao cliente</span><textarea id="ped-msg" rows="3" maxlength="2000" placeholder="Escreva a resposta…"></textarea></label>
 <button type="button" class="btn" data-ped="msg" ${PED_BUSY?'disabled':''} style="margin-top:8px">Enviar mensagem</button>
 <p class="note" style="margin:6px 0 0">${mail?'O cliente recebe a mensagem também por email.':'Este cliente não tem email: depois de enviar, avise-o por WhatsApp.'}</p></div>
 ${ax.length?`<h2>Orçamentos de outras empresas (${ax.length})</h2><div class="grp">${ax.map(a=>`<button class="row invoice-row" data-ped="anexo" data-id="${esc(a.id)}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${esc(a.nome)}</b><span>Enviado a ${esc(pedWhen(a.at))}</span></div><div class="rr">${ic('chev')}</div></button>`).join('')}</div>`:''}`;
}
const pedText=(l,url)=>EnatPedido.message(l.name,l.solutions,globalThis.ENAT_EMPRESA?.contacto?.nome,url);
// Fotos do cliente: precisam da sessão, por isso são carregadas como blob.
function pedPhotos(ids){for(const id of ids)if(!(id in PED_URL)){PED_URL[id]='';API('pedido/foto/'+id).then(r=>r.ok?r.blob():null).then(b=>{if(b){PED_URL[id]=URL.createObjectURL(b);if(V.tab==='leads'&&idle())render()}}).catch(()=>{})}}
function pedidoSection(l){
 const p=l.pedido||{},r=p.resp,tel=waTel(l.contact),mail=String(l.email||'').trim();
 if(r)pedPhotos(r.fotos||[]);
 const when=t=>new Date(t).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const answers=r?`<div class="grp">${EnatPedido.summary(r).map(([k,v])=>`<div class="row kv"><div class="rt"><span>${esc(k)}</span><b style="white-space:normal">${esc(v)}</b></div></div>`).join('')}</div>${(r.fotos||[]).length?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0">${r.fotos.map(id=>PED_URL[id]?`<a href="${esc(PED_URL[id])}" target="_blank" rel="noopener"><img src="${esc(PED_URL[id])}" alt="Foto do cliente" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block"></a>`:'<div style="aspect-ratio:1;border-radius:10px;background:var(--chip)"></div>').join('')}</div>`:''}`:'';
 const sug=(p.sug||[]).length?`<h2>Equipamentos sugeridos</h2><p class="note" style="margin:-4px 6px 10px">Calculado automaticamente a partir das respostas do cliente, com as regras técnicas do orçamento automático. É uma primeira estimativa: confirme na visita ou com as fotos.</p>${p.sug.map(s=>`<div class="grp"><div class="row kv"><div class="rt"><b>${esc(s.titulo)}</b>${s.linhas.map(x=>`<span style="white-space:normal">• ${esc(x)}</span>`).join('')}${s.nota?`<span style="white-space:normal;font-size:12.5px;opacity:.8">${esc(s.nota)}</span>`:''}</div></div></div>`).join('')}`:'';
 return `${sug}<h2>Pedir detalhes ao cliente</h2>
 ${r?`<p class="note">Respondeu a ${esc(when(r.at))}. Os dados já foram passados para esta lead.</p>${answers}`:p.sent?`<p class="note">${p.failed?'O email automático não foi aceite pelo servidor. Confirme o email do cliente e envie de novo.':(p.via==='site'?'Questionário mostrado no site, logo a seguir ao pedido, a ':p.auto?'Enviado automaticamente por email a ':'Link enviado a ')+esc(when(p.sent))+'. Ainda sem resposta.'}</p>`:`<p class="note" style="margin:-4px 6px 10px">Envie ao cliente um link com perguntas rápidas: solução, gama (preço, equilíbrio ou qualidade), áreas, morada e fotos. As respostas entram nesta lead e recebe um aviso.</p>`}
 <div class="lead-call-add">${tel?`<button type="button" class="btn ${r?'alt':''}" data-ped="whatsapp" ${PED_BUSY?'disabled':''}>${r||p.sent?'Reenviar':'Enviar'} por WhatsApp</button>`:''}${mail?`<button type="button" class="btn alt" data-ped="email" ${PED_BUSY?'disabled':''}>${r||p.sent?'Reenviar':'Enviar'} por email</button>`:''}</div>
 ${!tel&&!mail?'<p class="note">Indique o contacto ou o email do cliente para enviar o link.</p>':''}
 ${PED_MSG?`<p class="note" role="status">${esc(PED_MSG)}</p>`:''}
 ${l.id&&(p.token||p.sent||r||p.chatAt||p.anexoAt)?pedPortal(l):''}`;
}
// Passa as respostas para os campos da lead, sem apagar o que já foi escrito à mão.
function pedApply(l,resp){
 const a=resp.a||{},addr=[resp.morada,[resp.cp,resp.local].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 if(addr&&!String(l.address||'').trim())l.address=addr;
 l.solutions=[...new Set([...(l.solutions||[]),...resp.sol])];
 const house=a.casa&&LEAD_HOUSES.includes(a.casa)?a.casa:'';if(house&&!l.house)l.house=house;
 if(a.prazo&&!l.timing)l.timing=a.prazo;
 if(a.agua&&!l.heating)l.heating=a.agua;
 if(a.pv_fat&&!l.bill)l.bill=a.pv_fat+' por mês';
 const rooms=EnatPedido.roomsText(a.ac_rooms);if((rooms||a.ac_div)&&!l.rooms)l.rooms=rooms||a.ac_div+' divisão(ões)';
 const area=rooms||(a.m2?a.m2+' m² de área útil':'');if(area&&!l.area)l.area=area;
 l.pedido={...(l.pedido||{}),resp};
 if(l.stage==='nova'||l.stage==='contacto')l.stage='triagem';
}
// Lê as respostas novas no servidor (no máximo a cada minuto, ao sincronizar).
async function pedidosPull(force){
 if(!force&&Date.now()-PED_AT<2e4)return;PED_AT=Date.now();
 const r=await API('pedidos').catch(()=>null);if(!r?.ok)return;
 const {pedidos,auto}=await r.json().catch(()=>({}));let changed=false;
 for(const p of pedidos||[]){
  const l=(S.leads||[]).find(x=>x.id===p.lead);if(!l)continue;
  // Mensagens e orçamentos de outras empresas: só a data da última novidade fica na lead.
  const o=l.pedido||{};
  if((p.chatAt||0)>(o.chatAt||0)||(p.anexoAt||0)>(o.anexoAt||0)){
   if((p.chatAt||0)>(o.chatAt||0)&&typeof notifAdd==='function')notifAdd({id:'chat|'+l.id+'|'+p.chatAt,kind:'lead',lead:l.id,title:'Mensagem de '+leadName(l),text:'Nova mensagem na página do cliente',at:p.chatAt});
   if((p.anexoAt||0)>(o.anexoAt||0)&&typeof notifAdd==='function')notifAdd({id:'anexo|'+l.id+'|'+p.anexoAt,kind:'lead',lead:l.id,title:'Orçamento de outra empresa: '+leadName(l),text:'O cliente enviou um orçamento de outra empresa',at:p.anexoAt});
   l.pedido={...o,token:o.token||p.token,chatAt:p.chatAt||o.chatAt||0,anexoAt:p.anexoAt||o.anexoAt||0};changed=true;
   if(leadDraft?.id===l.id){leadDraft.pedido={...leadDraft.pedido,chatAt:l.pedido.chatAt,anexoAt:l.pedido.anexoAt,token:l.pedido.token};leadOrig=JSON.stringify({...JSON.parse(leadOrig),pedido:leadDraft.pedido});pedConv(l.id,true)}
  }
  if(!p.resp)continue;
  // Sugestões recalculadas pelo servidor (também para respostas antigas, se o cálculo melhorar).
  if(l.pedido?.resp?.at>=p.at){if(p.sug&&JSON.stringify(p.sug)!==JSON.stringify(l.pedido.sug)){l.pedido.sug=p.sug;changed=true;if(leadDraft?.id===l.id){leadDraft.pedido={...leadDraft.pedido,sug:p.sug};leadOrig=JSON.stringify({...JSON.parse(leadOrig),pedido:leadDraft.pedido})}}continue}
  if(p.sug)l.pedido={...(l.pedido||{}),sug:p.sug};
  pedApply(l,{...EnatPedido.clean(p.resp),fotos:(p.resp.fotos||[]).filter(f=>/^[a-z0-9]{8,40}$/.test(f)),at:p.at});changed=true;
  // Respostas alteradas pelo cliente voltam a aparecer como novidade.
  if(l.pedido.visto)l.pedido={...l.pedido,visto:0};
  if(leadDraft?.id===l.id){const keep=leadDirty();Object.assign(leadDraft,structuredClone(l));if(!keep)leadOrig=JSON.stringify(leadDraft)}
  if(typeof notifAdd==='function')notifAdd({id:'pedido|'+l.id+'|'+p.at,kind:'lead',lead:l.id,title:'Detalhes recebidos: '+leadName(l),text:p.resp.sol?.join(', ')||'O cliente respondeu ao questionário',at:p.at});
 }
 // Links enviados automaticamente por email pelo servidor.
 for(const x of auto||[]){const l=(S.leads||[]).find(y=>y.id===x.lead);if(!l||l.pedido?.sent)continue;l.pedido={...(l.pedido||{}),token:x.token,sent:x.sent,auto:true,failed:x.failed,via:x.via};changed=true;if(leadDraft?.id===l.id){leadDraft.pedido=l.pedido;leadOrig=JSON.stringify({...JSON.parse(leadOrig),pedido:l.pedido})}}
 // Volta a desenhar também com uma lead aberta (desde que não esteja a escrever num campo).
 if(changed){save();const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(idle()||(!typing&&!D&&!quoteDraft&&V.tab==='leads'))render()}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-ped]');if(!b||!leadDraft)return;const ch=b.dataset.ped;
 if(['copy','abrir','novo','msg','anexo'].includes(ch)){await pedAction(b,ch);return}
 // A janela tem de abrir já no toque (o Safari bloqueia janelas abertas depois de esperar pela rede).
 const win=ch==='whatsapp'?window.open('','_blank'):null;
 PED_BUSY=true;PED_MSG='A preparar o link…';render();
 try{
  const l=leadSave();
  const r=await API('pedido',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lead:l.id,nome:l.name,sol:l.solutions})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não foi possível criar o link.');
  const text=pedText(l,j.url);
  if(ch==='whatsapp'){const href='https://wa.me/'+waTel(l.contact)+'?text='+encodeURIComponent(text);win?win.location.href=href:window.open(href,'_blank')}
  else location.href='mailto:'+encodeURIComponent(l.email.trim())+'?subject='+encodeURIComponent('O seu pedido de orçamento · Enat - Ponte de Lima')+'&body='+encodeURIComponent(text);
  const saved=(S.leads||[]).find(x=>x.id===l.id);saved.pedido={...(saved.pedido||{}),token:j.token,sent:Date.now()};
  if(saved.stage==='nova')saved.stage='contacto';
  save();Object.assign(leadDraft,{pedido:saved.pedido,stage:saved.stage});leadOrig=JSON.stringify(leadDraft);
  PED_MSG=ch==='whatsapp'?'Mensagem pronta no WhatsApp: toque em enviar.':'Email pronto: toque em enviar.';
 }catch(x){win?.close();PED_MSG=x.message}
 PED_BUSY=false;render();
});

// Leads que responderam ao questionário e ainda não foram abertas: secção própria no topo das Leads.
const pedNovo=p=>({resp:Boolean(p?.resp&&!p.visto),msg:(p?.chatAt||0)>(p?.chatVisto||0),ax:(p?.anexoAt||0)>(p?.chatVisto||0)});
const pedLast=p=>Math.max(p.resp?.at||0,p.chatAt||0,p.anexoAt||0);
const pedNovas=()=>(S.leads||[]).filter(l=>{const n=pedNovo(l.pedido);return n.resp||n.msg||n.ax}).sort((a,b)=>pedLast(b.pedido)-pedLast(a.pedido));
function pedidosNovosHtml(){
 const l=pedNovas();if(!l.length)return '';
 const when=t=>new Date(t).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 return `<h2 class="lead-new-h">Novidades dos clientes (${l.length})</h2><p class="note">Respostas ao questionário, mensagens e orçamentos de outras empresas enviados pela página do cliente.</p><div class="grp lead-new">${l.map(x=>{const p=x.pedido,n=pedNovo(p),what=[n.resp&&'respostas',n.msg&&'mensagem',n.ax&&'outro orçamento'].filter(Boolean);return `<button class="row invoice-row lead-row lead-triagem" data-la="open" data-id="${esc(x.id)}"><div class="av">${esc(leadName(x)[0])}</div><div class="rt"><b>${esc(leadName(x))}</b><span>${n.resp?esc((p.resp.sol||[]).join(', '))+(p.resp.local?' · '+esc(p.resp.local):''):n.msg?'Enviou uma mensagem':'Enviou um orçamento de outra empresa'}</span><span>${esc(when(pedLast(p)))} · ${esc(what.join(', '))}${n.resp&&(p.resp.fotos||[]).length?' · '+p.resp.fotos.length+' foto'+(p.resp.fotos.length>1?'s':''):''}</span></div><div class="rr"><b>Novo</b></div></button>`}).join('')}</div>`;
}
// ---- Mensagens: todas as conversas com os clientes (página do cliente), as mais recentes primeiro ----
let CHAT_MSG='',CHAT_BUSY=false;
const pedChatAt=p=>Math.max(p?.chatAt||0,p?.anexoAt||0,p?.enatAt||0);
const pedChats=()=>(S.leads||[]).filter(l=>l.pedido&&(l.pedido.chatAt||l.pedido.anexoAt)).sort((a,b)=>pedChatAt(b.pedido)-pedChatAt(a.pedido));
const chatBubbles=msgs=>msgs.map(m=>`<div class="chat-b ${m.de==='e'?'me':'cli'}"><div>${esc(m.texto)}</div><small>${m.de==='e'?'Você':'Cliente'} · ${esc(pedWhen(m.at))}</small></div>`).join('');
function pedChatsHtml(){
 const list=pedChats();
 if(V.lchat){
  const l=(S.leads||[]).find(x=>x.id===V.lchat);if(!l){V.lchat='';return pedChatsHtml()}
  const c=pedConv(l.id),msgs=c.msgs||[],ax=c.anexos||[],mail=String(l.email||'').trim(),tel=waTel(l.contact);
  return `<button class="back" data-lm="back">${ic('back')} Mensagens</button>
  <div class="chat-top"><div class="av">${esc(leadName(l)[0])}</div><div><b>${esc(leadName(l))}</b><span>${esc([l.contact,(l.solutions||[]).join(', ')].filter(Boolean).join(' · '))}</span></div></div>
  <div class="lead-call-add chat-acts"><button type="button" class="btn alt" data-la="open" data-id="${esc(l.id)}">Ver ficha da lead</button>${tel?`<a class="btn alt" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a>`:''}</div>
  <div class="grp tpad chat-thread">${c.loading&&!msgs.length?'<div class="empty">A carregar…</div>':msgs.length?chatBubbles(msgs):'<div class="empty">Ainda sem mensagens.</div>'}</div>
  ${ax.length?`<h2>Orçamentos de outras empresas (${ax.length})</h2><div class="grp">${ax.map(a=>`<button class="row invoice-row" data-lm="anexo" data-id="${esc(a.id)}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${esc(a.nome)}</b><span>Enviado a ${esc(pedWhen(a.at))}</span></div><div class="rr">${ic('chev')}</div></button>`).join('')}</div>`:''}
  <div class="chat-send"><label class="q-field" style="margin:0"><span>Responder a ${esc(leadName(l).split(' ')[0])}</span><textarea id="chat-msg" rows="3" maxlength="2000" placeholder="Escreva a resposta…"></textarea></label>
  <button type="button" class="btn" data-lm="send" ${CHAT_BUSY?'disabled':''}>${CHAT_BUSY?'A enviar…':'Enviar mensagem'}</button>
  <p class="note" role="status">${esc(CHAT_MSG)||(mail?'O cliente recebe a resposta na página dele e por email.':'Este cliente não tem email: depois de enviar, avise-o por WhatsApp.')}</p></div>`;
 }
 if(!list.length)return '<div class="grp"><div class="empty">Ainda não há conversas. Quando um cliente escrever na página dele (o link do questionário), a conversa aparece aqui.</div></div>';
 return `<p class="note">Conversas da página do cliente, as mais recentes primeiro. Toque numa para ler e responder.</p><div class="grp">${list.map(l=>{
  const p=l.pedido,n=pedNovo(p),c=pedConv(l.id),last=(c.msgs||[]).at(-1);
  const prev=last?(last.de==='e'?'Você: ':'')+last.texto:p.anexoAt&&!p.chatAt?'Enviou um orçamento de outra empresa':c.loading?'A carregar…':'';
  return `<button class="row invoice-row chat-row${n.msg||n.ax?' unread':''}" data-lm="open" data-id="${esc(l.id)}"><div class="av">${esc(leadName(l)[0])}</div><div class="rt"><b>${esc(leadName(l))}</b><span>${esc(String(prev).replace(/\s+/g,' ').slice(0,90))}</span></div><div class="rr"><small>${esc(pedWhen(pedChatAt(p)))}</small>${n.msg||n.ax?'<span class="lead-badge chat-new">Nova</span>':''}</div></button>`}).join('')}</div>`;
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-lm]');if(!b)return;const a=b.dataset.lm;
 if(a==='open'){V.lchat=b.dataset.id;CHAT_MSG='';pedVisto(b.dataset.id);pedConv(b.dataset.id,true);window.scrollTo?.(0,0);render();setTimeout(()=>{const t=document.querySelector('.chat-thread');if(t)t.scrollTop=t.scrollHeight},50);return}
 if(a==='back'){V.lchat='';CHAT_MSG='';window.scrollTo?.(0,0);render();return}
 if(a==='anexo'){const win=window.open('','_blank');try{const r=await API('pedido/anexo/'+b.dataset.id);if(!r.ok)throw 0;const u=URL.createObjectURL(await r.blob());win?win.location.href=u:window.open(u,'_blank')}catch{win?.close();alert('Não foi possível abrir o ficheiro. Verifique a ligação.')}return}
 if(a==='send'){
  const l=(S.leads||[]).find(x=>x.id===V.lchat),t=document.querySelector('#chat-msg'),texto=(t?.value||'').trim();if(!l)return;if(!texto){t?.focus();return}
  CHAT_BUSY=true;CHAT_MSG='';render();
  try{const r=await API('pedido/msg',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lead:l.id,texto,email:String(l.email||'').trim()})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não foi possível enviar. Verifique a ligação.');
   PED_CONV[l.id]={...(PED_CONV[l.id]||{}),msgs:j.msgs,at:Date.now()};l.pedido={...l.pedido,enatAt:Date.now(),chatVisto:Date.now()};save();
   CHAT_MSG=j.email==='enviado'?'Mensagem enviada. O cliente recebeu também um email.':j.email==='falhou'?'Mensagem guardada na página do cliente, mas o email falhou. Avise-o por WhatsApp.':'Mensagem guardada na página do cliente. Avise-o por WhatsApp.'}
  catch(x){CHAT_MSG=x.message;CHAT_BUSY=false;render();const n=document.querySelector('#chat-msg');if(n)n.value=texto;return}
  CHAT_BUSY=false;render();const th=document.querySelector('.chat-thread');if(th)th.scrollTop=th.scrollHeight;
 }
});
// Ao abrir a lead, as respostas passam a vistas.
function pedVisto(id){const l=(S.leads||[]).find(x=>x.id===id);const n=pedNovo(l?.pedido);if(n.resp||n.msg||n.ax){const t=Date.now();l.pedido={...l.pedido,...(l.pedido.resp?{visto:t}:{}),chatVisto:t};save()}}
// A app pede para sincronizar quando chega uma notificação com a app aberta.
if(typeof navigator!=='undefined')navigator.serviceWorker?.addEventListener?.('message',e=>{if(e.data?.refresh&&typeof pull==='function'&&SESS()){PED_AT=0;pull()}});

async function pedAction(b,ch){
 const l=leadDraft,c=PED_CONV[l.id]||{};
 if(ch==='abrir'){window.open(c.url,'_blank','noopener');return}
 if(ch==='copy'){try{await navigator.clipboard.writeText(c.url);PED_MSG='Link copiado.'}catch{prompt('Copie o link:',c.url);return}render();return}
 if(ch==='anexo'){
  // A janela abre já no toque (o Safari bloqueia janelas abertas depois de esperar pela rede).
  const win=window.open('','_blank');
  try{const r=await API('pedido/anexo/'+b.dataset.id);if(!r.ok)throw 0;const u=URL.createObjectURL(await r.blob());win?win.location.href=u:window.open(u,'_blank')}
  catch{win?.close();alert('Não foi possível abrir o ficheiro. Verifique a ligação.')}
  return;
 }
 if(ch==='novo'&&!confirm('Gerar um link novo para este cliente?\n\nO link atual deixa de funcionar. Tem de enviar o novo ao cliente.'))return;
 const texto=ch==='msg'?($('#ped-msg')?.value||'').trim():'';
 if(ch==='msg'&&!texto){$('#ped-msg')?.focus();return}
 PED_BUSY=true;PED_MSG=ch==='msg'?'A enviar…':'A gerar o link…';render();
 try{
  const r=await API(ch==='msg'?'pedido/msg':'pedido/novo-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lead:l.id,texto,email:String(l.email||'').trim()})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não foi possível concluir. Verifique a ligação.');
  if(ch==='msg'){PED_CONV[l.id]={...c,msgs:j.msgs,at:Date.now()};PED_MSG=j.email==='enviado'?'Mensagem enviada. O cliente recebeu também um email.':j.email==='falhou'?'Mensagem guardada na página do cliente, mas o email não foi aceite. Avise-o por WhatsApp.':'Mensagem guardada na página do cliente. Avise-o por WhatsApp.'}
  else{PED_CONV[l.id]={...c,token:j.token,url:j.url,at:Date.now()};const saved=(S.leads||[]).find(x=>x.id===l.id);if(saved){saved.pedido={...(saved.pedido||{}),token:j.token};save()}leadDraft.pedido={...(leadDraft.pedido||{}),token:j.token};leadOrig=JSON.stringify({...JSON.parse(leadOrig),pedido:leadDraft.pedido});PED_MSG='Link novo criado. O antigo já não funciona: envie este ao cliente.'}
 }catch(x){PED_MSG=x.message}
 PED_BUSY=false;render();
}
