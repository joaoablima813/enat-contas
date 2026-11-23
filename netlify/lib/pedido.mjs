// «Pedir detalhes ao cliente»: link enviado à lead com um questionário curto (tecnologia, gama, áreas, morada e fotos).
// - A app cria o link (POST /api/pedido) e envia-o por WhatsApp ou email;
// - o cliente abre /pedido/<token>, responde e pode juntar fotos;
// - a app lê as respostas (GET /api/pedidos), preenche a lead e recebe um aviso no telemóvel.
import { randomBytes } from 'node:crypto';
import '../../public/pedido-perguntas.js';
import { sugestoes } from './sugestoes.mjs';

const P = globalThis.EnatPedido;
const json = (status, body) => Response.json(body, { status });
const TOKEN = /^[A-Za-z0-9_-]{24}$/, PHOTO = /^[a-z0-9]{8,40}$/, LEAD = /^[A-Za-z0-9_-]{1,60}$/;
const DAY = 864e5, MAX_PHOTOS = 6, INDEX = 'pedidos';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (store, token) => TOKEN.test(token) ? store.get('pedido-' + token, { type: 'json' }).catch(() => null) : null;

// Um link por lead: voltar a pedir reutiliza o mesmo e mantém as respostas já dadas.
async function createLink(store, lead, nome, solutions) {
  let token = (await store.get('pedido-lead-' + lead, { type: 'json' }).catch(() => null))?.token;
  const old = token ? await get(store, token) : null;
  if (!old) token = randomBytes(18).toString('base64url');
  const sol = (Array.isArray(solutions) ? solutions : []).filter((s) => P.TECHS.includes(s));
  const p = { ...(old || { created: Date.now(), fotos: [] }), lead, nome: String(nome || '').trim().slice(0, 120), sol: old?.resp || !sol.length ? old?.sol || sol : sol };
  await store.setJSON('pedido-' + token, p);
  await store.setJSON('pedido-lead-' + lead, { token });
  return { token, p };
}

