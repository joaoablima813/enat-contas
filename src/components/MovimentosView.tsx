import type { Movimento } from '../types';
import { formatarEuro, formatarData } from '../utils/calculations';
import { FinancialTable, Badge, type Coluna } from './FinancialTable';
const colunas: Coluna<Movimento>[] = [
  { titulo: 'Obra', valor: o => o.obra || '—' },
  { titulo: 'Tipo', valor: o => <Badge estado={o.tipo} /> },
  { titulo: 'Descrição', valor: o => o.descricao || '—' },
  { titulo: 'Tópico', valor: o => o.topico || '—' },
  { titulo: 'Data', valor: o => formatarData(o.data || '') },
  { titulo: 'Total c/ IVA', numerica: true, valor: o => formatarEuro(o.total_com_iva) },
  { titulo: 'Base s/ IVA', numerica: true, valor: o => formatarEuro(o.base_sem_iva) },
  { titulo: 'IVA', numerica: true, valor: o => formatarEuro(o.iva) },
  { titulo: 'Faturação Técnico', valor: o => o.faturacao_tecnico || '—' },
];
export function MovimentosView({ movimentos }: { movimentos: Movimento[] }) {
  return <FinancialTable dados={movimentos} colunas={colunas} titulo="Movimentos" />;
}
