/* Pacote para o contabilista: Excel do período e anexos originais das faturas num só ZIP. */
(function(root){
 // ZIP sem compressão (método 0): os anexos já são JPEG ou PDF comprimidos.
 const T=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0});
 const crc32=b=>{let c=~0;for(let i=0;i<b.length;i++)c=T[(c^b[i])&255]^(c>>>8);return(~c)>>>0};
 function makeZip(files,when=new Date()){
  const enc=new TextEncoder(),parts=[],central=[];let off=0;
  const time=(when.getHours()<<11)|(when.getMinutes()<<5)|(when.getSeconds()>>1),date=((when.getFullYear()-1980)<<9)|((when.getMonth()+1)<<5)|when.getDate();
  for(const f of files){
   const name=enc.encode(f.name),data=f.data,crc=crc32(data),h=new DataView(new ArrayBuffer(30)),c=new DataView(new ArrayBuffer(46));
   h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(10,time,true);h.setUint16(12,date,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
   c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(12,time,true);c.setUint16(14,date,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
   parts.push(new Uint8Array(h.buffer),name,data);central.push(new Uint8Array(c.buffer),name);off+=30+name.length+data.length;
  }
  const size=central.reduce((s,p)=>s+p.length,0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,off,true);
  const all=[...parts,...central,new Uint8Array(e.buffer)],out=new Uint8Array(all.reduce((s,p)=>s+p.length,0));let at=0;for(const p of all){out.set(p,at);at+=p.length}
  return out;
 }
 const r2=n=>Math.round((Number(n)||0)*100)/100;
 const clean=v=>String(v||'').replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-').replace(/\s+/g,' ').trim().slice(0,80);
 const attachmentName=(v,mime)=>clean([v.date,v.store,v.number].filter(Boolean).join(' '))+'-'+v.id+(mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':'.jpg');
 // Uma folha por tipo de documento, com totais; os nomes dos anexos ligam cada fatura ao ficheiro da pasta Faturas.
 function accountantWorkbook(ExcelJS,S,from,to,label){
  const wb=new ExcelJS.Workbook();wb.creator='ENAT';
  const euro='#,##0.00 "€"',navy='FF122C3B',name=id=>(S.obras.find(o=>o.id===id)||{}).name||'';
  const tx=S.tx.filter(x=>x.date>=from&&x.date<=to).sort((a,b)=>a.date.localeCompare(b.date)),of=t=>tx.filter(x=>x.type===t);
  const sheet=(title,headers,rows,money)=>{
   const ws=wb.addWorksheet(title);ws.addRow(headers);rows.forEach(r=>ws.addRow(r));
   const head=ws.getRow(1);head.font={bold:true,color:{argb:'FFFFFFFF'}};head.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};
   if(rows.length){const t=ws.addRow(headers.map((_,i)=>i===0?'Total':money.includes(i)?{formula:`SUM(${ws.getColumn(i+1).letter}2:${ws.getColumn(i+1).letter}${rows.length+1})`,result:r2(rows.reduce((s,r)=>s+(Number(r[i])||0),0))}:''));t.font={bold:true}}
   money.forEach(i=>ws.getColumn(i+1).numFmt=euro);ws.columns.forEach((c,i)=>c.width=i===0?12:Math.max(14,Math.min(40,headers[i].length+6)));ws.views=[{state:'frozen',ySplit:1}];
   return ws;
  };
  const inv=id=>(S.inv||[]).find(v=>v.tx===id);
  const faturas=of('fatura').map(x=>{const v=inv(x.id);return[x.date,v?.number||'',v?.store||x.desc||'',v?.nif||'',name(x.obra),r2(x.base),r2(x.iva),r2(x.total),r2(x.rate)+'%',v?.foto?attachmentName(v,v.mime):'Sem anexo']});
  const mo=of('mao_obra').map(x=>[x.date,x.desc||'',x.topic||'',name(x.obra),x.billing==='faturado'?'Faturado (IVA 23%)':'Não faturado',r2(x.base),r2(x.iva),r2(x.total)]);
  const rec=of('recebimento').map(x=>[x.date,x.desc||'',name(x.obra),(S.obras.find(o=>o.id===x.obra)||{}).client||'',r2(x.total)]);
  const desp=of('despesa').map(x=>[x.date,x.desc||'',x.topic||'',name(x.obra),r2(x.total)]);
  const sum=(l,i)=>r2(l.reduce((s,r)=>s+(Number(r[i])||0),0)),recT=sum(rec,4),recB=r2(recT/(1+S.vat/100)),ivaDed=r2(sum(faturas,6)+sum(mo,6));
  const res=wb.addWorksheet('Resumo');
  res.addRow(['ENAT · Documentos para a contabilidade']).font={bold:true,size:14,color:{argb:navy}};
  res.addRow([`Período: ${label} (${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')})`]);res.addRow([]);
  [['Recebimentos de clientes (c/ IVA)',recT],['Recebimentos sem IVA ('+S.vat+'%)',recB],['IVA nos recebimentos',r2(recT-recB)],['Faturas de fornecedores s/ IVA',sum(faturas,5)],['IVA suportado nas faturas',sum(faturas,6)],['Mão de obra s/ IVA',sum(mo,5)],['IVA da mão de obra faturada',sum(mo,6)],['Despesas sem fatura',sum(desp,4)],['IVA dedutível',ivaDed],['Estimativa de IVA a entregar (crédito se negativo)',r2(recT-recB-ivaDed)]].forEach(([l,v])=>{const r=res.addRow([l,v]);r.getCell(2).numFmt=euro});
  res.addRow([]);res.addRow(['Estimativa pelas datas dos movimentos. Os anexos das faturas estão na pasta «Faturas» deste ZIP.']).font={italic:true,color:{argb:'FF6E787D'}};
  res.getColumn(1).width=52;res.getColumn(2).width=18;
  sheet('Faturas',['Data','N.º fatura','Fornecedor','NIF','Obra','Base s/ IVA','IVA','Total c/ IVA','Taxa','Anexo'],faturas,[5,6,7]);
  sheet('Mão de obra',['Data','Descrição','Tópico','Obra','Faturação','Base s/ IVA','IVA','Total pago'],mo,[5,6,7]);
  sheet('Recebimentos',['Data','Descrição','Obra','Cliente','Valor c/ IVA'],rec,[4]);
  sheet('Despesas',['Data','Descrição','Tópico','Obra','Valor'],desp,[4]);
  return wb;
 }
 // Faturas do período com anexo guardado, para descarregar para a pasta Faturas.
 const attachments=(S,from,to)=>(S.inv||[]).filter(v=>v.foto&&S.tx.some(x=>x.id===v.tx&&x.date>=from&&x.date<=to));
 root.EnatContab={makeZip,crc32,accountantWorkbook,attachments,attachmentName,clean};
})(globalThis);
