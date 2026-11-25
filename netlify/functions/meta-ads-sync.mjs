import { getStore } from '@netlify/blobs';
import { syncMetaAds } from '../lib/meta-ads.mjs';

// De 2 em 2 horas, das 7h às 23h, guarda o gasto, as leads e os cliques de cada campanha da Meta (poucas execuções, para poupar créditos do Netlify).
export default async () => {
  try { console.log('meta-ads', await syncMetaAds(getStore({ name: 'meta-ads', consistency: 'strong' }))); }
  catch (e) { console.error('meta-ads falhou', e?.message || e); }
};

export const config = { schedule: '13 7-23/2 * * *' };
