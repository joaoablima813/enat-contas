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
// Gráficos por dia: um para o custo e outro para os cliques, cada um com a sua escala (nunca dois eixos no mesmo gráfico).
// Barras em HTML (não esticam), eixo com valores redondos, datas espaçadas e o valor do dia ao passar o rato ou tocar.
const gaTopo=v=>{if(!(v>0))return 1;const p=10**Math.floor(Math.log10(v)),m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p};
function gaBarras(dias,campo,titulo,fmt,cls,fmtEixo=fmt){
 const n=dias.length,vals=dias.map(d=>Math.max(0,+d[campo]||0)),top=gaTopo(Math.max(...vals)),tot=vals.reduce((a,b)=>a+b,0);
 const passo=Math.max(1,Math.ceil(n/6)),marcas=dias.map((d,i)=>i%passo===0||i===n-1?i:-1).filter(i=>i>=0);
 if(marcas.length>1&&marcas.at(-1)-marcas.at(-2)<passo*.9)marcas.splice(-2,1);
 const cols=dias.map((d,i)=>{const v=vals[i],h=v/top*100,txt=esc(gaDia(d.data))+': '+(d.vazio?'sem dados':esc(fmt(v)));
  return `<div class="ga-c${i>=n/2?' r':''}" tabindex="0" aria-label="${txt}"><i class="${cls}" style="height:${v?Math.max(1.5,h).toFixed(2):0}%"></i><em>${txt}</em></div>`}).join('');
 const eixo=[top,top/2,0].map(v=>`<span>${esc(fmtEixo(v))}</span>`).join('');
 const datas=marcas.map(i=>`<span style="${i===0?'left:0;transform:none':i===n-1?'left:100%;transform:translateX(-100%)':'left:'+((i+.5)/n*100).toFixed(2)+'%'}">${esc(gaDia(dias[i].data))}</span>`).join('');
 return `<div class="chart ga-chart"><div class="dash-h"><b>${titulo}</b><span class="ga-tot">Total: <b>${esc(fmt(tot))}</b></span></div>
 <div class="ga-plot"><div class="ga-y">${eixo}</div><div class="ga-area"><div class="ga-grid"><i></i><i></i><i></i></div><div class="ga-cols${n>45?' fino':n>14?' med':''}">${cols}</div></div><span></span><div class="ga-x">${datas}</div></div></div>`;
}
const gaPeriodo=(dias,n)=>{
 const by=new Map(dias.map(d=>[d.data,d])),ontem=new Date(Date.now()-864e5).toISOString().slice(0,10);
 const fim=[ontem,...dias.map(d=>d.data)].sort().at(-1),t=Date.parse(fim+'T12:00:00Z'),out=[];
 for(let i=n-1;i>=0;i--){const k=new Date(t-i*864e5).toISOString().slice(0,10);out.push(by.get(k)||{data:k,vazio:true})}
 return out;
};
const gaGrafico=dias=>`<div class="ga-charts">${gaBarras(dias,'custo','Custo por dia',v=>eur(v),'ga-cus',v=>v.toLocaleString('pt-PT',{maximumFractionDigits:1})+' €')}${gaBarras(dias,'cliques','Cliques por dia',gaNum,'ga-cli')}</div>`;
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
 </div>${gaGrafico(gaPeriodo(d.dias,n))}`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-ga]');if(!b)return;e.stopImmediatePropagation();
 if(b.dataset.ga==='n'){GA.n=+b.dataset.id;GA.err='';render()}
});
