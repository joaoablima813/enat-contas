/* Orçamento automático com IA.
   O utilizador descreve a obra (divisões, áreas, distâncias, o que o cliente quer). O servidor dimensiona e monta a lista
   completa de equipamento, material, acessórios e mão de obra; a app procura cada produto nas tabelas de preços, nos
   catálogos dos fornecedores e nas faturas, e a IA escolhe o produto certo entre os candidatos.
   Os preços vêm sempre das tabelas (ou da tabela de mão de obra do utilizador), nunca da IA. */
(function(root){
 const UNITS=['un.','m','m²','m³','h','dia','serviço'];
 // Tabela de mão de obra por omissão: o utilizador define os valores uma vez (ficam sincronizados entre dispositivos).
 const LABOUR=[
  ['ac_mono','Instalação de ar condicionado monosplit (interior + exterior)','un.'],
  ['ac_ui','Instalação de unidade interior (multisplit)','un.'],
  ['ac_ue','Instalação de unidade exterior (multisplit)','un.'],
  ['linha','Execução de linha frigorífica','m'],
  ['calha','Montagem de calha técnica','m'],
  ['vacuo','Vácuo, ensaio de estanquidade e arranque','un.'],
  ['eletrica','Circuito elétrico dedicado e ligação ao quadro','un.'],
  ['cabo','Passagem de cabo elétrico','m'],
  ['furo','Furação / caroteamento de parede','un.'],
  ['bc_aqs','Instalação de bomba de calor AQS','un.'],
  ['bc_clima','Instalação de bomba de calor de climatização','un.'],
  ['ventilo','Instalação de ventiloconvector','un.'],
  ['hidraulica','Tubagem hidráulica','m'],
  ['piso','Montagem de piso radiante','m²'],
  ['vmc_unid','Instalação de unidade VMC','un.'],
  ['vmc_ponto','Ponto de insuflação/extração VMC','un.'],
  ['solar','Instalação de sistema solar térmico','un.'],
  ['pv','Instalação fotovoltaica','un.'],
  ['wallbox','Instalação de carregador automóvel','un.'],
  ['desmontagem','Desmontagem e remoção de equipamento antigo','un.'],
  ['deslocacao','Deslocação','serviço'],
 ].map(([id,nome,unidade])=>({id,nome,unidade,preco:0}));
 // Onde procurar cada produto. Material, acessórios, cabos e tubos: sempre nos catálogos da Sanipower e da Sanitop.
 // Equipamentos: conforme a gama pedida pelo cliente (o utilizador pode mudar estas listas na caixa da IA).
 const SOURCES={preco:'Sanipower, Ekallor',media:'LG, Ekallor, Sanipower',qualidade:'Daikin, LG',material:'Sanipower, Sanitop'};
 const sources=()=>({...SOURCES,...(S.iaFontes||{})});
 const names=v=>String(v||'').split(/[,;]/).map(x=>quoteNorm(x)).filter(Boolean);
 const tableName=t=>quoteNorm(t.supplier||t.brand||'');
 // Índices das tabelas onde se pode procurar esta linha (null = todas).
 // «aux»: equipamento auxiliar (depósitos) que pode vir da marca da gama ou dos fornecedores de material.
 function allowed(categoria,gama,tables=quoteTables(),aux=false){
  const want=categoria==='Equipamento'?(gama?[...names(sources()[gama]),...(aux?names(sources().material):[])]:null):names(sources().material);
  if(!want||!want.length)return null;
  return new Set(tables.map((t,i)=>[t,i]).filter(([t])=>!t.invoices&&want.some(w=>tableName(t).includes(w))).map(([,i])=>i));
 }
 // O mesmo material com outros nomes nos catálogos (a procura tenta também estas variantes).
 const SYN={
  multicamada:['multicapa','pex-al-pex','pert-al-pert'],isolamento:['coquilha','isolante','armaflex'],coquilha:['isolamento'],
  'pre-isolado':['isolado'],preisolado:['isolado'],cobre:['frigorifico'],calha:['canaleta'],'passa':['passamuros'],
  condensados:['condensado','drenagem'],disjuntor:['magnetotermico'],antivibraticos:['antivibratico','amortecedores','silentblock'],antivibratico:['amortecedor','silentblock'],
  suporte:['consola','mensula'],inibidor:['protetor','aditivo'],dieletrico:['dieletrica','isolante'],manguito:['uniao','casquilho'],
  esfera:['passagem'],valvula:['valv','torneira'],tubo:['tubagem'],vaso:['vaso'],expansao:['expansao'],purgador:['purgador'],
  interligacao:['comando','sinal'],alimentacao:['energia'],flexivel:['flexiveis','mangueira'],termostato:['cronotermostato'],
 };
 const variants=ws=>{const out=[ws];ws.forEach((w,i)=>(SYN[w]||[]).forEach(v=>{if(out.length<8)out.push([...ws.slice(0,i),...v.split(' '),...ws.slice(i+1)])}));return out};
 const st=root.QUOTE_AI={busy:false,phase:'',error:'',labour:false,draft:null};
 const labour=()=>Array.isArray(S.maoObra)&&S.maoObra.length?S.maoObra:LABOUR.map(x=>({...x}));
 const n2=n=>String(Math.round(n*100)/100).replace('.',',');

 // Texto inicial a partir da lead: divisões, área, notas e o que o cliente pediu.
 function leadText(q){
  const l=q?.lead&&(S.leads||[]).find(x=>x.id===q.lead);if(!l)return '';
  // Com o questionário respondido: as respostas do cliente e as potências já calculadas.
  const r=l.pedido?.resp;
  if(r&&root.EnatPedido){
   const ans=EnatPedido.summary(r).filter(([k])=>k!=='Soluções'&&k!=='Gama preferida').map(([k,v])=>k+': '+v);
   const sug=(l.pedido.sug||[]).flatMap(x=>[x.titulo+':',...x.linhas.map(y=>'- '+y)]);
   return ['Soluções pedidas: '+r.sol.join(', '),r.a?.fase&&r.a.fase!=='Não sei'&&'Instalação elétrica '+r.a.fase.toLowerCase()+' (trifasico: '+(r.a.fase==='Trifásica')+')',...ans,sug.length&&'\nEQUIPAMENTOS CALCULADOS (usar estas potências):\n'+sug.join('\n'),l.notes&&'Notas: '+l.notes].filter(Boolean).join('\n').slice(0,7800);
  }
  return [l.rooms&&'Divisões: '+l.rooms,l.area&&'Área: '+l.area,Array.isArray(l.solutions)&&l.solutions.length&&'Soluções pedidas: '+l.solutions.join(', '),l.heating&&'Aquecimento de água atual: '+l.heating,l.bill&&'Fatura elétrica: '+l.bill,l.notes].filter(Boolean).join('\n');
 }
 const text=q=>q.ai?.texto??leadText(q);

 // Procura local: todas as tabelas, catálogos e faturas, com os termos de pesquisa da IA.
 const words=s=>quoteNorm(String(s||'').replace(/(\d),(\d)/g,'$1.$2').replace(/(\d)\s*[x×]\s*(\d)/gi,'$1x$2').replace(/(\d)\s*"/g,'$1')).split(/[\s"']+/).filter(w=>w&&!['de','do','da','para','com','p/','e','c/'].includes(w));
 const HAY=new WeakMap();
 // Condições do servidor (medidas, potência, secção): expressões que o nome do produto tem de cumprir.
 const RX=new Map();
 const rx=ex=>(Array.isArray(ex)?ex:[]).map(g=>(Array.isArray(g)?g:[g]).map(src=>{let r=RX.get(src);if(r===undefined){try{r=new RegExp(src,'i')}catch{r=null}RX.set(src,r)}return r}).filter(Boolean)).filter(g=>g.length);
 function hay(t,p){let h=HAY.get(p);if(h===undefined){h=quoteNorm([t.invoices?'fatura':t.brand,p.maker,p.ref,p.name,...p.group].join(' ')).replace(/(\d),(\d)/g,'$1.$2').replace(/(\d)\s*[x×]\s*(\d)/gi,'$1x$2').replace(/(\d)\s*"/g,'$1');HAY.set(p,h)}return h}
 // Índice de texto por tabela: todos os nomes num só texto, para encontrar cada palavra de uma vez (rápido no telemóvel).
 const IDX=new WeakMap();
 function index(t){
  let x=IDX.get(t);
  if(!x||x.n!==t.products.length){const hs=t.products.map(p=>hay(t,p)),offs=new Int32Array(hs.length);let o=0;hs.forEach((h,i)=>{offs[i]=o;o+=h.length+1});x={big:hs.join('\n'),offs,n:hs.length,hits:new Map()};IDX.set(t,x)}
  return x;
 }
 function hits(x,w){
  let out=x.hits.get(w);if(out)return out;
  out=new Set();const o=x.offs;
  for(let i=x.big.indexOf(w);i>=0;){let lo=0,hi=o.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(o[m]<=i)lo=m;else hi=m-1}out.add(lo);const next=lo+1<o.length?o[lo+1]:x.big.length;i=x.big.indexOf(w,Math.max(i+1,next))}
  if(x.hits.size>3000)x.hits.clear();x.hits.set(w,out);return out;
 }
 // Potência do produto lida do nome/modelo: «12kW», «3,5 kW», «14000 BTUS» (também «BUTS», como aparece num catálogo).
 function powerOf(h){
  const k=[...h.matchAll(/(\d+(?:\.\d+)?)\s?kw\b/g)].map(m=>Number(m[1])).filter(v=>v>0&&v<200);
  const b=[...h.matchAll(/(\d{4,6})\s?(?:btu|buts)/g)].map(m=>Number(m[1])/3412).filter(v=>v>0&&v<200);
  return k.length?k[0]:b.length?b[0]:null;
 }
 // Saídas de uma exterior multisplit: «3 saídas», «3x», ou no modelo (MT3PA27, HR3PA18).
 const portsOf=h=>{const m=h.match(/(\d)\s?(?:saidas|portas|vias)\b/)||h.match(/\b[a-z]{2}(\d)[a-z]{2}\d/);return m?Number(m[1]):null};
 function search(item,brand,tables=quoteTables(),only=null){
  const qs=[...(item.pesquisa||[]),item.descricao].map(words).filter(w=>w.length).flatMap(variants),b=quoteNorm(brand),found=[];
  if(!qs.length)return [];
  const ex=rx(item.exige);
  // «grupo»: a família do produto (ex.: só ar condicionado); «evita»: palavras que excluem o produto (ex.: «exterior» numa unidade interior).
  const grp=item.grupo?rx([[item.grupo]])[0]?.[0]:null,avoid=rx([item.evita||[]])[0]||[];
  tables.forEach((t,ti)=>{
   if(only&&!only.has(ti))return;
   const x=index(t),best=new Map();
   qs.forEach((ws,k)=>{
    const cnt=new Map();for(const w of new Set(ws))for(const pi of hits(x,w))cnt.set(pi,(cnt.get(pi)||0)+ws.filter(v=>v===w).length);
    for(const [pi,m] of cnt){if(m<Math.min(2,ws.length))continue;const r=m/ws.length-(k?0.03*k:0);if(r>(best.get(pi)||0))best.set(pi,r)}
   });
   for(const [pi,v] of best){
    if(v<0.5)continue;
    const p=t.products[pi],h=hay(t,p);
    const nm=quoteNorm(p.name+' '+(p.model||'')+' '+(p.maker||'')).replace(/(\d)\s*"/g,'$1');
    if(avoid.some(r=>r.test(nm))||(grp&&!grp.test(quoteNorm((p.group||[]).join(' ')+' '+p.name))))continue;
    let ok=ex.length?ex.every(g=>g.some(r=>r.test(h))):null;
    // Com potência pedida: aceita do valor pedido até 45% acima (o tamanho comercial seguinte); com saídas, pelo menos as pedidas.
    if(item.potencia){const kw=powerOf(h),pp=item.saidas?portsOf(h):null;ok=kw!=null&&kw>=item.potencia*0.95&&kw<=item.potencia*1.45&&(!item.saidas||pp==null||pp>=item.saidas)&&(ok!==false||!ex.length||ex.slice(1).every(g=>g.some(r=>r.test(h))))}
    let s=v;if(ok)s+=0.25;else if(ok===false)s-=0.1;if(b&&item.categoria==='Equipamento'&&h.includes(b))s+=0.2;if(item.tipologia&&p.group[0]===item.tipologia)s+=0.05;if(t.invoices)s+=0.03;if(p.est)s-=0.02;if(t.live&&p.stock===0)s-=0.05;
    found.push({ti,pi,s,ok,...(item.potencia?{kw:powerOf(h)}:{}),...(item.saidas?{ports:portsOf(h)}:{})});
   }
  });
  found.sort((x,y)=>y.s-x.s);
  const seen=new Set(),out=[];
  for(const f of found){const t=tables[f.ti],p=t.products[f.pi],k=quoteNorm(p.name+'|'+(p.ref||''));if(seen.has(k))continue;seen.add(k);out.push(f);if(out.length>=12)break}
  return out;
 }
 const learnKey=(it,gama)=>(it.categoria==='Equipamento'?(gama||'')+'|':'')+quoteNorm(String(it.descricao||'').replace(/\s+(LG|Daikin|Ekallor|Mitsubishi|Fujitsu|Toshiba|Panasonic|Samsung|Midea|Haier|Gree|Hisense)$/i,''));
 function learned(key,tables=quoteTables()){
  const m=(S.iaAprendido||{})[key];if(!m)return null;
  for(let ti=0;ti<tables.length;ti++){const t=tables[ti];if(tableName(t)!==m.src)continue;const pi=t.products.findIndex(p=>(m.ref&&p.ref===m.ref)||(!m.ref&&p.name===m.name));if(pi>=0)return {ti,pi,s:2,ok:true}}
  return null;
 }
 // Material de uma lista já calculada (ex.: dimensionamento da bomba de calor): procura local nos fornecedores, sem IA.
 root.aiResolve=(itens,gama='')=>{
  const found={},picks={},T=quoteTables();
  for(const it of itens){if(it.categoria==='Mão de obra')continue;
   const hit=learned(learnKey(it,gama));if(hit){found[it.id]=[hit];picks[it.id]={id:it.id,candidato:0,quantidade:null,unidade:null};continue}
   const only=allowed(it.categoria,gama,T,it.aux),f=search(it,quoteDraft?.brand||'',T,only);found[it.id]=f;const p=autoPick(it,f,gama,prices(f));if(p)picks[it.id]=p}
  return buildLines({itens},picks,found,labour(),gama);
 };
 root.quoteAiLearn=(line,t,p)=>{if(!line?.aiKey||!t||!p)return;S.iaAprendido={...(S.iaAprendido||{}),[line.aiKey]:{src:tableName(t),ref:p.ref||'',name:p.name}};if(typeof save==='function')save()};
 const prices=f=>f.map(c=>{const t=quoteTables()[c.ti];return priceNet(t,t.products[c.pi])});
 // Marca/série do produto: nos catálogos online é a marca do fabricante (ou a 1.ª palavra do nome, ex.: Proteu); nas tabelas, a marca da tabela.
 const family=(t,p)=>t.live?quoteNorm(p.maker||String(p.name).split(/\s+/)[0]):quoteNorm(t.brand);
 const candidate=(t,p)=>({nome:p.name+(p.model&&!String(p.name).includes(p.model)?' – '+p.model:''),ref:p.ref||'',marca:t.invoices?'(última fatura)':t.live?p.maker||'':t.brand,grupo:p.group.join(' › '),preco:priceNet(t,p)});

 // Pedido direto ao servidor (responde em poucos segundos), com limite de tempo.
 async function post(path,body,ms){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  try{
   const r=await API('orcamento-ia/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ac.signal});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Não foi possível contactar a IA.');return d;
  }catch(e){if(e.name==='AbortError')throw Error('A IA demorou a responder. Tente novamente.');throw e}
  finally{clearTimeout(t)}
 }
 // Escolha local (sem IA): o melhor candidato que cumpre as medidas pedidas. Equipamento só com medidas confirmadas.
 // Com uma gama escolhida, entre os candidatos que cumprem as medidas: o mais barato (preço), o do meio (equilíbrio) ou o mais caro (qualidade).
 function autoPick(it,f,gama='',prices=[]){
  const fits=(f||[]).map((x,i)=>[x,i]).filter(([x])=>x.ok===true||(x.ok===null&&it.categoria!=='Equipamento'&&x.s>=0.85));
  if(!fits.length)return null;
  // Potência: primeiro o tamanho comercial mais próximo que cumpre; a gama escolhe entre esses (não uma máquina maior).
  const kws=fits.map(([x])=>x.kw).filter(v=>v!=null);if(kws.length){const lo=Math.min(...kws);for(let i=fits.length-1;i>=0;i--)if(fits[i][0].kw!=null&&fits[i][0].kw>lo*1.1)fits.splice(i,1)}
  const ps=fits.map(([x])=>x.ports).filter(v=>v!=null);if(ps.length){const lo=Math.min(...ps);for(let i=fits.length-1;i>=0;i--)if(fits[i][0].ports!=null&&fits[i][0].ports>lo)fits.splice(i,1)}
  let c=fits[0][1];
  if(gama&&fits.length>1&&prices.length){const s=fits.filter(([,i])=>prices[i]>0).sort((a,b)=>prices[a[1]]-prices[b[1]]);if(s.length)c=(gama==='preco'?s[0]:gama==='qualidade'?s[s.length-1]:s[Math.floor((s.length-1)/2)])[1]}
  return {id:it.id,candidato:c,quantidade:null,unidade:null};
 }
 const paint=()=>{const el=document.querySelector('#qai-status');if(el)el.innerHTML=statusHtml();else if(typeof render==='function')render()};
 const statusHtml=()=>st.busy?`<p class="note qai-busy"><span class="qai-spin"></span>${esc(st.phase||'A trabalhar…')}</p>`:st.error?`<p class="note neg">${esc(st.error)}</p>`:'';

 // Linhas do orçamento a partir do plano e das escolhas: preço das tabelas ou da mão de obra; o resto fica "sem preço".
 function buildLines(plan,picks,found,rates,gama=''){
  const tables=quoteTables(),lines=[],live=[],works=[];
  for(const it of plan.itens){
   if(it.categoria==='Mão de obra'){works.push(it);continue}
   const e=picks[it.id],c=e&&e.candidato!=null?found[it.id]?.[e.candidato]:null;
   if(c){const t=tables[c.ti],p=t.products[c.pi],l=quoteCatalogLine(t,p);l.kind=it.categoria;l.aiKey=learnKey(it,gama);l.quantity=e.quantidade||it.quantidade;if(e.unidade)l.unit=e.unidade;else if(l.unit==='un.'&&it.unidade!=='un.'&&/\b(ml|metro|ao metro|\/m)\b/i.test(p.name))l.unit=it.unidade;
   // Regra ENAT: cabos, tubos, etc. sempre em metros. Produto vendido em rolo (ex.: «rolo 100 m») passa a preço por metro.
   if(it.unidade==='m'){const r=String(p.name).match(/(?:rolo|bobine|bobina|barra|vara|rl\.?)\D{0,8}(\d+(?:[.,]\d+)?)\s*m\b|(?<![x\d,.])(\d{1,4}(?:[.,]\d+)?)\s*m(?:etros|ts|t)?\b/i),len=r?Number((r[1]||r[2]).replace(',','.')):0;if(len>1&&String(p.unit||'un.')!=='m')l.value=Math.round(l.value/len*10000)/10000;l.unit='m';l.quantity=it.quantidade}lines.push(l);if(t.live)live.push([t,p,l]);continue}
   lines.push({kind:it.categoria,description:it.descricao+(it.especificacao&&!it.descricao.includes(it.especificacao)?' – '+it.especificacao:''),quantity:it.quantidade,unit:it.unidade,value:it.preco_indicado||0,aiKey:learnKey(it,gama),...(it.preco_indicado?{}:{semPreco:true})});
  }
  // Uma única linha de mão de obra, a última, para o utilizador pôr o valor que entender.
  if(works.length){const fmt=x=>String(Math.round(x*100)/100).replace('.',',');const list=works.map(w=>(w.quantidade&&w.quantidade!==1?fmt(w.quantidade)+' '+(w.unidade||'')+' ':'')+w.descricao.replace(/^Instalação de /,'instalação de ')).join('; ');lines.push({kind:'Mão de obra',description:('Mão de obra de instalação: '+list).slice(0,1500),quantity:1,unit:'serviço',value:0,semPreco:true})}
  return {lines,live};
 }

 async function generate(){
  const q=quoteDraft;if(!q||st.busy)return;
  const box=document.querySelector('[data-qi="texto"]'),texto=(box?box.value:text(q)).trim();
  if(texto.length<10){st.error='Descreva a obra: divisões e áreas, distâncias, onde fica a exterior, o que o cliente quer.';paint();return}
  const hasLines=q.lines.some(l=>!quoteLineBlank(l));
  let mode='replace';if(hasLines)mode=confirm('O orçamento já tem linhas. OK substitui-as pelo orçamento da IA; Cancelar acrescenta as linhas da IA no fim.')?'replace':'append';
  q.ai={...(q.ai||{}),texto};st.busy=true;st.error='';st.phase='A ler o pedido e a montar o orçamento…';render();
  try{
   const rates=labour();
   const plan=await post('rapido',{texto,tipologias:q.topics,marca:q.brand,morada:q.address,maoObra:rates,regras:S.iaRegras||''},45000);
   const gama=q.gama||'';
   if(quoteDraft!==q)return;
   st.phase='A procurar os produtos nas tabelas de preços…';paint();
   const found={},items=[],picks={};
   const missing=new Set();
   for(const it of plan.itens){if(it.categoria==='Mão de obra')continue;await new Promise(r=>setTimeout(r,0));
    const only=allowed(it.categoria,gama,quoteTables(),it.aux);if(only&&!only.size)missing.add(it.categoria==='Equipamento'?sources()[gama]:sources().material);
    const hit=learned(learnKey(it,gama));if(hit){found[it.id]=[hit];picks[it.id]={id:it.id,candidato:0,quantidade:null,unidade:null};continue}
    // Com gama, a marca escrita no pedido não se sobrepõe aos fornecedores da gama.
    const f=search(it,gama&&it.categoria==='Equipamento'?q.brand:(q.brand||plan.marca),quoteTables(),only);found[it.id]=f;const a=autoPick(it,f,gama,prices(f));if(a)picks[it.id]=a}
   const T=quoteTables(),ext=plan.itens.find(i=>i.categoria==='Equipamento'&&i.saidas&&picks[i.id]);
   if(ext){const c=found[ext.id][picks[ext.id].candidato],fam=family(T[c.ti],T[c.ti].products[c.pi]);
    for(const it of plan.itens.filter(i=>i.categoria==='Equipamento'&&!i.saidas&&/interior/i.test(i.descricao))){const f=(found[it.id]||[]).filter(x=>x.ti===c.ti&&family(T[x.ti],T[x.ti].products[x.pi])===fam);found[it.id]=f;const a=autoPick(it,f,gama,prices(f));if(a)picks[it.id]=a;else delete picks[it.id]}}
   for(const it of plan.itens){const f=found[it.id];if(it.categoria==='Mão de obra'||!f||!f.length||picks[it.id])continue;items.push({id:it.id,descricao:it.descricao,especificacao:it.especificacao,quantidade:it.quantidade,unidade:it.unidade,candidatos:f.map(c=>{const t=quoteTables()[c.ti];return candidate(t,t.products[c.pi])})})}
   if(items.length){
    st.phase='A escolher os produtos certos…';paint();
    // Se a IA falhar ou demorar, ficam as escolhas locais.
    try{const r=await post('escolher',{marca:q.brand||plan.marca,gama,itens:items},30000);const got=new Map((r.escolhas||[]).map(e=>[e.id,e]));for(const it of items){const e=got.get(it.id);if(e)picks[it.id]=e}}
    catch(e){console.warn('escolha local',e.message)}
   }
   if(quoteDraft!==q)return;
   const {lines,live}=buildLines(plan,picks,found,rates,gama);
   q.lines=mode==='replace'?lines:[...q.lines.filter(l=>!quoteLineBlank(l)),...lines];
   q.topics=[...new Set([...q.topics,...plan.tipologias])];
   if(!String(q.brand||'').trim()&&plan.marca)q.brand=plan.marca;
   const noPrice=lines.filter(l=>l.semPreco&&l.kind!=='Mão de obra').length;
   q.ai={texto,at:new Date().toISOString(),gama,fontesEmFalta:[...missing],resumo:plan.resumo,dimensionamento:plan.dimensionamento,pressupostos:plan.pressupostos,perguntas:plan.perguntas,avisos:plan.avisos||[],verificacao:plan.verificacao,calculos:plan.calculos||[],linhas:lines.length,semPreco:noPrice};
   quoteEnsureBlank();
   st.phase='';
   // Os produtos dos fornecedores online são confirmados no site, como quando se escolhem à mão.
   (async()=>{for(const [t,p,l] of live.slice(0,40)){if(quoteDraft!==q)return;await supplierLive(t,p,l)}if(quoteDraft===q&&V.tab==='orc'&&!document.activeElement?.matches?.('input,textarea,select'))render()})();
  }catch(e){if(e.message!=='cancelado')st.error=e.message||'Não foi possível preparar o orçamento automático.'}
  finally{st.busy=false;if(quoteDraft===q&&V.tab==='orc')render()}
 }

 const list=(title,a,cls='')=>a&&a.length?`<h3>${title}</h3><ul class="qai-list ${cls}">${a.map(x=>`<li>${x}</li>`).join('')}</ul>`:'';
 function result(ai){
  if(!ai?.at)return '';
  const ok=(ai.verificacao||[]).filter(c=>c.estado==='incluido').length,na=(ai.verificacao||[]).filter(c=>c.estado!=='incluido');
  return `<div class="qai-result"><p><b>Orçamento preparado pela IA</b> · ${new Date(ai.at).toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${ai.linhas} linhas</p>${ai.resumo?`<p>${esc(ai.resumo)}</p>`:''}
  ${(ai.fontesEmFalta||[]).length?`<p class="qai-warn">Não encontrei os catálogos de ${esc(ai.fontesEmFalta.join(' / '))} neste dispositivo. Abra Definições › Fornecedores para os atualizar e gere de novo.</p>`:''}
  ${ai.semPreco?`<p class="qai-warn">${ai.semPreco} ${ai.semPreco===1?'linha ficou':'linhas ficaram'} sem preço (assinaladas a vermelho): não encontrei o produto nos fornecedores certos. Toque em «Escolher da tabela de preços» nessa linha: a app aprende e da próxima vez usa esse produto.</p>`:''}
  <p class="note">A última linha é a mão de obra: indique o valor que entender.</p>
  ${list('Dimensionamento',(ai.dimensionamento||[]).map(d=>`<b>${esc(d.titulo)}</b> — ${esc(d.detalhe)}`))}
  ${list('Pressupostos (confirme na visita)',(ai.pressupostos||[]).map(esc))}
  ${list('A confirmar com o cliente',(ai.perguntas||[]).map(esc))}
  ${list('Avisos técnicos',(ai.avisos||[]).map(esc),'qai-alerts')}
  ${(ai.verificacao||[]).length?`<details class="qai-check"><summary>Lista de verificação: ${ok} pontos incluídos${na.length?', '+na.length+' não aplicáveis':''}</summary><ul class="qai-list">${ai.verificacao.map(c=>`<li class="${c.estado==='incluido'?'ok':'na'}">${c.estado==='incluido'?'✓':'—'} ${esc(c.ponto)}${c.nota?` <small>(${esc(c.nota)})</small>`:''}</li>`).join('')}</ul></details>`:''}
  ${(ai.calculos||[]).length?`<details class="qai-check"><summary>Cálculos técnicos usados (${ai.calculos.length})</summary><ul class="qai-list">${ai.calculos.map(c=>`<li>${esc(c.nota)}</li>`).join('')}</ul></details>`:''}
  <p class="note">Reveja as linhas abaixo: pode alterar quantidades, trocar produtos ou apagar linhas como num orçamento normal.</p></div>`;
 }
 function labourHtml(){
  const src=sources(),n=Object.keys(S.iaAprendido||{}).length;
  return `<details class="qai-labour" ${st.labour?'open':''} data-qi-toggle="labour"><summary>Fornecedores e regras${n?' · '+n+' produto'+(n>1?'s':'')+' aprendido'+(n>1?'s':''):''}</summary><p class="note">Onde a IA vai buscar cada produto (nomes separados por vírgulas, como aparecem nas tabelas e catálogos).</p>${[['material','Material, acessórios, cabos e tubos'],['preco','Equipamentos · Melhor preço'],['media','Equipamentos · Equilíbrio'],['qualidade','Equipamentos · Máxima qualidade']].map(([k,t])=>`<label class="q-field"><span>${t}</span><input data-qi="fonte" data-k="${k}" value="${esc(src[k])}" maxlength="200"></label>`).join('')}${n?'<button type="button" class="link neg" data-qi="esquecer">Esquecer os produtos aprendidos</button>':''}<label class="q-field"><span>As suas regras (opcional)</span><textarea data-qi="regras" rows="3" maxlength="4000" placeholder="Ex.: por omissão 5 m de linha por split; exteriores sempre em suporte de parede; usar sempre bomba de condensados nos quartos">${esc(S.iaRegras||'')}</textarea></label></details>`;
 }
 root.aiSection=()=>{
  const q=quoteDraft;if(!q)return '';
  return `<h2>Orçamento automático com IA</h2><div class="q-card qai" id="qai-card"><p class="note">Descreva a obra como a explicaria a um técnico: divisões e áreas, onde fica a unidade exterior, distâncias, distância ao quadro elétrico, o que o cliente quer. A IA dimensiona, escolhe os equipamentos nos fornecedores da gama pedida e junta todo o material, acessórios, cabos e tubos da Sanipower e da Sanitop. A mão de obra fica numa linha no fim, para pôr o seu valor.</p><label class="q-field"><span>Pedido / notas da visita</span><textarea data-qi="texto" rows="6" maxlength="8000" placeholder="Ex.: Moradia T3 em Ponte de Lima, LG. Ar condicionado na sala (30 m², virada a sul) e nos 3 quartos (12, 12 e 10 m²). Multisplit com a exterior na varanda; linhas de 4, 7, 9 e 11 m. Quadro elétrico a 12 m. Sem esgoto nos quartos." ${st.busy?'disabled':''}>${esc(text(q))}</textarea></label><label class="q-field"><span>Gama dos equipamentos e materiais</span><select data-qi="gama">${[['','Sem preferência (o produto que melhor corresponde)'],['preco','Melhor preço (os mais baratos que cumprem)'],['media','Equilíbrio (gama média)'],['qualidade','Máxima qualidade (os melhores e mais caros)']].map(([k,t])=>`<option value="${k}" ${(q.gama||'')===k?'selected':''}>${t}</option>`).join('')}</select></label>${labourHtml()}<button type="button" class="btn" data-qi="gerar" ${st.busy||quoteBusy?'disabled':''}>${st.busy?'A preparar o orçamento…':q.ai?.at?'Gerar de novo com a IA':'Gerar orçamento com IA'}</button><div id="qai-status" aria-live="polite">${statusHtml()}</div>${st.busy?'':result(q.ai)}</div>`;
 };

 let saveT=null;const keep=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{if(typeof save==='function')save()},600)};
 function setRates(f){const L=labour().map(x=>({...x}));f(L);S.maoObra=L;keep()}
 document.addEventListener('input',e=>{
  const t=e.target,k=t.dataset?.qi;if(!k||!quoteDraft)return;
  if(k==='texto'){quoteDraft.ai={...(quoteDraft.ai||{}),texto:t.value};return}
  if(k==='gama'){quoteDraft.gama=t.value;return}
  if(k==='regras'){S.iaRegras=t.value;keep();return}
  if(k==='fonte'){S.iaFontes={...(S.iaFontes||{}),[t.dataset.k]:t.value};keep();return}
  const i=Number(t.dataset.i);
  if(k==='rate-nome')setRates(L=>{L[i].nome=t.value});
  if(k==='rate-preco')setRates(L=>{L[i].preco=Number(t.value)||0});
  if(k==='rate-unidade')setRates(L=>{L[i].unidade=t.value});
 });
 document.addEventListener('change',e=>{const t=e.target;if(t.dataset?.qi==='gama'&&quoteDraft){quoteDraft.gama=t.value;return}if(t.dataset?.qi==='rate-unidade'&&quoteDraft)setRates(L=>{L[Number(t.dataset.i)].unidade=t.value})});
 document.addEventListener('toggle',e=>{if(e.target.dataset?.qiToggle==='labour')st.labour=e.target.open},true);
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('button[data-qi]');if(!b||!quoteDraft)return;
  const k=b.dataset.qi;
  if(k==='gerar'){generate();return}
  if(k==='esquecer'){if(confirm('Esquecer todos os produtos aprendidos?')){S.iaAprendido={};keep();render()}return}
  if(k==='rate-add'){st.labour=true;setRates(L=>L.push({id:'mo'+Date.now().toString(36),nome:'',unidade:'un.',preco:0}));render();return}
  if(k==='rate-del'){st.labour=true;setRates(L=>L.splice(Number(b.dataset.i),1));render()}
 });
 Object.assign(root,{quoteAiFamily:family,quoteAiAllowed:allowed,quoteAiLearnKey:learnKey,quoteAiLearned:learned,quoteAiSearch:search,quoteAiAutoPick:autoPick,quoteAiBuildLines:buildLines,quoteAiLabour:labour,quoteAiLeadText:leadText});
})(globalThis);
