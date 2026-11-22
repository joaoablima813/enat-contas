// «Equipamentos sugeridos» na lead: potências calculadas a partir das respostas do cliente ao questionário.
// Usa os mesmos cálculos técnicos do orçamento automático (hvac-calc), com pressupostos sempre indicados.
// É uma primeira estimativa para orientar o orçamento: confirmar na visita ou com as fotos.
import { cargaTermica, multisplit, bombaCalorHabitacao, aqs, carregador } from './hvac-calc.mjs';

const fmt = (n, d = 1) => Number(n).toLocaleString('pt-PT', { maximumFractionDigits: d });
const kwTxt = (kw) => fmt(kw) + ' kW';
const btuTxt = (b) => String(Math.round(b)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' BTU';

// Isolamento a partir do ano da casa, das janelas e do tipo de casa.
export function isolamento(a = {}) {
  const ano = a.ano;
  let lvl = { 'Antes de 1990': 0, '1990 a 2005': 1, '2006 a 2015': 1, 'Depois de 2015': 2, 'Em construção': 2 }[ano] ?? (a.casa === 'Moradia antiga' ? 0 : 1);
  if (a.jan === 'Vidro simples') lvl = Math.max(0, lvl - 1);
  if (a.jan === 'Vidro duplo' && ano === '2006 a 2015') lvl = 2;
  return ['fraco', 'medio', 'bom'][lvl];
}
const ISO_TXT = { fraco: 'isolamento fraco', medio: 'isolamento médio', bom: 'isolamento bom' };
const PESSOAS = { '1 a 2': 2, '3 a 4': 4, '5 ou mais': 6 };
const FATURA = { 'Até 50 €': 40, '50 a 100 €': 75, '100 a 150 €': 125, '150 a 250 €': 200, 'Mais de 250 €': 300 };
const USO = { Sala: 'sala', Quarto: 'quarto', 'Escritório': 'escritorio', Cozinha: 'cozinha', Outra: 'outro' };

// Radiadores: potência a que conseguem dar o calor necessário (elementos de alumínio/ferro ≈ 110 W a ΔT 50 K).
const RAD_W = 110;
const radKw = (elems, ida) => elems * RAD_W * Math.pow(Math.max(0, ida - 2.5 - 20) / 50, 1.3) / 1000;

export function sugestoes(resp) {
  const a = resp?.a || {}, sol = resp?.sol || [], iso = isolamento(a), out = [];

  if (sol.includes('Ar condicionado')) {
    const rooms = Array.isArray(a.ac_rooms) && a.ac_rooms.length ? a.ac_rooms : [];
    if (rooms.length) {
      const c = cargaTermica({ divisoes: rooms.map((r, i) => ({ nome: r.t + (rooms.filter((x) => x.t === r.t).length > 1 ? ' ' + (rooms.slice(0, i + 1).filter((x) => x.t === r.t).length) : ''), area_m2: r.m2, uso: USO[r.t] || 'outro' })), isolamento: iso });
      const linhas = c.divisoes.map((d) => `${d.divisao} (${fmt(d.area_m2, 0)} m²): ${kwTxt(d.potencia_nominal_kw)} · ${btuTxt(d.btu)}`);
      if (c.divisoes.length > 1) {
        const m = multisplit({ interiores_kw: c.divisoes.map((d) => d.potencia_nominal_kw), cargas_kw: c.divisoes.map((d) => Math.max(d.carga_arrefecimento_kw, d.carga_aquecimento_kw)) });
        linhas.push(m.exterior_sugerida ? `Opção multisplit: 1 exterior de ${kwTxt(m.exterior_sugerida.potencia_kw)} com ${m.exterior_sugerida.saidas} saídas` : 'Multisplit: potência acima de uma exterior; dividir em 2 exteriores ou splits individuais');
        linhas.push(`Ou ${c.divisoes.length} splits individuais (1 exterior por divisão)`);
      }
      out.push({ sol: 'Ar condicionado', titulo: 'Ar condicionado', linhas, nota: `Carga por divisão com pé-direito 2,6 m e ${ISO_TXT[iso]}. Divisões com muito vidro ou viradas a poente podem precisar do tamanho acima.` });
    } else {
      out.push({ sol: 'Ar condicionado', titulo: 'Ar condicionado', linhas: [`${a.ac_div || '?'} divisão(ões), sem áreas indicadas`], nota: 'Peça ao cliente a área de cada divisão para calcular a potência.' });
    }
  }

  if (sol.includes('Bomba de calor climatização')) {
    const area = a.m2;
    if (area) {
      const emis = { Radiadores: 'radiadores', 'Piso radiante': 'piso', Ventiloconvectores: 'ventiloconvectores' }[a.bcc_emis] || 'ventiloconvectores';
      const b = bombaCalorHabitacao({ area_m2: area, isolamento: iso, emissores: emis, pessoas_aqs: a.bcc_aqs === 'Sim' ? 4 : 0 });
      const linhas = [`Bomba de calor de ${kwTxt(b.potencia_nominal_kw)} (necessidade estimada ${kwTxt(b.necessidade_aquecimento_kw)})`];
      if (a.bcc_aqs === 'Sim') { const q = aqs({ pessoas: PESSOAS[a.pessoas] || 4 }); linhas.push(`Depósito de água quente (AQS) de ${q.volume_l} L${PESSOAS[a.pessoas] ? ' para ' + a.pessoas + ' pessoas' : ' (pessoas em casa por confirmar)'}`); }
      if (b.inercia_recomendada_l) linhas.push(`Depósito de inércia de ${b.inercia_recomendada_l} L (circuito de aquecimento, ≈10 L por kW)`);
      let nota = `${fmt(area, 0)} m² com ${ISO_TXT[iso]}${a.ano ? ' (casa ' + a.ano.toLowerCase() + (a.jan ? ', ' + a.jan.toLowerCase() : '') + ')' : ''}.`;
      if (emis === 'radiadores' && a.bcc_rad && a.bcc_elem) {
        const elems = a.bcc_rad * a.bcc_elem, need = b.necessidade_aquecimento_kw;
        const at = [45, 55, 65, 75].find((t) => radKw(elems, t) >= need);
        linhas.push(`Radiadores: ${a.bcc_rad} × ${a.bcc_elem} elementos = ${elems} elementos (≈ ${kwTxt(radKw(elems, 55))} a 55 °C)`);
        if (at && at <= 55) linhas.push(`Os radiadores chegam com água a ${at} °C: bomba de calor de média temperatura`);
        else if (at === 65) linhas.push('Precisa de água a 65 °C: bomba de calor de alta temperatura');
        else if (at === 75) linhas.push('Precisa de água a 75 °C: bomba de calor de alta temperatura (75 °C), ou acrescentar elementos para baixar a temperatura');
        else {
          const falta = Math.ceil(need * 1000 / (RAD_W * Math.pow(32.5 / 50, 1.3))) - elems;
          linhas.push(`Mesmo a 75 °C os radiadores só dão ≈ ${kwTxt(radKw(elems, 75))}: para trabalhar a 55 °C faltam cerca de ${falta} elementos (ou ventiloconvectores)`);
          nota += ` Se hoje a casa aquece bem com a caldeira, a necessidade real deve estar mais perto de ${kwTxt(radKw(elems, 75))} do que dos ${kwTxt(need)} estimados: confirme na visita antes de escolher a potência.`;
        }
        nota += ' Radiadores com ≈110 W por elemento a ΔT 50 K.';
      } else if (emis === 'radiadores') nota += ' Sem o número de radiadores e elementos não é possível confirmar a temperatura da água.';
      out.push({ sol: 'Bomba de calor climatização', titulo: 'Bomba de calor (aquecimento)', linhas, nota });
    }
  }

  const pess = PESSOAS[a.pessoas];
  if (sol.includes('Bomba de calor AQS') && pess) {
    const q = aqs({ pessoas: pess });
    out.push({ sol: 'Bomba de calor AQS', titulo: 'Bomba de calor AQS', linhas: [`Depósito de ${q.volume_l} L`], nota: `${a.pessoas} pessoas: 40 a 50 L de água quente por pessoa e por dia; como a bomba de calor aquece devagar, o depósito deve guardar o consumo de um dia (≈ 50 L por pessoa). Com banhos seguidos ou banheira grande, escolher o tamanho acima.` });
  }
  if (sol.includes('Painéis solares térmicos') && PESSOAS[a.pessoas]) {
    const p = PESSOAS[a.pessoas], col = p <= 2 ? 1 : p <= 4 ? 2 : 3, dep = p <= 2 ? 150 : p <= 4 ? 200 : 300;
    out.push({ sol: 'Painéis solares térmicos', titulo: 'Solar térmico', linhas: [`${col} coletor${col > 1 ? 'es' : ''} de ≈2 m² + depósito de ${dep} L`], nota: `${a.pessoas} pessoas, cerca de 50 L de água quente por pessoa e por dia.` });
  }

  if (sol.includes('Painéis fotovoltaicos') && FATURA[a.pv_fat]) {
    const eur = FATURA[a.pv_fat], kwhAno = eur / 0.22 * 12, ev = a.pv_ev === 'Já tenho' || a.pv_ev === 'Em breve';
    const kwp = Math.max(1.5, Math.round(((kwhAno * 0.55) / 1350 + (ev ? 1.5 : 0)) * 2) / 2), paineis = Math.ceil(kwp * 1000 / 450);
    const linhas = [`≈ ${fmt(kwp)} kWp: ${paineis} painéis de 450 W`, `Inversor ${a.fase === 'Trifásica' ? 'trifásico' : a.fase === 'Monofásica' ? 'monofásico' : 'mono ou trifásico (confirmar)'} de ${fmt(Math.max(1.5, Math.round(kwp * 0.9 * 2) / 2))} kW${a.pv_bat === 'Sim' || a.pv_bat === 'Quero saber mais' ? ' (híbrido, para bateria)' : ''}`];
    if (a.pv_bat === 'Sim' || a.pv_bat === 'Quero saber mais') linhas.push(`Bateria de ${fmt(Math.max(5, Math.round(kwhAno / 365 * 0.5)), 0)} kWh`);
    out.push({ sol: 'Painéis fotovoltaicos', titulo: 'Fotovoltaico', linhas, nota: `Fatura de ${a.pv_fat} por mês ≈ ${fmt(kwhAno, 0)} kWh por ano (0,22 €/kWh); dimensionado para cerca de metade do consumo, 1 350 kWh/kWp no Minho${ev ? ', +1,5 kWp pelo carro elétrico' : ''}. Faça o estudo PVGIS no orçamento para confirmar.` });
  }

  if (sol.includes('Piso radiante') && a.m2) {
    const m2 = a.m2, b = bombaCalorHabitacao({ area_m2: m2, isolamento: iso, emissores: 'piso' });
    out.push({ sol: 'Piso radiante', titulo: 'Piso radiante', linhas: [`≈ ${fmt(m2 * 6.7, 0)} m de tubo (passo 15 cm) e coletor de ${Math.ceil(m2 / 15)} saídas`, a.pr_fonte === 'Caldeira' ? 'Fonte de calor: caldeira existente' : `Bomba de calor de ${kwTxt(b.potencia_nominal_kw)}`], nota: `${m2} m² de área útil (confirmar a área efetiva de piso a aquecer).` });
  }
  if (sol.includes('VMC') && a.m2) {
    const m2 = a.m2, caudal = m2 * 2.6 * 0.6, un = [150, 250, 350, 450, 550].find((x) => x >= caudal) || 650;
    out.push({ sol: 'VMC', titulo: 'VMC', linhas: [`Recuperador de calor de ${un} m³/h (caudal necessário ≈ ${fmt(caudal, 0)} m³/h)`], nota: `${m2} m², pé-direito 2,6 m, 0,6 renovações por hora${a.vmc_hum === 'Sim, bastante' ? '; com muita humidade, aumentar a extração nas casas de banho e cozinha' : ''}.` });
  }
  if (sol.includes('Carregador automóvel')) {
    const tri = a.fase === 'Trifásica', dist = { 'Até 10 m': 10, '10 a 25 m': 25, 'Mais de 25 m': 35 }[a.car_dist] || 15;
    const c = carregador({ potencia_kw: tri ? 11 : 7.4, distancia_m: dist });
    out.push({ sol: 'Carregador automóvel', titulo: 'Carregador', linhas: [`Carregador de ${tri ? '11 kW trifásico' : '7,4 kW monofásico'}`, `Cabo ${c.cabo} (≈ ${c.metros} m) e disjuntor ${c.disjuntor}`], nota: c.nota_potencia });
  }
  return out;
}
