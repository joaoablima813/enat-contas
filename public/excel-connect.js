// Creates an Excel workbook through the installed Windows Excel application.
// No access password is included in the installer or workbook queries.
export function installer(origin) {
 const base=new URL('/api/excel/dados',origin).href;
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 const sheets=[['Controlo de Obras','Controlo','ENAT_Controlo',7],['Obras','Obras','ENAT_Obras',1],['Faturas','Faturas','ENAT_Faturas',1],['Materiais','Materiais','ENAT_Materiais',1],['Movimentos','Movimentos','ENAT_Movimentos',1]];
 const lines=[
 'Option Explicit','Dim xl, wb, ws, lo, qt, q, dest, shell, fso, i, ts, el, style',
 'Set shell = CreateObject("WScript.Shell")','Set fso = CreateObject("Scripting.FileSystemObject")',
 'dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas.xlsx"',
 'If fso.FileExists(dest) Then',
 ' dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas-" & Year(Now) & Month(Now) & Day(Now) & "-" & Hour(Now) & Minute(Now) & Second(Now) & ".xlsx"',
 'End If',
 'On Error Resume Next','Set xl = CreateObject("Excel.Application")',
 'If Err.Number <> 0 Then',' MsgBox "E necessario ter o Microsoft Excel 2016 ou mais recente instalado no Windows. Consulte o guia na app.", 16, "ENAT"',' WScript.Quit','End If','On Error GoTo 0',
 'xl.Visible = True','Set wb = xl.Workbooks.Add',
 // VBScript cannot pass an index to TableElements directly, so each element is read through Item.
 // If Excel refuses the custom style, the tables keep a built-in style and the direct formatting below.
 'On Error Resume Next','Set ts = wb.TableStyles.Add("ENAT")',
 'Set el = ts.TableElements.Item(0)','el.Interior.Color = RGB(255,255,255)','el.Font.Color = RGB(25,30,61)','el.Borders.Item(9).Color = RGB(226,230,240)',
 'Set el = ts.TableElements.Item(1)','el.Interior.Color = RGB(75,92,146)','el.Font.Color = RGB(255,255,255)','el.Font.Bold = True',
 'Set el = ts.TableElements.Item(5)','el.Interior.Color = RGB(255,255,255)','el.StripeSize = 1',
 'Set el = ts.TableElements.Item(6)','el.Interior.Color = RGB(246,247,251)','el.StripeSize = 1',
 'If Err.Number <> 0 Then','style = "TableStyleLight9"',' Err.Clear','Else',' style = "ENAT"','End If','On Error GoTo 0',
 'Do While wb.Worksheets.Count > 1',' xl.DisplayAlerts = False',' wb.Worksheets(wb.Worksheets.Count).Delete',' xl.DisplayAlerts = True','Loop'
 ];
 sheets.forEach(([name,key,table,row],index)=>{
 const numeric={Controlo:['Orçamento c/ IVA','Despesas Totais','IVA Suportado','IVA a Entregar','Valor Pago (Recebido)','Saldo a Receber','Lucro Estimado','Margem %'],Obras:['Valor c/ IVA','Valor s/ IVA','Recebido','Por receber','Materiais s/ IVA','Despesas sem fatura','Mão de obra s/ IVA','Custos','Lucro','Margem %','IVA cobrado','IVA suportado','IVA a entregar'],Faturas:['Total s/ IVA','IVA','Total c/ IVA'],Materiais:['Quantidade','Preço unit. s/ IVA','IVA %','Preço unit. c/ IVA','Total linha s/ IVA'],Movimentos:['Total c/ IVA','Base s/ IVA','IVA']};
 const dates={Controlo:['Data Início'],Obras:['Conclusão'],Faturas:['Data'],Materiais:['Data'],Movimentos:['Data']};
 const transforms=[...numeric[key].map(c=>`{"${c}", type number}`),...dates[key].map(c=>`{"${c}", type date}`)];
 const m=`let Fonte = Json.Document(Web.Contents("${base}")), Linhas = Fonte[tables][${key}], Tabela = Table.FromRows(List.Skip(Linhas, 1), List.First(Linhas)), Tipos = Table.TransformColumnTypes(Tabela, {${transforms.join(', ')}}, "pt-PT"), Datas = Table.ReplaceErrorValues(Tipos, {${dates[key].map(c=>`{"${c}", null}`).join(', ')}})${key==='Obras'||key==='Materiais'?`, Percentagens = Table.TransformColumns(Datas, {{"${key==='Obras'?'Margem %':'IVA %'}", each _ / 100, type number}})`:''} in ${key==='Obras'||key==='Materiais'?'Percentagens':'Datas'}`;
 lines.push(index?'Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))':'Set ws = wb.Worksheets(1)',
 `ws.Name = ${quote(name)}`,`q = ${quote(m)}`,`wb.Queries.Add ${quote(table)}, q`,
 `Set lo = ws.ListObjects.Add(0, ${quote('OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location='+table+';Extended Properties=""')}, True, 1, ws.Range("A${row}"))`,
 `lo.Name = ${quote(table)}`,'On Error Resume Next','lo.TableStyle = style','On Error GoTo 0','lo.ShowTableStyleRowStripes = True','Set qt = lo.QueryTable','qt.CommandType = 2',`qt.CommandText = ${quote('SELECT * FROM ['+table+']')}`,
 'qt.BackgroundQuery = False','qt.RefreshOnFileOpen = True','qt.RefreshPeriod = 5','qt.PreserveFormatting = True','qt.AdjustColumnWidth = False','ws.Cells.Font.Name = "Calibri"','ws.Cells.Font.Size = 11','ws.Columns.ColumnWidth = 20','ws.Columns("A:A").ColumnWidth = 34',`ws.Rows(${row}).RowHeight = 32`,'ws.Activate',`ws.Range("A${row+1}").Select`,'xl.ActiveWindow.FreezePanes = True');
 if(!index){
  lines.push('ws.Range("A2:M2").Merge','ws.Range("A2").Value = "ENAT • CONTROLO FINANCEIRO DE OBRAS"','ws.Range("A2").Font.Size = 20','ws.Range("A2").Font.Bold = True','ws.Range("A2").Font.Color = RGB(47,57,93)','ws.Range("A6:M6").Merge','ws.Range("A6").Value = "Atualiza ao abrir e a cada 5 minutos com internet. Estado da Obra acompanha a app."','ws.Range("A6").Font.Size = 10');
  const metrics=[['TOTAL ORÇAMENTADO','SUM(ENAT_Controlo[Orçamento c/ IVA])'],['TOTAL DESPESAS','SUM(ENAT_Controlo[Despesas Totais])'],['LUCRO ESTIMADO','SUM(ENAT_Controlo[Lucro Estimado])'],['MARGEM MÉDIA','IFERROR(SUM(ENAT_Controlo[Lucro Estimado])/SUM(ENAT_Controlo[Orçamento c/ IVA]),0)'],['VALOR RECEBIDO','SUM(ENAT_Controlo[Valor Pago (Recebido)])'],['SALDO A RECEBER','SUM(ENAT_Controlo[Saldo a Receber])']];
  // Formulas are added after the first refresh, when query column names exist.
  metrics.forEach(([label],n)=>{const a=String.fromCharCode(65+n*2),b=String.fromCharCode(66+n*2);lines.push(`ws.Range("${a}3:${b}3").Merge`,`ws.Range("${a}4:${b}4").Merge`,`ws.Range("${a}3").Value = ${quote(label)}`,`ws.Range("${a}3:${b}4").Interior.Color = RGB(241,244,250)`,`ws.Range("${a}3:${b}4").Font.Bold = True`,`ws.Range("${a}4").Font.Size = 16`,`ws.Range("${a}3").Font.Color = RGB(89,96,127)`,`ws.Range("${a}3").Font.Size = 10`,`ws.Range("${a}4").Font.Color = RGB(25,30,61)`,`ws.Range("${a}3:${b}4").HorizontalAlignment = -4108`)});
 }
 });
 lines.push('Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))','ws.Name = "Instrucoes"','ws.Columns("A:A").ColumnWidth = 110',
 'ws.Range("A1").Value = "ENAT - Excel ligado a app"',
 'ws.Range("A3").Value = "Primeira ligacao: escolha Basico, utilizador enat e a palavra-passe criada na app."',
 'ws.Range("A4").Value = "Depois: Dados > Atualizar Tudo. Atualizacao automatica: ao abrir e a cada 5 minutos."',
 'ws.Range("A5").Value = "Aguarde que a atualizacao termine. Sem internet, ficam os ultimos dados guardados."',
 'ws.Range("A6").Value = "Edite os dados na app. As alteracoes feitas nas tabelas do Excel sao substituidas."',
 'ws.Range("A7").Value = "Noutro computador: abra a copia do ficheiro e introduza de novo as credenciais."',
 'ws.Range("A8").Value = "Se a ligacao falhar, Dados > Obter Dados > Definicoes da origem de dados > Editar permissoes."',
 'ws.Range("A9").Value = "Guarde o ficheiro apos atualizar para conservar os dados quando estiver sem internet."',
 'wb.Worksheets(1).Activate','wb.SaveAs dest, 51',
 'MsgBox "O ficheiro foi criado no Ambiente de Trabalho. No Excel, escolha Basico (nao Anonimo), utilizador enat e a palavra-passe criada na app. Se aparecer um aviso sobre ligacoes, permita a ligacao apenas neste ficheiro ENAT.", 64, "ENAT"',
 'On Error Resume Next','wb.RefreshAll','xl.CalculateUntilAsyncQueriesDone',
 'If Err.Number <> 0 Then',' MsgBox "O ficheiro ficou guardado. Termine a ligacao em Dados > Atualizar Tudo. Consulte o guia na app se aparecer um erro.", 48, "ENAT"',' Err.Clear','End If','On Error GoTo 0');
 const metrics=['SUM(ENAT_Controlo[Orçamento c/ IVA])','SUM(ENAT_Controlo[Despesas Totais])','SUM(ENAT_Controlo[Lucro Estimado])','IFERROR(SUM(ENAT_Controlo[Lucro Estimado])/SUM(ENAT_Controlo[Orçamento c/ IVA]),0)','SUM(ENAT_Controlo[Valor Pago (Recebido)])','SUM(ENAT_Controlo[Saldo a Receber])'];
 // IFERROR also keeps an unconfigured workbook readable.
 lines.push('On Error Resume Next','Set ws = wb.Worksheets(1)');
 metrics.forEach((formula,i)=>lines.push(`ws.Range("${String.fromCharCode(65+i*2)}4").Formula = ${quote('=IFERROR('+formula.replace(/ENAT_Controlo\[[^\]]+\]/g,ref=>'INDIRECT("'+ref+'")')+',0)')}`,`ws.Range("${String.fromCharCode(65+i*2)}4").NumberFormat = ${quote(i===3?'0.0%':'"€" #,##0.00')}`));
 const formats={
  'Controlo de Obras':[['E:K','"€" #,##0.00'],['L:L','0.0%'],['C:C','dd/mm/yyyy']],
  Obras:[['D:L','"€" #,##0.00'],['M:M','0.0%'],['N:P','"€" #,##0.00'],['R:R','dd/mm/yyyy']],
  Faturas:[['F:H','"€" #,##0.00'],['D:D','dd/mm/yyyy']],
  Materiais:[['H:H','0.###'],['J:J','"€" #,##0.00'],['K:K','0%'],['L:M','"€" #,##0.00'],['D:D','dd/mm/yyyy']],
  Movimentos:[['F:H','"€" #,##0.00'],['E:E','dd/mm/yyyy']]
 };
 const states=[['Planeamento','232,236,255','59,78,175'],['Em Curso','254,243,199','146,64,14'],['Concluída','209,250,229','6,95,70'],['Pausada','254,226,226','153,27,27']];
 const payments=[['Pago','220,252,231','21,128,61'],['Parcial','254,249,195','133,77,14'],['Pendente','254,226,226','185,28,28']];
 function badge(col,row,colors){
  for(const [label,bg,fg] of colors){
   const range=`${col}${row}:${col}1048576`;
   lines.push(`With ws.Range("${range}").FormatConditions.Add(1, 3, ${quote('="'+label+'"')})`,`.Interior.Color = RGB(${bg})`,`.Font.Color = RGB(${fg})`,'.Font.Bold = True','End With');
  }
 }
 for(const [name,,,row] of sheets){
  lines.push(`Set ws = wb.Worksheets(${quote(name)})`);
  for(const [range,format] of formats[name]){
   const [a,b]=range.split(':');
   lines.push(`ws.Range("${a}${row+1}:${b}1048576").NumberFormat = ${quote(format)}`,`ws.Range("${a}${row+1}:${b}1048576").HorizontalAlignment = -4152`);
  }
  lines.push('ws.ListObjects(1).HeaderRowRange.Interior.Color = RGB(75,92,146)','ws.ListObjects(1).HeaderRowRange.Font.Color = RGB(255,255,255)','ws.ListObjects(1).HeaderRowRange.WrapText = True',`ws.Rows(${row}).RowHeight = 36`,'ws.PageSetup.Orientation = 2','ws.PageSetup.Zoom = False','ws.PageSetup.FitToPagesWide = 1','ws.PageSetup.FitToPagesTall = False',`ws.PageSetup.PrintTitleRows = "$${row}:$${row}"`);
  if(name==='Controlo de Obras'){badge('D',row+1,states);badge('M',row+1,payments)}
  if(name==='Obras')badge('C',row+1,states);
  if(name==='Faturas')badge('I',row+1,[['Sim','209,250,229','6,95,70'],['Não','241,244,250','89,96,127']]);
  if(name==='Movimentos')badge('B',row+1,[['Recebimento','209,250,229','6,95,70'],['Mão de obra','243,232,255','107,33,168'],['Fatura','241,244,250','89,96,127']]);
 }
 lines.push('wb.Worksheets(1).Activate',
 'wb.Save','On Error GoTo 0','MsgBox "Guarde este ficheiro. As obras e os estados chegam da app por consulta automatica; pode tambem usar Dados > Atualizar Tudo. Se as tabelas estiverem vazias, termine a autenticacao no Excel.", 64, "ENAT"');
 return '\ufeff'+lines.join('\r\n');
}
