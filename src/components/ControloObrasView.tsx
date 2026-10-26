import type { ControloObra } from '../types';
import { calcularCamposControloObra, formatarEuro, formatarPercent, formatarData } from '../utils/calculations';
import { FinancialTable, Badge, type Coluna } from './FinancialTable';
import { KPICards } from './KPICards';
const colunas: Coluna<ControloObra>[] = [
  { titulo: 'Nome da Obra', valor: o => o.nome_obra }, { titulo: 'Local', valor: o => o.local },
  { titulo: 'Data Início', valor: o => formatarData(o.data_inicio) },
  { titulo: 'Estado da Obra', valor: o => <Badge estado={o.estado_obra} /> },
  ...([['Orçamento c/ IVA', 'orcamento_com_iva'], ['Despesas Totais', 'despesas_totais'],
    ['IVA Suportado', 'iva_suportado'], ['IVA a Entregar', 'iva_a_entregar'],
    ['Valor Pago (Recebido)', 'valor_pago'], ['Saldo a Receber', 'saldo_a_receber'],
    ['Lucro Estimado', 'lucro_estimado']] as const).map(([titulo, key]) => ({ titulo, numerica: true, valor: (o: ControloObra) => formatarEuro(o[key]) })),
  { titulo: 'Margem %', numerica: true, valor: o => formatarPercent(o.margem_percent) },
  { titulo: 'Estado Pagamento', valor: o => <Badge estado={o.estado_pagamento} /> },
];
export function ControloObrasView({ obras }: { obras: ControloObra[] }) {
  const calculadas = obras.map(o => ({ ...o, ...calcularCamposControloObra(o) }));
  return <section><h1>ENAT • CONTROLO FINANCEIRO DE OBRAS</h1><KPICards obras={calculadas} />
    <FinancialTable dados={calculadas} colunas={colunas} titulo="Controlo de Obras" /></section>;
}
