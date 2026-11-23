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
 assert.ok(d(/^Tubo de cobre isolado para refrigeração 1\/4"/).length&&d(/^Tubo de cobre isolado para refrigeração 3\/8"/).length,'copper is sold tube by tube, not as a pair');assert.ok(d(/Cabo de interligação/).length);assert.equal(d(/^Bomba de condensados/)[0].quantidade,1,'only the room without drain gets a pump');
 assert.equal(d(/calha/i).length,0,'trunking, its cover and accessories are never quoted');
 assert.ok(d(/Suporte de parede/).length&&d(/antivibráticos/).length);assert.equal(d(/Consumíveis/).length,0,'excluded parts are left out');
 assert.ok(d(/^Bomba de calor para AQS 200 L/).length&&d(/Grupo de segurança/).length&&d(/Vaso de expansão sanitário 12 L/).length&&d(/misturadora/).length);
 assert.equal(d(/disjuntor|diferencial/i).length,0,'no breaker nor RCD');assert.ok(d(/^Cabo de alimentação/).length>=2);assert.equal(d(/Deslocação/).length,1);assert.ok(d(/Depósito de inércia 100 L/).length);
 assert.equal(d(/Instalação de unidade interior/)[0].preco_indicado,120);
 assert.ok(p.pressupostos.some(x=>/Quarto 2: 5 m de linha/.test(x)));assert.ok(p.verificacao.some(c=>c.estado==='incluido'&&c.itens.length));
 assert.ok(p.itens.every(i=>i.pesquisa.length||i.categoria==='Mão de obra'));
 const eq=d(/^Unidade interior mural multisplit 4,2/)[0];assert.ok(eq.exige[0].some(r=>new RegExp(r).test('lg mural 4.2 kw')));
 const ev=buildPlan(cleanSpec({tipologias:['Carregador automóvel'],carregador:{potencia_kw:7.4,distancia_m:20}}));
 assert.equal(ev.itens.filter(i=>/disjuntor|diferencial/i.test(i.descricao)).length,0);assert.ok(ev.pressupostos.some(x=>/DC 6 mA/.test(x)),'the RCD type is left as a note to check');
 const pre=buildPlan(cleanSpec({tipologias:['Ar condicionado'],ac:{divisoes:[{nome:'Sala',area_m2:25}],pre_instalacao:true}}));
 assert.equal(pre.itens.filter(i=>/cobre|linha frigorífica|passa-muros|furação|esgoto|condensados/i.test(i.descricao)).length,0,'pre-installation: no copper, no wall hole');assert.ok(pre.itens.some(i=>/Cabo de interligação/.test(i.descricao)));
 assert.ok(pre.verificacao.some(c=>c.ponto==='Par de cobre pré-isolado por linha'&&c.estado==='nao_aplica'));
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
 // A mão de obra fica numa só linha, a última, sem valor, com os trabalhos incluídos: o utilizador põe o preço.
 assert.equal(out.length,3);assert.equal(out[1].value,0);assert.equal(out[1].semPreco,true);assert.equal(out[1].kind,'Acessórios');
 assert.equal(out[2].kind,'Mão de obra');assert.equal(out[2].value,0);assert.equal(out[2].quantity,1);assert.match(out[2].description,/^Mão de obra de instalação: .*split.*Deslocação/i);
 assert.equal(out.filter(l=>l.kind==='Mão de obra').length,1);
 const html=run(`quoteDraft.ai={texto:'Sala 30 m²',at:'2026-11-14T10:00:00Z',resumo:'Split',linhas:4,semPreco:1,verificacao:[{ponto:'Suportes',estado:'incluido'}],dimensionamento:[{titulo:'Sala',detalhe:'3,5 kW'}]};aiSection()`);
 assert.match(html,/Gerar de novo com a IA/);assert.match(html,/1 linha ficou sem preço/);assert.match(html,/Fornecedores e regras/);assert.match(html,/value="Sanipower, Sanitop"/);assert.match(html,/A última linha é a mão de obra/);
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

