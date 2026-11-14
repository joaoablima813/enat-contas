import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { sanipowerParse, sanitopParse, euros, quoteGroup } from '../netlify/lib/fornecedores-sites.mjs';

const read = f => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

test('prices written the Portuguese way are read as numbers', () => {
  assert.equal(euros('1 195,000 €'), 1195);
  assert.equal(euros('615,012&nbsp;€'), 615.012);
  assert.equal(euros(' 45 % '), 45);
  assert.equal(euros('—'), null);
});

const spRow = (cls, ref, pvp, disc, net, stock) => `<tr class="${cls}"><td class="d-none">&nbsp;${ref}</td><td>${ref.slice(2)} &nbsp;</td><td>${pvp} €</td><td> ${disc} % </td><td class="text-right-preco"><div class="d-block d-sm-none">${pvp} € ${disc} %</div><span class="bold">${net} €</span></td><td>&nbsp;</td><td class="celula_stock"><a class="abre_stock"><i class="las ${stock ? 'la-check verde' : 'la-times vermelho'}"></i></a></td></tr>`;
const spPage = rows => `<section class="container-fluid breadcrumbs"><a href="/" title="Sanipower">Sanipower</a> > <a title="Ar Condicionado">Ar Condicionado</a> > <a title="LG">LG</a> > <a title="Mono-Split R32">Mono-Split R32</a> > <a title="LG® Mural Standard">LG® Mural Standard</a></section>
<h1 class="branco">Ar Condicionado</h1><h1>LG® Mural Standard</h1>
<table class="table"><thead><tr><th>Referência</th><th>Modelo</th><th>PVP</th><th>Desconto</th><th>Preço</th><th>Min.</th><th>Stock</th></tr></thead><tbody>${rows}</tbody></table>`;

test('Sanipower: the account price wins over the general one and every reference keeps its stock', () => {
  const r = sanipowerParse(spPage(spRow('direto', 'LGEZ09', '615,012', 45, '338,257', true) + spRow('preco_cliente', 'LGEZ09', '615,000', 55, '276,750', true) + spRow('direto', 'LGEZ12', '660,000', 45, '363,000', false)), 'https://www.sanipower.pt/x');
  assert.equal(r.loggedIn, true);
  assert.deepEqual(r.products.map(p => [p.key, p.pvp, p.discount, p.net, p.stock]), [['LGEZ09', 615, 55, 276.75, true], ['LGEZ12', 660, 45, 363, false]]);
  assert.equal(r.products[0].name, 'LG Mural Standard');
  assert.equal(r.products[0].brand, 'LG');
  assert.deepEqual(r.products[0].path, ['Ar Condicionado', 'LG', 'Mono-Split R32']);
});

test('Sanipower: a page without the client columns means the session was lost', () => {
  const page = spPage('').replace('<th>Desconto</th>', '');
  assert.equal(sanipowerParse(page, 'u').loggedIn, false);
});

test('Sanitop: client price, list price and discount come from the product page', () => {
  const page = '<a href="/ctl/Logoff">Sair</a><div id="dnn_ctr1217_ProductPage_pnlDetailPrice"><span id="dnn_ctr1217_ProductPage_UnitCost"><div><span class="CATProductListItem s-productprice-red">1 340,35 € </span> <span style="text-decoration: line-through; color: gray;">2 437,00 €</span> </div><div><span class="CATUnitCost discountText">Desconto: 1 096,65 € (45%)</span></div></span></div> Stock total 4 unidades';
  assert.deepEqual(sanitopParse(page), { loggedIn: true, net: 1340.35, pvp: 2437, discount: 45, stock: true });
  assert.equal(sanitopParse(page.replace('/ctl/Logoff', '/Profissional')).loggedIn, false);
});

test('supplier categories land on the quote typologies', () => {
  assert.deepEqual(quoteGroup(['Bombas de calor e Ar condicionado', 'Ar condicionado', 'Ar condicionado mono split']), ['Ar condicionado', 'Ar condicionado mono split']);
  assert.deepEqual(quoteGroup(['Ar Condicionado', 'LG', 'Mono-Split R32']), ['Ar condicionado', 'LG', 'Mono-Split R32']);
  assert.equal(quoteGroup(['Aquecimento e Águas Quentes Sanitárias (AQS)', 'Bombas de calor AQS', 'Bombas de calor AQS monobloco'])[0], 'Bomba de calor AQS');
  assert.equal(quoteGroup(['Energia Solar', 'Fotovoltaico', 'Inversores'])[0], 'UPAC (fotovoltaico)');
  // Wood stoves are not ventilation.
  assert.equal(quoteGroup(['Aquecimento e Águas Quentes Sanitárias (AQS)', 'Recuperadores de calor e salamandras', 'Recuperadores de calor a lenha'])[0], 'Aquecimento e Águas Quentes Sanitárias (AQS)');
  assert.equal(quoteGroup(['Eletricidade', 'Cabos', 'Cabos H07V-U'])[0], 'Eletricidade');
});

