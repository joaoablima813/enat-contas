// Cria no Windows, através do Excel instalado, o ficheiro «ENAT-Financas.xlsx» ligado à app:
// - «Painel»: cartões (vendido, custos, lucro, margem, por receber), filtros e gráficos «lucro por obra» e «quem me deve»;
// - «Compras»: quanto se comprou a cada fornecedor, top 10 e compras por mês;
// - «Artigos»: o que se comprou a cada fornecedor (quantidade, preço real por unidade e total) e top 10 de artigos;
// - folhas de dados (Obras, Faturas, Materiais, Movimentos) que se atualizam sozinhas a partir da app.
// Aspeto moderno: faixa verde com botões para mudar de folha, cartões, letra Segoe UI, sem grelha nem cabeçalhos,
// estilos do Excel a seguir as cores do tema ENAT (o VBScript não consegue editar estilos próprios).
// O instalador e as consultas não levam nenhuma palavra-passe: o Excel pede-a uma vez (Básico, utilizador «enat»).
export function installer(origin) {
 const base=new URL('/api/excel/dados',origin).href;
 const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
 const EUR='#,##0.00 "€"',EUR0='#,##0 "€"',EUR_C='#,##0.00 "€ c/ IVA"',EUR_S='#,##0.00 "€ s/ IVA"';
 // Cores ENAT: verde escuro, verde forte, laranja forte, grafite (custos), fundo e texto.
 const C={dark:'RGB(22,66,38)',green:'RGB(31,122,58)',orange:'RGB(226,106,0)',graphite:'RGB(72,82,77)',bg:'RGB(243,246,242)',ink:'RGB(28,36,31)',mute:'RGB(104,116,108)',line:'RGB(222,229,220)',white:'RGB(255,255,255)',tint:'RGB(232,242,234)'};
 const DATA=[
  ['Obras','Obras','ENAT_Obras',['Valor c/ IVA','Valor s/ IVA','Recebido','Por receber','Materiais s/ IVA','Despesas sem fatura','Mão de obra s/ IVA','Custos','Lucro','Margem %','IVA cobrado','IVA suportado','IVA a entregar','Custos c/ IVA','Lucro c/ IVA','Por receber s/ IVA'],['Conclusão'],[['D:L',EUR],['M:M','0.0%'],['N:P',EUR],['R:R','dd/mm/yyyy'],['T:V',EUR]]],
  ['Faturas','Faturas','ENAT_Faturas',['Total s/ IVA','IVA','Total c/ IVA'],['Data'],[['F:H',EUR],['D:D','dd/mm/yyyy']]],
  ['Materiais','Materiais','ENAT_Materiais',['Quantidade','Preço unit. s/ IVA','IVA %','Preço unit. c/ IVA','Total linha s/ IVA','Total linha c/ IVA'],['Data'],[['H:H','General'],['J:J',EUR],['K:K','0%'],['L:M',EUR],['D:D','dd/mm/yyyy'],['O:O',EUR]]],
  ['Movimentos','Movimentos','ENAT_Movimentos',['Total c/ IVA','Base s/ IVA','IVA'],['Data'],[['F:H',EUR],['E:E','dd/mm/yyyy']]],
 ];
 const L=[
  'Option Explicit',
  'Dim xl, wb, ws, lo, qt, q, dest, shell, fso, pc, pt, pt2, pt3, pt4, df, sc, sl, sh, ch, okData, x, y, r, i, styleTab, stylePiv, styleSl, lblFmt',
  'Set shell = CreateObject("WScript.Shell")','Set fso = CreateObject("Scripting.FileSystemObject")',
  'dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas.xlsx"',
  'If fso.FileExists(dest) Then',' dest = shell.SpecialFolders("Desktop") & "\\ENAT-Financas-" & Year(Now) & Right("0" & Month(Now), 2) & Right("0" & Day(Now), 2) & "-" & Hour(Now) & Minute(Now) & ".xlsx"','End If',
  'On Error Resume Next','Set xl = CreateObject("Excel.Application")',
  'If Err.Number <> 0 Then',' MsgBox "É necessário ter o Microsoft Excel (2016 ou mais recente) instalado no Windows.", 16, "ENAT"',' WScript.Quit','End If','On Error GoTo 0',
  'xl.Visible = True','xl.ScreenUpdating = False','Set wb = xl.Workbooks.Add',
  'Do While wb.Worksheets.Count > 1',' xl.DisplayAlerts = False',' wb.Worksheets(wb.Worksheets.Count).Delete',' xl.DisplayAlerts = True','Loop',
  // Tema: letra Segoe UI e cores ENAT (também usadas pelos estilos de reserva).
  'On Error Resume Next','wb.Theme.ThemeFontScheme.MinorFont.Item(1).Name = "Segoe UI"','wb.Theme.ThemeFontScheme.MajorFont.Item(1).Name = "Segoe UI"',
  `wb.Theme.ThemeColorScheme.Colors(5).RGB = ${C.green}`,`wb.Theme.ThemeColorScheme.Colors(6).RGB = ${C.orange}`,'Err.Clear',
  // Estilos do Excel que seguem as cores do tema (verde ENAT): cabeçalhos verdes e filtros com botões verdes.
  'styleTab = "TableStyleMedium2"','stylePiv = "PivotStyleMedium2"','styleSl = "SlicerStyleDark1"','On Error GoTo 0',
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
   `lo.Name = ${quote(table)}`,'lo.TableStyle = styleTab','Set qt = lo.QueryTable','qt.CommandType = 2',`qt.CommandText = ${quote('SELECT * FROM ['+table+']')}`,
   'qt.BackgroundQuery = False','qt.RefreshOnFileOpen = True','qt.RefreshPeriod = 5','qt.PreserveFormatting = True','qt.AdjustColumnWidth = False',
   'ws.Cells.Font.Name = "Segoe UI"','ws.Cells.Font.Size = 10','ws.Cells.VerticalAlignment = -4108','ws.Columns.ColumnWidth = 15','ws.Columns("A:B").ColumnWidth = 32','ws.Rows.RowHeight = 20','ws.Rows(1).RowHeight = 34','ws.Rows(1).WrapText = True','ws.Tab.Color = '+C.graphite);
  for(const [range,format] of formats){const [a,b]=range.split(':');L.push(`ws.Range("${a}2:${b}1048576").NumberFormat = ${quote(format)}`)}
  L.push('ws.Activate','ws.Range("A2").Select','xl.ActiveWindow.FreezePanes = True','xl.ActiveWindow.DisplayGridlines = False','xl.ActiveWindow.Zoom = 90');
 }
 // Instruções.
 L.push('Set ws = wb.Worksheets.Add(, wb.Worksheets(wb.Worksheets.Count))','ws.Name = "Instruções"','ws.Cells.Font.Name = "Segoe UI"','ws.Columns("A:A").ColumnWidth = 3','ws.Columns("B:B").ColumnWidth = 120','ws.Tab.Color = '+C.graphite,
  ...[
   'Como usar o Excel da ENAT',
   '',
   '1.  Primeira ligação: escolha «Básico», utilizador enat e a palavra-passe criada na app (Definições → Excel).',
   '2.  Dados mais recentes: separador Dados → Atualizar Tudo. Também atualiza sozinho ao abrir o ficheiro.',
   '3.  Painel, Compras e Artigos: carregue nos botões dos filtros para escolher obra, estado, cliente, fornecedor, ano ou mês.',
   '      Ctrl + clique escolhe vários. O funil com X, no canto do filtro, volta a mostrar tudo.',
   '4.  Os botões no topo mudam de folha. «Dados» abre as tabelas completas (com setas para filtrar e ordenar).',
   '5.  Altere os dados na app, não aqui: as tabelas são substituídas sempre que atualizam.',
   '6.  Noutro computador: copie o ficheiro e introduza de novo o utilizador enat e a palavra-passe.',
  ].map((t,i)=>`ws.Range("B${i+2}").Value = ${quote(t)}`),'ws.Range("B2").Font.Size = 18','ws.Range("B2").Font.Bold = True',`ws.Range("B2").Font.Color = ${C.dark}`,'ws.Activate','xl.ActiveWindow.DisplayGridlines = False','xl.ActiveWindow.DisplayHeadings = False');
 // Primeira atualização: as tabelas dinâmicas só se podem criar depois de as tabelas terem colunas.
 L.push('wb.SaveAs dest, 51','xl.ScreenUpdating = True',
  'On Error Resume Next','wb.RefreshAll','xl.CalculateUntilAsyncQueriesDone','Err.Clear','On Error GoTo 0',
  'okData = (wb.Worksheets("Obras").ListObjects(1).ListColumns.Count > 5) And (wb.Worksheets("Faturas").ListObjects(1).ListColumns.Count > 5) And (wb.Worksheets("Materiais").ListObjects(1).ListColumns.Count > 5)',
  'If okData Then','xl.ScreenUpdating = False',
  // Rótulos dos gráficos no formato do Windows (em português: espaço nos milhares).
  'lblFmt = "#" & xl.International(4) & "##0 ""€"""');

 // ---- helpers ----
 // Tabela dinâmica (cache novo a partir de uma tabela, ou «=pt» para partilhar a de pt e os filtros ligarem às duas).
 const pivot=(v,cache,dest,name,rows,values,opts={})=>[
  ...(cache.startsWith('=')?[`Set pc = ${cache.slice(1)}.PivotCache`]:[`Set pc = wb.PivotCaches.Create(1, ${quote(cache)}, 6)`]),`Set ${v} = pc.CreatePivotTable(${dest}, ${quote(name)}, True, 6)`,
  `${v}.RowAxisLayout 1`,`${v}.TableStyle2 = stylePiv`,`${v}.ShowTableStyleRowHeaders = False`,`${v}.ShowTableStyleRowStripes = True`,`${v}.ShowDrillIndicators = False`,`${v}.HasAutoFormat = False`,`${v}.PivotCache.RefreshOnFileOpen = True`,`${v}.NullString = "0"`,`${v}.GrandTotalName = "Total"`,
  ...(opts.noTotal?[`${v}.ColumnGrand = False`,`${v}.RowGrand = False`]:[]),
  ...rows.flatMap(([f],i)=>[`${v}.PivotFields(${quote(f)}).Orientation = 1`,`${v}.PivotFields(${quote(f)}).Position = ${i+1}`,`${v}.PivotFields(${quote(f)}).Subtotals(1) = ${i<rows.length-1?'True':'False'}`,`${v}.PivotFields(${quote(f)}).RepeatLabels = True`]),
  ...values.flatMap(([f,cap,fn,fmt])=>[`Set df = ${v}.AddDataField(${v}.PivotFields(${quote(f)}), ${quote(cap)}, ${fn||-4157})`,`df.NumberFormat = ${quote(fmt||EUR)}`]),
  ...(opts.sortBy?[`${v}.PivotFields(${quote(rows[0][0])}).AutoSort 2, ${quote(opts.sortBy)}`]:[]),
  ...(opts.top?[`${v}.PivotFields(${quote(rows[0][0])}).PivotFilters.Add2 1, df, ${opts.top}`]:[]),
  ...(opts.positive?[`${v}.PivotFields(${quote(rows[0][0])}).PivotFilters.Add2 9, df, 0`]:[]),
  // O nome mostrado muda o nome do campo, por isso fica para o fim.
  ...rows.filter(([f,cap])=>f!==cap).map(([f,cap])=>`${v}.PivotFields(${quote(f)}).Caption = ${quote(cap)}`),
 ];
 // Filtro com botões, ligado a uma ou mais tabelas dinâmicas; ficam lado a lado (x acumulado).
 const slicer=(pts,field,cap,w,cols)=>[`Set sc = wb.SlicerCaches.Add2(${pts[0]}, ${quote(field)})`,...pts.slice(1).map(p=>`Ligar sc, ${p}`),'sc.CrossFilterType = 2',
  `Set sl = sc.Slicers.Add(ws, , , ${quote(cap)}, y, x, ${w}, 150)`,'sl.Style = styleSl',`sl.NumberOfColumns = ${cols||1}`,'sl.RowHeight = 22',`x = x + ${w} + 10`];
 // Gráfico a partir de uma tabela dinâmica, com as cores dadas para cada série.
 const chart=(v,left,top,w,h,ttl,type,colors,labels='last')=>[`Set sh = ws.Shapes.AddChart2(-1, ${type}, ${left}, ${top}, ${w}, ${h})`,'Set ch = sh.Chart',`ch.SetSourceData ${v}.TableRange1`,`StyleChart ch, ${quote(ttl)}`,
  ...colors.map((c,i)=>`ch.FullSeriesCollection(${i+1}).Format.Fill.ForeColor.RGB = ${c}`),
  `ch.HasLegend = ${colors.length>1?'True':'False'}`,...(colors.length>1?['ch.Legend.Position = -4160','ch.Legend.Format.TextFrame2.TextRange.Font.Size = 9']:[]),
  ...(labels?[`i = ${labels==='last'?'ch.FullSeriesCollection.Count':1}`,'ch.FullSeriesCollection(i).HasDataLabels = True','ch.FullSeriesCollection(i).DataLabels.NumberFormatLinked = False','ch.FullSeriesCollection(i).DataLabels.NumberFormatLocal = lblFmt','ch.FullSeriesCollection(i).DataLabels.Font.Size = 9',...(type===51||type===57?['ch.FullSeriesCollection(i).DataLabels.Position = 2']:[]),'ch.FullSeriesCollection(i).DataLabels.Font.Bold = True',`ch.FullSeriesCollection(i).DataLabels.Font.Color = ${C.ink}`]:[]),
  ...(type===57||type===58?['ch.Axes(1).ReversePlotOrder = True','ch.PlotArea.Width = ch.PlotArea.Width - 46']:[])];
 // Cartões: valor grande (com IVA) e, se houver, valor pequeno por baixo (sem IVA). Os valores ficam em células de apoio
 // na coluna AR e os cartões mostram essas células, por isso acompanham os filtros.
 let cel=3;
 const card=(label,big,small,accent,color)=>{const lines=[],cell=([f,fmt])=>{const k='AR'+(++cel);lines.push(`ws.Range(${quote(k)}).Formula = ${f}`,`ws.Range(${quote(k)}).NumberFormat = ${quote(fmt)}`,`ws.Range(${quote(k)}).Font.Color = ${C.bg}`);return k};
  const kb=cell(big),ks=small?cell(small):'';
  return [...lines,`Card ws, x, y, 172, ${quote(label)}, ${quote(kb)}, ${quote(ks)}, ${accent||C.dark}, ${color||C.ink}`,'x = x + 180']};
 const gp=(field,v='pt')=>`"=IFERROR(GETPIVOTDATA(""${field}""," & ${v}.TableRange1.Cells(1, 1).Address & "),0)"`;
 // Disposição (pontos a partir da linha 4): cartões, filtros, gráficos lado a lado; a tabela começa por baixo.
 const SLICER_Y=104,CHART_Y=270,CHART_H=300,CHART_W=438;
 // Posição da tabela principal: primeira linha abaixo dos filtros.
 const below=(px)=>['r = 4',`Do While ws.Rows(r).Top < ${px}`,' r = r + 1','Loop'];
 const section=(text)=>[`ws.Cells(r, 2).Value = ${quote(text)}`,'ws.Cells(r, 2).Font.Size = 12','ws.Cells(r, 2).Font.Bold = True',`ws.Cells(r, 2).Font.Color = ${C.dark}`,'ws.Rows(r).RowHeight = 24'];

 // ---- Painel (obras e lucros) ----
 // De cima para baixo, numa largura que cabe no ecrã: cartões, filtros, dois gráficos lado a lado e a tabela por obra.
 L.push('Set ws = wb.Worksheets("Painel")','Header ws, "Painel de obras", "Vendido, custos e lucro de cada obra. Use os filtros para escolher.", "Painel"',
  'ws.Columns("B:B").ColumnWidth = 40','ws.Columns("C:H").ColumnWidth = 12',
  ...below(CHART_Y+CHART_H+16),...section('Detalhe por obra'),
  ...pivot('pt','ENAT_Obras','ws.Cells(r + 1, 2)','PT_Obras',[['Obra','Obra']],[['Valor s/ IVA','Vendido s/ IVA ',-4157,EUR0],['Custos','Custos ',-4157,EUR0],['Lucro','Lucro ',-4157,EUR0],['Por receber','Por receber ',-4157,EUR0],['Materiais s/ IVA','Materiais ',-4157,EUR0],['Mão de obra s/ IVA','Mão de obra ',-4157,EUR0]],{sortBy:'Lucro '}),
  'ws.Range(ws.Rows(r + 1), ws.Rows(r + 400)).RowHeight = 20',
  ...pivot('pt2','=pt','ws.Range("AA4")','PT_ObrasGrafico',[['Obra','Obra']],[['Lucro','Lucro ']],{sortBy:'Lucro ',noTotal:true,top:10}),
  ...pivot('pt3','=pt','ws.Range("AE4")','PT_PorReceber',[['Obra','Obra']],[['Por receber','Por receber ']],{sortBy:'Por receber ',noTotal:true,positive:true}),
  // Valores com IVA para os cartões (tabela escondida, ligada aos mesmos filtros).
  ...pivot('pt4','=pt','ws.Range("AH4")','PT_ComIVA',[['Obra','Obra']],[['Valor c/ IVA','Vendido c/ IVA '],['Custos c/ IVA','Custos c/ IVA '],['Lucro c/ IVA','Lucro c/ IVA '],['Por receber','Por receber c/ IVA '],['Por receber s/ IVA','Por receber s/ IVA ']]),
  'x = ws.Range("B4").Left','y = ws.Range("B4").Top + 6',
  ...card('VENDIDO',[gp('Vendido c/ IVA ','pt4'),EUR_C],[gp('Vendido s/ IVA '),EUR_S],C.dark),
  ...card('CUSTOS',[gp('Custos c/ IVA ','pt4'),EUR_C],[gp('Custos '),EUR_S],C.graphite),
  ...card('LUCRO',[gp('Lucro c/ IVA ','pt4'),EUR_C],[gp('Lucro '),EUR_S],C.green,C.green),
  ...card('MARGEM',[`"=IFERROR(" & Mid(${gp('Lucro c/ IVA ','pt4')}, 2) & "/" & Mid(${gp('Vendido c/ IVA ','pt4')}, 2) & ",0)"`,'0.0% "c/ IVA"'],[`"=IFERROR(" & Mid(${gp('Lucro ')}, 2) & "/" & Mid(${gp('Vendido s/ IVA ')}, 2) & ",0)"`,'0.0% "s/ IVA"'],C.green,C.green),
  ...card('POR RECEBER',[gp('Por receber c/ IVA ','pt4'),EUR_C],[gp('Por receber s/ IVA ','pt4'),EUR_S],C.orange,C.orange),
  'x = ws.Range("B4").Left',`y = ws.Range("B4").Top + ${SLICER_Y}`,
  ...slicer(['pt','pt2','pt3','pt4'],'Estado','Estado',150),
  ...slicer(['pt','pt2','pt3','pt4'],'Cliente','Cliente',300),
  ...slicer(['pt','pt2','pt3','pt4'],'Obra','Obra',420),
  ...chart('pt2','ws.Range("B4").Left',`ws.Range("B4").Top + ${CHART_Y}`,CHART_W,CHART_H,'Lucro por obra (top 10, s/ IVA)',57,[C.green],'first'),
  ...chart('pt3',`ws.Range("B4").Left + ${CHART_W+14}`,`ws.Range("B4").Top + ${CHART_Y}`,CHART_W,CHART_H,'Quem me deve (por receber, c/ IVA)',57,[C.orange],'first'),
  'ws.Columns("AA:AP").Hidden = True','ws.Range("A1").Select');

 // ---- Compras por fornecedor ----
 L.push('Set ws = wb.Worksheets("Compras")','Header ws, "Compras por fornecedor", "Quanto comprei a cada fornecedor, por obra e por mês.", "Compras"',
  'ws.Columns("B:B").ColumnWidth = 44','ws.Columns("C:F").ColumnWidth = 14',
  ...below(CHART_Y+CHART_H+16),...section('Por fornecedor'),
  ...pivot('pt','ENAT_Faturas','ws.Cells(r + 1, 2)','PT_Compras',[['Loja / fornecedor','Fornecedor']],[['Total s/ IVA','Comprado s/ IVA '],['IVA','IVA '],['Total c/ IVA','Comprado c/ IVA '],['Nº fatura','N.º de faturas',-4112,'0']],{sortBy:'Comprado s/ IVA '}),
  'ws.Range(ws.Rows(r + 1), ws.Rows(r + 400)).RowHeight = 20',
  ...pivot('pt2','=pt','ws.Range("AA4")','PT_ComprasTop',[['Loja / fornecedor','Fornecedor']],[['Total s/ IVA','Comprado s/ IVA']],{sortBy:'Comprado s/ IVA',noTotal:true,top:10}),
  ...pivot('pt3','=pt','ws.Range("AE4")','PT_ComprasMes',[['Mês','Mês']],[['Total s/ IVA','Comprado no mês']],{noTotal:true}),
  'x = ws.Range("B4").Left','y = ws.Range("B4").Top + 6',
  ...card('COMPRADO',[gp('Comprado c/ IVA '),EUR_C],[gp('Comprado s/ IVA '),EUR_S],C.orange,C.orange),
  ...card('IVA SUPORTADO',[gp('IVA '),EUR]),
  ...card('N.º DE FATURAS',[gp('N.º de faturas'),'0']),
  'x = ws.Range("B4").Left',`y = ws.Range("B4").Top + ${SLICER_Y}`,
  ...slicer(['pt','pt2','pt3'],'Loja / fornecedor','Fornecedor',300),
  ...slicer(['pt','pt2','pt3'],'Obra','Obra',260),
  ...slicer(['pt','pt2','pt3'],'Ano','Ano',90),
  ...slicer(['pt','pt2','pt3'],'Mês','Mês',170,2),
  ...chart('pt2','ws.Range("B4").Left',`ws.Range("B4").Top + ${CHART_Y}`,CHART_W,CHART_H,'Top 10 fornecedores (s/ IVA)',57,[C.orange],'first'),
  ...chart('pt3',`ws.Range("B4").Left + ${CHART_W+14}`,`ws.Range("B4").Top + ${CHART_Y}`,CHART_W,CHART_H,'Compras por mês (s/ IVA)',51,[C.green],'first'),
  'ws.Columns("AA:AP").Hidden = True','ws.Range("A1").Select');

 // ---- Artigos comprados ----
 L.push('Set ws = wb.Worksheets("Artigos")','Header ws, "O que comprei", "Cada artigo por fornecedor: quantidade, preço real por unidade (com descontos) e total.", "Artigos"',
  'ws.Columns("B:B").ColumnWidth = 34','ws.Columns("C:C").ColumnWidth = 52','ws.Columns("D:E").ColumnWidth = 14','ws.Columns("F:G").ColumnWidth = 22',
  ...below(CHART_Y+CHART_H+16),...section('Artigos'),
  ...pivot('pt','ENAT_Materiais','ws.Cells(r + 1, 2)','PT_Artigos',[['Loja / fornecedor','Fornecedor'],['Artigo','Artigo']],[['Quantidade','Quantidade ',-4157,'General'],['Total linha s/ IVA','Total s/ IVA '],['Total linha c/ IVA','Total c/ IVA ']],{sortBy:'Total s/ IVA '}),
  `pt.CalculatedFields.Add "PrecoUnidade", ${quote("='Total linha s/ IVA'/Quantidade")}, True`,`Set df = pt.AddDataField(pt.PivotFields("PrecoUnidade"), "Preço por unidade s/ IVA", -4157)`,`df.NumberFormat = ${quote(EUR)}`,
  'ws.Range(ws.Rows(r + 1), ws.Rows(r + 600)).RowHeight = 20',
  ...pivot('pt2','=pt','ws.Range("AA4")','PT_ArtigosTop',[['Artigo','Artigo']],[['Total linha s/ IVA','Total']],{sortBy:'Total',noTotal:true,top:10}),
  'x = ws.Range("B4").Left','y = ws.Range("B4").Top + 6',
  ...card('TOTAL COMPRADO',[gp('Total c/ IVA '),EUR_C],[gp('Total s/ IVA '),EUR_S],C.orange,C.orange),
  'x = ws.Range("B4").Left',`y = ws.Range("B4").Top + ${SLICER_Y}`,
  ...slicer(['pt','pt2'],'Loja / fornecedor','Fornecedor',260),
  ...slicer(['pt','pt2'],'Obra','Obra',260),
  ...slicer(['pt','pt2'],'Categoria','Categoria',190),
  ...slicer(['pt','pt2'],'Ano','Ano',90),
  ...chart('pt2','ws.Range("B4").Left',`ws.Range("B4").Top + ${CHART_Y}`,CHART_W*2+14,CHART_H,'Top 10 artigos (s/ IVA)',57,[C.green],'first'),
  'ws.Columns("AA:AP").Hidden = True','ws.Range("A1").Select');

 L.push('wb.Worksheets("Painel").Activate','xl.ScreenUpdating = True','wb.Save',
  'MsgBox "Pronto! O ficheiro ENAT-Financas está no Ambiente de Trabalho. Use os botões do topo para mudar de folha e os filtros para escolher a obra ou o fornecedor.", 64, "ENAT"',
  'Else',
  ' wb.Save',
  ' MsgBox "O ficheiro foi criado no Ambiente de Trabalho, mas o Excel ainda não conseguiu ler os dados da app. Confirme a palavra-passe do Excel (utilizador enat, autenticação Básico) e volte a correr este assistente.", 48, "ENAT"',
  'End If',
  '',
  // ---- sub-rotinas VBScript ----
  // Faixa do topo: título, subtítulo e botões para mudar de folha.
  'Sub Header(ws, title, subtitle, current)',
  ' Dim s, n, nx',
  ' ws.Activate',' xl.ActiveWindow.DisplayGridlines = False',' xl.ActiveWindow.DisplayHeadings = False',' xl.ActiveWindow.Zoom = 90',
  ' ws.Cells.Font.Name = "Segoe UI"',' ws.Cells.Font.Size = 10',` ws.Cells.Interior.Color = ${C.bg}`,' ws.Columns("A:A").ColumnWidth = 2',` ws.Tab.Color = ${C.green}`,
  ` ws.Range("A1:AI2").Interior.Color = ${C.dark}`,' ws.Rows(1).RowHeight = 40',' ws.Rows(2).RowHeight = 22',' ws.Rows(3).RowHeight = 10',
  ' ws.Range("B1").Value = title',' ws.Range("B1").Font.Size = 20',' ws.Range("B1").Font.Bold = True',` ws.Range("B1").Font.Color = ${C.white}`,' ws.Range("B1").VerticalAlignment = -4107',
  ' ws.Range("B2").Value = subtitle',' ws.Range("B2").Font.Size = 10',' ws.Range("B2").Font.Color = RGB(186,214,193)',' ws.Range("B2").VerticalAlignment = -4160',
  ' nx = 560',
  ' For Each n In Array("Painel", "Compras", "Artigos", "Dados")',
  '  Set s = ws.Shapes.AddShape(5, nx, 14, 84, 26)',
  '  s.Adjustments.Item(1) = 0.5','  s.Line.Visible = False',
  '  If n = current Then',`   s.Fill.ForeColor.RGB = ${C.orange}`,'  Else','   s.Fill.ForeColor.RGB = RGB(45,96,62)','  End If',
  '  s.TextFrame2.TextRange.Text = n','  s.TextFrame2.TextRange.Font.Size = 10','  s.TextFrame2.TextRange.Font.Bold = True',`  s.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = ${C.white}`,
  '  s.TextFrame2.TextRange.ParagraphFormat.Alignment = 2','  s.TextFrame2.VerticalAnchor = 3','  s.TextFrame2.MarginLeft = 0','  s.TextFrame2.MarginRight = 0',
  '  If n = "Dados" Then','   ws.Hyperlinks.Add s, "", "\'Obras\'!A1", "Tabelas completas"','  Else','   ws.Hyperlinks.Add s, "", "\'" & n & "\'!A1", n','  End If',
  '  nx = nx + 90',
  ' Next',
  'End Sub',
  // Cartão com o valor de uma célula (o texto acompanha a célula quando os filtros mudam).
  'Sub Card(ws, cx, cy, w, label, cellBig, cellSmall, accent, color)',
  ' Dim s, t',
  ' Set s = ws.Shapes.AddShape(5, cx, cy, w, 88)',` s.Fill.ForeColor.RGB = ${C.white}`,` s.Line.ForeColor.RGB = ${C.line}`,' s.Line.Weight = 0.75',' s.Adjustments.Item(1) = 0.08',
  ' Set s = ws.Shapes.AddShape(1, cx, cy + 14, 4, 60)',' s.Fill.ForeColor.RGB = accent',' s.Line.Visible = False',
  ' Set t = ws.Shapes.AddTextbox(1, cx + 14, cy + 10, w - 20, 16)',' Plain t',' t.TextFrame2.TextRange.Text = label',' t.TextFrame2.TextRange.Font.Size = 8',' t.TextFrame2.TextRange.Font.Bold = True',` t.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = ${C.mute}`,
  ' Set t = ws.Shapes.AddTextbox(1, cx + 14, cy + 28, w - 18, 26)',' Plain t',' t.DrawingObject.Formula = "=" & cellBig',' t.TextFrame2.TextRange.Font.Size = 15',' t.TextFrame2.TextRange.Font.Bold = True',' t.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = color',
  ' If cellSmall <> "" Then',
  '  Set t = ws.Shapes.AddTextbox(1, cx + 14, cy + 58, w - 18, 18)','  Plain t','  t.DrawingObject.Formula = "=" & cellSmall','  t.TextFrame2.TextRange.Font.Size = 10',`  t.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = ${C.mute}`,
  ' End If',
  'End Sub',
  // Liga um filtro a outra tabela dinâmica; se o Excel ainda estiver ocupado com as tabelas novas, tenta de novo.
  'Sub Ligar(sc, p)',' Dim k',' On Error Resume Next',' For k = 1 To 20','  Err.Clear','  sc.PivotTables.AddPivotTable p','  If Err.Number = 0 Then Exit Sub','  WScript.Sleep 500',' Next',' On Error GoTo 0','End Sub',
  'Sub Plain(t)',' t.Fill.Visible = False',' t.Line.Visible = False',' t.TextFrame2.MarginLeft = 0',' t.TextFrame2.MarginRight = 0',' t.TextFrame2.MarginTop = 0',' t.TextFrame2.MarginBottom = 0',' t.TextFrame2.WordWrap = False',' t.TextFrame2.TextRange.Font.Name = "Segoe UI"','End Sub',
  // Gráfico limpo: título forte, sem grelha nem eixo de valores (os valores estão nas barras).
  'Sub StyleChart(ch, title)',
  ' ch.ShowAllFieldButtons = False',' ch.PlotVisibleOnly = False',' ch.HasTitle = True',' ch.ChartTitle.Text = title',
  ' ch.ChartTitle.Format.TextFrame2.TextRange.Font.Size = 13',' ch.ChartTitle.Format.TextFrame2.TextRange.Font.Bold = True',` ch.ChartTitle.Format.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = ${C.ink}`,
  ' ch.ChartArea.Format.TextFrame2.TextRange.Font.Name = "Segoe UI"',` ch.ChartArea.Format.Fill.ForeColor.RGB = ${C.white}`,` ch.ChartArea.Format.Line.ForeColor.RGB = ${C.line}`,' ch.ChartArea.RoundedCorners = True',
  ' ch.ChartGroups(1).GapWidth = 45',' ch.ChartGroups(1).Overlap = 100',
  ' ch.Axes(2).HasMajorGridlines = False',' ch.Axes(2).TickLabelPosition = -4142',' ch.Axes(2).Format.Line.Visible = False',
  ' ch.Axes(1).TickLabels.Font.Size = 9',` ch.Axes(1).TickLabels.Font.Color = ${C.ink}`,` ch.Axes(1).Format.Line.ForeColor.RGB = ${C.line}`,
  'End Sub');
 return '﻿'+L.join('\r\n');
}
