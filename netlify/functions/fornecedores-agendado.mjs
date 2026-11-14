import { triggerSync } from '../lib/fornecedores.ts';

// Every 3 hours, refreshes the Sanipower and Sanitop catalogues and prices in the background.
export default async () => {
  try { console.log('fornecedores-agendado', await triggerSync(process.env.URL)); }
  catch (e) { console.error('fornecedores-agendado falhou', e?.message || e); }
};

export const config = { schedule: '15 */3 * * *' };
