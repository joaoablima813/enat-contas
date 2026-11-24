import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Carrega a função com um armazenamento em memória no lugar dos Netlify Blobs.
const load = (autorizado) => {
  const src = readFileSync(new URL('../netlify/functions/ads-metrics.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default async', 'return async');
  const stores = {};
  const getStore = (o) => { const n = typeof o === 'string' ? o : o.name; const m = (stores[n] ||= new Map());
    return { get: async (k) => (m.has(k) ? m.get(k) : null), setJSON: async (k, v) => m.set(k, v) }; };
  return new Function('getStore', 'pedidoAutorizado', src)(getStore, async () => autorizado);
};
const post = (body, key) => new Request('https://x/.netlify/functions/ads-metrics', { method: 'POST', headers: key ? { 'x-enat-key': key } : {}, body: JSON.stringify(body) });

test('ads-metrics: POST needs the key; GET needs the app session and sums the period', async () => {
  process.env.ADS_SYNC_KEY = 'chave-teste';
  const h = load(true);
  assert.equal((await h(post({ dias: [] }))).status, 401);
  assert.equal((await h(post({ dias: [] }, 'errada'))).status, 401);
  const dias = [{ data: '2026-11-20', custo: 10, cliques: 5, impressoes: 100, pedidosOrcamento: 1, contactos: 1, cliquesChamada: 2 }, { data: '2026-11-21', custo: 5.5, cliques: 3, contactos: 1 }, { data: 'x' }];
  const ok = await h(post({ conta: '123', moeda: 'EUR', enviadoEm: '2026-11-21T10:00:00Z', dias }, 'chave-teste'));
  assert.deepEqual(await ok.json(), { ok: true, diasGuardados: 3 });
  const g = await (await h(new Request('https://x/.netlify/functions/ads-metrics?dias=7'))).json();
  assert.equal(g.dias.length, 2);
  assert.equal(g.resumo.custo, 15.5);
  assert.equal(g.resumo.custoPorLead, 5.17);
  assert.equal(g.atualizadoEm, '2026-11-21T10:00:00Z');
  assert.equal((await load(false)(new Request('https://x/.netlify/functions/ads-metrics'))).status, 401);
  delete process.env.ADS_SYNC_KEY;
  assert.equal((await h(post({ dias: [] }, 'chave-teste'))).status, 401);
});
