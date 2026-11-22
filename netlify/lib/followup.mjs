// Seguimento das propostas sem resposta: avisa no telemóvel para contactar o cliente no momento certo.
// - enviada há 2 dias e ainda não aberta → confirmar se recebeu o link;
// - aberta há 2 dias sem resposta → primeiro contacto; aberta há 5 dias → segundo contacto.
// Cada aviso é enviado uma vez por proposta, das 9h às 21h (hora de Lisboa), e deixa de ser enviado ao fim de 14 dias.
import { sendPush, TZ } from './push.mjs';

const H = 3600e3, D = 24 * H;
const ANSWERS = ['adjudicar', 'revisao', 'pensar', 'mais_tarde', 'rejeitar', 'trocou'];
const number = (q) => 'ORC ' + (String(q.date || '').slice(0, 4) || '') + '/' + String(q.id).padStart(4, '0');
const days = (ms) => Math.floor(ms / D);

// rows: [{id, client, date}], events: [{quoteId, kind, at}] ordenados por data.
export function followups(rows, events, now = Date.now()) {
  const by = new Map();
  for (const e of events) { if (!by.has(e.quoteId)) by.set(e.quoteId, []); by.get(e.quoteId).push(e); }
  const out = [];
  for (const q of rows) {
    const ev = by.get(q.id) || [];
    const sent = ev.filter((e) => e.kind === 'enviado').at(-1);
    if (!sent) continue;
    const t0 = new Date(sent.at).getTime(), after = ev.filter((e) => new Date(e.at).getTime() >= t0);
    if (after.some((e) => ANSWERS.includes(e.kind)) || now - t0 > 14 * D) continue;
    const seen = after.find((e) => e.kind === 'visto'), who = String(q.client || '').trim() || 'Cliente', n = number(q);
    const base = { quote: q.id, tag: 'seguimento-' + q.id };
    if (!seen) {
      if (now - t0 >= 2 * D) out.push({ ...base, key: 'naoabriu|' + q.id + '|' + t0, title: who + ' ainda não abriu a proposta', body: n + ' · enviada há ' + days(now - t0) + ' dias. Confirme se recebeu o link (às vezes fica perdido no WhatsApp).' });
      continue;
    }
    const t1 = new Date(seen.at).getTime(), asked = after.some((e) => e.kind === 'duvida');
    if (now - t1 >= 5 * D) out.push({ ...base, key: 'visto5|' + q.id + '|' + t0, title: 'Segundo contacto: ' + who, body: n + ' · viu a proposta há ' + days(now - t1) + ' dias e não respondeu. Pergunte se ficou alguma dúvida ou se quer ajustar alguma coisa.' });
    else if (now - t1 >= 2 * D) out.push({ ...base, key: 'visto2|' + q.id + '|' + t0, title: 'Fazer seguimento: ' + who, body: n + ' · viu a proposta há ' + days(now - t1) + ' dias' + (asked ? ' e tocou em «Tenho uma dúvida»' : '') + '. Ligue ou envie uma mensagem: é o melhor momento.' });
  }
  return out;
}

const lisbonHour = (now) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));

// Chamado pela função agendada; consulta a base de dados no máximo a cada 15 minutos.
export async function runQuoteFollowups(store, now = Date.now()) {
  const h = lisbonHour(now);
  if (h < 9 || h >= 21) return { skipped: 'night' };
  const last = await store.get('seguimento-ultimo', { type: 'json' });
  if (last && now - last.t < 15 * 60e3) return { skipped: 'recent' };
  await store.setJSON('seguimento-ultimo', { t: now });
  if (!((await store.get('push-subs', { type: 'json' })) || []).length) return { sent: 0 };
  const { db } = await import('../../db/index.js');
  const { quotes, quoteEvents } = await import('../../db/schema.js');
  const { gte, sql } = await import('drizzle-orm');
  const [rows, events] = await Promise.all([
    db.select({ id: quotes.id, client: sql`${quotes.document}->>'client'`, date: sql`${quotes.document}->>'date'` }).from(quotes).where(gte(quotes.updatedAt, new Date(now - 30 * D))),
    db.select({ quoteId: quoteEvents.quoteId, kind: quoteEvents.kind, at: quoteEvents.createdAt }).from(quoteEvents).where(gte(quoteEvents.createdAt, new Date(now - 30 * D))).orderBy(quoteEvents.id),
  ]);
  const sent = (await store.get('seguimento-enviados', { type: 'json' })) || {};
  const due = followups(rows, events, now).filter((a) => !sent[a.key]);
  if (!due.length) return { sent: 0 };
  for (const a of due) sent[a.key] = now;
  for (const k of Object.keys(sent)) if (now - sent[k] > 30 * D) delete sent[k];
  await store.setJSON('seguimento-enviados', sent);
  for (const a of due) await sendPush(store, { title: a.title, body: a.body, tag: a.tag, data: { quote: a.quote } });
  return { sent: due.length };
}
