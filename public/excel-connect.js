// Creates an Excel workbook through the installed Windows Excel application.
// No access password is included in the installer or workbook queries.
export function installer(origin) {
 const base=new URL('/api/excel/dados',origin).href;
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 const sheets=[['Controlo de Obras','Controlo','ENAT_Controlo',7],['Obras','Obras','ENAT_Obras',1],['Faturas','Faturas','ENAT_Faturas',1],['Materiais','Materiais','ENAT_Materiais',1],['Movimentos','Movimentos','ENAT_Movimentos',1]];
 const lines=[
 'Option Explicit','Dim xl, wb, ws, lo, qt, q, dest, shell, fso, i',
 'Set shell = CreateObject("WScript.Shell")','Set fso = CreateObject("Scripting.FileSystemObject")',
 'dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas.xlsx"',
 'If fso.FileExists(dest) Then',
 ' dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas-" & Year(Now) & Month(Now) & Day(Now) & "-" & Hour(Now) & Minute(Now) & Second(Now) & ".xlsx"',
 'End If',
 'On Error Resume Next','Set xl = CreateObject("Excel.Application")',
 'If Err.Number <> 0 Then',' MsgBox "E necessario ter o Microsoft Excel 2016 ou mais recente instalado no Windows. Consulte o guia na app.", 16, "ENAT"',' WScript.Quit','End If','On Error GoTo 0',
 'xl.Visible = True','Set wb = xl.Workbooks.Add',
 'Do While wb.Worksheets.Count > 1',' xl.DisplayAlerts = False',' wb.Worksheets(wb.Worksheets.Count).Delete',' xl.DisplayAlerts = True','Loop'
 ];
 sheets.forEach(([name,key,table,row],index)=>{
 const m=`let Fonte = Json.Document(Web.Contents("${base}")), Linhas = Fonte[tables][${key}], Tabela = Table.FromRows(List.Skip(Linhas, 1), List.First(Linhas)) in Tabela`;
 lines.push(index?'Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))':'Set ws = wb.Worksheets(1)',
 `ws.Name = ${quote(name)}`,`q = ${quote(m)}`,`wb.Queries.Add ${quote(table)}, q`,
 `Set lo = ws.ListObjects.Add(0, ${quote('OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location='+table+';Extended Properties=""')}, True, 1, ws.Range("A${row}"))`,
 `lo.Name = ${quote(table)}`,`lo.TableStyle = "TableStyleMedium2"`,'Set qt = lo.QueryTable','qt.CommandType = 2',`qt.CommandText = ${quote('SELECT * FROM ['+table+']')}`,
 'qt.BackgroundQuery = False','qt.RefreshOnFileOpen = True','qt.RefreshPeriod = 5','qt.PreserveFormatting = True','qt.AdjustColumnWidth = False','ws.Cells.Font.Name = "Calibri"','ws.Cells.Font.Size = 11','ws.Columns.ColumnWidth = 20','ws.Columns("A:A").ColumnWidth = 34',`ws.Rows(${row}).RowHeight = 32`,'ws.Activate',`ws.Range("A${row+1}").Select`,'xl.ActiveWindow.FreezePanes = True');
 if(!index){
  lines.push('ws.Range("A2:M2").Merge','ws.Range("A2").Value = "ENAT - CONTROLO FINANCEIRO DE OBRAS"','ws.Range("A2").Font.Size = 20','ws.Range("A2").Font.Bold = True','ws.Range("A2").Font.Color = RGB(47,57,93)','ws.Range("A6:M6").Merge','ws.Range("A6").Value = "Atualiza ao abrir e a cada 5 minutos com internet. Estado da Obra acompanha a app."','ws.Range("A6").Font.Size = 10');
  const metrics=[['TOTAL ORCAMENTADO','SUM(ENAT_Controlo[Orçamento c/ IVA])'],['TOTAL DESPESAS','SUM(ENAT_Controlo[Despesas Totais])'],['LUCRO ESTIMADO','SUM(ENAT_Controlo[Lucro Estimado])'],['MARGEM MEDIA','IFERROR(SUM(ENAT_Controlo[Lucro Estimado])/SUM(ENAT_Controlo[Orçamento c/ IVA]),0)'],['VALOR RECEBIDO','SUM(ENAT_Controlo[Valor Pago (Recebido)])'],['SALDO A RECEBER','SUM(ENAT_Controlo[Saldo a Receber])']];
  // Formulas are added after the first refresh, when query column names exist.
  metrics.forEach(([label],n)=>{const a=String.fromCharCode(65+n*2),b=String.fromCharCode(66+n*2);lines.push(`ws.Range("${a}3:${b}3").Merge`,`ws.Range("${a}4:${b}4").Merge`,`ws.Range("${a}3").Value = ${quote(label)}`,`ws.Range("${a}3:${b}4").Interior.Color = RGB(241,244,250)`,`ws.Range("${a}3:${b}4").Font.Bold = True`,`ws.Range("${a}4").Font.Size = 16`)});
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
 metrics.forEach((formula,i)=>lines.push(`ws.Range("${String.fromCharCode(65+i*2)}4").Formula = ${quote('=IFERROR('+formula.replace(/ENAT_Controlo\[[^\]]+\]/g,ref=>'INDIRECT("'+ref+'")')+',0)')}`,`ws.Range("${String.fromCharCode(65+i*2)}4").NumberFormat = ${quote(i===3?'0.0%':'#,##0.00 "€"')}`));
 for(const [name] of sheets){
  lines.push(`Set ws = wb.Worksheets(${quote(name)})`,'ws.ListObjects(1).HeaderRowRange.Interior.Color = RGB(75,92,146)','ws.ListObjects(1).HeaderRowRange.Font.Color = RGB(255,255,255)');
 }
 lines.push('Set ws = wb.Worksheets(1)');
 for(const [col,label,bg,fg] of [['D','Planeamento','232,236,255','59,78,175'],['D','Em Curso','254,243,199','146,64,14'],['D','Pausada','254,226,226','153,27,27'],['M','Pago','220,252,231','21,128,61'],['M','Parcial','254,249,195','133,77,14'],['M','Pendente','254,226,226','185,28,28']]){
  lines.push(`ws.Range("${col}8:${col}1048576").FormatConditions.Add 1, 3, ${quote('="'+label+'"')}`,`With ws.Range("${col}8:${col}1048576").FormatConditions(ws.Range("${col}8:${col}1048576").FormatConditions.Count)`,`.Interior.Color = RGB(${bg})`,`.Font.Color = RGB(${fg})`,'End With');
 }
 lines.push('ws.Range("E8:K1048576").NumberFormat = "#,##0.00"','ws.Range("L8:L1048576").NumberFormat = "0.0%"',
 'ws.Range("D8:D1048576").FormatConditions.Add 1, 3, "=""Concluída"""','ws.Range("D8:D1048576").FormatConditions(ws.Range("D8:D1048576").FormatConditions.Count).Interior.Color = RGB(209,250,229)',
 'wb.Save','On Error GoTo 0','MsgBox "Guarde este ficheiro. As obras e os estados chegam da app por consulta automatica; pode tambem usar Dados > Atualizar Tudo. Se as tabelas estiverem vazias, termine a autenticacao no Excel.", 64, "ENAT"');
 return '\ufeff'+lines.join('\r\n');
}
