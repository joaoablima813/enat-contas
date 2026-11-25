import { getStore } from '@netlify/blobs';
import { runAlerts } from '../lib/push.mjs';
import { runQuoteFollowups } from '../lib/followup.mjs';
import { runLembretes } from '../lib/lembretes.mjs';
import { runAutoPedidos, limparAnexos } from '../lib/pedido.mjs';
import { atualizarOpinioes } from '../lib/google-opinioes.mjs';

// De 5 em 5 minutos (das 6h às 23h, hora UTC; poupa créditos do Netlify) envia as notificações push devidas (chamadas em hora, visitas e leads novas), mesmo com a app fechada.
// Também lembra o seguimento das propostas sem resposta (no máximo a cada 15 minutos, só de dia).
export default async () => {
  const store = getStore({ name: 'enat', consistency: 'strong' });
  try { const r = await runAlerts(store); if (r.sent) console.log('push-avisos', r); }
  catch (e) { console.error('push-avisos falhou', e?.message || e); }
  try { const r = await runQuoteFollowups(store); if (r.sent) console.log('seguimento', r); }
  catch (e) { console.error('seguimento falhou', e?.message || e); }
  // Lembretes ao cliente (email e WhatsApp) aos 4 e 10 dias sem resposta.
  try { const r = await runLembretes(store); if (r.sent || r.avisos) console.log('lembretes', r); }
  catch (e) { console.error('lembretes falhou', e?.message || e); }
  // Questionário enviado automaticamente por email às leads novas.
  try { const n = await limparAnexos(store); if (n) console.log('orçamentos de outras empresas apagados', n); } catch (e) { console.error('limpeza anexos', e?.message); }
  // Opiniões do Google para o site (uma vez por dia).
  try { const r = await atualizarOpinioes(store); if (r.ok) console.log('opiniões google', r); } catch (e) { console.error('opiniões google', e?.message); }
  try { const r = await runAutoPedidos(store); if (r.sent) console.log('pedido automático', r); }
  catch (e) { console.error('pedido automático falhou', e?.message || e); }
};

export const config = { schedule: '*/5 6-22 * * *' };
