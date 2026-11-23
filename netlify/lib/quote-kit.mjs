// Orçamento automático rápido: o servidor monta a lista completa de equipamento, material, acessórios e mão de obra
// a partir dos dados da obra (lidos do pedido pela IA). Os cálculos técnicos e as listas de cada tipologia são fixos,
// por isso a montagem é instantânea e coerente: nada depende de a IA "lembrar-se" de um acessório.
import { cargaTermica, multisplit, linhaFrigorifica, caboEletrico, aqs as aqsCalc, bombaCalorHabitacao, pisoRadiante, ventiloconvectores, vmc as vmcCalc, carregador as evCalc } from './hvac-calc.mjs';

export const KINDS = ['Equipamento', 'Material', 'Acessórios', 'Mão de obra', 'Outros'];
export const UNITS = ['un.', 'm', 'm²', 'm³', 'h', 'dia', 'serviço'];
export const TOPICS = ['VMC', 'Bomba de calor AQS', 'Bomba de calor climatização', 'Ar condicionado', 'Ventiloconvectores', 'UPAC (fotovoltaico)', 'Painéis solares térmicos', 'Carregador automóvel', 'Piso radiante', 'Geral / outros'];
// Quantidades que o utilizador pode indicar no pedido ("30 m de cobre", "25 m de cabo") e que substituem as calculadas.
export const QTY_KEYS = ['cobre', 'cabo_interligacao', 'cabo_alimentacao', 'calha', 'condensados', 'multicamada', 'isolamento', 'tubo_piso', 'conduta'];
// Partes que o utilizador pode pedir para não incluir ("sem calha", "sem mão de obra").
export const EXCLUDE_KEYS = ['calha', 'bomba_condensados', 'gas', 'suporte', 'eletrica', 'diferencial', 'consumiveis', 'desmontagem', 'deslocacao', 'mao_obra', 'equipamento'];

const num = (v, d = null, min = 0, max = 1e6) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : d; };
const up = (n) => Math.ceil(n - 1e-9);
const r1 = (n) => Math.round(n * 10) / 10;
const pt = (n) => String(r1(n)).replace('.', ',');
const clip = (s, n) => String(s ?? '').slice(0, n);
const arr = (a, n = 40) => (Array.isArray(a) ? a.slice(0, n) : []);
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : null);
// Condições para escolher o produto: números como palavras inteiras (o "8" de 8 L não pode bater em "18").
const nRe = (v) => `(^|[^0-9.])${Number.isInteger(Number(v)) ? v + '([.,]0+)?' : String(v).replace('.', '[.,]')}(?![0-9])`;
const fr = (f) => f.replace('/', '\\/');
// Palavras que indicam uma peça de ligação e não o tubo/cabo em si.
const FITTINGS = ['uniao', 'reducao', 'curva', 'joelho', 'porca', 'valvula', 'flange', '\\bte\\b', 'casquilho', 'manga', 'tampa', 'abocard', 'tampao', 'adaptador', 'redutor', 'ferramenta', 'alicate', 'cortador'];
const BTU = { 2: 7000, 2.5: 9000, 3.5: 12000, 4.2: 14000, 5: 18000, 6: 21000, 7.1: 24000, 8.5: 30000, 10: 36000, 12.5: 42000, 14: 48000 };
const btuOf = (kw) => BTU[kw] || Math.round(kw * 3.412) * 1000;

