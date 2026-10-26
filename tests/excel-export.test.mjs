import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import '../public/excel-export.js';
const tables={Obras:[['Obra','Cliente','Estado','Valor c/ IVA','Valor s/ IVA','Recebido','Por receber','Materiais s/ IVA','Despesas sem fatura','Mão de obra s/ IVA','Custos','Lucro','Margem %','IVA cobrado','IVA suportado','IVA a entregar'],['Teste','Cliente','Em curso',1230,1000,500,730,100,10,200,310,690,69,230,23,207]],Faturas:[['Obra','Data','Total c/ IVA']],Materiais:[['Artigo','Quantidade','IVA %']],Movimentos:[['Obra','Total c/ IVA']]};
const records=[{o:{name:'Teste',valor:1230,status:'em_curso'},pago:333,fi:23,rec:500}];
test('workbook keeps formulas, cached values, formats and detail after XLSX roundtrip',async()=>{
 const wb=EnatExcel.createWorkbook(ExcelJS,tables,records);
 const bytes=await wb.xlsx.writeBuffer();
 const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(bytes);
 assert.deepEqual(reopened.worksheets.map(w=>w.name),['Controlo de Obras','Obras','Faturas','Materiais','Movimentos']);
 const sheet=reopened.worksheets[0];
 assert.equal(sheet.getCell('H9').value.result,207);
 assert.equal(sheet.getCell('J9').value.result,730);
 assert.equal(sheet.getCell('K9').value.result,690);
 assert.equal(sheet.getCell('M9').value.result,'Parcial');
 assert.match(sheet.getCell('F9').value.formula,/Obras/);
 assert.equal(sheet.getCell('A5').value.result,1230);
 assert.equal(sheet.getCell('G5').value.result,690/1230);
 assert.equal(sheet.getCell('A8').fill.fgColor.argb,'FF4B5C92');
 assert.equal(reopened.getWorksheet('Obras').getCell('M2').value,0.69);
 assert.equal(sheet.getCell('B9').value,'');
});
test('empty workbook exports with zero indicators',async()=>{
 const empty=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,[v[0]]]));
 const wb=EnatExcel.createWorkbook(ExcelJS,empty,[]);
 assert.equal(wb.worksheets[0].getCell('A5').result,0);
 assert.ok((await wb.xlsx.writeBuffer()).byteLength>0);
});
test('credit VAT and overpayment do not produce negative payable balances',()=>{
 const wb=EnatExcel.createWorkbook(ExcelJS,tables,[{...records[0],fi:300,rec:1500}]);
 const sheet=wb.worksheets[0];assert.equal(sheet.getCell('H9').result,0);assert.equal(sheet.getCell('J9').result,0);assert.equal(sheet.getCell('M9').value.result,'Pago');
});
test('ENAT colours, dates and dynamic status rules survive XLSX roundtrip',async()=>{
 const wb=EnatExcel.createWorkbook(ExcelJS,tables,[{...records[0],o:{...records[0].o,data_inicio:'2026-10-26'}}]);
 const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await wb.xlsx.writeBuffer());
 const main=reopened.getWorksheet('Controlo de Obras');
 assert.equal(main.getCell('A1').font.color.argb,'FF2F395D');
 assert.equal(main.getCell('A4').fill.fgColor.argb,'FFF1F4FA');
 assert.equal(main.getCell('A4').font.color.argb,'FF59607F');
 assert.equal(main.getCell('A5').font.color.argb,'FF191E3D');
 assert.equal(main.getCell('C9').numFmt,'dd/mm/yyyy');
 assert.equal(main.getCell('C9').value.toISOString().slice(0,10),'2026-10-26');
 assert.match(main.getCell('E9').numFmt,/"€" #,##0.00/);
 assert.equal(main.getCell('E9').alignment.horizontal,'right');
 assert.equal(main.getCell('M9').fill.fgColor.argb,'FFFEF9C3');
 assert.ok(main.conditionalFormattings.some(f=>f.ref==='D9:D9'&&f.rules.some(r=>r.formulae.includes('D9="Concluída"'))));
 assert.ok(reopened.getWorksheet('Obras').conditionalFormattings.some(f=>f.ref==='C2:C2'));
});
