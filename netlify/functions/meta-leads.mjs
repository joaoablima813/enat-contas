import { getStore } from '@netlify/blobs';
import { checkMetaLeads } from '../lib/meta-leads.mjs';
import { runAutoPedidos } from '../lib/pedido.mjs';

// De 5 em 5 minutos (das 6h às 23h, hora UTC; poupa créditos do Netlify) procura leads novas da Meta no email; quando há, envia logo o questionário por email (se estiver ligado).
export default async () => {
  const store = getStore({ name: 'enat', consistency: 'strong' });
  let r = {};
  try { r = await checkMetaLeads(store); console.log('meta-leads', r); }
  catch (e) { console.error('meta-leads falhou', e?.message || e); }
  if (r.imported) {
    try { console.log('pedido automático', await runAutoPedidos(store, Date.now(), undefined, { force: true })); }
    catch (e) { console.error('pedido automático falhou', e?.message || e); }
  }
};

export const config = { schedule: '*/5 6-22 * * *' };
