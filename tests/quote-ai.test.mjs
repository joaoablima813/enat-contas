import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {cargaTermica,multisplit,linhaFrigorifica,caboEletrico,aqs,pisoRadiante,ventiloconvectores,vmc,carregador,bombaCalorHabitacao,runCalc,TOOLS} from '../netlify/lib/hvac-calc.mjs';
import {cleanPlan,applyReview,readPlanInput,readPickInput,CHECKLISTS} from '../netlify/lib/quote-ai.mjs';

test('thermal load picks standard split sizes per room',()=>{
 const r=cargaTermica({divisoes:[{nome:'Quarto',area_m2:12},{nome:'Sala',area_m2:30,uso:'sala',exposicao:'sul'},{nome:'Salão',area_m2:80,uso:'loja'}]});
 assert.equal(r.divisoes[0].potencia_nominal_kw,2.0);
 assert.equal(r.divisoes[1].potencia_nominal_kw,4.2);
 assert.ok(r.divisoes[2].potencia_nominal_kw>7.1);assert.match(r.divisoes[2].tipo_sugerido,/conduta|cassete/);
});
test('multisplit needs enough ports and power',()=>{
 const m=multisplit({interiores_kw:[2.5,2.5,2.5,3.5],cargas_kw:[2,2,1.8,3.2]});
 assert.ok(m.exterior_sugerida.saidas>=4);assert.ok(m.exterior_sugerida.potencia_kw>=m.potencia_exterior_minima_kw);
 assert.equal(multisplit({interiores_kw:[3.5,3.5,3.5,3.5,3.5,3.5,3.5]}).exterior_sugerida,null);
});
test('refrigerant line: diameters, metres, extra gas and accessories',()=>{
 const a=linhaFrigorifica({potencia_kw:2.5,distancia_m:4});assert.match(a.diametros,/1\/4.*3\/8/);assert.equal(a.par_cobre_isolado_m,5);assert.equal(a.gas_adicional_g,0);
 const b=linhaFrigorifica({potencia_kw:5,distancia_m:14});assert.match(b.diametros,/1\/2/);assert.equal(b.par_cobre_isolado_m,15);assert.equal(b.gas_adicional_g,160);
 assert.match(linhaFrigorifica({potencia_kw:7.1,distancia_m:5}).diametros,/5\/8/);
});
test('cable sizing respects breaker and voltage drop',()=>{
 const c=caboEletrico({potencia_w:1200,distancia_m:10});assert.equal(c.seccao_mm2,1.5);assert.match(c.disjuntor,/^10 A/);
 const long=caboEletrico({potencia_w:3500,distancia_m:45});assert.ok(long.seccao_mm2>=4,'long run upsizes the cable');assert.ok(long.queda_tensao_pct<=3);
 const ev=carregador({potencia_kw:7.4,distancia_m:20});assert.match(ev.disjuntor,/^40 A/);assert.ok(ev.seccao_mm2>=10);assert.match(ev.diferencial,/DC 6 mA|tipo B/);
 assert.equal(carregador({potencia_kw:11,distancia_m:20}).trifasico,true);
});
test('DHW, heat pump, underfloor, fan coils and VMC sizing',()=>{
 assert.equal(aqs({pessoas:4}).volume_l,200);assert.equal(aqs({pessoas:6}).volume_l,300);
 assert.equal(bombaCalorHabitacao({area_m2:150,isolamento:'medio',emissores:'piso'}).potencia_nominal_kw,12);
 const p=pisoRadiante({divisoes:[{nome:'Sala',area_m2:40},{nome:'WC',area_m2:6}]});
 assert.ok(p.divisoes[0].circuitos>=3,'a 40 m² room needs several 100 m circuits');assert.equal(p.cabecas_termoeletricas,p.circuitos);assert.ok(p.fita_perimetral_m>0);
 const v=ventiloconvectores({divisoes:[{nome:'Quarto',area_m2:14,distancia_m:6}]});assert.equal(v.unidades[0].tubo_ida_retorno_m,14);assert.match(v.nota,/condensa/);
 const m=vmc({divisoes:[{nome:'Sala',area_m2:35,tipo:'sala'},{nome:'Q1',area_m2:12,tipo:'quarto'},{nome:'Cozinha',area_m2:12,tipo:'cozinha'},{nome:'WC',area_m2:5,tipo:'wc'}]});
 assert.ok(m.unidade_sugerida_m3h>=m.caudal_projeto_m3h);assert.equal(m.bocas_extracao,2);
});
test('calculator tools are exposed to the model and never throw',()=>{
 assert.equal(TOOLS.length,10);for(const t of TOOLS)assert.ok(runCalc(t.function.name,{})&&!runCalc(t.function.name,{}).erro,t.function.name);
 assert.ok(runCalc('nada',{}).erro);
 assert.ok(CHECKLISTS.Ventiloconvectores.length>5,'fan coils have their own checklist');
});
test('plan cleaning and the reviewer corrections',()=>{
 const plan=cleanPlan({resumo:'x',tipologias:['Ar condicionado','Inventada'],itens:[{id:'i1',categoria:'Equipamento',descricao:'Split 2,5 kW',quantidade:1,unidade:'un.'},{id:'i2',categoria:'Material',descricao:'Par de cobre',quantidade:4.2,unidade:'metros'},{descricao:''}]});
 assert.deepEqual(plan.tipologias,['Ar condicionado']);assert.equal(plan.itens.length,2);assert.equal(plan.itens[1].unidade,'un.');
 const r=applyReview(plan,{acrescentar:[{id:'i1',categoria:'Acessórios',descricao:'Suporte de parede',quantidade:1,unidade:'un.'}],corrigir:[{id:'i2',quantidade:6}],remover:[],avisos:['ok']});
 assert.equal(r.itens.length,3);assert.equal(r.itens[1].quantidade,6);assert.notEqual(r.itens[2].id,'i1','new ids never collide');
 assert.throws(()=>cleanPlan({itens:[]}));
 assert.equal(readPlanInput({texto:'curto'}),null);
 assert.equal(readPlanInput({texto:'Sala de 30 m² com split',maoObra:[{id:'a',nome:'X',preco:-3}]}).maoObra[0].preco,0);
 assert.equal(readPickInput({itens:[{id:'i1',candidatos:[]}]}),null);
});

