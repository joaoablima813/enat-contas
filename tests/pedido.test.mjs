import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePedidoApi, handlePedidoPublic } from '../netlify/lib/pedido.mjs';

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
  const r = P.clean({ sol: ['Ar condicionado', 'Hack'], a: { ac_div: '3', ac_uso: 'Inventado', pv_fat: 'Até 50 €', casa: 'Moradia', ac_txt: 'sala e quartos' }, gama: 'media', cp: '4990-062', morada: ' Rua 1 ' });
  assert.deepEqual(r.sol, ['Ar condicionado']);
  assert.deepEqual(r.a, { ac_div: '3', ac_txt: 'sala e quartos', casa: 'Moradia' }, 'only questions of the chosen solutions, with valid options');
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
