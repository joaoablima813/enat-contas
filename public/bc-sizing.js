/* Dimensionamento de bomba de calor de climatização (com AQS opcional), dentro do orçamento.
   Calcula a potência necessária pelas perdas da envolvente e da ventilação, verifica os radiadores existentes
   à temperatura de ida escolhida, e escolhe nas tabelas de preços a bomba de calor, o acumulador AQS e o depósito de inércia.
   Motor de cálculo em funções puras (bcCalc, bcCatalog, bcPick) para poder ser testado. */
(function(root){
// Temperatura exterior de projeto de inverno (°C), valores indicativos por zona; ajustável à mão.
const BC_LOCAIS=[['Viana do Castelo / Caminha / V. N. Cerveira',4],['Ponte de Lima / Paredes de Coura / Valença',3],['Arcos de Valdevez / Ponte da Barca',2],['Monção / Melgaço',1],['Braga / Barcelos / Guimarães',2],['Porto / litoral norte',4],['Vila Real / interior norte',-1],['Bragança / Chaves',-3],['Viseu',0],['Guarda / Serra',-3],['Aveiro / Coimbra',3],['Leiria / Santarém',3],['Lisboa / Setúbal',6],['Évora / Beja',3],['Faro / Algarve',7]];
const BC_EXPO=[['1','Abrigada'],['1.05','Normal'],['1.1','Exposta / ventosa']];
const BC_U={
 parede:[['1.25','Sem isolamento (U 1,25)'],['0.85','Isolamento simples / caixa de ar (U 0,85)'],['0.4','Bom · ETICS/capoto 6–8 cm (U 0,40)'],['0.28','Excelente (U 0,28)']],
 telhado:[['1.8','Sem isolamento (U 1,80)'],['0.55','Isolamento médio (U 0,55)'],['0.35','Bom isolamento 8–10 cm (U 0,35)']],
 janela:[['5','Vidro simples (U 5,00)'],['2.8','Vidro duplo comum (U 2,80)'],['1.6','Vidro duplo com corte térmico (U 1,60)']],
 pavimento:[['0.45','Sobre terreno (U 0,45)'],['0.5','Sobre garagem / espaço não aquecido (U 0,50)'],['0','Sobre fração aquecida (U 0,00)']],
};
const BC_ESTORE=[['1','Sem estore'],['0.9','Estore comum (× 0,90)'],['0.85','Estore térmico isolado (× 0,85)']];
const BC_RPH=[['0.5','Natural, sem VMC (0,50 RPH)'],['0.4','VMC fluxo simples (0,40 RPH)'],['0.15','VMC duplo fluxo com recuperação (0,15 RPH)']];
const BC_RAD=[['al500','Alumínio H500',105],['al600','Alumínio H600',125],['al700','Alumínio H700',145],['al800','Alumínio H800',160],['ferro','Ferro fundido',110],['toalheiro','Toalheiro WC (por unidade)',500],['manual','Potência manual (W por elemento)',0]];
const BC_TIDA=[45,55,65,70];
const BC_AQS_L=[150,200,250,300,400,500];
const num=(v,d=0)=>{const n=Number(String(v??'').replace(',','.'));return isFinite(n)?n:d};
const r=(v,d=2)=>Math.round(v*10**d)/10**d;

function newBc(){return {local:BC_LOCAIS[1][0],text:3,expo:'1.05',fase:'1',area:120,pisos:1,pe:2.6,paredes:0,janelas:0,janPct:15,pav:'0.45',uParede:'0.85',uTelhado:'0.55',uJanela:'2.8',estore:'0.9',rph:'0.5',tida:55,rads:[{tipo:'al600',qtd:6,elem:10,w:0}],aqs:false,pessoas:3,sel:'',dist:5,distQ:10}}

// Volume comercial do acumulador AQS: 50 L por pessoa, mínimo 150 L, arredondado à capacidade standard seguinte.
function bcAqsLitros(pessoas){const v=Math.max(150,Math.max(1,num(pessoas,1))*50);return BC_AQS_L.find(l=>l>=v)||Math.ceil(v/100)*100}

function bcCalc(b){
 const tExt=num(b.text,3),dT=20-tExt,area=Math.max(0,num(b.area)),pisos=Math.max(1,Math.round(num(b.pisos,1))),pe=num(b.pe,2.6)||2.6;
 const aCob=area/pisos,aPav=area/pisos;
 // Paredes: se não for indicada a área bruta, estima-se pelo perímetro de uma planta quadrada (4·√A_piso) × pé-direito × pisos.
 const parBruta=num(b.paredes)>0?num(b.paredes):r(4*Math.sqrt(aPav)*pe*pisos,1);
 const aJan=num(b.janelas)>0?num(b.janelas):r(parBruta*num(b.janPct,15)/100,1);
 const aPar=Math.max(0,parBruta-aJan);
 const uP=num(b.uParede),uT=num(b.uTelhado),uJ=num(b.uJanela)*num(b.estore,1),uPav=num(b.pav);
 const parts={parede:uP*aPar*dT,telhado:uT*aCob*dT,janelas:uJ*aJan*dT,pavimento:uPav*aPav*dT};
 const qTrans=parts.parede+parts.telhado+parts.janelas+parts.pavimento;
 const vol=area*pe,qVent=0.34*num(b.rph,0.5)*vol*dT;
 const pAqs=b.aqs?Math.max(1,num(b.pessoas,3))*0.25:0;
 const pAquec=(qTrans+qVent)/1000*1.10*num(b.expo,1);
 const pNec=pAquec+pAqs;
 // Radiadores (EN 442): potência nominal a ΔT 50 corrigida para a temperatura média da água (ida − 5 °C de queda).
 const tida=num(b.tida,55),dTr=(tida+(tida-5))/2-20;
 const wEl=x=>{const t=BC_RAD.find(t=>t[0]===x.tipo);return t&&t[0]!=='manual'?t[2]:num(x.w)};
 const pRadNom=(b.rads||[]).reduce((s,x)=>s+Math.max(0,num(x.qtd))*(x.tipo==='toalheiro'?1:Math.max(0,num(x.elem)))*wEl(x),0);
 const fRad=dTr>0?Math.pow(dTr/50,1.3):0,pRadReal=pRadNom/1000*fRad;
 const defice=pRadNom>0?Math.max(0,pAquec-pRadReal):0;
 const elemH600=defice>0&&fRad>0?Math.ceil(defice*1000/(125*fRad)):0;
 const pRad65=pRadNom/1000*Math.pow(((65+60)/2-20)/50,1.3);
 return {tExt,dT,area,pisos,aCob,aPav,parBruta,aJan,aPar,parts,qTrans,qVent,vol,pAquec,pAqs,pNec,tida,dTr,pRadNom,pRadReal,defice,elemH600,pRad65,
  aqsLitros:b.aqs?bcAqsLitros(b.pessoas):0,inerciaMin:0};
}

// Lê das tabelas de preços as bombas de calor, os acumuladores AQS e os depósitos de inércia, pelos grupos e pelos nomes.
// Série: o caminho do grupo até ao nível «Unidade …» (ex.: Therma V › Split média temperatura), para juntar exterior e interior.
const serieDe=gr=>{const i=(gr||[]).findIndex(x=>/^(Unidade|Conjunto)/i.test(x));return (i<0?gr||[]:gr.slice(0,i)).slice(1).join(' › ')};
const net=(t,p)=>typeof root.priceNet==='function'?root.priceNet(t,p):r(num(p.price)*(1-num(t.discount)/100));
const kwDe=s=>{const m=String(s).match(/(\d+(?:[.,]\d+)?)\s*kW/i);return m?num(m[1]):0};
const litrosDe=s=>{const m=String(s).match(/(\d{2,4})\s*L\b/);return m?num(m[1]):0};
function bcCatalog(tables){
 const bombas=[],interiores=[],aqs=[],inercia=[];
 (tables||[]).forEach((t,ti)=>{if(t.invoices)return;(t.products||[]).forEach((p,pi)=>{
  const g=(p.group||[]).join(' › '),nome=String(p.name||'')+(p.model&&!String(p.name||'').includes(p.model)?' '+p.model:''),txt=g+' '+nome;
  const base={t,ti,pi,p,brand:t.live?(t.brand+(p.maker?' · '+p.maker:'')):t.brand,nome,preco:net(t,p)};
  if(!(base.preco>0))return;
  const L=litrosDe(nome);
  if(/in[ée]rcia/i.test(nome)&&L&&/^(.{0,25}\b)?(dep[óo]sito|tanque|acumulador)/i.test(nome)&&!/AQS \+|v[áa]lvula|sonda|kit|acess/i.test(nome)){inercia.push({...base,litros:L});return}
  if(/^dep[óo]sito inox \d/i.test(nome)&&/dep[óo]sitos inox/i.test(g)){aqs.push({...base,litros:L});return}
  if(L&&/(acumulador|dep[óo]sito|termoacumulador)/i.test(nome)&&/AQS|serpentina|bomba de calor|p\/ ?b\.?c|Acumuladores/i.test(txt)&&!/in[ée]rcia|caldeira, sem|piscina|el[ée]tric|g[áa]s|solar t[ée]rmico compacto/i.test(nome)&&!/^Bomba de calor AQS/i.test(g)){aqs.push({...base,litros:L});return}
  if((p.group||[])[0]!=='Bomba de calor climatização'||/Acess[óo]rios|Resist[êe]ncias|piscina|Tanques|Acumuladores|Ventilo|Fotovolt/i.test(g)||/ventilo|acumulador|termostato|controlador|kit /i.test(nome))return;
  const fase=/trif[áa]sic/i.test(nome)?3:1,temp=(nome.match(/(\d{2})\s*[º°]\s*C/)||g.match(/(\d{2})\s*[º°]\s*C/)||[])[1];
  const tmax=temp?num(temp):/R-?290|\bHT\b|Thermolux|alta temperatura/i.test(txt)?65:55;
  if(/Unidade interior|Unidade hidro/i.test(txt)){interiores.push({...base,serie:serieDe(p.group),fase:/trif[áa]sic/i.test(nome)&&!/mono/i.test(nome)?3:1,litros:/dep[óo]sito/i.test(nome)?L:0});return}
  const kw=kwDe(nome);if(!kw)return;
  bombas.push({...base,kw,fase,tmax,serie:serieDe(p.group),exterior:/Unidade exterior/i.test(txt)&&!/Conjunto|c\/ kit|monobloco .*c\/ BUH/i.test(nome),split:/split/i.test(nome)&&!/monobloco|hidrosplit/i.test(nome)||/Unidade exterior split/i.test(nome),litros:/DUO|dep[óo]sito/i.test(nome)?L:0});
 })});
 return {bombas,interiores,aqs,inercia};
}

// Material de instalação, como no orçamento automático: procurado nos catálogos dos fornecedores de material (Sanipower, Sanitop).
const bcCabo=(kw,tri,m)=>{const P=kw*1000/2.5,I=tri?P/(Math.sqrt(3)*400*0.9):P/(230*0.9),D=[10,16,20,25,32,40,50,63],d=D.find(x=>x>=I*1.15)||63,S=d<=16?2.5:d<=25?4:d<=32?6:d<=40?10:16;return {sec:S,disj:d,cabo:(tri?5:3)+'G'+String(S).replace('.',','),metros:Math.ceil(m*1.1+1)}};
function bcKitItens(k,b){
 const bom=k.bomba,dist=Math.max(1,num(b.dist,5)),tubo=Math.ceil(2*(dist+1)),tri=Number(b.fase)===3,kw=bom.kw,mono=!bom.split&&!bom.exterior,c=bcCabo(kw,tri,Math.max(2,num(b.distQ,10))),vaso=kw<=10?18:kw<=16?25:35,its=[];
 const add=(categoria,descricao,quantidade,pesquisa,extra={})=>its.push({id:'bc'+its.length,tipologia:'Bomba de calor climatização',categoria,descricao,quantidade,unidade:extra.unidade||'un.',pesquisa,...extra});
 add('Acessórios',`Vaso de expansão de aquecimento ${vaso} L`,1,[`vaso expansao aquecimento ${vaso}`,`vaso expansao ${vaso} l`],{exige:[['(^|[^0-9])'+vaso+' ?l']]});
 add('Acessórios','Válvula de segurança 3 bar e manómetro',1,['valvula seguranca 3 bar','valvula seguranca aquecimento 1/2','valvula seguranca 3bar'],{exige:[['(^|[^0-9])3 ?bar']]});
 add('Acessórios','Filtro magnético / separador de sujidades 1"',1,['filtro magnetico 1','separador sujidades magnetico','filtro magnetico aquecimento']);
 add('Acessórios','Válvula de esfera 1"',4,['valvula esfera 1"','torneira esfera 1"','valvula esfera 1 polegada'],{exige:[['(^|[^0-9/.])1(?![0-9/.,])','(^|[^0-9/])1 ?pol']],evita:['jardim','mangueira','lavatorio','maquina']});
 add('Acessórios','Ligação flexível antivibrática 1"',2,['flexivel antivibratico 1','ligacao flexivel antivibratica','tubo flexivel bomba calor','manga antivibratica 1'],{evita:['cromad','lavatorio','torneira','autoclismo']});
 add('Acessórios','Apoios antivibráticos / base para a unidade exterior',1,['suporte chao bomba calor','kit antivibratico chao','apoio chao unidade exterior','base apoio bomba calor']);
 if(mono)add('Acessórios','Válvula anticongelação 1"',2,['valvula anticongelacao 1','valvula anti gelo bomba calor','valvula anticongelamento']);
 add('Material','Tubo multicamada 32×3 mm (ida e retorno)',tubo,['tubo multicamada 32x3','multicamada 32','tubo multicamada 32 mm'],{unidade:'m',exige:[['32\\s?x\\s?3']]});
 add('Material','Isolamento para exterior tubo 32 mm (com proteção UV)',tubo,['isolamento tubo 35','isolamento isopipe 35','armaflex 35','isolamento tubo 32'],{unidade:'m'});
 add('Acessórios','Acessórios de multicamada 32 mm',8,['uniao multicamada 32','curva multicamada 32','acessorio multicamada 32']);
 add('Material','Purgadores automáticos e aditivo inibidor para o circuito',1,['inibidor aquecimento','purgador automatico 1/2','aditivo inibidor corrosao']);
 if(b.aqs&&!k.allInOne){
  add('Acessórios','Válvula de 3 vias desviadora AQS/aquecimento',1,['valvula 3 vias desviadora','valvula 3 vias 1','valvula desviadora aqs']);
  add('Acessórios','Grupo de segurança sanitário 7 bar',1,['grupo seguranca 3/4','grupo seguranca termoacumulador']);
  add('Acessórios','Vaso de expansão sanitário 12 L',1,['vaso expansao sanitario 12','vaso expansao aqs 12']);
  add('Acessórios','Misturadora termostática AQS 3/4"',1,['misturadora termostatica 3/4','misturadora termostatica solar']);
 }
 add('Material',`Cabo de alimentação ${c.cabo} mm²`,c.metros,[`cabo ${c.cabo.toLowerCase()}`,`cabo h07rn-f ${c.cabo.toLowerCase()}`,`cabo xv ${c.cabo.toLowerCase()}`],{unidade:'m'});
 add('Material',`Disjuntor ${c.disj} A curva C ${tri?'tetrapolar':'bipolar (1P+N)'}`,1,[`disjuntor ${c.disj}a ${tri?'4p':'2p'}`,`disjuntor ${c.disj} a curva c`,`disjuntor ${tri?'tetrapolar':'bipolar'} ${c.disj}a`]);
 add('Mão de obra','Instalação de bomba de calor de climatização (enchimento, purga e arranque)',1,[],{});
 add('Mão de obra','Tubagem hidráulica',tubo,[],{unidade:'m'});
 add('Mão de obra','Circuito elétrico dedicado e ligação ao quadro',1,[],{});
 return its;
}

// Escolhe o conjunto: bomba de calor (com unidade interior quando é preciso), acumulador AQS e depósito de inércia.
function bcPick(c,cat,b,selKey=''){
 const avisos=[],tida=num(b.tida,55),fase=Number(b.fase)===3?3:1,corr=tida>45?0.85:1;
 let lista=cat.bombas.filter(x=>fase===3||x.fase===1);
 if(tida>=65){const ht=lista.filter(x=>x.tmax>=tida);if(ht.length)lista=ht;else avisos.push(`Não há nas tabelas bombas de calor para ${tida} °C com alimentação ${fase===3?'trifásica':'monofásica'}: as sugestões trabalham a menos de ${tida} °C.`)}
 const comInterior=x=>{
  if(!x.exterior)return {...x,interior:null,total:x.preco,litrosAqs:x.litros};
  const ints=cat.interiores.filter(i=>i.ti===x.ti&&i.serie===x.serie&&(fase===3||i.fase===1));
  const comDep=b.aqs?ints.filter(i=>i.litros>=c.aqsLitros).sort((a,b)=>a.preco-b.preco)[0]:null;
  const i=comDep||ints.filter(i=>!i.litros).sort((a,b)=>a.preco-b.preco)[0]||ints.sort((a,b)=>a.preco-b.preco)[0]||null;
  return {...x,interior:i,total:x.preco+(i?i.preco:0),litrosAqs:x.litros||(i?i.litros:0)};
 };
 const ok=lista.map(x=>({...x,cap:r(x.kw*corr,2)})).filter(x=>x.cap>=c.pNec).map(comInterior).sort((a,b)=>a.kw-b.kw||a.total-b.total);
 if(!ok.length&&c.pNec>0)avisos.push(`Nenhuma bomba de calor das tabelas chega a ${r(c.pNec,1).toString().replace('.',',')} kW${corr<1?' (com a correção de 0,85 a '+tida+' °C)':''}. Considere duas máquinas em cascata ou melhorar o isolamento.`);
 // Uma sugestão por marca (a mais pequena que chega), da mais barata para a mais cara; a escolhida à mão fica primeiro.
 const porMarca=new Map();for(const x of ok)if(!porMarca.has(x.brand))porMarca.set(x.brand,x);
 const opcoes=[...porMarca.values()].sort((a,b)=>a.total-b.total);
 const bomba=opcoes.find(x=>x.ti+':'+x.pi===selKey)||opcoes[0]||null;
 // Inércia: 15–20 L por kW da bomba escolhida.
 const kw=bomba?bomba.kw:c.pNec,inMin=Math.ceil(kw*15),inMax=Math.ceil(kw*20);
 // Capacidade igual ou imediatamente superior; com a mesma capacidade, primeiro a marca da bomba e depois o mais barato.
 const ordem=(arr,min)=>arr.filter(d=>d.litros>=min).sort((a,b)=>a.litros-b.litros||(bomba?(b.brand===bomba.brand)-(a.brand===bomba.brand):0)||a.preco-b.preco);
 const inercia=ordem(cat.inercia,inMin)[0]||null;
 if(!inercia&&c.pNec>0)avisos.push(`Não há depósito de inércia de ${inMin} L ou mais nas tabelas: cotar um de ${inMin}–${inMax} L.`);
 let aqs=null,allInOne=false;
 if(b.aqs){
  if(bomba&&bomba.litrosAqs>=c.aqsLitros)allInOne=true;
  else{aqs=ordem(cat.aqs,c.aqsLitros)[0]||null;if(!aqs)avisos.push(`Não há acumulador AQS de ${c.aqsLitros} L nas tabelas: cotar um acumulador de ${c.aqsLitros} L para bomba de calor (serpentina de grande superfície).`)}
 }
 const total=(bomba?bomba.total:0)+(aqs?aqs.preco:0)+(inercia?inercia.preco:0);
 return {bomba,opcoes:opcoes.slice(0,4),aqs,allInOne,inercia,inMin,inMax,corr,avisos,total};
}
Object.assign(root,{BC_LOCAIS,BC_EXPO,BC_U,BC_ESTORE,BC_RPH,BC_RAD,BC_TIDA,newBc,bcAqsLitros,bcCalc,bcCatalog,bcPick,bcKitItens});
})(globalThis);

