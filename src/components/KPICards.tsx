import type { ControloObra } from '../types';
import { formatarEuro, formatarPercent } from '../utils/calculations';
export function KPICards({ obras }: { obras: ControloObra[] }) {
  const soma = (key: keyof ControloObra) => obras.reduce((acc, o) => acc + Number(o[key] || 0), 0);
  const total = soma('orcamento_com_iva'), lucro = soma('lucro_estimado');
  const cards = [
    ['TOTAL ORÇAMENTADO', formatarEuro(total)], ['TOTAL DESPESAS', formatarEuro(soma('despesas_totais'))],
    ['LUCRO ESTIMADO', formatarEuro(lucro)], ['MARGEM MÉDIA', formatarPercent(total > 0 ? lucro / total * 100 : 0)],
    ['VALOR RECEBIDO', formatarEuro(soma('valor_pago'))], ['SALDO A RECEBER', formatarEuro(soma('saldo_a_receber'))],
  ];
  return <dl className="enat-kpis">{cards.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
