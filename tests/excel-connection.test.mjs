import test from 'node:test';
import assert from 'node:assert/strict';
import { excelData } from '../netlify/lib/excel-data.mjs';
import { readBasic, handleExcel } from '../netlify/lib/excel-access.mjs';
import { installer } from '../public/excel-connect.js';
const state=()=>({vat:23,obras:[{id:'a',name:'Obra A',client:'Cliente',valor:1230,status:'em_curso'}],tx:[{id:'r',obra:'a',type:'recebimento',total:500,date:'2026-10-26'},{id:'f',obra:'a',type:'fatura',total:123,rate:23,date:'2026-10-26'}],inv:[{id:'i',obra:'a',tx:'f',store:'Loja',date:'2026-10-26',items:[{name:'Tubo',qty:2,unit:'m',unit_price:50,vat:23,total:100}]}]});
test('connected tables reflect additions and completion from saved state',()=>{
 const s=state();let data=excelData(s);assert.equal(data.tables.Controlo[1][3],'Em Curso');assert.equal(data.tables.Controlo[1][5],123);assert.equal(data.tables.Controlo[1][7],207);assert.equal(data.tables.Controlo[1][10],900);assert.equal(data.tables.Controlo[1][12],'Parcial');
 s.obras[0].status='concluida';s.obras.push({id:'b',name:'Nova',valor:100,status:'orcamento'});
 s.tx.push({id:'f2',obra:'a',type:'fatura',total:246,rate:23,date:'2026-10-26'});s.inv.push({obra:'a',tx:'f2',store:'Outra',items:[]});
 data=excelData(s);assert.equal(data.tables.Controlo.length,3);assert.equal(data.tables.Controlo[1][3],'Concluída');assert.equal(data.tables.Obras[1][2],'Concluída');assert.equal(data.tables.Controlo[2][3],'Planeamento');assert.equal(data.tables.Controlo[1][5],369);assert.equal(data.tables.Faturas.length,3);assert.equal(data.tables.Materiais.length,2);
});
test('empty data, VAT credit, overpayment and billed labour remain consistent',()=>{
 assert.equal(excelData({}).tables.Controlo.length,1);
 const s=state();s.tx.push({obra:'a',type:'mao_obra',total:123,billing:'faturado',date:'2026-10-26'});let row=excelData(s).tables.Controlo[1];assert.equal(row[5],246);assert.equal(row[6],46);
 s.tx.push({obra:'a',type:'recebimento',total:1000,date:'2026-10-26'},{obra:'a',type:'fatura',total:2460,rate:23,date:'2026-10-26'});row=excelData(s).tables.Controlo[1];assert.equal(row[7],0);assert.equal(row[9],0);assert.equal(row[12],'Pago');
});
test('no auth parser accepts a session, arbitrary username or malformed password',()=>{
 for(const value of [null,'Bearer abc','Basic '+Buffer.from('other:abc').toString('base64'),'Basic '+Buffer.from('enat:short').toString('base64')])assert.equal(readBasic(value),null);
});
test('data route refuses writes and cannot use app session as Excel credentials',async()=>{
 const store={get(){throw Error('must not read state')}};
 const response=await handleExcel(new Request('https://example.org/api/excel/dados',{method:'PUT'}),'excel/dados',store,true);assert.equal(response.status,405);
 const denied=await handleExcel(new Request('https://example.org/api/excel/dados'),'excel/dados',store,true);assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/Basic/);assert.equal(denied.headers.get('cache-control'),'no-store');
});
test('installer keeps credentials outside queries and creates a portable macro-free workbook',()=>{
 const script=installer('https://example.org');assert.ok(script.startsWith('﻿'));assert.match(script,/wb.SaveAs dest, 51/);assert.match(script,/qt.RefreshPeriod = 5/);assert.match(script,/qt.RefreshOnFileOpen = True/);assert.ok(!script.includes('Authorization'));assert.ok(!script.includes('x-session'));
 // VBScript string literals use doubled quotes. Check all lines balance.
 for(const line of script.split('\r\n'))assert.equal((line.match(/"/g)||[]).length%2,0,line);
});
test('workbook has a modern interactive dashboard: header with sheet buttons, cards, shared slicers and clear charts',()=>{
 const script=installer('https://example.org');
 for(const s of ['Painel','Compras','Artigos','Obras','Faturas','Materiais','Movimentos','Instruções'])assert.match(script,new RegExp(`Name = "${s}"`));
 assert.equal((script.match(/Table.TransformColumnTypes/g)||[]).length,4);
 for(const t of ['ENAT_Obras','ENAT_Faturas','ENAT_Materiais'])assert.match(script,new RegExp(`PivotCaches.Create\\(1, "${t}", 6\\)`));
 // Chart pivots share the main pivot's cache, so one slicer filters table, cards and charts together.
 assert.equal((script.match(/Set pc = pt.PivotCache/g)||[]).length,6);
 assert.equal((script.match(/Filtro Array\(pt, pt2, pt3/g)||[]).length,7);assert.ok(script.includes('Sub Ligar(sc, p)'));
 for(const f of ['Estado','Cliente','Obra','Loja / fornecedor','Ano','Mês','Categoria'])assert.ok(script.includes(`, "${f}", "`),f);
 // Excel sometimes ignores the first requests right after building the pivots: the filter step retries and never stops the installer.
 assert.ok(script.includes('Sub Filtro(pts, field, cap, w, cols)'));assert.ok(script.includes('If wb.SlicerCaches.Count = n Then Set c = wb.SlicerCaches.Add2(p0, field)'));assert.ok(script.includes('WScript.Sleep 500'));
 // Theme in ENAT colours and Segoe UI; built-in styles follow the theme.
 assert.match(script,/ThemeColorScheme.Colors\(5\).RGB = RGB\(31,122,58\)/);assert.match(script,/MinorFont.Item\(1\).Name = "Segoe UI"/);
 assert.match(script,/styleSl = "SlicerStyleDark1"/);assert.ok(!script.includes('TableElements'),'VBScript cannot edit style elements');
 // Header with buttons that jump between sheets, and cards linked to cells.
 assert.match(script,/Sub Header\(ws, title, subtitle, current\)/);assert.match(script,/ws.Hyperlinks.Add s, "", "'" & n & "'!A1", n/);
 assert.match(script,/t.DrawingObject.Formula = "=" & cellBig/);assert.match(script,/t.DrawingObject.Formula = "=" & cellSmall/);
 // Cards: value with VAT in large, without VAT in small, each with its label; sheet buttons next to the title.
 assert.ok(script.includes('NumberFormat = "#,##0.00 ""€ c/ IVA"""'));assert.ok(script.includes('NumberFormat = "#,##0.00 ""€ s/ IVA"""'));assert.match(script,/nx = 560/);
 assert.ok(script.includes('GETPIVOTDATA(""Lucro c/ IVA ""," & pt4.TableRange1'));assert.ok(script.includes('GETPIVOTDATA(""Lucro ""," & pt.TableRange1.Cells(1, 1).Address'));
 // Charts: top 10 and value filters (9 = greater than), labels in the Windows number format.
 for(const t of ['Lucro por obra (top 10, s/ IVA)','Quem me deve (por receber, c/ IVA)','Top 10 fornecedores (s/ IVA)','Compras por mês (s/ IVA)','Top 10 artigos (s/ IVA)'])assert.ok(script.includes(t),t);
 assert.match(script,/PivotFilters.Add2 9, df, 0/);assert.match(script,/PivotFilters.Add2 1, df, 10/);
 assert.match(script,/lblFmt = "#" & xl.International\(4\) & "##0 ""€"""/);
 assert.match(script,/CalculatedFields.Add "PrecoUnidade"/);
 // Captions rename the field, so they come after every other use of the source name.
 const L=script.split('\r\n'),cap=L.findIndex(l=>l.includes('PivotFields("Loja / fornecedor").Caption'));
 assert.ok(cap>L.findIndex(l=>l.includes('PivotFields("Loja / fornecedor").AutoSort')));
 // Without data (no password yet) the dashboard is skipped and the user is told what to do.
 assert.match(script,/If okData Then/);
});
test('purchases: one name per supplier (accents, case and short names), year and month for filtering',()=>{
 const s={obras:[{id:'a',name:'Obra A',valor:100,status:'em_curso'}],tx:[{id:'f1',obra:'a',type:'fatura',total:123,rate:23},{id:'f2',obra:'a',type:'fatura',total:246,rate:23},{id:'f3',obra:'a',type:'fatura',total:12.3,rate:23}],
  inv:[{obra:'a',tx:'f1',store:'ANTONIO MATOS, LDA',nif:'500000984',date:'2026-10-02',items:[]},{obra:'a',tx:'f2',store:'ANTÓNIO MATOS, LDA',date:'2026-11-05',items:[{name:'Tubo',qty:2,unit:'m',unit_price:50,vat:23,total:100}]},{obra:'a',tx:'f3',store:'sanitop',nif:'500000984',date:'2026-11-06',items:[]}]};
 const T=excelData(s).tables;
 assert.deepEqual(T.Faturas[0].slice(-2),['Ano','Mês']);
 assert.deepEqual(T.Faturas.slice(1).map(r=>[r[1],r[9],r[10]]),[['ANTONIO MATOS, LDA','2026','2026-10'],['ANTONIO MATOS, LDA','2026','2026-11'],['sanitop','2026','2026-11']],'same NIF read from the ENAT invoice does not merge different suppliers');
 assert.equal(T.Materiais[1][1],'ANTONIO MATOS, LDA');assert.equal(T.Materiais[1][13],'2026');assert.equal(T.Materiais[1][14],123);
 const O=excelData(s).tables.Obras;assert.deepEqual(O[0].slice(-3),['Custos c/ IVA','Lucro c/ IVA','Por receber s/ IVA']);assert.deepEqual(O[1].slice(-3),[381.3,-281.3,81.3]);
});
