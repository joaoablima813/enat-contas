// Cálculos técnicos determinísticos usados pelo orçamento automático (IA).
// A IA chama estas funções em vez de "adivinhar" potências, diâmetros, secções de cabo e metros de material.
// Valores de referência para habitação no Norte de Portugal; ficam sempre indicados como pressupostos.

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const up = (n) => Math.ceil(n - 1e-9);
const num = (v, d, min = 0, max = 1e6) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
const nextOf = (list, v) => list.find((x) => x >= v - 1e-9) ?? list[list.length - 1];

// ---------- Carga térmica por divisão (ar condicionado e ventiloconvectores) ----------
const ISOL = { bom: 30, medio: 38, fraco: 48 }; // W por m³ de volume, arrefecimento
const USO = { quarto: 1, sala: 1.05, cozinha: 1.15, escritorio: 1.1, loja: 1.2, outro: 1 };
export const AC_SIZES = [2.0, 2.5, 3.5, 4.2, 5.0, 6.0, 7.1, 8.5, 10.0, 12.5, 14.0];
const BTU = { 2.0: 7000, 2.5: 9000, 3.5: 12000, 4.2: 14000, 5.0: 18000, 6.0: 21000, 7.1: 24000, 8.5: 30000, 10.0: 36000, 12.5: 42000, 14.0: 48000 };

export function cargaTermica({ divisoes = [], isolamento = 'medio' } = {}) {
  const rooms = (Array.isArray(divisoes) ? divisoes : []).slice(0, 30).map((d, i) => {
    const area = num(d.area_m2, 12, 1, 2000), h = num(d.pe_direito, 2.6, 2, 8);
    const iso = ISOL[d.isolamento || isolamento] || ISOL.medio;
    let f = USO[d.uso] || 1;
    const exp = String(d.exposicao || '').toLowerCase();
    if (/sul|poente|oeste/.test(exp)) f *= 1.1;
    if (d.muito_vidro) f *= 1.15;
    if (d.ultimo_piso) f *= 1.1;
    const pessoas = num(d.ocupantes, d.uso === 'sala' ? 4 : 2, 0, 200);
    const frio = (area * h * iso * f + Math.max(0, pessoas - 2) * 130) / 1000;
    const calor = frio * (/norte/.test(exp) ? 1.2 : 1.1);
    const need = Math.max(frio, calor);
    const kw = nextOf(AC_SIZES, need * 0.95);
    const tipo = kw > 7.1 ? 'conduta, cassete ou teto (potência acima de mural)' : 'mural (ou consola/conduta se o cliente preferir)';
    return { divisao: d.nome || 'Divisão ' + (i + 1), area_m2: area, carga_arrefecimento_kw: r2(frio), carga_aquecimento_kw: r2(calor), potencia_nominal_kw: kw, btu: BTU[kw] || Math.round(kw * 3412), tipo_sugerido: tipo };
  });
  return { divisoes: rooms, total_carga_kw: r2(rooms.reduce((s, r) => s + Math.max(r.carga_arrefecimento_kw, r.carga_aquecimento_kw), 0)), criterio: `Volume × ${ISOL[isolamento] || 38} W/m³ (isolamento ${isolamento}), +10% exposição sul/poente, +15% grandes envidraçados, +130 W por pessoa acima de 2, aquecimento +10 a 20%.` };
}

