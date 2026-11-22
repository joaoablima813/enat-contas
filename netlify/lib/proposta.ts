// Public quote page opened from the WhatsApp or email link: the client sees the proposal, opens the PDF and answers.
// Opening the page, opening the PDF and every answer are recorded, so the app shows "Visto" and the client's decision.
// Order of the page, for clients who do not know us yet: who we are and why trust us, what they gain and what is
// included, and only then the price and the decision. Answering takes one tap and is offered again when the client
// comes back from the PDF or opens the link a second time.
import { db } from '../../db/index.js';
import { quotes, quoteEvents } from '../../db/schema.js';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import '../../public/quote-math.js';
import '../../public/gestao.js';
import '../../public/quote-obra.js';
import '../../public/solucoes.js';
import { getPortfolio, nearby, monthLabel } from './portfolio.mjs';

const G: any = globalThis;
export const ANSWERS: Record<string, string> = { adjudicar: 'Adjudicado', revisao: 'Pedido de revisão', pensar: 'Vai pensar', mais_tarde: 'Fica para mais tarde', rejeitar: 'Rejeitado' };
// "Ainda não vou avançar": the reason is required and decides which answer is stored, so the app keeps the same codes.
export const MOTIVOS: Record<string, [string, string]> = {
  tempo: ['pensar', 'Preciso de mais tempo para decidir'],
  comparar: ['pensar', 'Ainda estou a comparar propostas'],
  preco: ['pensar', 'O valor ficou acima do que esperava'],
  mais_tarde: ['mais_tarde', 'Fica para mais tarde'],
  outra: ['rejeitar', 'Escolhi outra empresa'],
  nao_precisa: ['rejeitar', 'Já não preciso'],
  outro: ['pensar', 'Outro motivo'],
};
const DUVIDA: Record<string, string> = { whatsapp: 'WhatsApp', chamada: 'chamada', email: 'email' };
// Link previews (WhatsApp, Gmail, Outlook…) open the link by themselves; they must not count as "Visto".
export const isBot = (ua: string) => !ua || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|googleimageproxy|google-safety|proofpoint|mimecast|barracuda|curl|wget|python|headless|lighthouse/i.test(ua);
const COMPANY = { name: 'Enat - Ponte de Lima', email: 'pontedelima@enat.pt', contact: 'João Lima', role: 'Responsável comercial' };
const quoteNumber = (id: number, date: string) => 'ORC ' + (String(date || '').slice(0, 4) || new Date().getFullYear()) + '/' + String(id).padStart(4, '0');
const subject = (q: any) => [(q.topics || []).join(' + '), String(q.brand || '').trim()].filter(Boolean).join(' ');
const validity = (q: any) => Number(q.validity) || 15;
const expires = (q: any) => new Date(Date.parse(q.date + 'T00:00:00Z') + validity(q) * 864e5).toISOString().slice(0, 10);
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (n: number) => Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ') + ' €';
const num = (n: number, d = 0) => Number(n).toLocaleString('pt-PT', { maximumFractionDigits: d }).replace(/\s/g, ' ');
const day = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const when = (t: Date | string) => new Date(t).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
const fail = (status: number, error: string) => Response.json({ error }, { status });
const clientText = (t: unknown) => String(t ?? '').replace(/^S\.? ?Energias\s+/i, '').trim();
// Portuguese mobile numbers are written with 9 digits; WhatsApp needs the country code.
const waNumber = (tel: string) => { const d = String(tel || '').replace(/\D/g, ''); return d.length === 9 ? '351' + d : d; };
// Bank details are only sent after the client awards the quote (not in the page beforehand).
const payHtml = (row: any) => { const q = row.document, half = Math.round(G.quoteTotals(q).total * 50) / 100; return `<div class="pay"><b>Dados para pagamento da adjudicação (50%)</b><span>Valor: <b>${esc(eur(half))}</b></span><span>IBAN: <b class="iban">${esc(G.ENAT_IBAN)}</b></span><span>Titular: ${esc(COMPANY.name)} · Referência: ${esc(quoteNumber(row.id, q.date))}</span></div>`; };
const weeksOf = (e: any) => G.EnatSolucoes.nextWeeks(e?.semanas).map(G.EnatSolucoes.weekLabel);

async function lookup(token: string, store: any) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  const meta = (await store.getMetadata('pdf-' + token))?.metadata;
  const id = Number(meta?.quote);
  if (!Number.isInteger(id)) return null;
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  return row ? { row, group: typeof meta.group === 'string' ? meta.group : '' } : null;
}
const lastAnswer = async (quoteId: number) => (await db.select().from(quoteEvents).where(and(eq(quoteEvents.quoteId, quoteId), inArray(quoteEvents.kind, Object.keys(ANSWERS)))).orderBy(desc(quoteEvents.id)).limit(1))[0];
const empresaOf = async (store: any) => (await store.get('empresa', { type: 'json' }).catch(() => null)) || {};

// The job is added to the app's synced state; the app merges it on its next sync, like an edit from another device.
export async function openObra(store: any, row: any) {
  const doc: any = row.document, cur: any = await store.get('estado', { type: 'json' });
  if (!cur) return '';
  cur.obras = cur.obras || [];
  if (doc.obra && cur.obras.some((o: any) => o.id === doc.obra)) return doc.obra;
  const now = Date.now(), id = now.toString(36) + randomBytes(2).toString('hex');
  cur.obras.push({ ...G.EnatQuoteObra.obraFromQuote(doc, row.id, id, new Date(now).toISOString().slice(0, 10)), u: now });
  cur.ts = now;
  await store.setJSON('estado', cur);
  return id;
}

