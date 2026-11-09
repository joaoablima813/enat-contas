// Ligação ao TOC Online: emite a fatura (FT) finalizada a partir do orçamento da obra e envia-a ao cliente por email.
// Credenciais da API (TOC Online › Empresa › Configurações › Dados API): TOC_CLIENT_ID, TOC_CLIENT_SECRET, TOC_OAUTH_URL e TOC_API_URL.
import { db } from '../../db/index.js';
import { quotes } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import '../../public/quote-math.js';
import '../../public/toc-invoice.js';

type Store = { get: (k: string, o?: any) => Promise<any>; setJSON: (k: string, v: any) => Promise<any>; delete: (k: string) => Promise<any> };
const Toc = (globalThis as any).EnatToc;
const fail = (status: number, error: string) => Response.json({ error }, { status });
const REDIRECT = 'https://oauth.pstmn.io/v1/callback';

class TocError extends Error { status: number; constructor(message: string, status = 502) { super(message); this.status = status; } }

function cfg() {
  const e = process.env, clean = (u = '') => u.trim().replace(/\/+$/, '');
  const c = {
    id: (e.TOC_CLIENT_ID || '').trim(), secret: (e.TOC_CLIENT_SECRET || '').trim(),
    oauth: clean(e.TOC_OAUTH_URL).replace(/\/(auth|token)$/, ''),
    // Os caminhos da API já começam por /api; aceita o endereço com ou sem /api no fim.
    api: clean(e.TOC_API_URL).replace(/\/api(\/v1)?$/, ''),
    redirect: (e.TOC_REDIRECT_URI || REDIRECT).trim(),
  };
  return c.id && c.secret && /^https:\/\//.test(c.oauth) && /^https:\/\//.test(c.api) ? c : null;
}

// Texto do erro devolvido pelo TOC Online (JSON:API ou simples), sem dados sensíveis.
async function errorText(r: Response) {
  const t = await r.text().catch(() => '');
  try {
    const j = JSON.parse(t);
    const list = Array.isArray(j?.errors) ? j.errors.map((e: any) => [e.title, e.detail].filter(Boolean).join(': ')).filter(Boolean) : [];
    return (list.join(' · ') || j?.error_description || j?.error || j?.message || '').toString().slice(0, 400);
  } catch { return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); }
}

async function tokenRequest(c: NonNullable<ReturnType<typeof cfg>>, body: Record<string, string>) {
  const r = await fetch(c.oauth + '/token', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', authorization: 'Basic ' + Buffer.from(c.id + ':' + c.secret).toString('base64') },
    body: new URLSearchParams({ ...body, scope: 'commercial' }),
  });
  if (!r.ok) throw new TocError('O TOC Online recusou a autorização (' + r.status + '). ' + (await errorText(r)));
  const j: any = await r.json();
  if (!j?.access_token) throw new TocError('O TOC Online não devolveu o acesso.');
  return j;
}

// O acesso dura 4 horas e a renovação 8; depois disso a app volta a pedir autorização sozinha (a empresa já autorizou nos Dados API).
async function accessToken(store: Store, force = false) {
  const c = cfg()!, now = Date.now();
  const t: any = force ? null : await store.get('toc-token', { type: 'json' }).catch(() => null);
  if (t?.access && t.exp > now + 60e3) return t.access as string;
  let j: any = null;
  if (t?.refresh && t.refreshExp > now + 60e3) j = await tokenRequest(c, { grant_type: 'refresh_token', refresh_token: t.refresh }).catch(() => null);
  if (!j) {
    const u = c.oauth + '/auth?' + new URLSearchParams({ client_id: c.id, redirect_uri: c.redirect, response_type: 'code', scope: 'commercial' });
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json' } });
    const code = (() => { try { return new URL(r.headers.get('location') || '', c.oauth).searchParams.get('code'); } catch { return null; } })();
    if (!code) throw new TocError('O TOC Online não autorizou a app (' + r.status + '). Confirme os Dados API da empresa no TOC Online e as credenciais.');
    j = await tokenRequest(c, { grant_type: 'authorization_code', code, redirect_uri: c.redirect });
  }
  await store.setJSON('toc-token', {
    access: j.access_token, exp: now + (Number(j.expires_in) || 14400) * 1000,
    refresh: j.refresh_token || t?.refresh || '', refreshExp: j.refresh_token ? now + 8 * 3600e3 : t?.refreshExp || 0,
  });
  return j.access_token as string;
}

