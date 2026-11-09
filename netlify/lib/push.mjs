// Notificações push: chegam ao telemóvel (ou computador) mesmo com a app fechada.
// As chaves VAPID são criadas uma vez e ficam nos Blobs; cada dispositivo que ativa os avisos guarda aqui a sua subscrição.
// A função agendada push-avisos.mjs verifica, a cada minuto, as chamadas em hora, as visitas e as leads novas.
import webpush from 'web-push';

const json = (status, body) => new Response(body == null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const SUBS = 'push-subs', SENT = 'push-enviados';
export const TZ = 'Europe/Lisbon';

export async function vapid(store) {
  let k = await store.get('push-vapid', { type: 'json' });
  if (!k?.publicKey) { k = webpush.generateVAPIDKeys(); await store.setJSON('push-vapid', k); }
  return k;
}
const subs = async (store) => (await store.get(SUBS, { type: 'json' })) || [];

// Envia a todos os dispositivos subscritos. As subscrições que o navegador deu como terminadas são removidas.
export async function sendPush(store, payload) {
  const list = await subs(store);
  if (!list.length) return 0;
  const k = await vapid(store);
  webpush.setVapidDetails('mailto:pontedelima@enat.pt', k.publicKey, k.privateKey);
  const gone = new Set();
  let ok = 0;
  await Promise.all(list.map(async (s) => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' }); ok++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) gone.add(s.sub.endpoint); else console.error('push', e?.statusCode || e?.message); }
  }));
  if (gone.size) await store.setJSON(SUBS, (await subs(store)).filter((s) => !gone.has(s.sub.endpoint)));
  return ok;
}

// «2026-11-09T14:30» na hora de Lisboa → milissegundos (tem em conta a hora de verão).
export function localMs(v, tz = TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(v || ''));
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  const off = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(t).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = utc - off(utc);
  t = utc - off(t);
  return t;
}
const name = (l) => String(l?.name || '').trim() || 'Lead sem nome';
const when = (ms) => new Date(ms).toLocaleString('pt-PT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Avisos devidos agora: chamadas «Não atendeu» com hora marcada, visitas daqui a 30 minutos e leads novas do email.
export function dueAlerts(state, inbox, now = Date.now()) {
  const out = [], del = state?.del || {};
  for (const l of state?.leads || []) {
    if (l.call === 'nao' && l.callAt && l.callDone !== l.callAt) {
      const t = localMs(l.callAt);
      if (t <= now && now - t < 12 * 3600e3) out.push({ key: 'call|' + l.id + '|' + l.callAt, title: 'Ligar a ' + name(l), body: (l.contact ? l.contact + ' · ' : '') + 'O cliente pediu contacto a esta hora.', tag: 'lead-' + l.id, lead: l.id });
    }
    if (l.visitAt && l.stage !== 'perdido') {
      const t = localMs(l.visitAt);
      if (t - now <= 30 * 60e3 && t - now > -30 * 60e3) out.push({ key: 'visit|' + l.id + '|' + l.visitAt, title: 'Visita: ' + name(l), body: when(t) + (l.address ? ' · ' + l.address : ''), tag: 'visit-' + l.id, lead: l.id });
    }
  }
  for (const l of inbox || []) {
    if (!l?.id || del['leads:' + l.id]) continue;
    if (now - (Date.parse(l.received) || 0) > 2 * 3600e3) continue;
    out.push({ key: 'lead|' + l.id, title: 'Nova lead: ' + name(l), body: [l.contact, l.heating, l.timing].filter(Boolean).join(' · ') || 'Sincronizada do Outlook', tag: 'newlead-' + l.id, lead: l.id });
  }
  return out;
}

// Chamado a cada minuto: envia cada aviso uma única vez.
export async function runAlerts(store, now = Date.now()) {
  if (!(await subs(store)).length) return { sent: 0 };
  const [state, meta, sent] = await Promise.all([
    store.get('estado', { type: 'json' }),
    store.get('leads-meta', { type: 'json' }).catch(() => null),
    store.get(SENT, { type: 'json' }).then((x) => x || {}),
  ]);
  const due = dueAlerts(state, meta?.leads, now).filter((a) => !sent[a.key]);
  if (!due.length) return { sent: 0 };
  for (const a of due) sent[a.key] = now;
  for (const k of Object.keys(sent)) if (now - sent[k] > 30 * 864e5) delete sent[k];
  await store.setJSON(SENT, sent);
  for (const a of due) await sendPush(store, { title: a.title, body: a.body, tag: a.tag, data: { lead: a.lead } });
  return { sent: due.length };
}

// Pedidos da app: chave pública, ativar / desativar este dispositivo e enviar um teste.
export async function handlePush(req, path, store) {
  let b = {};
  if (req.method === 'POST') { try { b = await req.json(); } catch {} }
  if (path === 'push/chave') return json(200, { key: (await vapid(store)).publicKey });
  if (path === 'push/subscrever' && req.method === 'POST') {
    const sub = b?.sub;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json(400, { error: 'Subscrição inválida' });
    const list = (await subs(store)).filter((s) => s.sub.endpoint !== sub.endpoint);
    list.push({ sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, device: String(b.device || '').slice(0, 200), at: Date.now() });
    await store.setJSON(SUBS, list.slice(-20));
    return json(200, { ok: true });
  }
  if (path === 'push/remover' && req.method === 'POST') {
    await store.setJSON(SUBS, (await subs(store)).filter((s) => s.sub.endpoint !== b?.endpoint));
    return json(200, { ok: true });
  }
  if (path === 'push/teste' && req.method === 'POST') {
    const n = await sendPush(store, { title: 'Enat app', body: 'Notificações ativas. Vai receber os avisos mesmo com a app fechada.', tag: 'teste' });
    return json(200, { sent: n });
  }
  return json(404);
}
