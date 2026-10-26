import type { Material } from '../types';
import { formatarEuro, formatarPercent, formatarData } from '../utils/calculations';
import { FinancialTable, type Coluna } from './FinancialTable';
const colunas: Coluna<Material>[] = [
  { titulo: 'Obra', valor: o => o.obra || '—' },
  { titulo: 'Fornecedor', valor: o => o.loja_fornecedor || '—' },
  { titulo: 'NIF', valor: o => o.nif || '—' },
  { titulo: 'Data', valor: o => formatarData(o.data || '') },
  { titulo: 'Nº Fatura', valor: o => o.num_fatura || '—' },
  { titulo: 'Artigo', valor: o => o.artigo || '—' },
  { titulo: 'Categoria', valor: o => o.categoria || '—' },
  { titulo: 'Qtd', numerica: true, valor: o => o.quantidade },
  { titulo: 'Un.', valor: o => o.unidade || '—' },
  { titulo: 'Preço Unit. s/ IVA', numerica: true, valor: o => formatarEuro(o.preco_unit_sem_iva) },
  { titulo: 'IVA %', numerica: true, valor: o => formatarPercent(o.iva_taxa) },
  { titulo: 'Preço Unit. c/ IVA', numerica: true, valor: o => formatarEuro(o.preco_unit_com_iva) },
  { titulo: 'Total Linha s/ IVA', numerica: true, valor: o => formatarEuro(o.total_linha_sem_iva) },
];
export function MateriaisView({ materiais }: { materiais: Material[] }) {
  return <FinancialTable dados={materiais} colunas={colunas} titulo="Materiais" />;
}