// ---------- Multisplit: unidade exterior para várias interiores ----------
const MULTI = [{ kw: 4.0, portas: 2 }, { kw: 5.0, portas: 2 }, { kw: 5.3, portas: 3 }, { kw: 6.8, portas: 3 }, { kw: 7.5, portas: 4 }, { kw: 8.0, portas: 4 }, { kw: 9.0, portas: 5 }, { kw: 10.0, portas: 5 }, { kw: 12.5, portas: 6 }];
export function multisplit({ interiores_kw = [], cargas_kw = [] } = {}) {
  const ui = (Array.isArray(interiores_kw) ? interiores_kw : []).map((v) => num(v, 0, 0, 30)).filter(Boolean);
  const loads = (Array.isArray(cargas_kw) ? cargas_kw : []).map((v) => num(v, 0, 0, 30)).filter(Boolean);
  const somaUi = ui.reduce((s, v) => s + v, 0), somaCarga = loads.reduce((s, v) => s + v, 0);
  const req = Math.max(somaCarga * 0.85, somaUi / 1.35);
  const opt = MULTI.find((o) => o.portas >= ui.length && o.kw >= req - 1e-9);
  return {
    n_interiores: ui.length, soma_interiores_kw: r1(somaUi), potencia_exterior_minima_kw: r2(req),
    exterior_sugerida: opt ? { potencia_kw: opt.kw, saidas: opt.portas } : null,
    nota: opt ? `Exterior multisplit de ${opt.kw} kW com ${opt.portas} saídas. Confirme na tabela que a soma das interiores (${r1(somaUi)} kW) está dentro do intervalo ligável dessa exterior (normalmente 130–150%).` : 'Demasiadas interiores ou potência para uma só exterior multisplit: divida em duas exteriores ou proponha sistema VRF/PUMY.',
  };
}

// ---------- Linha frigorífica de um split ----------
export function linhaFrigorifica({ potencia_kw, distancia_m, carga_incluida_m = 7, desnivel_m = 0, distancia_esgoto_m, percurso_a_vista_m } = {}) {
  const kw = num(potencia_kw, 3.5, 0.5, 30), d = num(distancia_m, 5, 0.5, 100);
  const [liq, gas] = kw <= 3.6 ? ['1/4"', '3/8"'] : kw <= 6.0 ? ['1/4"', '1/2"'] : ['3/8"', '5/8"'];
  const metros = up(d + 1);
  const incl = num(carga_incluida_m, 7, 0, 50);
  const gpm = liq === '1/4"' ? 20 : 40;
  const extra = Math.max(0, metros - incl) * gpm;
  const vista = num(percurso_a_vista_m, metros, 0, 100);
  const out = {
    diametros: `líquido ${liq} + gás ${gas}`,
    par_cobre_isolado_m: metros,
    cabo_interligacao: { tipo: kw > 7.1 ? 'H07RN-F 5G1,5 mm² (confirmar no manual: algumas trifásicas)' : 'H07RN-F 4G1,5 mm²', metros: metros + 1 },
    tubo_condensados_m: up(num(distancia_esgoto_m, Math.min(metros, 5), 0, 100) + 0.5),
    calha_tecnica_m: up(vista), acessorios_calha_un: Math.max(2, up(vista / 2.5)),
    gas_adicional_g: extra, gas_adicional_kg: r2(extra / 1000),
    fita_e_fixacoes: 'fita de acabamento, abraçadeiras e buchas para ' + metros + ' m',
    nota: `${metros} m de linha (percurso ${d} m + 1 m de folga). ${extra ? `Carga adicional estimada de ${extra} g (${gpm} g/m acima de ${incl} m pré-carregados — confirmar no manual do modelo).` : `Dentro dos ${incl} m pré-carregados, sem gás adicional.`}${num(desnivel_m, 0) > 5 ? ' Desnível acima de 5 m: prever sifão no tubo de gás.' : ''}`,
  };
  return out;
}

