import { getStore } from '@netlify/blobs';
import { checkMetaLeads } from '../lib/meta-leads.mjs';

// A cada 5 minutos procura leads novas da Meta no email.
export default async () => {
  try { console.log('meta-leads', await checkMetaLeads(getStore({ name: 'enat', consistency: 'strong' }))); }
  catch (e) { console.error('meta-leads falhou', e?.message || e); }
};

export const config = { schedule: '*/5 * * * *' };