test('suppliers by tier: material only from Sanipower and Sanitop; cheap equipment from Sanipower or Ekallor, never Daikin',()=>{
 const run=app();
 run(`PRICE_TABLES.length=0;PRICE_TABLES.push(
  {brand:'Daikin',table:'T',discount:0,products:[{group:['Ar condicionado','Monosplit'],ref:'D35',name:'Monosplit 3,5 kW Perfera',price:1500}]},
  {brand:'Ekallor',table:'T',discount:0,products:[{group:['Ar condicionado','Monosplit'],ref:'E35',name:'Monosplit 3,5 kW Ekallor',price:600}]},
  {brand:'Sanipower',supplier:'sanipower',live:true,table:'Catálogo',discount:0,products:[{group:['Climatização'],ref:'S1',name:'Tubo cobre frigorifico isolado 1/4 x 3/8',price:5,maker:''}]},
  {brand:'Outra loja',table:'T',discount:0,products:[{group:['Material'],ref:'O1',name:'Par cobre isolado 1/4 3/8',price:2}]})`);
 const ids=k=>JSON.stringify([...run(`quoteAiAllowed(${JSON.stringify(k[0])},${JSON.stringify(k[1])})`)]);
 assert.equal(ids(['Material','preco']),'[2]','material only from Sanipower / Sanitop');
 assert.equal(ids(['Equipamento','preco']),'[1,2]','cheap equipment: Ekallor or Sanipower');
 assert.equal(ids(['Equipamento','qualidade']),'[0]');
 assert.equal(run(`quoteAiAllowed('Equipamento','')`),null,'no tier: every table');
 // «Par de cobre pré-isolado» encontra «Tubo cobre frigorifico isolado 1/4 x 3/8» (outro nome, outra forma de escrever as medidas).
 const f=run(`quoteAiSearch({descricao:'Par de cobre pré-isolado 1/4" + 3/8"',pesquisa:['par cobre isolado 1/4 3/8'],categoria:'Material'},'',quoteTables(),quoteAiAllowed('Material','preco'))`);
 assert.equal(f.length,1);assert.equal(f[0].ti,2);
});

test('a product picked by hand for an AI line is remembered and used next time',()=>{
 const run=app();
 run(`PRICE_TABLES.length=0;PRICE_TABLES.push({brand:'Sanitop',supplier:'sanitop',live:true,table:'Catálogo',discount:0,products:[{group:['Fixação'],ref:'X9',name:'Kit mensula parede AC 450mm',price:20,maker:''}]})`);
 const key=run(`quoteAiLearnKey({categoria:'Acessórios',descricao:'Suporte de parede para unidade exterior (par)'},'preco')`);
 assert.equal(run(`quoteAiLearned(${JSON.stringify(key)})`),null);
 run(`quoteAiLearn({aiKey:${JSON.stringify(key)}},PRICE_TABLES[0],PRICE_TABLES[0].products[0])`);
 assert.equal(run(`quoteAiLearned(${JSON.stringify(key)}).pi`),0);
 assert.match(run('JSON.stringify(S.iaAprendido)'),/"src":"sanitop","ref":"X9"/);
});