// ---------- Cabo de alimentação e proteção ----------
const SECCOES = [1.5, 2.5, 4, 6, 10, 16, 25];
const MAX_DISJ = { 1.5: 10, 2.5: 20, 4: 25, 6: 32, 10: 40, 16: 63, 25: 80 };
const DISJ = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80];
export function caboEletrico({ potencia_w, potencia_termica_kw, distancia_m, trifasico = false, cos_phi = 0.9, queda_max_pct = 3, carga = 'equipamento' } = {}) {
  // Ar condicionado e bombas de calor: a potência elétrica máxima é cerca de 1/2,5 da potência térmica.
  const P = Number(potencia_termica_kw) > 0 && !(Number(potencia_w) > 0) ? num(potencia_termica_kw, 3.5, 0.5, 200) * 1000 / 2.5 : num(potencia_w, 2000, 50, 200000), L = num(distancia_m, 10, 0.5, 500), tri = !!trifasico, cf = num(cos_phi, 0.9, 0.5, 1);
  const I = tri ? P / (Math.sqrt(3) * 400 * cf) : P / (230 * cf);
  const disj = nextOf(DISJ, I * 1.15);
  const rho = 0.0225;
  let s = SECCOES.find((x) => MAX_DISJ[x] >= disj) ?? 25, dv = 0;
  for (const x of SECCOES.filter((v) => v >= s)) {
    s = x; dv = tri ? (Math.sqrt(3) * L * I * rho / x) / 400 * 100 : (2 * L * I * rho / x) / 230 * 100;
    if (dv <= num(queda_max_pct, 3, 0.5, 10)) break;
  }
  const condutores = tri ? 5 : 3;
  const ve = carga === 'carregador';
  return {
    corrente_a: r1(I), seccao_mm2: s, cabo: `${condutores}G${String(s).replace('.', ',')} mm²`, metros: up(L * 1.1 + 1),
    disjuntor: `${disj} A curva C ${tri ? 'tetrapolar' : 'bipolar (1P+N)'}`,
    diferencial: ve ? 'diferencial 30 mA tipo A com deteção DC 6 mA (ou tipo B), se o carregador não a tiver incorporada' : '30 mA tipo A (ou ligar a diferencial existente com capacidade)',
    queda_tensao_pct: r2(dv),
    tipo_cabo: 'H07RN-F ou XV no exterior/enterrado; H07V-U/H07V-R dentro de tubo VD/ERFE no interior',
    nota: `Corrente ${r1(I)} A → disjuntor ${disj} A, cabo ${condutores}G${s} mm² (queda de tensão ${r2(dv)}% em ${L} m).`,
  };
}

// ---------- Águas quentes sanitárias (bomba de calor AQS) ----------
const AQS = [100, 150, 200, 260, 300, 500];
export function aqs({ pessoas, banhos_simultaneos = 1, distancia_m = 3 } = {}) {
  const p = num(pessoas, 4, 1, 50), b = num(banhos_simultaneos, 1, 1, 10);
  const litros = nextOf(AQS, Math.max(p * 50, b > 1 ? 260 : 0));
  const d = num(distancia_m, 3, 0.5, 100);
  return {
    volume_l: litros,
    vaso_expansao_sanitario_l: litros <= 150 ? 8 : litros <= 300 ? 12 : 18,
    tubagem_multicamada_m: up(2 * (d + 1)),
    cabo: caboEletrico({ potencia_w: litros >= 260 ? 2500 : 2000, distancia_m: d + 5 }),
    nota: `${p} pessoas × 50 L/dia → ${litros} L.`,
  };
}

// ---------- Bomba de calor para aquecimento central ----------
const BC = [4, 6, 8, 10, 12, 14, 16];
export function bombaCalorHabitacao({ area_m2, isolamento = 'medio', emissores = 'piso', pessoas_aqs = 0 } = {}) {
  const a = num(area_m2, 120, 10, 5000);
  const wm2 = { bom: 50, medio: 70, fraco: 100 }[isolamento] || 70;
  const kwAq = a * wm2 / 1000;
  const kw = nextOf(BC, kwAq * (num(pessoas_aqs, 0) ? 1.05 : 1));
  const temp = { piso: 35, ventiloconvectores: 45, radiadores: 55 }[emissores] || 45;
  return {
    necessidade_aquecimento_kw: r2(kwAq), potencia_nominal_kw: kw, temperatura_ida_c: temp,
    inercia_recomendada_l: emissores === 'piso' ? 0 : Math.max(50, nextOf([50, 80, 100, 150, 200, 300], kw * 10)),
    vaso_expansao_aquecimento_l: kw <= 8 ? 12 : 18,
    nota: `${a} m² × ${wm2} W/m² (isolamento ${isolamento}) = ${r2(kwAq)} kW → ${kw} kW. Emissores ${emissores}: ida a ${temp} °C.${emissores === 'radiadores' ? ' Radiadores antigos podem precisar de bomba de calor de alta temperatura.' : ''}${emissores === 'piso' ? ' Com piso radiante a inércia pode dispensar-se se houver volume mínimo de água.' : ''}`,
  };
}

