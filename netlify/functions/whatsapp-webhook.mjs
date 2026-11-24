// Endereço que a Meta chama (através do Dualhook) para o WhatsApp automático.
// GET: confirmação da ligação (devolve hub.challenge se o token for o de WHATSAPP_VERIFY_TOKEN).
// POST: estados das mensagens enviadas e mensagens recebidas. As conversas continuam na app WhatsApp Business do telemóvel;
// aqui só se registam as falhas de envio dos lembretes, para se verem nos registos do Netlify.
import { timingSafeEqual } from 'node:crypto';

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export default async (req) => {
  const u = new URL(req.url);
  if (req.method === 'GET') {
    const token = process.env.WHATSAPP_VERIFY_TOKEN || '';
    const challenge = u.searchParams.get('hub.challenge') || '';
    if (u.searchParams.get('hub.mode') === 'subscribe' && token && same(u.searchParams.get('hub.verify_token') || '', token) && /^[\w-]{1,200}$/.test(challenge))
      return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method === 'POST') {
    try {
      const b = await req.json();
      for (const e of b?.entry || []) for (const c of e?.changes || []) for (const s of c?.value?.statuses || [])
        if (s?.status === 'failed') console.error('whatsapp falhou', s?.errors?.[0]?.code, String(s?.errors?.[0]?.title || '').slice(0, 120));
    } catch { /* corpo inválido: ignorado */ }
    return new Response('ok', { status: 200 });
  }
  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/whatsapp/webhook' };
