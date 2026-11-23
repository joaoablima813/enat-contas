import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPromocoes, visiveis, handlePromocoes } from '../netlify/lib/promocoes.mjs';
import { handleSite } from '../netlify/lib/site.mjs';

const blobs = () => {
  const m = new Map();
  return {
    m,
    get: async (k, o) => { const v = m.get(k); return v === undefined ? null : o?.type === 'json' ? JSON.parse(JSON.stringify(v.data)) : v.data; },
    setJSON: async (k, v) => { m.set(k, { data: JSON.parse(JSON.stringify(v)) }); },
    set: async (k, v, o) => { m.set(k, { data: v, metadata: o?.metadata }); },
    getWithMetadata: async (k) => m.get(k) || null,
    delete: async (k) => { m.delete(k); },
  };
};
const req = (method, body, headers = {}) => new Request('https://app.test/api/x', { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' || body instanceof ArrayBuffer ? body : JSON.stringify(body) });

test('promotions: only active ones with title, photo and still valid go to the site', () => {
  const list = cleanPromocoes([
    { id: 'a1', titulo: 'Daikin 2,5 kW', fotos: ['abcdefgh1'], ativo: true },
    { id: 'a2', titulo: 'Oculto', fotos: ['abcdefgh2'], ativo: false },
    { id: 'a3', titulo: '', fotos: ['abcdefgh3'] },
    { id: 'a4', titulo: 'Sem foto', fotos: [] },
    { id: 'a5', titulo: 'Acabou', fotos: ['abcdefgh5'], ate: '2026-01-31' },
    { id: 'a6', titulo: 'Até ao fim do mês', fotos: ['abcdefgh6', '../x'], ate: '2026-12-31' },
    { id: 'a1', titulo: 'Repetido', fotos: ['abcdefgh7'] },
  ]);
  assert.equal(list.length, 6, 'repeated ids dropped');
  assert.deepEqual(list.find((p) => p.id === 'a6').fotos, ['abcdefgh6'], 'invalid photo ids dropped');
  assert.deepEqual(visiveis(list, '2026-11-25').map((p) => p.id), ['a1', 'a6']);
});

test('the app saves promotions, removed photos are deleted, and the site gets the visible ones with their photos', async () => {
  const store = blobs();
  const up = await handlePromocoes(req('PUT', new Uint8Array([1, 2, 3]).buffer, { 'content-type': 'image/jpeg' }), 'promocoes/foto/fotoum123', store);
  assert.equal(up.status, 200);
  await store.set('pub-fotodois1', new Uint8Array([4]).buffer, { metadata: { mime: 'image/jpeg' } });
  await handlePromocoes(req('PUT', { promocoes: [{ id: 'a1', titulo: 'Promo AC', descricao: 'Inclui instalação', preco: '899 €', precoAntes: '1 099 €', fotos: ['fotoum123'] }, { id: 'a2', titulo: 'Escondida', fotos: ['fotodois1'], ativo: false }] }), 'promocoes', store);
  const site = await (await handleSite(new Request('https://app.test/site-api/promocoes', { headers: { origin: 'https://enat-pontedelima.pt' } }), 'promocoes', store)).json();
  assert.deepEqual(site.promocoes.map((p) => [p.titulo, p.preco, p.precoAntes]), [['Promo AC', '899 €', '1 099 €']]);
  assert.equal(site.promocoes[0].fotos[0], 'https://app.test/site-api/img/fotoum123');
  const img = await handleSite(new Request('https://app.test/site-api/img/fotoum123'), 'img/fotoum123', store);
  assert.equal(img.status, 200, 'photo of a visible promotion is public');
  assert.equal((await handleSite(new Request('https://app.test/site-api/img/fotodois1'), 'img/fotodois1', store)).status, 404, 'photo of a hidden promotion is not public');
  await handlePromocoes(req('PUT', { promocoes: [] }), 'promocoes', store);
  assert.ok(!store.m.has('pub-fotoum123') && !store.m.has('pub-fotodois1'), 'deleting a promotion deletes its photos');
});
