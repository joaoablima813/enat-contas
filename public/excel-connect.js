// Cria no Windows, através do Excel instalado, o ficheiro «ENAT-Financas.xlsx» ligado à app:
// - «Painel»: resumo das obras (vendido, custos, lucro, margem, por receber) com filtros clicáveis e gráfico;
// - «Compras»: quanto se comprou a cada fornecedor, por obra, ano e mês;
// - «Artigos»: o que se comprou a cada fornecedor (quantidades, preço médio e total);
// - folhas de dados (Obras, Faturas, Materiais, Movimentos) que se atualizam sozinhas a partir da app.
// O instalador e as consultas não levam nenhuma palavra-passe: o Excel pede-a uma vez (Básico, utilizador «enat»).
export function installer(origin) {
 const base=new URL('/api/excel/dados',origin).href;
 const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
 const EUR='#,##0.00 "€"';
 // Cores ENAT (site e app): verde escuro, verde, laranja, fundo claro.
 const C={dark:'RGB(27,77,46)',green:'RGB(47,125,50)',orange:'RGB(240,128,0)',bg:'RGB(244,247,242)',ink:'RGB(29,43,31)',mute:'RGB(98,112,101)',line:'RGB(220,228,218)',white:'RGB(255,255,255)'};
 const DATA=[
  ['Obras','Obras','ENAT_Obras',['Valor c/ IVA','Valor s/ IVA','Recebido','Por receber','Materiais s/ IVA','Despesas sem fatura','Mão de obra s/ IVA','Custos','Lucro','Margem %','IVA cobrado','IVA suportado','IVA a entregar'],['Conclusão'],[['D:L',EUR],['M:M','0.0%'],['N:P',EUR],['R:R','dd/mm/yyyy']]],
  ['Faturas','Faturas','ENAT_Faturas',['Total s/ IVA','IVA','Total c/ IVA'],['Data'],[['F:H',EUR],['D:D','dd/mm/yyyy']]],
  ['Materiais','Materiais','ENAT_Materiais',['Quantidade','Preço unit. s/ IVA','IVA %','Preço unit. c/ IVA','Total linha s/ IVA'],['Data'],[['H:H','0.###'],['J:J',EUR],['K:K','0%'],['L:M',EUR],['D:D','dd/mm/yyyy']]],
  ['Movimentos','Movimentos','ENAT_Movimentos',['Total c/ IVA','Base s/ IVA','IVA'],['Data'],[['F:H',EUR],['E:E','dd/mm/yyyy']]],
 ];
 const L=[
  'Option Explicit',
  'Dim xl, wb, ws, lo, qt, q, dest, shell, fso, pc, pt, pt2, df, sc, sl, sh, ch, okData, n, x',
  'Set shell = CreateObject("WScript.Shell")','Set fso = CreateObject("Scripting.FileSystemObject")',
  'dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas.xlsx"',
  'If fso.FileExists(dest) Then',' dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas-" & Year(Now) & Right("0" & Month(Now), 2) & Right("0" & Day(Now), 2) & "-" & Hour(Now) & Minute(Now) & ".xlsx"','End If',
  'On Error Resume Next','Set xl = CreateObject("Excel.Application")',
  'If Err.Number <> 0 Then',' MsgBox "É necessário ter o Microsoft Excel (2016 ou mais recente) instalado no Windows.", 16, "ENAT"',' WScript.Quit','End If','On Error GoTo 0',
  'xl.Visible = True','xl.ScreenUpdating = False','Set wb = xl.Workbooks.Add',
  'Do While wb.Worksheets.Count > 1',' xl.DisplayAlerts = False',' wb.Worksheets(wb.Worksheets.Count).Delete',' xl.DisplayAlerts = True','Loop',
  'wb.Worksheets(1).Name = "Painel"',
  'Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))','ws.Name = "Compras"',
  'Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))','ws.Name = "Artigos"',
 ];
 // Folhas de dados ligadas à app.
 for(const [name,key,table,numeric,dates,formats] of DATA){
  const transforms=[...numeric.map(c=>`{"${c}", type number}`),...dates.map(c=>`{"${c}", type date}`)];
  const pct=key==='Obras'?'Margem %':key==='Materiais'?'IVA %':'';
  const m=`let Fonte = Json.Document(Web.Contents("${base}")), Linhas = Fonte[tables][${key}], Tabela = Table.FromRows(List.Skip(Linhas, 1), List.First(Linhas)), Tipos = Table.TransformColumnTypes(Tabela, {${transforms.join(', ')}}, "pt-PT"), Datas = Table.ReplaceErrorValues(Tipos, {${dates.map(c=>`{"${c}", null}`).join(', ')}})${pct?`, Percentagens = Table.TransformColumns(Datas, {{"${pct}", each _ / 100, type number}})`:''} in ${pct?'Percentagens':'Datas'}`;
  L.push('Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))',`ws.Name = ${quote(name)}`,`q = ${quote(m)}`,`wb.Queries.Add ${quote(table)}, q`,
   `Set lo = ws.ListObjects.Add(0, ${quote('OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location='+table+';Extended Properties=""')}, True, 1, ws.Range("A1"))`,
   `lo.Name = ${quote(table)}`,'lo.TableStyle = "TableStyleMedium7"','Set qt = lo.QueryTable','qt.CommandType = 2',`qt.CommandText = ${quote('SELECT * FROM ['+table+']')}`,
   'qt.BackgroundQuery = False','qt.RefreshOnFileOpen = True','qt.RefreshPeriod = 5','qt.PreserveFormatting = True','qt.AdjustColumnWidth = False',
   'ws.Cells.Font.Name = "Calibri"','ws.Columns.ColumnWidth = 16','ws.Columns("A:B").ColumnWidth = 30','ws.Rows(1).RowHeight = 34','ws.Rows(1).WrapText = True','ws.Tab.Color = '+C.mute);
  for(const [range,format] of formats){const [a,b]=range.split(':');L.push(`ws.Range("${a}2:${b}1048576").NumberFormat = ${quote(format)}`)}
  L.push('ws.Activate','ws.Range("A2").Select','xl.ActiveWindow.FreezePanes = True','xl.ActiveWindow.DisplayGridlines = False');
 }
 // Instruções.
 L.push('Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))','ws.Name = "Instruções"','ws.Columns("A:A").ColumnWidth = 110','ws.Tab.Color = '+C.mute,
  ...[
   'ENAT · Excel ligado à app',
   '',
   'Primeira ligação: escolha «Básico», utilizador enat e a palavra-passe criada na app (Definições → Excel).',
   'Para ver os dados mais recentes: separador Dados → Atualizar Tudo (também atualiza ao abrir o ficheiro).',
   'Painel, Compras e Artigos: clique nos botões dos filtros (obra, estado, fornecedor, ano…) para escolher o que ver. Ctrl + clique escolhe vários; o funil com X limpa o filtro.',
   'As folhas Obras, Faturas, Materiais e Movimentos têm todos os dados; use as setas dos cabeçalhos para filtrar ou ordenar.',
   'Altere os dados na app, não no Excel: as tabelas são substituídas sempre que atualizam.',
   'Noutro computador: copie o ficheiro e introduza de novo o utilizador enat e a palavra-passe.',
  ].map((t,i)=>`ws.Range("A${i+1}").Value = ${quote(t)}`),'ws.Range("A1").Font.Size = 16','ws.Range("A1").Font.Bold = True',`ws.Range("A1").Font.Color = ${C.dark}`);
 // Primeira atualização: as tabelas dinâmicas só se podem criar depois de as tabelas terem colunas.
 L.push('wb.SaveAs dest, 51','xl.ScreenUpdating = True',
  'On Error Resume Next','wb.RefreshAll','xl.CalculateUntilAsyncQueriesDone','Err.Clear','On Error GoTo 0',
  'okData = (wb.Worksheets("Obras").ListObjects(1).ListColumns.Count > 5) And (wb.Worksheets("Faturas").ListObjects(1).ListColumns.Count > 5) And (wb.Worksheets("Materiais").ListObjects(1).ListColumns.Count > 5)',
  'If okData Then','xl.ScreenUpdating = False');
 // ---- helpers em VBScript ----
 const title=(sheet,text,sub)=>[`Set ws = wb.Worksheets(${quote(sheet)})`,'x = ws.Range("B8").Left','ws.Activate','xl.ActiveWindow.DisplayGridlines = False','ws.Cells.Font.Name = "Calibri"',`ws.Cells.Interior.Color = ${C.bg}`,'ws.Columns("A:A").ColumnWidth = 2','ws.Tab.Color = '+C.green,
  `ws.Range("B1").Value = ${quote(text)}`,'ws.Range("B1").Font.Size = 22','ws.Range("B1").Font.Bold = True',`ws.Range("B1").Font.Color = ${C.dark}`,'ws.Rows(1).RowHeight = 40',
  `ws.Range("B2").Value = ${quote(sub)}`,`ws.Range("B2").Font.Color = ${C.mute}`,'ws.Range("B2").Font.Size = 10'];
 // Cartão de indicador: título na linha r, valor na linha r+1, nas colunas a:b.
 const card=(a,b,r,label,formula,fmt,color)=>[`ws.Range("${a}${r}:${b}${r}").Merge`,`ws.Range("${a}${r+1}:${b}${r+1}").Merge`,`ws.Range("${a}${r}").Value = ${quote(label)}`,
  `ws.Range("${a}${r}").Font.Size = 9`,`ws.Range("${a}${r}").Font.Bold = True`,`ws.Range("${a}${r}").Font.Color = ${C.mute}`,
  `ws.Range("${a}${r+1}").Formula = ${quote(formula)}`,`ws.Range("${a}${r+1}").NumberFormat = ${quote(fmt)}`,`ws.Range("${a}${r+1}").Font.Size = 20`,`ws.Range("${a}${r+1}").Font.Bold = True`,`ws.Range("${a}${r+1}").Font.Color = ${color||C.ink}`,`ws.Range("${a}${r+1}").HorizontalAlignment = -4131`,`ws.Range("${a}${r}").HorizontalAlignment = -4131`,
  `ws.Range("${a}${r}:${b}${r+1}").Interior.Color = ${C.white}`,`ws.Range("${a}${r}:${b}${r+1}").BorderAround 1, 2, , ${C.line}`,`ws.Rows(${r+1}).RowHeight = 34`];
 // Tabela dinâmica: cache a partir de uma tabela de dados (ou «=pt» para partilhar a da tabela pt, e assim os filtros
 // ligarem às duas); linhas e valores (soma), estilo verde.
 const pivot=(v,cache,dest,name,rows,values,sortBy)=>[
  ...(cache.startsWith('=')?[`Set pc = ${cache.slice(1)}.PivotCache`]:[`Set pc = wb.PivotCaches.Create(1, ${quote(cache)}, 6)`]),`Set ${v} = pc.CreatePivotTable(ws.Range(${quote(dest)}), ${quote(name)}, True, 6)`,
  `${v}.RowAxisLayout 1`,`${v}.ShowTableStyleRowHeaders = False`,`${v}.TableStyle2 = "PivotStyleMedium7"`,`${v}.ShowDrillIndicators = False`,`${v}.HasAutoFormat = False`,`${v}.PivotCache.RefreshOnFileOpen = True`,`${v}.NullString = "0"`,`${v}.GrandTotalName = "Total"`,
  ...rows.flatMap(([f,cap],i)=>[`${v}.PivotFields(${quote(f)}).Orientation = 1`,`${v}.PivotFields(${quote(f)}).Position = ${i+1}`,`${v}.PivotFields(${quote(f)}).Subtotals(1) = ${i<rows.length-1?'True':'False'}`,`${v}.PivotFields(${quote(f)}).RepeatLabels = True`]),
  ...values.flatMap(([f,cap,fn,fmt])=>[`Set df = ${v}.AddDataField(${v}.PivotFields(${quote(f)}), ${quote(cap)}, ${fn||-4157})`,`df.NumberFormat = ${quote(fmt||EUR)}`]),
  ...(sortBy?[`${v}.PivotFields(${quote(rows[0][0])}).AutoSort 2, ${quote(sortBy)}`]:[]),
  // O nome mostrado muda o nome do campo, por isso fica para o fim.
  ...rows.filter(([f,cap])=>f!==cap).map(([f,cap])=>`${v}.PivotFields(${quote(f)}).Caption = ${quote(cap)}`),
 ];
 // Segmentação (filtro com botões) ligada a uma ou mais tabelas dinâmicas.
 const slicer=(pts,field,cap,w,cols)=>[`Set sc = wb.SlicerCaches.Add2(${pts[0]}, ${quote(field)})`,...pts.slice(1).map(p=>`sc.PivotTables.AddPivotTable ${p}`),'sc.CrossFilterType = 2',
  `Set sl = sc.Slicers.Add(ws, , , ${quote(cap)}, ws.Range("B8").Top, x, ${w}, 150)`,'sl.Style = "SlicerStyleLight6"',`sl.NumberOfColumns = ${cols||1}`,'sl.RowHeight = 20',`x = x + ${w} + 12`];
 const chart=(v,cell,w,h,ttl,type,color)=>[`Set sh = ws.Shapes.AddChart2(-1, ${type}, ws.Range(${quote(cell)}).Left, ws.Range(${quote(cell)}).Top, ${w}, ${h})`,'Set ch = sh.Chart',`ch.SetSourceData ${v}.TableRange1`,'ch.ShowAllFieldButtons = False','ch.PlotVisibleOnly = False','ch.HasTitle = True',`ch.ChartTitle.Text = ${quote(ttl)}`,'ch.ChartTitle.Format.TextFrame2.TextRange.Font.Size = 13','ch.ChartTitle.Format.TextFrame2.TextRange.Font.Bold = True','ch.HasLegend = False',
  `ch.FullSeriesCollection(1).Format.Fill.ForeColor.RGB = ${color}`,'ch.ChartGroups(1).GapWidth = 60','ch.FullSeriesCollection(1).HasDataLabels = True','ch.FullSeriesCollection(1).DataLabels.NumberFormatLinked = False',// Formato sem separadores: o Excel lê-o na língua do Windows (em português a vírgula é a casa decimal).
  `ch.FullSeriesCollection(1).DataLabels.NumberFormat = ${quote('0 "€"')}`,'ch.FullSeriesCollection(1).DataLabels.Font.Size = 9','ch.Axes(1).ReversePlotOrder = True','ch.Axes(2).HasMajorGridlines = False','ch.Axes(2).TickLabelPosition = -4142','sh.Line.Visible = False'];
 const gp=(field,cell)=>`IFERROR(GETPIVOTDATA("${field}",${cell}),0)`;

 // ---- Painel (obras e lucros) ----
 L.push(...title('Painel','ENAT · Painel de obras','Escolha nos filtros a obra, o estado ou o cliente. Para os dados mais recentes: Dados → Atualizar Tudo.'),
  'ws.Columns("B:B").ColumnWidth = 42','ws.Columns("C:I").ColumnWidth = 15',
  ...pivot('pt','ENAT_Obras','B19','PT_Obras',[['Obra','Obra']],[['Valor s/ IVA','Vendido s/ IVA '],['Custos','Custos '],['Lucro','Lucro '],['Por receber','Por receber '],['Materiais s/ IVA','Materiais '],['Mão de obra s/ IVA','Mão de obra ']],'Lucro '),
  ...pivot('pt2','=pt','AA16','PT_ObrasGrafico',[['Obra','Obra']],[['Lucro','Lucro por obra']],'Lucro por obra'),
  ...card('B','B',4,'VENDIDO S/ IVA',`=${gp('Vendido s/ IVA ','$B$19')}`,EUR),
  ...card('C','D',4,'CUSTOS',`=${gp('Custos ','$B$19')}`,EUR),
  ...card('E','F',4,'LUCRO',`=${gp('Lucro ','$B$19')}`,EUR,C.green),
  ...card('G','G',4,'MARGEM',`=IFERROR(${gp('Lucro ','$B$19')}/${gp('Vendido s/ IVA ','$B$19')},0)`,'0.0%',C.green),
  ...card('H','I',4,'POR RECEBER',`=${gp('Por receber ','$B$19')}`,EUR,C.orange),
  ...slicer(['pt','pt2'],'Estado','Estado',150),
  ...slicer(['pt','pt2'],'Cliente','Cliente',230),
  ...slicer(['pt','pt2'],'Obra','Obra',330),
   ...chart('pt2','K4',460,520,'Lucro por obra',57,C.green),'ws.Columns("AA:AC").Hidden = True',
  'ws.Range("B18").Value = "Detalhe por obra"','ws.Range("B18").Font.Bold = True','ws.Range("B18").Font.Size = 13',`ws.Range("B18").Font.Color = ${C.dark}`);

 // ---- Compras por fornecedor ----
 L.push(...title('Compras','Compras por fornecedor','Escolha o fornecedor, a obra, o ano ou o mês. Valores das faturas registadas na app.'),
  'ws.Columns("B:B").ColumnWidth = 40','ws.Columns("C:F").ColumnWidth = 15',
  ...pivot('pt','ENAT_Faturas','B19','PT_Compras',[['Loja / fornecedor','Fornecedor']],[['Total s/ IVA','Comprado s/ IVA '],['IVA','IVA '],['Total c/ IVA','Comprado c/ IVA '],['Nº fatura','N.º de faturas',-4112,'0']],'Comprado s/ IVA '),
  ...pivot('pt2','=pt','AA16','PT_ComprasGrafico',[['Loja / fornecedor','Fornecedor']],[['Total s/ IVA','Compras por fornecedor']],'Compras por fornecedor'),
  ...card('B','B',4,'COMPRADO S/ IVA',`=${gp('Comprado s/ IVA ','$B$19')}`,EUR,C.green),
  ...card('C','D',4,'IVA SUPORTADO',`=${gp('IVA ','$B$19')}`,EUR),
  ...card('E','F',4,'N.º DE FATURAS',`=${gp('N.º de faturas','$B$19')}`,'0'),
  ...slicer(['pt','pt2'],'Loja / fornecedor','Fornecedor',250),
  ...slicer(['pt','pt2'],'Obra','Obra',260),
  ...slicer(['pt','pt2'],'Ano','Ano',90),
  ...slicer(['pt','pt2'],'Mês','Mês',170,2),
  ...chart('pt2','H19',420,380,'Compras por fornecedor (s/ IVA)',57,C.orange),'ws.Columns("AA:AC").Hidden = True',
  'ws.Range("B18").Value = "Por fornecedor"','ws.Range("B18").Font.Bold = True','ws.Range("B18").Font.Size = 13',`ws.Range("B18").Font.Color = ${C.dark}`);

 // ---- Artigos comprados ----
 L.push(...title('Artigos','O que comprei a cada fornecedor','Escolha o fornecedor e a obra para ver cada artigo, a quantidade, o preço por unidade (já com descontos) e o total.'),
  'ws.Columns("B:B").ColumnWidth = 38','ws.Columns("C:C").ColumnWidth = 52','ws.Columns("D:F").ColumnWidth = 15',
  ...pivot('pt','ENAT_Materiais','B19','PT_Artigos',[['Loja / fornecedor','Fornecedor'],['Artigo','Artigo']],[['Quantidade','Quantidade ',-4157,'General'],['Total linha s/ IVA','Total s/ IVA ']],'Total s/ IVA '),
  `pt.CalculatedFields.Add "PrecoUnidade", ${quote("='Total linha s/ IVA'/Quantidade")}, True`,`Set df = pt.AddDataField(pt.PivotFields("PrecoUnidade"), "Preço por unidade s/ IVA", -4157)`,`df.NumberFormat = ${quote(EUR)}`,
  ...card('B','B',4,'TOTAL S/ IVA',`=${gp('Total s/ IVA ','$B$19')}`,EUR,C.green),
  ...slicer(['pt'],'Loja / fornecedor','Fornecedor',220),
  ...slicer(['pt'],'Obra','Obra',260),
  ...slicer(['pt'],'Categoria','Categoria',160),
  ...slicer(['pt'],'Ano','Ano',90),
  'ws.Range("B18").Value = "Artigos"','ws.Range("B18").Font.Bold = True','ws.Range("B18").Font.Size = 13',`ws.Range("B18").Font.Color = ${C.dark}`);

 L.push('wb.Worksheets("Painel").Activate','wb.Worksheets("Painel").Range("A1").Select','xl.ScreenUpdating = True','wb.Save',
  'MsgBox "Pronto! O ficheiro ENAT-Financas está no Ambiente de Trabalho. Use os filtros do Painel, das Compras e dos Artigos para escolher a obra ou o fornecedor.", 64, "ENAT"',
  'Else',
  ' wb.Save',
  ' MsgBox "O ficheiro foi criado no Ambiente de Trabalho, mas o Excel ainda não conseguiu ler os dados da app. Confirme a palavra-passe do Excel (utilizador enat, autenticação Básico) e volte a correr este assistente.", 48, "ENAT"',
  'End If');
 return '﻿'+L.join('\r\n');
}
