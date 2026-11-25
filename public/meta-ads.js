/* Ecrã «Meta Ads» (Facebook/Instagram): gasto, leads e custo por lead de cada campanha, lidos da Meta de 2 em 2 horas.
   Períodos semana / mês / 3 meses / ano; tocar numa campanha mostra os gráficos só dessa campanha. Usa os gráficos do ecrã Google Ads. */
const MA={n:30,camp:'',data:{},loading:{},err:'',sync:false};
const maKey=()=>MA.n+'|'+MA.camp;
async function maFetch(){
 const k=maKey();if(MA.loading[k])return;MA.loading[k]=true;MA.err='';
 try{
  const r=await fetch('/.netlify/functions/meta-ads?dias='+MA.n+(MA.camp?'&campanha='+encodeURIComponent(MA.camp):''),{headers:{'x-session':SESS()},cache:'no-store'});
  if(r.status===401){if(typeof bloquear==='function')bloquear();throw new Error('Sessão terminada. Entre de novo.')}
  if(!r.ok)throw new Error('Não foi possível ler os dados da Meta.');
  MA.data[k]={...(await r.json()),_t:Date.now()};
 }catch(e){MA.err=e.message||'Sem ligação ao servidor.'}
 MA.loading[k]=false;if(V.tab==='mads'&&idle())render();
}
async function maSync(){
 if(MA.sync)return;MA.sync=true;MA.err='';render();
 try{
  const r=await fetch('/.netlify/functions/meta-ads',{method:'POST',headers:{'x-session':SESS()}});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw new Error(j.erro||'Não foi possível sincronizar com a Meta.');
  MA.data={};
 }catch(e){MA.err=e.message}
 MA.sync=false;render();
}
const maEstado=e=>({ACTIVE:['Ativa','pos'],PAUSED:['Pausada',''],CAMPAIGN_PAUSED:['Pausada',''],ARCHIVED:['Arquivada',''],DELETED:['Apagada',''],WITH_ISSUES:['Com problemas','neg'],IN_PROCESS:['Em revisão',''],PENDING_REVIEW:['Em revisão','']}[e]||[e?String(e).toLowerCase():'—','']);
const maGrafico=dias=>{const m=dias[0]?.rot?'mês':'dia';return `<div class="ga-charts">${gaBarras(dias,'custo','Gasto por '+m,v=>eur(v),'ga-cus',v=>v.toLocaleString('pt-PT',{maximumFractionDigits:1})+' €')}${gaBarras(dias,'leads','Leads por '+m,gaNum,'ga-cli')}</div>`};
function vMetaAds(){
 const k=maKey(),d=MA.data[k];
 if((!d||Date.now()-d._t>5*60e3)&&!MA.loading[k]&&!MA.err)maFetch();
 const seg=`<div class="seg">${GA_PER.map(([n,l])=>`<button class="${MA.n===n?'on':''}" data-ma="n" data-id="${n}">${l}</button>`).join('')}</div>`;
 const head=`<button class="back" data-a="tab" data-id="camp">${ic('back')}Campanhas</button><h1>Meta Ads</h1>`;
 if(!d)return head+seg+`<div class="grp"><div class="empty">${esc(MA.err||'A carregar…')}</div></div>`;
 if(!d.ligado)return head+`<div class="grp"><div class="empty">A conta de anúncios da Meta ainda não está ligada à app.</div></div>`;
 if(!d.atualizadoEm)return head+seg+`<div class="grp"><div class="empty">${esc(MA.err||'A aguardar a primeira sincronização com a Meta')}</div></div><button class="btn alt" data-ma="sync" ${MA.sync?'disabled':''}>${MA.sync?'A sincronizar…':'Sincronizar agora'}</button>`;
 const r=d.resumo||{},sel=(d.campanhas||[]).find(c=>c.id===MA.camp);
 const card=(l,v,sub,cls='')=>`<div class="dash-k ${cls}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
 const linha=c=>{const [e,ec]=maEstado(c.estado);return `<button class="row ma-camp${c.id===MA.camp?' on':''}" data-ma="camp" data-id="${esc(c.id)}"><div class="rt"><b>${esc(c.nome)}</b><span><em class="ma-st ${ec}">${esc(e)}</em>${c.orcamentoDia?' · '+eur(c.orcamentoDia)+'/dia':''} · ${gaNum(c.leads)} leads</span></div><div class="rr ma-num"><b>${eur(c.custo)}</b><small>${c.custoPorLead==null?'sem leads':eur(c.custoPorLead)+' / lead'}</small></div></button>`};
 const camps=d.campanhas||[];
 return head+`<p class="sub" style="margin:-6px 4px 12px">Atualizado em ${esc(gaQuando(d.atualizadoEm))} · sincroniza sozinho de 2 em 2 horas · <a href="#" data-ma="sync">${MA.sync?'a sincronizar…':'atualizar agora'}</a></p>`+
 (MA.err?`<p class="sub neg" style="margin:0 4px 10px">${esc(MA.err)}</p>`:'')+seg+
 `<div class="dash-ks ga-ks">
  ${card(sel?'Gasto · '+esc(sel.nome):'Gasto do período',eur(r.custo||0),gaNum(r.impressoes)+' impressões')}
  ${card('Leads',gaNum(r.leads),'formulários da Meta','pos')}
  ${card('Custo por lead',r.custoPorLead==null?'—':eur(r.custoPorLead),'gasto ÷ leads',r.custoPorLead==null?'':'warn')}
  ${card('Cliques',gaNum(r.cliques),r.cliques&&r.custo?eur(r.custo/r.cliques)+' por clique':'')}
 </div>
 <h2>Campanhas${MA.camp?` <button class="ma-all" data-ma="camp" data-id="">ver todas</button>`:''}</h2>
 <div class="grp">${camps.length?camps.map(linha).join(''):'<div class="empty">Sem gasto neste período</div>'}</div>
 <p class="sub" style="margin:4px 4px 12px">${MA.camp?'Gráficos só desta campanha. Toque de novo para ver todas.':'Toque numa campanha para ver os gráficos só dela.'}</p>
 ${maGrafico(gaSerie(gaPeriodo(d.dias,MA.n),MA.n))}`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-ma]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 const a=b.dataset.ma;
 if(a==='n'){MA.n=+b.dataset.id;MA.err='';render()}
 else if(a==='camp'){MA.camp=MA.camp===b.dataset.id?'':b.dataset.id;MA.err='';render()}
 else if(a==='sync')maSync();
});

// Separador «Campanhas»: entrada para o Google Ads e para a Meta Ads (cada um no seu ecrã).
function vCampanhas(){
 const row=(id,t,s)=>`<button class="row kv ga-entry" data-a="tab" data-id="${id}"><div class="rt"><b>${t}</b><span>${s}</span></div><div class="rr">${ic('chev')}</div></button>`;
 return '<h1>Campanhas</h1><p class="sub" style="margin:-6px 4px 14px">Quanto gasta e o que rende cada campanha de publicidade.</p>'+
  row('gads','Google Ads','Pesquisa no Google: custo, cliques, chamadas e contactos')+
  row('mads','Meta Ads','Facebook e Instagram: gasto, leads e custo por lead de cada campanha');
}
