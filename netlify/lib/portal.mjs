// Página do cliente: o mesmo link (/pedido/<token>) serve para tudo.
// - as respostas ao questionário (que o cliente pode alterar quando quiser);
// - os orçamentos enviados pela app (entram sozinhos quando a proposta é preparada);
// - mensagens entre o cliente e a ENAT (blob «chat-<token>»; o cliente recebe um email quando a ENAT responde);
// - orçamentos de outras empresas, enviados pelo cliente (blob «pedanexo-<id>»), apagados ao fim de 12 meses.
import { randomBytes } from 'node:crypto';
import { reviewCard } from './page-style.mjs';

const DAY = 864e5;
export const MAX_ANEXOS = 10, KEEP_ANEXOS = 365 * DAY, MAX_MSGS_DIA = 30;
const ANEXO_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const json = (status, body) => Response.json(body, { status });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (o) => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', ...o });
export const quando = (t) => fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t);
const dia = (t) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(t);

export const chatKey = (token) => 'chat-' + token;
export const getChat = async (store, token) => (await store.get(chatKey(token), { type: 'json' }).catch(() => null)) || [];
// O que o cliente vê das mensagens (sem dados internos).
export const pubMsgs = (list) => list.map((m) => ({ de: m.de, texto: m.texto, at: m.at }));
export const pubAnexos = (list) => (list || []).map((a) => ({ nome: a.nome, at: a.at }));
export const cleanText = (v, max = 2000) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
export const cleanName = (v) => String(v || '').replace(/[^\p{L}\p{N} ._()-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'orcamento';

export async function addMsg(store, token, p, de, texto, now = Date.now()) {
  const chat = await getChat(store, token);
  const m = { id: randomBytes(6).toString('hex'), de, texto, at: now };
  const list = [...chat, m].slice(-300);
  await store.setJSON(chatKey(token), list);
  const mark = de === 'c' ? { chatAt: now, chatN: (p.chatN || 0) + 1 } : { enatAt: now };
  await store.setJSON('pedido-' + token, { ...p, ...mark });
  return list;
}
export const tooMany = (chat, now = Date.now()) => chat.filter((m) => m.de === 'c' && now - m.at < DAY).length >= MAX_MSGS_DIA;

export async function saveAnexo(req, store, token, p, now = Date.now()) {
  if ((p.anexos || []).length >= MAX_ANEXOS) return { error: 'Já recebemos ' + MAX_ANEXOS + ' ficheiros. Para enviar mais, fale connosco nas mensagens.' };
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!ANEXO_TYPES.includes(type)) return { error: 'Envie um PDF ou uma fotografia.' };
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return { error: 'O ficheiro está vazio.' };
  if (buf.byteLength > 5e6) return { error: 'O ficheiro é demasiado grande (máximo 5 MB). Pode enviar fotografias das páginas.' };
  let nome = '';
  try { nome = decodeURIComponent(req.headers.get('x-nome') || ''); } catch { nome = ''; }
  const a = { id: randomBytes(9).toString('hex'), nome: cleanName(nome), mime: type, at: now, size: buf.byteLength };
  await store.set('pedanexo-' + a.id, buf, { metadata: { mime: type, nome: a.nome, token, at: now } });
  const anexos = [...(p.anexos || []), a];
  await store.setJSON('pedido-' + token, { ...p, anexos, anexoAt: now });
  return { anexo: a, anexos };
}

// Orçamentos de outras empresas com mais de 12 meses: apagados (no máximo uma vez por dia).
export async function cleanupAnexos(store, tokens, now = Date.now()) {
  const last = await store.get('pedido-limpeza', { type: 'json' }).catch(() => null);
  if (last && now - last.t < DAY) return 0;
  await store.setJSON('pedido-limpeza', { t: now });
  let n = 0;
  for (const token of tokens) {
    const p = await store.get('pedido-' + token, { type: 'json' }).catch(() => null);
    const old = (p?.anexos || []).filter((a) => now - a.at > KEEP_ANEXOS);
    if (!old.length) continue;
    for (const a of old) await store.delete('pedanexo-' + a.id).catch(() => {});
    await store.setJSON('pedido-' + token, { ...p, anexos: p.anexos.filter((a) => !old.includes(a)) });
    n += old.length;
  }
  return n;
}

// Orçamentos enviados pela app: um por orçamento (o envio mais recente), do mais recente para o mais antigo.
export const propostasOf = (p) => {
  const seen = new Set();
  return [...(p.propostas || [])].sort((a, b) => b.at - a.at).filter((x) => !seen.has(x.quote) && seen.add(x.quote));
};

// ---- Página (mesmo visual da proposta: ver page-style.mjs) ----
const ICONS = {
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  wa: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const eur = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
const waNumber = (tel) => { const d = String(tel || '').replace(/\D/g, ''); return d.length === 9 ? '351' + d : d; };

export function portalHtml(token, p, e, chat, formHtml, summary, techs = []) {
  const nome = String(p.nome || '').trim(), first = nome.split(/\s+/)[0];
  const c = e.contacto || {}, person = c.nome || 'João Lima', role = c.cargo || 'Responsável comercial', tel = String(c.telefone || '').trim(), wa = waNumber(tel), mail = e.email || 'pontedelima@enat.pt';
  const props = propostasOf(p), anexos = p.anexos || [], answered = Boolean(p.resp), portal = answered || props.length > 0;
  // A fotografia do comercial só está disponível pelas propostas (o link da proposta serve a imagem).
  const foto = c.foto && props[0] ? `/proposta/${esc(props[0].token)}/img/${esc(c.foto)}` : '';
  const waText = encodeURIComponent(`Olá ${person}, tenho uma dúvida sobre o meu orçamento.`);
  const nav = !answered && props.length
    ? [['orcamentos', 'Orçamentos · ' + props.length], ['mensagens', 'Mensagens'], ['dados', 'Questionário'], ['outra', 'Orçamento de outra empresa']]
    : answered
    ? [['orcamentos', 'Orçamentos' + (props.length ? ' · ' + props.length : '')], ['mensagens', 'Mensagens'], ['dados', 'Os seus dados'], ['outra', 'Orçamento de outra empresa'], ['novo', 'Pedir outro orçamento']]
    : [['dados', 'Questionário'], ['mensagens', 'Mensagens'], ['outra', 'Orçamento de outra empresa']];
  const bubbles = (list) => list.map((m) => `<div class="msg ${m.de === 'c' ? 'me' : 'enat'}"><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${m.de === 'c' ? 'Você' : esc(person)} · ${esc(quando(m.at))}</small></div>`).join('');
  const lead = portal
    ? `Esta é a sua página na Enat. Aqui encontra os seus orçamentos, fala connosco e altera os seus dados quando quiser. <b>Guarde este link.</b>`
    : `Para preparar um orçamento à sua medida, sem visitas desnecessárias, responda às perguntas abaixo. Leva cerca de 2 minutos. Depois de enviar, esta passa a ser a sua página na Enat: <b>guarde este link</b>, é aqui que vai receber o orçamento e falar connosco.`;
  const contactCard = `<div class="person">${foto ? `<img src="${foto}" alt="" width="56" height="56">` : `<span class="initials">${esc(person.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>`}<div><b>${esc(person)}</b><small>${esc(role)} · Enat - Ponte de Lima</small></div></div>
 <div class="reach">${wa ? `<a class="btn light sm" href="https://wa.me/${esc(wa)}?text=${waText}" target="_blank" rel="noopener">${icon('wa')}WhatsApp</a><a class="btn glass sm" href="tel:+${esc(wa)}">${icon('phone')}Ligar</a>` : `<a class="btn light sm" href="mailto:${esc(mail)}">${icon('mail')}Enviar email</a>`}</div>`;

  const dados = !answered && props.length
    ? `<section class="card" id="dados"><h2>Questionário (opcional)</h2><p class="muted">Se ainda não respondeu, as respostas ajudam-nos a confirmar o orçamento sem visitas desnecessárias. Leva cerca de 2 minutos.</p><button type="button" class="btn ghost" id="edit">${icon('edit')}Responder às perguntas</button></section><div id="formbox" hidden>${formHtml}</div>`
    : answered
    ? `<section class="card" id="dados"><h2>Os seus dados</h2><p class="muted">Recebidos a ${esc(quando(p.resp.at))}. Se alguma coisa mudar, pode alterá-los aqui.</p>
<div class="sum">${summary.slice(0, 6).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
<button type="button" class="btn ghost" id="edit">${icon('edit')}Ver ou alterar as respostas</button></section><div id="formbox" hidden>${formHtml}</div>`
    : `<div id="dados">${formHtml}</div>`;

  const orcamentos = `<section class="card" id="orcamentos"><h2>Os seus orçamentos</h2>${props.length
    ? `<p class="muted">${props.length > 1 ? 'Recebeu ' + props.length + ' orçamentos. Abra cada um para ver os detalhes e escolher o que prefere.' : 'Abra o orçamento para ver os detalhes e dar-nos a sua resposta.'}</p>${props.map((x) => `<a class="other prop" href="/proposta/${esc(x.token)}"><span><b>${esc(x.titulo || 'Orçamento')}</b><small>${esc(x.numero || '')} · ${esc(dia(x.at))}</small></span><em>${Number.isFinite(x.total) && x.total > 0 ? esc(eur(x.total)) : 'Ver'}</em></a>`).join('')}`
    : `<div class="wait"><span class="dot"></span><div><b>${answered ? 'Estamos a preparar o seu orçamento' : 'O seu orçamento aparece aqui'}</b><small>${answered ? 'Quando estiver pronto, aparece nesta página e avisamos por email.' : 'Depois de responder às perguntas, preparamos o orçamento e avisamos por email.'}</small></div></div>`}</section>`;

  const mensagens = `<section class="card" id="mensagens"><h2>Mensagens</h2><p class="muted">Tem alguma dúvida ou quer acrescentar alguma coisa? Escreva-nos aqui. Respondemos normalmente no mesmo dia e avisamos por email.</p>
<div class="chat" id="chat">${chat.length ? bubbles(chat) : ''}</div>
<form id="mf" class="send"><textarea id="mt" rows="2" maxlength="2000" placeholder="Escreva a sua mensagem…" aria-label="Mensagem"></textarea><button type="submit" class="btn" id="ms">${icon('send')}Enviar mensagem</button></form><p class="error" id="merr" role="alert"></p></section>`;

  const outra = `<section class="card" id="outra"><h2>Recebeu um orçamento de outra empresa?</h2><p class="muted">Envie-o aqui, em PDF ou fotografia. Analisamos e dizemos-lhe com sinceridade se conseguimos fazer melhor, ou o que pode estar a faltar nesse orçamento.</p>
<div id="anexos">${anexos.map((a) => `<div class="other"><span><b>${esc(a.nome)}</b><small>Enviado a ${esc(quando(a.at))}</small></span><em class="ok">Recebido</em></div>`).join('')}</div>
<label class="btn ghost" id="addax">${icon('clip')}Anexar orçamento<input type="file" id="ax" accept="application/pdf,image/*" multiple hidden></label><p class="error" id="aerr" role="alert"></p>
<p class="fine">Só a Enat vê estes ficheiros. São apagados ao fim de 12 meses.</p></section>`;

  const novo = answered ? `<section class="card" id="novo"><h2>Precisa de orçamento para outra coisa?</h2><p class="muted">Peça aqui. Já temos os dados da sua casa, por isso só precisamos de saber o que quer.</p>
<div class="chips" id="nv">${techs.map((t) => `<button type="button" class="chip" data-nv="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>
<label class="field"><span>Mais alguma coisa? (opcional)</span><textarea id="nvt" rows="2" maxlength="1500" placeholder="Ex.: queria juntar painéis solares no telhado virado a sul"></textarea></label>
<p class="error" id="nverr" role="alert"></p><button type="button" class="btn" id="nvs">${icon('plus')}Pedir orçamento</button><div class="thanks" id="nvok" hidden></div></section>` : '';

  return `<header class="top"><span class="logo"><img src="/enat-logo.png" alt="Enat - Ponte de Lima" width="131" height="47"></span><span class="tag">A sua página</span></header>
<section class="hero">
 <p class="kicker">${portal ? 'A sua página Enat' : 'O seu pedido de orçamento'}</p>
 <h1>Olá${nome ? ', ' + esc(nome) : ''}</h1>
 <p class="lead">${lead}</p>
 ${contactCard}
 ${portal ? `<nav class="tabs" aria-label="Secções">${nav.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>` : ''}
</section>
<section class="card" id="thanks" hidden><div class="thanks"><b>Obrigado${first ? ', ' + esc(first) : ''}!</b> Recebemos as suas respostas. ${esc(person)} vai preparar o seu orçamento e avisamos por email quando estiver pronto. Vai encontrá-lo nesta página.</div></section>
${portal ? orcamentos + mensagens + dados + outra + novo : dados + `<div hidden>${orcamentos + mensagens + outra}</div>`}
${reviewCard(e.google?.avaliar || undefined)}
<footer><span class="logo sm"><img src="/enat-logo.png" alt="" width="84" height="30"></span><p><b>Enat - Ponte de Lima</b><br>${esc(person)}${tel ? ' · <a href="tel:+' + esc(wa) + '">' + esc(tel) + '</a>' : ''} · <a href="mailto:${esc(mail)}">${esc(mail)}</a><br>Os seus dados são usados apenas para preparar e acompanhar o seu orçamento.</p></footer>
<script>
(()=>{
const T=${JSON.stringify(token)},$=s=>document.querySelector(s),ME=${JSON.stringify(person)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=t=>new Date(t).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const draw=list=>{$('#chat').innerHTML=list.map(m=>'<div class="msg '+(m.de==='c'?'me':'enat')+'"><p>'+esc(m.texto).replace(/\\n/g,'<br>')+'</p><small>'+(m.de==='c'?'Você':esc(ME))+' · '+when(m.at)+'</small></div>').join('');const c=$('#chat');c.scrollTop=c.scrollHeight};
let N=${chat.length};
$('#chat').scrollTop=1e9;
const btn=(b,t)=>{b.disabled=!!t;if(t){b.dataset.l=b.innerHTML;b.textContent=t}else b.innerHTML=b.dataset.l};
$('#mf').addEventListener('submit',async e=>{
 e.preventDefault();const t=$('#mt').value.trim(),err=$('#merr');err.textContent='';if(!t)return;
 const b=$('#ms');btn(b,'A enviar…');
 try{const r=await fetch('/pedido/'+T+'/msg',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({texto:t})}),j=await r.json();if(!r.ok)throw Error(j.error);$('#mt').value='';N=j.msgs.length;draw(j.msgs)}
 catch(x){err.textContent=x.message||'Não foi possível enviar. Verifique a ligação e tente de novo.'}
 btn(b);
});
// Respostas novas da Enat aparecem sem recarregar a página.
setInterval(async()=>{if(document.hidden)return;try{const r=await fetch('/pedido/'+T+'/msgs');if(!r.ok)return;const j=await r.json();if(j.msgs.length!==N){N=j.msgs.length;draw(j.msgs)}}catch{}},20000);
const small=f=>new Promise((ok,ko)=>{const u=URL.createObjectURL(f),i=new Image();i.onload=()=>{const k=Math.min(1,2000/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(b=>b?ok(b):ko(),'image/jpeg',.85)};i.onerror=ko;i.src=u});
$('#ax').addEventListener('change',async e=>{
 const err=$('#aerr');err.textContent='';
 for(const f of [...e.target.files]){
  const row=document.createElement('div');row.className='other busy';row.innerHTML='<span><b>'+esc(f.name)+'</b><small>A enviar…</small></span>';$('#anexos').append(row);
  try{const body=f.type==='application/pdf'?f:await small(f),r=await fetch('/pedido/'+T+'/anexo',{method:'POST',headers:{'content-type':f.type==='application/pdf'?'application/pdf':'image/jpeg','x-nome':encodeURIComponent(f.name)},body}),j=await r.json();if(!r.ok)throw Error(j.error);
   row.className='other';row.innerHTML='<span><b>'+esc(j.anexo.nome)+'</b><small>Enviado agora</small></span><em class="ok">Recebido</em>'}
  catch(x){row.remove();err.textContent=x.message||'Não foi possível enviar o ficheiro. Tente de novo.'}
 }
 e.target.value='';
});
if(new URLSearchParams(location.search).has('ok')){$('#thanks').hidden=false;history.replaceState(null,'',location.pathname)}
const ed=$('#edit');if(ed)ed.addEventListener('click',()=>{$('#formbox').hidden=false;ed.closest('.card').hidden=true;$('#formbox').scrollIntoView({behavior:'smooth'})});
// Pedir outro orçamento: as soluções escolhidas e um comentário chegam à Enat como mensagem.
const nv=$('#nv');
if(nv){
 nv.addEventListener('click',e=>{const b=e.target.closest('[data-nv]');if(!b)return;const on=!b.classList.contains('on');b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
 $('#nvs').addEventListener('click',async()=>{
  const sol=[...nv.querySelectorAll('.on')].map(b=>b.dataset.nv),texto=$('#nvt').value.trim(),err=$('#nverr');err.textContent='';
  if(!sol.length&&!texto){err.textContent='Escolha o que quer orçamentar, ou escreva-nos.';return}
  const b=$('#nvs');btn(b,'A enviar…');
  try{const r=await fetch('/pedido/'+T+'/novo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sol,texto})}),j=await r.json();if(!r.ok)throw Error(j.error);
   N=j.msgs.length;draw(j.msgs);nv.querySelectorAll('.on').forEach(x=>{x.classList.remove('on');x.setAttribute('aria-pressed',false)});$('#nvt').value='';
   $('#nvok').hidden=false;$('#nvok').innerHTML='<b>Pedido recebido.</b> Vamos preparar o orçamento e ele aparece nesta página. Se precisarmos de mais alguma informação, perguntamos nas mensagens.'}
  catch(x){err.textContent=x.message||'Não foi possível enviar. Verifique a ligação e tente de novo.'}
  btn(b);
 });
}
})();
</script>`;
}
