// Orçamento automático: a IA lê o pedido, dimensiona com os cálculos técnicos, revê a lista de material
// contra as listas de verificação de cada tipologia e, por fim, escolhe os produtos das tabelas de preços.
// Os preços NUNCA vêm da IA: vêm das tabelas/catálogos (na app) ou da tabela de mão de obra do utilizador.
// Cada fase corre numa função em segundo plano (pode demorar minutos) e o resultado fica nos Blobs.
import { getStore } from '@netlify/blobs';
import OpenAI from 'openai';
import { randomBytes } from 'node:crypto';
import { TOOLS, runCalc } from './hvac-calc.mjs';

export const MODEL = 'gpt-5.5';
const json = (status, body) => new Response(JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } });
const store = () => getStore({ name: 'orcamento-ia', consistency: 'strong' });
export const KINDS = ['Equipamento', 'Material', 'Acessórios', 'Mão de obra', 'Outros'];
export const UNITS = ['un.', 'm', 'm²', 'm³', 'h', 'dia', 'serviço'];
const TOPICS = ['VMC', 'Bomba de calor AQS', 'Bomba de calor climatização', 'Ar condicionado', 'Ventiloconvectores', 'UPAC (fotovoltaico)', 'Painéis solares térmicos', 'Carregador automóvel', 'Piso radiante', 'Geral / outros'];

