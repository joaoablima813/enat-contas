// Perfil da empresa mostrado na página pública da proposta: pessoa de contacto, credenciais, garantias e semanas livres.
// Fica num blob próprio ("empresa"), fora do estado da app, para a página pública não precisar de ler os dados das obras.
// As fotos (pessoa de contacto e equipa) ficam em "pub-<id>" e são as únicas imagens que a página pública pode servir.
const json = (status, body) => Response.json(body, { status });
const KEY = 'empresa';
const str = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const ID = /^[a-z0-9]{8,40}$/;
const id = (v) => typeof v === 'string' && ID.test(v) ? v : '';

export function cleanEmpresa(b) {
  const o = b && typeof b === 'object' ? b : {};
  const c = o.contacto && typeof o.contacto === 'object' ? o.contacto : {};
  const g = o.google && typeof o.google === 'object' ? o.google : {};
  const list = (v, n, max) => Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [];
  return {
    contacto: { nome: str(c.nome, 120), cargo: str(c.cargo, 120), telefone: str(c.telefone, 40), foto: id(c.foto) },
    apresentacao: str(o.apresentacao, 600),
    instalacao: str(o.instalacao, 400),
    posVenda: str(o.posVenda, 400),
    anos: str(o.anos, 20),
    instalacoes: str(o.instalacoes, 20),
    equipaFoto: id(o.equipaFoto),
    autoPedido: o.autoPedido !== false,
    nif: str(o.nif, 20), morada: str(o.morada, 200),
    email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(str(o.email, 120)) ? str(o.email, 120) : '',
    site: str(o.site, 120).replace(/^https?:\/\//, '').replace(/[\s<>"]/g, ''),
    credenciais: Array.isArray(o.credenciais) ? o.credenciais.filter((x) => x && typeof x === 'object').map((x) => ({ nome: str(x.nome, 160), numero: str(x.numero, 160) })).filter((x) => x.nome).slice(0, 12) : [],
    garantiaEquip: str(o.garantiaEquip, 60),
    garantiaInst: str(o.garantiaInst, 60),
    google: { nota: str(g.nota, 4), total: str(g.total, 8), link: /^https:\/\/[^\s"<>]+$/.test(str(g.link, 500)) ? str(g.link, 500) : '' },
    incluido: list(o.incluido, 15, 200),
    semanas: list(o.semanas, 30, 10).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    u: Date.now(),
  };
}
export const getEmpresa = async (store) => (await store.get(KEY, { type: 'json' }).catch(() => null)) || null;
// Imagens que a página pública pode mostrar.
export const publicImages = (e) => [e?.contacto?.foto, e?.equipaFoto].filter(Boolean);

export async function handleEmpresa(req, path, store) {
  if (path === 'empresa') {
    if (req.method === 'GET') return json(200, { empresa: await getEmpresa(store) });
    if (req.method === 'PUT') {
      let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
      const before = await getEmpresa(store), e = cleanEmpresa(b?.empresa);
      await store.setJSON(KEY, e);
      // Fotos substituídas deixam de estar publicadas.
      for (const old of publicImages(before)) if (!publicImages(e).includes(old)) await store.delete('pub-' + old).catch(() => {});
      return json(200, { empresa: e });
    }
  }
  const m = path.match(/^empresa\/foto\/([a-z0-9]{8,40})$/);
  if (m && req.method === 'PUT') {
    const type = req.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(400, { error: 'Envie uma foto JPEG ou PNG.' });
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 3e6) return json(400, { error: 'Foto demasiado grande.' });
    await store.set('pub-' + m[1], buf, { metadata: { mime: type } });
    return json(200, { ok: true, id: m[1] });
  }
  return json(404, { error: 'Pedido inválido.' });
}

// Pedido público: só serve as fotos do perfil da empresa, as das obras autorizadas pelo cliente e as dos anúncios visíveis.
export async function servePublicImage(imageId, store) {
  if (!ID.test(imageId)) return new Response('Não encontrado', { status: 404 });
  const { getPortfolio, portfolioImages } = await import('./portfolio.mjs');
  const { getPromocoes, promoImages } = await import('./promocoes.mjs');
  const [e, works, promos] = await Promise.all([getEmpresa(store), getPortfolio(store), getPromocoes(store)]);
  if (!publicImages(e).includes(imageId) && !portfolioImages(works).includes(imageId) && !promoImages(promos).includes(imageId)) return new Response('Não encontrado', { status: 404 });
  const r = await store.getWithMetadata('pub-' + imageId, { type: 'arrayBuffer' });
  if (!r) return new Response('Não encontrado', { status: 404 });
  return new Response(r.data, { headers: { 'content-type': r.metadata?.mime || 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-robots-tag': 'noindex' } });
}