// The app with one online catalogue loaded.
function app(api) {
  const c = vm.createContext({ document: { addEventListener() {}, querySelector() { return null }, activeElement: null }, esc: s => String(s ?? ''), eur: n => Number(n).toFixed(2) + ' €', ic: () => '', TOPICS: ['Ar condicionado', 'VMC'], S: { vat: 23 }, V: { tab: 'orc' }, render() {}, API: api, PRICE_TABLES: [] });
  vm.runInContext(read('quote-math.js') + '\n' + read('supplier-catalog.js') + '\n' + read('quotes.js'), c);
  c.PRICE_TABLES.push({ brand: 'Sanitop', table: 'Catálogo online', discount: 40, live: true, supplier: 'sanitop', at: '2026-11-14T10:00:00Z', products: [
    { group: ['Ar condicionado', 'Ar condicionado mono split'], key: '414422', ref: '849466', sref: '849466', model: '', name: 'Ar condicionado monosplit Panasonic cassete 5,0 kW', maker: 'Panasonic', price: 2437, net: 1340.35, disc: 45, stock: 1, est: 0 },
    { group: ['Ar condicionado', 'Ar condicionado mono split'], key: '414423', ref: '849467', sref: '849467', model: '', name: 'Ar condicionado monosplit Panasonic cassete 6,0 kW', maker: 'Panasonic', price: 2698, net: 1618.8, disc: 40, stock: 0, est: 1 },
  ] });
  return s => vm.runInContext(s, c);
}

test('online products use their own client price and discount, and say when it is estimated', () => {
  const run = app(async () => ({ ok: true }));
  assert.equal(run('priceNet(PRICE_TABLES[0],PRICE_TABLES[0].products[0])'), 1340.35);
  assert.equal(run('priceDisc(PRICE_TABLES[0],PRICE_TABLES[0].products[0])'), 45);
  assert.equal(run('priceNote(PRICE_TABLES[0],PRICE_TABLES[0].products[1])'), 'Tabela 2698.00 € · −40% (estimado) · sem stock');
  // Fixed tables keep using the brand discount.
  assert.equal(run('priceNet({discount:35},{price:100})'), 65);
});

test('a product from an online supplier enters the quote without the supplier name and its price is confirmed live', async () => {
  let asked;
  const run = app(async (path, o) => { asked = [path, JSON.parse(o.body)]; return { ok: true, json: async () => ({ key: '414422', pvp: 2500, net: 1375, disc: 45, stock: true }) }; });
  run('quoteDraft=newQuote()');
  const line = run('quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products[0])');
  assert.equal(line.description, 'Ar condicionado monosplit Panasonic cassete 5,0 kW');
  assert.doesNotMatch(line.description, /Sanitop/);
  assert.equal(line.value, 1340.35);
  assert.deepEqual({ ...line.catalog }, { brand: 'Sanitop', ref: '414422', price: 2437, discount: 45 });
  run('quoteAddLine(L=quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products[0]))');
  await run('supplierLive(PRICE_TABLES[0],PRICE_TABLES[0].products[0],L)');
  assert.deepEqual(asked, ['fornecedores/preco', { supplier: 'sanitop', key: '414422' }]);
  assert.equal(run('L.value'), 1375);
  assert.equal(run('L.catalog.price'), 2500);
  assert.match(run('supplierLineNote(L,0)'), /Preço atualizado no site do fornecedor \(antes 1340.35 €\)/);
  assert.equal(run('PRICE_TABLES[0].products[0].net'), 1375);
});

test('a failed live check keeps the last price read', async () => {
  const run = app(async () => { throw new Error('offline'); });
  run('quoteDraft=newQuote();quoteAddLine(L=quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products[0]))');
  await run('supplierLive(PRICE_TABLES[0],PRICE_TABLES[0].products[0],L)');
  assert.equal(run('L.value'), 1340.35);
  assert.match(run('supplierLineNote(L,0)'), /ficou o último preço lido/);
});
