/* Ecrã «Google Ads»: resultados das campanhas enviados pelo script do Google Ads para /.netlify/functions/ads-metrics.
   Cartões do período (7, 30 ou 90 dias), gráfico de custo e cliques por dia e a data da última sincronização. */
const GA={n:30,data:{},loading:{},err:''};
async function gaFetch(n){
 if(GA.loading[n])return;GA.loading[n]=true;GA.err='';
 try{
  const r=await fetch('/.netlify/functions/ads-metrics?dias='+n,{headers:{'x-session':SESS()},cache:'no-store'});
  if(r.status===401){if(typeof bloquear==='function')bloquear();throw new Error('Sessão terminada. Entre de novo.')}
  if(!r.ok)throw new Error('Não foi possível ler os dados do Google Ads.');
  GA.data[n]={...(await r.json()),_t:Date.now()};
 }catch(e){GA.err=e.message||'Sem ligação ao servidor.'}
 GA.loading[n]=false;if(V.tab==='gads'&&idle())render();
}
const gaNum=v=>Number(v||0).toLocaleString('pt-PT',{maximumFractionDigits:0});
const gaDia=s=>String(s||'').slice(8,10)+'/'+String(s||'').slice(5,7);
const gaQuando=t=>{const d=new Date(t);return isNaN(d)?String(t||''):d.toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' às')};
// Barras: custo por dia; linha: cliques (cada um na sua escala).
function gaGrafico(dias){
 const W=600,H=160,n=dias.length,bw=W/n,mc=Math.max(1,...dias.map(d=>+d.custo||0)),mk=Math.max(1,...dias.map(d=>+d.cliques||0));
 const bars=dias.map((d,i)=>{const h=(+d.custo||0)/mc*(H-8);return `<rect x="${(i*bw+bw*.15).toFixed(1)}" y="${(H-h).toFixed(1)}" width="${(bw*.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="ga-bar"><title>${esc(gaDia(d.data))}: ${esc(eur(+d.custo||0))} · ${gaNum(d.cliques)} cliques</title></rect>`}).join('');
 const line=dias.map((d,i)=>`${(i*bw+bw/2).toFixed(1)},${(H-(+d.cliques||0)/mk*(H-8)).toFixed(1)}`).join(' ');
 const lab=[0,Math.floor((n-1)/2),n-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>`<span>${esc(gaDia(dias[i].data))}</span>`).join('');
 return `<div class="chart ga-chart"><div class="dash-h"><b>Custo e cliques por dia</b><div class="legend"><span><b class="ga-k-c"></b>Custo</span><span><b class="ga-k-k"></b>Cliques</span></div></div>
 <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Custo e cliques por dia">${bars}<polyline points="${line}" class="ga-line"/></svg>
 <div class="cols-l ga-l">${lab}</div></div>`;
}
function vGoogleAds(){
 const n=GA.n,d=GA.data[n];
 if((!d||Date.now()-d._t>5*60e3)&&!GA.loading[n]&&!GA.err)gaFetch(n);
 const seg=`<div class="seg">${[7,30,90].map(k=>`<button class="${n===k?'on':''}" data-ga="n" data-id="${k}">${k} dias</button>`).join('')}</div>`;
 const head=`<button class="back" data-a="tab" data-id="anu">${ic('back')}Anúncios</button><h1>Google Ads</h1>`;
 if(!d)return head+seg+`<div class="grp"><div class="empty">${esc(GA.err||'A carregar…')}</div></div>`;
 if(!(d.dias||[]).length)return head+seg+`<div class="grp"><div class="empty">A aguardar a primeira sincronização do Google Ads</div></div>`;
 const r=d.resumo||{};
 const card=(l,v,sub,cls='')=>`<div class="dash-k ${cls}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
 return head+`<p class="sub" style="margin:-6px 4px 12px">Atualizado em ${esc(gaQuando(d.atualizadoEm))}${d.conta?' · conta '+esc(d.conta):''}</p>`+seg+
 `<div class="dash-ks ga-ks">
  ${card('Custo do período',eur(r.custo||0),gaNum(r.impressoes)+' impressões')}
  ${card('Cliques',gaNum(r.cliques),r.cliques&&r.custo?eur(r.custo/r.cliques)+' por clique':'')}
  ${card('Toques em «Ligar»',gaNum(r.cliquesChamada),'chamadas a partir do anúncio','pos')}
  ${card('Pedidos de orçamento',gaNum(r.pedidosOrcamento),'formulário do site','pos')}
  ${card('Contactos',gaNum(r.contactos),'telefone, email e WhatsApp no site','pos')}
  ${card('Custo por contacto',r.custoPorLead==null?'—':eur(r.custoPorLead),'pedidos + contactos',r.custoPorLead==null?'':'warn')}
 </div>${gaGrafico(d.dias)}`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-ga]');if(!b)return;e.stopImmediatePropagation();
 if(b.dataset.ga==='n'){GA.n=+b.dataset.id;GA.err='';render()}
});