// Listas de verificação: o que uma instalação bem feita leva, por tipologia. O planeador e o revisor são obrigados a cobri-las.
export const CHECKLISTS = {
  'Ar condicionado': [
    'Unidade(s) interior(es) com a potência calculada por divisão (carga_termica)',
    'Unidade exterior (monosplit: uma por interior; multisplit: calculada com multisplit e com saídas suficientes)',
    'Suporte da unidade exterior: suportes de parede (par) ou apoios de chão/telhado, e apoios antivibráticos (4 un.)',
    'Par de cobre pré-isolado com os diâmetros certos, por linha (linha_frigorifica), metros = percurso + folga',
    'Cabo de interligação interior-exterior (4G1,5 mm² H07RN-F ou o indicado pelo fabricante), por linha',
    'Cabo de alimentação, disjuntor dedicado e diferencial (cabo_eletrico), incluindo ligação ao quadro',
    'Esgoto de condensados (tubo 16/20 mm e acessórios); bomba de condensados quando não há esgoto por gravidade',
    'Calha técnica à vista (metros) com curvas, uniões, terminais e passa-muros',
    'Furação / passa-muros da parede (um por linha)',
    'Gás refrigerante adicional quando a linha excede a carga de fábrica',
    'Consumíveis: fita de acabamento, abraçadeiras, buchas, parafusos, espuma/silicone',
    'Multisplit: redutores/adaptadores de diâmetro das saídas da exterior quando os diâmetros não coincidem',
    'Comando/wifi quando pedido ou quando não incluído',
    'Mão de obra: instalação de cada interior e exterior, linhas frigoríficas, vácuo/ensaio de estanquidade/arranque, ligação elétrica, deslocação',
  ],
  'Bomba de calor AQS': [
    'Bomba de calor AQS com o volume calculado (aqs)',
    'Grupo de segurança hidráulico (válvula de segurança 7 bar) com sifão/funil de descarga',
    'Vaso de expansão sanitário com o volume indicado e respetivo suporte/ligação',
    'Válvula misturadora termostática à saída de água quente',
    'Válvulas de corte (entrada de água fria e saída quente) e uniões/manguitos dielétricos (2)',
    'Tubagem (multicamada/PPR) com acessórios e isolamento da água quente',
    'Esgoto de condensados e da válvula de segurança',
    'Kit de condutas de ar (se instalada em espaço fechado sem renovação de ar)',
    'Cabo de alimentação, disjuntor e diferencial (cabo_eletrico)',
    'Desmontagem e remoção do equipamento antigo (termoacumulador/esquentador), se existir',
    'Mão de obra: instalação, ligações hidráulicas e elétricas, arranque, deslocação',
  ],
  'Bomba de calor climatização': [
    'Unidade exterior + módulo hidráulico (hydrobox/ECH2O/monobloco) com a potência calculada (bomba_calor_habitacao)',
    'Depósito de AQS integrado ou separado quando há produção de águas quentes',
    'Depósito de inércia quando os emissores o exigem (volume indicado)',
    'Vaso de expansão do circuito de aquecimento e válvula de segurança 3 bar',
    'Filtro magnético / separador de sujidades e válvulas de corte',
    'Válvula de 3 vias AQS/aquecimento (se não incluída)',
    'Tubagem hidráulica isolada entre exterior e interior (ou linha frigorífica num split)',
    'Apoios antivibráticos / suporte da exterior e ligações flexíveis antivibráticas',
    'Proteção anticongelação (glicol ou válvulas anticongelação) em monoblocos',
    'Termóstato/controlador de ambiente e sondas',
    'Cabos de alimentação, disjuntores e diferencial (exterior e resistência de apoio)',
    'Purgadores, manómetro, enchimento e aditivo inibidor',
    'Mão de obra: instalação, circuito hidráulico, ligações elétricas, enchimento, purga e arranque',
  ],
  Ventiloconvectores: [
    'Ventiloconvector por divisão com a potência necessária (ventiloconvectores) e modelo adequado (mural, consola, conduta, cassete)',
    'Comando/termóstato de cada unidade (ou controlo centralizado)',
    'Válvula de 2 ou 3 vias com atuador por unidade (kit de válvulas)',
    'Válvulas de corte e purgador por unidade',
    'Tubagem multicamada ida e retorno com o diâmetro indicado e isolamento anti-condensação',
    'Esgoto de condensados por unidade (tubo e acessórios; bomba de condensados quando necessário)',
    'Suportes/fixações e acessórios de montagem (pés, envolvente, plenum de conduta, grelhas quando de conduta)',
    'Cabo de alimentação e de comando, proteção no quadro',
    'Sistema de produção (bomba de calor reversível/chiller) quando não existe, com vaso de expansão e inércia',
    'Mão de obra: instalação de cada unidade, tubagem hidráulica, ligações elétricas, purga e arranque',
  ],
  'Piso radiante': [
    'Tubo PE-RT/PEX 16 mm (metros calculados em piso_radiante)',
    'Placa isolante com pitons (m²) e filme de polietileno',
    'Fita perimetral (metros)',
    'Coletor(es) com caudalímetros, com o número de saídas, e caixa de coletor',
    'Cabeças termoelétricas (uma por circuito) e termóstatos por zona com módulo de ligação',
    'Aditivo para betonilha',
    'Grupo de mistura/bomba circuladora quando a produção é de alta temperatura',
    'Curvas guia/ligações ao coletor, válvulas de corte e purgadores',
    'Produção de calor (bomba de calor) se fizer parte do pedido',
    'Mão de obra: montagem por m², ligações ao coletor, ensaio de pressão, enchimento; betonilha normalmente pela construção civil (indicar)',
  ],
  VMC: [
    'Unidade VMC de recuperação de calor com o caudal calculado (vmc)',
    'Conduta semirrígida (metros) para insuflação e extração',
    'Caixas de distribuição/plénuns e acessórios de ligação',
    'Bocas/difusores de insuflação e de extração (quantidade calculada)',
    'Conduta isolada para o exterior (admissão e rejeição) e terminais de parede/cobertura',
    'Silenciadores',
    'Esgoto de condensados da unidade',
    'Comando e sensores (humidade/CO2) quando aplicável',
    'Suportes e fixações, fita de alumínio, abraçadeiras',
    'Alimentação elétrica',
    'Mão de obra: instalação da unidade, pontos de insuflação/extração, condutas, regulação de caudais',
  ],
  'UPAC (fotovoltaico)': [
    'Painéis, inversor e, se pedido, bateria (o dimensionamento detalhado faz-se na secção fotovoltaica da app; aqui use os dados do pedido)',
    'Estrutura de fixação adequada à cobertura',
    'Cabo solar 6 mm² e conectores MC4',
    'Proteções DC (seccionador/fusíveis/descarregador) e AC (disjuntor, diferencial, descarregador)',
    'Contador/medidor de energia (smart meter) e comunicação',
    'Cabo AC até ao quadro e ligação à terra',
    'Registo/licenciamento DGEG',
    'Mão de obra: montagem, ligações, configuração',
  ],
  'Painéis solares térmicos': [
    'Coletor(es) solar(es) e estrutura',
    'Depósito solar (termossifão ou circulação forçada)',
    'Grupo hidráulico solar, centralina e sondas (circulação forçada)',
    'Vaso de expansão solar e fluido térmico (glicol)',
    'Tubagem inox flexível isolada solar',
    'Válvula misturadora termostática e válvulas de corte/segurança',
    'Mão de obra: montagem, ligações, enchimento e arranque',
  ],
  'Carregador automóvel': [
    'Carregador (wallbox) com a potência adequada à potência contratada',
    'Cabo de alimentação com a secção calculada (carregador)',
    'Disjuntor dedicado e diferencial tipo A com deteção DC 6 mA (ou tipo B)',
    'Tubo/calha e acessórios do percurso',
    'Gestor dinâmico de potência (pinça/medidor) quando a potência contratada é justa',
    'Mão de obra: instalação, ligação ao quadro, configuração e teste',
  ],
  'Geral / outros': ['Todos os materiais, acessórios e mão de obra necessários para executar o trabalho descrito, sem deixar nada implícito'],
};