const push = async (store: any, title: string, body: string, row: any) => {
  try {
    const { sendPush } = await import('./push.mjs');
    await sendPush(store, { title, body: body.slice(0, 300), tag: 'quote-' + row.id, data: { quote: row.id } });
  } catch (e: any) { console.error('proposta push', e?.message); }
};

async function record(req: Request, found: any, store: any) {
  let b: any;
  try { b = JSON.parse(await req.text()); } catch { return fail(400, 'Dados inválidos.'); }
  let kind = String(b?.kind || '');
  const comment = typeof b?.note === 'string' ? b.note.trim().slice(0, 2000) : '';
  const { row } = found, ua = req.headers.get('user-agent') || '', number = quoteNumber(row.id, row.document.date);
  const client = String(row.document.client || '').trim() || 'Cliente';
  if (kind === 'visto' || kind === 'pdf' || kind === 'duvida') {
    if (isBot(ua)) return Response.json({ ok: true });
    // Reloading the page within 10 minutes counts as the same visit.
    const [last] = await db.select().from(quoteEvents).where(and(eq(quoteEvents.quoteId, row.id), eq(quoteEvents.kind, kind))).orderBy(desc(quoteEvents.id)).limit(1);
    if (!last || Date.now() - new Date(last.createdAt).getTime() > 10 * 60e3) {
      const note = kind === 'duvida' ? DUVIDA[comment] || '' : '';
      await db.insert(quoteEvents).values({ quoteId: row.id, kind, note });
      // A question is a buying signal: the user is told at once, to answer while the client is on the page.
      if (kind === 'duvida') await push(store, 'Cliente com dúvidas: ' + client, number + (note ? ' · vai contactar por ' + note : '') + ' · responda agora, enquanto vê a proposta.', row);
    }
    return Response.json({ ok: true });
  }
  let note = comment;
  if (kind === 'nao') {
    const m = MOTIVOS[String(b?.motivo || '')];
    if (!m) return fail(400, 'Escolha o motivo.');
    if (b.motivo === 'outro' && !comment) return fail(400, 'Diga-nos o motivo.');
    kind = m[0];
    note = ['Motivo: ' + m[1], comment].filter(Boolean).join(' · ');
  }
  if (!ANSWERS[kind]) return fail(400, 'Escolha uma resposta.');
  if (kind === 'revisao' && !note) return fail(400, 'Diga-nos o que gostaria de alterar.');
  if (kind === 'adjudicar') {
    const semana = String(b?.semana || '');
    if (semana && (semana === 'A combinar' || weeksOf(await empresaOf(store)).includes(semana))) note = ['Semana preferida: ' + semana, note].filter(Boolean).join(' · ');
  }
  const doc: any = { ...row.document, status: kind === 'adjudicar' ? 'aceite' : kind === 'rejeitar' ? 'recusado' : 'enviado', clientAt: new Date().toISOString() };
  if (kind === 'adjudicar') {
    const obra = await openObra(store, row).catch((e: any) => { console.error('proposta obra', e?.message); return ''; });
    if (obra) doc.obra = obra;
  }
  await db.update(quotes).set({ document: doc, updatedAt: new Date() }).where(eq(quotes.id, row.id));
  const [ev] = await db.insert(quoteEvents).values({ quoteId: row.id, kind, note }).returning();
  // Choosing one of several quotes sent together takes the place of an earlier choice.
  if (kind === 'adjudicar' && found.group) {
    const siblings: any[] = (await store.get('grupo-' + found.group, { type: 'json' })) || [];
    for (const s of siblings.filter(s => s.quote !== row.id)) {
      const prev = await lastAnswer(s.quote);
      if (prev?.kind !== 'adjudicar') continue;
      const [other] = await db.select().from(quotes).where(eq(quotes.id, s.quote));
      if (!other) continue;
      await db.update(quotes).set({ document: { ...(other.document as any), status: 'enviado', clientAt: doc.clientAt }, updatedAt: new Date() }).where(eq(quotes.id, s.quote));
      await db.insert(quoteEvents).values({ quoteId: s.quote, kind: 'trocou', note: 'Escolheu o ' + quoteNumber(row.id, doc.date) + ' em vez deste orçamento.' });
    }
  }
  // Aviso no telemóvel, mesmo com a app fechada.
  await push(store, 'Resposta de cliente: ' + ANSWERS[kind], [client, number, note].filter(Boolean).join(' · '), row);
  return Response.json({ ok: true, kind, label: ANSWERS[kind], at: ev?.createdAt, obra: Boolean(doc.obra), note, ...(kind === 'adjudicar' ? { pay: payHtml({ ...row, document: doc }) } : {}) });
}

export async function handleProposta(req: Request, token: string, store: any) {
  let found;
  try { found = await lookup(token, store); } catch (e: any) { console.error('proposta', e?.message); return new Response(page('Serviço indisponível', '<section class="card"><h1>Não foi possível abrir a proposta</h1><p>Tente novamente dentro de instantes.</p></section>'), { status: 503, headers: HTML }); }
  if (req.method === 'POST') return found ? record(req, found, store).catch((e: any) => { console.error('proposta resposta', e?.message); return fail(503, 'Não foi possível registar a resposta. Tente novamente.'); }) : fail(404, 'Proposta não encontrada.');
  if (req.method !== 'GET') return fail(405, 'Método não permitido.');
  if (!found) return new Response(page('Proposta não encontrada', `<section class="card"><h1>Proposta não encontrada</h1><p>Este link já não está disponível. Contacte-nos para receber uma nova proposta.</p><p><a class="btn ghost" href="mailto:${COMPANY.email}">${COMPANY.email}</a></p></section>`), { status: 404, headers: HTML });
  const { row, group } = found, q: any = row.document;
  const [answer, siblings, empresa, views, works] = await Promise.all([
    lastAnswer(row.id),
    group ? store.get('grupo-' + group, { type: 'json' }) : null,
    empresaOf(store),
    db.select().from(quoteEvents).where(and(eq(quoteEvents.quoteId, row.id), eq(quoteEvents.kind, 'visto'))),
    getPortfolio(store).catch(() => []),
  ]);
  let others: any[] = [];
  const ids = ((siblings as any[]) || []).filter(s => s.quote !== row.id).map(s => s.quote);
  if (ids.length) {
    const rows = await db.select().from(quotes).where(inArray(quotes.id, ids));
    others = ((siblings as any[]) || []).map(s => ({ ...s, row: rows.find((r: any) => r.id === s.quote) })).filter(s => s.row);
  }
  return new Response(page('Proposta ' + quoteNumber(row.id, q.date) + ' · ' + COMPANY.name, body(token, row, answer, others, empresa, (views as any[]).length, works as any[])), { headers: HTML });
}

