export const tabs = { controlo: 'Controlo de Obras', obras: 'Obras', faturas: 'Faturas', materiais: 'Materiais', movimentos: 'Movimentos' };
export type Tab = keyof typeof tabs;
export function Navbar({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  return <nav className="enat-nav" aria-label="Módulos financeiros">{(Object.entries(tabs) as [Tab, string][]).map(([tab, label]) =>
    <button type="button" key={tab} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => onChange(tab)}>{label}</button>)}</nav>;
}