// ---------- Ecrã, dentro do editor de orçamentos ----------
let bcCat=null;
const bcTablesNow=()=>typeof quoteTables==='function'?quoteTables():globalThis.PRICE_TABLES||[];
function bcCatalogNow(){const t=bcTablesNow();if(bcCat?.t!==t)bcCat={t,c:bcCatalog(t)};return bcCat.c}
const bcOn=()=>quoteDraft&&(quoteDraft.bc||quoteDraft.topics.includes('Bomba de calor climatização'));
const bcF=(v,d=1)=>Number(v||0).toLocaleString('pt-PT',{minimumFractionDigits:d,maximumFractionDigits:d});
const bcNum=(label,key,extra='',hint='')=>`<label class="q-field"><span>${label}</span><input type="number" data-bc="${key}" value="${esc(['paredes','janelas'].includes(key)&&!Number(quoteDraft.bc[key])?'':quoteDraft.bc[key]??'')}" inputmode="decimal" ${extra}>${hint?`<small class="note">${hint}</small>`:''}</label>`;
const bcSel=(label,key,opts)=>{const v=String(quoteDraft.bc[key]??'');const custom=!opts.some(o=>String(o[0])===v);return `<label class="q-field"><span>${label}</span><select data-bc="${key}">${opts.map(([k,t])=>`<option value="${esc(k)}" ${String(k)===v?'selected':''}>${esc(t)}</option>`).join('')}${key.startsWith('u')||key==='pav'?`<option value="${custom?esc(v):'__'}" ${custom?'selected':''}>${custom?'Valor manual (U '+esc(v.replace('.',','))+')':'Valor U manual…'}</option>`:''}</select></label>`};
function bcSection(){
 if(!bcOn())return '';
 const b=quoteDraft.bc;
 if(!b)return `<h2>Dimensionamento da bomba de calor</h2><div class="q-card" id="bc-card"><p class="note">Calcula a potência necessária da casa, verifica os radiadores existentes e escolhe nas tabelas de preços a bomba de calor, o acumulador AQS e o depósito de inércia.</p><button type="button" class="btn alt" data-bca="start">Dimensionar bomba de calor</button></div>`;
 const rads=b.rads.map((x,i)=>`<div class="bc-rad"><label class="q-field"><span>Tipo</span><select data-bcr="${i}" data-f="tipo">${BC_RAD.map(([k,t,w])=>`<option value="${k}" ${x.tipo===k?'selected':''}>${esc(t)}${w?' · '+w+' W':''}</option>`).join('')}</select></label><label class="q-field"><span>Radiadores</span><input type="number" data-bcr="${i}" data-f="qtd" value="${esc(x.qtd)}" min="0" step="1" inputmode="numeric"></label>${x.tipo==='toalheiro'?'':`<label class="q-field"><span>Elementos por radiador</span><input type="number" data-bcr="${i}" data-f="elem" value="${esc(x.elem)}" min="0" step="1" inputmode="numeric"></label>`}${x.tipo==='manual'?`<label class="q-field"><span>W por elemento</span><input type="number" data-bcr="${i}" data-f="w" value="${esc(x.w)}" min="0" step="1" inputmode="numeric"></label>`:''}<button type="button" class="link neg" data-bca="rad-del" data-i="${i}">Remover</button></div>`).join('');
 return `<h2>Dimensionamento da bomba de calor</h2><div class="q-card bc" id="bc-card">
<h3 class="pv-sub">Local e instalação elétrica</h3>
<label class="q-field"><span>Localidade / concelho</span><select data-bc="local">${BC_LOCAIS.map(([n,t])=>`<option value="${esc(n)}" ${b.local===n?'selected':''}>${esc(n)} · ${t} °C</option>`).join('')}</select></label>
<div class="pv-2">${bcNum('Temperatura exterior de projeto (°C)','text','min="-15" max="15" step="0.5"','Pode ajustar à mão.')}${bcSel('Exposição','expo',BC_EXPO)}</div>
<div class="pv-2">${bcNum('Unidade exterior até à casa das máquinas (m)','dist','min="1" max="60" step="1"')}${bcNum('Distância ao quadro elétrico (m)','distQ','min="2" max="100" step="1"')}</div>
<label class="q-field"><span>Alimentação elétrica do cliente</span><select data-bc="fase"><option value="1" ${String(b.fase)==='1'?'selected':''}>Monofásico (230 V)</option><option value="3" ${String(b.fase)==='3'?'selected':''}>Trifásico (400 V)</option></select></label>
<h3 class="pv-sub">Casa</h3>
<div class="pv-2">${bcNum('Área útil aquecida (m²)','area','min="0" step="1"')}${bcNum('Número de pisos','pisos','min="1" max="3" step="1"')}</div>
<div class="pv-2">${bcNum('Pé-direito médio (m)','pe','min="2" max="6" step="0.05"')}${bcSel('Pavimento inferior','pav',BC_U.pavimento)}</div>
<div class="pv-2">${bcNum('Área bruta de paredes exteriores (m²)','paredes','min="0" step="1" placeholder="Automático"','Vazio: estimada pela área e pisos.')}${bcNum('Área de janelas (m²)','janelas','min="0" step="0.1" placeholder="Pela percentagem"')}</div>
${bcNum('Janelas em % da fachada (se não indicar a área)','janPct','min="0" max="80" step="1"')}
<h3 class="pv-sub">Isolamento e ventilação</h3>
${bcSel('Paredes','uParede',BC_U.parede)}${bcSel('Telhado / cobertura','uTelhado',BC_U.telhado)}${bcSel('Janelas','uJanela',BC_U.janela)}
<div class="pv-2">${bcSel('Estores','estore',BC_ESTORE)}${bcSel('Ventilação','rph',BC_RPH)}</div>
<h3 class="pv-sub">Radiadores existentes</h3>${rads||'<p class="note">Sem radiadores (ex.: piso radiante ou ventiloconvectores novos).</p>'}<button type="button" class="link" data-bca="rad-add">+ Adicionar linha de radiadores</button>
<label class="q-field"><span>Temperatura de ida</span><select data-bc="tida">${BC_TIDA.map(t=>`<option value="${t}" ${Number(b.tida)===t?'selected':''}>${t} °C${t===45?' · baixa temperatura':t===55?' · média temperatura':' · alta temperatura (R290)'}</option>`).join('')}</select></label>
<h3 class="pv-sub">Águas quentes sanitárias</h3>
<label class="bc-toggle"><input type="checkbox" data-bc="aqs" ${b.aqs?'checked':''}> <span>Incluir produção de AQS</span></label>
${b.aqs?bcNum('Quantas pessoas vivem na casa?','pessoas','min="1" max="20" step="1" required',`Acumulador mínimo: <b id="bc-litros">${bcAqsLitros(b.pessoas)} L</b>`):''}
<div id="bc-results">${bcResults()}</div>
<button type="button" class="link neg" data-bca="remove">Remover dimensionamento</button></div>`;
}
function bcResults(){
 const b=quoteDraft.bc,c=bcCalc(b),k=bcPick(c,bcCatalogNow(),b,b.sel),row=(a,v)=>`<div class="q-break"><span>${a}</span><b>${v}</b></div>`;
 b.result={pNec:bcR2(c.pNec),pAquec:bcR2(c.pAquec),pRadReal:bcR2(c.pRadReal),aqsLitros:c.aqsLitros,bomba:k.bomba?k.bomba.nome:''};
 const item=(x,extra='')=>x?`<div class="bc-item"><span><b>${esc(x.brand)}</b> · ${esc(x.nome)}${extra}</span><b>${eur(x.preco)}</b></div>`:'';
 const kit=k.bomba?`${item(k.bomba,` <small class="note">${bcF(k.bomba.kw)} kW nominal · ${bcF(k.bomba.cap)} kW a ${c.tida} °C · até ${k.bomba.tmax} °C · ${k.bomba.fase===3?'trifásica':'monofásica'}</small>`)}${k.bomba.interior?item(k.bomba.interior,' <small class="note">unidade interior / hidráulica</small>'):k.bomba.exterior?'<p class="note neg">Esta unidade exterior precisa de unidade interior: não encontrei uma compatível na mesma série, escolha-a nas linhas do orçamento.</p>':''}${k.allInOne?`<p class="note pos">Bomba de calor com depósito AQS integrado de ${k.bomba.litrosAqs} L: não precisa de acumulador separado.</p>`:''}${item(k.aqs,` <small class="note">acumulador AQS ${k.aqs?k.aqs.litros:''} L</small>`)}${item(k.inercia,` <small class="note">inércia ${k.inercia?k.inercia.litros:''} L (mín. ${k.inMin}–${k.inMax} L)</small>`)}<div class="q-break bc-total"><span>Total do conjunto (custo s/ IVA)</span><b>${eur(k.total)}</b></div>`:'';
 const alt=k.opcoes.length>1?`<label class="q-field"><span>Outras bombas de calor que servem</span><select data-bc="sel">${k.opcoes.map(x=>`<option value="${x.ti}:${x.pi}" ${k.bomba&&x.ti===k.bomba.ti&&x.pi===k.bomba.pi?'selected':''}>${esc(x.brand)} · ${bcF(x.kw)} kW · ${eur(x.total)}${x.interior?' (c/ unid. interior)':''}</option>`).join('')}</select></label>`:'';
 const radAviso=c.pRadNom>0&&c.defice>0?`<p class="note neg bc-alert">Os radiadores dão ${bcF(c.pRadReal)} kW a ${c.tida} °C, faltam <b>${bcF(c.defice)} kW</b> para o aquecimento. Acrescentar cerca de <b>${c.elemH600} elementos H600</b>${c.tida<65?` ou subir a ida para 65 °C (os radiadores passam a dar ${bcF(c.pRad65)} kW${c.pRad65>=c.pAquec?', o que chega':''})`:''}.</p>`:c.pRadNom>0?`<p class="note pos">Os radiadores chegam: ${bcF(c.pRadReal)} kW a ${c.tida} °C para ${bcF(c.pAquec)} kW de aquecimento.</p>`:'';
 return `<div class="pv-kpis"><div><small>Potência necessária</small><b>${bcF(c.pNec)} kW</b><span>${bcF(c.pAquec)} aquecimento${c.pAqs?' + '+bcF(c.pAqs,2)+' AQS':''}</span></div><div><small>Radiadores a ${c.tida} °C</small><b>${c.pRadNom?bcF(c.pRadReal)+' kW':'—'}</b><span>${c.pRadNom?bcF(c.pRadNom/1000)+' kW nominal (ΔT 50)':'sem radiadores'}</span></div>${c.aqsLitros?`<div><small>Acumulador AQS</small><b>${c.aqsLitros} L</b><span>${Math.max(1,Number(quoteDraft.bc.pessoas)||1)} pessoas</span></div>`:''}</div>
${row('ΔT de projeto',bcF(c.dT)+' °C ('+bcF(c.tExt)+' °C exterior)')}${row('Perdas pela envolvente',bcF(c.qTrans/1000,2)+' kW')}${row('Perdas por ventilação',bcF(c.qVent/1000,2)+' kW · '+bcF(c.vol,0)+' m³')}${row('Paredes / janelas / cobertura / pavimento',`${bcF(c.aPar,0)} / ${bcF(c.aJan,0)} / ${bcF(c.aCob,0)} / ${bcF(c.aPav,0)} m²`)}
${radAviso}${k.avisos.map(a=>`<p class="note neg">${esc(a)}</p>`).join('')}
<h3 class="pv-sub">Conjunto recomendado</h3>${kit||'<p class="note">Indique a área da casa para ver a recomendação.</p>'}${alt}
${k.bomba?'<p class="note">Junta também o material de instalação (vaso de expansão, válvulas, filtro, tubo multicamada e isolamento, cabo e disjuntor'+(quoteDraft.bc.aqs&&!k.allInOne?', válvula de 3 vias e grupo de segurança AQS':'')+') dos fornecedores de material (Sanipower, Sanitop) e a mão de obra.</p><button type="button" class="btn" data-bca="apply">Adicionar conjunto completo ao orçamento</button>':''}`;
}
const bcR2=v=>Math.round(v*100)/100;
const bcRefresh=()=>{const el=document.querySelector('#bc-card');if(el)el.outerHTML=bcSection().replace(/^<h2>[^<]*<\/h2>/,'')};
const bcRefreshResults=()=>{const el=document.querySelector('#bc-results');if(el)el.innerHTML=bcResults();const l=document.querySelector('#bc-litros');if(l)l.textContent=bcAqsLitros(quoteDraft.bc.pessoas)+' L'};
document.addEventListener('input',e=>{
 const t=e.target;if(!quoteDraft?.bc)return;
 const b=quoteDraft.bc;
 if(t.dataset?.bcr!==undefined){const x=b.rads[Number(t.dataset.bcr)];if(!x)return;x[t.dataset.f]=t.tagName==='SELECT'?t.value:t.value===''?0:Number(t.value);t.tagName==='SELECT'?bcRefresh():bcRefreshResults();return}
 const k=t.dataset?.bc;if(!k)return;
 if(k==='aqs'){b.aqs=t.checked;bcRefresh();return}
 if(t.tagName==='SELECT'){
  if(t.value==='__'){const v=window.prompt('Valor U (W/m².°C):','');if(v!==null&&isFinite(Number(String(v).replace(',','.'))))b[k]=String(Number(String(v).replace(',','.')));bcRefresh();return}
  b[k]=t.value;if(k==='local'){const l=BC_LOCAIS.find(l=>l[0]===t.value);if(l)b.text=l[1]}
  if(k!=='sel')b.sel='';bcRefresh();return;
 }
 b[k]=t.value===''?'':Number(t.value);bcRefreshResults();
});
document.addEventListener('change',e=>{if(e.target.dataset?.qt==='Bomba de calor climatização'&&quoteDraft&&typeof render==='function')render()});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-bca]');if(!b||!quoteDraft)return;
 const a=b.dataset.bca;
 if(a==='start'){quoteDraft.bc=newBc();if(!quoteDraft.topics.includes('Bomba de calor climatização'))quoteDraft.topics.push('Bomba de calor climatização');render();return}
 if(a==='remove'){if(!window.confirm('Remover o dimensionamento? As linhas já adicionadas ao orçamento ficam.'))return;delete quoteDraft.bc;quoteDraft.lines.forEach(l=>delete l.bc);render();return}
 if(a==='rad-add'){quoteDraft.bc.rads.push({tipo:'al600',qtd:1,elem:10,w:0});bcRefresh();return}
 if(a==='rad-del'){quoteDraft.bc.rads.splice(Number(b.dataset.i),1);bcRefresh();return}
 if(a==='apply'){
  const bc=quoteDraft.bc,c=bcCalc(bc),k=bcPick(c,bcCatalogNow(),bc,bc.sel);if(!k.bomba)return;
  const linha=x=>({...quoteCatalogLine(x.t,x.p),quantity:1,bc:true});
  const kit=typeof aiResolve==='function'?aiResolve(bcKitItens(k,bc)).lines.map(l=>({...l,bc:true})):[];
  const novas=[...[k.bomba,k.bomba.interior,k.aqs,k.inercia].filter(Boolean).map(linha),...kit];
  const keep=quoteDraft.lines.filter(l=>!l.bc&&!quoteLineBlank(l));
  quoteDraft.lines=[...novas,...keep];quoteEnsureBlank();
  if(!quoteDraft.brand.trim())quoteDraft.brand=k.bomba.brand;
  const semPreco=novas.filter(l=>l.semPreco&&l.kind!=='Mão de obra').length;
  quoteError='Conjunto da bomba de calor adicionado: '+novas.length+' linhas (equipamentos, material de instalação dos fornecedores e mão de obra).'+(semPreco?' '+semPreco+' sem preço, a vermelho: escolha-as na tabela de preços.':'')+' Reveja e guarde o orçamento.';render();
  document.querySelector('#quote-lines')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 }
});
