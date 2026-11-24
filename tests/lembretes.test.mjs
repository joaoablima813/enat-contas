import test from 'node:test';
import assert from 'node:assert/strict';
import { due, pausas, emailText, waTemplate, waNumber, runLembretes } from '../netlify/lib/lembretes.mjs';

const D = 864e5, now = Date.parse('2026-11-24T11:00:00Z'); // terça-feira, 11h em Lisboa
const at = (d) => new Date(now - d * D).toISOString();
const doc = (x = {}) => ({ client: 'Ana Silva', date: '2026-11-10', validity: 30, status: 'enviado', email: 'ana@exemplo.pt', contact: '912 345 678', ...x });

test('reminders at 4 and 10 days, stopping on any answer, expiry, accepted/refused or a won/lost lead', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => ({ id, document: doc(id === 5 ? { status: 'aceite' } : id === 6 ? { lead: 'L6' } : id === 7 ? { date: '2026-10-01', validity: 15 } : {}) }));
  const events = [
    { quoteId: 1, kind: 'enviado', at: at(4.2) },                                                         // 4 dias → 1.º
    { quoteId: 2, kind: 'enviado', at: at(10.5) }, { quoteId: 2, kind: 'lembrete', note: 'Lembrete 1 (4 dias) · email', at: at(6) }, // 10 dias → 2.º
    { quoteId: 3, kind: 'enviado', at: at(5) }, { quoteId: 3, kind: 'lembrete', note: 'Lembrete 1 (4 dias) · email', at: at(1) },   // já enviado
    { quoteId: 4, kind: 'enviado', at: at(5) }, { quoteId: 4, kind: 'duvida', at: at(3) },                 // tem dúvidas: em conversa
    { quoteId: 5, kind: 'enviado', at: at(5) },                                                           // aceite na app
    { quoteId: 6, kind: 'enviado', at: at(5) },                                                           // lead perdida
    { quoteId: 7, kind: 'enviado', at: at(5) },                                                           // expirada
    { quoteId: 8, kind: 'enviado', at: at(2) },                                                           // cedo demais
    { quoteId: 9, kind: 'enviado', at: at(12) }, { quoteId: 9, kind: 'pensar', at: at(8) },               // respondeu
  ];
  const r = due(rows, events, [{ id: 'L6', stage: 'perdido' }], now);
  assert.deepEqual(r.map((x) => [x.quote, x.step]), [[1, 1], [2, 2]]);
});

test('client messages: link, validity and the options to answer', () => {
  const v = { nome: 'Ana', numero: 'ORC 2026/0012', tema: 'ar condicionado', validade: '10/12/2026', link: 'https://x/proposta/abc', eu: 'João Lima', tel: '912 000 000' };
  const a = emailText(1, v), b = emailText(2, v);
  assert.match(a.subject, /O seu orçamento ORC 2026\/0012/);
  assert.match(a.text, /^Olá Ana,[\s\S]*para ar condicionado[\s\S]*https:\/\/x\/proposta\/abc[\s\S]*válida até 10\/12\/2026[\s\S]*João Lima/);
  assert.match(b.subject, /Ainda está interessado/);
  assert.match(b.text, /ajustar a proposta[\s\S]*motivo/);
  const t = waTemplate(2, v, 'abc');
  assert.equal(t.name, 'enat_lembrete_10_dias');
  assert.deepEqual(t.components[0].parameters.map((p) => p.text), ['Ana', 'ORC 2026/0012', '10/12/2026']);
  assert.equal(t.components[1].parameters[0].text, 'abc');
  assert.equal(waNumber('912 345 678'), '351912345678');
  assert.equal(waNumber('+351 912 345 678'), '351912345678');
  assert.equal(waNumber('258 000 000'), '');
});

test('«Preciso de mais tempo»: notice on the chosen day', () => {
  const rows = [{ id: 3, document: doc() }];
  const ev = [{ quoteId: 3, kind: 'enviado', at: at(9) }, { quoteId: 3, kind: 'mais_tarde', note: 'Volta a falar a partir de 24/11/2026', at: at(5) }];
  assert.equal(pausas(ev, rows, now)[0].title, 'Voltar a contactar: Ana Silva');
  assert.equal(pausas(ev, rows, now - D).length, 0);
});

test('run: sends email and WhatsApp once, records the reminder and skips at night', async () => {
  const blobs = new Map(), store = { get: async (k) => blobs.get(k) ?? null, setJSON: async (k, v) => blobs.set(k, v) };
  blobs.set('proposta-link-1', { token: 'tok1' });
  const mails = [], was = [], recs = [];
  const deps = { load: async () => ({ rows: [{ id: 1, document: doc() }], events: [{ quoteId: 1, kind: 'enviado', at: at(4.5) }] }), mail: async (...a) => mails.push(a), wa: async (...a) => was.push(a), waOn: true, record: async (...a) => recs.push(a), push: async () => {} };
  assert.deepEqual(await runLembretes(store, Date.parse('2026-11-24T22:00:00Z'), deps), { skipped: 'hora' });
  assert.equal((await runLembretes(store, now, deps)).sent, 1);
  assert.equal(mails[0][0], 'ana@exemplo.pt');
  assert.match(mails[0][2], /\/proposta\/tok1/);
  assert.equal(was[0][0], '351912345678');
  assert.match(recs[0][1], /^Lembrete 1 \(4 dias\) · email \+ WhatsApp$/);
  assert.equal((await runLembretes(store, now + 20 * 60e3, deps)).sent, 0); // não repete
});
