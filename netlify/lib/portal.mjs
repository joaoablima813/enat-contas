// Página do cliente: o mesmo link (/pedido/<token>) serve para tudo.
// - as respostas ao questionário (que o cliente pode alterar quando quiser);
// - os orçamentos enviados pela app (entram sozinhos quando a proposta é preparada);
// - mensagens entre o cliente e a ENAT (blob «chat-<token>»; o cliente recebe um email quando a ENAT responde);
// - orçamentos de outras empresas, enviados pelo cliente (blob «pedanexo-<id>»), apagados ao fim de 12 meses.
import { randomBytes } from 'node:crypto';

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

// ---- Página ----
export function portalHtml(token, p, e, chat, formHtml, summary) {
  const first = String(p.nome || '').trim().split(/\s+/)[0];
  const c = e.contacto || {}, person = c.nome || 'João Lima', tel = String(c.telefone || '').replace(/[^\d+]/g, ''), mail = e.email || 'pontedelima@enat.pt';
  const props = propostasOf(p), anexos = p.anexos || [], answered = Boolean(p.resp);
  const nav = [['orcamentos', 'Orçamentos' + (props.length ? ' (' + props.length + ')' : '')], ['mensagens', 'Mensagens'], ['dados', answered ? 'Os seus dados' : 'Questionário'], ['outra', 'Outro orçamento?']];
  const bubbles = (list) => list.map((m) => `<div class="msg ${m.de === 'c' ? 'me' : 'enat'}"><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${m.de === 'c' ? 'Você' : esc(person) + ' · ENAT'} · ${esc(quando(m.at))}</small></div>`).join('');
  const intro = answered
    ? `<p>Esta é a sua página na ENAT. <b>Guarde este link:</b> aqui encontra os seus orçamentos, pode falar connosco e alterar os seus dados quando quiser.</p>`
    : `<p>Para preparar um orçamento à sua medida, sem visitas desnecessárias, responda a estas perguntas. Leva cerca de 2 minutos.</p><p class="small">Guarde este link: é a sua página na ENAT. Aqui vai receber os orçamentos e pode falar connosco.</p>`;
  const dados = answered
    ? `<section class="card" id="dados"><h2>Os seus dados</h2><p class="muted">Recebidos a ${esc(quando(p.resp.at))}. Se alguma coisa mudar, pode alterá-los.</p>
<div class="sum">${summary.slice(0, 6).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
<button type="button" class="btn ghost" id="edit">Ver ou alterar as respostas</button></section><div id="formbox" hidden>${formHtml}</div>`
    : `<div id="dados">${formHtml}</div>`;
  return `<header class="top"><img src="/enat-logo.png" alt="Enat - Ponte de Lima" width="120" height="43"></header>
<section class="card hero"><h1>Olá${first ? ' ' + esc(first) : ''}${answered ? '' : ', obrigado pelo seu contacto'}</h1>${intro}
<nav class="tabs" aria-label="Secções">${nav.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav></section>
<section class="card thanks" id="thanks" hidden><h2>Obrigado!</h2><p>Recebemos as suas respostas. ${esc(person)} vai preparar o seu orçamento e entra em contacto consigo em breve. Vai encontrá-lo nesta página.</p></section>
${answered ? '' : dados}
<section class="card" id="orcamentos"><h2>Os seus orçamentos</h2>${props.length
    ? `<div class="list">${props.map((x) => `<a class="doc" href="/proposta/${esc(x.token)}"><span><b>${esc(x.titulo || 'Orçamento')}</b><small>${esc(x.numero || '')} · ${esc(dia(x.at))}</small></span><em>Ver</em></a>`).join('')}</div><p class="muted small">Em cada orçamento pode adjudicar, pedir uma revisão ou dizer-nos que vai pensar.</p>`
    : `<p class="muted">${answered ? 'Estamos a preparar o seu orçamento. Quando estiver pronto, aparece aqui e avisamos.' : 'Depois de responder às perguntas, o seu orçamento aparece aqui.'}</p>`}</section>
<section class="card" id="mensagens"><h2>Mensagens</h2><p class="muted">Tem alguma dúvida ou quer acrescentar alguma coisa? Escreva-nos. Respondemos normalmente no mesmo dia e avisamos por email.</p>
<div class="chat" id="chat">${chat.length ? bubbles(chat) : ''}</div>
<form id="mf" class="send"><textarea id="mt" rows="2" maxlength="2000" placeholder="Escreva a sua mensagem…" aria-label="Mensagem"></textarea><button type="submit" class="btn" id="ms">Enviar mensagem</button></form><p class="err" id="merr" role="alert"></p></section>
${answered ? dados : ''}
<section class="card" id="outra"><h2>Recebeu um orçamento de outra empresa?</h2><p class="muted">Envie-o aqui (PDF ou fotografia). Analisamos e dizemos-lhe com sinceridade se conseguimos fazer melhor, ou o que pode estar a faltar nesse orçamento.</p>
<div class="list" id="anexos">${anexos.map((a) => `<div class="doc"><span><b>${esc(a.nome)}</b><small>Enviado a ${esc(quando(a.at))}</small></span><em class="ok">Recebido</em></div>`).join('')}</div>
<label class="btn ghost" id="addax">Anexar orçamento<input type="file" id="ax" accept="application/pdf,image/*" multiple hidden></label><p class="err" id="aerr" role="alert"></p>
<p class="muted small">Só a ENAT vê estes ficheiros. São apagados ao fim de 12 meses.</p></section>
<section class="card contact"><h2>Contacto</h2><p><b>${esc(person)}</b> · ENAT Ponte de Lima</p><div class="reach">${tel ? `<a class="btn ghost" href="tel:${esc(tel)}">Ligar</a>` : ''}<a class="btn ghost" href="mailto:${esc(mail)}">Email</a></div></section>
<footer>Enat - Ponte de Lima · Os seus dados são usados apenas para preparar e acompanhar o seu orçamento.</footer>
<script>
(()=>{
const T=${JSON.stringify(token)},$=s=>document.querySelector(s),ME=${JSON.stringify(person)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=t=>new Date(t).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const draw=list=>{$('#chat').innerHTML=list.map(m=>'<div class="msg '+(m.de==='c'?'me':'enat')+'"><p>'+esc(m.texto).replace(/\\n/g,'<br>')+'</p><small>'+(m.de==='c'?'Você':esc(ME)+' · ENAT')+' · '+when(m.at)+'</small></div>').join('');const c=$('#chat');c.scrollTop=c.scrollHeight};
let N=${chat.length};
$('#chat').scrollTop=1e9;
$('#mf').addEventListener('submit',async e=>{
 e.preventDefault();const t=$('#mt').value.trim(),err=$('#merr');err.textContent='';if(!t)return;
 const b=$('#ms');b.disabled=true;b.textContent='A enviar…';
 try{const r=await fetch('/pedido/'+T+'/msg',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({texto:t})}),j=await r.json();if(!r.ok)throw Error(j.error);$('#mt').value='';N=j.msgs.length;draw(j.msgs)}
 catch(x){err.textContent=x.message||'Não foi possível enviar. Verifique a ligação e tente de novo.'}
 b.disabled=false;b.textContent='Enviar mensagem';
});
// Respostas novas da ENAT aparecem sem recarregar a página.
setInterval(async()=>{if(document.hidden)return;try{const r=await fetch('/pedido/'+T+'/msgs');if(!r.ok)return;const j=await r.json();if(j.msgs.length!==N){N=j.msgs.length;draw(j.msgs)}}catch{}},20000);
const small=f=>new Promise((ok,ko)=>{const u=URL.createObjectURL(f),i=new Image();i.onload=()=>{const k=Math.min(1,2000/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(b=>b?ok(b):ko(),'image/jpeg',.85)};i.onerror=ko;i.src=u});
$('#ax').addEventListener('change',async e=>{
 const err=$('#aerr');err.textContent='';
 for(const f of [...e.target.files]){
  const row=document.createElement('div');row.className='doc busy';row.innerHTML='<span><b>'+esc(f.name)+'</b><small>A enviar…</small></span>';$('#anexos').append(row);
  try{const body=f.type==='application/pdf'?f:await small(f),r=await fetch('/pedido/'+T+'/anexo',{method:'POST',headers:{'content-type':f.type==='application/pdf'?'application/pdf':'image/jpeg','x-nome':encodeURIComponent(f.name)},body}),j=await r.json();if(!r.ok)throw Error(j.error);
   row.className='doc';row.innerHTML='<span><b>'+esc(j.anexo.nome)+'</b><small>Enviado agora</small></span><em class="ok">Recebido</em>'}
  catch(x){row.remove();err.textContent=x.message||'Não foi possível enviar o ficheiro. Tente de novo.'}
 }
 e.target.value='';
});
const ed=$('#edit');if(ed)ed.addEventListener('click',()=>{$('#formbox').hidden=false;ed.closest('.card').hidden=true;$('#formbox').scrollIntoView({behavior:'smooth'})});
})();
</script>`;
}
