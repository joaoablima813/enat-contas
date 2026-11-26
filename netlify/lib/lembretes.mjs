// Lembretes automáticos ao cliente quando a proposta fica sem resposta:
// - 4 dias depois do envio: email + WhatsApp com o link da proposta e o pedido de resposta;
// - 10 dias depois: último lembrete, com a data de validade.
// Param quando o cliente responde (qualquer decisão ou «Tenho dúvidas»), quando a proposta expira, é aceite/recusada
// na app ou a lead passa a «Ganho» ou «Perdido». Enviados das 10h às 19h (hora de Lisboa), de segunda a sábado.
// «Preciso de mais tempo» com uma data: nesse dia chega um aviso ao telemóvel para voltar a contactar.
// O WhatsApp automático usa a WhatsApp Cloud API da Meta (WHATSAPP_TOKEN e WHATSAPP_PHONE_ID); sem ela só segue o email.
import { TZ } from './push.mjs';

const D = 864e5;
const ANSWERS = ['adjudicar', 'revisao', 'pensar', 'mais_tarde', 'rejeitar', 'trocou', 'duvida'];
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const STEPS = [{ step: 1, days: 4 }, { step: 2, days: 10 }];
export const WA_TEMPLATES = { 1: 'enat_lembrete_4_dias', 2: 'enat_lembrete_10_dias' };
const number = (q) => 'ORC ' + (String(q.date || '').slice(0, 4) || '') + '/' + String(q.id).padStart(4, '0');
const expires = (d) => new Date(Date.parse(d.date + 'T00:00:00Z') + (Number(d.validity) || 15) * D).toISOString().slice(0, 10);
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
export const waNumber = (tel) => { const d = String(tel || '').replace(/\D/g, '').replace(/^00/, ''); return d.length === 9 && /^9/.test(d) ? '351' + d : /^\d{11,15}$/.test(d) ? d : ''; };
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const topic = (d) => (d.topics || []).join(' e ').toLowerCase();

// Textos enviados ao cliente (os do WhatsApp são os modelos aprovados pela Meta, com os mesmos parâmetros).
export function emailText(step, x) {
  const ola = 'Olá' + (x.nome ? ' ' + x.nome : '') + ',';
  const assina = '\n\nObrigado,\n' + x.eu + '\nEnat - Ponte de Lima' + (x.tel ? ' · ' + x.tel : '');
  if (step === 1) return {
    subject: 'O seu orçamento ' + x.numero + ' · Enat - Ponte de Lima', label: 'Responder ao orçamento',
    text: ola + '\n\nHá alguns dias enviámos-lhe o orçamento ' + x.numero + (x.tema ? ' para ' + x.tema : '') + '. Já teve oportunidade de o ver?\n\nPara nos ajudar a dar-lhe a melhor resposta, diga-nos em que ponto está. Basta um clique na sua página:\n\n' + x.link + '\n\nLá pode indicar se quer avançar, se prefere uma revisão, se tem dúvidas ou se precisa de mais tempo.\n\nA proposta é válida até ' + x.validade + '.' + assina,
  };
  return {
    subject: 'Ainda está interessado? · Orçamento ' + x.numero, label: 'Dar a minha resposta',
    text: ola + '\n\nNão queremos insistir, apenas saber se ainda podemos ajudar com o orçamento ' + x.numero + '.\n\nSe o preço, o equipamento ou a data não forem os ideais, diga-nos. Muitas vezes conseguimos ajustar a proposta.\n\n' + x.link + '\n\nA proposta é válida até ' + x.validade + '. Se já decidiu não avançar, também nos ajuda saber o motivo. Leva 10 segundos.' + assina,
  };
}
export function waTemplate(step, x, token) {
  const body = [x.nome || 'cliente', x.numero, ...(step === 2 ? [x.validade] : [])].map((text) => ({ type: 'text', text }));
  return { name: WA_TEMPLATES[step], language: { code: 'pt_PT' }, components: [{ type: 'body', parameters: body }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] }] };
}

