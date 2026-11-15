// Orçamento automático rápido (poucos segundos):
// 1. Um modelo rápido lê o pedido e devolve só os dados da obra (divisões, áreas, metros, marca, o que excluir).
// 2. O servidor monta logo o kit completo de cada tipologia com os cálculos técnicos (quote-kit.mjs).
// 3. A app procura cada linha nas tabelas, catálogos e faturas; um modelo rápido escolhe o produto certo
//    (se falhar, a app escolhe sozinha pelas medidas).
// Os preços NUNCA vêm da IA: vêm das tabelas/catálogos (na app) ou da tabela de mão de obra do utilizador.
import OpenAI from 'openai';
import { EXTRACT, cleanSpec, buildPlan, UNITS, TOPICS } from './quote-kit.mjs';

export { KINDS, UNITS } from './quote-kit.mjs';
export const MODEL = 'gpt-5.4-mini';
const json = (status, body) => new Response(JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } });
const clip = (s, n) => String(s ?? '').slice(0, n);
const safeArr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

// Um único pedido curto à IA, com resposta em JSON. Sem ferramentas nem várias voltas: responde em segundos.
async function ask(instructions, input, { effort = 'none', timeout = 30000 } = {}) {
  const ai = new OpenAI({ timeout, maxRetries: 1 });
  const r = await ai.responses.create({ model: MODEL, instructions, input, store: false, reasoning: { effort }, text: { format: { type: 'json_object' } }, max_output_tokens: 8000 });
  if (!r.output_text) throw new Error('Resposta vazia da IA (' + r.status + ')');
  return parseJson(r.output_text);
}

export async function runFast(input) {
  const labour = input.maoObra.map((m) => `- ${m.id}: ${m.nome} (por ${m.unidade})`).join('\n') || '(sem tabela)';
  const msg = `PEDIDO / NOTAS DA VISITA:\n${input.texto}\n
Tipologias marcadas no orçamento: ${input.tipologias.join(', ') || '(nenhuma — deduz do pedido)'}
Marca já escolhida no orçamento: ${input.marca || '(nenhuma)'}
${input.regras ? `REGRAS DA EMPRESA (usa-as para preencher os campos que o pedido não diz):\n${input.regras}\n` : ''}
TABELA DE MÃO DE OBRA (ids):\n${labour}

Responde apenas com o objeto JSON.`;
  const spec = cleanSpec(await ask(EXTRACT, msg), input.maoObra.map((m) => m.id));
  // Um preço de mão de obra só conta se o número estiver mesmo escrito no pedido.
  const nums = new Set((input.texto.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.'))));
  spec.precos_mao_obra = spec.precos_mao_obra.filter((m) => nums.has(m.preco));
  if (!spec.tipologias.length && input.tipologias.length) Object.assign(spec, cleanSpec({ ...spec, tipologias: input.tipologias }));
  return buildPlan(spec, input);
}

const PICK = `Para cada linha do orçamento escolhe, entre os candidatos encontrados nas tabelas de preços, o produto que corresponde tecnicamente à especificação (potência, diâmetros, secção, volume, número de saídas, tipo, marca pedida). Se nenhum corresponder, usa null — é preferível uma linha sem preço a um produto errado.
Se o produto é vendido em embalagem/rolo/caixa (ex.: "rolo 15 m", "caixa 100 un."), converte a quantidade em embalagens inteiras e põe a unidade "un.". Se é vendido ao metro e a linha está em metros, mantém os metros.
Responde APENAS com JSON: {"escolhas": [{"id": "i1", "candidato": número ou null, "quantidade": n, "unidade": "un."}]}`;

export async function runPick(input) {
  const r = await ask('És o orçamentista técnico sénior da ENAT (climatização). ' + PICK, `Marca pedida: ${input.marca || '(nenhuma)'}\n\nLINHAS E CANDIDATOS:\n${JSON.stringify(input.itens)}\n\nResponde apenas com o objeto JSON.`, { effort: 'low', timeout: 25000 });
  const ids = new Set(input.itens.map((i) => i.id));
  return {
    escolhas: safeArr(r.escolhas, 200).filter((e) => e && ids.has(e.id)).map((e) => {
      const it = input.itens.find((i) => i.id === e.id), c = Number(e.candidato), q = Number(e.quantidade);
      return { id: e.id, candidato: e.corresponde !== false && e.candidato !== null && Number.isInteger(c) && c >= 0 && c < (it.candidatos || []).length ? c : null, quantidade: Number.isFinite(q) && q > 0 ? Math.round(q * 1000) / 1000 : null, unidade: UNITS.includes(e.unidade) ? e.unidade : null };
    }),
  };
}

// ---------- Validação dos pedidos da app ----------
export function readPlanInput(b) {
  const texto = clip(b?.texto, 8000).trim();
  if (texto.length < 10) return null;
  return {
    texto, marca: clip(b.marca, 100), morada: clip(b.morada, 300), regras: clip(b.regras, 4000),
    tipologias: safeArr(b.tipologias, 10).filter((t) => TOPICS.includes(t)),
    maoObra: safeArr(b.maoObra, 80).filter((m) => m && m.id && m.nome).map((m) => ({ id: clip(m.id, 40), nome: clip(m.nome, 120), unidade: UNITS.includes(m.unidade) ? m.unidade : 'un.', preco: Number(m.preco) > 0 ? Number(m.preco) : 0 })),
  };
}
export function readPickInput(b) {
  const itens = safeArr(b?.itens, 200).filter((i) => i && i.id).map((i) => ({
    id: clip(i.id, 20), descricao: clip(i.descricao, 400), especificacao: clip(i.especificacao, 400), quantidade: Number(i.quantidade) || 1, unidade: clip(i.unidade, 10),
    candidatos: safeArr(i.candidatos, 8).map((c, n) => ({ n, nome: clip(c?.nome, 200), ref: clip(c?.ref, 40), marca: clip(c?.marca, 40), preco: Number(c?.preco) || 0 })),
  })).filter((i) => i.candidatos.length);
  return itens.length ? { marca: clip(b.marca, 100), itens } : null;
}

const errMsg = (e) => {
  const status = Number(e?.status);
  console.error('orcamento-ia', status || '', e?.message || e);
  return status === 429 ? 'A IA está ocupada. Aguarde um minuto e tente novamente.' : e?.name === 'APIConnectionTimeoutError' ? 'A IA demorou a responder. Tente novamente.' : 'Não foi possível ler o pedido. Reformule ou tente novamente.';
};

export async function handleQuoteAi(req, path) {
  if (req.method !== 'POST') return json(404, { error: 'Não encontrado.' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
  if (path === 'orcamento-ia/rapido') {
    const input = readPlanInput(b);
    if (!input) return json(400, { error: 'Descreva a obra com um pouco mais de detalhe.' });
    try { return json(200, await runFast(input)); } catch (e) { return json(502, { error: e?.message === 'Sem linhas' ? 'Não percebi que solução quer. Indique a tipologia (ex.: ar condicionado, bomba de calor AQS) e as divisões.' : errMsg(e) }); }
  }
  if (path === 'orcamento-ia/escolher') {
    const input = readPickInput(b);
    if (!input) return json(400, { error: 'Sem produtos para escolher.' });
    try { return json(200, await runPick(input)); } catch (e) { return json(502, { error: errMsg(e) }); }
  }
  return json(404, { error: 'Não encontrado.' });
}