const checklistText = (topics) => topics.map((t) => `### ${t}\n- ` + (CHECKLISTS[t] || CHECKLISTS['Geral / outros']).join('\n- ')).join('\n\n');

const SYSTEM = `És o orçamentista técnico sénior da ENAT (Ponte de Lima), empresa de climatização, AQS, ventilação, piso radiante e energias renováveis.
Fazes orçamentos completos, coerentes e executáveis: nada pode faltar para o técnico chegar à obra e instalar.
Regras:
1. Dimensiona SEMPRE com as ferramentas de cálculo (carga_termica, multisplit, linha_frigorifica, cabo_eletrico, aqs, bomba_calor_habitacao, piso_radiante, ventiloconvectores, vmc, carregador). Não inventes potências, diâmetros, secções ou metros: usa os resultados. Chama uma ferramenta por cada linha frigorífica/equipamento quando as distâncias diferem.
2. Quando falta um dado, assume um valor típico e prudente (ex.: pé-direito 2,6 m, isolamento médio, 5 m de linha por split, 10 m do quadro) e regista-o em "pressupostos". Pergunta apenas o essencial em "perguntas".
3. Cobre TODOS os pontos da lista de verificação de cada tipologia. Cada ponto fica "incluido" (com os ids das linhas) ou "nao_aplica" com o motivo.
4. Uma linha por produto. Quantidades reais (metros arredondados para cima, unidades inteiras). Separa equipamento, material, acessórios, mão de obra e outros.
5. Para cada linha que não é mão de obra escreve 2 a 4 termos de pesquisa curtos (2–5 palavras) para encontrar o produto nas tabelas de preços portuguesas, do mais específico para o mais genérico, com medidas e marca quando relevante. Ex.: ["par cobre isolado 1/4 3/8", "tubo cobre isolado 3/8", "cobre frigorifico 3/8"]. Para equipamentos inclui a potência e o tipo, ex.: ["LG mural 2,5 kW", "unidade interior mural 2,5", "split 9000 btu"].
6. A marca pedida pelo cliente manda nos equipamentos. Sem marca indicada, escolhe famílias que existam no catálogo disponível.
7. Mão de obra: usa os itens da tabela de mão de obra do utilizador (campo "mao_obra" com o id) e a unidade desse item. Se o utilizador indicar um valor no pedido, põe-no em "preco_indicado". Nunca inventes preços de material.
8. Unidades permitidas: ${UNITS.join(', ')}. Gás refrigerante adicional em "un." (kg ou garrafa) com a quantidade explicada na descrição.
9. Não incluas itens condicionais cuja condição não se verifica (ex.: gás adicional com a linha dentro da carga de fábrica, bomba de condensados quando há esgoto por gravidade); marca esses pontos como "nao_aplica" com o motivo.
10. Escreve em português de Portugal, descrições claras para o cliente (sem nomes de fornecedores).`;

const PLAN_FORMAT = `Responde APENAS com JSON:
{"resumo": "2-3 frases sobre a solução proposta",
"tipologias": [das: ${TOPICS.join(' | ')}],
"marca": "marca principal dos equipamentos ou ''",
"dimensionamento": [{"titulo": "Sala 30 m²", "detalhe": "carga 3,3 kW → mural 3,5 kW (12 000 BTU)"}],
"pressupostos": ["…"], "perguntas": ["…"],
"itens": [{"id": "i1", "tipologia": "...", "categoria": "${KINDS.join('|')}", "descricao": "texto da linha", "especificacao": "dados técnicos para escolher o produto (potência, diâmetro, secção, volume)", "quantidade": 1, "unidade": "un.", "pesquisa": ["..."], "mao_obra": "id da tabela de mão de obra ou null", "preco_indicado": null}],
"verificacao": [{"tipologia": "...", "ponto": "texto do ponto da lista", "estado": "incluido|nao_aplica", "itens": ["i1"], "nota": ""}]}`;