// ---------- Piso radiante ----------
export function pisoRadiante({ divisoes = [], distancia_coletor_m = 6 } = {}) {
  const rooms = (Array.isArray(divisoes) ? divisoes : []).slice(0, 40).map((d, i) => {
    const area = num(d.area_m2, 10, 0.5, 1000), wc = /wc|banho/i.test(d.tipo || d.nome || '');
    const esp = num(d.espacamento_cm, wc ? 10 : 15, 5, 30);
    const dist = num(d.distancia_coletor_m, distancia_coletor_m, 0, 60);
    const serp = area / (esp / 100);
    const circ = Math.max(1, up((serp + 2 * dist) / 100));
    const tubo = up(serp + 2 * dist * circ);
    return { divisao: d.nome || 'Divisão ' + (i + 1), area_m2: area, espacamento_cm: esp, tubo_m: tubo, circuitos: circ, potencia_w: Math.round(area * (wc ? 80 : 60)), perimetro_m: up(4 * Math.sqrt(area) * 1.1) };
  });
  const area = rooms.reduce((s, r) => s + r.area_m2, 0), circ = rooms.reduce((s, r) => s + r.circuitos, 0);
  const coletores = Math.max(1, up(circ / 12));
  return {
    divisoes: rooms, area_total_m2: r1(area),
    tubo_pert_16_m: rooms.reduce((s, r) => s + r.tubo_m, 0), circuitos: circ,
    coletores: coletores, saidas_por_coletor: up(circ / coletores),
    placa_isolante_m2: up(area * 1.05), fita_perimetral_m: rooms.reduce((s, r) => s + r.perimetro_m, 0),
    filme_polietileno_m2: up(area * 1.1), aditivo_betonilha_kg: up(area * 0.2),
    cabecas_termoeletricas: circ, termostatos: rooms.length,
    potencia_total_kw: r2(rooms.reduce((s, r) => s + r.potencia_w, 0) / 1000),
    nota: 'Tubo 16 mm, espaçamento 15 cm (10 cm em casas de banho), máximo 100 m por circuito, até 12 saídas por coletor. A betonilha é normalmente da construção civil.',
  };
}

// ---------- Ventiloconvectores ----------
export function ventiloconvectores({ divisoes = [], isolamento = 'medio', distancia_media_m = 8 } = {}) {
  const c = cargaTermica({ divisoes, isolamento });
  const rooms = c.divisoes.map((r, i) => {
    const dist = num(divisoes[i]?.distancia_m, distancia_media_m, 0, 100);
    const kw = Math.max(r.carga_arrefecimento_kw, r.carga_aquecimento_kw);
    const diam = kw <= 2.5 ? '16x2' : kw <= 5 ? '20x2' : '26x3';
    return { divisao: r.divisao, potencia_necessaria_kw: r2(kw), multicamada: diam, tubo_ida_retorno_m: up(2 * (dist + 1)), isolamento_m: up(2 * (dist + 1)), condensados_m: up(Math.min(dist, 6) + 0.5) };
  });
  const tot = rooms.reduce((s, r) => s + r.potencia_necessaria_kw, 0);
  return {
    unidades: rooms, potencia_total_kw: r2(tot),
    producao_sugerida_kw: nextOf(BC, tot * 0.9),
    nota: 'Escolher ventiloconvector com potência a 7/12 °C (frio) e 45 °C (calor) ≥ necessária. Tubagem isolada anti-condensação (ex.: 9–13 mm) porque trabalha a frio. Cada unidade leva válvula de 2/3 vias com atuador, válvulas de corte, purgador, comando/termostato e esgoto de condensados.',
  };
}

