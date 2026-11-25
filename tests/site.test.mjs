import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSite, cleanSiteLead, siteInbox } from '../netlify/lib/site.mjs';

function blobs() {
  const m = new Map();
  return {
    m, get: async (k) => (m.has(k) ? structuredClone(m.get(k).data) : null),
    setJSON: async (k, v) => m.set(k, { data: JSON.parse(JSON.stringify(v)) }),
    set: async (k, v, o) => m.set(k, { data: v, metadata: o?.metadata || {} }),
    getWithMetadata: async (k) => (m.has(k) ? { data: m.get(k).data, metadata: m.get(k).metadata } : null),
  };
}
const SITE = 'https://enat-pontedelima.netlify.app';
const call = (store, method, path, body, origin = SITE, ip = '1.2.3.4') => handleSite({ method, url: 'https://enat-contas.netlify.app/site-api/' + path, headers: new Headers({ origin, 'x-nf-client-connection-ip': ip }), text: async () => JSON.stringify(body) }, path, store);
const form = { nome: 'maria da silva', telefone: '912 345 678', email: 'Maria@Exemplo.pt', localidade: 'Arcozelo, Ponte de Lima', servicos: ['Ar condicionado', 'Bomba de calor (AQS)', 'Hack'], mensagem: 'Sala e 2 quartos', t: Date.now() - 10000 };

test('a quote request from the site becomes a new lead in the app, with the questionnaire link ready', async () => {
  const store = blobs();
  const r = await call(store, 'POST', 'lead', form);
  assert.equal(r.status, 200);assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  const b = await r.json();
  assert.match(b.pedido, /\/pedido\/[A-Za-z0-9_-]{24}$/);
  const [l] = await siteInbox(store);
  assert.equal(l.name, 'Maria da Silva');assert.equal(l.src, 'site');assert.equal(l.stage, 'nova');assert.equal(l.email, 'maria@exemplo.pt');
  assert.deepEqual(l.solutions, ['Ar condicionado', 'Bomba de calor AQS']);assert.match(l.notes, /Pedido pelo site: Ar condicionado, Bomba de calor \(AQS\)\nSala e 2 quartos/);
  assert.ok((await store.get('pedido-auto-enviados'))[l.id], 'the questionnaire is not emailed again');
});

test('spam and abuse are refused; other websites cannot post', async () => {
  const store = blobs();
  assert.equal((await call(store, 'POST', 'lead', form, 'https://outro-site.com')).status, 403);
  await call(store, 'POST', 'lead', { ...form, website: 'http://spam' });
  await call(store, 'POST', 'lead', { ...form, t: Date.now() });
  assert.equal((await siteInbox(store)).length, 0, 'honeypot and too-fast submissions are silently dropped');
  for (let i = 0; i < 5; i++) assert.equal((await call(store, 'POST', 'lead', form)).status, 200);
  assert.equal((await call(store, 'POST', 'lead', form)).status, 429, 'at most 5 requests per hour from the same address');
  assert.match(cleanSiteLead({ nome: 'Rui', servicos: ['VMC'] }).error, /telemóvel ou um email/);
  assert.match(cleanSiteLead({ nome: 'Rui', telefone: '912345678', servicos: [] }).error, /serviço/);
});

test('the site shows only finished jobs with consent, with their public photos', async () => {
  const store = blobs();
  await store.setJSON('portfolio', [{ id: 'o1', tipo: 'Ar condicionado', titulo: 'AC em moradia', local: 'Ponte de Lima', cp: '4990', mes: '2026-05', fotos: ['abcdefgh1'], ok: true }, { id: 'o2', titulo: 'Privada', local: 'X', fotos: ['abcdefgh2'], ok: false }]);
  await store.setJSON('empresa', { google: { nota: '4.9', total: '62', link: 'https://g.page/x' } });
  const b = await (await call(store, 'GET', 'obras')).json();
  assert.deepEqual(b.obras.map((o) => o.titulo), ['AC em moradia']);
  assert.equal(b.obras[0].fotos[0], '/site-api/img/abcdefgh1');assert.equal(b.obras[0].mes, 'maio de 2026');
  assert.equal(b.google.nota, '4.9');
});
