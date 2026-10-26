// API única da app: leitura de faturas (Gemini), estado sincronizado, fotos das faturas e Google Sheets.
import { getStore } from '@netlify/blobs';

const PROMPT = `Esta imagem ou PDF é uma fatura portuguesa de um fornecedor de materiais. Devolve APENAS JSON:
{"store": nome da loja, "nif": NIF do fornecedor (9 dígitos, nunca o do cliente), "date": "AAAA-MM-DD", "number": "nº da fatura",
"totalNoVat": total sem IVA, "total": total com IVA,
"items": [{"name": nome do artigo, "qty": quantidade, "unit": "un"|"m"|"kg"|"cx", "unit_price": preço unitário líquido SEM IVA já com descontos (por metro se vendido a metro), "vat": taxa de IVA em %, "total_no_vat": total da linha sem IVA, "cat": uma de: Equipamentos | Cablagem | Tubagem | Acessórios e fixação | Outros / consumíveis}]}
Regras: cabos e fios são Cablagem; bombas de calor, ar condicionado, VMC, unidades e painéis são Equipamentos; tubos são Tubagem; parafusos, abraçadeiras, fita e buchas são Acessórios e fixação; o resto é Outros / consumíveis. Não inventes valores; usa null se não existir.`;

const json = (status, body) => new Response(body == null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const code = process.env.APP_CODE;
  if (!code || req.headers.get('x-code') !== code) return json(401);
  const path = new URL(req.url).pathname.replace(/^\/api\//, '');
  const store = getStore('enat');

  if (path === 'estado') {
    if (req.method === 'GET') return json(200, { state: (await store.get('estado', { type: 'json' })) || null });
    if (req.method === 'PUT') {
      let b; try { b = await req.json(); } catch { return json(400); }
      if (!b || !b.state) return json(400);
      await store.setJSON('estado', b.state);
      if (!process.env.SHEETS_WEBHOOK) console.warn('SHEETS_WEBHOOK não definido: Google Sheets não é atualizado');
      else if (b.sheets) {
        try {
          const r = await fetch(process.env.SHEETS_WEBHOOK, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ code, sheets: b.sheets }) });
          const t = await r.text();
          if (!r.ok || t.trim() !== 'ok') console.error('Google Sheets respondeu', r.status, t.slice(0, 200));
        } catch (e) { console.error('Falha ao contactar Google Sheets:', e.message); }
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
    if (!process.env.GEMINI_API_KEY) return json(500);
    let b; try { b = await req.json(); } catch { return json(400); }
    const { mime, data } = b || {};
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mime) || !data) return json(400);
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (!r.ok) return json(502);
    const j = await r.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    try { return json(200, JSON.parse(text)); } catch { return json(502); }
  }

  return json(404);
};

export const config = { path: '/api/*' };