const REVIEW = `És o diretor técnico da ENAT a rever o orçamento de um colega antes de seguir para o cliente.
Confirma, ponto a ponto, a lista de verificação e a coerência técnica: potências vs áreas, diâmetros de cobre vs potência, cabo vs disjuntor, metros vs distâncias, uma linha frigorífica/cabo/condensados/passa-muros por cada unidade, suportes da exterior, mão de obra para cada trabalho, quantidades plausíveis, nada duplicado.
Responde APENAS com JSON:
{"acrescentar": [itens no mesmo formato, ids novos "r1", "r2"…], "corrigir": [{"id": "i3", "quantidade": 8, "descricao": "opcional", "especificacao": "opcional", "pesquisa": ["opcional"], "motivo": "…"}], "remover": [{"id": "i9", "motivo": "duplicado"}], "verificacao": [lista final completa no mesmo formato], "avisos": ["riscos ou pontos a confirmar na visita"]}`;

const PICK = `Para cada linha do orçamento escolhe, entre os candidatos encontrados nas tabelas de preços, o produto que corresponde tecnicamente à especificação (potência, diâmetros, secção, volume, tipo, marca pedida). Se nenhum corresponder, usa null — é preferível uma linha sem preço a um produto errado.
Se o produto é vendido em embalagem/rolo/caixa (ex.: "rolo 15 m", "caixa 100 un."), converte a quantidade em embalagens inteiras e põe a unidade "un.". Se é vendido ao metro e a linha está em metros, mantém os metros.
Responde APENAS com JSON: {"escolhas": [{"id": "i1", "corresponde": true|false, "candidato": número ou null, "quantidade": n, "unidade": "un.", "motivo": "curto"}]}
"corresponde" é false sempre que a potência, medida, calibre, secção, volume ou tipo do candidato difere da especificação; nesse caso "candidato" é null.`;

const clip = (s, n) => String(s ?? '').slice(0, n);
const safeArr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

// Uma conversa com a IA (Responses API), com as ferramentas de cálculo executadas aqui no servidor.
// Sem estado no fornecedor: o raciocínio volta cifrado em cada pedido.
const RTOOLS = TOOLS.map((t) => ({ type: 'function', name: t.function.name, description: t.function.description, parameters: t.function.parameters }));
async function chat(messages, { tools = false, effort = 'medium', maxTurns = 14, onTool } = {}) {
  const ai = new OpenAI({ timeout: 300000, maxRetries: 1 });
  const [system, ...rest] = messages;
  const input = rest.map((m, i) => ({ role: m.role, content: m.content + (i === rest.length - 1 ? '\n\nResponde apenas com o objeto JSON pedido.' : '') }));
  for (let turn = 0; turn < maxTurns; turn++) {
    const r = await ai.responses.create({
      model: MODEL, instructions: system.content, input, store: false, include: ['reasoning.encrypted_content'],
      reasoning: { effort }, text: { format: { type: 'json_object' } }, max_output_tokens: 64000,
      ...(tools ? { tools: RTOOLS, tool_choice: turn === maxTurns - 1 ? 'none' : 'auto' } : {}),
    });
    const calls = (r.output || []).filter((o) => o.type === 'function_call');
    if (calls.length) {
      input.push(...r.output);
      for (const c of calls) {
        let args = {}; try { args = JSON.parse(c.arguments || '{}'); } catch {}
        const out = runCalc(c.name, args);
        onTool?.(c.name, args, out);
        input.push({ type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(out) });
      }
      continue;
    }
    if (!r.output_text) throw new Error('Resposta vazia da IA (' + r.status + ')');
    return parseJson(r.output_text);
  }
  throw new Error('A IA não terminou o orçamento');
}

