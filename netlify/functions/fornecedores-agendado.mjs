import { triggerSync } from '../lib/fornecedores.ts';

// Uma vez por semana (domingo de madrugada): atualiza o catálogo de cada fornecedor. Corre de 20 em 20 minutos só
// dentro dessa janela, para a Sanitop poder continuar a ler os preços de cliente que faltarem. Poupa créditos do Netlify.
export default async () => {
  try { console.log('fornecedores-agendado', await triggerSync(process.env.URL, undefined, true)); }
  catch (e) { console.error('fornecedores-agendado falhou', e?.message || e); }
};

// Domingo, 01:00–06:40 UTC (02:00–07:40 em Lisboa no inverno).
export const config = { schedule: '*/20 1-6 * * 0' };
