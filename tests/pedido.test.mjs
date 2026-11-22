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
  assert.deepEqual(P.houseFor(['Ar condicionado', 'Bomba de calor climatização']).map((q) => q.id), ['casa', 'ano', 'jan', 'm2'], 'shared questions appear once');
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
  assert.match(await (await pub(store, r1.token)).text(), /Já recebemos as suas respostas/);
  assert.equal((await pub(store, 'x'.repeat(24))).status, 404);
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
