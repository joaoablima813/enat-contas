/* Gestão: plano de pagamentos, relatórios por período, clientes e pesquisa global. Funções puras, sem acesso ao ecrã. */
(function(root){
 const r2=n=>Math.round((Number(n)||0)*100)/100;
 const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 const IBAN='PT50 0007 0000 0088 6037 7712 3';
 const defaultPlan=today=>[{desc:'Adjudicação',pct:50,date:today},{desc:'Conclusão da obra',pct:50,date:''}];
 // O valor recebido paga as prestações por ordem. A última prestação sem data vence na conclusão da obra.
 function planStatus(o,received,today){
  const plan=o.plano||[];let left=r2(received);
  const items=plan.map((m,i)=>{
   const amount=r2((Number(o.valor)||0)*(Number(m.pct)||0)/100),date=m.date||(i===plan.length-1?o.done||'':'');
   const paid=r2(Math.min(left,amount));left=r2(left-paid);
   return{...m,amount,date,paid,missing:r2(amount-paid),state:paid>=amount-.005?'pago':date&&date<=today?'atraso':'pendente'};
  });
  return{items,overdue:r2(items.filter(x=>x.state==='atraso').reduce((s,x)=>s+x.missing,0)),next:items.find(x=>x.state!=='pago')||null};
 }
 const reminder=(o,m)=>`Olá ${o.client}, esperamos que esteja tudo bem. Lembramos que está pendente o pagamento de ${m.missingText} referente a «${m.desc}» da obra ${o.name}${m.date?', com vencimento a '+m.date.split('-').reverse().join('/'):''}. Pode fazer a transferência para o IBAN ${IBAN}. Se já tiver pago, ignore esta mensagem. Obrigado! Enat - Energias`;

 // Períodos dos relatórios, sempre com datas AAAA-MM-DD.
 const iso=(y,m,d)=>new Date(Date.UTC(y,m,d)).toISOString().slice(0,10);
 const MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 function period(kind,today){
  const y=+today.slice(0,4),m=+today.slice(5,7)-1,q=Math.floor(m/3)*3;
  const month=(y,m)=>{const d=new Date(Date.UTC(y,m,1));return{from:iso(y,m,1),to:iso(y,m+1,0),label:MES[d.getUTCMonth()]+' de '+d.getUTCFullYear()}};
  const quarter=(y,q)=>{const d=new Date(Date.UTC(y,q,1)),n=d.getUTCMonth()/3+1;return{from:iso(y,q,1),to:iso(y,q+3,0),label:n+'.º trimestre de '+d.getUTCFullYear()}};
  if(kind==='mes_ant')return month(y,m-1);
  if(kind==='tri')return quarter(y,q);
  if(kind==='tri_ant')return quarter(y,q-3);
  if(kind==='ano')return{from:iso(y,0,1),to:iso(y,11,31),label:'ano de '+y};
  if(kind==='ano_ant')return{from:iso(y-1,0,1),to:iso(y-1,11,31),label:'ano de '+(y-1)};
  return month(y,m);
 }
 // Resultados pelas datas dos movimentos: recebimentos (com o IVA das obras) e custos sem IVA.
 function report(S,from,to){
  const tx=S.tx.filter(x=>x.date>=from&&x.date<=to),sum=(ty,k)=>r2(tx.filter(x=>x.type===ty).reduce((a,x)=>a+(Number(x[k])||0),0));
  const rec=sum('recebimento','total'),recBase=r2(rec/(1+S.vat/100)),mat=sum('fatura','base'),desp=sum('despesa','total'),mo=sum('mao_obra','base');
  const custos=r2(mat+desp+mo),lucro=r2(recBase-custos),ivaLiq=r2(rec-recBase),ivaDed=r2(sum('fatura','iva')+sum('mao_obra','iva'));
  return{tx,rec,recBase,mat,desp,mo,custos,lucro,margem:recBase?lucro/recBase*100:0,ivaLiq,ivaDed,ivaEst:r2(ivaLiq-ivaDed)};
 }
 function months(S,today,n=12){
  const y=+today.slice(0,4),m=+today.slice(5,7)-1;
  return Array.from({length:n},(_,i)=>{const from=iso(y,m-n+1+i,1),to=iso(y,m-n+2+i,0),r=report(S,from,to);return{key:from.slice(0,7),label:MES[+from.slice(5,7)-1].slice(0,3),rec:r.recBase,custos:r.custos,lucro:r.lucro}});
 }
 // Custos por categoria: as faturas lidas repartem-se pelas categorias dos artigos, na proporção do total sem IVA.
 function costByCat(S,from,to){
  const out={};const add=(k,v)=>{if(v)out[k]=r2((out[k]||0)+v)};
  for(const x of S.tx.filter(x=>x.date>=from&&x.date<=to)){
   if(x.type==='mao_obra')add('Mão de obra',x.base);
   else if(x.type==='despesa')add('Despesas sem fatura',x.total);
   else if(x.type==='fatura'){
    const v=(S.inv||[]).find(v=>v.tx===x.id),items=(v?.items||[]).filter(i=>Number(i.total)>0),tot=items.reduce((s,i)=>s+Number(i.total),0);
    if(tot)items.forEach(i=>add(i.cat||'Outros / consumíveis',Number(i.total)/tot*x.base));else add('Faturas sem artigos',x.base);
   }
  }
  return Object.entries(out).sort((a,b)=>b[1]-a[1]);
 }

 // Clientes: obras e orçamentos com o mesmo nome formam um só cliente.
 const clientKey=n=>norm(n)||'sem cliente';
 function clients(obras,quotes){
  const m=new Map();
  const get=n=>{const k=clientKey(n);if(!m.has(k))m.set(k,{key:k,name:String(n||'').trim()||'Sem cliente',phone:'',email:'',address:'',nif:'',obras:[],quotes:[]});return m.get(k)};
  const fill=(c,f)=>{for(const [k,v] of Object.entries(f))if(!c[k]&&String(v||'').trim())c[k]=String(v).trim()};
  for(const o of obras){if(!String(o.client||'').trim()||o.client==='Sem cliente')continue;const c=get(o.client);c.obras.push(o);fill(c,{phone:o.phone,email:o.email,address:o.address,nif:o.nif})}
  for(const r of quotes){const d=r.document||{};if(!String(d.client||'').trim())continue;const c=get(d.client);c.quotes.push(r);fill(c,{phone:d.contact,email:d.email,address:d.address})}
  return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt'));
 }
 // Pesquisa em tudo: todas as palavras têm de aparecer.
 function search(S,quotes,q,numberOf=r=>String(r.id)){
  const w=norm(q).split(' ').filter(Boolean);if(!w.length)return null;
  const hit=(...f)=>{const h=norm(f.join(' '));return w.every(x=>h.includes(x))},name=id=>(S.obras.find(o=>o.id===id)||{}).name||'';
  return{
   obras:S.obras.filter(o=>hit(o.name,o.client,o.phone,o.nif,o.email,o.address)),
   quotes:quotes.filter(r=>hit(r.document.client,r.document.contact,r.document.email,numberOf(r),(r.document.topics||[]).join(' '),r.document.brand)),
   inv:(S.inv||[]).filter(v=>hit(v.store,v.number,v.nif,name(v.obra))),
   tx:S.tx.filter(x=>hit(x.desc,x.topic,name(x.obra))),
  };
 }
 const obraYear=(o,tx)=>(o.done||tx.filter(x=>x.obra===o.id).map(x=>x.date).sort()[0]||'').slice(0,4);
 root.EnatGestao={IBAN,defaultPlan,planStatus,reminder,period,report,months,costByCat,clients,clientKey,search,obraYear,norm};
})(globalThis);
