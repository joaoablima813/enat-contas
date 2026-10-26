import type { ObraGeral } from '../types';
import { formatarEuro, formatarPercent, formatarData } from '../utils/calculations';
import { FinancialTable, Badge, type Coluna } from './FinancialTable';
const colunas: Coluna<ObraGeral>[] = [
  { titulo: 'Obra', valor: o => o.obra || '—' },
  { titulo: 'Cliente', valor: o => o.cliente || '—' },
  { titulo: 'Estado', valor: o => <Badge estado={o.estado} /> },
  { titulo: 'Valor c/ IVA', numerica: true, valor: o => formatarEuro(o.valor_com_iva) },
  { titulo: 'Valor s/ IVA', numerica: true, valor: o => formatarEuro(o.valor_sem_iva) },
  { titulo: 'Recebido', numerica: true, valor: o => formatarEuro(o.recebido) },
  { titulo: 'Por receber', numerica: true, valor: o => formatarEuro(o.por_receber) },
  { titulo: 'Materiais s/ IVA', numerica: true, valor: o => formatarEuro(o.materiais_sem_iva) },
  { titulo: 'Despesas sem fatura', numerica: true, valor: o => formatarEuro(o.despesas_sem_fatura) },
  { titulo: 'Mão de obra s/ IVA', numerica: true, valor: o => formatarEuro(o.mao_de_obra_sem_iva) },
  { titulo: 'Custos totais', numerica: true, valor: o => formatarEuro(o.custos_totais) },
  { titulo: 'Lucro', numerica: true, valor: o => formatarEuro(o.lucro) },
  { titulo: 'Margem %', numerica: true, valor: o => formatarPercent(o.margem_percent) },
  { titulo: 'IVA cobrado', numerica: true, valor: o => formatarEuro(o.iva_cobrado) },
  { titulo: 'IVA suportado', numerica: true, valor: o => formatarEuro(o.iva_suportado) },
  { titulo: 'IVA a entregar', numerica: true, valor: o => formatarEuro(o.iva_a_entregar) },
  { titulo: 'Telemóvel', valor: o => o.telemovel || '—' },
  { titulo: 'Conclusão', valor: o => formatarData(o.conclusao || '') },
  { titulo: 'Equipamentos', valor: o => o.equipamentos || '—' },
];
export function ObrasView({ obras }: { obras: ObraGeral[] }) {
  return <FinancialTable dados={obras} colunas={colunas} titulo="Obras" />;
}
