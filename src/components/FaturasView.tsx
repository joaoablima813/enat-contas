import type { Fatura } from '../types';
import { formatarEuro, formatarData } from '../utils/calculations';
import { FinancialTable, Badge, type Coluna } from './FinancialTable';
const colunas: Coluna<Fatura>[] = [
  { titulo: 'Obra', valor: o => o.obra || '—' },
  { titulo: 'Loja / Fornecedor', valor: o => o.loja_fornecedor || '—' },
  { titulo: 'NIF', valor: o => o.nif || '—' },
  { titulo: 'Data', valor: o => formatarData(o.data || '') },
  { titulo: 'Nº Fatura', valor: o => o.num_fatura || '—' },
  { titulo: 'Total s/ IVA', numerica: true, valor: o => formatarEuro(o.total_sem_iva) },
  { titulo: 'IVA', numerica: true, valor: o => formatarEuro(o.iva) },
  { titulo: 'Total c/ IVA', numerica: true, valor: o => formatarEuro(o.total_com_iva) },
  { titulo: 'Foto Anexada', valor: o => <Badge estado={o.foto_anexada} /> },
];
export function FaturasView({ faturas }: { faturas: Fatura[] }) {
  return <FinancialTable dados={faturas} colunas={colunas} titulo="Faturas" />;
}
