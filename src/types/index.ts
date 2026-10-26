export type EstadoObra = 'Planeamento' | 'Em Curso' | 'Concluída' | 'Pausada';
export type EstadoPagamento = 'Pago' | 'Parcial' | 'Pendente';
export interface ControloObra {
  id: string; nome_obra: string; local: string; data_inicio: string;
  estado_obra: EstadoObra; orcamento_com_iva: number; despesas_totais: number;
  iva_suportado: number; iva_a_entregar: number; valor_pago: number;
  saldo_a_receber: number; lucro_estimado: number; margem_percent: number;
  estado_pagamento: EstadoPagamento;
}
export interface ObraGeral {
  id: string; obra: string; cliente: string; estado: string;
  valor_com_iva: number; valor_sem_iva: number; recebido: number; por_receber: number;
  materiais_sem_iva: number; despesas_sem_fatura: number; mao_de_obra_sem_iva: number;
  custos_totais: number; lucro: number; margem_percent: number; iva_cobrado: number;
  iva_suportado: number; iva_a_entregar: number;
  telemovel?: string; conclusao?: string; equipamentos?: string;
}
export interface Fatura {
  id: string; obra: string; loja_fornecedor: string; nif: string; data: string;
  num_fatura: string; total_sem_iva: number; iva: number; total_com_iva: number;
  foto_anexada: 'Sim' | 'Não';
}
export interface Material {
  id: string; obra: string; loja_fornecedor: string; nif: string; data: string;
  num_fatura: string; artigo: string; categoria: string; quantidade: number;
  unidade: string; preco_unit_sem_iva: number; iva_taxa: number;
  preco_unit_com_iva: number; total_linha_sem_iva: number;
}
export interface Movimento {
  id: string; obra: string; tipo: 'Recebimento' | 'Fatura' | 'Mão de obra' | 'Despesa';
  descricao: string; topico?: string; data: string; total_com_iva: number;
  base_sem_iva: number; iva: number; faturacao_tecnico?: string;
}
export interface DadosFinanceiros {
  controloObras: ControloObra[]; obras: ObraGeral[]; faturas: Fatura[];
  materiais: Material[]; movimentos: Movimento[];
}
