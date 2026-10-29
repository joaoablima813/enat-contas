/* Orçamento adjudicado → obra: o mesmo cliente, valor, custos previstos e plano 50/50.
   Usado pelo botão "Converter em obra" na app e pelo servidor quando o cliente adjudica no link. */
(function(root){
 const EQ=['Piso radiante','Ar condicionado','Bomba de calor climatização','Bomba de calor AQS','Ventiloconvectores','VMC','UPAC (fotovoltaico)','Solar térmico'];
 const r2=n=>Math.round(n*100)/100;
 function obraFromQuote(q,quoteId,id,today){
  const lines=(q.lines||[]).filter(l=>String(l.description||'').trim()||Number(l.value)),cost=f=>r2(lines.filter(f).reduce((s,l)=>s+Number(l.value||0)*Number(l.quantity??1),0));
  const subject=[(q.topics||[]).join(' + '),String(q.brand||'').trim()].filter(Boolean).join(' ');
  return {id,name:subject+' – '+String(q.client).trim(),client:String(q.client).trim(),status:'em_curso',valor:root.quoteTotals(q).total,phone:String(q.contact||'').trim(),email:String(q.email||'').trim(),address:String(q.address||'').trim(),nif:'',done:'',equip:(q.topics||[]).filter(t=>EQ.includes(t)),orc:quoteId,previsto:{mat:cost(l=>l.kind!=='Mão de obra'),mo:cost(l=>l.kind==='Mão de obra')},plano:root.EnatGestao.defaultPlan(today)};
 }
 root.EnatQuoteObra={EQ,obraFromQuote};
})(globalThis);
