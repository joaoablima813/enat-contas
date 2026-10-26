import type { ReactNode } from 'react';
export interface Coluna<T> { titulo: string; valor: (item: T) => ReactNode; numerica?: boolean }
export function FinancialTable<T extends { id: string }>({ dados, colunas, titulo }: {
  dados: T[]; colunas: Coluna<T>[]; titulo: string;
}) {
  return <div className="enat-table-scroll" role="region" aria-label={titulo} tabIndex={0}>
    <table><caption className="sr-only">{titulo}</caption><thead><tr>
      {colunas.map(c => <th key={c.titulo} scope="col" className={c.numerica ? 'numeric' : ''}>{c.titulo}</th>)}
    </tr></thead><tbody>{dados.length ? dados.map(item => <tr key={item.id}>
      {colunas.map(c => <td key={c.titulo} className={c.numerica ? 'numeric' : ''}>{c.valor(item)}</td>)}
    </tr>) : <tr><td colSpan={colunas.length} className="enat-empty">Sem registos. Os dados são preenchidos a partir da app.</td></tr>}</tbody></table>
  </div>;
}
export function Badge({ estado }: { estado: string }) {
  return <span className="enat-badge" data-estado={estado}>{estado}</span>;
}
