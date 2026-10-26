import { useState } from 'react';
import type { DadosFinanceiros } from './types';
import { Navbar, type Tab } from './components/Navbar';
import { ControloObrasView } from './components/ControloObrasView';
import { ObrasView } from './components/ObrasView';
import { FaturasView } from './components/FaturasView';
import { MateriaisView } from './components/MateriaisView';
import { MovimentosView } from './components/MovimentosView';
import './index.css';
// Recebe dados do anfitrião; não mantém uma segunda cópia dos registos financeiros.
export default function App({ dados }: { dados: DadosFinanceiros }) {
  const [activeTab, setActiveTab] = useState<Tab>('controlo');
  return <main className="enat-financas"><Navbar activeTab={activeTab} onChange={setActiveTab} />
    {activeTab === 'controlo' && <ControloObrasView obras={dados.controloObras} />}
    {activeTab === 'obras' && <ObrasView obras={dados.obras} />}
    {activeTab === 'faturas' && <FaturasView faturas={dados.faturas} />}
    {activeTab === 'materiais' && <MateriaisView materiais={dados.materiais} />}
    {activeTab === 'movimentos' && <MovimentosView movimentos={dados.movimentos} />}
  </main>;
}