// ---------- VMC (ventilação mecânica controlada) ----------
const VMC_INS = { sala: 60, quarto: 30, escritorio: 30 };
const VMC_EXT = { cozinha: 90, wc: 45, lavandaria: 30, despensa: 15 };
const VMC_UNITS = [150, 250, 350, 500, 800];
export function vmc({ divisoes = [], distancia_media_m = 8, comprimento_exterior_m = 3 } = {}) {
  let ins = 0, ext = 0, area = 0, bocasIns = 0, bocasExt = 0;
  const rooms = (Array.isArray(divisoes) ? divisoes : []).slice(0, 40).map((d, i) => {
    const t = String(d.tipo || '').toLowerCase(), a = num(d.area_m2, 12, 1, 1000); area += a;
    const q = VMC_INS[t] ?? 0, e = VMC_EXT[t] ?? 0;
    const bocas = Math.max(1, up(a / 25));
    if (q) { ins += q * (t === 'sala' && a > 30 ? 1.5 : 1); bocasIns += bocas; }
    if (e) { ext += e; bocasExt += 1; }
    return { divisao: d.nome || 'Divisão ' + (i + 1), tipo: t || 'outro', insuflacao_m3h: q, extracao_m3h: e, bocas: q ? bocas : e ? 1 : 0 };
  });
  const caudal = Math.max(ins, ext, area * 2.6 * 0.5);
  const unidade = nextOf(VMC_UNITS, caudal * 1.2);
  const bocas = bocasIns + bocasExt;
  return {
    divisoes: rooms, insuflacao_total_m3h: Math.round(ins), extracao_total_m3h: Math.round(ext), caudal_projeto_m3h: Math.round(caudal),
    unidade_sugerida_m3h: unidade, bocas_insuflacao: bocasIns, bocas_extracao: bocasExt,
    conduta_semirrigida_m: up(bocas * num(distancia_media_m, 8, 1, 50)), caixas_distribuicao: 2,
    conduta_isolada_exterior_m: up(2 * num(comprimento_exterior_m, 3, 0.5, 30)), terminais_exteriores: 2, silenciadores: 2,
    nota: `Insuflação em salas/quartos e extração em cozinha/WC (NP 1037-1). Caudal de projeto ${Math.round(caudal)} m³/h → unidade de recuperação de calor ≥ ${unidade} m³/h.`,
  };
}

// ---------- Carregador de veículo elétrico ----------
export function carregador({ potencia_kw = 7.4, distancia_m = 15 } = {}) {
  const kw = num(potencia_kw, 7.4, 2, 50), tri = kw > 7.4;
  return { ...caboEletrico({ potencia_w: kw * 1000, distancia_m, trifasico: tri, cos_phi: 0.99, carga: 'carregador' }), trifasico: tri, nota_potencia: tri ? 'Carregador trifásico: confirmar potência contratada trifásica.' : 'Carregador monofásico 32 A: confirmar potência contratada (≥ 10,35 kVA recomendado) ou usar gestor de potência.' };
}

export const CALCULOS = {
  carga_termica: cargaTermica, multisplit, linha_frigorifica: linhaFrigorifica, cabo_eletrico: caboEletrico, aqs,
  bomba_calor_habitacao: bombaCalorHabitacao, piso_radiante: pisoRadiante, ventiloconvectores, vmc, carregador,
};

