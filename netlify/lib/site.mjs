// Ligação entre o site público da Enat Ponte de Lima e a app.
// - POST /site-api/lead: o formulário «Pedir orçamento» do site cria uma lead nova na app (pasta Leads novas),
//   com aviso no telemóvel, e devolve o link do questionário para o cliente responder logo;
// - GET /site-api/obras: obras concluídas com fotos autorizadas pelo cliente e os dados públicos da empresa;
// - GET /site-api/img/<id>: as fotos dessas obras.
// Só aceita pedidos vindos do site (CORS) e tem proteção contra spam (campo escondido, tempo mínimo, limite por IP).
import { randomBytes } from 'node:crypto';
import { getPortfolio, shown, monthLabel } from './portfolio.mjs';

export const SITE_INBOX = 'leads-site';
const KEEP = 60 * 864e5;
const ORIGINS = () => String(process.env.SITE_ORIGINS || 'https://enat-pontedelima.netlify.app,https://enat-pontedelima.pt,https://www.enat-pontedelima.pt').split(',').map((s) => s.trim()).filter(Boolean);
const allowed = (origin) => ORIGINS().includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
const cors = (req) => { const o = req.headers.get('origin') || ''; return allowed(o) ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' } : {}; };
const json = (req, status, body) => Response.json(body, { status, headers: { ...cors(req), 'cache-control': 'no-store' } });
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const nameCase = (s) => s.split(/\s+/).map((w, i) => (i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const lisbonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);

// Serviços do formulário do site → soluções das leads da app.
export const SERVICES = {
  'Ar condicionado': 'Ar condicionado', 'Bomba de calor (AQS)': 'Bomba de calor AQS', 'Bomba de calor (climatização)': 'Bomba de calor climatização',
  'Piso radiante': 'Piso radiante', 'Painéis fotovoltaicos': 'Painéis fotovoltaicos', 'Painéis solares térmicos': 'Painéis solares térmicos',
  'Ventilação (VMC)': 'VMC', 'Carregador de carro elétrico': 'Carregador automóvel', 'Manutenção ou assistência': '',
};

// De onde veio a visita ao site: anúncio do Google, pesquisa no Google, Facebook/Instagram, outro site ou direto.
export function viaOf(o) {
  const x = o && typeof o === 'object' ? o : {}, s = (k) => str(x[k], 120).toLowerCase();
  const src = s('utm_source'), med = s('utm_medium'), ref = s('ref');
  if (s('gclid') || s('gbraid') || s('wbraid') || (/google/.test(src) && /cpc|ppc|paid|ads/.test(med))) return 'Google Ads';
  if (s('fbclid') || /facebook|instagram|^fb$|^ig$|meta/.test(src) || /facebook|instagram/.test(ref)) return 'Facebook / Instagram';
  if (/google\./.test(ref) || /google/.test(src)) return 'Pesquisa no Google';
  if (/bing|duckduckgo|yahoo|ecosia/.test(ref)) return 'Pesquisa na internet';
  if (src) return src.slice(0, 40);
  if (ref) return ref.replace(/^www\./, '').slice(0, 60);
  return 'Direto';
}

export function cleanSiteLead(b, now = new Date()) {
  const o = b && typeof b === 'object' ? b : {};
  const name = nameCase(str(o.nome, 120)), contact = str(o.telefone, 40).replace(/[^\d+ ]/g, ''), email = str(o.email, 160).toLowerCase();
  const services = (Array.isArray(o.servicos) ? o.servicos : []).filter((s) => s in SERVICES).slice(0, 9);
  if (!name || name.length < 2) return { error: 'Indique o seu nome.' };
  if (!/\d{9}/.test(contact.replace(/\D/g, '')) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Indique um telemóvel ou um email para o contactarmos.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'O email não parece correto.' };
  if (!services.length) return { error: 'Escolha pelo menos um serviço.' };
  const local = str(o.localidade, 120), msg = str(o.mensagem, 1500);
  const solutions = [...new Set(services.map((s) => SERVICES[s]).filter(Boolean))];
  return {
    lead: {
      id: 'site-' + randomBytes(6).toString('hex'), src: 'site', via: viaOf(o.origem), ...(str(o.origem?.utm_campaign, 80) ? { campanha: str(o.origem.utm_campaign, 80) } : {}), received: now.toISOString(),
      name, address: local, contact, email, coords: '', rooms: '', bill: '', area: '',
      notes: ['Pedido pelo site: ' + services.join(', '), msg].filter(Boolean).join('\n'),
      value: '', brand: '', timing: '', heating: '', stage: 'nova', solutions, call: '', house: '', date: lisbonDay(now),
    },
  };
}

// Leads do site guardadas à parte das leads do email (cada uma é escrita por um processo diferente).
export async function siteInbox(store) { return ((await store.get(SITE_INBOX, { type: 'json' }).catch(() => null)) || {}).leads || []; }

export async function handleSite(req, path, store) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  const origin = req.headers.get('origin') || '';
  if (path === 'lead' && req.method === 'POST') {
    if (!allowed(origin)) return json(req, 403, { error: 'Pedido não autorizado.' });
    let b; try { b = JSON.parse((await req.text()).slice(0, 8000)); } catch { return json(req, 400, { error: 'Dados inválidos.' }); }
    // Spam: campo escondido preenchido ou formulário enviado em menos de 3 segundos.
    if (b?.website || (Number(b?.t) && Date.now() - Number(b.t) < 3000)) return json(req, 200, { ok: true });
    const ip = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const rate = (await store.get('site-rate', { type: 'json' }).catch(() => null)) || {}, now = Date.now();
    for (const k of Object.keys(rate)) rate[k] = rate[k].filter((t) => now - t < 3600e3);
    if (ip && (rate[ip] || []).length >= 5) return json(req, 429, { error: 'Recebemos vários pedidos seguidos. Ligue-nos para o 938 928 495.' });
    const r = cleanSiteLead(b);
    if (r.error) return json(req, 400, { error: r.error });
    if (ip) { rate[ip] = [...(rate[ip] || []), now]; await store.setJSON('site-rate', rate); }
    const box = (await store.get(SITE_INBOX, { type: 'json' }).catch(() => null)) || { leads: [] };
    await store.setJSON(SITE_INBOX, { leads: [...box.leads.filter((l) => now - Date.parse(l.received) < KEEP), r.lead] });
    // Questionário logo a seguir: o cliente pode responder já no site; o link conta como enviado (não vai outra vez por email).
    let pedido = '';
    try {
      const { createLink, markSent } = await import('./pedido.mjs');
      const { token } = await createLink(store, r.lead.id, r.lead.name, r.lead.solutions);
      await markSent(store, r.lead.id, token, now);
      pedido = (String(process.env.LINK_URL || '').replace(/\/+$/, '') || new URL(req.url).origin) + '/pedido/' + token;
    } catch (e) { console.error('site pedido', e?.message); }
    try {
      const { sendPush } = await import('./push.mjs');
      await sendPush(store, { title: 'Nova lead do site: ' + r.lead.name, body: [r.lead.solutions.join(', ') || 'Assistência', r.lead.contact, r.lead.address].filter(Boolean).join(' · '), tag: 'newlead-' + r.lead.id, data: { lead: r.lead.id } });
      const sent = (await store.get('push-enviados', { type: 'json' }).catch(() => null)) || {};
      await store.setJSON('push-enviados', { ...sent, ['lead|' + r.lead.id]: now });
    } catch (e) { console.error('site push', e?.message); }
    return json(req, 200, { ok: true, pedido });
  }
  if (path === 'obras' && req.method === 'GET') {
    const [works, e] = await Promise.all([getPortfolio(store), store.get('empresa', { type: 'json' }).catch(() => null)]);
    const base = new URL(req.url).origin + '/site-api/img/';
    const obras = shown(works).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 24).map((w) => ({ titulo: w.titulo, tipo: w.tipo, local: w.local, mes: monthLabel(w.mes), descricao: w.descricao, fotos: w.fotos.map((f) => base + f) }));
    const g = e?.google || {};
    return new Response(JSON.stringify({ obras, google: g.nota ? { nota: g.nota, total: g.total || '', link: g.link || '' } : null }), { headers: { 'content-type': 'application/json', ...cors(req), 'cache-control': 'public, max-age=300' } });
  }
  const m = path.match(/^img\/([a-z0-9]{8,40})$/);
  if (m && req.method === 'GET') {
    const { servePublicImage } = await import('./empresa.mjs');
    return servePublicImage(m[1], store);
  }
  return json(req, 404, { error: 'Não encontrado.' });
}
