import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPortfolio, nearby, postcode, portfolioImages, handlePortfolio, monthLabel } from '../netlify/lib/portfolio.mjs';

const ph = (n) => 'foto000000' + n;
const works = cleanPortfolio([
  { id: 'a', tipo: 'Ar condicionado', titulo: 'Ar condicionado em moradia', local: 'Ponte de Lima', cp: '4990', mes: '2026-05', fotos: [ph(1)], ok: true },
  { id: 'b', tipo: 'VMC', titulo: 'VMC em apartamento', local: 'Viana do Castelo', cp: '4900', mes: '2026-09', fotos: [ph(2)], ok: true },
  { id: 'c', tipo: 'Ar condicionado', titulo: 'Ar condicionado em loja', local: 'Braga', cp: '4700', mes: '2026-10', fotos: [ph(3)], ok: true },
  { id: 'd', tipo: 'Ar condicionado', titulo: 'Sem autorização', local: 'Ponte de Lima', cp: '4990', mes: '2026-10', fotos: [ph(4)], ok: false },
  { id: 'e', tipo: 'VMC', titulo: 'Sem fotos', local: 'Ponte de Lima', cp: '4990', mes: '2026-10', fotos: [], ok: true },
  { id: 'bad id!', titulo: 'x', local: 'y', fotos: [ph(5)], ok: true },
]);

test('only clean entries with photos are kept; only authorised photos are public', () => {
  assert.deepEqual(works.map((w) => w.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(portfolioImages(works), [ph(1), ph(2), ph(3)]);
  assert.equal(cleanPortfolio([{ id: 'x', fotos: ['../etc'], ok: true }]).length, 0, 'photo ids must be safe');
});

test('jobs near the client come first: same postcode, then same region, preferring the same type of work', () => {
  assert.equal(postcode('Rua da Igreja 12, 4990-062 Ponte de Lima'), '4990');
  const near = nearby(works, 'Rua da Igreja 12, 4990-062 Ponte de Lima', ['Ar condicionado']);
  assert.equal(near.title, 'Obras que fizemos perto de si');
  assert.deepEqual(near.items.map((w) => w.id), ['a', 'b', 'c']);
  assert.ok(!near.items.some((w) => w.id === 'd'), 'never shows a job without consent');
  assert.equal(nearby(works, 'Rua X, 4980-000 Ponte da Barca').title, 'Obras que fizemos na sua região');
  assert.equal(nearby(works, 'Lisboa').title, 'Algumas obras que fizemos');
  assert.deepEqual(nearby([], 'x').items, []);
  assert.equal(monthLabel('2026-05'), 'maio de 2026');
});

test('saving the list deletes photos that no job uses any more', async () => {
  const m = new Map([['portfolio', { data: works }], ['pub-' + ph(1), { data: 1 }], ['pub-' + ph(3), { data: 1 }]]);
  const store = { get: async (k) => m.get(k)?.data ?? null, setJSON: async (k, v) => m.set(k, { data: v }), delete: async (k) => m.delete(k) };
  const req = { method: 'PUT', json: async () => ({ portfolio: works.filter((w) => w.id !== 'c') }) };
  const r = await handlePortfolio(req, 'portfolio', store);
  assert.equal(r.status, 200);
  assert.ok(m.has('pub-' + ph(1)));assert.ok(!m.has('pub-' + ph(3)));
});
