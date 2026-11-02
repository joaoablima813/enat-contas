import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlLines, isLeadEmail, parseLead, toLead } from '../netlify/lib/meta-leads.mjs';

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

// Formato novo («NOVA LEAD · Contacto recebido de …»), com o título e o valor na mesma linha da tabela.
const html2 = `<div>MA MEDIA LEADS</div><div>ENAT Ponte de Lima</div><p>NOVA LEAD</p><h1>Contacto recebido de <span>armenio Barbosa Marques</span></h1>
<table><tr><td>Data 02/11/2026</td><td>Hora 12:28</td></tr></table><p>Olá,</p><p>Acabou de chegar um novo contacto através do formulário. Seguem os dados submetidos, para que possa responder o quanto antes.</p>
<table><tr><td>NOME</td><td>armenio Barbosa Marques</td></tr><tr><td>EMAIL</td><td><a href="mailto:armeniomarques55@gmail.com">armeniomarques55@gmail.com</a></td></tr>
<tr><td>TELEFONE</td><td>+351934054923</td></tr><tr><td>A INSTALAÇÃO É PARA: MORADIA, APARTAMENTO OU ESPAÇO COMERCIAL?</td><td>Moradia</td></tr>
<tr><td>QUANDO PRETENDE AVANÇAR COM A INSTALAÇÃO?</td><td>Primeiro valores</td></tr><tr><td>ORIGEM</td><td>Facebook Lead Ads</td></tr></table>`;

test('reads the new MA Media lead email format', () => {
  const lines = htmlLines(html2);
  assert.ok(isLeadEmail('outro@exemplo.pt', lines), 'recognised by its text');
  assert.ok(isLeadEmail('leads@tmam.pt', []));
  assert.ok(!isLeadEmail('cliente@gmail.com', ['Olá, queria um orçamento']));
  const f = parseLead(lines);
  assert.deepEqual(f, { name: 'armenio Barbosa Marques', email: 'armeniomarques55@gmail.com', contact: '+351934054923', house: 'Moradia', timing: 'Primeiro valores', origin: 'Facebook Lead Ads' });
  const l = toLead(f, { messageId: '<n@m>', date: new Date('2026-11-02T12:28:00Z') });
  assert.equal(l.name, 'Armenio Barbosa Marques'); assert.equal(l.house, 'Moradia'); assert.equal(l.src, 'meta'); assert.match(l.notes, /Origem: Facebook Lead Ads/);
  assert.match(toLead({ ...f, house: 'Espaço comercial' }, { messageId: '<x>', date: new Date() }).notes, /A instalação é para: Espaço comercial/);
});

// Formulário com «Que sistema usa hoje para aquecer a água?» e «Quando pretende fazer a instalação?».
test('reads the water heating system and installation timing fields', () => {
  const h = `<p>NOVA LEAD</p><h1>Contacto recebido de Antonio Cacais</h1><table><tr><td>NOME</td><td>Antonio Cacais</td></tr><tr><td>EMAIL</td><td>tony@exemplo.pt</td></tr>
  <tr><td>TELEFONE</td><td>+351968185974</td></tr><tr><td>QUE SISTEMA USA HOJE PARA AQUECER A ÁGUA?</td><td>Botija de gás</td></tr>
  <tr><td>QUANDO PRETENDE FAZER A INSTALAÇÃO?</td><td>O mais rápido possível</td></tr><tr><td>ORIGEM</td><td>Facebook Lead Ads</td></tr></table>`;
  const f = parseLead(htmlLines(h));
  assert.equal(f.heating, 'Botija de gás'); assert.equal(f.timing, 'O mais rápido possível'); assert.equal(f.contact, '+351968185974');
  const l = toLead(f, { messageId: '<t@c>', date: new Date('2026-11-02T18:40:00Z') });
  assert.equal(l.heating, 'Botija de gás'); assert.equal(l.timing, 'O mais rápido possível');
});
