// Página pública da proposta, aberta pelo cliente a partir do link do WhatsApp ou do email.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore({ name: 'enat', consistency: 'strong' });
  const [token, sub] = new URL(req.url).pathname.replace(/^\/proposta\//, '').split('/');
  if (sub === 'pdf' && req.method === 'GET') {
    const { servePdf } = await import('../lib/whatsapp.ts');
    return servePdf('pdf/' + token, store);
  }
  const { handleProposta } = await import('../lib/proposta.ts');
  return handleProposta(req, token, store);
};

export const config = { path: ['/proposta/:token', '/proposta/:token/pdf'] };
