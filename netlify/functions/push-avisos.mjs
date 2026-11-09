import { getStore } from '@netlify/blobs';
import { runAlerts } from '../lib/push.mjs';

// A cada minuto envia as notificações push devidas (chamadas em hora, visitas e leads novas), mesmo com a app fechada.
export default async () => {
  try { const r = await runAlerts(getStore({ name: 'enat', consistency: 'strong' })); if (r.sent) console.log('push-avisos', r); }
  catch (e) { console.error('push-avisos falhou', e?.message || e); }
};

export const config = { schedule: '* * * * *' };
