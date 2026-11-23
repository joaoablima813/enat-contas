import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePedidoApi, handlePedidoPublic, autoCandidates, runAutoPedidos } from '../netlify/lib/pedido.mjs';

const P = globalThis.EnatPedido;
function blobs() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? structuredClone(m.get(k).data) : null),
    setJSON: async (k, v) => m.set(k, { data: JSON.parse(JSON.stringify(v)) }),
    set: async (k, v, o) => m.set(k, { data: v, metadata: o?.metadata || {} }),
    getWithMetadata: async (k) => (m.has(k) ? { data: m.get(k).data, metadata: m.get(k).metadata } : null),
    delete: async (k) => m.delete(k),
  };
}
const api = (store, method, path, body) => handlePedidoApi({ method, url: 'https://enat.example/api/' + path, json: async () => body }, path, store);
const pub = (store, token, method = 'GET', body, sub = '', headers = {}) => handlePedidoPublic({ method, url: 'https://enat.example/pedido/' + token, headers: new Headers(headers), text: async () => JSON.stringify(body), arrayBuffer: async () => body }, token, sub, store);

test('answers are cleaned: unknown solutions, options and fields are dropped', () => {
  const r = P.clean({ sol: ['Ar condicionado', 'Hack'], a: { ac_div: '3', ac_uso: 'Inventado', pv_fat: 'Até 50 €', casa: 'Moradia', ac_rooms: [{ t: 'Sala', m2: '30' }, { t: 'Hack', m2: 12 }, { t: 'Quarto', m2: 9999 }] }, gama: 'media', cp: '4990-062', morada: ' Rua 1 ' });
  assert.deepEqual(r.sol, ['Ar condicionado']);
  assert.deepEqual(r.a, { ac_div: '3', ac_rooms: [{ t: 'Sala', m2: 30 }, { t: 'Outra', m2: 12 }], casa: 'Moradia' }, 'only questions of the chosen solutions, with valid options and room areas');
  const rad = P.clean({ sol: ['Bomba de calor climatização'], a: { m2: '150', bcc_emis: 'Piso radiante', bcc_rad: 10, pessoas: '3 a 4' } });
  assert.deepEqual(rad.a, { m2: 150, bcc_emis: 'Piso radiante' }, 'radiator count only with radiators; house questions only if a chosen solution needs them');
  assert.deepEqual(P.houseFor(['Ar condicionado', 'Bomba de calor climatização']).map((q) => q.id), ['casa', 'fase', 'ano', 'jan', 'm2'], 'shared questions appear once; single/three-phase is always asked');
  assert.equal(P.clean({ sol: ['Bomba de calor climatização'], a: { bcc_aqs: 'Sim', pessoas: '3 a 4' } }).a.pessoas, '3 a 4', 'people at home also asked when the heat pump heats water');
  assert.equal(P.clean({ sol: ['Bomba de calor climatização'], a: { bcc_aqs: 'Não', pessoas: '3 a 4' } }).a.pessoas, undefined);
  assert.equal(r.gama, 'media');assert.equal(r.morada, 'Rua 1');
  assert.ok(P.summary(r).some(([k, v]) => k === 'Gama preferida' && /Equilíbrio/.test(v)));
});

