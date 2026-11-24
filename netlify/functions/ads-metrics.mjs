import { getStore } from '@netlify/blobs';
import { pedidoAutorizado } from '../lib/sessao.mjs';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

export default async (req) => {
  const store = getStore('google-ads');

  if (req.method === 'POST') {
    if (!process.env.ADS_SYNC_KEY || req.headers.get('x-enat-key') !== process.env.ADS_SYNC_KEY) {
      return json({ erro: 'não autorizado' }, 401);
    }
    let body;
    try { body = await req.json(); } catch { return json({ erro: 'JSON inválido' }, 400); }
    if (!Array.isArray(body.dias)) return json({ erro: 'falta "dias"' }, 400);

    const atual = (await store.get('dias', { type: 'json' })) || {};
    for (const d of body.dias) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d.data)) atual[d.data] = d;
    }
    const chaves = Object.keys(atual).sort();
    for (const k of chaves.slice(0, Math.max(0, chaves.length - 400))) delete atual[k];

    await store.setJSON('dias', atual);
    await store.setJSON('meta', { conta: body.conta, moeda: body.moeda, atualizadoEm: body.enviadoEm });
    return json({ ok: true, diasGuardados: body.dias.length });
  }

  if (req.method === 'GET') {
    // Mesma autenticação da app (sessão x-session ou código x-code).
    if (!(await pedidoAutorizado(req, getStore({ name: 'enat', consistency: 'strong' })))) {
      return json({ erro: 'não autorizado' }, 401);
    }
    const n = Math.min(400, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 30));
    const todos = (await store.get('dias', { type: 'json' })) || {};
    const meta = (await store.get('meta', { type: 'json' })) || {};
    const dias = Object.keys(todos).sort().slice(-n).map((k) => todos[k]);

    const soma = (campo) => Math.round(dias.reduce((s, d) => s + (Number(d[campo]) || 0), 0) * 100) / 100;
    const resumo = {
      impressoes: soma('impressoes'),
      cliques: soma('cliques'),
      custo: soma('custo'),
      cliquesChamada: soma('cliquesChamada'),
      pedidosOrcamento: soma('pedidosOrcamento'),
      contactos: soma('contactos')
    };
    const leads = resumo.pedidosOrcamento + resumo.contactos;
    resumo.custoPorLead = leads > 0 ? Math.round((resumo.custo / leads) * 100) / 100 : null;

    return json({ ...meta, periodoDias: n, resumo, dias });
  }

  return json({ erro: 'método não suportado' }, 405);
};
