import { getStore } from '@netlify/blobs';
import { runAlerts } from '../lib/push.mjs';
import { runQuoteFollowups } from '../lib/followup.mjs';
import { runAutoPedidos } from '../lib/pedido.mjs';

// A cada minuto envia as notificações push devidas (chamadas em hora, visitas e leads novas), mesmo com a app fechada.
// Também lembra o seguimento das propostas sem resposta (no máximo a cada 15 minutos, só de dia).
export default async () => {
  const store = getStore({ name: 'enat', consistency: 'strong' });
  try { const r = await runAlerts(store); if (r.sent) console.log('push-avisos', r); }
  catch (e) { console.error('push-avisos falhou', e?.message || e); }
  try { const r = await runQuoteFollowups(store); if (r.sent) console.log('seguimento', r); }
  catch (e) { console.error('seguimento falhou', e?.message || e); }
  // Questionário enviado automaticamente por email às leads novas.
  try { const r = await runAutoPedidos(store); if (r.sent) console.log('pedido automático', r); }
  catch (e) { console.error('pedido automático falhou', e?.message || e); }
};

export const config = { schedule: '* * * * *' };
