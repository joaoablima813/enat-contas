import { runSync, syncToken, SUPPLIERS } from '../lib/fornecedores.ts';

// Reads one supplier's whole catalogue (up to 15 minutes). Started by the schedule or by "Atualizar agora" in the app.
export default async (req) => {
  let b = {}; try { b = await req.json(); } catch {}
  if (req.headers.get('x-sync-token') !== (await syncToken()) || !SUPPLIERS[b.supplier]) return;
  try { console.log('fornecedores-sync', b.supplier, await runSync(b.supplier)); }
  catch (e) { console.error('fornecedores-sync falhou', b.supplier, e?.message || e); }
};

export const config = { background: true };
