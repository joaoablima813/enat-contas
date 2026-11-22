// Página pública «Pedir detalhes ao cliente»: questionário enviado à lead por WhatsApp ou email.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore({ name: 'enat', consistency: 'strong' });
  const [token, sub] = new URL(req.url).pathname.replace(/^\/pedido\//, '').split('/');
  const { handlePedidoPublic } = await import('../lib/pedido.mjs');
  return handlePedidoPublic(req, String(token || ''), sub || '', store);
};

export const config = { path: ['/pedido/:token', '/pedido/:token/foto'] };
