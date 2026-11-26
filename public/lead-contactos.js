/* Na ficha da lead: os emails trocados com o cliente (lidos da caixa pontedelima@enat.pt) e o registo de cada
   WhatsApp aberto pela app para o número do cliente (a app não consegue ler o WhatsApp; regista que a mensagem foi aberta para envio). */
const LE={};// email → {loading, err, emails, configurado, t}
const LE_OPEN=new Set();
async function leFetch(email){
 const k=email.toLowerCase(),c=LE[k];if(c&&c.loading)return;
 LE[k]={...(c||{}),loading:true,err:''};
 try{
  const r=await API('email/conversa?email='+encodeURIComponent(k));
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Não foi possível ler os emails.');
  LE[k]={emails:j.emails||[],configurado:j.configurado!==false,t:Date.now()};
 }catch(e){LE[k]={err:e.message||'Sem ligação ao servidor.',t:Date.now()}}
 if(V.tab==='leads'&&leadDraft&&idle())render();
}
const leDia=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' às')};
function leadEmailsHtml(l){
 if(!l.id)return '';
 const email=String(l.email||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return`<h2>Emails</h2><div class="grp"><div class="empty">Preencha o email do cliente para ver aqui os emails trocados com ele.</div></div>`;
 const k=email.toLowerCase(),c=LE[k];
 if(!c||(!c.loading&&Date.now()-c.t>3*60e3))leFetch(email);
 const lista=!c||c.loading&&!c.emails?'<div class="empty">A procurar emails…</div>':c.err?`<div class="empty">${esc(c.err)}</div>`:c.configurado===false?'<div class="empty">A caixa de email ainda não está ligada à app.</div>':!c.emails.length?'<div class="empty">Sem emails enviados ou recebidos deste cliente.</div>':
  c.emails.map(m=>{const open=LE_OPEN.has(m.id),env=m.tipo==='enviado';return`<div class="le-mail${open?' open':''}"><button type="button" class="row le-row" data-le="open" data-id="${esc(m.id)}"><div class="av le-${env?'env':'rec'}">${env?'↗':'↙'}</div><div class="rt"><b>${esc(m.assunto)}</b><span>${env?'Enviado':'Recebido'} · ${esc(leDia(m.data))}${m.anexos&&m.anexos.length?' · 📎 '+m.anexos.length:''}</span>${open?'':`<span class="le-prev">${esc(String(m.texto||'').replace(/\s+/g,' ').slice(0,110))}</span>`}</div></button>${open?`<div class="le-body">${esc(m.texto||'(sem texto)')}${m.anexos&&m.anexos.length?`<p class="note">Anexos: ${m.anexos.map(esc).join(', ')}</p>`:''}</div>`:''}</div>`}).join('');
 const n=c&&c.emails?c.emails.length:0;
 return`<h2>Emails${n?' ('+n+')':''} <button type="button" class="le-ref" data-le="ref" data-id="${esc(email)}">atualizar</button></h2><p class="note">Emails enviados e recebidos de ${esc(email)}, incluindo os escritos no Outlook. Toque num email para ler.</p><div class="grp le-list">${lista}</div>`;
}
// WhatsApp: cada vez que a app abre o WhatsApp para o número de uma lead, fica registado nessa lead.
const leTel=s=>String(s||'').replace(/\D/g,'').slice(-9);
function leadWaMark(tel,oque){
 const t=leTel(tel);if(t.length<9)return;let mud=false;
 for(const l of S.leads||[])if(leTel(l.contact)===t){l.wa=[...(l.wa||[]),{at:Date.now(),o:String(oque||'Mensagem').slice(0,80)}].slice(-40);mud=true}
 if(mud){save();if(leadDraft){const s=(S.leads||[]).find(x=>x.id===leadDraft.id);if(s)leadDraft.wa=s.wa}}
}
function leadWaHtml(l){
 if(!l.id)return '';
 const w=(l.wa||[]).slice().reverse();
 return`<h2>WhatsApp${w.length?' ('+w.length+')':''}</h2><p class="note">Cada vez que abre o WhatsApp para este cliente a partir da app (proposta, link do pedido, botão WhatsApp), fica aqui registado. As mensagens escritas diretamente no telemóvel ainda não aparecem.</p><div class="grp">${w.length?w.map(x=>`<div class="row"><div class="av le-wa">💬</div><div class="rt"><b>${esc(x.o)}</b><span>Aberto para envio · ${esc(leDia(x.at))}</span></div></div>`).join(''):'<div class="empty">Ainda não abriu o WhatsApp para este cliente pela app.</div>'}</div>`;
}
// Qualquer link wa.me clicado na app (propostas, pedidos, leads, obras…) conta para a lead com esse número.
document.addEventListener('click',e=>{
 const a=e.target.closest&&e.target.closest('a[href*="wa.me/"]');if(a){const m=a.getAttribute('href').match(/wa\.me\/(\d+)/);if(m)leadWaMark(m[1],a.dataset.waWhat||(a.closest('.q-wa')||a.classList.contains('q-wa-open')?'Proposta':'Mensagem'))}
 const b=e.target.closest&&e.target.closest('[data-le]');if(!b)return;e.stopImmediatePropagation();
 if(b.dataset.le==='open'){LE_OPEN.has(b.dataset.id)?LE_OPEN.delete(b.dataset.id):LE_OPEN.add(b.dataset.id);render()}
 else if(b.dataset.le==='ref'){delete LE[b.dataset.id.toLowerCase()];render()}
},true);
