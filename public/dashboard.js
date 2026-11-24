// Painel do Início: os números do negócio num relance (este mês, este ano, por receber, obras, leads e orçamentos),
// o gráfico dos últimos 12 meses e o funil das leads. Cada cartão abre a página respetiva.
function dashHtml(){
 const hoje=today(),mes=EnatGestao.period('mes',hoje),ano=EnatGestao.period('ano',hoje);
 const rm=EnatGestao.report(S,mes.from,mes.to),ra=EnatGestao.report(S,ano.from,ano.to);
 const ativas=all().filter(c=>c.o.status!=='orcamento'),porRec=ativas.reduce((s,c)=>s+Math.max(0,c.porRec),0);
 const emCurso=S.obras.filter(o=>o.status==='em_curso').length;
 const leads=S.leads||[],novas=leads.filter(l=>typeof leadIsNew==='function'?leadIsNew(l):(l.stage||'nova')==='nova').length;
 const rows=quoteRows||[],est=r=>quoteState(r.document),tot=r=>{try{return quoteTotals(r.document).total}catch{return 0}};
 const espera=rows.filter(r=>est(r)==='enviado'),aceites=rows.filter(r=>est(r)==='aceite').length,recus=rows.filter(r=>est(r)==='recusado').length;
 const taxa=aceites+recus?aceites/(aceites+recus)*100:null;
 const material=S.obras.filter(o=>o.status!=='concluida').reduce((n,o)=>n+(o.material||[]).filter(m=>m.estado!=='chegou').length,0);
 const card=(l,v,sub,tab,cls='')=>`<button class="dash-k ${cls}" data-a="tab" data-id="${tab}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</button>`;
 const ms=EnatGestao.months(S,hoje),mx=Math.max(1,...ms.map(m=>Math.max(m.rec,m.custos)));
 const st=Object.entries(typeof LEAD_STAGES==='object'?LEAD_STAGES:{}).map(([k,l])=>[l,leads.filter(x=>(x.stage||'nova')===k).length,k]).filter(x=>x[1]);
 const smx=Math.max(1,...st.map(x=>x[1]));
 return `<section class="dash" aria-label="Painel">
 <div class="dash-ks">
  ${card('Recebido este mês',eur(rm.recBase),'s/ IVA · '+esc(mes.label),'rel')}
  ${card('Resultado do mês',sg(rm.lucro),rm.recBase?pc(rm.margem)+' de margem':'sem recebimentos','rel',rm.lucro<0?'neg':'pos')}
  ${card('Recebido este ano',eur(ra.recBase),'s/ IVA · resultado '+sg(ra.lucro),'rel')}
  ${card('Por receber',eur(porRec),'c/ IVA, das obras','obras','warn')}
  ${card('Obras em curso',String(emCurso),material?material+' artigo'+(material>1?'s':'')+' de material por chegar':'material todo chegou',material?'enc':'obras')}
  ${card('Leads novas',String(novas),leads.length+' leads no total','leads',novas?'hot':'')}
  ${card('Orçamentos à espera',String(espera.length),espera.length?eur(espera.reduce((s,r)=>s+tot(r),0))+' em propostas':(quoteRows===null?'a carregar…':'nenhum por responder'),'orc')}
  ${card('Taxa de aceitação',taxa==null?'—':pc(taxa),aceites+' aceites · '+recus+' recusados','orc')}
 </div>
 <div class="dash-g">
  <div class="chart"><div class="dash-h"><b>Últimos 12 meses</b><div class="legend"><span><b class="cr"></b>Recebido</span><span><b class="cc"></b>Custos</span></div></div><div class="cols" role="img" aria-label="Recebido e custos por mês nos últimos 12 meses">${ms.map(m=>`<div title="${esc(m.label)}: recebido ${eur(m.rec)}, custos ${eur(m.custos)}"><i class="cr" style="height:${m.rec/mx*100}%"></i><i class="cc" style="height:${m.custos/mx*100}%"></i></div>`).join('')}</div><div class="cols-l">${ms.map(m=>`<span>${esc(m.label)}</span>`).join('')}</div></div>
  <div class="chart"><div class="dash-h"><b>Leads por fase</b></div>${st.length?st.map(([l,n,k])=>`<button class="dash-f lead-${esc(k)}" data-a="tab" data-id="leads"><span>${esc(l)}</span><i><em style="width:${Math.max(4,n/smx*100)}%"></em></i><b>${n}</b></button>`).join(''):'<p class="note">Ainda sem leads.</p>'}</div>
 </div>
 </section>`;
}
