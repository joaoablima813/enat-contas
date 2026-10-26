/* Excel financeiro ENAT: fórmulas com resultados para consulta offline. */
(function(root){
 const euro='"€" #,##0.00;[Red]-"€" #,##0.00',pct='0.0%';
 const fill=color=>({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+color}});
 const round=n=>Math.round((Number(n)||0)*100)/100;
 function createWorkbook(ExcelJS,tables,records){
  const wb=new ExcelJS.Workbook();wb.creator='ENAT';wb.calcProperties.fullCalcOnLoad=true;
  const main=wb.addWorksheet('Controlo de Obras');
  const headers=['Nome da Obra','Local','Data Início','Estado da Obra','Orçamento c/ IVA','Despesas Totais','IVA Suportado','IVA a Entregar','Valor Pago (Recebido)','Saldo a Receber','Lucro Estimado','Margem %','Estado Pagamento'];
  main.mergeCells('A1:M2');main.getCell('A1').value='ENAT • CONTROLO FINANCEIRO DE OBRAS';main.getCell('A1').font={name:'Calibri',size:20,bold:true,color:{argb:'FF2F395D'}};
  main.mergeCells('A6:M6');main.getCell('A6').value='Resumo: IVA a 23%, margem sobre orçamento com IVA. Obras: detalhe da margem sem IVA e crédito de IVA.';
  main.getCell('A6').font={size:10,color:{argb:'FF59607F'}};
  main.getRow(8).values=headers;
  const controls=records.map((c,i)=>{
   const row=i+9,source=i+2,amount=round(c.o.valor),expenses=round(c.pago),vat=round(c.fi),paid=round(c.rec);
   const tax=round(Math.max(0,amount*23/123-vat)),balance=round(Math.max(0,amount-paid)),profit=round(amount-expenses-tax);
   const formula=(f,result)=>({formula:f,result});
   main.getRow(row).values=[c.o.name,c.o.local||c.o.location||'',c.o.data_inicio||c.o.startDate||'',{formula:`Obras!C${source}`,result:c.o.status==='orcamento'?'Planeamento':c.o.status==='em_curso'?'Em Curso':tables.Obras[i+1][2]},formula(`Obras!D${source}`,amount),formula(`ROUND(SUM(Obras!H${source}:J${source})+Obras!O${source},2)`,expenses),formula(`Obras!O${source}`,vat),formula(`MAX(0,ROUND(E${row}*23/123-G${row},2))`,tax),formula(`Obras!F${source}`,paid),formula(`MAX(0,ROUND(E${row}-I${row},2))`,balance),formula(`ROUND(E${row}-F${row}-H${row},2)`,profit),formula(`IFERROR(K${row}/E${row},0)`,amount?profit/amount:0),formula(`IF(AND(E${row}>0,I${row}>=E${row}),"Pago",IF(I${row}>0,"Parcial","Pendente"))`,amount>0&&paid>=amount?'Pago':paid>0?'Parcial':'Pendente')];
   return {amount,expenses,paid,balance,profit};
  });
  const end=Math.max(9,records.length+8),total=k=>round(controls.reduce((s,c)=>s+c[k],0));
  const metrics=[['TOTAL ORÇAMENTADO','E',total('amount')],['TOTAL DESPESAS','F',total('expenses')],['LUCRO ESTIMADO','K',total('profit')],['MARGEM MÉDIA',null,total('amount')?total('profit')/total('amount'):0],['VALOR RECEBIDO','I',total('paid')],['SALDO A RECEBER','J',total('balance')]];
  metrics.forEach(([label,col,value],i)=>{
   const start=i*2+1;main.mergeCells(4,start,4,start+1);main.mergeCells(5,start,5,start+1);
   const l=main.getCell(4,start),v=main.getCell(5,start);l.value=label;l.fill=fill('F1F4FA');l.font={bold:true,size:10,color:{argb:'FF59607F'}};
   v.value={formula:col?`SUM(${col}9:${col}${end})`:`IFERROR(SUM(K9:K${end})/SUM(E9:E${end}),0)`,result:value};v.numFmt=col?euro:pct;v.fill=fill('F1F4FA');v.font={bold:true,size:16,color:{argb:'FF191E3D'}};l.alignment=v.alignment={horizontal:'center',vertical:'middle'};
  });
  style(main,8,headers.length);main.columns.forEach((c,i)=>c.width=i===0?34:i===12?22:20);
  for(let r=9;r<=records.length+8;r++)for(let c=5;c<=12;c++)main.getCell(r,c).numFmt=c===12?pct:euro;
  paymentColors(main,`M9:M${end}`);statusColors(main,`D9:D${end}`,'D9');
  for(let r=9;r<=records.length+8;r++){const cell=main.getCell(r,3);if(typeof cell.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cell.value)){cell.value=new Date(cell.value+'T12:00:00Z');cell.numFmt='dd/mm/yyyy'}}
  for(const [name,rows] of Object.entries(tables)){
   const ws=wb.addWorksheet(name);ws.addRows(rows);style(ws,1,rows[0].length);
   ws.columns.forEach((col,i)=>{col.width=Math.min(42,Math.max(18,String(rows[0][i]).length+3))});
   ws.eachRow((row,r)=>{if(r===1)return;row.eachCell((cell,c)=>{
    const label=rows[0][c-1];
    if(typeof cell.value==='number'){
     if(/Margem|IVA %/.test(label)){cell.value/=100;cell.numFmt=pct}
     else if(!/Quantidade/.test(label))cell.numFmt=euro;
     cell.alignment={...cell.alignment,horizontal:'right'};
    }
    if(/^(Data|Conclusão)$/.test(label)&&typeof cell.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cell.value)){cell.value=new Date(cell.value+'T12:00:00Z');cell.numFmt='dd/mm/yyyy'}
   })});
   if(name==='Obras')records.forEach((c,i)=>{ws.getCell(i+2,3).value=c.o.status==='orcamento'?'Planeamento':c.o.status==='em_curso'?'Em Curso':rows[i+1][2]});
   if(name==='Obras')statusColors(ws,`C2:C${Math.max(2,ws.rowCount)}`,'C2');
  }
  return wb;
 }
 function style(ws,header,count){
  ws.views=[{state:'frozen',ySplit:header}];ws.autoFilter={from:{row:header,column:1},to:{row:Math.max(header,ws.rowCount),column:count}};
  ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:`${header}:${header}`};
  ws.getRow(header).height=34;
  ws.eachRow((row,r)=>{if(r<header)return;row.height=r===header?34:26;for(let c=1;c<=count;c++){
   const cell=row.getCell(c);cell.font={name:'Calibri',size:11,color:{argb:r===header?'FFFFFFFF':'FF191E3D'},bold:r===header};cell.alignment={vertical:'middle',wrapText:true,horizontal:typeof cell.value==='number'||(typeof cell.value?.result==='number')?'right':'left'};cell.fill=fill(r===header?'4B5C92':(r-header)%2===0?'F6F7FB':'FFFFFF');cell.border={bottom:{style:'hair',color:{argb:'FFE2E6F0'}}};
   const colors={'Planeamento':['E8ECFF','3B4EAF'],'Em Curso':['FEF3C7','92400E'],'Concluída':['D1FAE5','065F46'],'Pausada':['FEE2E2','991B1B'],'Pago':['DCFCE7','15803D'],'Parcial':['FEF9C3','854D0E'],'Pendente':['FEE2E2','B91C1C'],'Sim':['D1FAE5','065F46'],'Não':['F1F4FA','59607F'],'Recebimento':['D1FAE5','065F46'],'Mão de obra':['F3E8FF','6B21A8']};
   const color=colors[typeof cell.value==='object'?cell.value?.result:cell.value];if(color){cell.fill=fill(color[0]);cell.font.color={argb:'FF'+color[1]}}
  }});
 }
 function statusColors(ws,ref,cell){
  ws.addConditionalFormatting({ref,rules:[['Planeamento','E8ECFF','3B4EAF'],['Em Curso','FEF3C7','92400E'],['Concluída','D1FAE5','065F46'],['Pausada','FEE2E2','991B1B']].map(([label,bg,fg],i)=>({type:'expression',priority:i+4,formulae:[`${cell}="${label}"`],style:{fill:fill(bg),font:{color:{argb:'FF'+fg},bold:true}}}))});
 }
 function paymentColors(ws,ref){
  ws.addConditionalFormatting({ref,rules:[['Pago','DCFCE7','15803D'],['Parcial','FEF9C3','854D0E'],['Pendente','FEE2E2','B91C1C']].map(([label,bg,fg],i)=>({type:'expression',priority:i+1,formulae:[`M9="${label}"`],style:{fill:fill(bg),font:{color:{argb:'FF'+fg},bold:true}}}))});
 }
 root.EnatExcel={createWorkbook};
})(typeof window==='undefined'?globalThis:window);
