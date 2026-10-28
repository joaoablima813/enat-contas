import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const load=()=>{const c=vm.createContext({document:{addEventListener(){},querySelector(){return null}},esc:s=>String(s??'').replace(/"/g,'&quot;').replace(/</g,'&lt;'),eur:n=>Number(n).toFixed(2)+' €',ic:()=>'',TOPICS:['Ar condicionado','VMC'],S:{vat:23}});vm.runInContext(read('quote-math.js')+'\n'+read('price-tables.js')+'\n'+read('quotes.js'),c);return s=>vm.runInContext(s,c)};
test('the supplied tables have the agreed discounts and well-formed products',()=>{
 const real=load();
 const tables=JSON.parse(real('JSON.stringify(PRICE_TABLES.map(t=>({brand:t.brand,discount:t.discount,n:t.products.length,bad:t.products.filter(p=>!(p.price>0)||!p.name||!p.group.length).length})))'));
 assert.deepEqual(tables.map(t=>[t.brand,t.discount]),[['S. Energias',35],['LG',50],['Ekallor',45],['Daikin',35],['Mitsubishi Electric',35]]);
 for(const t of tables){assert.ok(t.n>100,t.brand);assert.equal(t.bad,0,t.brand)}
 assert.deepEqual(JSON.parse(real("JSON.stringify(PRICE_TABLES[1].products.find(p=>p.ref==='MU2R15.U18A0').group)")),['Ar condicionado','Multisplit','Unidade exterior','Tubagem direta']);
 assert.equal(real("quoteNetPrice(PRICE_TABLES[1],PRICE_TABLES[1].products.find(p=>p.ref==='MU2R15.U18A0'))"),647.5);
 assert.equal(real("quoteNetPrice(PRICE_TABLES[2],PRICE_TABLES[2].products.find(p=>p.ref==='ACM-09FQTS/PRO'))"),248.6);
 assert.equal(real("PRICE_TABLES[3].products.find(p=>p.ref==='SB.FTXZ25N').price"),2515);
 assert.equal(real("quoteNetPrice(PRICE_TABLES[3],PRICE_TABLES[3].products.find(p=>p.ref==='SB.FTXZ25N'))"),1634.75);
 assert.equal(real("PRICE_TABLES[4].products.find(p=>p.ref==='MFZ-KT50VGK').price"),1170);
});
const run=load();
run(`PRICE_TABLES.splice(0,PRICE_TABLES.length,{brand:'Marca A',table:'Tabela 2026',discount:35,products:[
 {group:['Ar condicionado','Monosplit','Mural'],ref:'M25',name:'Conjunto mural 2,5 kW',price:1000},
 {group:['Ar condicionado','Multisplit','Unidade exterior'],ref:'X50',name:'Unidade exterior 2 saídas 5,0 kW',price:1450},
 {group:['Ar condicionado','Multisplit','Unidade interior'],ref:'I25',name:'Unidade interior mural 2,5 kW',price:410}
]},{brand:'Marca B',discount:20,products:[{group:['VMC'],ref:'V1',name:'Recuperador',price:500}]});
quoteDraft=newQuote();`);
test('the table price gets the brand discount and stays without VAT',()=>{
 assert.equal(run('quoteNetPrice(PRICE_TABLES[0],PRICE_TABLES[0].products[1])'),942.5);
 assert.equal(run('quoteNetPrice(PRICE_TABLES[1],PRICE_TABLES[1].products[0])'),400);
});
test('the picker starts with the brands, then walks the product groups',()=>{
 run("quotePick={brand:null,path:[],q:''}");
 let html=run('quotePicker()');assert.match(html,/Marca A/);assert.match(html,/Marca B/);assert.match(html,/−35%/);assert.match(html,/Linha livre/);
 run("quotePick={brand:0,path:['Ar condicionado'],q:''}");
 html=run('quotePickResults()');assert.match(html,/Monosplit/);assert.match(html,/Multisplit/);assert.doesNotMatch(html,/X50/);
 run("quotePick.path.push('Multisplit','Unidade exterior')");
 html=run('quotePickResults()');assert.match(html,/X50/);assert.match(html,/942.50 €/);assert.doesNotMatch(html,/I25/);
 run("quotePick={brand:0,path:[],q:'interior 2,5'}");
 html=run('quotePickResults()');assert.match(html,/I25/);assert.doesNotMatch(html,/X50|M25/);
});
test('picked products fill description, cost and table reference, replacing the empty first line',()=>{
 run("quoteAddLine(quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products[1]));quoteAddLine(quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products[2]))");
 const lines=run('quoteDraft.lines');assert.equal(lines.length,2);
 assert.equal(lines[0].description,'Marca A X50 – Unidade exterior 2 saídas 5,0 kW');assert.equal(lines[0].value,942.5);
 assert.deepEqual({...lines[1].catalog},{brand:'Marca A',ref:'I25',price:410,discount:35});assert.equal(lines[1].value,266.5);
 const t=run('quoteTotals({...quoteDraft,margin:0})');assert.equal(t.cost,1209);assert.equal(t.total,1487.07);
});
test('tapping a line description opens the quote brand on its typology and fills that line',()=>{
 run("quoteDraft=newQuote();quoteDraft.brand='marca b';quoteDraft.topics=['VMC'];quoteDraft.lines[0].quantity=2;quotePick=quotePickStart(0)");
 assert.deepEqual(JSON.parse(run('JSON.stringify(quotePick)')),{brand:1,path:['VMC'],q:'',line:0});
 run("quoteDraft.brand='Marca A';quoteDraft.topics=['Ar condicionado'];quotePick=quotePickStart(0)");
 assert.deepEqual(JSON.parse(run('JSON.stringify(quotePick.path)')),['Ar condicionado']);
 assert.match(run('quoteEditor()'),/Escreva na descrição para procurar/);
 run("quoteDraft.topics=['Ar condicionado','VMC'];quoteDraft.brand='';quotePick=quotePickFor(0,0)");
 assert.deepEqual(JSON.parse(run('JSON.stringify(quotePick)')),{brand:0,path:['Ar condicionado'],q:'',line:0});
 run("quotePick.path=['Ar condicionado','Multisplit']");assert.match(run('quotePickResults()'),/Unidade exterior/);
 assert.equal(run("quotePickStart(0).brand"),null);
});
test('typing a description suggests products from every table and the invoices, starting with the quote brand',()=>{
 run("quoteDraft=newQuote();quoteDraft.brand='Marca B';quoteDraft.topics=['VMC'];quotePick={...quotePickStart(0),q:'recup'}");
 let html=run('quotePicker()');assert.match(html,/Sugestões/);assert.match(html,/Recuperador/);assert.match(html,/data-brand="1"/);
 run("quotePick.q='marca a 2,5'");html=run('quotePicker()');assert.match(html,/M25/);assert.match(html,/I25/);assert.doesNotMatch(html,/X50|Recuperador/);
 run("quotePick.q='nada disto'");assert.match(run('quotePicker()'),/Nenhum produto encontrado/);
});
test('an empty line stays at the end for the next product and is not counted as a product',()=>{
 run("quoteDraft=newQuote();quoteDraft.lines[0]=quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products[0]);quoteEnsureBlank();quoteEnsureBlank()");
 assert.equal(run('quoteDraft.lines.length'),2);assert.equal(run('quoteLineBlank(quoteDraft.lines[1])'),true);
 assert.equal(run('quoteTotals({...quoteDraft,margin:0}).cost'),650);
});
test('a newly saved or re-read invoice reaches the quote suggestions without any refresh',()=>{
 const c=load();
 c(`var S={vat:23,inv:[]};function products(){const m=new Map();S.inv.forEach(v=>v.items.forEach((i,index)=>{if(!m.has(i.name))m.set(i.name,{name:i.name,cat:i.cat,buys:[],last:{v,i,index}})}));return [...m.values()]};quoteDraft=newQuote();`);
 assert.doesNotMatch(c("quoteSuggest('zzteste esfera')"),/Zzteste/);
 c(`S.inv.push({id:'f1',store:'Fersil',date:'2026-10-28',items:[{name:'Zzteste esfera 1/2',cat:'Tubagem',unit:'un',unit_price:4.2}]})`);
 assert.match(c("quoteSuggest('zzteste esfera')"),/Zzteste esfera 1\/2[\s\S]*4.20 €/);
 c(`S.inv[0].items[0].unit_price=3.9`);
 assert.match(c("quoteSuggest('zzteste esfera')"),/3.90 €/);
});