// ---- App (com sessão) ----
export async function handlePedidoApi(req, path, store) {
  if (path === 'pedido' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const lead = String(b?.lead || '');
    if (!LEAD.test(lead)) return json(400, { error: 'Guarde a lead antes de pedir detalhes.' });
    const { token } = await createLink(store, lead, b.nome, b.sol);
    return json(200, { token, url: linkBase(new URL(req.url).origin) + '/pedido/' + token });
  }
  if (path === 'pedidos' && req.method === 'GET') {
    const list = (await store.get(INDEX, { type: 'json' }).catch(() => null)) || [];
    const out = [];
    for (const x of list.slice(-60)) { const p = await get(store, x.token); if (p?.resp) out.push({ token: x.token, lead: p.lead, at: p.resp.at, resp: p.resp, sug: sugestoes(p.resp) }); }
    // Links enviados automaticamente por email às leads novas (a app marca-os na lead).
    const auto = Object.entries((await store.get(AUTO_SENT, { type: 'json' }).catch(() => null)) || {}).map(([lead, x]) => ({ lead, token: x.token, sent: x.at, failed: Boolean(x.failed) }));
    return json(200, { pedidos: out, auto });
  }
  const m = path.match(/^pedido\/foto\/([a-z0-9]{8,40})$/);
  if (m && req.method === 'GET') {
    const r = await store.getWithMetadata('pedfoto-' + m[1], { type: 'arrayBuffer' });
    if (!r) return json(404, { error: 'Foto não encontrada.' });
    return new Response(r.data, { headers: { 'content-type': r.metadata?.mime || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  return json(404, { error: 'Pedido inválido.' });
}

// ---- Página pública ----
export async function handlePedidoPublic(req, token, sub, store) {
  const p = await get(store, token);
  const gone = !p || Date.now() - (p.created || 0) > 90 * DAY;
  if (sub === 'foto' && req.method === 'POST') {
    if (gone) return json(404, { error: 'Link expirado.' });
    if ((p.fotos || []).length >= MAX_PHOTOS * 2) return json(400, { error: 'Já recebemos fotos suficientes.' });
    const type = req.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(400, { error: 'Envie uma foto.' });
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 3e6) return json(400, { error: 'Foto demasiado grande.' });
    const id = randomBytes(9).toString('hex');
    await store.set('pedfoto-' + id, buf, { metadata: { mime: type, token } });
    await store.setJSON('pedido-' + token, { ...p, fotos: [...(p.fotos || []), id] });
    return json(200, { id });
  }
  if (req.method === 'POST') {
    if (gone) return json(404, { error: 'Este link já não está disponível. Contacte-nos.' });
    let b; try { b = JSON.parse((await req.text()).slice(0, 20000)); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const r = P.clean(b);
    if (!r.sol.length) return json(400, { error: 'Escolha pelo menos uma solução.' });
    if (!r.morada || !r.cp) return json(400, { error: 'Indique a morada e o código postal.' });
    const fotos = (Array.isArray(b.fotos) ? b.fotos : []).filter((f) => (p.fotos || []).includes(f)).slice(0, MAX_PHOTOS);
    const resp = { ...r, fotos, at: Date.now() };
    await store.setJSON('pedido-' + token, { ...p, resp });
    const list = ((await store.get(INDEX, { type: 'json' }).catch(() => null)) || []).filter((x) => x.token !== token);
    await store.setJSON(INDEX, [...list, { token, at: resp.at }].slice(-200));
    try {
      const { sendPush } = await import('./push.mjs');
      await sendPush(store, { title: 'Detalhes recebidos: ' + (p.nome || 'lead'), body: [r.sol.join(', '), r.local, fotos.length ? fotos.length + ' foto' + (fotos.length > 1 ? 's' : '') : ''].filter(Boolean).join(' · '), tag: 'pedido-' + p.lead, data: { lead: p.lead } });
    } catch (e) { console.error('pedido push', e?.message); }
    return json(200, { ok: true });
  }
  if (req.method !== 'GET') return json(405, { error: 'Método não permitido.' });
  if (gone) return new Response(page('Link indisponível', '<section class="card"><h1>Este link já não está disponível</h1><p>Contacte-nos para receber um novo pedido: <a href="mailto:pontedelima@enat.pt">pontedelima@enat.pt</a></p></section>'), { status: 404, headers: HTML });
  const empresa = (await store.get('empresa', { type: 'json' }).catch(() => null)) || {};
  return new Response(page('Pedido de orçamento · Enat', form(token, p, empresa)), { headers: HTML });
}

// ---- Envio automático por email às leads novas ----
// Corre a cada minuto (e logo que chega uma lead do email), só das 8h às 22h (hora de Lisboa).
// Envia a leads com a fase «Lead nova», com email, recebidas nos últimos 7 dias, a quem nunca foi enviado o link.
// Endereço dos links enviados aos clientes: LINK_URL (ex.: https://propostas.enat.pt) ou, sem ele, o endereço da app.
const linkBase = (fallback) => String(process.env.LINK_URL || '').replace(/\/+$/, '') || fallback;
const AUTO_SENT = 'pedido-auto-enviados', AUTO_LAST = 'pedido-auto-ultimo', EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const leadTime = (l) => { const t = new Date(l.received || (l.date ? l.date + 'T12:00:00Z' : 0)).getTime(); return Number.isFinite(t) ? t : 0; };
export function autoCandidates(state, inbox, sent, now = Date.now()) {
  const del = state?.del || {}, seen = new Set(), out = [];
  const inState = new Map((state?.leads || []).map((l) => [l.id, l]));
  // As leads ainda só no email da campanha contam como novas; as da app só se continuarem na fase «Lead nova».
  for (const l of [...(state?.leads || []), ...(inbox || []).filter((x) => !inState.has(x.id))]) {
    if (!l || typeof l.id !== 'string' || seen.has(l.id)) continue;
    seen.add(l.id);
    if ((l.stage || 'nova') !== 'nova' || del['leads:' + l.id] || sent[l.id] || l.pedido?.sent || l.pedido?.resp) continue;
    const email = String(l.email || '').trim();
    if (!EMAIL.test(email) || email.length > 320 || !LEAD.test(l.id)) continue;
    if (now - leadTime(l) > 7 * DAY) continue;
    out.push({ id: l.id, email, name: String(l.name || '').trim(), solutions: l.solutions || [] });
  }
  return out;
}
async function sendEmail(to, subject, text, origin) {
  const c = { host: process.env.SMTP_HOST || 'mail.enat.pt', port: Number(process.env.SMTP_PORT || 465), user: process.env.SMTP_USER || 'pontedelima@enat.pt', pass: process.env.SMTP_PASSWORD, from: process.env.EMAIL_FROM || 'pontedelima@enat.pt' };
  if (!c.pass) throw new Error('smtp not configured');
  const { createTransport } = await import('nodemailer');
  const t = createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#122c3b;max-width:600px"><div style="padding:4px 0 14px;border-bottom:3px solid #f3a51c;margin-bottom:18px"><img src="' + esc(origin) + '/enat-logo.png" alt="Enat - Ponte de Lima" width="131" height="47" style="display:block"></div>'
    + esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="display:inline-block;margin:6px 0;padding:12px 20px;background:#2f8f3a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">Responder às perguntas</a>').replace(/\n/g, '<br>') + '</div>';
  const info = await t.sendMail({ from: { name: 'Enat - Ponte de Lima', address: c.from }, to, replyTo: c.from, subject, text, html });
  if (!(info.accepted || []).map((a) => String(a?.address || a).toLowerCase()).includes(to.toLowerCase())) throw new Error('rejected');
}
export async function runAutoPedidos(store, now = Date.now(), send = sendEmail, { force = false } = {}) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (h < 8 || h >= 22) return { skipped: 'night' };
  const e = (await store.get('empresa', { type: 'json' }).catch(() => null)) || {};
  if (e.autoPedido === false) return { skipped: 'off' };
  if (!process.env.SMTP_PASSWORD && send === sendEmail) return { skipped: 'smtp' };
  const last = await store.get(AUTO_LAST, { type: 'json' }).catch(() => null);
  if (!force && last && now - last.t < 50e3) return { skipped: 'recent' };
  await store.setJSON(AUTO_LAST, { t: now });
  const [state, meta, sent] = await Promise.all([store.get('estado', { type: 'json' }), store.get('leads-meta', { type: 'json' }), store.get(AUTO_SENT, { type: 'json' })].map((p) => p.catch(() => null)));
  const todo = autoCandidates(state, meta?.leads, sent || {}, now).slice(0, 5);
  if (!todo.length) return { sent: 0 };
  const origin = process.env.URL || 'https://enat-contas.netlify.app', me = e.contacto?.nome || 'João Lima', done = { ...(sent || {}) };
  let n = 0;
  for (const l of todo) {
    // Marcado antes de enviar: se o envio falhar a meio, nunca se envia duas vezes ao mesmo cliente.
    const { token } = await createLink(store, l.id, l.name, l.solutions);
    done[l.id] = { token, at: now };
    await store.setJSON(AUTO_SENT, done);
    try { await send(l.email, 'O seu pedido de orçamento · Enat - Ponte de Lima', P.message(l.name, l.solutions, me, linkBase(origin) + '/pedido/' + token), origin); n++; }
    catch (x) { done[l.id] = { token, at: now, failed: true }; await store.setJSON(AUTO_SENT, done); console.error('pedido auto email', x?.code || x?.message); }
  }
  return { sent: n };
}

const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
const chips = (id, opts, cur, multi) => `<div class="chips" data-q="${id}"${multi ? ' data-multi' : ''}>${opts.map((o) => `<button type="button" class="chip${(multi ? cur.includes(o) : cur === o) ? ' on' : ''}" data-v="${esc(o)}" aria-pressed="${multi ? cur.includes(o) : cur === o}">${esc(o)}</button>`).join('')}</div>`;
// Tipos de pergunta: escolha (chips), texto, número e lista de divisões (preenchida no navegador conforme o número escolhido).
// As perguntas com «if» só aparecem com uma resposta concreta (ex.: radiadores).
const question = (q, a, sol) => {
  const shown = !q.if || a[q.if[0]] === q.if[1];
  const field = q.rooms ? `<div class="rooms" data-rooms="${q.id}" data-for="${q.rooms}"></div>`
    : q.n ? `<input type="number" inputmode="numeric" data-n="${q.id}" min="${q.n[0]}" max="${q.n[1]}" value="${esc(a[q.id] ?? '')}" placeholder="${esc(q.ph || '')}">`
    : q.t ? `<input data-t="${q.id}" value="${esc(a[q.id] || '')}" placeholder="${esc(q.t)}" maxlength="200">` : chips(q.id, q.o, a[q.id] || '');
  const on = q.for && sol && (q.for.some((t) => sol.includes(t)) || (q.also && sol.includes('Bomba de calor climatização') && a[q.also[0]] === q.also[1]));
  const forSol = q.for && sol ? ` data-sols="${esc(q.for.join('|'))}"${q.also ? ` data-also="${esc(q.also.join('|'))}"` : ''}${on ? '' : ' hidden'}` : '';
  return `<div class="q"${q.if ? ` data-if="${esc(q.if.join('|'))}"${shown ? '' : ' hidden'}` : ''}${forSol}><label>${esc(q.q)}</label>${q.help ? `<p class="help">${esc(q.help)}</p>` : ''}${field}</div>`;
};

function form(token, p, e) {
  const r = p.resp || { sol: p.sol || [], a: {}, gama: '', morada: '', cp: '', local: '', notas: '' };
  const first = String(p.nome || '').trim().split(/\s+/)[0];
  const person = e.contacto?.nome || 'João Lima';
  return `<header class="top"><img src="/enat-logo.png" alt="Enat - Ponte de Lima" width="120" height="43"></header>
<section class="card hero"><h1>Olá${first ? ' ' + esc(first) : ''}, obrigado pelo seu contacto</h1><p>Para preparar um orçamento à sua medida, sem visitas desnecessárias, responda a estas perguntas. Leva cerca de 2 minutos.</p>${p.resp ? '<p class="done">Já recebemos as suas respostas. Pode alterá-las e enviar de novo.</p>' : ''}</section>
<form id="f" novalidate>
<section class="card"><h2>Para que quer orçamento?</h2><p class="muted">Pode escolher mais do que uma opção.</p>${chips('sol', P.TECHS, r.sol, true)}</section>
<section class="card"><h2>Sobre a casa</h2><p class="muted">Perguntamos só uma vez, mesmo que escolha várias soluções.</p>${P.HOUSE.map((q) => question(q, r.a, r.sol)).join('')}</section>
${P.TECHS.filter((t) => P.TECH[t].length).map((t) => `<section class="card tech" data-tech="${esc(t)}"${r.sol.includes(t) ? '' : ' hidden'}><h2>${esc(t)}</h2>${P.TECH[t].map((q) => question(q, r.a)).join('')}</section>`).join('')}
<section class="card"><h2>Que gama prefere?</h2><div class="gama" data-q="gama">${P.GAMA.map(([k, t, d]) => `<button type="button" class="opt${r.gama === k ? ' on' : ''}" data-v="${k}" aria-pressed="${r.gama === k}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}</div></section>
<section class="card"><h2>Prazo e contacto</h2>${P.COMMON.map((q) => question(q, r.a)).join('')}</section>
<section class="card"><h2>Morada da instalação</h2><div class="q"><label for="morada">Rua e número</label><input id="morada" value="${esc(r.morada)}" autocomplete="street-address" maxlength="300" required></div>
<div class="row"><div class="q"><label for="cp">Código postal</label><input id="cp" value="${esc(r.cp)}" inputmode="numeric" autocomplete="postal-code" placeholder="4990-000" maxlength="8" required></div><div class="q"><label for="local">Localidade</label><input id="local" value="${esc(r.local)}" autocomplete="address-level2" maxlength="80"></div></div></section>
<section class="card"><h2>Fotos (opcional)</h2><p class="muted">Ajudam-nos a orçamentar sem visita: o local onde fica o equipamento, o quadro elétrico, o telhado ou as divisões. Até ${MAX_PHOTOS} fotos.</p><div class="thumbs" id="thumbs"></div><label class="btn ghost" id="addph">Adicionar fotos<input type="file" id="ph" accept="image/*" multiple hidden></label></section>
<section class="card"><h2>Mais alguma coisa? (opcional)</h2><textarea id="notas" rows="3" maxlength="1500" placeholder="Ex.: a sala tem pé-direito alto; prefiro equipamentos silenciosos">${esc(r.notas)}</textarea></section>
<p class="err" id="err" role="alert"></p>
<button type="submit" class="btn" id="send">Enviar respostas</button>
</form>
<section class="card thanks" id="thanks" hidden><h1>Obrigado!</h1><p>Recebemos as suas respostas. ${esc(person)} vai preparar o seu orçamento e entra em contacto consigo em breve.</p></section>
<footer>Enat - Ponte de Lima · Os seus dados são usados apenas para preparar o orçamento.</footer>
<script>
const T=${JSON.stringify(token)},st={a:${JSON.stringify(r.a)},sol:${JSON.stringify(r.sol)},gama:${JSON.stringify(r.gama)},fotos:[]},MAX=${MAX_PHOTOS};
const $=s=>document.querySelector(s);
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-v]');if(!b)return;const box=b.parentElement,q=box.dataset.q;
 if(q==='sol'){const v=b.dataset.v,i=st.sol.indexOf(v);i<0?st.sol.push(v):st.sol.splice(i,1);b.classList.toggle('on',i<0);b.setAttribute('aria-pressed',i<0);document.querySelectorAll('[data-tech]').forEach(s=>s.hidden=!st.sol.includes(s.dataset.tech));sols();return}
 box.querySelectorAll('[data-v]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
 if(q==='gama')st.gama=b.dataset.v;else st.a[q]=b.dataset.v;
 refresh();
});
// Divisões do ar condicionado: uma linha (tipo e área) por divisão escolhida; com «6 ou mais» pode juntar mais.
const ROOMS=${JSON.stringify(P.ROOMS)};
function drawRooms(){document.querySelectorAll('[data-rooms]').forEach(box=>{
 const id=box.dataset.rooms,n=parseInt(st.a[box.dataset.for])||0,list=st.a[id]=Array.isArray(st.a[id])?st.a[id]:[];
 while(list.length<n)list.push({t:list.length?'Quarto':'Sala',m2:''});if(n<6&&list.length>n)list.length=n;
 box.innerHTML=n?list.map((r,i)=>'<div class="room"><select data-room-t="'+i+'" aria-label="Tipo de divisão">'+ROOMS.map(t=>'<option'+(t===r.t?' selected':'')+'>'+t+'</option>').join('')+'</select><input type="number" inputmode="numeric" min="3" max="500" data-room-m="'+i+'" value="'+(r.m2||'')+'" placeholder="Área"><span>m²</span></div>').join('')+(n>=6&&list.length<12?'<button type="button" class="more" data-more-room>+ Mais uma divisão</button>':'')+'<p class="help">Se não souber a área exata, um valor aproximado chega.</p>':'<p class="help">Escolha primeiro quantas divisões.</p>';
 box.dataset.n=n;
})}
const sols=()=>document.querySelectorAll('[data-sols]').forEach(q=>{const al=q.dataset.also?q.dataset.also.split('|'):null;q.hidden=!(q.dataset.sols.split('|').some(t=>st.sol.includes(t))||(al&&st.sol.includes('Bomba de calor climatização')&&st.a[al[0]]===al[1]))});
function refresh(){
 sols();
 document.querySelectorAll('[data-if]').forEach(el=>{const [k,v]=el.dataset.if.split('|');el.hidden=st.a[k]!==v});
 document.querySelectorAll('[data-rooms]').forEach(box=>{if(String(parseInt(st.a[box.dataset.for])||0)!==box.dataset.n)drawRooms()});
}
document.addEventListener('click',e=>{if(e.target.closest('[data-more-room]')){st.a.ac_rooms.push({t:'Quarto',m2:''});drawRooms()}});
document.addEventListener('change',e=>{const i=e.target.dataset?.roomT;if(i!=null)st.a.ac_rooms[+i].t=e.target.value});
document.addEventListener('input',e=>{const d=e.target.dataset||{};if(d.t)st.a[d.t]=e.target.value;if(d.n)st.a[d.n]=e.target.value;if(d.roomM!=null)st.a.ac_rooms[+d.roomM].m2=e.target.value;if(e.target.id==='cp'){let v=e.target.value.replace(/\\D/g,'').slice(0,7);if(v.length>4)v=v.slice(0,4)+'-'+v.slice(4);e.target.value=v}});
drawRooms();
// Fotos reduzidas no telemóvel antes de enviar (máx. 1600 px).
const small=f=>new Promise((ok,ko)=>{const u=URL.createObjectURL(f),i=new Image();i.onload=()=>{const k=Math.min(1,1600/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(b=>b?ok(b):ko(),'image/jpeg',.85)};i.onerror=ko;i.src=u});
$('#ph').addEventListener('change',async e=>{
 for(const f of [...e.target.files].slice(0,MAX-st.fotos.length)){
  const box=document.createElement('div');box.className='thumb busy';$('#thumbs').append(box);
  try{const b=await small(f),r=await fetch('/pedido/'+T+'/foto',{method:'POST',headers:{'content-type':'image/jpeg'},body:b}),j=await r.json();if(!r.ok)throw Error(j.error);
   st.fotos.push(j.id);box.className='thumb';box.style.backgroundImage='url('+URL.createObjectURL(b)+')'}
  catch(x){box.remove();$('#err').textContent='Não foi possível enviar uma das fotos. Tente novamente.'}
 }
 e.target.value='';$('#addph').hidden=st.fotos.length>=MAX;
});
$('#f').addEventListener('submit',async e=>{
 e.preventDefault();const err=$('#err');err.textContent='';
 const body={...st,morada:$('#morada').value,cp:$('#cp').value,local:$('#local').value,notas:$('#notas').value};
 if(!st.sol.length){err.textContent='Escolha pelo menos uma solução.';scrollTo({top:0,behavior:'smooth'});return}
 if(!body.morada.trim()||!/^\\d{4}-\\d{3}$/.test(body.cp)){err.textContent='Indique a morada e o código postal (ex.: 4990-062).';$('#morada').focus();return}
 const b=$('#send');b.disabled=true;b.textContent='A enviar…';
 try{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error);
  $('#f').hidden=true;document.querySelector('.hero').hidden=true;$('#thanks').hidden=false;scrollTo({top:0})}
 catch(x){err.textContent=x.message||'Não foi possível enviar. Verifique a ligação e tente de novo.';b.disabled=false;b.textContent='Enviar respostas'}
});
</script>`;
}

function page(title, body) {
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="icon" href="/favicon-32x32.png">
<style>
:root{--ink:#16232b;--mute:#5d6b73;--line:#dfe6e3;--bg:#f3f6f4;--card:#fff;--green:#2a723a;--tint:#e8f2ea;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:0 16px 32px}
.top{max-width:560px;margin:0 auto;padding:16px 0 8px}main,form,.card,footer,.err,#send{max-width:560px;margin-left:auto;margin-right:auto}
.card{background:var(--card);border-radius:18px;padding:18px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:22px;line-height:1.25;margin:0 0 8px}h2{font-size:18px;margin:0 0 10px}.muted{color:var(--mute);margin:-4px 0 12px;font-size:14.5px}.done{background:var(--tint);border-radius:12px;padding:10px 12px;margin:10px 0 0;font-size:14.5px}
.q{margin:14px 0 0}.q:first-of-type{margin-top:4px}.q label{display:block;font-weight:600;font-size:15px;margin-bottom:8px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1.5px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:9px 14px;font:inherit;font-size:15px;cursor:pointer}
.chip.on{background:var(--green);border-color:var(--green);color:#fff}
.gama{display:grid;gap:8px}.opt{text-align:left;border:1.5px solid var(--line);background:#fff;border-radius:14px;padding:12px 14px;font:inherit;color:var(--ink);cursor:pointer}.opt b{display:block}.opt small{color:var(--mute);font-size:14px}.opt.on{border-color:var(--green);background:var(--tint)}
input,textarea{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}input:focus,textarea:focus{outline:2px solid var(--green);border-color:var(--green)}
.row{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}
.btn{display:block;width:100%;border:0;border-radius:14px;background:var(--green);color:#fff;font:inherit;font-weight:700;font-size:17px;padding:15px;margin-top:16px;cursor:pointer;text-align:center}.btn:disabled{opacity:.6}.btn.ghost{background:var(--tint);color:var(--green);font-size:15.5px;padding:12px;margin-top:10px}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.thumb{aspect-ratio:1;border-radius:10px;background:var(--tint) center/cover}.thumb.busy{animation:p 1s infinite alternate}@keyframes p{to{opacity:.4}}
.room{display:grid;grid-template-columns:1fr 96px auto;gap:8px;align-items:center;margin-bottom:8px}.room span{color:var(--mute)}
select{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:11px 10px;font:inherit;background:#fff;color:var(--ink)}
.help{color:var(--mute);font-size:13.5px;margin:-4px 0 8px}.rooms .help{margin:4px 0 0}.more{border:0;background:none;color:var(--green);font:inherit;font-weight:600;padding:6px 0;cursor:pointer}
.err{color:#b3261e;font-weight:600;min-height:1px;margin-top:12px}footer{color:var(--mute);font-size:13px;text-align:center;margin-top:20px}[hidden]{display:none!important}
</style></head><body>${body}</body></html>`;
}