export function cleanItem(it, i, prefix = 'i') {
  if (!it || typeof it !== 'object') return null;
  const descricao = clip(it.descricao, 400).trim();
  if (!descricao) return null;
  const q = Number(it.quantidade);
  return {
    id: clip(it.id || prefix + (i + 1), 20),
    tipologia: TOPICS.includes(it.tipologia) ? it.tipologia : 'Geral / outros',
    categoria: KINDS.includes(it.categoria) ? it.categoria : 'Material',
    descricao, especificacao: clip(it.especificacao, 400),
    quantidade: Number.isFinite(q) && q > 0 ? Math.min(Math.round(q * 1000) / 1000, 1e5) : 1,
    unidade: UNITS.includes(it.unidade) ? it.unidade : 'un.',
    pesquisa: safeArr(it.pesquisa, 5).map((s) => clip(s, 80)).filter(Boolean),
    mao_obra: it.mao_obra ? clip(it.mao_obra, 40) : null,
    preco_indicado: Number.isFinite(Number(it.preco_indicado)) && it.preco_indicado !== null && Number(it.preco_indicado) >= 0 ? Number(it.preco_indicado) : null,
  };
}

// Junta as correções do revisor ao plano.
export function applyReview(plan, rev) {
  if (!rev || typeof rev !== 'object') return plan;
  const out = { ...plan, itens: [...plan.itens], avisos: safeArr(rev.avisos, 20).map((s) => clip(s, 400)) };
  const rm = new Set(safeArr(rev.remover, 50).map((r) => r?.id));
  out.itens = out.itens.filter((it) => !rm.has(it.id));
  for (const c of safeArr(rev.corrigir, 80)) {
    const it = out.itens.find((x) => x.id === c?.id);
    if (!it) continue;
    const q = Number(c.quantidade);
    if (Number.isFinite(q) && q > 0) it.quantidade = Math.round(q * 1000) / 1000;
    if (c.descricao) it.descricao = clip(c.descricao, 400);
    if (c.especificacao) it.especificacao = clip(c.especificacao, 400);
    if (Array.isArray(c.pesquisa) && c.pesquisa.length) it.pesquisa = c.pesquisa.slice(0, 5).map((s) => clip(s, 80));
  }
  const ids = new Set(out.itens.map((x) => x.id));
  safeArr(rev.acrescentar, 60).forEach((it, i) => { const c = cleanItem(it, i, 'r'); if (c) { while (ids.has(c.id)) c.id += 'b'; ids.add(c.id); out.itens.push(c); } });
  if (Array.isArray(rev.verificacao) && rev.verificacao.length) out.verificacao = cleanCheck(rev.verificacao);
  return out;
}

const cleanCheck = (v) => safeArr(v, 150).filter((c) => c && c.ponto).map((c) => ({ tipologia: clip(c.tipologia, 60), ponto: clip(c.ponto, 300), estado: c.estado === 'nao_aplica' ? 'nao_aplica' : 'incluido', itens: safeArr(c.itens, 20).map((s) => clip(s, 20)), nota: clip(c.nota, 300) }));

export function cleanPlan(p) {
  if (!p || typeof p !== 'object') throw new Error('Plano inválido');
  const itens = safeArr(p.itens, 150).map((it, i) => cleanItem(it, i)).filter(Boolean);
  if (!itens.length) throw new Error('A IA não devolveu linhas de orçamento');
  return {
    resumo: clip(p.resumo, 1200), marca: clip(p.marca, 100),
    tipologias: safeArr(p.tipologias, 10).filter((t) => TOPICS.includes(t)),
    dimensionamento: safeArr(p.dimensionamento, 40).filter((d) => d && d.titulo).map((d) => ({ titulo: clip(d.titulo, 120), detalhe: clip(d.detalhe, 400) })),
    pressupostos: safeArr(p.pressupostos, 30).map((s) => clip(s, 300)).filter(Boolean),
    perguntas: safeArr(p.perguntas, 15).map((s) => clip(s, 300)).filter(Boolean),
    itens, verificacao: cleanCheck(p.verificacao),
  };
}

const CALC_LABEL = { carga_termica: 'carga térmica', multisplit: 'multisplit', linha_frigorifica: 'linha frigorífica', cabo_eletrico: 'cabo elétrico', aqs: 'águas quentes', bomba_calor_habitacao: 'bomba de calor', piso_radiante: 'piso radiante', ventiloconvectores: 'ventiloconvectores', vmc: 'VMC', carregador: 'carregador' };

