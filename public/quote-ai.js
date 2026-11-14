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
 const st=root.QUOTE_AI={busy:false,phase:'',error:'',labour:false,draft:null};
 const labour=()=>Array.isArray(S.maoObra)&&S.maoObra.length?S.maoObra:LABOUR.map(x=>({...x}));
 const n2=n=>String(Math.round(n*100)/100).replace('.',',');

 // Texto inicial a partir da lead: divisões, área, notas e o que o cliente pediu.
 function leadText(q){
  const l=q?.lead&&(S.leads||[]).find(x=>x.id===q.lead);if(!l)return '';
  return [l.rooms&&'Divisões: '+l.rooms,l.area&&'Área: '+l.area,Array.isArray(l.solutions)&&l.solutions.length&&'Soluções pedidas: '+l.solutions.join(', '),l.heating&&'Aquecimento de água atual: '+l.heating,l.bill&&'Fatura elétrica: '+l.bill,l.notes].filter(Boolean).join('\n');
 }
 const text=q=>q.ai?.texto??leadText(q);

 // Marcas e famílias disponíveis, para a IA propor equipamentos que existem nas tabelas.
 function catalogSummary(){
  const out=[];
  for(const t of quoteTables()){
   if(t.invoices)continue;
   const fam=new Map();for(const p of t.products){const k=p.group.slice(0,t.live?2:3).join(' › ');fam.set(k,(fam.get(k)||0)+1)}
   out.push(`${t.live?'Fornecedor online (material, acessórios, cobre, cabos, tubagem)':t.brand}: `+[...fam].sort((a,b)=>b[1]-a[1]).slice(0,t.live?25:40).map(([k])=>k).join('; '));
  }
  return out.join('\n').slice(0,12000);
 }

 // Procura local: todas as tabelas, catálogos e faturas, com os termos de pesquisa da IA.
 const words=s=>quoteNorm(String(s||'').replace(/(\d),(\d)/g,'$1.$2')).split(/[\s"']+/).filter(w=>w&&!['de','do','da','para','com','p/','e','c/'].includes(w));
 const HAY=new WeakMap();
 function hay(t,p){let h=HAY.get(p);if(h===undefined){h=quoteNorm([t.invoices?'fatura':t.brand,p.maker,p.ref,p.name,...p.group].join(' ')).replace(/(\d),(\d)/g,'$1.$2');HAY.set(p,h)}return h}
 function search(item,brand,tables=quoteTables()){
  const qs=[...(item.pesquisa||[]),item.descricao].map(words).filter(w=>w.length),b=quoteNorm(brand),found=[];
  if(!qs.length)return [];
  tables.forEach((t,ti)=>t.products.forEach((p,pi)=>{
   const h=hay(t,p);let best=0;
   qs.forEach((ws,k)=>{const m=ws.filter(w=>h.includes(w)).length;if(m<Math.min(2,ws.length))return;const r=m/ws.length-(k?0.03*k:0);if(r>best)best=r});
   if(best<0.6)return;
   let s=best;if(b&&item.categoria==='Equipamento'&&h.includes(b))s+=0.2;if(item.tipologia&&p.group[0]===item.tipologia)s+=0.05;if(t.invoices)s+=0.03;if(p.est)s-=0.02;if(t.live&&p.stock===0)s-=0.05;
   found.push({ti,pi,s});
  }));
  found.sort((x,y)=>y.s-x.s);
  const seen=new Set(),out=[];
  for(const f of found){const t=tables[f.ti],p=t.products[f.pi],k=quoteNorm(p.name+'|'+(p.ref||''));if(seen.has(k))continue;seen.add(k);out.push(f);if(out.length>=8)break}
  return out;
 }
 const candidate=(t,p)=>({nome:p.name+(p.model&&!String(p.name).includes(p.model)?' – '+p.model:''),ref:p.ref||'',marca:t.invoices?'(última fatura)':t.live?p.maker||'':t.brand,grupo:p.group.join(' › '),preco:priceNet(t,p)});

 // Pedido ao servidor e espera pelo resultado da função em segundo plano.
 async function job(path,body,q){
  const r=await API('orcamento-ia/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.id)throw Error(d.error||'Não foi possível contactar a IA.');
  for(let i=0;i<300;i++){
   await new Promise(res=>setTimeout(res,i<5?1500:2500));
   if(quoteDraft!==q)throw Error('cancelado');
   const s=await API('orcamento-ia/pedido/'+d.id).then(r=>r.json()).catch(()=>null);
   if(!s)continue;
   if(s.status==='pronto')return s.resultado;
   if(s.status==='erro')throw Error(s.erro||'A IA não conseguiu preparar o orçamento.');
   if(s.progresso&&s.progresso!==st.phase){st.phase=s.progresso;paint()}
  }
  throw Error('A IA demorou demasiado. Tente novamente.');
 }
 const paint=()=>{const el=document.querySelector('#qai-status');if(el)el.innerHTML=statusHtml();else if(typeof render==='function')render()};
 const statusHtml=()=>st.busy?`<p class="note qai-busy"><span class="qai-spin"></span>${esc(st.phase||'A trabalhar…')}</p>`:st.error?`<p class="note neg">${esc(st.error)}</p>`:'';

 // Linhas do orçamento a partir do plano e das escolhas: preço das tabelas ou da mão de obra; o resto fica "sem preço".
 function buildLines(plan,picks,found,rates){
  const tables=quoteTables(),lines=[],live=[];
  for(const it of plan.itens){
   if(it.categoria==='Mão de obra'){
    const r=rates.find(x=>x.id===it.mao_obra),v=it.preco_indicado??(r&&Number(r.preco)>0?Number(r.preco):0);
    lines.push({kind:'Mão de obra',description:it.descricao,quantity:it.quantidade,unit:r?.unidade&&!it.preco_indicado?r.unidade:it.unidade,value:v,...(v?{}:{semPreco:true})});continue;
   }
   const e=picks[it.id],c=e&&e.candidato!=null?found[it.id]?.[e.candidato]:null;
   if(c){const t=tables[c.ti],p=t.products[c.pi],l=quoteCatalogLine(t,p);l.kind=it.categoria;l.quantity=e.quantidade||it.quantidade;if(e.unidade)l.unit=e.unidade;else if(l.unit==='un.'&&it.unidade!=='un.'&&/\b(ml|metro|ao metro|\/m)\b/i.test(p.name))l.unit=it.unidade;lines.push(l);if(t.live)live.push([t,p,l]);continue}
   lines.push({kind:it.categoria,description:it.descricao+(it.especificacao&&!it.descricao.includes(it.especificacao)?' – '+it.especificacao:''),quantity:it.quantidade,unit:it.unidade,value:it.preco_indicado||0,...(it.preco_indicado?{}:{semPreco:true})});
  }
  return {lines,live};
 }

 async function generate(){
  const q=quoteDraft;if(!q||st.busy)return;
  const box=document.querySelector('[data-qi="texto"]'),texto=(box?box.value:text(q)).trim();
  if(texto.length<10){st.error='Descreva a obra: divisões e áreas, distâncias, onde fica a exterior, o que o cliente quer.';paint();return}
  const hasLines=q.lines.some(l=>!quoteLineBlank(l));
  let mode='replace';if(hasLines)mode=confirm('O orçamento já tem linhas. OK substitui-as pelo orçamento da IA; Cancelar acrescenta as linhas da IA no fim.')?'replace':'append';
  q.ai={...(q.ai||{}),texto};st.busy=true;st.error='';st.phase='A enviar o pedido…';render();
  try{
   const rates=labour();
   const plan=await job('planear',{texto,tipologias:q.topics,marca:q.brand,morada:q.address,maoObra:rates,regras:S.iaRegras||'',catalogo:catalogSummary()},q);
   st.phase='A procurar os produtos nas tabelas de preços…';paint();
   const found={},items=[];
   for(const it of plan.itens){if(it.categoria==='Mão de obra')continue;await new Promise(r=>setTimeout(r,0));const f=search(it,q.brand||plan.marca);found[it.id]=f;if(f.length)items.push({id:it.id,descricao:it.descricao,especificacao:it.especificacao,quantidade:it.quantidade,unidade:it.unidade,candidatos:f.map(c=>{const t=quoteTables()[c.ti];return candidate(t,t.products[c.pi])})})}
   const picks={};
   if(items.length){const r=await job('escolher',{marca:q.brand||plan.marca,itens:items},q);for(const e of r.escolhas||[])picks[e.id]=e}
   if(quoteDraft!==q)return;
   const {lines,live}=buildLines(plan,picks,found,rates);
   q.lines=mode==='replace'?lines:[...q.lines.filter(l=>!quoteLineBlank(l)),...lines];
   q.topics=[...new Set([...q.topics,...plan.tipologias])];
   if(!String(q.brand||'').trim()&&plan.marca)q.brand=plan.marca;
   const noPrice=lines.filter(l=>l.semPreco).length;
   q.ai={texto,at:new Date().toISOString(),resumo:plan.resumo,dimensionamento:plan.dimensionamento,pressupostos:plan.pressupostos,perguntas:plan.perguntas,avisos:plan.avisos||[],verificacao:plan.verificacao,calculos:plan.calculos||[],linhas:lines.length,semPreco:noPrice};
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
  ${ai.semPreco?`<p class="qai-warn">${ai.semPreco} ${ai.semPreco===1?'linha ficou':'linhas ficaram'} sem preço (assinaladas a vermelho): o produto não está nas tabelas ou falta o valor na tabela de mão de obra. Indique o custo antes de enviar.</p>`:''}
  ${list('Dimensionamento',(ai.dimensionamento||[]).map(d=>`<b>${esc(d.titulo)}</b> — ${esc(d.detalhe)}`))}
  ${list('Pressupostos (confirme na visita)',(ai.pressupostos||[]).map(esc))}
  ${list('A confirmar com o cliente',(ai.perguntas||[]).map(esc))}
  ${list('Avisos do revisor técnico',(ai.avisos||[]).map(esc),'qai-alerts')}
  ${(ai.verificacao||[]).length?`<details class="qai-check"><summary>Lista de verificação: ${ok} pontos incluídos${na.length?', '+na.length+' não aplicáveis':''}</summary><ul class="qai-list">${ai.verificacao.map(c=>`<li class="${c.estado==='incluido'?'ok':'na'}">${c.estado==='incluido'?'✓':'—'} ${esc(c.ponto)}${c.nota?` <small>(${esc(c.nota)})</small>`:''}</li>`).join('')}</ul></details>`:''}
  ${(ai.calculos||[]).length?`<details class="qai-check"><summary>Cálculos técnicos usados (${ai.calculos.length})</summary><ul class="qai-list">${ai.calculos.map(c=>`<li>${esc(c.nota)}</li>`).join('')}</ul></details>`:''}
  <p class="note">Reveja as linhas abaixo: pode alterar quantidades, trocar produtos ou apagar linhas como num orçamento normal.</p></div>`;
 }
 function labourHtml(){
  const L=labour(),set=L.filter(x=>Number(x.preco)>0).length;
  return `<details class="qai-labour" ${st.labour?'open':''} data-qi-toggle="labour"><summary>Preços de mão de obra (${set} de ${L.length} com valor)</summary><p class="note">Custo sem IVA por unidade. A IA usa estes valores em cada trabalho; se escrever um valor no pedido (ex.: «mão de obra do split 180 €») esse prevalece.</p>${L.map((m,i)=>`<div class="qai-rate"><input type="text" data-qi="rate-nome" data-i="${i}" value="${esc(m.nome)}" maxlength="120" aria-label="Trabalho"><select data-qi="rate-unidade" data-i="${i}" aria-label="Unidade">${UNITS.map(u=>`<option ${u===m.unidade?'selected':''}>${u}</option>`).join('')}</select><input type="number" data-qi="rate-preco" data-i="${i}" value="${Number(m.preco)>0?m.preco:''}" min="0" step="0.01" inputmode="decimal" placeholder="€" aria-label="Preço"><button type="button" class="link neg" data-qi="rate-del" data-i="${i}" aria-label="Remover">✕</button></div>`).join('')}<button type="button" class="link" data-qi="rate-add">+ Acrescentar trabalho</button><label class="q-field"><span>As suas regras (opcional)</span><textarea data-qi="regras" rows="3" maxlength="4000" placeholder="Ex.: por omissão 5 m de linha por split; exteriores sempre em suporte de parede; usar sempre bomba de condensados nos quartos">${esc(S.iaRegras||'')}</textarea></label></details>`;
 }
 root.aiSection=()=>{
  const q=quoteDraft;if(!q)return '';
  return `<h2>Orçamento automático com IA</h2><div class="q-card qai" id="qai-card"><p class="note">Descreva a obra como a explicaria a um técnico: divisões e áreas, onde fica a unidade exterior, distâncias, distância ao quadro elétrico, o que o cliente quer. A IA dimensiona, escolhe os equipamentos e junta todo o material, acessórios e mão de obra com os preços das suas tabelas.</p><label class="q-field"><span>Pedido / notas da visita</span><textarea data-qi="texto" rows="6" maxlength="8000" placeholder="Ex.: Moradia T3 em Ponte de Lima, LG. Ar condicionado na sala (30 m², virada a sul) e nos 3 quartos (12, 12 e 10 m²). Multisplit com a exterior na varanda; linhas de 4, 7, 9 e 11 m. Quadro elétrico a 12 m. Sem esgoto nos quartos." ${st.busy?'disabled':''}>${esc(text(q))}</textarea></label>${labourHtml()}<button type="button" class="btn" data-qi="gerar" ${st.busy||quoteBusy?'disabled':''}>${st.busy?'A preparar o orçamento…':q.ai?.at?'Gerar de novo com a IA':'Gerar orçamento com IA'}</button><div id="qai-status" aria-live="polite">${statusHtml()}</div>${st.busy?'':result(q.ai)}</div>`;
 };

 let saveT=null;const keep=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{if(typeof save==='function')save()},600)};
 function setRates(f){const L=labour().map(x=>({...x}));f(L);S.maoObra=L;keep()}
 document.addEventListener('input',e=>{
  const t=e.target,k=t.dataset?.qi;if(!k||!quoteDraft)return;
  if(k==='texto'){quoteDraft.ai={...(quoteDraft.ai||{}),texto:t.value};return}
  if(k==='regras'){S.iaRegras=t.value;keep();return}
  const i=Number(t.dataset.i);
  if(k==='rate-nome')setRates(L=>{L[i].nome=t.value});
  if(k==='rate-preco')setRates(L=>{L[i].preco=Number(t.value)||0});
  if(k==='rate-unidade')setRates(L=>{L[i].unidade=t.value});
 });
 document.addEventListener('change',e=>{const t=e.target;if(t.dataset?.qi==='rate-unidade'&&quoteDraft)setRates(L=>{L[Number(t.dataset.i)].unidade=t.value})});
 document.addEventListener('toggle',e=>{if(e.target.dataset?.qiToggle==='labour')st.labour=e.target.open},true);
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('button[data-qi]');if(!b||!quoteDraft)return;
  const k=b.dataset.qi;
  if(k==='gerar'){generate();return}
  if(k==='rate-add'){st.labour=true;setRates(L=>L.push({id:'mo'+Date.now().toString(36),nome:'',unidade:'un.',preco:0}));render();return}
  if(k==='rate-del'){st.labour=true;setRates(L=>L.splice(Number(b.dataset.i),1));render()}
 });
 Object.assign(root,{quoteAiSearch:search,quoteAiBuildLines:buildLines,quoteAiLabour:labour,quoteAiLeadText:leadText});
})(globalThis);
