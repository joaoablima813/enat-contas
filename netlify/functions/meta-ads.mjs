import { getStore } from '@netlify/blobs';
import { pedidoAutorizado } from '../lib/sessao.mjs';
import { syncMetaAds, resumoMetaAds } from '../lib/meta-ads.mjs';

// Ecrã «Meta Ads» da app. GET ?dias=7|30|90|365[&campanha=id] devolve o período; POST sincroniza já com a Meta.
// Ambos precisam da sessão da app.
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async (req) => {
  if (!(await pedidoAutorizado(req, getStore({ name: 'enat', consistency: 'strong' })))) return json({ erro: 'não autorizado' }, 401);
  const store = getStore({ name: 'meta-ads', consistency: 'strong' });
  if (req.method === 'POST') {
    try { return json(await syncMetaAds(store)); } catch (e) { return json({ ok: false, erro: e.message || 'Falhou a ligação à Meta.' }, 502); }
  }
  if (req.method !== 'GET') return json({ erro: 'método não suportado' }, 405);
  const q = new URL(req.url).searchParams;
  const n = Math.min(400, Math.max(1, Number(q.get('dias')) || 30));
  const dias = (await store.get('dias', { type: 'json' }).catch(() => null)) || {};
  const info = (await store.get('info', { type: 'json' }).catch(() => null)) || null;
  return json({ ...resumoMetaAds(dias, info, n, { campanha: q.get('campanha') || '' }), ligado: !!process.env.META_ADS_TOKEN });
};

