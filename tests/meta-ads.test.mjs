import test from 'node:test';
import assert from 'node:assert/strict';
import { leadsDe, linhasParaDias, syncMetaAds, resumoMetaAds } from '../netlify/lib/meta-ads.mjs';

const mem = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), setJSON: async (k, v) => m.set(k, v) }; };

test('meta-ads: leads come from the form lead action', () => {
  assert.equal(leadsDe([{ action_type: 'link_click', value: '9' }, { action_type: 'lead', value: '3' }]), 3);
  assert.equal(leadsDe([{ action_type: 'onsite_conversion.lead_grouped', value: '2' }]), 2);
  assert.equal(leadsDe(undefined), 0);
  const d = linhasParaDias([{ date_start: '2026-11-24', campaign_id: 'c1', spend: '4.081', impressions: '500', inline_link_clicks: '7', actions: [{ action_type: 'lead', value: '2' }] }]);
  assert.deepEqual(d, { '2026-11-24': { c1: { custo: 4.08, impressoes: 500, cliques: 7, leads: 2 } } });
});

test('meta-ads: sync asks Meta for the period (a year the first time), keeps campaign names and ad set budgets', async () => {
  const pedidos = [];
  const fetcher = async (url) => {
    pedidos.push(url);
    const u = new URL(url);
    let data = [];
    if (u.pathname.endsWith('/insights')) {
      const tr = JSON.parse(u.searchParams.get('time_range'));
      if (tr.until === '2026-11-25') data = [{ date_start: '2026-11-25', campaign_id: 'c1', campaign_name: 'Bomba de calor', spend: '6.1', impressions: '900', inline_link_clicks: '10', actions: [{ action_type: 'lead', value: '3' }] }];
    } else if (u.pathname.endsWith('/campaigns')) data = [{ id: 'c1', name: 'Bomba de calor', effective_status: 'ACTIVE' }, { id: 'c2', name: 'Ar condicionado', effective_status: 'ACTIVE' }];
    else if (u.pathname.endsWith('/adsets')) data = [{ campaign_id: 'c1', effective_status: 'ACTIVE', daily_budget: '700' }, { campaign_id: 'c2', effective_status: 'ACTIVE', daily_budget: '300' }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  const store = mem(), now = Date.parse('2026-11-25T15:00:00Z');
  assert.equal((await syncMetaAds(store, { token: '', now, fetcher })).ok, false, 'without token it does nothing');
  const r = await syncMetaAds(store, { token: 'tk', now, fetcher });
  assert.equal(r.ok, true);
  const insights = pedidos.filter((u) => u.includes('/insights'));
  assert.equal(insights.length, 5, 'a year is asked in blocks of 90 days');
  assert.ok(insights.every((u) => u.includes('act_979729728332462') && u.includes('time_increment=1') && u.includes('level=campaign')));
  const info = store.m.get('info');
  assert.deepEqual(info.campanhas.c1, { nome: 'Bomba de calor', estado: 'ACTIVE', orcamentoDia: 7 });
  assert.equal(info.campanhas.c2.orcamentoDia, 3);

  const res = resumoMetaAds(store.m.get('dias'), info, 7, { now });
  assert.equal(res.resumo.custo, 6.1);
  assert.equal(res.resumo.leads, 3);
  assert.equal(res.resumo.custoPorLead, 2.03);
  assert.equal(res.dias.length, 7);
  assert.deepEqual(res.campanhas.map((c) => [c.nome, c.custo, c.leads]), [['Bomba de calor', 6.1, 3], ['Ar condicionado', 0, 0]], 'active campaigns show even without spend');
  // Filtrar uma campanha: os gráficos e o resumo ficam só com ela; a lista continua com todas.
  const so2 = resumoMetaAds(store.m.get('dias'), info, 7, { now, campanha: 'c2' });
  assert.equal(so2.resumo.custo, 0);
  assert.equal(so2.campanhas.length, 2);
  // Sincronizações seguintes só pedem os últimos dias.
  pedidos.length = 0;
  await syncMetaAds(store, { token: 'tk', now, fetcher });
  assert.equal(pedidos.filter((u) => u.includes('/insights')).length, 1);
});

test('meta-ads: Meta errors are reported', async () => {
  const fetcher = async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 });
  await assert.rejects(syncMetaAds(mem(), { token: 'x', fetcher }), /Invalid OAuth/);
});
