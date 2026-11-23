// Ligação pública ao site da Enat Ponte de Lima: pedidos de orçamento e obras com fotos (ver netlify/lib/site.mjs).
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore({ name: 'enat', consistency: 'strong' });
  const path = new URL(req.url).pathname.replace(/^\/site-api\/?/, '');
  const { handleSite } = await import('../lib/site.mjs');
  return handleSite(req, path, store);
};

export const config = { path: ['/site-api/*'] };
