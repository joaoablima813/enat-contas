// Anúncios / promoções mostrados no site (secção «Promoções», em destaque).
// A app guarda a lista completa no blob "promocoes"; as fotos ficam em "pub-<id>" (como as fotos das obras).
// O site só recebe os anúncios ativos, com título e foto, e dentro da validade.
const json = (status, body) => Response.json(body, { status });
const KEY = 'promocoes';
const ID = /^[a-z0-9]{8,40}$/;
const PID = /^[A-Za-z0-9_-]{1,40}$/;
export const MAX_FOTOS = 6, MAX_PROMOS = 30;
const str = (v, max) => typeof v === 'string' ? v.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';

export function cleanPromocoes(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((p) => p && typeof p === 'object' && PID.test(String(p.id || '')) && !seen.has(p.id) && seen.add(p.id)).map((p) => ({
    id: String(p.id),
    titulo: str(p.titulo, 80),
    descricao: str(p.descricao, 700),
    preco: str(p.preco, 30),
    precoAntes: str(p.precoAntes, 30),
    ate: day(p.ate),
    ativo: p.ativo !== false,
    fotos: (Array.isArray(p.fotos) ? p.fotos : []).filter((f) => typeof f === 'string' && ID.test(f)).slice(0, MAX_FOTOS),
    criado: Number.isFinite(p.criado) ? p.criado : Date.now(),
  })).slice(0, MAX_PROMOS);
}
export const getPromocoes = async (store) => cleanPromocoes(await store.get(KEY, { type: 'json' }).catch(() => null));
const lisbonDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);
// O que aparece no site: ativo, com título e foto, e com a validade por terminar.
export const visiveis = (list, today = lisbonDay()) => list.filter((p) => p.ativo && p.titulo && p.fotos.length && (!p.ate || p.ate >= today));
export const promoImages = (list) => visiveis(list).flatMap((p) => p.fotos);

export async function handlePromocoes(req, path, store) {
  if (path === 'promocoes') {
    if (req.method === 'GET') return json(200, { promocoes: await getPromocoes(store) });
    if (req.method === 'PUT') {
      let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
      const before = await getPromocoes(store), list = cleanPromocoes(b?.promocoes);
      await store.setJSON(KEY, list);
      // Fotos que deixaram de ser usadas são apagadas.
      const keep = new Set(list.flatMap((p) => p.fotos));
      for (const f of before.flatMap((p) => p.fotos)) if (!keep.has(f)) await store.delete('pub-' + f).catch(() => {});
      return json(200, { promocoes: list });
    }
  }
  const m = path.match(/^promocoes\/foto\/([a-z0-9]{8,40})$/);
  if (m && req.method === 'PUT') {
    const type = req.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(400, { error: 'Envie uma foto JPEG ou PNG.' });
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 3e6) return json(400, { error: 'Foto demasiado grande.' });
    await store.set('pub-' + m[1], buf, { metadata: { mime: type } });
    return json(200, { ok: true, id: m[1] });
  }
  if (m && req.method === 'GET') {
    const r = await store.getWithMetadata('pub-' + m[1], { type: 'arrayBuffer' });
    if (!r) return json(404, { error: 'Foto não encontrada.' });
    return new Response(r.data, { headers: { 'content-type': r.metadata?.mime || 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
  }
  return json(404, { error: 'Pedido inválido.' });
}
