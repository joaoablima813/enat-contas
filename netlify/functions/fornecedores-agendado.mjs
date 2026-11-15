import { triggerSync } from '../lib/fornecedores.ts';

// Every 20 minutes: refreshes each supplier every 3 hours, and keeps reading Sanitop client prices while some are missing.
export default async () => {
  try { console.log('fornecedores-agendado', await triggerSync(process.env.URL, undefined, true)); }
  catch (e) { console.error('fornecedores-agendado falhou', e?.message || e); }
};

export const config = { schedule: '*/20 * * * *' };
