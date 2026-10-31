import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlLines, parseLead, toLead } from '../netlify/lib/meta-leads.mjs';

// Formato do email de MA Media Leads (leads@tmam.pt).
const html = `<p>Olá, Equipa ENAT Ponte de Lima</p><p>O/A visitante <b>Nando Costa</b> enviou um pedido de contacto através de um <b>formulário automático da campanha</b></p>
<table><tr><th>Nome</th></tr><tr><td>Nando Costa</td></tr><tr><th>Email</th></tr><tr><td>nando_costa20@hotmail.com</td></tr>
<tr><th>Telefone</th></tr><tr><td>+351927386939</td></tr><tr><th>A instala&ccedil;&atilde;o &eacute; para:</th></tr><tr><td>Moradia</td></tr>
<tr><th>Quando pretende avan&#231;ar com a instala&#xE7;&atilde;o?</th></tr><tr><td>O mais rapido possivel</td></tr></table>
<p>O/A Cliente concordou com a Política de Privacidade.</p>`;
const ENT = { ccedil: 'ç', atilde: 'ã', eacute: 'é' };

test('reads the Meta lead email fields into a new lead', () => {
  const lines = htmlLines(html.replace(/&(ccedil|atilde|eacute);/g, (_, e) => ENT[e]));
  const f = parseLead(lines);
  assert.deepEqual(f, { name: 'Nando Costa', email: 'nando_costa20@hotmail.com', contact: '+351927386939', house: 'Moradia', timing: 'O mais rapido possivel' });
  const l = toLead(f, { messageId: '<a@b>', date: new Date('2026-10-29T23:30:00Z') });
  assert.equal(l.stage, 'nova'); assert.equal(l.src, 'meta'); assert.equal(l.house, 'Moradia'); assert.equal(l.date, '2026-10-29');
  assert.equal(toLead(f, { messageId: '<a@b>', date: new Date() }).id, l.id, 'same email gives the same lead');
  assert.match(toLead({ ...f, house: 'Empresa' }, { messageId: '<c>', date: new Date() }).notes, /Empresa/);
});
