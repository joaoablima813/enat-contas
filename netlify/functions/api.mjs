// API única da app: leitura de faturas (AI Gateway), estado sincronizado, fotos das faturas e Google Sheets.
import { getStore } from '@netlify/blobs';
import OpenAI from 'openai';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PROMPT = `Esta imagem ou PDF é uma fatura portuguesa de um fornecedor de materiais. Devolve APENAS JSON:
{"store": nome da loja, "nif": NIF do fornecedor (9 dígitos, nunca o do cliente), "date": "AAAA-MM-DD", "number": "nº da fatura",
"totalNoVat": total sem IVA, "total": total com IVA,
"items": [{"name": nome do artigo, "qty": quantidade, "unit": "un"|"m"|"kg"|"cx", "unit_price": preço unitário líquido SEM IVA já com descontos (por metro se vendido a metro), "vat": taxa de IVA em %, "total_no_vat": total da linha sem IVA, "cat": uma de: Equipamentos | Cablagem | Tubagem | Acessórios e fixação | Outros / consumíveis}]}
Regras: cabos e fios são Cablagem; bombas de calor, ar condicionado, VMC, unidades e painéis são Equipamentos; tubos são Tubagem; parafusos, abraçadeiras, fita e buchas são Acessórios e fixação; o resto é Outros / consumíveis. Não inventes valores; usa null se não existir.`;