export async function runPlan(input, progress = async () => {}) {
  const topics = input.tipologias.length ? input.tipologias : TOPICS;
  const labour = input.maoObra.length ? input.maoObra.map((m) => `- ${m.id}: ${m.nome} (por ${m.unidade})${m.preco > 0 ? ' — ' + m.preco + ' €' : ' — sem preço definido'}`).join('\n') : '(sem tabela: use mao_obra null e descreva o trabalho)';
  const ctx = `PEDIDO DO CLIENTE / NOTAS DA VISITA:\n${input.texto}\n
Tipologias marcadas: ${input.tipologias.join(', ') || '(nenhuma — deduz do pedido)'}
Marca pedida: ${input.marca || '(nenhuma)'}
Localização da obra: ${input.morada || 'Norte de Portugal'}
${input.regras ? `REGRAS DA EMPRESA (prevalecem sobre os valores típicos):\n${input.regras}\n` : ''}
TABELA DE MÃO DE OBRA DO UTILIZADOR:\n${labour}

CATÁLOGO DISPONÍVEL (marcas e famílias nas tabelas de preços):\n${input.catalogo || '(desconhecido)'}

LISTAS DE VERIFICAÇÃO A CUMPRIR:\n${checklistText(topics.filter((t) => CHECKLISTS[t]).length ? topics : ['Geral / outros'])}`;
  const calcs = [];
  await progress('A analisar o pedido e a dimensionar…');
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: ctx + '\n\n' + PLAN_FORMAT }];
  const raw = await chat(messages, { tools: true, effort: 'medium', onTool: (n, a, out) => { calcs.push({ nome: n, entrada: a, resultado: out }); progress('A calcular ' + (CALC_LABEL[n] || n) + '…'); } });
  let plan = cleanPlan(raw);
  await progress('A rever o orçamento: acessórios, quantidades e coerência…');
  try {
    const rev = await chat([
      { role: 'system', content: SYSTEM + '\n\n' + REVIEW },
      { role: 'user', content: ctx + `\n\nCÁLCULOS FEITOS:\n${JSON.stringify(calcs).slice(0, 30000)}\n\nORÇAMENTO A REVER:\n${JSON.stringify(plan)}` },
    ], { tools: true, effort: 'medium', maxTurns: 8 });
    plan = applyReview(plan, rev);
  } catch (e) { console.error('orcamento-ia revisão', e?.message || e); plan.avisos = ['A revisão automática não terminou; confirme os acessórios.']; }
  plan.calculos = calcs.slice(0, 40).map((c) => ({ nome: c.nome, nota: clip(c.resultado?.nota || c.resultado?.criterio || '', 300) })).filter((c) => c.nota);
  return plan;
}

export async function runPick(input, progress = async () => {}) {
  await progress('A escolher os produtos certos nas tabelas de preços…');
  const r = await chat([
    { role: 'system', content: 'És o orçamentista técnico sénior da ENAT (climatização). ' + PICK },
    { role: 'user', content: `Marca pedida: ${input.marca || '(nenhuma)'}\n\nLINHAS E CANDIDATOS:\n${JSON.stringify(input.itens)}` },
  ], { effort: 'low' });
  const ids = new Set(input.itens.map((i) => i.id));
  return {
    escolhas: safeArr(r.escolhas, 200).filter((e) => e && ids.has(e.id)).map((e) => {
      const it = input.itens.find((i) => i.id === e.id), c = Number(e.candidato), q = Number(e.quantidade);
      return { id: e.id, candidato: e.corresponde !== false && e.candidato !== null && Number.isInteger(c) && c >= 0 && c < (it.candidatos || []).length ? c : null, quantidade: Number.isFinite(q) && q > 0 ? Math.round(q * 1000) / 1000 : null, unidade: UNITS.includes(e.unidade) ? e.unidade : null, motivo: clip(e.motivo, 200) };
    }),
  };
}

