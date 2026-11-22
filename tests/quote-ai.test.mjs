import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {cargaTermica,multisplit,linhaFrigorifica,caboEletrico,aqs,pisoRadiante,ventiloconvectores,vmc,carregador,bombaCalorHabitacao,runCalc,TOOLS} from '../netlify/lib/hvac-calc.mjs';
import {readPlanInput,readPickInput} from '../netlify/lib/quote-ai.mjs';
import {cleanSpec,buildPlan} from '../netlify/lib/quote-kit.mjs';

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
});
test('the server builds the full kit from the request data, with no AI round trips',()=>{
 const spec=cleanSpec({resumo:'Multisplit',tipologias:['Ar condicionado','Inventada'],marca:'LG',distancia_quadro_m:12,
  ac:{sistema:'multi',divisoes:[{nome:'Sala',area_m2:30,uso:'sala',exposicao:'sul',linha_m:4,esgoto:true},{nome:'Quarto 1',area_m2:12,uso:'quarto',linha_m:7,esgoto:false},{nome:'Quarto 2',area_m2:'x'}],wifi:false},
  aqs:{volume_l:200},quantidades:{calha:30,inventada:5},excluir:['consumiveis','nada'],
  extras:[{tipologia:'Geral / outros',categoria:'Material',descricao:'Depósito de inércia 100 L',quantidade:1,unidade:'un.',pesquisa:['deposito inercia 100']},{descricao:''}],
  precos_mao_obra:[{id:'ac_ui',preco:120}]},['ac_ui']);
 assert.deepEqual(spec.tipologias,['Bomba de calor AQS','Ar condicionado','Geral / outros']);assert.equal(spec.ac.divisoes[2].area_m2,null);assert.deepEqual(spec.excluir,['consumiveis']);
 const p=buildPlan(spec),d=s=>p.itens.filter(i=>s.test(i.descricao));
 assert.equal(d(/^Unidade exterior multisplit/).length,1);assert.equal(d(/^Unidade interior/).reduce((t,i)=>t+i.quantidade,0),3);
 assert.ok(d(/^Par de cobre/).length>=1);assert.ok(d(/Cabo de interligação/).length);assert.equal(d(/^Bomba de condensados/)[0].quantidade,1,'only the room without drain gets a pump');
 assert.equal(d(/^Calha técnica/)[0].quantidade,30,'metres stated by the user win');assert.equal(d(/Montagem de calha/)[0].quantidade,30);
 assert.ok(d(/Suporte de parede/).length&&d(/antivibráticos/).length);assert.equal(d(/Consumíveis/).length,0,'excluded parts are left out');
 assert.ok(d(/^Bomba de calor para AQS 200 L/).length&&d(/Grupo de segurança/).length&&d(/Vaso de expansão sanitário 12 L/).length&&d(/misturadora/).length);
 assert.ok(d(/^Disjuntor/).length>=2&&d(/diferencial/i).length===1);assert.equal(d(/Deslocação/).length,1);assert.ok(d(/Depósito de inércia 100 L/).length);
 assert.equal(d(/Instalação de unidade interior/)[0].preco_indicado,120);
 assert.ok(p.pressupostos.some(x=>/Quarto 2: 5 m de linha/.test(x)));assert.ok(p.verificacao.some(c=>c.estado==='incluido'&&c.itens.length));
 assert.ok(p.itens.every(i=>i.pesquisa.length||i.categoria==='Mão de obra'));
 const eq=d(/^Unidade interior mural multisplit 4,2/)[0];assert.ok(eq.exige[0].some(r=>new RegExp(r).test('lg mural 4.2 kw')));
 const ev=buildPlan(cleanSpec({tipologias:['Carregador automóvel'],carregador:{potencia_kw:7.4,distancia_m:20}}));
 assert.ok(ev.itens.some(i=>/tipo A com deteção DC 6 mA/.test(i.descricao)));assert.equal(ev.itens.filter(i=>/diferencial/i.test(i.descricao)).length,1);
 const fc=buildPlan(cleanSpec({tipologias:['Ventiloconvectores'],ventilo:{divisoes:[{nome:'Sala',area_m2:25}]}}));
 assert.ok(fc.itens.some(i=>/^Ventiloconvector/.test(i.descricao))&&fc.itens.some(i=>/^Bomba de calor ar-água/.test(i.descricao)),'fan coils get a heat pump when there is no production');
 assert.throws(()=>buildPlan(cleanSpec({tipologias:[]})));
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
test('the app prefers products that meet the required sizes and can pick on its own',()=>{
 const run=app();
 run(`PRICE_TABLES.push({brand:'Loja',table:'T',discount:0,products:[{group:['Geral / outros','Elétrico'],ref:'D10',name:'Disjuntor 1P+N 10A curva C',price:8},{group:['Geral / outros','Elétrico'],ref:'D16',name:'Disjuntor 1P+N 16A curva C',price:9},{group:['Geral / outros','Elétrico'],ref:'D160',name:'Disjuntor caixa moldada 160A',price:90}]})`);
 const it=`{id:'i1',categoria:'Material',descricao:'Disjuntor 16 A curva C 1P+N',pesquisa:['disjuntor 1p+n 16a','disjuntor 16a curva c'],exige:[['(^|[^0-9.])16([.,]0+)?(?![0-9])\\\\s?a']]}`;
 const ref=run(`(()=>{const f=quoteAiSearch(${it},'');const t=PRICE_TABLES[f[0].ti];return t.products[f[0].pi].ref+'|'+f[0].ok})()`);
 assert.equal(ref,'D16|true');
 assert.equal(run(`(()=>{const i=${it};const f=quoteAiSearch(i,'');return quoteAiAutoPick(i,f).candidato})()`),0);
 assert.equal(run(`quoteAiAutoPick({id:'e',categoria:'Equipamento'},[{s:1,ok:null}])`),null,'equipment is never picked without matching sizes');
});
test('heat pumps and AC are wired by electrical, not thermal, power',()=>{
 const c=caboEletrico({potencia_termica_kw:9,distancia_m:15});
 assert.ok(c.corrente_a<20);assert.equal(c.seccao_mm2,2.5);assert.match(c.disjuntor,/^20 A/);
});

test('price tier from the client questionnaire: cheapest, middle or most expensive product that meets the specification',()=>{
 const run=app();
 const f='[{s:1,ok:true},{s:1,ok:true},{s:1,ok:true},{s:1,ok:false}]',prices='[500,300,900,100]';
 assert.equal(run(`quoteAiAutoPick({id:'e',categoria:'Equipamento'},${f},'preco',${prices}).candidato`),1,'cheapest that fits, never the one that does not fit');
 assert.equal(run(`quoteAiAutoPick({id:'e',categoria:'Equipamento'},${f},'media',${prices}).candidato`),0);
 assert.equal(run(`quoteAiAutoPick({id:'e',categoria:'Equipamento'},${f},'qualidade',${prices}).candidato`),2);
 assert.equal(run(`quoteAiAutoPick({id:'e',categoria:'Equipamento'},${f}).candidato`),0,'no tier: best match');
 assert.equal(readPickInput({gama:'qualidade',itens:[{id:'i1',candidatos:[{nome:'x'}]}]}).gama,'qualidade');
 assert.equal(readPickInput({gama:'hack',itens:[{id:'i1',candidatos:[{nome:'x'}]}]}).gama,'');
});