// App side: search the price tables and build the quote lines with prices from the tables only.
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
function app(){
 const c=vm.createContext({document:{addEventListener(){},querySelector(){return null}},esc:s=>String(s??'').replace(/</g,'&lt;'),eur:n=>Number(n).toFixed(2)+' €',ic:()=>'',TOPICS:['Ar condicionado','VMC'],S:{vat:23,maoObra:[{id:'ac_mono',nome:'Instalação split',unidade:'un.',preco:150}]},V:{tab:'orc'}});
 vm.runInContext(['quote-math.js','price-tables.js','supplier-catalog.js','quotes.js','quote-ai.js'].map(read).join('\n'),c);
 return s=>vm.runInContext(s,c);
}
test('the app finds products for the AI terms and keeps catalogue prices',()=>{
 const run=app();
 run(`PRICE_TABLES.push({brand:'Loja',table:'T',discount:10,products:[{group:['Geral / outros','Cobre'],ref:'C38',name:'Par cobre isolado 1/4 3/8 ao metro',price:10},{group:['Geral / outros','Cobre'],ref:'C12',name:'Par cobre isolado 1/4 1/2 ao metro',price:12},{group:['Geral / outros','Elétrico'],ref:'D16',name:'Disjuntor 16A curva C',price:8}]})`);
 const f=run(`quoteAiSearch({descricao:'Par de cobre isolado 1/4" + 3/8"',pesquisa:['par cobre isolado 1/4 3/8'],categoria:'Material'},'')`);
 assert.ok(f.length>=1);assert.equal(run(`(t=>t.products[${f[0].pi}].ref)(PRICE_TABLES[${f[0].ti}])`),'C38');
 run(`quoteDraft=newQuote()`);
 const out=run(`(()=>{const plan={itens:[{id:'i1',categoria:'Material',descricao:'Par de cobre',quantidade:6,unidade:'m',pesquisa:['par cobre isolado 1/4 3/8']},{id:'i2',categoria:'Mão de obra',descricao:'Instalação do split',quantidade:1,unidade:'un.',mao_obra:'ac_mono'},{id:'i3',categoria:'Acessórios',descricao:'Bomba de condensados',quantidade:1,unidade:'un.'},{id:'i4',categoria:'Mão de obra',descricao:'Deslocação',quantidade:1,unidade:'serviço',mao_obra:'x',preco_indicado:30}]};
  const found={i1:quoteAiSearch(plan.itens[0],'')};return quoteAiBuildLines(plan,{i1:{id:'i1',candidato:0,quantidade:6,unidade:'m'}},found,quoteAiLabour()).lines})()`);
 assert.equal(out[0].value,9);assert.equal(out[0].quantity,6);assert.equal(out[0].unit,'m');assert.equal(out[0].catalog.ref,'C38');
 assert.equal(out[1].value,150);assert.equal(out[2].value,0);assert.equal(out[2].semPreco,true);assert.equal(out[3].value,30);
 const html=run(`quoteDraft.ai={texto:'Sala 30 m²',at:'2026-11-14T10:00:00Z',resumo:'Split',linhas:4,semPreco:1,verificacao:[{ponto:'Suportes',estado:'incluido'}],dimensionamento:[{titulo:'Sala',detalhe:'3,5 kW'}]};aiSection()`);
 assert.match(html,/Gerar de novo com a IA/);assert.match(html,/1 linha ficou sem preço/);assert.match(html,/Preços de mão de obra \(1 de 1 com valor\)/);
 assert.match(run('quoteEditor()'),/Orçamento automático com IA/);
});
test('heat pumps and AC are wired by electrical, not thermal, power',()=>{
 const c=caboEletrico({potencia_termica_kw:9,distancia_m:15});
 assert.ok(c.corrente_a<20);assert.equal(c.seccao_mm2,2.5);assert.match(c.disjuntor,/^20 A/);
});