// rows: [{id, document}], events: [{quoteId, kind, at, note}], leads: estado.leads. Devolve os lembretes devidos.
export function due(rows, events, leads = [], now = Date.now()) {
  const by = new Map(), stage = new Map(leads.map((l) => [l.id, l.stage]));
  for (const e of events) { if (!by.has(e.quoteId)) by.set(e.quoteId, []); by.get(e.quoteId).push(e); }
  const today = new Date(now).toISOString().slice(0, 10), out = [];
  for (const r of rows) {
    const d = r.document || {}, ev = by.get(r.id) || [];
    const sent = ev.filter((e) => e.kind === 'enviado').at(-1);
    if (!sent || !['enviado', 'rascunho', undefined].includes(d.status)) continue;
    if (d.lead && ['ganho', 'perdido'].includes(stage.get(d.lead))) continue;
    const t0 = new Date(sent.at).getTime(), after = ev.filter((e) => new Date(e.at).getTime() >= t0);
    if (after.some((e) => ANSWERS.includes(e.kind)) || today > expires(d)) continue;
    const done = new Set(after.filter((e) => e.kind === 'lembrete').map((e) => Number(String(e.note).match(/^Lembrete (\d)/)?.[1])));
    // Só o mais recente em falta: se o de 4 dias falhou e já passaram 10, segue apenas o de 10.
    const s = [...STEPS].reverse().find((s) => now - t0 >= s.days * D);
    if (!s || done.has(s.step) || (s.step === 1 && now - t0 > 9 * D) || now - t0 > 14 * D) continue;
    out.push({ quote: r.id, step: s.step, key: r.id + '|' + t0 + '|' + s.step, doc: d });
  }
  return out;
}
// «Preciso de mais tempo»: data pedida pelo cliente, na nota da resposta.
export function pausas(events, rows, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10), name = new Map(rows.map((r) => [r.id, r])), last = new Map();
  for (const e of events) if (ANSWERS.includes(e.kind) || e.kind === 'enviado') last.set(e.quoteId, e);
  const out = [];
  for (const [id, e] of last) {
    const m = e.kind === 'mais_tarde' && String(e.note || '').match(/a partir de (\d{2})\/(\d{2})\/(\d{4})/);
    if (!m || m[3] + '-' + m[2] + '-' + m[1] > today || !name.has(id)) continue;
    const r = name.get(id);
    out.push({ quote: id, key: 'pausa|' + id + '|' + m[0], title: 'Voltar a contactar: ' + (String(r.document?.client || '').trim() || 'Cliente'), body: number({ id, date: r.document?.date }) + ' · pediu para falar a partir de ' + m[1] + '/' + m[2] + '. É hoje.' });
  }
  return out;
}

