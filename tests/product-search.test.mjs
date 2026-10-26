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
const S={obras:[{id:'obra',name:'Obra bomba de calor'}],inv:[]},V={q:'',mc:''};
const esc=s=>String(s??'');
const eur=n=>Number(n).toFixed(2);
const fd=d=>d;
const ic=()=>'';
const kv=(k,v)=>'<div>'+k+': '+v+'</div>';
const invRow=v=>'<div data-invoice="'+v.id+'">Fatura</div>';
${script.slice(script.indexOf('function productDetails('),script.indexOf('function vMat('))}
`,context);
const run=source=>vm.runInContext(source,context);
run(`S.inv=[{id:'f1',obra:'obra',store:'Ekallor',nif:'123456789',number:'Bomba de calor',date:'2026-10-26',items:[
{name:'Bomba de calor AQS 200L',cat:'Equipamentos',unit:'un',unit_price:100,vat:23,qty:1},
{name:'Curva em latão 90°',cat:'Acessórios e fixação',unit:'un',unit_price:2,vat:23,qty:4},
{name:'União latão',cat:'Acessórios e fixação',unit:'un',unit_price:3,vat:23,qty:2},
{name:'Tubo cobre',cat:'Tubagem',unit:'m',unit_price:5,vat:23,qty:6}
]}];`);

test('search matches individual invoice descriptions, excluding project and invoice metadata',()=>{
 run("V.q='Bomba de calor'");
 let result=run('matRes()');
 assert.match(result,/Produtos \(1\)/);
 assert.match(result,/Bomba de calor AQS/);
 assert.doesNotMatch(result,/Curva|União|Tubo|Obra bomba/);
 for(const q of ['Ekallor','123456789','Obra']){
  run(`V.q=${JSON.stringify(q)}`);
  assert.match(run('matRes()'),/Nenhum produto/);
 }
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
test('product details show supplier and unit prices with access to the original invoice',()=>{
 const result=run('productDetails(S.inv[0],0)');
 assert.match(result,/Fornecedor: Ekallor/);
 assert.match(result,/Preço sem IVA: 100.00 \/ un/);
 assert.match(result,/Preço com IVA: 123.00 \/ un/);
 assert.match(result,/data-a="invoice" data-id="f1"/);
 assert.doesNotMatch(result,/Obra|obra/);
 const metres=run('productDetails(S.inv[0],3)');
 assert.match(metres,/Preço por metro/);
 assert.match(metres,/6.15 \/ m/);
});
test('clearing search restores recent invoices',()=>{
 run("V.q=''");
 assert.match(run('matRes()'),/Últimas faturas anexadas/);
 assert.doesNotMatch(run('matRes()'),/Ver produto/);
});