const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
const ICONS: Record<string, string> = {
  adjudicar: '<path d="M20 6 9 17l-5-5"/>',
  duvida: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5h.01"/>',
  revisao: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  nao: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  wa: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
};
const icon = (k: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const OPTIONS: [string, string, string][] = [
  ['adjudicar', 'Quero avançar', 'Aceito a proposta e quero marcar a instalação'],
  ['duvida', 'Tenho uma dúvida', 'Falar já com a nossa equipa'],
  ['revisao', 'Pedir um ajuste', 'Gostava de alterar alguma coisa'],
  ['nao', 'Ainda não vou avançar', 'Diga-nos porquê, ajuda-nos a melhorar'],
];

function body(token: string, row: any, answer: any, others: any[], e: any, views: number, works: any[] = []) {
  const q = row.document, number = quoteNumber(row.id, q.date), total = G.quoteTotals(q).total, until = expires(q), half = Math.round(total * 50) / 100;
  const expired = new Date().toISOString().slice(0, 10) > until;
  const c = e.contacto || {}, person = c.nome || COMPANY.contact, role = c.cargo || COMPANY.role, tel = String(c.telefone || '').trim(), wa = waNumber(tel);
  const img = (id: string) => `/proposta/${esc(token)}/img/${esc(id)}`;
  const waText = encodeURIComponent(`Olá ${person}, tenho uma dúvida sobre a proposta ${number}.`);
  const weeks: string[] = weeksOf(e);
  const gEquip = e.garantiaEquip || '3 anos', gInst = e.garantiaInst || '2 anos';
  const firstName = String(q.client || '').trim().split(/\s+/)[0] || '';
  const current = answer ? `<div class="answer a-${answer.kind}" id="current"><span class="dot"></span><div><b>A sua resposta: ${esc(ANSWERS[answer.kind])}</b><small>${esc(when(answer.createdAt))}${answer.note ? ' · «' + esc(answer.note) + '»' : ''}</small><small>Pode mudar a sua resposta a qualquer momento.</small>${answer.kind === 'adjudicar' ? payHtml(row) : ''}</div></div>` : '<div id="current"></div>';
  const list = others.length ? `<section class="card"><h2>Outras propostas enviadas</h2><p class="muted">Recebeu ${others.length + 1} propostas. Pode abrir cada uma e escolher a que prefere.</p>${others.map(s => `<a class="other" href="/proposta/${esc(s.token)}"><span><b>${esc(quoteNumber(s.row.id, s.row.document.date))}</b><small>${esc(subject(s.row.document))}</small></span><em>${esc(eur(G.quoteTotals(s.row.document).total))}</em></a>`).join('')}</section>` : '';
  const terms = ['Proposta válida até ' + day(until), 'Pagamento: 50% na adjudicação e 50% na conclusão da obra, por transferência bancária', 'Garantia dos equipamentos: ' + gEquip + ' · Garantia de instalação: ' + gInst];

  // 1. Who is behind the proposal: a real person the client can reach right away.
  const contactCard = `<div class="person">${c.foto ? `<img src="${img(c.foto)}" alt="" width="56" height="56">` : `<span class="initials">${esc(person.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join(''))}</span>`}<div><b>${esc(person)}</b><small>${esc(role)} · ${esc(COMPANY.name)}</small></div></div>
 <div class="reach">${wa ? `<a class="btn light sm" data-duvida="whatsapp" href="https://wa.me/${esc(wa)}?text=${waText}" target="_blank" rel="noopener">${icon('wa')}WhatsApp</a><a class="btn glass sm" data-duvida="chamada" href="tel:+${esc(wa)}">${icon('phone')}Ligar</a>` : `<a class="btn light sm" data-duvida="email" href="mailto:${COMPANY.email}?subject=${encodeURIComponent('Dúvida sobre a proposta ' + number)}">${icon('mail')}Enviar email</a>`}</div>`;

  // 2. Why trust us: only what the company filled in (credentials with their number, real figures).
  const creds = (e.credenciais || []).filter((x: any) => x.nome && x.numero);
  const facts = [e.anos && [e.anos, 'anos de experiência'], e.instalacoes && [e.instalacoes, 'instalações feitas'], e.google?.nota && [e.google.nota.replace('.', ',') + ' ★', 'no Google' + (e.google.total ? ' (' + e.google.total + ' opiniões)' : '')]].filter(Boolean) as string[][];
  const trust = `<section class="card" id="confianca"><h2>Porque escolher a Enat</h2>${e.apresentacao ? `<p class="intro">${esc(e.apresentacao)}</p>` : ''}
 ${facts.length ? `<div class="facts">${facts.map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>` : ''}
 <ul class="creds">${creds.map((x: any) => `<li>${icon('shield')}<span><b>${esc(x.nome)}</b><small>${esc(x.numero)}</small></span></li>`).join('')}<li>${icon('shield')}<span><b>Garantia de ${esc(gEquip)} nos equipamentos</b><small>e ${esc(gInst)} na instalação, por escrito na proposta</small></span></li></ul>
 ${e.equipaFoto ? `<img class="team" src="${img(e.equipaFoto)}" alt="A equipa da Enat" loading="lazy">` : ''}
 ${e.google?.link ? `<a class="link" href="${esc(e.google.link)}" target="_blank" rel="noopener">${icon('star')}Ver as opiniões dos nossos clientes no Google</a>` : ''}</section>`;

  // 2b. Local proof: finished jobs near the client, with the client's consent (type of work, town and month only).
  const near = nearby(works, q.address, q.topics || []);
  const proof = near.items.length ? `<section class="card" id="obras"><h2>${esc(near.title)}</h2><div class="works">${near.items.map((w: any) => `<figure><div class="shots${w.fotos.length > 1 ? ' many' : ''}">${w.fotos.map((f: string) => `<img src="${img(f)}" alt="${esc(w.titulo)} em ${esc(w.local)}" loading="lazy">`).join('')}</div><figcaption><b>${esc(w.titulo)}</b><small>${esc(w.local)}${w.mes ? ' · ' + esc(monthLabel(w.mes)) : ''}</small></figcaption></figure>`).join('')}</div></section>` : '';

  // 3. What the client gains and what is included, before any figure.
  const benefits: string[][] = G.EnatSolucoes.benefits(q.topics);
  const pv = q.pv?.result;
  const pvStats = pv?.production ? `<div class="facts pv">${[[num(pv.production) + ' kWh', 'produção por ano'], pv.savings && [eur(pv.savings).replace(',00', ''), 'poupança por ano'], pv.payback && ['≈ ' + num(pv.payback, 1) + ' anos', 'retorno do investimento']].filter(Boolean).map((x: any) => `<div><b>${esc(x[0])}</b><small>${esc(x[1])}</small></div>`).join('')}</div><p class="fine">Estimativa do estudo feito para a sua morada${pv.source === 'PVGIS' ? ' com dados solares da Comissão Europeia (PVGIS)' : ''}. O valor real depende do consumo e do tempo.</p>` : '';
  const kit = (q.lines || []).filter((l: any) => /Equipamento/.test(l.kind) && clientText(l.description)).slice(0, 6);
  const included: string[] = e.incluido?.length ? e.incluido : [kit.length || (q.lines || []).length ? 'Equipamentos e materiais indicados na proposta' : '', (q.lines || []).some((l: any) => l.kind === 'Mão de obra') ? 'Mão de obra de instalação' : ''].filter(Boolean);
  const value = `<section class="card"><h2>O que vai ganhar</h2>${benefits.length ? `<ul class="benefits">${benefits.map(([t, d]) => `<li><b>${esc(t)}</b><small>${esc(d)}</small></li>`).join('')}</ul>` : ''}${pvStats}
 ${kit.length ? `<h3>O seu equipamento</h3><ul class="kit">${kit.map((l: any) => `<li><span>${esc(clientText(l.description))}</span>${Number(l.quantity ?? 1) !== 1 ? `<em>× ${esc(num(l.quantity, 2))}</em>` : ''}</li>`).join('')}</ul>` : ''}
 ${included.length ? `<h3>Incluído no preço, sem surpresas</h3><ul class="incl">${included.map(t => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>` : ''}</section>`;

  // 4. The price, the payment plan (without bank details) and real availability.
  const price = `<section class="card price" id="preco"><h2>O seu investimento</h2>
 <div class="total"><small>Valor total</small><b>${esc(eur(total))}</b><small>IVA incluído</small></div>
 <ul class="steps"><li><b>50% na adjudicação</b><span>${esc(eur(half))}</span></li><li><b>50% no fim da obra</b><span>${esc(eur(Math.round((total - half) * 100) / 100))}</span></li></ul>
 <p class="muted">${expired ? `A proposta passou a validade a ${esc(day(until))}. Pode responder na mesma e confirmamos consigo os valores.` : `Preço garantido até <b>${esc(day(until))}</b>.`}${weeks.length ? ` Próxima disponibilidade para instalação: <b>${esc(weeks[0])}</b>.` : ''}</p>
 <a class="btn ghost" id="pdf" href="/proposta/${esc(token)}/pdf" target="_blank" rel="noopener">${icon('pdf')}Ver orçamento completo (PDF)</a></section>`;

  const faq = G.EnatSolucoes.faq(e, weeks);
  const faqHtml = faq.length ? `<section class="card"><h2>Perguntas frequentes</h2>${faq.map(([p, r]: string[]) => `<details><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('')}</section>` : '';

  const back = views >= 1 && !answer ? `<div class="welcome" id="welcome"><b>Que bom tê-lo de volta${firstName ? ', ' + esc(firstName) : ''}.</b><span>Já tomou uma decisão? Responda com um toque. Assim não precisamos de o incomodar com chamadas.</span><button type="button" class="btn sm" data-goto="decide">Responder agora</button></div>` : '';

  return `<header class="top"><span class="logo"><img src="/enat-logo.png" alt="${COMPANY.name}" width="131" height="47"></span><span class="tag">Proposta ${esc(number)}</span></header>
<div id="owner" class="owner" hidden>Está a ver esta página num dispositivo da Enat: as aberturas não contam como «Visto» e as respostas estão desativadas. <button type="button" id="as-client">Testar como cliente</button></div>
${back}
<section class="hero">
 <p class="kicker">A sua proposta</p>
 <h1>Olá, ${esc(String(q.client).trim())}</h1>
 <p class="lead">Preparámos esta proposta para <b>${esc(subject(q))}</b>${q.address ? ' em ' + esc(q.address) : ''}. Qualquer dúvida, fale diretamente comigo.</p>
 ${contactCard}
</section>
${trust}
${proof}
${value}
${price}
${list}
<section class="card" id="decide">
 <h2>A sua decisão</h2>
 <p class="muted">Leva 5 segundos e chega diretamente à nossa equipa. Pode mudar a resposta quando quiser.</p>
 ${current}
 <div class="options" role="radiogroup" aria-label="Resposta à proposta">${OPTIONS.map(([k, t, d]) => `<button type="button" class="opt o-${k}" role="radio" aria-checked="false" data-kind="${k}">${icon(k)}<span><b>${t}</b><small>${d}</small></span></button>`).join('')}</div>
 <div id="ask" class="ask" hidden><p class="muted">Escolha como prefere falar connosco:</p><div class="reach">${wa ? `<a class="btn" data-duvida="whatsapp" href="https://wa.me/${esc(wa)}?text=${waText}" target="_blank" rel="noopener">${icon('wa')}WhatsApp</a><a class="btn ghost" data-duvida="chamada" href="tel:+${esc(wa)}">${icon('phone')}Ligar ${esc(tel)}</a>` : ''}<a class="btn ghost" data-duvida="email" href="mailto:${COMPANY.email}?subject=${encodeURIComponent('Dúvida sobre a proposta ' + number)}">${icon('mail')}Email</a></div></div>
 <form id="form">
  <div id="fields" hidden>
  <div id="terms" hidden>${weeks.length ? `<h3>Que semana prefere para a instalação?</h3><div class="chips" role="radiogroup">${[...weeks, 'A combinar'].map((w, i) => `<label class="chip"><input type="radio" name="semana" value="${esc(w)}" ${i ? '' : 'checked'}><span>${esc(w)}</span></label>`).join('')}</div><p class="fine">Confirmamos a data consigo antes de a marcar.</p>` : ''}<h3>Condições da proposta</h3><ul>${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul><label class="check"><input type="checkbox" id="accept"> Li e aceito a proposta ${esc(number)} e as condições acima.</label></div>
  <div id="why" hidden><h3>Qual o motivo?</h3><div class="chips" role="radiogroup">${Object.entries(MOTIVOS).map(([k, [, l]]) => `<label class="chip"><input type="radio" name="motivo" value="${k}"><span>${esc(l)}</span></label>`).join('')}</div></div>
  <label class="field"><span id="note-label">Comentário (opcional)</span><textarea id="note" rows="3" maxlength="2000"></textarea></label>
  </div>
  <p class="error" id="error" role="alert"></p>
  <button class="btn" id="send" type="submit" disabled hidden>Escolha uma opção acima</button>
 </form>
 <div id="thanks" class="thanks" hidden></div>
</section>
${faqHtml}
<footer><span class="logo sm"><img src="/enat-logo.png" alt="" width="84" height="30"></span><p><b>${COMPANY.name}</b><br>${esc(person)}${tel ? ' · <a href="tel:+' + esc(wa) + '">' + esc(tel) + '</a>' : ''} · <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p></footer>
<div class="bar" id="bar"${answer ? ' hidden' : ''}><button type="button" class="btn ghost" data-pick="duvida">Tenho uma dúvida</button><button type="button" class="btn go" data-pick="adjudicar">Quero avançar</button></div>
<div class="sheet" id="sheet" hidden role="dialog" aria-modal="true" aria-labelledby="sheet-t"><div class="sheet-in"><b id="sheet-t">Já viu o orçamento?</b><p class="muted">Diga-nos o que achou. Um toque chega.</p><button type="button" class="btn go" data-pick="adjudicar">Quero avançar</button><button type="button" class="btn ghost" data-pick="duvida">Tenho uma dúvida</button><button type="button" class="btn ghost" data-pick="revisao">Pedir um ajuste</button><button type="button" class="btn ghost" data-pick="nao">Ainda não vou avançar</button><button type="button" class="link" id="sheet-x">Agora não</button></div></div>
<script>
(function(){
 var url=location.pathname.replace(/\\/$/,''),owner=false,kind='',answered=${answer ? 'true' : 'false'},sawPdf=false,asked=false;
 try{owner=!!localStorage.getItem('enat-contas-2')&&!sessionStorage.getItem('enat-as-client')}catch(e){}
 var $=function(id){return document.getElementById(id)},all=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
 var send=function(b){if(owner)return;try{var s=JSON.stringify(b);if(!(navigator.sendBeacon&&navigator.sendBeacon(url,s)))fetch(url,{method:'POST',body:s,keepalive:true})}catch(e){}};
 if(owner){$('owner').hidden=false;$('send').textContent='Respostas desativadas neste dispositivo';all('.opt').forEach(function(b){b.disabled=true})}
 $('as-client').onclick=function(){try{sessionStorage.setItem('enat-as-client','1')}catch(e){}location.reload()};
 send({kind:'visto'});
 all('[data-duvida]').forEach(function(a){a.addEventListener('click',function(){send({kind:'duvida',note:a.dataset.duvida})})});
 // Coming back from the PDF is the moment to ask for an answer.
 $('pdf').addEventListener('click',function(){send({kind:'pdf'});sawPdf=true});
 var offer=function(){if(sawPdf&&!answered&&!asked&&!owner){asked=true;$('sheet').hidden=false;$('bar').hidden=true}};
 document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(offer,400)});
 window.addEventListener('focus',function(){setTimeout(offer,400)});
 var closeSheet=function(){$('sheet').hidden=true;$('bar').hidden=answered};
 $('sheet-x').onclick=closeSheet;$('sheet').onclick=function(e){if(e.target===$('sheet'))closeSheet()};
 // The bar stays out of the way while the decision itself is on screen.
 if('IntersectionObserver' in window)new IntersectionObserver(function(en){$('bar').classList.toggle('away',en[0].isIntersecting)}).observe($('decide'));
 all('[data-goto]').forEach(function(b){b.onclick=function(){$('decide').scrollIntoView({behavior:'smooth'})}});
 var LABELS={adjudicar:['Comentário (opcional)','Confirmar: quero avançar','Ex.: prefiro de manhã'],revisao:['O que gostaria de alterar?','Pedir ajuste','Ex.: trocar para 2 splits, outra marca…'],nao:['Comentário (opcional)','Enviar resposta','Ex.: decido até ao fim do mês']};
 var choose=function(k){
  kind=k;all('.opt').forEach(function(x){x.setAttribute('aria-checked',String(x.dataset.kind===k))});
  $('error').textContent='';$('thanks').hidden=true;$('ask').hidden=k!=='duvida';
  if(k==='duvida'){$('fields').hidden=true;$('send').hidden=true;$('ask').scrollIntoView({behavior:'smooth',block:'nearest'});return}
  var l=LABELS[k];$('fields').hidden=false;$('send').hidden=false;$('send').disabled=false;$('terms').hidden=k!=='adjudicar';$('why').hidden=k!=='nao';
  $('note-label').textContent=l[0];$('send').textContent=l[1];$('note').placeholder=l[2];$('note').required=k==='revisao';
  $('send').className='btn'+(k==='adjudicar'?' go':'');$('fields').scrollIntoView({behavior:'smooth',block:'start'});
 };
 all('.opt').forEach(function(b){b.onclick=function(){choose(b.dataset.kind)}});
 all('[data-pick]').forEach(function(b){b.onclick=function(){$('sheet').hidden=true;choose(b.dataset.pick)}});
 var picked=function(n){var x=document.querySelector('input[name="'+n+'"]:checked');return x?x.value:''};
 var safe=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
 $('form').onsubmit=function(e){
  e.preventDefault();if(!kind||owner||kind==='duvida')return;
  if(kind==='adjudicar'&&!$('accept').checked){$('error').textContent='Confirme que aceita as condições para avançar.';return}
  var note=$('note').value.trim(),motivo=picked('motivo');
  if(kind==='revisao'&&!note){$('error').textContent='Diga-nos o que gostaria de alterar.';return}
  if(kind==='nao'&&!motivo){$('error').textContent='Escolha o motivo. É só um toque.';return}
  if(kind==='nao'&&motivo==='outro'&&!note){$('error').textContent='Escreva o motivo no comentário.';return}
  var label=$('send').textContent;$('send').disabled=true;$('send').textContent='A enviar…';
  fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:kind,note:note,motivo:motivo,semana:picked('semana')})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j.error||'');return j})}).then(function(j){
   var T={adjudicar:'<b>Obrigado pela confiança!</b> Vamos ligar-lhe para confirmar a data da instalação.',revisao:'<b>Pedido recebido.</b> Vamos rever a proposta e enviamos-lhe uma nova versão.',pensar:'<b>Obrigado pela resposta.</b> Fica registado. Se tiver alguma dúvida, fale connosco: estamos aqui para ajudar.',mais_tarde:'<b>Fica registado.</b> Quando for altura, fale connosco e atualizamos a proposta.',rejeitar:'<b>Obrigado por nos dizer.</b> A sua resposta ajuda-nos a melhorar. Se mudar de ideias, pode voltar a esta página.'};
   answered=true;$('bar').hidden=true;var w=$('welcome');if(w)w.hidden=true;
   $('fields').hidden=true;$('send').hidden=true;$('thanks').hidden=false;$('thanks').innerHTML=T[j.kind]+(j.pay||'')+'<small>Pode mudar a sua resposta a qualquer momento nesta página.</small>';
   var c=$('current');c.className='answer a-'+j.kind;c.innerHTML='<span class="dot"></span><div><b>A sua resposta: '+safe(j.label)+'</b><small>Agora mesmo'+(j.note?' · «'+safe(j.note)+'»':'')+'</small></div>';
   all('.opt').forEach(function(x){x.setAttribute('aria-checked','false')});kind='';$('note').value='';$('accept').checked=false;
   $('thanks').scrollIntoView({behavior:'smooth',block:'center'});
  }).catch(function(err){$('error').textContent=err.message||'Não foi possível enviar. Verifique a ligação e tente novamente.';$('send').textContent=label}).finally(function(){$('send').disabled=!kind;if(!kind)$('send').textContent='Escolha uma opção acima'});
 };
})();
</script>`;
}

function page(title: string, content: string) {
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title><link rel="icon" href="/favicon-32x32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
#nl-badge-frame,[id^="nl-badge"]{display:none!important}
:root{--bg:#f2f2f7;--card:#fff;--ink:#0b0d12;--mute:#6b7080;--line:#e6e7ec;--chip:#ececf1;--blue:#0666eb;--green:#13a05a;--red:#e5484d;--sun:#e8a317;--hero1:#0a0f1f;--hero2:#16307a;--tint:#f5f8ff;--warn:#fff6e0;--warnb:#f3d48a;--warnt:#6b4c00;--okbg:#eefaf3;--okb:#bfe6cf;--shadow:0 1px 2px rgba(10,15,31,.05),0 8px 24px rgba(10,15,31,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#16171b;--ink:#f5f6f8;--mute:#8d93a1;--line:#26282e;--chip:#26282e;--blue:#3d8bff;--green:#35c97f;--red:#ff6b70;--hero1:#10162b;--hero2:#1e3f9e;--tint:#1b2233;--warn:#2a2210;--warnb:#4d3c12;--warnt:#f3d48a;--okbg:#10231a;--okb:#1d4a33;--shadow:none;color-scheme:dark}}
[hidden]{display:none!important}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0 auto;background:var(--bg);color:var(--ink);font:400 16px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;padding:0 16px calc(110px + env(safe-area-inset-bottom,0px));max-width:600px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(16px + env(safe-area-inset-top,0px)) 2px 16px}
.logo{display:inline-flex;align-items:center;background:#fff;border-radius:16px;padding:7px 12px;box-shadow:0 0 0 .5px rgba(10,15,31,.06),0 4px 14px rgba(10,15,31,.08)}.logo img{display:block;height:34px;width:auto;border-radius:8px}
.logo.sm{border-radius:11px;padding:5px 8px;box-shadow:0 0 0 .5px rgba(10,15,31,.06)}.logo.sm img{height:22px;border-radius:5px}
.tag{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--mute);background:var(--chip);padding:6px 11px;border-radius:20px;white-space:nowrap;font-variant-numeric:tabular-nums}
.owner{background:var(--warn);border:1px solid var(--warnb);color:var(--warnt);border-radius:14px;padding:10px 12px;font-size:14px;margin-bottom:12px}.owner button{background:none;border:0;color:var(--blue);font:inherit;font-weight:600;padding:0;cursor:pointer;text-decoration:underline}
.welcome{display:flex;flex-direction:column;gap:4px;background:var(--tint);border:1.5px solid color-mix(in srgb,var(--blue) 30%,var(--line));border-radius:18px;padding:14px;margin-bottom:12px;font-size:14.5px}.welcome .btn{margin-top:8px}
.hero{background:linear-gradient(150deg,var(--hero1) 0%,var(--hero2) 100%);color:#fff;border-radius:26px;padding:24px 22px 22px;position:relative;overflow:hidden;box-shadow:0 14px 34px rgba(10,15,31,.22);isolation:isolate}
.hero::before{content:"";position:absolute;z-index:-1;left:-40%;bottom:-70%;width:120%;height:120%;border-radius:50%;background:radial-gradient(circle,rgba(61,139,255,.35),rgba(61,139,255,0) 65%)}
.hero::after{content:"";position:absolute;z-index:-1;right:-70px;top:-70px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(232,163,23,.45),rgba(232,163,23,0) 68%)}
.kicker{display:inline-block;margin:0;font-size:12px;font-weight:600;letter-spacing:.04em;color:#fff;background:rgba(255,255,255,.12);padding:4px 10px;border-radius:20px}
.hero h1{margin:12px 0 6px;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em}.lead{margin:0 0 18px;color:rgba(255,255,255,.78);font-size:15px}.lead b{color:#fff;font-weight:600}
.person{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:12px}.person img,.initials{width:56px;height:56px;border-radius:50%;object-fit:cover;flex:none;background:rgba(255,255,255,.16)}
.initials{display:grid;place-items:center;font-weight:700;font-size:19px}.person b{display:block;font-size:16.5px}.person small{color:rgba(255,255,255,.68);font-size:13px}
.reach{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.reach .btn{flex:1 1 140px}
.total{background:var(--tint);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;margin:12px 0}
.total small{color:var(--mute);font-size:13px}.total b{font-size:36px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:16px;padding:15px 16px;font:inherit;font-size:17px;font-weight:600;text-decoration:none;cursor:pointer;background:var(--blue);color:#fff;transition:transform .12s,opacity .15s;-webkit-tap-highlight-color:transparent}.btn:active{transform:scale(.98)}
.btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.btn.sm{padding:11px 14px;font-size:15.5px;border-radius:14px}
.btn.light{background:#fff;color:#0b0d12}.btn.glass{background:rgba(255,255,255,.14);color:#fff}.btn.ghost{background:var(--chip);color:var(--ink)}.btn.go{background:var(--green)}.btn:disabled{opacity:.6;cursor:default}
.card{background:var(--card);border-radius:22px;padding:20px;margin-top:14px;box-shadow:var(--shadow)}
.card h1{margin:0 0 6px;font-size:22px;letter-spacing:-.01em}.card h2{margin:0 0 10px;font-size:20px;font-weight:700;letter-spacing:-.01em}.card h3{margin:18px 0 8px;font-size:16px}.muted{color:var(--mute);margin:0 0 16px;font-size:14.5px}.fine{color:var(--mute);font-size:12.5px;margin:6px 0 0}
.intro{margin:0 0 14px;font-size:15px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:0 0 14px}.facts div{background:var(--tint);border-radius:14px;padding:10px 12px}.facts b{display:block;font-size:20px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}.facts small{color:var(--mute);font-size:12.5px}.facts.pv{margin:14px 0 0}
ul.creds,ul.benefits,ul.incl,ul.kit,ul.steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.creds li{display:flex;gap:10px;align-items:flex-start}.creds svg,.incl svg{flex:none;width:22px;height:22px;fill:none;stroke:var(--green);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.creds b,.benefits b{display:block;font-size:15px;font-weight:600}.creds small,.benefits small{display:block;color:var(--mute);font-size:13.5px}
.benefits li{padding-left:14px;border-left:3px solid var(--blue)}
.incl li{display:flex;gap:10px;align-items:center;font-size:15px}
.kit li{display:flex;justify-content:space-between;gap:10px;font-size:14.5px;padding-bottom:8px;border-bottom:1px solid var(--line)}.kit em{font-style:normal;color:var(--mute);white-space:nowrap}
.steps li{display:flex;justify-content:space-between;gap:10px;font-size:15px}.steps span{font-variant-numeric:tabular-nums}.price .muted{margin:14px 0}
.team{display:block;width:100%;border-radius:16px;margin-top:14px;aspect-ratio:16/10;object-fit:cover}
.works{display:grid;gap:16px}.works figure{margin:0}.shots{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:14px;scrollbar-width:none}.shots::-webkit-scrollbar{display:none}.shots img{flex:0 0 100%;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;scroll-snap-align:start}.shots.many img{flex-basis:85%;width:85%}.works figcaption{padding:8px 2px 0}.works figcaption b{display:block;font-size:15px;font-weight:600}.works figcaption small{color:var(--mute);font-size:13.5px}
.link{display:inline-flex;align-items:center;gap:6px;margin-top:14px;color:var(--blue);font-weight:600;font-size:15px;text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}.link svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2}
.options{display:grid;gap:8px}
.opt{display:flex;align-items:center;gap:14px;text-align:left;width:100%;background:var(--card);border:1.5px solid var(--line);border-radius:18px;padding:12px 14px;font:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s,transform .12s;-webkit-tap-highlight-color:transparent}.opt:active{transform:scale(.99)}
.opt svg{flex:none;width:42px;height:42px;padding:10px;border-radius:50%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;background:var(--chip);color:var(--blue)}
.opt b{display:block;font-size:16px;font-weight:600}.opt small{display:block;color:var(--mute);font-size:13.5px}
.opt:hover{border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}.opt[aria-checked=true]{border-color:var(--blue);background:var(--tint);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}
.o-adjudicar{border-color:color-mix(in srgb,var(--green) 45%,var(--line));padding:16px 14px}.o-adjudicar b{font-size:17.5px}.o-adjudicar svg{background:var(--green);color:#fff}.o-adjudicar[aria-checked=true]{border-color:var(--green);background:var(--okbg);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 14%,transparent)}
.o-nao svg{color:var(--mute)}.opt:disabled{opacity:.55;cursor:default}
.ask{margin-top:12px;border-top:1px solid var(--line);padding-top:14px}.ask .reach{flex-direction:column}
form{margin-top:16px}#fields{border-top:1px solid var(--line);padding-top:6px}form ul{margin:0 0 10px;padding-left:20px;font-size:14.5px}form li{margin:3px 0}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip input{position:absolute;opacity:0;pointer-events:none}.chip span{display:inline-block;padding:9px 13px;border-radius:20px;border:1.5px solid var(--line);font-size:14.5px;cursor:pointer}.chip input:checked+span{border-color:var(--blue);background:var(--tint);font-weight:600}.chip input:focus-visible+span{outline:2px solid var(--blue);outline-offset:2px}
.check{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;font-weight:600;margin:4px 0 14px}.check input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--green)}
.field{display:block;margin-top:14px}.field span{display:block;font-size:14px;font-weight:600;margin-bottom:6px}textarea{width:100%;border:1.5px solid var(--line);border-radius:14px;padding:11px 13px;font:inherit;resize:vertical;background:var(--card);color:var(--ink)}textarea:focus{outline:none;border-color:var(--blue)}
.error{color:var(--red);font-size:14px;min-height:1px;margin:8px 0}
.answer{display:flex;gap:12px;align-items:flex-start;background:var(--tint);border-radius:16px;padding:12px 14px;margin:0 0 14px}.answer:empty{display:none}.answer small{display:block;color:var(--mute);font-size:13.5px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:7px;background:var(--blue)}.a-adjudicar .dot{background:var(--green)}.a-rejeitar .dot{background:var(--red)}.a-revisao .dot,.a-pensar .dot,.a-mais_tarde .dot{background:var(--sun)}
.thanks{margin-top:16px;background:var(--okbg);border:1px solid var(--okb);border-radius:16px;padding:14px;font-size:15px}.thanks small{display:block;color:var(--mute);margin-top:6px}
.pay{display:flex;flex-direction:column;gap:2px;margin-top:10px;padding:12px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:14px}.iban{font-variant-numeric:tabular-nums;user-select:all}
.other{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:12px 14px;margin-top:8px;text-decoration:none;color:var(--ink)}.other small{display:block;color:var(--mute);font-size:13.5px}.other em{font-style:normal;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
details{border-top:1px solid var(--line);padding:12px 0}details:first-of-type{border-top:0}summary{cursor:pointer;font-weight:600;font-size:15px}details p{margin:8px 0 0;color:var(--mute);font-size:14.5px}
footer{display:flex;gap:12px;align-items:center;margin:28px 4px 0;color:var(--mute);font-size:13px}footer p{margin:0}footer b{color:var(--ink);font-weight:600}footer a{color:var(--blue)}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--bg) 82%,transparent);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-top:1px solid var(--line);transition:transform .2s}
.bar .btn{padding:13px 10px;font-size:16px}.bar .go{flex:1.3}.bar.away{transform:translateY(110%)}
@media (min-width:640px){.bar{left:50%;right:auto;width:600px;transform:translateX(-50%);border-radius:20px 20px 0 0;border:1px solid var(--line)}.bar.away{transform:translate(-50%,110%)}}
.sheet{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}.sheet[hidden]{display:none}
.sheet-in{background:var(--card);width:100%;max-width:600px;border-radius:24px 24px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:8px;animation:up .25s ease-out}.sheet-in>b{font-size:20px}.sheet-in .muted{margin:0 0 6px}.sheet-in .link{justify-content:center;margin:6px 0 0}
@keyframes up{from{transform:translateY(30%);opacity:0}}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.sheet-in{animation:none}.bar{transition:none}}
@media (min-width:560px){.hero{padding:30px 30px 26px}.hero h1{font-size:32px}.card{padding:24px}}
</style></head><body>${content}</body></html>`;
}