// ---------- Validação dos pedidos da app ----------
export function readPlanInput(b) {
  const texto = clip(b?.texto, 8000).trim();
  if (texto.length < 10) return null;
  return {
    texto, marca: clip(b.marca, 100), morada: clip(b.morada, 300), regras: clip(b.regras, 4000), catalogo: clip(b.catalogo, 12000),
    tipologias: safeArr(b.tipologias, 10).filter((t) => TOPICS.includes(t)),
    maoObra: safeArr(b.maoObra, 80).filter((m) => m && m.id && m.nome).map((m) => ({ id: clip(m.id, 40), nome: clip(m.nome, 120), unidade: UNITS.includes(m.unidade) ? m.unidade : 'un.', preco: Number(m.preco) > 0 ? Number(m.preco) : 0 })),
  };
}
export function readPickInput(b) {
  const itens = safeArr(b?.itens, 200).filter((i) => i && i.id).map((i) => ({
    id: clip(i.id, 20), descricao: clip(i.descricao, 400), especificacao: clip(i.especificacao, 400), quantidade: Number(i.quantidade) || 1, unidade: clip(i.unidade, 10),
    candidatos: safeArr(i.candidatos, 10).map((c, n) => ({ n, nome: clip(c?.nome, 250), ref: clip(c?.ref, 60), marca: clip(c?.marca, 60), grupo: clip(c?.grupo, 200), preco: Number(c?.preco) || 0 })),
  })).filter((i) => i.candidatos.length);
  return itens.length ? { marca: clip(b.marca, 100), itens } : null;
}

// ---------- Pedidos (jobs) ----------
export async function handleQuoteAi(req, path, origin) {
  const st = store();
  const m = path.match(/^orcamento-ia\/pedido\/([a-f0-9]{24})$/);
  if (m && req.method === 'GET') {
    const j = await st.get('job-' + m[1], { type: 'json' });
    if (!j) return json(404, { error: 'Pedido não encontrado.' });
    // Uma função em segundo plano que nunca arrancou ou morreu a meio é dada como falhada.
    if ((j.status === 'pendente' || j.status === 'a trabalhar') && Date.now() - j.at > 16 * 60e3) return json(200, { status: 'erro', erro: 'O pedido demorou demasiado. Tente novamente.' });
    return json(200, { status: j.status, progresso: j.progresso || '', resultado: j.resultado, erro: j.erro });
  }
  const fase = path === 'orcamento-ia/planear' ? 'planear' : path === 'orcamento-ia/escolher' ? 'escolher' : null;
  if (!fase || req.method !== 'POST') return json(404, { error: 'Não encontrado.' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
  const input = fase === 'planear' ? readPlanInput(b) : readPickInput(b);
  if (!input) return json(400, { error: fase === 'planear' ? 'Descreva a obra com um pouco mais de detalhe.' : 'Sem produtos para escolher.' });
  const id = randomBytes(12).toString('hex'), token = randomBytes(16).toString('hex');
  await st.setJSON('job-' + id, { fase, input, token, status: 'pendente', at: Date.now() });
  const r = await fetch(origin + '/.netlify/functions/orcamento-ia-background', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token }) }).catch((e) => ({ ok: false, status: String(e?.message || e) }));
  if (!r.ok && r.status !== 202) { await st.delete('job-' + id); return json(502, { error: 'Não foi possível iniciar a IA. Tente novamente.' }); }
  // Limpeza dos pedidos com mais de um dia.
  st.list({ prefix: 'job-' }).then(async ({ blobs }) => { for (const { key } of blobs.slice(0, 200)) { const j = await st.get(key, { type: 'json' }).catch(() => null); if (j && Date.now() - j.at > 864e5) await st.delete(key); } }).catch(() => {});
  return json(202, { id });
}

export async function runJob(id, token) {
  if (!/^[a-f0-9]{24}$/.test(String(id))) return;
  const st = store(), key = 'job-' + id, j = await st.get(key, { type: 'json' });
  if (!j || j.token !== token || j.status !== 'pendente') return;
  const save = async (v) => { Object.assign(j, v); await st.setJSON(key, j); };
  await save({ status: 'a trabalhar', progresso: 'A iniciar…', at: Date.now() });
  let last = 0;
  const progress = async (p) => { j.progresso = p; if (Date.now() - last > 1500) { last = Date.now(); await st.setJSON(key, j).catch(() => {}); } };
  try {
    const resultado = j.fase === 'planear' ? await runPlan(j.input, progress) : await runPick(j.input, progress);
    await save({ status: 'pronto', resultado, progresso: '', input: undefined });
  } catch (e) {
    const status = Number(e?.status);
    console.error('orcamento-ia', j.fase, status || '', e?.message || e);
    await save({ status: 'erro', erro: status === 429 ? 'A IA está ocupada. Aguarde um minuto e tente novamente.' : e instanceof SyntaxError ? 'A IA devolveu uma resposta incompleta. Tente novamente.' : 'Não foi possível preparar o orçamento automático. Tente novamente.' });
  }
}