test('the app creates one link per lead; the client answers on the page with photos; the app reads the answers', async () => {
  const store = blobs();
  const r1 = await (await api(store, 'POST', 'pedido', { lead: 'L1', nome: 'Maria Silva', sol: ['Ar condicionado'] })).json();
  assert.match(r1.url, /^https:\/\/enat\.example\/pedido\/[A-Za-z0-9_-]{24}$/);
  const r2 = await (await api(store, 'POST', 'pedido', { lead: 'L1', nome: 'Maria Silva', sol: [] })).json();
  assert.equal(r2.token, r1.token, 'asking again reuses the same link');

  const page = await (await pub(store, r1.token)).text();
  assert.match(page, /Olá Maria/);assert.match(page, /Quantas divisões quer climatizar/);assert.match(page, /Máxima qualidade/);assert.match(page, /Código postal/);
  assert.match(page, /data-tech="Ar condicionado">/, 'the chosen solution is open');assert.match(page, /data-tech="VMC" hidden/);

  const photo = await (await pub(store, r1.token, 'POST', new Uint8Array([1, 2, 3]).buffer, 'foto', { 'content-type': 'image/jpeg' })).json();
  assert.match(photo.id, /^[a-f0-9]{18}$/);
  const bad = await pub(store, r1.token, 'POST', { sol: ['Ar condicionado'], morada: 'Rua 1' });
  assert.equal(bad.status, 400, 'postcode is required');
  const ok = await pub(store, r1.token, 'POST', { sol: ['Ar condicionado'], a: { ac_div: '2' }, gama: 'qualidade', morada: 'Rua da Igreja 12', cp: '4990-062', local: 'Ponte de Lima', fotos: [photo.id, 'abcdefabcdefabcdef'] });
  assert.equal(ok.status, 200);

  const { pedidos } = await (await api(store, 'GET', 'pedidos')).json();
  assert.equal(pedidos.length, 1);assert.equal(pedidos[0].lead, 'L1');
  assert.deepEqual(pedidos[0].resp.fotos, [photo.id], 'only photos uploaded through this link');
  assert.equal(pedidos[0].resp.cp, '4990-062');
  const after = await (await pub(store, r1.token)).text();
  assert.match(after, /Os seus dados/);assert.match(after, /Ver ou alterar as respostas/);assert.match(after, /Mensagens/);assert.match(after, /orçamento de outra empresa/);
  assert.equal((await pub(store, 'x'.repeat(24))).status, 404);
});

