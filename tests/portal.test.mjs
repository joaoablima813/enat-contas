import test from 'node:test';
import assert from 'node:assert/strict';
import { portalHtml } from '../netlify/lib/portal.mjs';

test('client page: with quotes sent it opens on the quotes, even before the questionnaire is answered', () => {
  const p = { nome: 'Ana Silva', propostas: [{ token: 'tok1', quote: 91, numero: 'ORC 2026/0091', titulo: 'Ar condicionado', total: 1200, at: Date.now() }] };
  const h = portalHtml('abc', p, {}, [], '<form id="pf">FORM</form>', [], []);
  assert.match(h, /A sua página Enat/);
  assert.match(h, /Os seus orçamentos/);
  assert.match(h, /ORC 2026\/0091/);
  assert.ok(h.indexOf('Os seus orçamentos') < h.indexOf('Questionário (opcional)'), 'quotes first, questionnaire after');
  assert.doesNotMatch(h, /<div hidden><section class="card" id="orcamentos"/);
  // Without quotes and without answers it is still the questionnaire page.
  const f = portalHtml('abc', { nome: 'Ana' }, {}, [], '<form id="pf">FORM</form>', [], []);
  assert.match(f, /O seu pedido de orçamento/); assert.match(f, /<div hidden><section class="card" id="orcamentos"/);
});
