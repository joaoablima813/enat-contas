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
 const script=installer('https://example.org');assert.ok(script.startsWith('\ufeff'));assert.match(script,/wb.SaveAs dest, 51/);assert.match(script,/qt.RefreshPeriod = 5/);assert.match(script,/qt.RefreshOnFileOpen = True/);assert.match(script,/INDIRECT/);assert.ok(!script.includes('Authorization'));assert.ok(!script.includes('x-session'));
 // VBScript string literals use doubled quotes. Check all lines balance.
 for(const line of script.split('\r\n'))assert.equal((line.match(/"/g)||[]).length%2,0,line);
});
test('connected workbook applies ENAT styles and numeric query types to every financial sheet',()=>{
 const script=installer('https://example.org');
 assert.match(script,/Set ts = wb.TableStyles.Add\("ENAT"\)/);
 assert.ok(!/\.TableElements\(/.test(script)); // Windows Script Host rejects indexed TableElements calls.
 assert.match(script,/ts.TableElements.Item\(6\)/);
 assert.equal((script.match(/lo.TableStyle = style/g)||[]).length,5);
 assert.match(script,/RGB\(246,247,251\)/);
 assert.match(script,/RGB\(25,30,61\)/);
 assert.match(script,/RGB\(89,96,127\)/);
 assert.equal((script.match(/Table.TransformColumnTypes/g)||[]).length,5);
 assert.match(script,/each _ \/ 100, type number/);
 for(const range of ['E8:K1048576','D2:L1048576','F2:H1048576','J2:J1048576','L2:M1048576']){
  assert.ok(script.includes(`ws.Range("${range}").NumberFormat = """€"" #,##0.00"`),range);
 }
 assert.match(script,/C2:C1048576/); // Status formatting also follows the detailed Obras sheet.
 assert.match(script,/RGB\(6,95,70\)/);
});
