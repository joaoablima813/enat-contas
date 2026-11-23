// Opiniões da ENAT no Google (Places API New), mostradas no site.
// Uma vez por dia o servidor pede ao Google a nota, o número de opiniões e as avaliações (o Google devolve até 5)
// e guarda-as no blob "google-opinioes". O site lê essa cópia: nunca chama o Google diretamente.
// Custo: ~30 pedidos por mês, dentro do uso gratuito mensal do Google. Chave: GOOGLE_PLACES_KEY (secreta, no Netlify).
export const PLACE_ID = process.env.GOOGLE_PLACE_ID || 'ChIJJ4_zPM-vJQ0RejMBJDXQuvY';
const KEY = 'google-opinioes';
const DAY = 864e5;
const FIELDS = 'rating,userRatingCount,googleMapsUri,reviews';
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Resposta do Google → o que o site precisa (mais recentes primeiro; só com texto ou estrelas).
export function fromPlace(p, now = Date.now()) {
  const reviews = (Array.isArray(p?.reviews) ? p.reviews : []).map((r) => ({
    autor: str(r.authorAttribution?.displayName, 80) || 'Cliente Google',
    autorUrl: /^https:\/\/www\.google\.com\/maps\//.test(r.authorAttribution?.uri || '') ? r.authorAttribution.uri : '',
    foto: /^https:\/\/lh\d\.googleusercontent\.com\//.test(r.authorAttribution?.photoUri || '') ? r.authorAttribution.photoUri : '',
    estrelas: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0))),
    texto: str(r.originalText?.text || r.text?.text, 1200),
    quando: str(r.relativePublishTimeDescription, 40),
    data: str(r.publishTime, 40),
  })).filter((r) => r.estrelas).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { at: now, nota: Number(p?.rating) || 0, total: Number(p?.userRatingCount) || 0, link: str(p?.googleMapsUri, 300), reviews };
}

export const getOpinioes = async (store) => (await store.get(KEY, { type: 'json' }).catch(() => null)) || null;

// Atualiza no máximo uma vez por dia (e tenta de novo uma hora depois se o Google falhar).
export async function atualizarOpinioes(store, now = Date.now(), fetcher = fetch) {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return { skipped: 'sem chave' };
  const cur = await getOpinioes(store);
  if (cur && now - (cur.at || 0) < DAY) return { skipped: 'recente' };
  if (cur?.falhou && now - cur.falhou < 36e5) return { skipped: 'falhou há pouco' };
  try {
    const r = await fetcher(`https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}?languageCode=pt-PT`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS } });
    if (!r.ok) throw new Error('google ' + r.status);
    const data = fromPlace(await r.json(), now);
    await store.setJSON(KEY, data);
    return { ok: true, total: data.total, reviews: data.reviews.length };
  } catch (e) {
    console.error('opiniões google', e?.message);
    await store.setJSON(KEY, { ...(cur || {}), falhou: now });
    return { error: e?.message };
  }
}

// Dados do Google a mostrar (site e propostas). Com a sincronização ativa, usa a nota, o número e as opiniões reais;
// sem ela, o que foi escrito na app (Empresa → Google). Nunca mostra a opinião do próprio comercial.
export function googleFor(e, op) {
  const g = e?.google || {}, me = String(e?.contacto?.nome || 'João Lima').trim().toLowerCase();
  if (op?.total) return { ...g, nota: Number(op.nota).toFixed(1), total: String(op.total), link: g.link || op.link, reviews: (op.reviews || []).filter((r) => r.autor.trim().toLowerCase() !== me) };
  return g.nota ? { ...g, reviews: [] } : { ...g, reviews: [] };
}
