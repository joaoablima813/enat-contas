import { runJob } from '../lib/quote-ai.mjs';

// Orçamento automático com IA: cada fase (planear/escolher) pode demorar alguns minutos.
// Só processa pedidos criados pela API autenticada (id e token aleatórios guardados nos Blobs).
export default async (req) => {
  let b = {}; try { b = await req.json(); } catch {}
  await runJob(b.id, b.token);
};

export const config = { background: true };