// Casos reais dos catálogos da Sanipower e da Sanitop (nomes como aparecem nos sites).
test('real catalogue names: right family, right size, no fittings or look-alikes',()=>{
 const run=app();
 const P=(name,model,group,price)=>({name,model,ref:model,group:group.split(' > '),price,net:price,disc:0,maker:''});
 run(`PRICE_TABLES.length=0;PRICE_TABLES.push({brand:'Sanipower',supplier:'sanipower',live:true,table:'C',discount:0,products:${JSON.stringify([
  P('Proteu Plus Multi-Split c/Wi-Fi Unidade Interior R32','MT07PA - 7000 BUTS','Ar condicionado > Ar Condicionado Proteu > Multisplit',93.5),
  P('Proteu Plus Multi-Split c/Wi-Fi Unidade Interior R32','MT18PA - 18000 BTUS','Ar condicionado > Ar Condicionado Proteu > Multisplit',125),
  P('Proteu Multi-Split Unidade Exterior R32','MT2PA14 - 14000 BTUS','Ar condicionado > Ar Condicionado Proteu > Multisplit',524.91),
  P('Proteu Multi-Split Unidade Exterior R32','MT3PA21 - 21000 BTUS','Ar condicionado > Ar Condicionado Proteu > Multisplit',642),
  P('Proteu Multi-Split Unidade Exterior R32','MT3PA27 - 27000 BTUS','Ar condicionado > Ar Condicionado Proteu > Multisplit',707),
  P('LG Caixa de Distribuição','1-3 Saídas PMBD3630','Ar condicionado > LG > Acessórios',198),
  P('Tubo de Cobre Refrigeração','6.35 1/4"','Sistemas > Tubos de Cobre > Tubos',2.12),
  P('Tubo de Cobre Refrigeração Isolado','1/4"','Sistemas > Tubos de Cobre > Tubos',3.8),
  P('Tubo de Cobre Refrigeração Isolado','1/4"x1/2"','Sistemas > Tubos de Cobre > Tubos',9.24),
  P('União redução cobre 3/8" F x 1/4" F para refrigeração','','Sistemas > Cobre',0.55),
  P('Tubo Drenagem Rolo 50m','160','Sistemas > Tubos Drenagem > Tubos',3.1),
  P('Mangueira Pressão Cristal','16mm','Sistemas > Mangueiras',2.17),
  P('Proteu Depósito Inércia Inox V/S','150 Litros','Conforto > Termoacumuladores e Depósitos > Depósitos',399),
  P('Termat Termoacumulador','150 Litros','Conforto > Termoacumuladores e Depósitos > Termoacumuladores',188),
  P('Proteu Torneira de Esfera Jardim C/Junção','1/2" x 3/4"','Sistemas > Válvulas > Torneiras Esfera',2.35),
  P('Proteu Válvula de Esfera Borboleta FF','1"','Sistemas > Válvulas > Válvulas Latão',4.69),
 ])}})`);
 const pick=(it,gama='preco')=>run(`(()=>{const it=${JSON.stringify(it)},T=quoteTables(),f=quoteAiSearch(it,'',T,quoteAiAllowed(it.categoria,'${gama}',T,it.aux));const a=quoteAiAutoPick(it,f,'${gama}',f.map(x=>priceNet(T[x.ti],T[x.ti].products[x.pi])));return a?(p=>p.name+' ['+p.model+']')(T[f[a.candidato].ti].products[f[a.candidato].pi]):null})()`);
 const plan=buildPlan(cleanSpec({tipologias:['Ar condicionado','Bomba de calor climatização'],ac:{sistema:'multi',divisoes:[{nome:'Sala',area_m2:30,uso:'sala'},{nome:'Quarto',area_m2:12},{nome:'Quarto 2',area_m2:12}]},bc:{area_m2:150,emissores:'radiadores'}}));
 const it=re=>plan.itens.find(i=>re.test(i.descricao));
 assert.equal(pick(it(/^Unidade exterior multisplit/)),'Proteu Multi-Split Unidade Exterior R32 [MT3PA27 - 27000 BTUS]','3 outputs and enough power, not the distribution box nor the 21000 BTU');
 assert.equal(pick(it(/^Unidade interior mural multisplit 2 kW/)),'Proteu Plus Multi-Split c/Wi-Fi Unidade Interior R32 [MT07PA - 7000 BUTS]','an indoor unit, never an outdoor one');
 assert.equal(pick(it(/^Tubo de cobre isolado para refrigeração 1\/4"/)),'Tubo de Cobre Refrigeração Isolado [1/4"]','insulated tube of that size: not bare copper, not a reducer, not the 1/4x1/2 pair');
 assert.equal(pick(it(/^Depósito de inércia/)),'Proteu Depósito Inércia Inox V/S [150 Litros]','an inertia tank, not a water heater');
 assert.equal(pick(it(/^Válvula de esfera 1"/)),'Proteu Válvula de Esfera Borboleta FF [1"]','not a garden tap');
 assert.equal(pick({id:'c',categoria:'Material',descricao:'Tubo de condensados (bomba até ao esgoto)',pesquisa:['mangueira cristal 16','tubo condensados 16'],evita:['drenagem','saneamento']}),'Mangueira Pressão Cristal [16mm]','never 160 mm ground drainage pipe');
});

test('ENAT rules: no inertia tank on AQS heat pumps, multilayer pipe on every heat pump, cables and pipes in metres',()=>{
 const plan=s=>buildPlan(cleanSpec(s),{}).itens;
 const aqs=plan({tipologias:['Bomba de calor AQS'],bc:{aqs:true,pessoas:4,inercia_l:100},extras:[{tipologia:'Bomba de calor AQS',categoria:'Equipamento',descricao:'Depósito de inércia 50 L',quantidade:1},{tipologia:'Bomba de calor AQS',categoria:'Material',descricao:'Cabo 3G2,5',quantidade:10,unidade:'un.'}]});
 assert.ok(!aqs.some(l=>/in[ée]rcia/i.test(l.descricao)),'AQS never gets an inertia tank');
 assert.ok(aqs.some(l=>l.categoria==='Material'&&/multicamada/.test(l.descricao)&&l.unidade==='m'));
 assert.equal(aqs.find(l=>l.descricao==='Cabo 3G2,5').unidade,'m');
 const clima=plan({tipologias:['Bomba de calor climatização'],bc:{area_m2:100,emissores:'ventiloconvectores'}});
 assert.ok(clima.some(l=>/in[ée]rcia/i.test(l.descricao)),'climatização keeps the inertia tank when needed');
 assert.ok(clima.some(l=>l.categoria==='Material'&&/multicamada/.test(l.descricao)));
});
