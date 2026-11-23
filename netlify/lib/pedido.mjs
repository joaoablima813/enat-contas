// «Pedir detalhes ao cliente»: link enviado à lead com um questionário curto (tecnologia, gama, áreas, morada e fotos).
// - A app cria o link (POST /api/pedido) e envia-o por WhatsApp ou email;
// - o cliente abre /pedido/<token>, responde e pode juntar fotos;
// - a app lê as respostas (GET /api/pedidos), preenche a lead e recebe um aviso no telemóvel.
// O mesmo link é a página do cliente (portal.mjs): orçamentos, mensagens e orçamentos de outras empresas.
import { randomBytes } from 'node:crypto';
import '../../public/pedido-perguntas.js';
import { sugestoes } from './sugestoes.mjs';
import { addMsg, getChat, pubMsgs, pubAnexos, tooMany, saveAnexo, cleanText, portalHtml, cleanupAnexos } from './portal.mjs';
import { BASE_CSS } from './page-style.mjs';

const P = globalThis.EnatPedido;
const json = (status, body) => Response.json(body, { status });
const TOKEN = /^[A-Za-z0-9_-]{24}$/, PHOTO = /^[a-z0-9]{8,40}$/, LEAD = /^[A-Za-z0-9_-]{1,60}$/;
const DAY = 864e5, MAX_PHOTOS = 6, INDEX = 'pedidos';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (store, token) => TOKEN.test(token) ? store.get('pedido-' + token, { type: 'json' }).catch(() => null) : null;
const tokenOf = async (store, lead) => LEAD.test(lead) ? (await store.get('pedido-lead-' + lead, { type: 'json' }).catch(() => null))?.token || '' : '';
// Lista dos links com novidades (respostas, mensagens, ficheiros), lida pela app.
async function bump(store, token, at) {
  const list = ((await store.get(INDEX, { type: 'json' }).catch(() => null)) || []).filter((x) => x.token !== token);
  await store.setJSON(INDEX, [...list, { token, at }].slice(-200));
}
const notify = async (store, msg) => { try { const { sendPush } = await import('./push.mjs'); await sendPush(store, msg); } catch (e) { console.error('pedido push', e?.message); } };

// Um link por lead: voltar a pedir reutiliza o mesmo e mantém as respostas já dadas.
export async function createLink(store, lead, nome, solutions) {
  let token = (await store.get('pedido-lead-' + lead, { type: 'json' }).catch(() => null))?.token;
  const old = token ? await get(store, token) : null;
  if (!old) token = randomBytes(18).toString('base64url');
  const sol = (Array.isArray(solutions) ? solutions : []).filter((s) => P.TECHS.includes(s));
  const p = { ...(old || { created: Date.now(), fotos: [] }), lead, nome: String(nome || '').trim().slice(0, 120), sol: old?.resp || !sol.length ? old?.sol || sol : sol };
  await store.setJSON('pedido-' + token, p);
  await store.setJSON('pedido-lead-' + lead, { token });
  return { token, p };
}

