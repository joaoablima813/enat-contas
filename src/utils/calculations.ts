import type { EstadoPagamento } from '../types';
export const TAXA_IVA_NORMAL = 0.23;
const round = (n: number) => Math.round(n * 100) / 100;
export function calcularCamposControloObra(dados: {
  orcamento_com_iva: number; despesas_totais: number; iva_suportado: number; valor_pago: number;
}) {
  const orcamento = dados.orcamento_com_iva || 0;
  const despesas = dados.despesas_totais || 0;
  const pago = dados.valor_pago || 0;
  const iva_a_entregar = Math.max(0, round(orcamento * TAXA_IVA_NORMAL / (1 + TAXA_IVA_NORMAL) - (dados.iva_suportado || 0)));
  const lucro_estimado = round(orcamento - despesas - iva_a_entregar);
  const estado_pagamento: EstadoPagamento = orcamento > 0 && pago >= orcamento ? 'Pago' : pago > 0 ? 'Parcial' : 'Pendente';
  return { iva_a_entregar, saldo_a_receber: Math.max(0, round(orcamento - pago)), lucro_estimado,
    margem_percent: orcamento > 0 ? lucro_estimado / orcamento * 100 : 0, estado_pagamento };
}
export const formatarEuro = (valor: number) => new Intl.NumberFormat('pt-PT', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
}).format(valor || 0);
export const formatarPercent = (valor: number) => `${(valor || 0).toFixed(1)}%`;
export function formatarData(valor: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : valor;
}