const room = (extra = {}) => ({ type: 'object', properties: { nome: { type: 'string' }, area_m2: { type: 'number' }, ...extra }, required: ['nome', 'area_m2'] });
const arr = (items) => ({ type: 'array', items });
export const TOOLS = [
  ['carga_termica', 'Carga térmica e potência nominal de ar condicionado por divisão.', { divisoes: arr(room({ pe_direito: { type: 'number' }, uso: { type: 'string', enum: Object.keys(USO) }, exposicao: { type: 'string', description: 'norte, sul, nascente, poente' }, muito_vidro: { type: 'boolean' }, ultimo_piso: { type: 'boolean' }, ocupantes: { type: 'number' } })), isolamento: { type: 'string', enum: ['bom', 'medio', 'fraco'] } }, ['divisoes']],
  ['multisplit', 'Escolhe a unidade exterior multisplit para as interiores dadas.', { interiores_kw: arr({ type: 'number' }), cargas_kw: arr({ type: 'number' }) }, ['interiores_kw']],
  ['linha_frigorifica', 'Diâmetros, metros de par de cobre, cabo de interligação, condensados, calha e gás adicional de UM split ou de UMA ligação de multisplit.', { potencia_kw: { type: 'number' }, distancia_m: { type: 'number', description: 'percurso real entre interior e exterior' }, carga_incluida_m: { type: 'number' }, desnivel_m: { type: 'number' }, distancia_esgoto_m: { type: 'number' }, percurso_a_vista_m: { type: 'number', description: 'metros de calha à vista' } }, ['potencia_kw', 'distancia_m']],
  ['cabo_eletrico', 'Secção do cabo de alimentação, disjuntor e diferencial para um equipamento. Para ar condicionado e bombas de calor indique potencia_termica_kw (a função converte para potência elétrica); potencia_w é só a potência ELÉTRICA absorvida (resistências, carregadores, aparelhos com chapa conhecida).', { potencia_w: { type: 'number', description: 'potência elétrica absorvida em W' }, potencia_termica_kw: { type: 'number', description: 'potência térmica nominal (frio/calor) de AC ou bomba de calor' }, distancia_m: { type: 'number', description: 'do quadro ao equipamento' }, trifasico: { type: 'boolean' } }, ['distancia_m']],
  ['aqs', 'Volume da bomba de calor AQS, vaso de expansão e tubagem.', { pessoas: { type: 'number' }, banhos_simultaneos: { type: 'number' }, distancia_m: { type: 'number' } }, ['pessoas']],
  ['bomba_calor_habitacao', 'Potência da bomba de calor de aquecimento central, inércia e vaso de expansão.', { area_m2: { type: 'number' }, isolamento: { type: 'string', enum: ['bom', 'medio', 'fraco'] }, emissores: { type: 'string', enum: ['piso', 'ventiloconvectores', 'radiadores'] }, pessoas_aqs: { type: 'number' } }, ['area_m2']],
  ['piso_radiante', 'Metros de tubo, circuitos, coletores, placa, fita perimetral e aditivo de piso radiante.', { divisoes: arr(room({ tipo: { type: 'string' }, espacamento_cm: { type: 'number' }, distancia_coletor_m: { type: 'number' } })), distancia_coletor_m: { type: 'number' } }, ['divisoes']],
  ['ventiloconvectores', 'Potência por divisão e tubagem hidráulica isolada, condensados de ventiloconvectores.', { divisoes: arr(room({ uso: { type: 'string', enum: Object.keys(USO) }, exposicao: { type: 'string' }, distancia_m: { type: 'number' } })), isolamento: { type: 'string', enum: ['bom', 'medio', 'fraco'] }, distancia_media_m: { type: 'number' } }, ['divisoes']],
  ['vmc', 'Caudais, unidade VMC, bocas, condutas e terminais.', { divisoes: arr(room({ tipo: { type: 'string', enum: ['sala', 'quarto', 'escritorio', 'cozinha', 'wc', 'lavandaria', 'despensa', 'outro'] } })), distancia_media_m: { type: 'number' }, comprimento_exterior_m: { type: 'number' } }, ['divisoes']],
  ['carregador', 'Cabo, disjuntor e diferencial de um carregador de veículo elétrico.', { potencia_kw: { type: 'number' }, distancia_m: { type: 'number' } }, ['distancia_m']],
].map(([name, description, properties, required]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }));

export function runCalc(name, args) {
  const f = CALCULOS[name];
  if (!f) return { erro: 'Cálculo desconhecido: ' + name };
  try { return f(args && typeof args === 'object' ? args : {}); } catch (e) { return { erro: String(e?.message || e) }; }
}
