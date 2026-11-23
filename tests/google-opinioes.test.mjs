import test from 'node:test';
import assert from 'node:assert/strict';
import { fromPlace, atualizarOpinioes } from '../netlify/lib/google-opinioes.mjs';

test('Google reviews: newest first, cleaned, refreshed at most once a day', async () => {
  const place = { rating: 4.8, userRatingCount: 12, googleMapsUri: 'https://maps.google.com/?cid=1', reviews: [
    { rating: 4, text: { text: 'Bom' }, publishTime: '2026-10-01T10:00:00Z', relativePublishTimeDescription: 'há 2 meses', authorAttribution: { displayName: 'Ana', uri: 'https://www.google.com/maps/contrib/1', photoUri: 'https://evil.example/x.png' } },
    { rating: 5, originalText: { text: 'Excelente' }, publishTime: '2026-11-20T10:00:00Z', authorAttribution: { displayName: 'Rui' } },
  ] };
  const d = fromPlace(place, 1);
  assert.deepEqual(d.reviews.map((r) => [r.autor, r.estrelas, r.texto]), [['Rui', 5, 'Excelente'], ['Ana', 4, 'Bom']]);
  assert.equal(d.reviews[1].foto, '', 'only Google photo addresses');
  const mem = new Map(), store = { get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => mem.set(k, v) };
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: true, json: async () => place }; };
  process.env.GOOGLE_PLACES_KEY = 'k';
  assert.equal((await atualizarOpinioes(store, 1e12, fetcher)).ok, true);
  assert.equal((await atualizarOpinioes(store, 1e12 + 3600e3, fetcher)).skipped, 'recente');
  assert.equal(calls, 1);
  delete process.env.GOOGLE_PLACES_KEY;
});
