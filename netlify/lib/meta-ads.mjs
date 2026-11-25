// Meta Ads (Facebook/Instagram): gasto, leads e cliques de cada campanha, por dia, lidos da Marketing API.
// - syncMetaAds: pede à Meta os últimos dias (ou o último ano, na primeira vez) e guarda no blob «meta-ads».
// - resumoMetaAds: junta os dias de um período, por campanha, para o ecrã «Meta Ads» da app.
// Precisa de META_ADS_TOKEN (token de utilizador de sistema com ads_read; segredo no Netlify).
export const CONTA = () => String(process.env.META_AD_ACCOUNT || '979729728332462').replace(/^act_/, '');
const VERSAO = () => process.env.META_API_VERSION || 'v21.0';
const dia = (t) => new Date(t).toISOString().slice(0, 10);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Leads de formulário: a Meta devolve-as em «actions» com tipos diferentes conforme o anúncio.
const TIPOS_LEAD = ['lead', 'onsite_conversion.lead_grouped', 'leadgen_grouped', 'offsite_conversion.fb_pixel_lead'];
export function leadsDe(actions) {
  const a = Array.isArray(actions) ? actions : [];
  for (const t of TIPOS_LEAD) { const x = a.find((y) => y.action_type === t); if (x) return Number(x.value) || 0; }
  return 0;
}

async function graph(path, params, { token, fetcher = fetch } = {}) {
  let url = `https://graph.facebook.com/${VERSAO()}/${path}?` + new URLSearchParams({ ...params, access_token: token });
  const out = [];
  for (let pag = 0; url && pag < 50; pag++) {
    const r = await fetcher(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Meta: ' + (j.error?.message || 'HTTP ' + r.status));
    out.push(...(j.data || []));
    url = j.paging?.next || '';
  }
  return out;
}

// Linhas da Meta (uma por campanha e dia) → { 'AAAA-MM-DD': { idCampanha: {...} } }.
export function linhasParaDias(linhas) {
  const dias = {};
  for (const l of linhas) {
    const d = l.date_start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) continue;
    (dias[d] ||= {})[l.campaign_id] = {
      custo: r2(l.spend), impressoes: Number(l.impressions) || 0, cliques: Number(l.inline_link_clicks) || 0, leads: leadsDe(l.actions),
    };
  }
  return dias;
}

export async function syncMetaAds(store, { token = process.env.META_ADS_TOKEN, now = Date.now(), fetcher = fetch, dias: nDias } = {}) {
  if (!token) return { ok: false, erro: 'Falta ligar a conta da Meta (META_ADS_TOKEN).' };
  const conta = CONTA();
  const atual = (await store.get('dias', { type: 'json' }).catch(() => null)) || {};
  // Primeira vez: o último ano. Depois: os últimos 4 dias (a Meta ainda acerta leads atribuídas até 7 dias depois do clique, por isso 8).
  const n = nDias || (Object.keys(atual).length ? 8 : 366);
  const linhas = [];
  for (let fim = now; fim > now - n * 864e5; fim -= 90 * 864e5) {
    const ini = Math.max(now - (n - 1) * 864e5, fim - 89 * 864e5);
    linhas.push(...await graph(`act_${conta}/insights`, {
      level: 'campaign', time_increment: '1', limit: '500',
      fields: 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions',
      time_range: JSON.stringify({ since: dia(ini), until: dia(fim) }),
    }, { token, fetcher }));
  }
  const novos = linhasParaDias(linhas);
  // Os dias pedidos ficam com o que a Meta devolveu (dias sem gasto deixam de ter campanhas).
  for (let i = 0; i < n; i++) delete atual[dia(now - i * 864e5)];
  Object.assign(atual, novos);
  const chaves = Object.keys(atual).sort();
  for (const k of chaves.slice(0, Math.max(0, chaves.length - 400))) delete atual[k];

  const camps = await graph(`act_${conta}/campaigns`, { fields: 'id,name,effective_status,daily_budget,lifetime_budget', limit: '200' }, { token, fetcher });
  // Orçamento ao nível do conjunto de anúncios (é o caso das campanhas da ENAT): soma dos conjuntos ativos.
  const sets = await graph(`act_${conta}/adsets`, { fields: 'campaign_id,effective_status,daily_budget', limit: '500' }, { token, fetcher }).catch(() => []);
  const campanhas = {};
  for (const c of camps) {
    const orcSets = sets.filter((s) => s.campaign_id === c.id && s.effective_status === 'ACTIVE').reduce((a, s) => a + (Number(s.daily_budget) || 0), 0);
    campanhas[c.id] = { nome: c.name, estado: c.effective_status, orcamentoDia: r2((Number(c.daily_budget) || orcSets) / 100) || null };
  }
  for (const l of linhas) if (!campanhas[l.campaign_id]) campanhas[l.campaign_id] = { nome: l.campaign_name, estado: 'ARCHIVED', orcamentoDia: null };

  await store.setJSON('dias', atual);
  await store.setJSON('info', { conta, campanhas, atualizadoEm: new Date(now).toISOString() });
  return { ok: true, linhas: linhas.length, dias: Object.keys(novos).length };
}

// Período de n dias até hoje: totais, uma linha por campanha (com gasto no período ou ativa) e a série por dia.
export function resumoMetaAds(diasGuardados, info, n, { now = Date.now(), campanha = '' } = {}) {
  const lista = [];
  for (let i = n - 1; i >= 0; i--) lista.push(dia(now - i * 864e5));
  const porCamp = {};
  const serie = lista.map((d) => {
    const camps = (diasGuardados || {})[d] || {};
    const t = { data: d, custo: 0, leads: 0, cliques: 0, impressoes: 0 };
    for (const [id, v] of Object.entries(camps)) {
      const c = (porCamp[id] ||= { id, custo: 0, leads: 0, cliques: 0, impressoes: 0 });
      for (const k of ['custo', 'leads', 'cliques', 'impressoes']) c[k] += Number(v[k]) || 0;
      if (campanha && id !== campanha) continue;
      for (const k of ['custo', 'leads', 'cliques', 'impressoes']) t[k] += Number(v[k]) || 0;
    }
    t.custo = r2(t.custo);
    return t;
  });
  const meta = info?.campanhas || {};
  for (const [id, c] of Object.entries(meta)) if (c.estado === 'ACTIVE' && !porCamp[id]) porCamp[id] = { id, custo: 0, leads: 0, cliques: 0, impressoes: 0 };
  const campanhas = Object.values(porCamp).map((c) => ({
    ...c, custo: r2(c.custo), nome: meta[c.id]?.nome || 'Campanha ' + c.id, estado: meta[c.id]?.estado || '', orcamentoDia: meta[c.id]?.orcamentoDia ?? null,
    custoPorLead: c.leads ? r2(c.custo / c.leads) : null,
  })).sort((a, b) => (b.estado === 'ACTIVE') - (a.estado === 'ACTIVE') || b.custo - a.custo);
  const tot = serie.reduce((a, d) => { for (const k of ['custo', 'leads', 'cliques', 'impressoes']) a[k] += d[k]; return a; }, { custo: 0, leads: 0, cliques: 0, impressoes: 0 });
  tot.custo = r2(tot.custo);
  tot.custoPorLead = tot.leads ? r2(tot.custo / tot.leads) : null;
  return { periodoDias: n, campanha, resumo: tot, campanhas, dias: serie, atualizadoEm: info?.atualizadoEm || null, conta: info?.conta || CONTA() };
}
