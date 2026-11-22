import test from 'node:test';
import assert from 'node:assert/strict';
import { followups } from '../netlify/lib/followup.mjs';

const D = 864e5, now = Date.parse('2026-11-22T11:00:00Z');
const at = (daysAgo) => new Date(now - daysAgo * D).toISOString();

test('follow-up reminders: not opened after 2 days, seen without answer after 2 and 5 days', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, client: 'Cliente ' + id, date: '2026-11-10' }));
  const events = [
    { quoteId: 1, kind: 'enviado', at: at(3) },                                         // not opened
    { quoteId: 2, kind: 'enviado', at: at(3) }, { quoteId: 2, kind: 'visto', at: at(2.5) }, // seen 2.5 days ago
    { quoteId: 3, kind: 'enviado', at: at(8) }, { quoteId: 3, kind: 'visto', at: at(6) },   // seen 6 days ago
    { quoteId: 4, kind: 'enviado', at: at(3) }, { quoteId: 4, kind: 'visto', at: at(2.5) }, { quoteId: 4, kind: 'pensar', at: at(2) }, // answered
    { quoteId: 5, kind: 'enviado', at: at(1) },                                         // too soon
    { quoteId: 6, kind: 'enviado', at: at(20) },                                        // too old
    { quoteId: 7, kind: 'enviado', at: at(9) }, { quoteId: 7, kind: 'rejeitar', at: at(8) }, { quoteId: 7, kind: 'enviado', at: at(3) }, // sent again, no answer to the new one
  ];
  const due = followups(rows, events, now);
  assert.deepEqual(due.map((a) => a.key.split('|').slice(0, 2).join('|')), ['naoabriu|1', 'visto2|2', 'visto5|3', 'naoabriu|7']);
  assert.match(due[1].body, /ORC 2026\/0002 · viu a proposta há 2 dias/);
  assert.equal(due[0].quote, 1);
});

test('a client who asked a question is flagged in the reminder', () => {
  const due = followups([{ id: 9, client: 'Ana', date: '2026-11-01' }], [
    { quoteId: 9, kind: 'enviado', at: at(4) }, { quoteId: 9, kind: 'visto', at: at(3) }, { quoteId: 9, kind: 'duvida', at: at(3) },
  ], now);
  assert.match(due[0].body, /Tenho uma dúvida/);
});