// Orçamento preparado para envio a partir de uma lead: entra na página do cliente (criada se ainda não existir).
export async function addProposta(store, lead, nome, x) {
  if (!LEAD.test(String(lead || ''))) return '';
  const { token, p } = await createLink(store, lead, nome, []);
  await store.setJSON('pedido-' + token, { ...p, propostas: [...(p.propostas || []), { token: x.token, quote: x.quote, numero: x.numero, titulo: x.titulo, ...(Number.isFinite(x.total) ? { total: Math.round(x.total * 100) / 100 } : {}), at: Date.now() }].slice(-30) });
  return token;
}
// Orçamentos de outras empresas com mais de 12 meses: apagados (uma vez por dia).
export async function limparAnexos(store, now = Date.now()) {
  const list = (await store.get(INDEX, { type: 'json' }).catch(() => null)) || [];
  return cleanupAnexos(store, list.map((x) => x.token), now);
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
    for (const x of list.slice(-60)) {
      const p = await get(store, x.token);
      if (!p || p.revogado || !(p.resp || p.chatAt || p.anexoAt)) continue;
      out.push({ token: x.token, lead: p.lead, at: p.resp?.at || 0, resp: p.resp || null, sug: p.resp ? sugestoes(p.resp) : null, chatAt: p.chatAt || 0, chatN: p.chatN || 0, anexoAt: p.anexoAt || 0, anexos: (p.anexos || []).length });
    }
    // Links enviados automaticamente por email às leads novas (a app marca-os na lead).
    const auto = Object.entries((await store.get(AUTO_SENT, { type: 'json' }).catch(() => null)) || {}).map(([lead, x]) => ({ lead, token: x.token, sent: x.at, failed: Boolean(x.failed), via: x.via || 'email' }));
    return json(200, { pedidos: out, auto });
  }
  // Página do cliente vista da app: link, mensagens, ficheiros e orçamentos.
  const cv = path.match(/^pedido\/conversa\/([A-Za-z0-9_-]{1,60})$/);
  if (cv && req.method === 'GET') {
    const token = await tokenOf(store, cv[1]), p = token ? await get(store, token) : null;
    if (!p) return json(200, { token: '' });
    return json(200, { token, url: linkBase(new URL(req.url).origin) + '/pedido/' + token, msgs: pubMsgs(await getChat(store, token)), anexos: (p.anexos || []).map(({ id, nome, mime, at, size }) => ({ id, nome, mime, at, size })), propostas: p.propostas || [] });
  }
  if (path === 'pedido/msg' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const token = await tokenOf(store, String(b?.lead || '')), p = token ? await get(store, token) : null, texto = cleanText(b?.texto);
    if (!p) return json(400, { error: 'Este cliente ainda não tem página. Envie primeiro o link.' });
    if (!texto) return json(400, { error: 'Escreva a mensagem.' });
    const list = await addMsg(store, token, p, 'e', texto);
    // O cliente recebe um email com a mensagem e o link para responder.
    const to = String(b.email || '').trim();
    let email = 'sem email';
    if (EMAIL.test(to) && to.length <= 320) {
      const origin = process.env.URL || new URL(req.url).origin, e = (await store.get('empresa', { type: 'json' }).catch(() => null)) || {}, me = e.contacto?.nome || 'João Lima', first = String(p.nome || '').trim().split(/\s+/)[0];
      try { await sendEmail(to, 'Nova mensagem da ENAT · Enat - Ponte de Lima', 'Olá' + (first ? ' ' + first : '') + ',\n\n' + texto + '\n\n' + me + '\nEnat - Ponte de Lima\n\nPara responder, use a sua página:\n' + linkBase(origin) + '/pedido/' + token, origin, 'Responder'); email = 'enviado'; }
      catch (x) { console.error('pedido msg email', x?.code || x?.message); email = 'falhou'; }
    }
    return json(200, { msgs: pubMsgs(list), email });
  }
  // Link novo: o antigo deixa de funcionar (ex.: o cliente reencaminhou-o a outra pessoa).
  if (path === 'pedido/novo-link' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const lead = String(b?.lead || ''), old = await tokenOf(store, lead), p = old ? await get(store, old) : null;
    if (!p) return json(400, { error: 'Este cliente ainda não tem link.' });
    const token = randomBytes(18).toString('base64url');
    await store.setJSON('pedido-' + token, p);
    await store.setJSON('chat-' + token, await getChat(store, old));
    await store.setJSON('pedido-lead-' + lead, { token });
    await store.setJSON('pedido-' + old, { lead, revogado: Date.now() });
    await store.delete('chat-' + old).catch(() => {});
    const list = ((await store.get(INDEX, { type: 'json' }).catch(() => null)) || []).map((x) => x.token === old ? { ...x, token } : x);
    await store.setJSON(INDEX, list);
    return json(200, { token, url: linkBase(new URL(req.url).origin) + '/pedido/' + token });
  }
  const ax = path.match(/^pedido\/anexo\/([a-f0-9]{18})$/);
  if (ax && req.method === 'GET') {
    const r = await store.getWithMetadata('pedanexo-' + ax[1], { type: 'arrayBuffer' });
    if (!r) return json(404, { error: 'Ficheiro não encontrado.' });
    const name = String(r.metadata?.nome || 'orcamento') + (r.metadata?.mime === 'application/pdf' && !/\.pdf$/i.test(r.metadata?.nome || '') ? '.pdf' : '');
    return new Response(r.data, { headers: { 'content-type': r.metadata?.mime || 'application/octet-stream', 'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(name), 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
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
  // O link não expira: é a página do cliente. Só deixa de funcionar quando a ENAT gera um link novo.
  const gone = !p || Boolean(p.revogado);
  if (sub === 'msgs' && req.method === 'GET') return gone ? json(404, { error: 'Link indisponível.' }) : json(200, { msgs: pubMsgs(await getChat(store, token)) });
  if (sub === 'msg' && req.method === 'POST') {
    if (gone) return json(404, { error: 'Este link já não está disponível. Contacte-nos.' });
    let b; try { b = JSON.parse((await req.text()).slice(0, 10000)); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const texto = cleanText(b?.texto);
    if (!texto) return json(400, { error: 'Escreva a mensagem.' });
    if (tooMany(await getChat(store, token))) return json(429, { error: 'Já recebemos muitas mensagens hoje. Respondemos em breve.' });
    const now = Date.now(), list = await addMsg(store, token, p, 'c', texto, now);
    await bump(store, token, now);
    await notify(store, { title: 'Mensagem de ' + (p.nome || 'cliente'), body: texto.slice(0, 140), tag: 'chat-' + p.lead, data: { lead: p.lead } });
    return json(200, { msgs: pubMsgs(list) });
  }
  if (sub === 'novo' && req.method === 'POST') {
    if (gone) return json(404, { error: 'Este link já não está disponível. Contacte-nos.' });
    let b; try { b = JSON.parse((await req.text()).slice(0, 10000)); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const sol = (Array.isArray(b?.sol) ? b.sol : []).filter((t) => P.TECHS.includes(t)), extra = cleanText(b?.texto, 1500);
    if (!sol.length && !extra) return json(400, { error: 'Escolha o que quer orçamentar, ou escreva-nos.' });
    if (tooMany(await getChat(store, token))) return json(429, { error: 'Já recebemos muitas mensagens hoje. Respondemos em breve.' });
    const texto = 'Pedido de novo orçamento' + (sol.length ? ': ' + sol.join(', ') : '') + (extra ? '\n' + extra : '');
    const now = Date.now(), list = await addMsg(store, token, p, 'c', texto, now);
    await store.setJSON('pedido-' + token, { ...(await get(store, token)), novos: [...(p.novos || []), { sol, texto: extra, at: now }].slice(-20) });
    await bump(store, token, now);
    await notify(store, { title: 'Novo pedido de orçamento: ' + (p.nome || 'cliente'), body: (sol.join(', ') || extra).slice(0, 140), tag: 'chat-' + p.lead, data: { lead: p.lead } });
    return json(200, { msgs: pubMsgs(list) });
  }
  if (sub === 'anexo' && req.method === 'POST') {
    if (gone) return json(404, { error: 'Este link já não está disponível. Contacte-nos.' });
    const r = await saveAnexo(req, store, token, p);
    if (r.error) return json(400, { error: r.error });
    await bump(store, token, r.anexo.at);
    await notify(store, { title: 'Orçamento de outra empresa: ' + (p.nome || 'cliente'), body: r.anexo.nome, tag: 'anexo-' + p.lead, data: { lead: p.lead } });
    return json(200, { anexo: { nome: r.anexo.nome, at: r.anexo.at }, anexos: pubAnexos(r.anexos) });
  }
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
    await bump(store, token, resp.at);
    await notify(store, { title: 'Detalhes recebidos: ' + (p.nome || 'lead'), body: [r.sol.join(', '), r.local, fotos.length ? fotos.length + ' foto' + (fotos.length > 1 ? 's' : '') : ''].filter(Boolean).join(' · '), tag: 'pedido-' + p.lead, data: { lead: p.lead } });
    return json(200, { ok: true });
  }
  if (req.method !== 'GET') return json(405, { error: 'Método não permitido.' });
  if (gone) return new Response(page('Link indisponível', '<section class="card"><h1>Este link já não está disponível</h1><p>Contacte-nos para receber o seu novo link: <a href="mailto:pontedelima@enat.pt">pontedelima@enat.pt</a></p></section>'), { status: 404, headers: HTML });
  const [empresa, chat] = await Promise.all([store.get('empresa', { type: 'json' }).catch(() => null), getChat(store, token)]);
  return new Response(page('A sua página · Enat Ponte de Lima', portalHtml(token, p, empresa || {}, pubMsgs(chat), form(token, p), p.resp ? P.summary(p.resp) : [], P.TECHS)), { headers: HTML });
}

// ---- Envio automático por email às leads novas ----
// Corre a cada minuto (e logo que chega uma lead do email), só das 8h às 22h (hora de Lisboa).
// Envia a leads com a fase «Lead nova», com email, recebidas nos últimos 7 dias, a quem nunca foi enviado o link.
// Endereço dos links enviados aos clientes: LINK_URL (ex.: https://propostas.enat.pt) ou, sem ele, o endereço da app.
const linkBase = (fallback) => String(process.env.LINK_URL || '').replace(/\/+$/, '') || fallback;
const AUTO_SENT = 'pedido-auto-enviados', AUTO_LAST = 'pedido-auto-ultimo', EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const leadTime = (l) => { const t = new Date(l.received || (l.date ? l.date + 'T12:00:00Z' : 0)).getTime(); return Number.isFinite(t) ? t : 0; };
// Link já mostrado ao cliente (ex.: no site, logo a seguir ao pedido): não volta a ser enviado por email.
export async function markSent(store, lead, token, at = Date.now(), via = 'site') {
  const sent = (await store.get(AUTO_SENT, { type: 'json' }).catch(() => null)) || {};
  await store.setJSON(AUTO_SENT, { ...sent, [lead]: { token, at, via } });
}
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
async function sendEmail(to, subject, text, origin, label = 'Responder às perguntas') {
  const c = { host: process.env.SMTP_HOST || 'mail.enat.pt', port: Number(process.env.SMTP_PORT || 465), user: process.env.SMTP_USER || 'pontedelima@enat.pt', pass: process.env.SMTP_PASSWORD, from: process.env.EMAIL_FROM || 'pontedelima@enat.pt' };
  if (!c.pass) throw new Error('smtp not configured');
  const { createTransport } = await import('nodemailer');
  const t = createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#122c3b;max-width:600px"><div style="padding:4px 0 14px;border-bottom:3px solid #f3a51c;margin-bottom:18px"><img src="' + esc(origin) + '/enat-logo.png" alt="Enat - Ponte de Lima" width="131" height="47" style="display:block"></div>'
    + esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="display:inline-block;margin:6px 0;padding:12px 20px;background:#2f8f3a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">' + esc(label) + '</a>').replace(/\n/g, '<br>') + '</div>';
  const { default: MailComposer } = await import('nodemailer/lib/mail-composer/index.js');
  // Composta uma vez: o cliente e a pasta Enviados recebem a mesma mensagem.
  const raw = await new MailComposer({ from: { name: 'Enat - Ponte de Lima', address: c.from }, to, replyTo: c.from, subject, text, html }).compile().build();
  const info = await t.sendMail({ envelope: { from: c.from, to: [to] }, raw });
  if (!(info.accepted || []).map((a) => String(a?.address || a).toLowerCase()).includes(to.toLowerCase())) throw new Error('rejected');
  const { saveSent } = await import('./mail-sent.mjs');
  await saveSent(c, raw).catch((e) => console.error('pedido sent folder', e?.code || e?.message));
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
  const { siteInbox } = await import('./site.mjs');
  const todo = autoCandidates(state, [...(meta?.leads || []), ...(await siteInbox(store))], sent || {}, now).slice(0, 5);
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

function form(token, p) {
  const r = p.resp || { sol: p.sol || [], a: {}, gama: '', morada: '', cp: '', local: '', notas: '' };
  return `<form id="f" novalidate>
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
  location.replace(location.pathname+'?ok=1')}
 catch(x){err.textContent=x.message||'Não foi possível enviar. Verifique a ligação e tente de novo.';b.disabled=false;b.textContent='Enviar respostas'}
});
</script>`;
}

function page(title, body) {
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title><link rel="icon" href="/favicon-32x32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
${BASE_CSS}
html{scroll-behavior:smooth;scroll-padding-top:12px}body{padding-bottom:calc(40px + env(safe-area-inset-bottom,0px))}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}
.tabs a{flex:none;text-decoration:none;color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:8px 13px;font-weight:600;font-size:14px}
.card>.btn,.card>label.btn{margin-top:14px}.card>.btn.ghost{margin-top:12px}form{margin:0}#send{margin-top:16px}
.q{margin:18px 0 0}.q:first-of-type{margin-top:4px}.row .q{margin-top:18px}.q>label{display:block;font-weight:600;font-size:15px;margin-bottom:8px}
.help{color:var(--mute);font-size:13.5px;margin:-4px 0 8px}.rooms .help{margin:4px 0 0}
button.chip{border:1.5px solid var(--line);background:var(--card);color:var(--ink);border-radius:20px;padding:9px 14px;font:inherit;font-size:14.5px;cursor:pointer;-webkit-tap-highlight-color:transparent}
button.chip.on{border-color:var(--blue);background:var(--tint);font-weight:600;box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 12%,transparent)}
.gama{display:grid;gap:8px}.gama .opt{display:block;padding:14px}.gama .opt.on{border-color:var(--blue);background:var(--tint);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}
input,select{width:100%;border:1.5px solid var(--line);border-radius:14px;padding:11px 13px;font:inherit;background:var(--card);color:var(--ink)}input:focus,select:focus{outline:none;border-color:var(--blue)}
.row{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.thumbs:empty{display:none}.thumb{aspect-ratio:1;border-radius:12px;background:var(--tint) center/cover}.thumb.busy{animation:p 1s infinite alternate}@keyframes p{to{opacity:.4}}
.room{display:grid;grid-template-columns:1fr 96px auto;gap:8px;align-items:center;margin-bottom:8px}.room span{color:var(--mute)}
.more{border:0;background:none;color:var(--blue);font:inherit;font-weight:600;padding:6px 0;cursor:pointer}
.err{color:var(--red);font-size:14px;font-weight:600;min-height:1px;margin:12px 0 0}
.sum{display:grid;gap:10px;margin:0}.sum div{display:flex;flex-direction:column;border-bottom:1px solid var(--line);padding:0 0 10px}.sum span{color:var(--mute);font-size:13px}.sum b{font-weight:600;font-size:15px}
.other span{display:flex;flex-direction:column;min-width:0}.other b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.other em{color:var(--blue)}.other em.ok{color:var(--green)}a.other:hover{border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}.other.busy{opacity:.6}
#anexos:empty{display:none}#anexos{margin-bottom:2px}
.wait{display:flex;gap:12px;align-items:flex-start;background:var(--tint);border-radius:16px;padding:12px 14px}.wait b{display:block;font-size:15px}.wait small{display:block;color:var(--mute);font-size:13.5px}.wait .dot{background:var(--sun)}
.chat{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto;margin:0 0 12px}.chat:empty{display:none}
.msg{max-width:85%;border-radius:18px;padding:9px 13px}.msg p{margin:0;overflow-wrap:anywhere;font-size:15px}.msg small{display:block;font-size:12px;margin-top:3px;opacity:.7}
.msg.me{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:6px}.msg.enat{align-self:flex-start;background:var(--chip);border-bottom-left-radius:6px}
.send .btn{margin-top:10px}#nv{margin-bottom:2px}#nvok{margin-top:12px}
#thanks .thanks{margin:0}
</style></head><body>${body}</body></html>`;
}