async function call(store: Store, method: string, path: string, body?: unknown, retry = true): Promise<any> {
  const c = cfg()!;
  const r = await fetch(c.api + path, {
    method, signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/vnd.api+json', accept: 'application/json', authorization: 'Bearer ' + (await accessToken(store, !retry)) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.status === 401 && retry) return call(store, method, path, body, false);
  if (!r.ok) throw new TocError('TOC Online (' + r.status + '): ' + ((await errorText(r)) || 'pedido recusado.'), r.status === 404 ? 404 : 502);
  const t = await r.text();
  try { return t ? JSON.parse(t) : {}; } catch { return {}; }
}

// Respostas JSON:API ou simples: junta id e atributos.
const record = (j: any) => { const d = Array.isArray(j?.data) ? j.data[0] : j?.data ?? (Array.isArray(j) ? j[0] : j); return d ? { ...(d.attributes || {}), id: d.id ?? d.attributes?.id } : {}; };
const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

async function pdfUrl(store: Store, id: string) {
  const j = await call(store, 'GET', '/api/url_for_print/' + encodeURIComponent(id) + '?filter[type]=Document&filter[copies]=1');
  const u = record(j)?.url;
  if (typeof u === 'string') return u;
  return u?.host && u?.path ? (u.scheme || 'https') + '://' + u.host + (u.port && ![80, 443].includes(Number(u.port)) ? ':' + u.port : '') + u.path : '';
}

async function sendEmail(store: Store, id: string, to: string, number: string) {
  const body = { data: { type: 'email/document', id, attributes: { type: 'Document', to_email: to, from_name: 'Enat - Ponte de Lima', subject: 'Fatura ' + (number || '') + ' · Enat - Ponte de Lima' } } };
  try { await call(store, 'PATCH', '/api/email/document', body); }
  catch (e) { if (e instanceof TocError && e.status === 404) await call(store, 'PATCH', '/api/email/document/' + encodeURIComponent(id), body); else throw e; }
}

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function handleToc(req: Request, path: string, store: Store) {
  try {
    if (path === 'toc/estado' && req.method === 'GET') return Response.json({ configured: Boolean(cfg()) });
    if (!cfg()) return fail(503, 'A ligação ao TOC Online ainda não está configurada: faltam as credenciais da API.');

    if (path === 'toc/fatura' && req.method === 'POST') {
      const b: any = await req.json().catch(() => null);
      if (!b || typeof b !== 'object') return fail(400, 'Dados inválidos.');
      const key = str(b.key, 40), obra = str(b.obra, 40), quoteId = Number(b.quote);
      if (!/^[a-z0-9]{8,40}$/.test(key) || !obra || !Number.isInteger(quoteId) || quoteId < 1) return fail(400, 'Dados inválidos.');
      // O mesmo pedido repetido (rede lenta, duplo toque) devolve a fatura já emitida em vez de criar outra.
      const done = await store.get('toc-pedido-' + key, { type: 'json' }).catch(() => null);
      if (done?.pending) return fail(409, 'Este pedido de fatura já foi enviado ao TOC Online sem resposta. Confirme no TOC Online se a fatura foi criada antes de criar outra.');
      if (done) return Response.json(done);
      const c = b.customer || {}, name = str(c.name, 200), nif = str(c.nif, 20).replace(/\s/g, ''), postcode = str(c.postcode, 8), email = str(b.email, 320);
      if (!name) return fail(400, 'Indique o nome do cliente.');
      if (nif && !Toc.validNif(nif)) return fail(400, 'O NIF do cliente não é válido. Corrija-o ou deixe vazio para consumidor final.');
      if (postcode && !/^\d{4}-\d{3}$/.test(postcode)) return fail(400, 'O código postal deve ter o formato 0000-000.');
      if (b.send && !EMAIL.test(email)) return fail(400, 'Indique um email válido para enviar a fatura ao cliente.');

      const [row] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
      if (!row) return fail(404, 'Orçamento não encontrado.');
      const q: any = row.document, lines = Toc.invoiceLines(q);
      if (!lines.length) return fail(400, 'O orçamento não tem linhas com valor para faturar.');
      const totals = Toc.invoiceTotals(lines);
      const ref = 'ORC ' + (String(q.date || '').slice(0, 4) || new Date().getFullYear()) + '/' + String(quoteId).padStart(4, '0');
      const address = str(c.address, 300), city = str(c.city, 100);

      await store.setJSON('toc-pedido-' + key, { pending: true, at: new Date().toISOString() });
      let created: any;
      try {
        created = record(await call(store, 'POST', '/api/v1/commercial_sales_documents', {
        document_type: 'FT', date: today(), finalize: true, vat_included_prices: false, currency_iso_code: 'EUR',
        customer_business_name: name, customer_tax_registration_number: nif || '999999990', customer_country: 'PT',
        ...(address ? { customer_address_detail: address } : {}), ...(postcode ? { customer_postcode: postcode } : {}), ...(city ? { customer_city: city } : {}),
        external_reference: ref,
        lines: lines.map((l: any) => ({ item_type: l.item_type, description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_percentage: Toc.VAT, tax_code: 'NOR', tax_country_region: 'PT' })),
      }));
      } catch (e) {
        // O TOC Online respondeu com erro: a fatura não foi criada e pode tentar de novo. Sem resposta, fica bloqueado até confirmar.
        if (e instanceof TocError) await store.delete('toc-pedido-' + key).catch(() => {});
        throw e;
      }
      const id = String(created.id ?? '');
      if (!id) throw new TocError('O TOC Online não devolveu a fatura criada. Confirme no TOC Online antes de tentar de novo.');
      // A fatura já existe: a partir daqui um erro não pode levar a emitir outra.
      let doc: any = created;
      try { doc = { ...created, ...record(await call(store, 'GET', '/api/v1/commercial_sales_documents/' + encodeURIComponent(id))) }; } catch {}
      const rec: any = {
        id, quote: quoteId, ref, date: str(doc.date, 10) || today(),
        number: String(doc.document_no || doc.document_number || doc.number || ''),
        net: num(doc.net_total) ?? totals.net, vat: num(doc.tax_payable ?? doc.vat_total) ?? totals.vat, total: num(doc.gross_total ?? doc.total) ?? totals.total,
        pdf: '', email: '', emailedAt: '', at: new Date().toISOString(),
      };
      try { rec.pdf = await pdfUrl(store, id); } catch {}
      let emailError = '';
      if (b.send) {
        try { await sendEmail(store, id, email, rec.number); rec.email = email; rec.emailedAt = new Date().toISOString(); }
        catch (e: any) { emailError = 'A fatura foi emitida, mas o envio por email falhou: ' + (e?.message || 'erro') + ' Tente enviar de novo.'; }
      }
      await store.setJSON('toc-pedido-' + key, rec);
      return Response.json({ ...rec, ...(emailError ? { emailError } : {}) }, { status: 201 });
    }

    if (path === 'toc/enviar' && req.method === 'POST') {
      const b: any = await req.json().catch(() => null), id = str(b?.id, 40), email = str(b?.email, 320);
      if (!/^\d+$/.test(id)) return fail(400, 'Fatura inválida.');
      if (!EMAIL.test(email)) return fail(400, 'Indique um email válido.');
      await sendEmail(store, id, email, str(b?.number, 60));
      return Response.json({ ok: true, email, emailedAt: new Date().toISOString() });
    }

    const pdf = path.match(/^toc\/pdf\/(\d{1,20})$/);
    if (pdf && req.method === 'GET') {
      const url = await pdfUrl(store, pdf[1]);
      return url ? Response.json({ url }) : fail(502, 'O TOC Online não devolveu o PDF da fatura.');
    }
    return fail(404, 'Pedido desconhecido.');
  } catch (e: any) {
    if (e instanceof TocError) return fail(e.status === 404 ? 404 : 502, e.message);
    console.error('toc', e?.name, e?.message);
    return fail(e?.name === 'TimeoutError' ? 504 : 502, e?.name === 'TimeoutError' ? 'O TOC Online demorou demasiado a responder. Confirme no TOC Online se a fatura foi criada antes de tentar de novo.' : 'Não foi possível falar com o TOC Online. Tente novamente.');
  }
}