function kit(input) {
  const s = input.spec, ex = new Set(s.excluir), lines = [], checks = [], dim = [], calcs = [], pres = [...s.pressupostos], ask = [...s.perguntas], warn = [];
  const marca = s.marca || input.marca || '';
  let n = 0, circuits = 0;
  // Junta linhas iguais (mesmo produto) somando quantidades; o "ck" liga a linha ao ponto da lista de verificação.
  const add = (l) => {
    if (l.tags?.some((t) => ex.has(t))) return null;
    if (l.categoria === 'Mão de obra' && ex.has('mao_obra')) return null;
    if (l.categoria === 'Equipamento' && ex.has('equipamento')) return null;
    const q = Math.round(Number(l.quantidade) * 100) / 100;
    if (!(q > 0)) return null;
    const same = lines.find((x) => x.descricao === l.descricao && x.categoria === l.categoria && x.tipologia === l.tipologia);
    if (same) { same.quantidade = Math.round((same.quantidade + q) * 100) / 100; if (l.ck) check(l.tipologia, l.ck, same.id); return same; }
    const it = { id: 'i' + (++n), tipologia: l.tipologia, categoria: l.categoria, descricao: l.descricao, especificacao: l.especificacao || '', quantidade: q, unidade: l.unidade || 'un.', pesquisa: (l.pesquisa || []).filter(Boolean).slice(0, 5), exige: l.exige || [], potencia: l.potencia || null, aux: Boolean(l.aux), saidas: l.saidas || null, grupo: l.grupo || '', evita: l.evita || [], mao_obra: l.mao_obra || null, preco_indicado: null, chave: l.chave || null };
    lines.push(it);
    if (l.ck) check(l.tipologia, l.ck, it.id);
    return it;
  };
  const check = (tipologia, ponto, id) => { let c = checks.find((x) => x.tipologia === tipologia && x.ponto === ponto); if (!c) checks.push(c = { tipologia, ponto, estado: 'incluido', itens: [], nota: '' }); if (id && !c.itens.includes(id)) c.itens.push(id); c.estado = 'incluido'; };
  const na = (tipologia, ponto, nota) => { if (!checks.some((x) => x.tipologia === tipologia && x.ponto === ponto)) checks.push({ tipologia, ponto, estado: 'nao_aplica', itens: [], nota }); };
  const labour = (tipologia, id, descricao, quantidade, unidade, ck = 'Mão de obra', chave = null) => add({ tipologia, categoria: 'Mão de obra', mao_obra: id, descricao, quantidade, unidade, ck, chave });
  const quadro = (v) => num(v, null, 0.5, 300) ?? num(s.distancia_quadro_m, null, 0.5, 300);
  const quadroDefault = (tip, v) => { const d = quadro(v); if (d) return d; pres.push(`${tip}: 10 m de cabo do quadro elétrico ao equipamento (distância não indicada).`); return 10; };
  // Circuito elétrico dedicado: cabo, disjuntor e ligação (o diferencial é comum à obra).
  const electric = (tip, calc, label) => {
    if (ex.has('eletrica')) { na(tip, 'Circuito elétrico e proteção', 'excluído no pedido'); return; }
    calcs.push({ nome: 'cabo_eletrico', nota: `${label}: ${calc.nota}` });
    const sec = String(calc.seccao_mm2).replace('.', ',');
    add({ tipologia: tip, categoria: 'Material', chave: 'cabo_alimentacao', ck: 'Circuito elétrico e proteção', descricao: `Cabo de alimentação ${calc.cabo}`, especificacao: calc.tipo_cabo, quantidade: calc.metros, unidade: 'm', pesquisa: [`cabo ${calc.cabo.replace(' mm²', '')}`, `cabo h07rn-f ${calc.cabo.replace(' mm²', '')}`, `cabo xv ${calc.cabo.replace(' mm²', '').replace('G', 'x')}`], exige: [[`${calc.cabo[0]}\\s?[gx]\\s?${String(calc.seccao_mm2).replace('.', '[.,]')}(?![0-9])`]] });
    const a = parseInt(calc.disjuntor, 10), tri = /tetrapolar/.test(calc.disjuntor);
    add({ tipologia: tip, categoria: 'Material', tags: ['eletrica'], ck: 'Circuito elétrico e proteção', descricao: `Disjuntor ${a} A curva C ${tri ? '4P (3P+N)' : '1P+N'}`, quantidade: 1, unidade: 'un.', pesquisa: [`disjuntor ${tri ? '4p' : '1p+n'} ${a}a`, `disjuntor ${a}a curva c`, `disjuntor ${a} a`], exige: [[nRe(a) + '\\s?a']] });
    labour(tip, 'eletrica', 'Circuito elétrico dedicado e ligação ao quadro', 1, 'un.', 'Circuito elétrico e proteção');
    circuits++;
    if (calc.diferencial && /DC 6 mA/.test(calc.diferencial)) add({ tipologia: tip, categoria: 'Material', tags: ['eletrica', 'diferencial'], ck: 'Circuito elétrico e proteção', descricao: 'Interruptor diferencial 40 A 30 mA tipo A com deteção DC 6 mA (ou tipo B)', quantidade: 1, pesquisa: ['diferencial tipo b 40a 30ma', 'diferencial tipo a 40a 30ma', 'interruptor diferencial 30ma'], exige: [['30\\s?ma']] });
  };
  const eqTerms = (modelo, terms) => [modelo, ...terms].filter(Boolean).map((t) => clip(t, 80));
  const condensadosPump = (tip, ck, qty) => { if (ex.has('bomba_condensados')) return na(tip, ck, 'excluída no pedido'); add({ tipologia: tip, categoria: 'Acessórios', tags: ['bomba_condensados'], ck, descricao: 'Bomba de condensados', quantidade: qty, pesquisa: ['bomba condensados', 'bomba de condensados mini', 'bomba condensados ar condicionado'] }); };

  // ---------- Ar condicionado ----------
  const ac = s.ac;
  if (ac) {
    const T = 'Ar condicionado';
    const rooms = ac.divisoes.length ? ac.divisoes : [{ nome: 'Divisão', area_m2: 20 }];
    if (!ac.divisoes.length) pres.push('Ar condicionado: uma divisão de 20 m² (áreas não indicadas).');
    const carga = cargaTermica({ divisoes: rooms.map((r) => ({ nome: r.nome, area_m2: r.area_m2 ?? 15, uso: r.uso, exposicao: r.exposicao })), isolamento: s.isolamento });
    calcs.push({ nome: 'carga_termica', nota: carga.criterio });
    rooms.forEach((r, i) => { if (r.area_m2 == null && r.potencia_kw == null) pres.push(`${r.nome}: 15 m² (área não indicada).`); });
    const units = rooms.map((r, i) => {
      const c = carga.divisoes[i], kw = r.potencia_kw ?? c.potencia_nominal_kw, tipo = r.tipo || (kw > 7.1 ? 'conduta' : 'mural');
      dim.push({ titulo: `${r.nome}${r.area_m2 ? ' ' + pt(r.area_m2) + ' m²' : ''}`, detalhe: r.potencia_kw ? `${tipo} ${pt(kw)} kW (${btuOf(kw)} BTU, indicado no pedido)` : `carga ${pt(Math.max(c.carga_arrefecimento_kw, c.carga_aquecimento_kw))} kW → ${tipo} ${pt(kw)} kW (${c.btu} BTU)` });
      let linha = r.linha_m; if (linha == null) { linha = 5; pres.push(`${r.nome}: 5 m de linha frigorífica (distância não indicada).`); }
      return { ...r, kw, tipo, btu: r.potencia_kw ? btuOf(kw) : c.btu, linha };
    });
    const multi = ac.sistema === 'multi' && units.length > 1;
    const pw = (u) => [[nRe(u.kw) + '\\s?kw', nRe(u.btu)]];
    const exts = [];
    if (multi) {
      const m = multisplit({ interiores_kw: units.map((u) => u.kw), cargas_kw: carga.divisoes.map((d) => Math.max(d.carga_arrefecimento_kw, d.carga_aquecimento_kw)) });
      calcs.push({ nome: 'multisplit', nota: m.nota });
      for (const u of units) add({ tipologia: T, categoria: 'Equipamento', ck: 'Unidades interiores', descricao: `Unidade interior ${u.tipo} multisplit ${pt(u.kw)} kW (${u.btu} BTU)${marca ? ' ' + marca : ''}`, especificacao: `${u.tipo} ${pt(u.kw)} kW para multisplit`, quantidade: 1, pesquisa: eqTerms(u.modelo, [`${marca} ${u.tipo} multisplit ${pt(u.kw)} kW`, `${marca} unidade interior ${u.tipo} ${pt(u.kw)}`, `${marca} interior multi ${u.btu}`, `multi split unidade interior ${u.btu}`, `unidade interior ${u.tipo} ${pt(u.kw)} kw`]), potencia: u.kw, exige: pw(u), grupo: 'ar condicionado', evita: ['exterior', 'caixa de distribuicao', '\\bue\\b', 'ui ?\\+ ?ue', 'conjunto', 'mono-?split', 'acessorio', 'comando', 'kit '] });
      const kw = ac.exterior_kw ?? m.exterior_sugerida?.potencia_kw ?? r1(m.potencia_exterior_minima_kw), saidas = Math.max(units.length, m.exterior_sugerida?.saidas || units.length);
      if (!m.exterior_sugerida && !ac.exterior_kw) warn.push(m.nota);
      dim.push({ titulo: 'Unidade exterior multisplit', detalhe: `${units.length} interiores (soma ${pt(m.soma_interiores_kw)} kW) → ${pt(kw)} kW com ${saidas} saídas` });
      add({ tipologia: T, categoria: 'Equipamento', ck: 'Unidade exterior', descricao: `Unidade exterior multisplit ${pt(kw)} kW, ${saidas} saídas${marca ? ' ' + marca : ''}`, especificacao: `exterior multisplit ${pt(kw)} kW com pelo menos ${units.length} saídas`, quantidade: 1, pesquisa: eqTerms(ac.modelo_exterior, [`${marca} exterior multisplit ${saidas} saidas`, `${marca} multi ${saidas}x ${pt(kw)} kW`, `${marca} unidade exterior multi ${pt(kw)}`, `exterior multisplit ${pt(kw)} kw`, `multi split unidade exterior`]), exige: [[nRe(kw) + '\\s?kw', `${saidas}\\s?(x|saidas|portas|vias|u)`, nRe(Math.round(kw * 3412 / 1000) * 1000)]], potencia: kw, saidas, grupo: 'ar condicionado', evita: ['unidade interior', 'caixa de distribuicao', 'distribuidor', 'multi ?\+', 'aqs', 'hidro', 'iwt', 'deposito', 'ui ?\\+ ?ue', 'conjunto', 'mono-?split', 'consola', 'cassete', 'conduta', 'mural', 'acessorio', 'comando'] });
      exts.push(kw);
      na(T, 'Redutores/adaptadores de diâmetro (multisplit)', 'confirmar com os diâmetros das saídas do modelo escolhido');
      warn.push('Multisplit: confirme no modelo da exterior se as saídas precisam de redutores/adaptadores de diâmetro.');
    } else {
      for (const u of units) {
        add({ tipologia: T, categoria: 'Equipamento', ck: 'Unidades interiores e exteriores', descricao: `Ar condicionado ${u.tipo} ${pt(u.kw)} kW (${u.btu} BTU)${marca ? ' ' + marca : ''} – conjunto interior + exterior`, especificacao: `monosplit ${u.tipo} ${pt(u.kw)} kW`, quantidade: 1, pesquisa: eqTerms(u.modelo, [`${marca} ${u.tipo} ${pt(u.kw)} kW`, `${marca} conjunto ${u.tipo} ${pt(u.kw)}`, `${marca} ${u.btu} btu`, `mono split ${u.tipo} ${u.btu}`, `conjunto ${u.tipo} ${u.btu} btu`, `ar condicionado ${u.tipo} ${pt(u.kw)} kw`]), potencia: u.kw, exige: [...pw(u), ['conjunto', 'ui ?\\+ ?ue', 'mono-?split', 'interior ?\\+ ?exterior', '\\+ ?r[xk]']], grupo: 'ar condicionado', evita: ['multi', 'acessorio', 'comando', 'kit '] });
        exts.push(u.kw);
      }
    }
    // Uma linha frigorífica por interior.
    let gas = 0, calha = 0, calhaAc = 0;
    for (const u of units) {
      const l = linhaFrigorifica({ potencia_kw: u.kw, distancia_m: u.linha, percurso_a_vista_m: u.calha_m ?? undefined, carga_incluida_m: ac.carga_incluida_m ?? 7 });
      calcs.push({ nome: 'linha_frigorifica', nota: `${u.nome}: ${l.diametros}, ${l.nota}` });
      const [liq, gs] = l.diametros.match(/\d\/\d/g);
      for (const d of [liq, gs]) add({ tipologia: T, categoria: 'Material', chave: 'cobre', ck: 'Par de cobre pré-isolado por linha', descricao: `Tubo de cobre isolado para refrigeração ${d}"`, especificacao: `tubo de cobre frigorífico isolado ${d}" (linha ${l.diametros})`, quantidade: l.par_cobre_isolado_m, unidade: 'm', pesquisa: [`tubo cobre refrigeracao isolado ${d}`, `tubo cobre isolado ${d}`, `cobre frigorifico isolado ${d}`, `tubo cobre isolado ${d} rolo`], exige: [[`(^|[^0-9/])${fr(d)}(?![0-9])`], ['isolad']], grupo: 'cobre', evita: [...FITTINGS, '\\d\\/\\d\\s?"?\\s?x\\s?\\d\\/\\d', 'nao isolado', 'sem isolamento'] });
      add({ tipologia: T, categoria: 'Material', chave: 'cabo_interligacao', ck: 'Cabo de interligação', descricao: `Cabo de interligação ${l.cabo_interligacao.tipo.replace(/ \(.*/, '')}`, quantidade: l.cabo_interligacao.metros, unidade: 'm', grupo: 'cabo', evita: ['ebara', 'bomba'], pesquisa: [`cabo h07rn-f ${l.cabo_interligacao.tipo.match(/\dG1,5/)[0]}`, `cabo ${l.cabo_interligacao.tipo.match(/\dG1,5/)[0]}`, `cabo borracha ${l.cabo_interligacao.tipo.match(/\d/)[0]}x1,5`], exige: [[`${l.cabo_interligacao.tipo.match(/(\d)G/)[1]}\\s?[gx]\\s?1[.,]5(?![0-9])`]] });
      if (u.esgoto === false) {
        condensadosPump(T, 'Esgoto de condensados', 1);
        add({ tipologia: T, categoria: 'Material', chave: 'condensados', ck: 'Esgoto de condensados', descricao: 'Tubo de condensados (bomba até ao esgoto)', quantidade: l.tubo_condensados_m, unidade: 'm', pesquisa: ['mangueira cristal 16', 'tubo condensados 16', 'mangueira cristal', 'tubo pvc esgoto 32'], evita: ['drenagem', 'saneamento', 'piscina', 'terra', 'rega', 'seko', 'gas'] });
      } else {
        if (u.esgoto == null && !ask.some((q) => /esgoto/i.test(q))) ask.push('Há esgoto por gravidade junto das unidades interiores? (sem esgoto leva bomba de condensados)');
        add({ tipologia: T, categoria: 'Material', chave: 'condensados', ck: 'Esgoto de condensados', descricao: 'Tubo de esgoto de condensados 16/20 mm com acessórios', quantidade: l.tubo_condensados_m, unidade: 'm', pesquisa: ['tubo pvc esgoto 32', 'tubo esgoto domestico 32', 'mangueira cristal 16', 'tubo condensados 16'], evita: ['drenagem', 'saneamento', 'piscina', 'terra', 'rega', 'seko', 'gas'] });
      }
      calha += l.calha_tecnica_m; calhaAc += l.acessorios_calha_un; gas += l.gas_adicional_g;
      add({ tipologia: T, categoria: 'Acessórios', ck: 'Furação e passa-muros', descricao: 'Passa-muros para linha frigorífica', quantidade: 1, pesquisa: ['passa muros ar condicionado', 'passa muros calha', 'casquilho passa muros'], evita: ['roscar', 'pvc \\[', 'pp\\b', 'colar'] });
      if (ac.wifi) add({ tipologia: T, categoria: 'Acessórios', ck: 'Comando / wifi', descricao: `Módulo wifi${marca ? ' ' + marca : ''}`, quantidade: 1, pesquisa: [`${marca} wifi`, `modulo wifi ar condicionado`, `${marca} kit wifi`] });
    }
    if (!ac.wifi) na(T, 'Comando / wifi', 'comando incluído com a unidade; wifi não pedido');
    if (ex.has('calha')) na(T, 'Calha técnica e acessórios', 'excluída no pedido');
    else {
      add({ tipologia: T, categoria: 'Material', chave: 'calha', tags: ['calha'], ck: 'Calha técnica e acessórios', descricao: 'Calha técnica para ar condicionado', quantidade: calha, unidade: 'm', pesquisa: ['calha ar condicionado', 'calha tecnica ar condicionado', 'calha pelicula ar condicionado', 'calha tecnica 80x60'], grupo: 'calha', evita: ['suporte', 'tapa', 'angulo', 'curva', 'terminal', 'uniao', 'juncao', 'derivacao', 'tampa', 'bloqueio', 'acessorio', 'passa muros', 'te '] });
      add({ tipologia: T, categoria: 'Acessórios', tags: ['calha'], ck: 'Calha técnica e acessórios', descricao: 'Acessórios de calha (curvas, uniões, terminais)', quantidade: calhaAc, pesquisa: ['curva plana calha ar condicionado', 'angulo calha ar condicionado', 'curva calha ar condicionado', 'tapa junta calha ar condicionado'], grupo: 'calha' });
    }
    if (gas > 0 && !ex.has('gas')) { const kg = Math.ceil(gas / 100) / 10; add({ tipologia: T, categoria: 'Material', tags: ['gas'], ck: 'Gás refrigerante adicional', descricao: `Gás refrigerante R32 adicional (${pt(kg)} kg)`, especificacao: `${gas} g de carga adicional`, quantidade: kg, unidade: 'un.', pesquisa: ['gas r32', 'garrafa r32', 'refrigerante r32'], exige: [['garrafa', 'botija', 'gas refrigerante', '\\bkg\\b']], evita: ['detetor', 'valvula', 'recupera', 'ferramenta', 'manometro', 'bomba', 'unidade', 'vrf', 'sifao', 'split'] }); }
    else na(T, 'Gás refrigerante adicional', ex.has('gas') ? 'excluído no pedido' : 'linhas dentro da carga de fábrica');
    const nExt = exts.length;
    if (ex.has('suporte')) na(T, 'Suporte e antivibráticos da exterior', 'excluído no pedido');
    else {
      const sup = ac.suporte || 'parede';
      add({ tipologia: T, categoria: 'Acessórios', tags: ['suporte'], ck: 'Suporte e antivibráticos da exterior', descricao: sup === 'parede' ? 'Suporte de parede para unidade exterior (par)' : 'Apoios de chão/telhado para unidade exterior (par)', quantidade: nExt, pesquisa: sup === 'parede' ? ['suporte ar condicionado', 'suporte parede ar condicionado', 'suporte parede unidade exterior', 'suporte mural ar condicionado'] : ['suporte chao ar condicionado', 'apoio chao unidade exterior', 'base apoio ar condicionado'], grupo: 'ar condicionado|suporte', evita: sup === 'parede' ? ['chao', 'calha', 'bloqueio', 'vaso', 'antivibr', 'tubo'] : ['parede', 'calha', 'vaso', 'antivibr'] });
      add({ tipologia: T, categoria: 'Acessórios', tags: ['suporte'], ck: 'Suporte e antivibráticos da exterior', descricao: 'Apoios antivibráticos (jogo de 4)', quantidade: nExt, pesquisa: ['kit antivibratico unidade exterior', 'kit antivibratico suporte', 'apoios antivibraticos', 'antivibratico ar condicionado'], grupo: 'ar condicionado|suporte' });
    }
    if (!ex.has('consumiveis')) add({ tipologia: T, categoria: 'Outros', tags: ['consumiveis'], ck: 'Consumíveis', descricao: 'Consumíveis de instalação (fita de acabamento, abraçadeiras, buchas, parafusos, espuma)', quantidade: 1, unidade: 'serviço', pesquisa: ['fita acabamento ar condicionado', 'fita pvc ar condicionado'] });
    const dq = quadroDefault(T, ac.distancia_quadro_m);
    exts.forEach((kw, i) => electric(T, caboEletrico({ potencia_termica_kw: kw, distancia_m: dq }), nExt > 1 ? `Exterior ${i + 1}` : 'Unidade exterior'));
    const totalLinha = units.reduce((t, u) => t + linhaFrigorifica({ potencia_kw: u.kw, distancia_m: u.linha }).par_cobre_isolado_m, 0);
    if (multi) { labour(T, 'ac_ui', 'Instalação de unidade interior (multisplit)', units.length, 'un.'); labour(T, 'ac_ue', 'Instalação de unidade exterior (multisplit)', 1, 'un.'); }
    else labour(T, 'ac_mono', 'Instalação de ar condicionado monosplit (interior + exterior)', units.length, 'un.');
    labour(T, 'linha', 'Execução de linha frigorífica', totalLinha, 'm', 'Mão de obra', 'cobre');
    if (!ex.has('calha')) labour(T, 'calha', 'Montagem de calha técnica', calha, 'm', 'Mão de obra', 'calha');
    labour(T, 'vacuo', 'Vácuo, ensaio de estanquidade e arranque', nExt, 'un.');
    labour(T, 'furo', 'Furação / caroteamento de parede', units.length, 'un.', 'Furação e passa-muros');
  }

  // ---------- Bomba de calor AQS ----------
  const aq = s.aqs;
  if (aq) {
    const T = 'Bomba de calor AQS';
    if (aq.pessoas == null && aq.volume_l == null) pres.push('Bomba de calor AQS: 4 pessoas (não indicado).');
    const c = aqsCalc({ pessoas: aq.pessoas ?? 4, distancia_m: aq.distancia_m ?? 3 });
    const V = aq.volume_l ?? c.volume_l, vaso = V <= 150 ? 8 : V <= 300 ? 12 : 18;
    calcs.push({ nome: 'aqs', nota: c.nota });
    dim.push({ titulo: 'Águas quentes', detalhe: aq.volume_l ? `${V} L (indicado no pedido)` : `${c.nota} Vaso de expansão ${vaso} L.` });
    add({ tipologia: T, categoria: 'Equipamento', ck: 'Bomba de calor AQS', descricao: `Bomba de calor para AQS ${V} L${marca ? ' ' + marca : ''}`, especificacao: `bomba de calor AQS ${V} litros`, quantidade: 1, pesquisa: eqTerms(aq.modelo, [`${marca} bomba calor ${V}`, `bomba de calor aqs ${V} l`, `termoacumulador bomba calor ${V}`, `bomba calor ${V} litros`, `bomba calor klin ${V}`]), exige: [[nRe(V), `kl0?${Math.round(V / 10)}`]], grupo: 'bomba de calor aqs|bombas de calor aqs', evita: ['anodo', 'kit solar', 'kit fotovoltaico', 'acessorio', 'modulo wi-?fi', 'sonda'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Grupo de segurança', descricao: 'Grupo de segurança hidráulico 7 bar 3/4"', quantidade: 1, pesquisa: ['grupo seguranca hidraulico', 'grupo seguranca termoacumulador', 'grupo seguranca 3/4'], exige: [['grupo']], evita: ['horizontal'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Grupo de segurança', descricao: 'Sifão / funil de descarga da válvula de segurança', quantidade: 1, pesquisa: ['sifao funil descarga', 'funil descarga valvula seguranca', 'sifao grupo seguranca'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Vaso de expansão sanitário', descricao: `Vaso de expansão sanitário ${vaso} L`, quantidade: 1, pesquisa: [`vaso expansao sanitario ${vaso}`, `vaso expansao ${vaso} l agua sanitaria`, `vaso expansao ${vaso}`], exige: [[nRe(vaso) + '\\s?l']] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Vaso de expansão sanitário', descricao: 'Suporte de vaso de expansão com ligação', quantidade: 1, pesquisa: ['suporte vaso expansao', 'kit fixacao vaso expansao'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Válvula misturadora termostática', descricao: 'Válvula misturadora termostática 3/4"', quantidade: 1, pesquisa: ['valvula misturadora termostatica 3/4', 'misturadora termostatica', 'valvula termostatica aqs'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Válvulas de corte e manguitos dielétricos', descricao: 'Válvula de esfera 3/4"', quantidade: 2, pesquisa: ['valvula esfera 3/4', 'torneira esfera 3/4', 'torneira passagem 3/4'], exige: [['3\\/4']], evita: ['jardim', 'mangueira', 'lavatorio', 'maquina'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Válvulas de corte e manguitos dielétricos', descricao: 'Manguito dielétrico 3/4"', quantidade: 2, pesquisa: ['manguito dieletrico 3/4', 'uniao dieletrica 3/4', 'casquilho dieletrico 3/4'], exige: [['3\\/4'], ['dieletric']] });
    add({ tipologia: T, categoria: 'Material', chave: 'multicamada', ck: 'Tubagem e isolamento', descricao: 'Tubo multicamada 20×2 mm', quantidade: aq.tubo_m ?? c.tubagem_multicamada_m, unidade: 'm', pesquisa: ['tubo multicamada 20x2', 'multicamada 20', 'tubo multicamada 20 mm'], exige: [['20\\s?x\\s?2']], grupo: 'multicamada|tubo', evita: FITTINGS });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Tubagem e isolamento', descricao: 'Acessórios de multicamada 20 mm (uniões, curvas, tês)', quantidade: 4, pesquisa: ['uniao multicamada 20', 'curva multicamada 20', 'acessorio multicamada 20'] });
    add({ tipologia: T, categoria: 'Material', chave: 'isolamento', ck: 'Tubagem e isolamento', descricao: 'Isolamento térmico para tubo 20 mm (água quente)', quantidade: Math.ceil((aq.tubo_m ?? c.tubagem_multicamada_m) / 2), unidade: 'm', pesquisa: ['isolamento tubo 22', 'isolamento isopipe 22', 'isolamento armaflex 22', 'isolamento tubo 20'], grupo: 'isolament', exige: [['(^|[^0-9])2[02](?![0-9])']] });
    add({ tipologia: T, categoria: 'Material', chave: 'condensados', ck: 'Esgoto de condensados', descricao: 'Tubo de esgoto PVC 32 mm (condensados e válvula de segurança) com acessórios', quantidade: 3, unidade: 'm', pesquisa: ['tubo pvc 32', 'tubo esgoto 32', 'tubo pvc esgoto 32 mm'] });
    if (aq.espaco_fechado) add({ tipologia: T, categoria: 'Acessórios', ck: 'Kit de condutas de ar', descricao: 'Kit de condutas de ar (admissão e expulsão) para bomba de calor AQS', quantidade: 1, pesquisa: [`${marca} kit conduta bomba calor`, 'kit condutas bomba calor aqs', 'conduta 160 bomba calor'] });
    else na(T, 'Kit de condutas de ar', 'instalada em espaço com renovação de ar (confirmar)');
    const dq = quadroDefault(T, aq.distancia_quadro_m);
    electric(T, caboEletrico({ potencia_w: V >= 260 ? 2500 : 2000, distancia_m: dq }), 'Bomba de calor AQS');
    labour(T, 'bc_aqs', 'Instalação de bomba de calor AQS (ligações hidráulicas e arranque)', 1, 'un.');
    if (aq.remover_antigo) labour(T, 'desmontagem', 'Desmontagem e remoção do equipamento antigo', 1, 'un.', 'Desmontagem do equipamento antigo');
    else na(T, 'Desmontagem do equipamento antigo', aq.remover_antigo === false ? 'não há equipamento a remover' : 'confirmar se existe termoacumulador/esquentador a remover');
    if (aq.remover_antigo == null) ask.push('Há termoacumulador ou esquentador antigo para remover?');
  }

  // ---------- Bomba de calor de climatização (também usada como produção para ventiloconvectores) ----------
  const heatPump = (b, T, forced) => {
    const area = b.area_m2 ?? s.area_total_m2 ?? null;
    if (area == null && b.potencia_kw == null) pres.push(`${T}: 120 m² aquecidos (área não indicada).`);
    const c = bombaCalorHabitacao({ area_m2: area ?? 120, isolamento: s.isolamento, emissores: b.emissores || forced || 'piso', pessoas_aqs: b.aqs ? (b.pessoas ?? 4) : 0 });
    const kw = b.potencia_kw ?? c.potencia_nominal_kw, mono = b.monobloco !== false;
    calcs.push({ nome: 'bomba_calor_habitacao', nota: c.nota });
    dim.push({ titulo: 'Bomba de calor', detalhe: b.potencia_kw ? `${pt(kw)} kW (indicado no pedido)` : c.nota });
    add({ tipologia: T, categoria: 'Equipamento', ck: 'Bomba de calor', descricao: `Bomba de calor ar-água ${mono ? 'monobloco' : 'split (exterior + módulo hidráulico)'} ${pt(kw)} kW${marca ? ' ' + marca : ''}`, especificacao: `bomba de calor ar-água ${pt(kw)} kW, ida a ${c.temperatura_ida_c} °C`, quantidade: 1, pesquisa: eqTerms(b.modelo, [`${marca} bomba calor ${mono ? 'monobloco' : 'split'} ${pt(kw)} kW`, `${marca} bomba de calor ${pt(kw)} kw`, `bomba calor ar agua ${pt(kw)} kw`, `bomba calor ${mono ? 'monobloco' : 'split'} ${pt(kw)}kw`, `${marca} aquecimento ${pt(kw)} kw`]), potencia: kw, exige: [[nRe(kw) + '\\s?kw', nRe(kw)]], grupo: 'bomba de calor climatizacao|bombas de calor', evita: [...(mono ? ['unidade exterior', 'modulo hidraulico', '\\bsplit\\b'] : ['monobloco']), ...(kw > 12 ? [] : ['trifasic']), 'piscina', 'aqs', 'acumulador', 'deposito', 'ventilo', 'kit solar', 'kit fotovoltaico', 'anodo', 'comando', 'controlador', 'sonda', 'acessorio', 'consola', 'unidade interior', 'multi v'] });
    if (b.aqs) {
      const a = aqsCalc({ pessoas: b.pessoas ?? 4 }), V = b.volume_aqs_l ?? Math.max(a.volume_l, 150);
      add({ tipologia: T, categoria: 'Equipamento', ck: 'Depósito de AQS', descricao: `Depósito de AQS ${V} L para bomba de calor (serpentina de grande superfície)`, aux: true, quantidade: 1, pesquisa: [`${marca} deposito aqs ${V}`, `deposito bomba calor ${V} l`, `acumulador aqs ${V} litros`, `termoacumulador serpentina ${V}`], exige: [[nRe(V)]], evita: ['eletrico', 'resistencia', 'solar', 'anodo'] });
      add({ tipologia: T, categoria: 'Acessórios', ck: 'Válvula de 3 vias', descricao: 'Válvula de 3 vias desviadora AQS/aquecimento', quantidade: 1, pesquisa: ['valvula 3 vias desviadora', 'valvula 3 vias 1', 'valvula desviadora aqs'] });
      add({ tipologia: T, categoria: 'Acessórios', ck: 'Depósito de AQS', descricao: 'Grupo de segurança sanitário 7 bar e vaso de expansão sanitário', quantidade: 1, pesquisa: ['grupo seguranca 3/4', 'vaso expansao sanitario 12'] });
    } else na(T, 'Depósito de AQS', 'sem produção de AQS pela bomba de calor');
    const iner = b.inercia_l ?? c.inercia_recomendada_l;
    if (iner) add({ tipologia: T, categoria: 'Equipamento', ck: 'Depósito de inércia', descricao: `Depósito de inércia ${iner} L`, aux: true, quantidade: 1, pesquisa: [`deposito inercia ${iner}`, `deposito inercia ${iner} l`, `inercia ${iner} litros`], exige: [[nRe(iner)], ['inercia']], evita: ['termoacumulador', 'serpentina', 'sanitari'] });
    else na(T, 'Depósito de inércia', 'piso radiante com volume de água suficiente (confirmar volume mínimo do modelo)');
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Vaso de expansão e segurança', descricao: `Vaso de expansão de aquecimento ${c.vaso_expansao_aquecimento_l} L`, quantidade: 1, pesquisa: [`vaso expansao aquecimento ${c.vaso_expansao_aquecimento_l}`, `vaso expansao ${c.vaso_expansao_aquecimento_l} l`], exige: [[nRe(c.vaso_expansao_aquecimento_l)]] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Vaso de expansão e segurança', descricao: 'Válvula de segurança 3 bar e manómetro', quantidade: 1, pesquisa: ['valvula seguranca 3 bar', 'valvula seguranca aquecimento 1/2', 'valvula seguranca 3bar'], exige: [['(^|[^0-9])3 ?bar']] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Filtro e válvulas de corte', descricao: 'Filtro magnético / separador de sujidades 1"', quantidade: 1, pesquisa: ['filtro magnetico 1', 'separador sujidades magnetico', 'filtro magnetico aquecimento'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Filtro e válvulas de corte', descricao: 'Válvula de esfera 1"', quantidade: 2, pesquisa: ['valvula esfera 1"', 'torneira esfera 1"', 'valvula esfera 1 polegada'], exige: [['(^|[^0-9/.])1(?![0-9/.,])', '(^|[^0-9/])1 ?pol']], evita: ['jardim', 'mangueira', 'lavatorio', 'maquina'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Ligações e apoios', descricao: 'Ligação flexível antivibrática 1"', quantidade: 2, pesquisa: ['flexivel antivibratico 1', 'ligacao flexivel antivibratica', 'tubo flexivel bomba calor', 'manga antivibratica 1'], evita: ['cromad', 'lavatorio', 'torneira', 'autoclismo', 'gas', 'chuveiro'] });
    add({ tipologia: T, categoria: 'Acessórios', tags: ['suporte'], ck: 'Ligações e apoios', descricao: 'Apoios antivibráticos / base para a unidade exterior', quantidade: 1, pesquisa: ['suporte chao ar condicionado', 'kit antivibratico chao', 'apoio chao unidade exterior', 'base apoio bomba calor'], grupo: 'ar condicionado|suporte|bomba' });
    if (mono) add({ tipologia: T, categoria: 'Acessórios', ck: 'Proteção anticongelação', descricao: 'Válvula anticongelação 1"', quantidade: 2, pesquisa: ['valvula anticongelacao 1', 'valvula anti gelo bomba calor', 'freeze protection valve'] });
    else na(T, 'Proteção anticongelação', 'sistema split: água só no interior');
    const dist = b.distancia_m ?? 5;
    if (b.distancia_m == null) pres.push(`${T}: 5 m de tubagem entre a unidade exterior e a casa das máquinas.`);
    add({ tipologia: T, categoria: 'Material', chave: 'multicamada', ck: 'Tubagem hidráulica isolada', descricao: 'Tubo multicamada 32×3 mm (ida e retorno)', quantidade: up(2 * (dist + 1)), unidade: 'm', pesquisa: ['tubo multicamada 32x3', 'multicamada 32', 'tubo multicamada 32 mm'], exige: [['32\\s?x\\s?3']], grupo: 'multicamada|tubo', evita: FITTINGS });
    add({ tipologia: T, categoria: 'Material', chave: 'isolamento', ck: 'Tubagem hidráulica isolada', descricao: 'Isolamento para exterior tubo 32 mm (com proteção UV)', quantidade: up(2 * (dist + 1)), unidade: 'm', pesquisa: ['isolamento tubo 35', 'isolamento isopipe 35', 'armaflex 35', 'isolamento tubo 32'], grupo: 'isolament', exige: [['(^|[^0-9])3[25](?![0-9])']] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Tubagem hidráulica isolada', descricao: 'Acessórios de multicamada 32 mm', quantidade: 6, pesquisa: ['uniao multicamada 32', 'curva multicamada 32', 'acessorio multicamada 32'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Controlo', descricao: 'Termóstato / controlador de ambiente', quantidade: 1, pesquisa: [`${marca} termostato ambiente`, 'termostato ambiente', 'controlador remoto bomba calor'] });
    add({ tipologia: T, categoria: 'Material', ck: 'Purga, enchimento e inibidor', descricao: 'Purgadores automáticos e aditivo inibidor para o circuito', quantidade: 1, pesquisa: ['inibidor aquecimento', 'purgador automatico 1/2', 'aditivo inibidor corrosao'] });
    const dq = quadroDefault(T, b.distancia_quadro_m);
    electric(T, caboEletrico({ potencia_termica_kw: kw, distancia_m: dq, trifasico: kw > 12 }), 'Bomba de calor');
    labour(T, 'bc_clima', 'Instalação de bomba de calor de climatização (enchimento, purga e arranque)', 1, 'un.');
    labour(T, 'hidraulica', 'Tubagem hidráulica', up(2 * (dist + 1)), 'm', 'Mão de obra', 'multicamada');
  };
  if (s.bc) heatPump(s.bc, 'Bomba de calor climatização');

  // ---------- Ventiloconvectores ----------
  const vc = s.ventilo;
  if (vc) {
    const T = 'Ventiloconvectores';
    const rooms = vc.divisoes.length ? vc.divisoes : [{ nome: 'Divisão', area_m2: 20 }];
    const c = ventiloconvectores({ divisoes: rooms.map((r) => ({ nome: r.nome, area_m2: r.area_m2 ?? 15, uso: r.uso, distancia_m: r.distancia_m ?? undefined })), isolamento: s.isolamento, distancia_media_m: 8 });
    calcs.push({ nome: 'ventiloconvectores', nota: c.nota });
    rooms.forEach((r, i) => {
      const u = c.unidades[i], kw = r.potencia_kw ?? u.potencia_necessaria_kw, modelo = r.modelo_tipo || 'mural';
      if (r.distancia_m == null) pres.push(`${r.nome}: 8 m de tubagem até à produção.`);
      dim.push({ titulo: r.nome, detalhe: `ventiloconvector ${modelo} ≥ ${pt(kw)} kW, multicamada ${u.multicamada}` });
      add({ tipologia: T, categoria: 'Equipamento', ck: 'Ventiloconvectores', descricao: `Ventiloconvector ${modelo} ${pt(Math.max(kw, 1))} kW${marca ? ' ' + marca : ''}`, especificacao: `ventiloconvector ${modelo} com potência ≥ ${pt(kw)} kW`, quantidade: 1, pesquisa: eqTerms(r.modelo, [`${marca} ventiloconvector ${modelo}`, `ventiloconvector ${modelo} ${pt(kw)} kw`, `fan coil ${modelo}`, `ventiloconvector ${modelo}`]) });
      add({ tipologia: T, categoria: 'Acessórios', ck: 'Comando por unidade', descricao: 'Comando / termóstato de ventiloconvector', quantidade: 1, pesquisa: [`${marca} comando ventiloconvector`, 'termostato ventiloconvector', 'comando fan coil'] });
      add({ tipologia: T, categoria: 'Acessórios', ck: 'Válvula com atuador', descricao: 'Kit de válvula de 3 vias com atuador para ventiloconvector', quantidade: 1, pesquisa: [`${marca} kit valvula 3 vias ventiloconvector`, 'valvula 3 vias atuador ventiloconvector', 'kit valvula fan coil'] });
      add({ tipologia: T, categoria: 'Acessórios', ck: 'Válvulas de corte e purgador', descricao: 'Válvula de corte 1/2" para ventiloconvector', quantidade: 2, pesquisa: ['valvula esfera 1/2', 'valvula corte 1/2'] });
      add({ tipologia: T, categoria: 'Material', chave: 'multicamada', ck: 'Tubagem isolada ida e retorno', descricao: `Tubo multicamada ${u.multicamada} mm`, quantidade: u.tubo_ida_retorno_m, unidade: 'm', pesquisa: [`tubo multicamada ${u.multicamada}`, `multicamada ${u.multicamada.split('x')[0]}`], exige: [[u.multicamada.replace('x', '\\s?x\\s?')]] });
      add({ tipologia: T, categoria: 'Material', chave: 'isolamento', ck: 'Tubagem isolada ida e retorno', descricao: `Isolamento anti-condensação para tubo ${u.multicamada.split('x')[0]} mm`, quantidade: u.isolamento_m, unidade: 'm', pesquisa: [`isolamento tubo ${u.multicamada.split('x')[0]}`, `armaflex ${u.multicamada.split('x')[0]}`, `coquilha ${u.multicamada.split('x')[0]}`] });
      if (r.esgoto === false) condensadosPump(T, 'Esgoto de condensados', 1);
      add({ tipologia: T, categoria: 'Material', chave: 'condensados', ck: 'Esgoto de condensados', descricao: 'Tubo de esgoto de condensados 16/20 mm com acessórios', quantidade: u.condensados_m, unidade: 'm', pesquisa: ['tubo condensados 16', 'tubo esgoto condensados 20'] });
    });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Fixações e acessórios', descricao: 'Acessórios de multicamada e fixações', quantidade: rooms.length, pesquisa: ['uniao multicamada 20', 'curva multicamada 16', 'abracadeira tubo'] });
    if (!ex.has('eletrica')) add({ tipologia: T, categoria: 'Material', chave: 'cabo_alimentacao', ck: 'Alimentação e comando', descricao: 'Cabo de alimentação e comando 3G1,5 mm²', quantidade: rooms.reduce((t, r) => t + (r.distancia_m ?? 8) + 2, 0), unidade: 'm', pesquisa: ['cabo 3g1,5', 'cabo h05vv-f 3g1,5', 'cabo 3x1,5'], exige: [['3\\s?[gx]\\s?1[.,]5(?![0-9])']] });
    if (vc.producao_existente) na(T, 'Sistema de produção', 'produção já existente');
    else heatPump({ emissores: 'ventiloconvectores', area_m2: rooms.reduce((t, r) => t + (r.area_m2 ?? 15), 0), potencia_kw: c.producao_sugerida_kw }, 'Bomba de calor climatização', 'ventiloconvectores');
    labour(T, 'ventilo', 'Instalação de ventiloconvector', rooms.length, 'un.');
    labour(T, 'hidraulica', 'Tubagem hidráulica', c.unidades.reduce((t, u) => t + u.tubo_ida_retorno_m, 0), 'm', 'Mão de obra', 'multicamada');
  }

  // ---------- Piso radiante ----------
  const pr = s.piso;
  if (pr) {
    const T = 'Piso radiante';
    const rooms = pr.divisoes.length ? pr.divisoes : [{ nome: 'Habitação', area_m2: s.area_total_m2 ?? 100 }];
    if (!pr.divisoes.length) pres.push(`Piso radiante: ${rooms[0].area_m2} m² numa zona (divisões não indicadas).`);
    const c = pisoRadiante({ divisoes: rooms.map((r) => ({ nome: r.nome, area_m2: r.area_m2 ?? 12, tipo: r.tipo })), distancia_coletor_m: pr.distancia_coletor_m ?? 6 });
    calcs.push({ nome: 'piso_radiante', nota: c.nota });
    dim.push({ titulo: 'Piso radiante', detalhe: `${pt(c.area_total_m2)} m², ${c.circuitos} circuitos, ${c.tubo_pert_16_m} m de tubo, ${c.coletores} coletor(es) de ${c.saidas_por_coletor} saídas` });
    add({ tipologia: T, categoria: 'Material', chave: 'tubo_piso', ck: 'Tubo PE-RT 16 mm', descricao: 'Tubo PE-RT/PEX 16×2 mm com barreira de oxigénio', quantidade: c.tubo_pert_16_m, unidade: 'm', pesquisa: ['tubo pert 16x2', 'tubo pex 16x2 piso radiante', 'tubo piso radiante 16'], exige: [['16\\s?x\\s?2']] });
    add({ tipologia: T, categoria: 'Material', ck: 'Placa isolante e filme', descricao: 'Placa isolante com pitons para piso radiante', quantidade: c.placa_isolante_m2, unidade: 'm²', pesquisa: ['placa pitons piso radiante', 'placa isolante piso radiante', 'placa tetones'] });
    add({ tipologia: T, categoria: 'Material', ck: 'Placa isolante e filme', descricao: 'Filme de polietileno', quantidade: c.filme_polietileno_m2, unidade: 'm²', pesquisa: ['filme polietileno piso radiante', 'filme polietileno'] });
    add({ tipologia: T, categoria: 'Material', ck: 'Fita perimetral', descricao: 'Fita perimetral', quantidade: c.fita_perimetral_m, unidade: 'm', pesquisa: ['fita perimetral piso radiante', 'banda perimetral'] });
    add({ tipologia: T, categoria: 'Equipamento', ck: 'Coletor e caixa', descricao: `Coletor de piso radiante ${c.saidas_por_coletor} saídas com caudalímetros`, quantidade: c.coletores, pesquisa: [`coletor piso radiante ${c.saidas_por_coletor} saidas`, `coletor ${c.saidas_por_coletor} vias caudalimetros`, `coletor piso radiante ${c.saidas_por_coletor}`], exige: [[`${c.saidas_por_coletor}\\s?(saidas|vias|circuitos|x)`]] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Coletor e caixa', descricao: 'Caixa de coletor', quantidade: c.coletores, pesquisa: ['caixa coletor piso radiante', 'armario coletor'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Coletor e caixa', descricao: 'Válvula de esfera 1" para coletor', quantidade: 2 * c.coletores, pesquisa: ['valvula esfera 1"', 'valvula coletor 1'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Cabeças e termóstatos', descricao: 'Cabeça termoelétrica', quantidade: c.cabecas_termoeletricas, pesquisa: ['cabeca termoeletrica', 'cabeca eletrotermica', 'atuador termoeletrico'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Cabeças e termóstatos', descricao: 'Termóstato de ambiente por zona', quantidade: c.termostatos, pesquisa: ['termostato ambiente piso radiante', 'termostato ambiente'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Cabeças e termóstatos', descricao: 'Módulo de ligações de termóstatos e cabeças', quantidade: c.coletores, pesquisa: ['modulo ligacoes piso radiante', 'centralita piso radiante', 'caixa ligacoes termostatos'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Curvas guia e ligações', descricao: 'Curva guia e adaptador de tubo 16 mm ao coletor', quantidade: 2 * c.circuitos, pesquisa: ['curva guia 16', 'adaptador coletor 16x2', 'racor coletor 16'] });
    add({ tipologia: T, categoria: 'Material', ck: 'Aditivo para betonilha', descricao: `Aditivo para betonilha (${c.aditivo_betonilha_kg} kg)`, quantidade: c.aditivo_betonilha_kg, unidade: 'un.', pesquisa: ['aditivo betonilha piso radiante', 'aditivo argamassa piso radiante'] });
    if (pr.grupo_mistura) add({ tipologia: T, categoria: 'Equipamento', ck: 'Grupo de mistura', descricao: 'Grupo de mistura com bomba circuladora', quantidade: 1, pesquisa: ['grupo mistura piso radiante', 'grupo hidraulico misturado'] });
    else na(T, 'Grupo de mistura', 'produção de baixa temperatura (bomba de calor)');
    labour(T, 'piso', 'Montagem de piso radiante (incluindo ligações ao coletor e ensaio de pressão)', c.placa_isolante_m2, 'm²');
    warn.push('Piso radiante: a betonilha fica normalmente a cargo da construção civil.');
  }

  // ---------- VMC ----------
  const vm = s.vmc;
  if (vm) {
    const T = 'VMC';
    const rooms = vm.divisoes.length ? vm.divisoes : [{ nome: 'Sala', area_m2: 30, tipo: 'sala' }, { nome: 'Quarto', area_m2: 12, tipo: 'quarto' }, { nome: 'Cozinha', area_m2: 12, tipo: 'cozinha' }, { nome: 'WC', area_m2: 5, tipo: 'wc' }];
    if (!vm.divisoes.length) pres.push('VMC: sala, quarto, cozinha e WC (divisões não indicadas).');
    const c = vmcCalc({ divisoes: rooms.map((r) => ({ nome: r.nome, area_m2: r.area_m2 ?? 12, tipo: r.tipo })), distancia_media_m: vm.distancia_media_m ?? 8 });
    const q = vm.caudal_m3h ?? c.unidade_sugerida_m3h;
    calcs.push({ nome: 'vmc', nota: c.nota });
    dim.push({ titulo: 'VMC', detalhe: `${c.nota} ${c.bocas_insuflacao} bocas de insuflação e ${c.bocas_extracao} de extração.` });
    add({ tipologia: T, categoria: 'Equipamento', ck: 'Unidade VMC', descricao: `Unidade VMC com recuperação de calor ${q} m³/h${marca ? ' ' + marca : ''}`, especificacao: `recuperador de calor, caudal ≥ ${c.caudal_projeto_m3h} m³/h`, quantidade: 1, pesquisa: eqTerms(vm.modelo, [`${marca} vmc ${q}`, `recuperador calor ${q} m3`, `vmc duplo fluxo ${q}`, `unidade vmc ${q}`]), exige: [[nRe(q)]] });
    add({ tipologia: T, categoria: 'Material', chave: 'conduta', ck: 'Condutas', descricao: 'Conduta semirrígida 75/90 mm', quantidade: c.conduta_semirrigida_m, unidade: 'm', pesquisa: ['conduta semirrigida 75', 'conduta semi rigida 90', 'conduta vmc 75'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Caixas de distribuição', descricao: 'Caixa de distribuição / plénum', quantidade: c.caixas_distribuicao, pesquisa: ['caixa distribuicao vmc', 'plenum distribuicao 75', 'caixa repartidora vmc'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Bocas de insuflação e extração', descricao: 'Boca de insuflação/extração com plénum', quantidade: c.bocas_insuflacao + c.bocas_extracao, pesquisa: ['boca insuflacao vmc', 'boca extracao 125', 'valvula extracao vmc'] });
    add({ tipologia: T, categoria: 'Material', ck: 'Condutas para o exterior e terminais', descricao: 'Conduta isolada 160 mm (admissão e rejeição)', quantidade: c.conduta_isolada_exterior_m, unidade: 'm', pesquisa: ['conduta isolada 160', 'conduta isotermica 160', 'conduta isolada 150'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Condutas para o exterior e terminais', descricao: 'Terminal de parede/cobertura', quantidade: c.terminais_exteriores, pesquisa: ['terminal parede 160', 'grelha exterior 160', 'terminal cobertura vmc'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Silenciadores', descricao: 'Silenciador', quantidade: c.silenciadores, pesquisa: ['silenciador 160', 'silenciador conduta', 'silenciador vmc'] });
    add({ tipologia: T, categoria: 'Material', chave: 'condensados', ck: 'Esgoto de condensados', descricao: 'Tubo de esgoto de condensados com sifão', quantidade: 3, unidade: 'm', pesquisa: ['tubo condensados 20', 'sifao condensados'] });
    add({ tipologia: T, categoria: 'Acessórios', ck: 'Comando e sensores', descricao: 'Comando da unidade VMC', quantidade: 1, pesquisa: [`${marca} comando vmc`, 'comando vmc', 'sensor humidade vmc'] });
    add({ tipologia: T, categoria: 'Outros', ck: 'Fixações', descricao: 'Fixações, fita de alumínio e abraçadeiras', quantidade: 1, unidade: 'serviço', pesquisa: ['fita aluminio', 'abracadeira conduta'] });
    if (!ex.has('eletrica')) add({ tipologia: T, categoria: 'Material', chave: 'cabo_alimentacao', ck: 'Alimentação elétrica', descricao: 'Cabo de alimentação 3G1,5 mm²', quantidade: quadro(vm.distancia_quadro_m) ?? 10, unidade: 'm', pesquisa: ['cabo 3g1,5', 'cabo 3x1,5'], exige: [['3\\s?[gx]\\s?1[.,]5(?![0-9])']] });
    labour(T, 'vmc_unid', 'Instalação de unidade VMC', 1, 'un.');
    labour(T, 'vmc_ponto', 'Ponto de insuflação/extração VMC', c.bocas_insuflacao + c.bocas_extracao, 'un.');
  }

  // ---------- Carregador automóvel ----------
  const ev = s.carregador;
  if (ev) {
    const T = 'Carregador automóvel';
    const kw = ev.potencia_kw ?? 7.4, dq = quadroDefault(T, ev.distancia_m);
    const c = evCalc({ potencia_kw: kw, distancia_m: dq });
    dim.push({ titulo: 'Carregador', detalhe: `${pt(kw)} kW ${c.trifasico ? 'trifásico' : 'monofásico'}: ${c.nota}` });
    add({ tipologia: T, categoria: 'Equipamento', ck: 'Carregador', descricao: `Carregador de veículo elétrico (wallbox) ${pt(kw)} kW ${c.trifasico ? 'trifásico' : 'monofásico'}${marca ? ' ' + marca : ''}`, quantidade: 1, pesquisa: eqTerms(ev.modelo, [`${marca} wallbox ${pt(kw)} kw`, `carregador veiculo eletrico ${pt(kw)} kw`, `wallbox ${pt(kw)}`]), exige: [[nRe(kw) + '\\s?kw', nRe(kw)]] });
    electric(T, c, 'Carregador');
    add({ tipologia: T, categoria: 'Material', ck: 'Tubo/calha do percurso', descricao: 'Tubo VD/ERFE e acessórios do percurso', quantidade: dq, unidade: 'm', pesquisa: ['tubo vd 32', 'tubo erfe 32', 'tubo anelado 32'] });
    if (ev.gestor_potencia) add({ tipologia: T, categoria: 'Acessórios', ck: 'Gestor dinâmico de potência', descricao: 'Gestor dinâmico de potência (medidor/pinça)', quantidade: 1, pesquisa: [`${marca} gestor potencia`, 'medidor energia wallbox', 'gestao dinamica potencia'] });
    else { na(T, 'Gestor dinâmico de potência', 'confirmar a potência contratada'); ask.push('Qual é a potência contratada? (se for justa, juntar gestor dinâmico de potência)'); }
    labour(T, 'wallbox', 'Instalação de carregador automóvel (ligação ao quadro, configuração e teste)', 1, 'un.');
  }

  // ---------- Itens indicados no pedido (outros materiais, UPAC, solar, trabalhos à parte) ----------
  for (const it of s.extras) add({ ...it, ck: null });

  // Diferencial comum aos novos circuitos e deslocação.
  if (circuits && !ex.has('eletrica') && !ex.has('diferencial') && !lines.some((l) => /diferencial/i.test(l.descricao))) {
    const t = lines.find((l) => l.categoria === 'Material' && /disjuntor/i.test(l.descricao))?.tipologia || 'Geral / outros';
    add({ tipologia: t, categoria: 'Material', ck: 'Circuito elétrico e proteção', descricao: 'Interruptor diferencial 40 A 30 mA tipo A', quantidade: 1, pesquisa: ['interruptor diferencial 40a 30ma tipo a', 'diferencial 2p 40a 30ma', 'diferencial 30ma'], exige: [['30\\s?ma']] });
    pres.push('Um interruptor diferencial de 30 mA comum aos circuitos novos (confirmar no quadro existente).');
  }
  if (lines.length && !ex.has('deslocacao')) labour(lines[0].tipologia, 'deslocacao', 'Deslocação', 1, 'serviço');

  // Quantidades indicadas pelo utilizador substituem as calculadas (repartidas pelas linhas da mesma família).
  for (const [k, v] of Object.entries(s.quantidades)) {
    const mat = lines.filter((l) => l.chave === k && l.categoria !== 'Mão de obra'), lab = lines.filter((l) => l.chave === k && l.categoria === 'Mão de obra');
    const tot = mat.reduce((t, l) => t + l.quantidade, 0);
    if (!mat.length || !tot) continue;
    let left = v;
    mat.forEach((l, i) => { const q = i === mat.length - 1 ? left : Math.round(v * l.quantidade / tot); l.quantidade = Math.max(q, 0.5); left -= q; l.especificacao = (l.especificacao ? l.especificacao + '; ' : '') + 'quantidade indicada no pedido'; });
    lab.forEach((l) => { l.quantidade = v; });
  }
  // Preços de mão de obra escritos no pedido prevalecem sobre a tabela.
  for (const m of s.precos_mao_obra) for (const l of lines) if (l.categoria === 'Mão de obra' && l.mao_obra === m.id) l.preco_indicado = m.preco;
  for (const l of lines) delete l.chave;
  return { itens: lines, verificacao: checks, dimensionamento: dim, calculos: calcs.slice(0, 40), pressupostos: [...new Set(pres)].slice(0, 30), perguntas: [...new Set(ask)].slice(0, 15), avisos: [...new Set(warn)].slice(0, 20) };
}

// ---------- Leitura do pedido pela IA (um só pedido rápido, sem ferramentas) ----------
export const EXTRACT = `És o orçamentista técnico da ENAT (climatização, AQS, VMC, piso radiante, renováveis).
Lê o pedido do utilizador e devolve APENAS os dados da obra em JSON. Não inventes valores: o que não estiver escrito fica null (o servidor usa valores típicos e regista-os como pressupostos). Não escrevas listas de material para as tipologias com secção própria: o servidor monta o kit completo (equipamento, cobre, cabos, condensados, calha, suportes, válvulas, depósitos, proteções, mão de obra).
Formato:
{"resumo": "1-2 frases com a solução pedida",
"tipologias": [das: ${TOPICS.join(' | ')}],
"marca": "marca dos equipamentos ou ''",
"isolamento": "bom|medio|fraco|null", "distancia_quadro_m": null, "area_total_m2": null,
"ac": null ou {"sistema": "mono|multi|null", "divisoes": [{"nome": "Sala", "area_m2": 30, "uso": "sala|quarto|cozinha|escritorio|loja|outro", "exposicao": "sul|norte|nascente|poente|null", "potencia_kw": null, "tipo": "mural|consola|conduta|cassete|null", "modelo": "modelo exato se indicado ou null", "linha_m": null, "calha_m": null, "esgoto": true|false|null}], "exterior_kw": null, "modelo_exterior": null, "suporte": "parede|chao|null", "wifi": false, "distancia_quadro_m": null, "carga_incluida_m": null},
"aqs": null ou {"pessoas": null, "volume_l": null, "modelo": null, "tubo_m": null, "espaco_fechado": null, "remover_antigo": null, "distancia_quadro_m": null},
"bc": null ou {"area_m2": null, "emissores": "piso|ventiloconvectores|radiadores", "potencia_kw": null, "modelo": null, "monobloco": true|false|null, "aqs": false, "pessoas": null, "volume_aqs_l": null, "inercia_l": null, "distancia_m": null, "distancia_quadro_m": null},
"ventilo": null ou {"divisoes": [{"nome": "", "area_m2": null, "uso": "sala|quarto|...", "potencia_kw": null, "modelo_tipo": "mural|consola|conduta|cassete", "modelo": null, "distancia_m": null, "esgoto": null}], "producao_existente": false},
"piso": null ou {"divisoes": [{"nome": "", "area_m2": null, "tipo": "sala|quarto|wc|cozinha|outro"}], "distancia_coletor_m": null, "grupo_mistura": false},
"vmc": null ou {"divisoes": [{"nome": "", "area_m2": null, "tipo": "sala|quarto|escritorio|cozinha|wc|lavandaria|despensa|outro"}], "caudal_m3h": null, "modelo": null, "distancia_media_m": null},
"carregador": null ou {"potencia_kw": null, "distancia_m": null, "modelo": null, "gestor_potencia": false},
"quantidades": {"cobre|cabo_interligacao|cabo_alimentacao|calha|condensados|multicamada|isolamento|tubo_piso|conduta": metros TOTAIS indicados pelo utilizador para a obra},
"excluir": [das: ${EXCLUDE_KEYS.join(', ')} — só quando o utilizador pede para não incluir],
"extras": [{"tipologia": "...", "categoria": "${KINDS.join('|')}", "descricao": "linha clara para o cliente", "especificacao": "medidas/potência", "quantidade": 1, "unidade": "${UNITS.join('|')}", "pesquisa": ["2 a 4 termos curtos para procurar nas tabelas, com medidas"], "mao_obra": "id da tabela de mão de obra ou null", "preco_indicado": null}],
"precos_mao_obra": [{"id": "id da tabela", "preco": valor em €}],
"pressupostos": [], "perguntas": []}
Regras:
- Usa uma secção (ac, aqs, bc, ventilo, piso, vmc, carregador) por cada solução pedida; as outras ficam null.
- "linha_m" é a distância entre a interior e a exterior dessa divisão. Distâncias e metros ditos para uma divisão vão para essa divisão; metros totais ("30 m de cobre", "40 m de cabo") vão para "quantidades".
- "sistema": "multi" quando é pedido multisplit ou uma exterior para várias interiores; "mono" quando pedido split por divisão; null se não for dito.
- "extras": tudo o resto que o utilizador pede e que não é parte do kit das secções: UPAC (painéis, inversor, estrutura, bateria), solar térmico, depósitos ou máquinas avulsas, materiais com quantidades próprias, trabalhos especiais. Também os itens de "Geral / outros". Nunca repitas aqui o que o kit já leva.
- "precos_mao_obra": SÓ valores em euros de mão de obra escritos explicitamente no pedido (ex.: «mão de obra do split 180 €»), com o id da tabela que corresponde. Sem valores escritos fica [].
- "descricao" dos extras inclui sempre as medidas/potência/volume ditos (ex.: «Depósito de inércia 100 L», «Radiador elétrico 1000 W»).
- Números com vírgula decimal portuguesa convertem-se para número (2,5 → 2.5).`;

const quoteNormS = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const bool = (v) => (v === true ? true : v === false ? false : null);
const str = (v, n = 80) => (typeof v === 'string' && v.trim() && v !== 'null' ? clip(v.trim(), n) : null);
const room = (r, i, fields = {}) => ({ nome: str(r?.nome, 60) || 'Divisão ' + (i + 1), area_m2: num(r?.area_m2, null, 1, 2000), ...Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f(r?.[k])])) });
const oneOf = (list) => (v) => (list.includes(v) ? v : null);
const N = (min, max) => (v) => num(v, null, min, max);

// Normaliza a resposta da IA: só passam campos e valores conhecidos.
export function cleanSpec(p, labourIds = []) {
  if (!p || typeof p !== 'object') throw new Error('Resposta inválida');
  const ac = obj(p.ac), aq = obj(p.aqs), bc = obj(p.bc), vc = obj(p.ventilo), pr = obj(p.piso), vm = obj(p.vmc), ev = obj(p.carregador);
  const spec = {
    resumo: clip(p.resumo, 800), marca: str(p.marca, 60) || '',
    tipologias: arr(p.tipologias, 10).filter((t) => TOPICS.includes(t)),
    isolamento: oneOf(['bom', 'medio', 'fraco'])(p.isolamento) || 'medio',
    distancia_quadro_m: num(p.distancia_quadro_m, null, 0.5, 300), area_total_m2: num(p.area_total_m2, null, 5, 10000),
    ac: ac && {
      sistema: oneOf(['mono', 'multi'])(ac.sistema),
      divisoes: arr(ac.divisoes, 20).map((r, i) => room(r, i, { uso: oneOf(['quarto', 'sala', 'cozinha', 'escritorio', 'loja', 'outro']), exposicao: str, potencia_kw: N(1, 30), tipo: oneOf(['mural', 'consola', 'conduta', 'cassete']), modelo: str, linha_m: N(0.5, 100), calha_m: N(0, 100), esgoto: bool })),
      exterior_kw: num(ac.exterior_kw, null, 1, 50), modelo_exterior: str(ac.modelo_exterior), suporte: oneOf(['parede', 'chao'])(ac.suporte), wifi: ac.wifi === true,
      distancia_quadro_m: num(ac.distancia_quadro_m, null, 0.5, 300), carga_incluida_m: num(ac.carga_incluida_m, null, 0, 50),
    },
    aqs: aq && { pessoas: num(aq.pessoas, null, 1, 50), volume_l: num(aq.volume_l, null, 50, 1000), modelo: str(aq.modelo), tubo_m: num(aq.tubo_m, null, 1, 200), espaco_fechado: bool(aq.espaco_fechado), remover_antigo: bool(aq.remover_antigo), distancia_quadro_m: num(aq.distancia_quadro_m, null, 0.5, 300) },
    bc: bc && { area_m2: num(bc.area_m2, null, 10, 5000), emissores: oneOf(['piso', 'ventiloconvectores', 'radiadores'])(bc.emissores), potencia_kw: num(bc.potencia_kw, null, 2, 100), modelo: str(bc.modelo), monobloco: bool(bc.monobloco), aqs: bc.aqs === true, pessoas: num(bc.pessoas, null, 1, 50), volume_aqs_l: num(bc.volume_aqs_l, null, 50, 1000), inercia_l: num(bc.inercia_l, null, 0, 2000), distancia_m: num(bc.distancia_m, null, 0.5, 100), distancia_quadro_m: num(bc.distancia_quadro_m, null, 0.5, 300) },
    ventilo: vc && { divisoes: arr(vc.divisoes, 20).map((r, i) => room(r, i, { uso: oneOf(['quarto', 'sala', 'cozinha', 'escritorio', 'loja', 'outro']), potencia_kw: N(0.5, 30), modelo_tipo: oneOf(['mural', 'consola', 'conduta', 'cassete']), modelo: str, distancia_m: N(0.5, 100), esgoto: bool })), producao_existente: vc.producao_existente === true },
    piso: pr && { divisoes: arr(pr.divisoes, 30).map((r, i) => room(r, i, { tipo: str })), distancia_coletor_m: num(pr.distancia_coletor_m, null, 0, 60), grupo_mistura: pr.grupo_mistura === true },
    vmc: vm && { divisoes: arr(vm.divisoes, 30).map((r, i) => room(r, i, { tipo: oneOf(['sala', 'quarto', 'escritorio', 'cozinha', 'wc', 'lavandaria', 'despensa', 'outro']) })), caudal_m3h: num(vm.caudal_m3h, null, 50, 5000), modelo: str(vm.modelo), distancia_media_m: num(vm.distancia_media_m, null, 1, 50), distancia_quadro_m: num(vm.distancia_quadro_m, null, 0.5, 300) },
    carregador: ev && { potencia_kw: num(ev.potencia_kw, null, 2, 50), distancia_m: num(ev.distancia_m, null, 0.5, 300), modelo: str(ev.modelo), gestor_potencia: ev.gestor_potencia === true },
    quantidades: Object.fromEntries(Object.entries(obj(p.quantidades) || {}).filter(([k, v]) => QTY_KEYS.includes(k) && num(v, null, 0.5, 5000) != null).map(([k, v]) => [k, up(Number(v))])),
    excluir: arr(p.excluir, 20).filter((k) => EXCLUDE_KEYS.includes(k)),
    extras: arr(p.extras, 60).map((it) => {
      const d = clip(it?.descricao, 300).trim(); if (!d) return null;
      const q = num(it.quantidade, 1, 0.01, 1e5), mo = str(it.mao_obra, 40), pi = num(it.preco_indicado, null, 0, 1e6), esp = clip(it.especificacao, 120).trim();
      const desc = esp && !quoteNormS(d).includes(quoteNormS(esp)) ? clip(d + ' ' + esp, 300) : d;
      return { tipologia: TOPICS.includes(it.tipologia) ? it.tipologia : 'Geral / outros', categoria: KINDS.includes(it.categoria) ? it.categoria : 'Material', descricao: desc, especificacao: clip(it.especificacao, 300), quantidade: q, unidade: UNITS.includes(it.unidade) ? it.unidade : 'un.', pesquisa: arr(it.pesquisa, 5).map((t) => clip(t, 80)).filter(Boolean), mao_obra: mo && (!labourIds.length || labourIds.includes(mo)) ? mo : null, preco_indicado: pi };
    }).filter(Boolean),
    precos_mao_obra: arr(p.precos_mao_obra, 40).filter((m) => m && str(m.id, 40) && num(m.preco, null, 0, 1e6) != null).map((m) => ({ id: clip(m.id, 40), preco: Number(m.preco) })),
    pressupostos: arr(p.pressupostos, 15).map((t) => clip(t, 300)).filter(Boolean),
    perguntas: arr(p.perguntas, 10).map((t) => clip(t, 300)).filter(Boolean),
  };
  // Tipologia marcada com secção vazia: monta o kit com os valores típicos.
  const tp = new Set([...spec.tipologias]);
  if (tp.has('Ar condicionado') && !spec.ac) spec.ac = cleanSpec.emptyAc();
  if (tp.has('Bomba de calor AQS') && !spec.aqs) spec.aqs = { pessoas: null, volume_l: null, modelo: null, tubo_m: null, espaco_fechado: null, remover_antigo: null, distancia_quadro_m: null };
  if (tp.has('Bomba de calor climatização') && !spec.bc && !spec.ventilo) spec.bc = { area_m2: spec.area_total_m2, emissores: spec.piso ? 'piso' : null, potencia_kw: null, modelo: null, monobloco: null, aqs: false, pessoas: null, volume_aqs_l: null, inercia_l: null, distancia_m: null, distancia_quadro_m: null };
  if (spec.ventilo && spec.bc) spec.ventilo.producao_existente = true;
  if (spec.ac && !spec.ac.sistema) spec.ac.sistema = spec.ac.divisoes.length > 1 ? null : 'mono';
  for (const [k, t] of [['ac', 'Ar condicionado'], ['aqs', 'Bomba de calor AQS'], ['bc', 'Bomba de calor climatização'], ['ventilo', 'Ventiloconvectores'], ['piso', 'Piso radiante'], ['vmc', 'VMC'], ['carregador', 'Carregador automóvel']]) if (spec[k]) tp.add(t);
  for (const e of spec.extras) tp.add(e.tipologia);
  spec.tipologias = TOPICS.filter((t) => tp.has(t));
  return spec;
}
cleanSpec.emptyAc = () => ({ sistema: null, divisoes: [], exterior_kw: null, modelo_exterior: null, suporte: null, wifi: false, distancia_quadro_m: null, carga_incluida_m: null });

// Plano final (mesmo formato que a app já mostra).
export function buildPlan(spec, input = {}) {
  // Várias divisões sem sistema indicado: monosplit por divisão (mais comum); fica como pressuposto.
  if (spec.ac && !spec.ac.sistema) { spec.ac.sistema = 'mono'; spec.pressupostos.push('Ar condicionado: um monosplit por divisão (para multisplit escreva «multisplit»).'); }
  const k = kit({ spec, marca: input.marca });
  if (!k.itens.length) throw new Error('Sem linhas');
  return { resumo: spec.resumo, marca: spec.marca || input.marca || '', tipologias: spec.tipologias, ...k };
}
