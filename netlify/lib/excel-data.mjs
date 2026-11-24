// Same financial rules and columns as the app export; data is read from saved state.
export function excelData(state, now = new Date()) {
 const S={obras:[],tx:[],inv:[],vat:23,...state};
 const STAT={em_curso:'Em Curso',concluida:'Concluída',orcamento:'Planeamento',pausada:'Pausada'};
 const TY={recebimento:'Recebimento',fatura:'Fatura',despesa:'Despesa',mao_obra:'Mão de obra'};
 const r2=n=>Math.round((n||0)*100)/100;
 const srt=a=>[...a].sort((x,y)=>(y.date||'').localeCompare(x.date||''));
 S.tx=S.tx.map(x=>{if(x.fx)return x;const rate=x.type==='mao_obra'?(x.billing==='faturado'?23:0):x.type==='fatura'?x.rate:0;const base=x.total/(1+(rate||0)/100);return {...x,base,iva:x.total-base}});
function calc(o){
 const t=S.tx.filter(x=>x.obra===o.id),s=(ty,k)=>t.filter(x=>x.type===ty).reduce((a,x)=>a+x[k],0);
 const base=o.valor/(1+S.vat/100),ivaLiq=o.valor-base;
 const fb=s('fatura','base'),fi=s('fatura','iva')+s('mao_obra','iva'),ft=s('fatura','total'),de=s('despesa','total'),mo=s('mao_obra','base'),mt=s('mao_obra','total'),mi=s('mao_obra','iva'),rec=s('recebimento','total');
 const custo=fb+de+mo,lucro=base-custo,pago=ft+de+mt;
 return{o,t,base,ivaLiq,fb,fi,ft,de,mo,mt,mi,rec,custo,lucro,pago,margem:base?lucro/base*100:0,ivaEst:ivaLiq-fi,caixa:rec-pago,porRec:o.valor-rec};
}
const all=()=>S.obras.map(calc);
function tabelas(){
 const nome=id=>(S.obras.find(o=>o.id===id)||{}).name||'',T={};
 T.Obras=[['Obra','Cliente','Estado','Valor c/ IVA','Valor s/ IVA','Recebido','Por receber','Materiais s/ IVA','Despesas sem fatura','Mão de obra s/ IVA','Custos','Lucro','Margem %','IVA cobrado','IVA suportado','IVA a entregar','Telemóvel','Conclusão','Equipamentos'],...all().map(c=>[c.o.name,c.o.client,STAT[c.o.status],c.o.valor,c.base,c.rec,c.porRec,c.fb,c.de,c.mo,c.custo,c.lucro,c.margem,c.ivaLiq,c.fi,c.ivaEst,c.o.phone||'',c.o.done||'',(c.o.equip||[]).join(', ')].map(x=>typeof x==='number'?r2(x):x))];
 // Um só nome por fornecedor: junta pelo nome, sem acentos, maiúsculas nem pontuação («sanitop» junta-se a
 // «Sanitop-Material Sanitário, Lda»). Fica o nome mais completo. Não se usa o NIF: nalgumas faturas foi lido o da ENAT.
 const chave=t=>String(t||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const grupos=[];
 for(const v of S.inv){
  const k=chave(v.store);if(!k)continue;
  let g=grupos.find(g=>[...g.chaves].some(c=>c===k||(Math.min(c.length,k.length)>=5&&(c.startsWith(k)||k.startsWith(c)))));
  if(!g)grupos.push(g={chaves:new Set(),nome:''});
  g.chaves.add(k);
  if(String(v.store).trim().length>g.nome.length)g.nome=String(v.store).trim();
 }
 const forn=v=>{const k=chave(v.store),g=k&&grupos.find(g=>g.chaves.has(k));return g?.nome||v.store||'Sem fornecedor'};
 const ano=d=>/^\d{4}/.test(d||'')?String(d).slice(0,4):'',mes=d=>/^\d{4}-\d{2}/.test(d||'')?String(d).slice(0,7):'';
 T.Faturas=[['Obra','Loja / fornecedor','NIF','Data','Nº fatura','Total s/ IVA','IVA','Total c/ IVA','Foto anexada','Ano','Mês'],...S.inv.map(v=>{const t=S.tx.find(x=>x.id===v.tx)||{};return[nome(v.obra)||'Sem obra',forn(v),v.nif||'',v.date,v.number||'',r2(t.base),r2(t.iva),r2(t.total),v.foto?'Sim':'Não',ano(v.date),mes(v.date)]})];
 T.Materiais=[['Obra','Loja / fornecedor','NIF','Data','Nº fatura','Artigo','Categoria','Quantidade','Unidade','Preço unit. s/ IVA','IVA %','Preço unit. c/ IVA','Total linha s/ IVA','Ano'],...S.inv.flatMap(v=>(v.items||[]).map(i=>[nome(v.obra)||'Sem obra',forn(v),v.nif||'',v.date,v.number||'',i.name,i.cat||'Sem categoria',i.qty,i.unit,r2(i.unit_price),i.vat,r2(i.unit_price*(1+i.vat/100)),r2(i.total),ano(v.date)]))];
 T.Movimentos=[['Obra','Tipo','Descrição','Tópico','Data','Total c/ IVA','Base s/ IVA','IVA','Faturação do técnico'],...srt(S.tx).map(x=>[nome(x.obra),TY[x.type],x.desc||'',x.topic||'',x.date,r2(x.total),r2(x.base),r2(x.iva),x.type==='mao_obra'?(x.billing==='faturado'?'Faturado':'Não faturado'):''])];
 return T}

 const T=tabelas();
 T.Controlo=[['Nome da Obra','Local','Data Início','Estado da Obra','Orçamento c/ IVA','Despesas Totais','IVA Suportado','IVA a Entregar','Valor Pago (Recebido)','Saldo a Receber','Lucro Estimado','Margem %','Estado Pagamento'],...all().map(c=>{
 const amount=r2(c.o.valor),expenses=r2(c.pago),vat=r2(c.fi),paid=r2(c.rec),tax=r2(Math.max(0,amount*23/123-vat)),profit=r2(amount-expenses-tax);
 return [c.o.name,c.o.local||c.o.location||'',c.o.data_inicio||c.o.startDate||'',STAT[c.o.status]||c.o.status,amount,expenses,vat,tax,paid,r2(Math.max(0,amount-paid)),profit,amount?profit/amount:0,amount>0&&paid>=amount?'Pago':paid>0?'Parcial':'Pendente'];
 })];
 return {tables:T,updatedAt:now.toISOString()};
}
