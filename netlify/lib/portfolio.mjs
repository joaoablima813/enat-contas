// Obras concluídas com fotos, mostradas na página da proposta a clientes da mesma zona («Obras perto de si»).
// A app publica aqui uma lista curta (blob "portfolio"): tipo de trabalho, localidade, código postal (4 dígitos), mês e
// fotos. Nunca o nome nem a morada do cliente. Só aparecem as obras concluídas com autorização do cliente (ok).
// Uma obra com várias categorias (ex.: ar condicionado e UPAC) publica uma entrada por categoria, com o mesmo «grupo».
// As obras só para o site (sem obra na app) ficam apenas aqui, marcadas com «solo».
const json = (status, body) => Response.json(body, { status });
const KEY = 'portfolio';
const ID = /^[a-z0-9]{8,40}$/;
const OBRA = /^[A-Za-z0-9_-]{1,40}$/;
const str = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function cleanPortfolio(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((w) => w && typeof w === 'object' && OBRA.test(String(w.id || ''))).map((w) => ({
    id: String(w.id),
    tipo: str(w.tipo, 60),
    titulo: str(w.titulo, 80),
    descricao: str(w.descricao, 400),
    grupo: OBRA.test(String(w.grupo || '')) ? String(w.grupo) : String(w.id),
    solo: w.solo === true,
    local: str(w.local, 60),
    cp: /^\d{4}$/.test(String(w.cp || '')) ? String(w.cp) : '',
    mes: /^\d{4}-\d{2}$/.test(String(w.mes || '')) ? String(w.mes) : '',
    fotos: (Array.isArray(w.fotos) ? w.fotos : []).filter((f) => typeof f === 'string' && ID.test(f)).slice(0, 8),
    ok: w.ok === true,
  })).filter((w) => w.fotos.length).slice(0, 200);
}
export const getPortfolio = async (store) => cleanPortfolio(await store.get(KEY, { type: 'json' }).catch(() => null));
// Fotos que a página pública pode servir: só de obras autorizadas e com título e localidade.
export const shown = (list) => list.filter((w) => w.ok && w.titulo && w.local);
export const portfolioImages = (list) => shown(list).flatMap((w) => w.fotos);

// Código postal da morada do cliente («4990-062 Ponte de Lima» → «4990»).
export const postcode = (address) => (String(address || '').match(/\b(\d{4})-\d{3}\b/) || [])[1] || '';
export const monthLabel = (m) => m ? MONTHS[Number(m.slice(5, 7)) - 1] + ' de ' + m.slice(0, 4) : '';

// Até 3 obras para mostrar ao cliente: primeiro as do mesmo código postal, depois as da mesma região
// (os 2 primeiros dígitos, ex.: 49xx = Alto Minho), dando preferência ao mesmo tipo de trabalho e às mais recentes.
export function nearby(list, address, topics = [], n = 3) {
  const cp = postcode(address), works = shown(list);
  if (!works.length) return { title: '', items: [] };
  const zone = (w) => (cp && w.cp === cp ? 2 : cp && w.cp && w.cp.slice(0, 2) === cp.slice(0, 2) ? 1 : 0);
  const score = (w) => zone(w) * 10 + (topics.includes(w.tipo) ? 5 : 0);
  // Uma só categoria por obra, para mostrar obras diferentes.
  const seen = new Set();
  const items = [...works].sort((a, b) => score(b) - score(a) || b.mes.localeCompare(a.mes)).filter((w) => !seen.has(w.grupo) && seen.add(w.grupo)).slice(0, n);
  const best = Math.max(...items.map(zone));
  return { title: best === 2 ? 'Obras que fizemos perto de si' : best === 1 ? 'Obras que fizemos na sua região' : 'Algumas obras que fizemos', items };
}

export async function handlePortfolio(req, path, store) {
  if (path === 'portfolio') {
    if (req.method === 'GET') return json(200, { portfolio: await getPortfolio(store) });
    if (req.method === 'PUT') {
      let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
      const before = await getPortfolio(store), list = cleanPortfolio(b?.portfolio);
      await store.setJSON(KEY, list);
      // Fotos retiradas de todas as obras são apagadas.
      const keep = new Set(list.flatMap((w) => w.fotos));
      for (const f of before.flatMap((w) => w.fotos)) if (!keep.has(f)) await store.delete('pub-' + f).catch(() => {});
      return json(200, { portfolio: list });
    }
  }
  const m = path.match(/^portfolio\/foto\/([a-z0-9]{8,40})$/);
  if (m && req.method === 'PUT') {
    const type = req.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(400, { error: 'Envie uma foto JPEG ou PNG.' });
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 3e6) return json(400, { error: 'Foto demasiado grande.' });
    await store.set('pub-' + m[1], buf, { metadata: { mime: type } });
    return json(200, { ok: true, id: m[1] });
  }
  // Pré-visualização na app (com sessão), também das fotos ainda não autorizadas.
  if (m && req.method === 'GET') {
    const r = await store.getWithMetadata('pub-' + m[1], { type: 'arrayBuffer' });
    if (!r) return json(404, { error: 'Foto não encontrada.' });
    return new Response(r.data, { headers: { 'content-type': r.metadata?.mime || 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
  }
  return json(404, { error: 'Pedido inválido.' });
}