test('client page: messages both ways, quotes from other companies, sent quotes listed, and a new link revokes the old one', async () => {
  const store = blobs();
  const { token } = await (await api(store, 'POST', 'pedido', { lead: 'L1', nome: 'Maria Silva', sol: ['VMC'] })).json();
  const empty = await pub(store, token, 'POST', { texto: '   ' }, 'msg');
  assert.equal(empty.status, 400);
  const m = await (await pub(store, token, 'POST', { texto: 'A exterior pode ficar no telhado?' }, 'msg')).json();
  assert.deepEqual(m.msgs.map((x) => [x.de, x.texto]), [['c', 'A exterior pode ficar no telhado?']]);
  const pdf = await (await pub(store, token, 'POST', new Uint8Array([37, 80, 68, 70]).buffer, 'anexo', { 'content-type': 'application/pdf', 'x-nome': encodeURIComponent('Orçamento Clima/../x.pdf') })).json();
  assert.equal(pdf.anexo.nome, 'Orçamento Clima .. x.pdf', 'file name cleaned');
  assert.equal((await pub(store, token, 'POST', new Uint8Array([1]).buffer, 'anexo', { 'content-type': 'text/html' })).status, 400, 'only PDF or photos');
  const { pedidos } = await (await api(store, 'GET', 'pedidos')).json();
  assert.equal(pedidos[0].resp, null);assert.ok(pedidos[0].chatAt > 0 && pedidos[0].anexoAt > 0, 'the app learns there is something new');
  const r = await (await api(store, 'POST', 'pedido/msg', { lead: 'L1', texto: 'Pode sim.' })).json();
  assert.equal(r.email, 'sem email');assert.deepEqual(r.msgs.map((x) => x.de), ['c', 'e']);
  const conv = await (await api(store, 'GET', 'pedido/conversa/L1')).json();
  assert.equal(conv.token, token);assert.equal(conv.msgs.length, 2);assert.equal(conv.anexos.length, 1);
  const file = await api(store, 'GET', 'pedido/anexo/' + conv.anexos[0].id);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  const { addProposta } = await import('../netlify/lib/pedido.mjs');
  assert.equal(await addProposta(store, 'L1', 'Maria Silva', { token: 'Q'.repeat(24), quote: 7, numero: 'ORC 2026/0007', titulo: 'VMC' }), token, 'a quote sent from the lead goes to the same page');
  const page = await (await pub(store, token)).text();
  assert.match(page, /ORC 2026\/0007/);assert.match(page, /href="\/proposta\/QQQQ/);assert.match(page, /Pode sim\./);
  const nl = await (await api(store, 'POST', 'pedido/novo-link', { lead: 'L1' })).json();
  assert.notEqual(nl.token, token);
  assert.equal((await pub(store, token)).status, 404, 'the old link stops working');
  assert.match(await (await pub(store, nl.token)).text(), /Pode sim\./, 'messages move to the new link');
});

const now = Date.parse('2026-11-23T11:00:00Z'), today = '2026-11-23';
const state = { leads: [
  { id: 'A', name: 'Ana Costa', email: 'ana@x.pt', stage: 'nova', date: today, solutions: ['VMC'] },
  { id: 'B', name: 'Bruno', email: 'b@x.pt', stage: 'contacto', date: today },
  { id: 'C', name: 'Carla', email: '', stage: 'nova', date: today },
  { id: 'D', name: 'Duarte', email: 'd@x.pt', stage: 'nova', date: '2026-10-01' },
  { id: 'E', name: 'Eva', email: 'e@x.pt', stage: 'nova', date: today, pedido: { sent: 1 } },
  { id: 'F', name: 'Filipe', email: 'f@x.pt', stage: 'nova', date: today },
], del: { 'leads:F': 1 } };
const inbox = [{ id: 'G', name: 'Gil', email: 'g@x.pt', received: '2026-11-22T20:00:00Z' }, { id: 'A', email: 'ana@x.pt' }];

test('automatic email only to new leads with an email, recent, never asked before and not deleted', () => {
  assert.deepEqual(autoCandidates(state, inbox, {}, now).map((l) => l.id), ['A', 'G']);
  assert.deepEqual(autoCandidates(state, inbox, { A: { at: 1 } }, now).map((l) => l.id), ['G'], 'once per lead');
});

test('the scheduled run emails the link once, during the day, and the app learns it was sent', async () => {
  const store = blobs(), mails = [];
  await store.setJSON('estado', state);await store.setJSON('leads-meta', { leads: inbox });
  const send = async (to, subject, text) => { mails.push({ to, subject, text }); };
  assert.deepEqual(await runAutoPedidos(store, Date.parse('2026-11-23T23:30:00Z'), send), { skipped: 'night' });
  assert.deepEqual(await runAutoPedidos(store, now, send), { sent: 2 });
  assert.deepEqual(mails.map((m) => m.to), ['ana@x.pt', 'g@x.pt']);
  assert.match(mails[0].text, /Olá Ana, sou João Lima[\s\S]*vmc[\s\S]*https:\/\/[^\s]+\/pedido\/[A-Za-z0-9_-]{24}/);
  assert.deepEqual(await runAutoPedidos(store, now + 10 * 60e3, send), { sent: 0 }, 'never twice');
  const { auto } = await (await api(store, 'GET', 'pedidos')).json();
  assert.deepEqual(auto.map((a) => a.lead).sort(), ['A', 'G']);
  await store.setJSON('empresa', { autoPedido: false });await store.setJSON('pedido-auto-ultimo', { t: 0 });
  assert.deepEqual(await runAutoPedidos(store, now + 20 * 60e3, send), { skipped: 'off' });
});

test('links sent to clients use LINK_URL when set (own address), otherwise the app address', async () => {
  const store = blobs();
  process.env.LINK_URL = 'https://propostas.exemplo.pt/';
  try {
    const r = await (await api(store, 'POST', 'pedido', { lead: 'L9', nome: 'Rui', sol: [] })).json();
    assert.match(r.url, /^https:\/\/propostas\.exemplo\.pt\/pedido\/[A-Za-z0-9_-]{24}$/);
  } finally { delete process.env.LINK_URL; }
  const r2 = await (await api(store, 'POST', 'pedido', { lead: 'L9', nome: 'Rui', sol: [] })).json();
  assert.match(r2.url, /^https:\/\/enat\.example\/pedido\//);
});
