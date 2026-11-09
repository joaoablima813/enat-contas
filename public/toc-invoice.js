/* Fatura TOC Online a partir de um orçamento da app: as linhas (equipamento, material, acessórios,
   mão de obra e outros) com o preço de venda sem IVA e IVA sempre a 23%.
   Usado pela app (pré-visualização) e pelo servidor (fatura emitida), para os valores serem iguais. */
(function(root){
 const VAT=23,r2=n=>Math.round((n+Number.EPSILON)*100)/100,r4=n=>Math.round((n+Number.EPSILON)*1e4)/1e4;
 const qty=l=>Number(l.quantity??1);
 // Preço de venda de cada linha: o total sem IVA do orçamento repartido pelo custo de cada linha, ao cêntimo (como no PDF detalhado).
 function invoiceLines(q){
  const lines=(q.lines||[]).filter(l=>String(l.description||'').trim()&&Number(l.value)>0&&qty(l)>0);
  if(!lines.length)return [];
  const cost=lines.reduce((s,l)=>s+Number(l.value)*qty(l),0);
  // O mesmo «Total sem IVA» que o cliente viu no orçamento.
  const net=root.quoteTotals?root.quoteTotals(q).net:r2(cost*(1+Number(q.margin||0)/100));
  const cents=lines.map(l=>Math.floor(Number(l.value)*qty(l)/cost*net*100));
  let left=Math.round(net*100)-cents.reduce((s,n)=>s+n,0);
  for(let i=0;left>0;i=(i+1)%cents.length,left--)cents[i]++;
  return lines.map((l,i)=>{
   const kind=l.kind==='Equipamento / material'?'Equipamento':l.kind||'Outros',quantity=qty(l),unit_price=r4(cents[i]/100/quantity);
   return {kind,item_type:kind==='Mão de obra'?'Service':'Product',description:String(l.description).trim().replace(/\s+\n/g,'\n').slice(0,2000),quantity,unit:l.unit||'un.',unit_price,net:r2(quantity*unit_price)};
  });
 }
 function invoiceTotals(lines){const net=r2(lines.reduce((s,l)=>s+l.net,0)),vat=r2(net*VAT/100);return {net,vat,total:r2(net+vat)}}
 // Morada guardada numa só linha: separa o código postal (0000-000) e a localidade que vem a seguir.
 function splitAddress(a){
  const s=String(a||'').trim(),m=s.match(/(\d{4})\s*-\s*(\d{3})\s*([^,\d][^,]*)?/);
  if(!m)return {address:s,postcode:'',city:''};
  const address=(s.slice(0,m.index)+s.slice(m.index+m[0].length)).replace(/\s*,\s*(,\s*)+/g,', ').replace(/^[\s,]+|[\s,]+$/g,'');
  return {address,postcode:m[1]+'-'+m[2],city:(m[3]||'').trim()};
 }
 // NIF português: 9 dígitos com dígito de controlo.
 function validNif(n){
  const s=String(n||'').replace(/\s/g,'');if(!/^[1-9]\d{8}$/.test(s))return false;
  const sum=[...s.slice(0,8)].reduce((t,d,i)=>t+Number(d)*(9-i),0),c=11-sum%11;
  return (c>=10?0:c)===Number(s[8]);
 }
 root.EnatToc={VAT,invoiceLines,invoiceTotals,splitAddress,validNif};
})(globalThis);