const json = (status, body) => new Response(body == null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Sessões: token "expira.assinatura" assinado com um segredo guardado nos Blobs.
const DOZE_H = 12 * 3600e3;
const segredo = async (store) => {
  let s = await store.get('auth-segredo');
  if (!s) { s = randomBytes(32).toString('hex'); await store.set('auth-segredo', s); }
  return s;
};
const assinar = (s, exp) => exp + '.' + createHmac('sha256', s).update(String(exp)).digest('base64url');
const valido = (s, t) => {
  const exp = String(t || '').split('.')[0];
  if (!exp || !(+exp > Date.now())) return false;
  const a = Buffer.from(assinar(s, exp)), b = Buffer.from(String(t));
  return a.length === b.length && timingSafeEqual(a, b);
};

async function auth(req, path, store, autorizado) {
  const u = new URL(req.url), rpID = u.hostname, origin = u.origin;
  const chaves = (await store.get('passkeys', { type: 'json' })) || [];
  const token = async () => ({ token: assinar(await segredo(store), Date.now() + DOZE_H) });
  let b = {}; if (req.method === 'POST') { try { b = await req.json(); } catch {} }
  const desafio = async (options) => { const cid = randomBytes(12).toString('hex'); await store.setJSON('desafio-' + cid, { c: options.challenge, t: Date.now() }); return { cid, options }; };
  const usarDesafio = async (cid) => {
    if (!/^[a-f0-9]{24}$/.test(cid || '')) return null;
    const d = await store.get('desafio-' + cid, { type: 'json' });
    await store.delete('desafio-' + cid);
    return d && Date.now() - d.t < 5 * 60e3 ? d.c : null;
  };

  if (path === 'auth/estado') return json(200, { temChaves: chaves.length > 0 });

  if (path === 'auth/registo-opcoes') {
    // O primeiro dispositivo regista-se livremente; os seguintes precisam de sessão ativa ou do APP_CODE.
    if (chaves.length && !autorizado) return json(401, { error: 'Entre primeiro num dispositivo já registado, ou use o código de acesso' });
    return json(200, await desafio(await generateRegistrationOptions({
      rpName: 'Enat Contas', rpID, userName: 'Enat', userDisplayName: 'Enat',
      excludeCredentials: chaves.map((k) => ({ id: k.id, transports: k.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })));
  }
  if (path === 'auth/registo') {
    if (chaves.length && !autorizado) return json(401);
    const c = await usarDesafio(b.cid);
    if (!c) return json(400, { error: 'Pedido expirado, tente de novo' });
    try {
      const v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified) return json(400, { error: 'Registo não verificado' });
      const k = v.registrationInfo.credential;
      chaves.push({ id: k.id, publicKey: Buffer.from(k.publicKey).toString('base64url'), counter: k.counter, transports: k.transports });
      await store.setJSON('passkeys', chaves);
      return json(200, await token());
    } catch (e) { console.error('registo', e); return json(400, { error: 'Registo falhou' }); }
  }
  if (path === 'auth/entrar-opcoes') {
    // Se o dispositivo indicar a sua chave, pede-a diretamente ao sensor interno (Face ID) sem mostrar a lista de contas.
    const k = chaves.find((x) => x.id === b.id);
    return json(200, await desafio(await generateAuthenticationOptions({
      rpID, userVerification: 'required',
      ...(k ? { allowCredentials: [{ id: k.id, transports: ['internal'] }] } : {}),
    })));
  }
  if (path === 'auth/entrar') {
    const c = await usarDesafio(b.cid);
    if (!c) return json(400, { error: 'Pedido expirado, tente de novo' });
    const k = chaves.find((x) => x.id === b.response?.id);
    if (!k) return json(401, { error: 'Este dispositivo não está registado' });
    try {
      const v = await verifyAuthenticationResponse({
        response: b.response, expectedChallenge: c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: k.id, publicKey: Buffer.from(k.publicKey, 'base64url'), counter: k.counter, transports: k.transports },
      });
      if (!v.verified) return json(401);
      k.counter = v.authenticationInfo.newCounter;
      await store.setJSON('passkeys', chaves);
      return json(200, await token());
    } catch (e) { console.error('entrar', e); return json(401, { error: 'Não foi possível confirmar a identidade' }); }
  }
  return json(404);
}

export default async (req) => {
  const code = process.env.APP_CODE;
  const path = new URL(req.url).pathname.replace(/^\/api\//, '');
  const store = getStore({ name: 'enat', consistency: 'strong' });
  const autorizado = (code && req.headers.get('x-code') === code) || valido(await segredo(store), req.headers.get('x-session'));
  if (path.startsWith('auth/')) return auth(req, path, store, autorizado);
  if (!autorizado) return json(401);

  if (path === 'estado') {
    if (req.method === 'GET') return json(200, { state: (await store.get('estado', { type: 'json' })) || null });
    if (req.method === 'PUT') {
      let b; try { b = await req.json(); } catch { return json(400); }
      if (!b || !b.state) return json(400);
      await store.setJSON('estado', b.state);
      if (process.env.SHEETS_WEBHOOK && b.sheets) {
        try { await fetch(process.env.SHEETS_WEBHOOK, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ code, sheets: b.sheets }) }); } catch {}
      }
      return json(200, { ok: true });
    }
  }

  if (path.startsWith('foto/')) {
    const id = path.slice(5);
    if (!/^[a-z0-9]{4,40}$/.test(id)) return json(400);
    if (req.method === 'PUT') {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > 5e6) return json(400);
      await store.set('foto-' + id, buf, { metadata: { mime: req.headers.get('content-type') || 'image/jpeg' } });
      return json(200, { ok: true });
    }
    if (req.method === 'GET') {
      const r = await store.getWithMetadata('foto-' + id, { type: 'arrayBuffer' });
      if (!r) return json(404);
      return new Response(r.data, { headers: { 'content-type': (r.metadata && r.metadata.mime) || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
    }
    if (req.method === 'DELETE') { await store.delete('foto-' + id); return json(200, { ok: true }); }
  }

  if (path === 'ler-fatura' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json(400); }
    const { mime, data } = b || {};
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mime) || typeof data !== 'string' || !data.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return json(400, { error: 'Envie uma foto ou um PDF válido.' });
    if (data.length > 5_400_000) return json(413, { error: 'Ficheiro demasiado grande. Envie um PDF até 4 MB ou uma foto.' });
    try {
      // The default SDK uses the credentials and endpoint injected by AI Gateway.
      const ai = new OpenAI({ timeout: 45000, maxRetries: 0 });
      const document = mime === 'application/pdf'
        ? { type: 'input_file', filename: 'fatura.pdf', file_data: `data:${mime};base64,${data}` }
        : { type: 'input_image', image_url: `data:${mime};base64,${data}`, detail: 'high' };
      const r = await ai.responses.create({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: PROMPT }, document] }],
        text: { format: { type: 'json_object' } },
        max_output_tokens: 10000,
        temperature: 0,
      });
      const text = r.output_text;
      if (!text || r.status !== 'completed') return json(422, { error: 'Não foi possível ler a fatura completa. Tente um documento mais nítido ou com menos páginas.' });
      const invoice = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice) || !Array.isArray(invoice.items) || invoice.items.some(item => !item || typeof item !== 'object') || (!invoice.store && invoice.total == null && !invoice.items.length)) {
        return json(422, { error: 'Não foram encontrados dados de uma fatura. Envie uma foto nítida ou o PDF original.' });
      }
      return json(200, invoice);
    } catch (e) {
      const status = Number(e.status || e.code);
      console.error('ler-fatura', { status: Number.isFinite(status) ? status : undefined, type: e.name });
      if (e instanceof SyntaxError) return json(422, { error: 'A leitura devolveu dados incompletos. Tente novamente com uma foto mais nítida.' });
      if (status === 429) return json(429, { error: 'O serviço de leitura está ocupado. Aguarde um minuto e tente novamente.' });
      return json(502, { error: 'O serviço de leitura está temporariamente indisponível. Tente novamente dentro de instantes.' });
    }
  }

  return json(404);
};

export const config = { path: '/api/*' };