// Endereço da API: Meta direta (graph.facebook.com) ou um parceiro com o mesmo formato (ex.: WHATSAPP_API_BASE=https://api.dualhook.com).
export async function sendWhatsapp(to, template, { token = process.env.WHATSAPP_TOKEN, phone = process.env.WHATSAPP_PHONE_ID, version = process.env.WHATSAPP_API_VERSION || 'v25.0', base = process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com' } = {}) {
  if (!token || !phone) throw new Error('whatsapp not configured');
  const r = await fetch(String(base).replace(/\/+$/, '') + '/' + version + '/' + encodeURIComponent(phone) + '/messages', {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('whatsapp ' + r.status + ' ' + (j?.error?.code || '') + ' ' + String(j?.error?.message || '').slice(0, 120));
  return j?.messages?.[0]?.id || '';
}
export const whatsappOn = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

// Link da proposta: guardado ao preparar o envio (whatsapp.ts) ou, nas antigas, procurado na página do cliente.
async function linkOf(store, r, cache = {}) {
  const k = await store.get('proposta-link-' + r.id, { type: 'json' }).catch(() => null);
  if (k?.token) return k.token;
  const lead = r.document?.lead;
  if (lead) {
    const p = await store.get('pedido-lead-' + lead, { type: 'json' }).catch(() => null);
    const ped = p?.token ? await store.get('pedido-' + p.token, { type: 'json' }).catch(() => null) : null;
    const t = (ped?.propostas || []).filter((x) => x.quote === r.id).at(-1)?.token;
    if (t) { await store.setJSON('proposta-link-' + r.id, { token: t, at: Date.now() }).catch(() => {}); return t; }
  }
  // Propostas antigas: o link é o do PDF enviado (pdf-<token>, com o número do orçamento nos metadados). Lido uma vez por execução.
  if (!cache.pdfs && store.list && store.getMetadata) {
    cache.pdfs = new Map();
    try {
      const { blobs = [] } = await store.list({ prefix: 'pdf-' });
      for (const b of blobs.slice(-400)) {
        const m = await store.getMetadata(b.key).catch(() => null), q = m?.metadata?.quote;
        if (Number.isInteger(q)) cache.pdfs.set(q, b.key.slice(4));
      }
    } catch (e) { console.error('lembretes pdfs', e?.message); }
  }
  const t = cache.pdfs?.get(r.id) || '';
  if (t) await store.setJSON('proposta-link-' + r.id, { token: t, at: Date.now() }).catch(() => {});
  return t;
}

const local = (now) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map((x) => [x.type, x.value])); return { h: Number(p.hour), dow: p.weekday }; };

// Chamado pela função agendada; no máximo a cada 15 minutos.
export async function runLembretes(store, now = Date.now(), deps = {}) {
  const { h, dow } = local(now);
  if (!deps.force && (h < 10 || h >= 19 || dow === 'Sun')) return { skipped: 'hora' };
  const e = (await store.get('empresa', { type: 'json' }).catch(() => null)) || {};
  if (e.lembretes === false) return { skipped: 'off' };
  const last = await store.get('lembretes-ultimo', { type: 'json' }).catch(() => null);
  if (!deps.force && last && now - last.t < 15 * 60e3) return { skipped: 'recent' };
  await store.setJSON('lembretes-ultimo', { t: now });
  const load = deps.load || (async () => {
    const { db } = await import('../../db/index.js');
    const { quotes, quoteEvents } = await import('../../db/schema.js');
    const { gte } = await import('drizzle-orm');
    const [rows, events] = await Promise.all([
      db.select({ id: quotes.id, document: quotes.document }).from(quotes).where(gte(quotes.updatedAt, new Date(now - 40 * D))),
      db.select({ quoteId: quoteEvents.quoteId, kind: quoteEvents.kind, at: quoteEvents.createdAt, note: quoteEvents.note }).from(quoteEvents).where(gte(quoteEvents.createdAt, new Date(now - 40 * D))).orderBy(quoteEvents.id),
    ]);
    return { rows, events };
  });
  const record = deps.record || (async (quoteId, note) => {
    const { db } = await import('../../db/index.js');
    const { quoteEvents } = await import('../../db/schema.js');
    await db.insert(quoteEvents).values({ quoteId, kind: 'lembrete', note });
  });
  const mail = deps.mail || (async (...a) => (await import('./pedido.mjs')).sendEmail(...a));
  const wa = deps.wa || sendWhatsapp, waOn = deps.waOn ?? whatsappOn();
  const push = deps.push || (async (m) => (await import('./push.mjs')).sendPush(store, m));
  const { rows, events } = await load();
  const state = (await store.get('estado', { type: 'json' }).catch(() => null)) || {};
  const sent = (await store.get('lembretes-enviados', { type: 'json' }).catch(() => null)) || {};
  const todo = due(rows, events, state.leads || [], now).filter((x) => !sent[x.key]).slice(0, 10);
  const avisos = pausas(events, rows, now).filter((x) => !sent[x.key]);
  for (const x of avisos) sent[x.key] = now;
  for (const k of Object.keys(sent)) if (now - sent[k] > 60 * D) delete sent[k];
  if (avisos.length) await store.setJSON('lembretes-enviados', sent);
  for (const a of avisos) await push({ title: a.title, body: a.body, tag: 'pausa-' + a.quote, data: { quote: a.quote } }).catch(() => {});
  const base = String(process.env.LINK_URL || '').replace(/\/+$/, '') || process.env.URL || 'https://enat-contas.netlify.app';
  const origin = process.env.URL || 'https://enat-contas.netlify.app';
  let n = 0;
  const cache = {};
  for (const x of todo) {
    const token = await linkOf(store, { id: x.quote, document: x.doc }, cache);
    if (!token) { console.error('lembrete sem link', x.quote); continue; }
    const d = x.doc, v = { nome: first(d.client), numero: number({ id: x.quote, date: d.date }), tema: topic(d), validade: dmy(expires(d)), link: base + '/proposta/' + token, eu: e.contacto?.nome || 'João Lima', tel: String(e.contacto?.telefone || '').trim() };
    const vias = [];
    const to = String(d.email || '').trim();
    if (EMAIL.test(to) && to.length <= 320) { const m = emailText(x.step, v); try { await mail(to, m.subject, m.text, origin, m.label); vias.push('email'); } catch (err) { console.error('lembrete email', err?.code || err?.message); } }
    const tel = waNumber(d.contact);
    if (waOn && tel) { try { await wa(tel, waTemplate(x.step, v, token)); vias.push('WhatsApp'); } catch (err) { console.error('lembrete whatsapp', err?.message); } }
    if (!vias.length) continue;
    n++;
    sent[x.key] = now;
    await store.setJSON('lembretes-enviados', sent);
    await record(x.quote, 'Lembrete ' + x.step + ' (' + STEPS[x.step - 1].days + ' dias) · ' + vias.join(' + ')).catch((err) => console.error('lembrete registo', err?.message));
  }
  return { sent: n, avisos: avisos.length };
}
