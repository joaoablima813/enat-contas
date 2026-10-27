import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*const \$=[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
new vm.Script(script);
const context=vm.createContext({});
vm.runInContext(`
const norm=${script.match(/const norm=(.*);/)[1]};
${script.match(/const CATS=.*;/)[0]}
const r2=n=>Math.round((n||0)*100)/100;
const S={obras:[{id:'obra',name:'Obra bomba de calor'}],inv:[]},V={q:'',mc:''};
const esc=s=>String(s??'');
const eur=n=>Number(n).toFixed(2);
const fd=d=>d;
const ic=()=>'';
const opt=(l,sel)=>l.map(([v,t])=>'<option'+(v===sel?' selected':'')+'>'+t+'</option>').join('');
const kv=(k,v)=>'<div>'+k+': '+v+'</div>';
const invRow=v=>'<div data-invoice="'+v.id+'">Fatura '+v.store+'</div>';
${script.slice(script.indexOf('function lineItem('),script.indexOf('const EQ='))}
${script.slice(script.indexOf('// Produtos:'),script.indexOf('function vMat('))}
`,context);
const run=source=>vm.runInContext(source,context);
run(`S.inv=[{id:'f1',obra:'obra',store:'Ekallor',nif:'123456789',number:'FT 2026/15',date:'2026-10-26',items:[
{name:'Bomba de calor AQS 200L',cat:'Equipamentos',unit:'un',unit_price:100,vat:23,qty:1},
{name:'Curva em latão 90°',cat:'Acessórios e fixação',unit:'un',unit_price:2,vat:23,qty:4},
{name:'União latão',cat:'Acessórios e fixação',unit:'un',unit_price:3,vat:23,qty:2},
{name:'Tubo cobre 1/4',cat:'Cobre',unit:'m',unit_price:5,list_price:8,discount:37.5,vat:23,qty:6}
]},{id:'f2',obra:'obra',store:'Fersil',nif:'987654321',number:'FA 9',date:'2026-10-27',items:[
{name:'Tubo cobre 1/4',cat:'Cobre',unit:'m',unit_price:4.5,list_price:9,discount:50,vat:23,qty:10}
]}];`);

test('search matches product descriptions, suppliers, NIFs and invoice numbers',()=>{
 run("V.q='Bomba de calor'");
 let result=run('matRes()');
 assert.match(result,/Produtos \(1\)/);
 assert.match(result,/Bomba de calor AQS/);
 assert.doesNotMatch(result,/Curva|União|Tubo/);
 for(const q of ['Ekallor','123456789','FT 2026']){
  run(`V.q=${JSON.stringify(q)}`);
  result=run('matRes()');
  assert.match(result,/Faturas do fornecedor \(1\)/);
  assert.match(result,/Produtos \(4\)/);
 }
 run("V.q='bomba ekallor'");
 assert.match(run('matRes()'),/Produtos \(1\)/);
 run("V.q='Obra'");
 assert.match(run('matRes()'),/Nenhum produto/);
});
test('all significant terms match, with accents, partial names and optional prepositions',()=>{
 for(const q of ['curva latao','CURVA EM LATÃO','cur lat','latão curva']){
  run(`V.q=${JSON.stringify(q)}`);
  assert.match(run('matRes()'),/Produtos \(1\)/);
  assert.match(run('matRes()'),/Curva em latão/);
 }
 run("V.q='curva cobre'");
 assert.match(run('matRes()'),/Nenhum produto/);
 run("V.q='bomba';V.mc='Tubagem'");
 assert.match(run('matRes()'),/Nenhum produto/);
 run("V.mc='Equipamentos'");
 assert.match(run('matRes()'),/Produtos \(1\)/);
 run("V.mc=''");
});
test('choosing a category without text lists its products',()=>{
 run("V.q='';V.mc='Acessórios e fixação'");
 const result=run('matRes()');
 assert.match(result,/Acessórios e fixação \(2\)/);
 assert.match(result,/Curva em latão/);
 run("V.mc=''");
});
test('the same product from several invoices is one product with its purchase history and discounts',()=>{
 run("V.q='tubo cobre'");
 const list=run('matRes()');
 assert.match(list,/Produtos \(1\)/);
 assert.match(list,/4.50 \/ m/);
 assert.match(list,/Sem desconto <s>9.00<\/s> · −50%/);
 const result=run('productDetails(S.inv[0],3)');
 assert.match(result,/Preço por metro/);
 assert.match(result,/Faturas onde entrou \(2\)/);
 assert.match(result,/data-a="invoice" data-id="f1"/);
 assert.match(result,/data-a="invoice" data-id="f2"/);
 assert.match(result,/Fersil · FA 9/);
 assert.match(result,/5.54 \/ m/);
 assert.doesNotMatch(result,/Obra|obra/);
});
test('product details show supplier and unit prices',()=>{
 const result=run('productDetails(S.inv[0],0)');
 assert.match(result,/Ekallor/);
 assert.match(result,/Preço sem IVA: 100.00 \/ un/);
 assert.match(result,/Preço com IVA: 123.00 \/ un/);
 assert.doesNotMatch(result,/Sem desconto/);
});
test('invoice lines keep the discounted price and the price before discount',()=>{
 let i=run("lineItem({name:'Cabo',qty:100,unit:'m',unit_price:0.65,list_price:1,discount:35,vat:23,total_no_vat:65,cat:'Cablagem'})");
 assert.equal(i.unit_price,0.65);assert.equal(i.list_price,1);assert.equal(i.discount,35);assert.equal(i.total,65);
 i=run("lineItem({name:'Disjuntor',qty:2,unit_price:10,discount:20,total_no_vat:16,cat:'Material elétrico'})");
 assert.equal(i.unit_price,8);assert.equal(i.list_price,10);assert.equal(i.cat,'Material elétrico');
 i=run("lineItem({name:'Tomada',qty:4,unit_price:3,list_price:4,total_no_vat:12})");
 assert.equal(i.discount,25);assert.equal(i.cat,'Outros / consumíveis');
 i=run("lineItem({name:'Tubo',qty:2,unit_price:5,list_price:null,discount:null,total_no_vat:10,cat:'Cobre'})");
 assert.equal(i.list_price,undefined);assert.equal(i.discount,undefined);assert.equal(i.cat,'Cobre');
});
test('clearing search restores recent invoices and recent products',()=>{
 run("V.q=''");
 assert.match(run('matRes()'),/Últimas faturas anexadas/);
 assert.match(run('matRes()'),/Produtos recentes \(4\)/);
});
