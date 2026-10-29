import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
// The browser files run in this realm, so arrays work with ExcelJS and deepEqual.
for(const f of ['quote-math.js','sync.js','gestao.js','contabilista.js'])vm.runInThisContext(readFileSync(new URL('../public/'+f,import.meta.url),'utf8'));
const {EnatSync,EnatGestao:G,EnatContab:Z}=globalThis;

test('changes made on two devices at the same time are merged item by item',()=>{
 const base={ts:1,vat:23,obras:[{id:'o1',name:'A'}],tx:[{id:'t1',obra:'o1',total:10},{id:'t2',obra:'o1',total:20}],inv:[]};
 const phone=structuredClone(base),pc=structuredClone(base);let lp=EnatSync.snap(phone),lc=EnatSync.snap(pc);
 phone.tx.push({id:'t3',obra:'o1',total:30});phone.tx[0].total=11;lp=EnatSync.stamp(phone,lp,100);phone.ts=100;
 pc.obras.push({id:'o2',name:'B'});pc.tx=pc.tx.filter(x=>x.id!=='t2');lc=EnatSync.stamp(pc,lc,200);pc.ts=200;
 const m=EnatSync.merge(phone,pc);
 assert.deepEqual(m.obras.map(o=>o.id).sort(),['o1','o2']);
 assert.deepEqual(m.tx.map(x=>x.id).sort(),['t1','t3']);
 assert.equal(m.tx.find(x=>x.id==='t1').total,11);
 assert.equal(EnatSync.merge(pc,phone).tx.length,2);
});
test('an edit made after a deletion on another device keeps the item',()=>{
 const a={ts:1,obras:[],tx:[{id:'t1',total:1}],inv:[]},b=structuredClone(a);let la=EnatSync.snap(a),lb=EnatSync.snap(b);
 a.tx=[];EnatSync.stamp(a,la,100);b.tx[0].total=2;EnatSync.stamp(b,lb,200);
 assert.equal(EnatSync.merge(a,b).tx[0].total,2);
 b.tx[0].u=50;assert.equal(EnatSync.merge(a,b).tx.length,0);
});

test('payments are applied to the plan in order and overdue amounts are found',()=>{
 const o={valor:10000,done:'',plano:[{desc:'Adjudicação',pct:30,date:'2026-09-01'},{desc:'Meio da obra',pct:40,date:'2026-10-01'},{desc:'Conclusão',pct:30,date:''}]};
 let p=G.planStatus(o,3000,'2026-10-29');
 assert.deepEqual(p.items.map(x=>x.state),['pago','atraso','pendente']);assert.equal(p.overdue,4000);
 p=G.planStatus(o,5000,'2026-10-29');assert.equal(p.overdue,2000);assert.equal(p.items[1].paid,2000);
 p=G.planStatus({...o,done:'2026-10-20'},5000,'2026-10-29');assert.equal(p.overdue,5000);
 assert.equal(G.planStatus({...o,plano:[]},0,'2026-10-29').overdue,0);
 assert.match(G.reminder({client:'Ana',name:'Moradia'},{desc:'Adjudicação',date:'2026-09-01',missingText:'4 000,00 €'}),/PT50 0007 0000 0088 6037 7712 3/);
});
test('report periods, monthly figures and cost categories',()=>{
 assert.deepEqual(G.period('tri','2026-10-29'),{from:'2026-10-01',to:'2026-12-31',label:'4.º trimestre de 2026'});
 assert.equal(G.period('mes_ant','2026-01-15').from,'2025-12-01');
 assert.equal(G.period('tri_ant','2026-02-10').label,'4.º trimestre de 2025');
 const S={vat:23,obras:[{id:'o1'}],tx:[{id:'r',type:'recebimento',date:'2026-10-02',total:1230,base:1230,iva:0},{id:'f',type:'fatura',date:'2026-10-03',total:246,base:200,iva:46},{id:'m',type:'mao_obra',date:'2026-10-04',total:100,base:100,iva:0},{id:'old',type:'fatura',date:'2026-09-30',total:123,base:100,iva:23}],inv:[{tx:'f',items:[{cat:'Cobre',total:150},{cat:'Cablagem',total:50}]}]};
 const r=G.report(S,'2026-10-01','2026-10-31');
 assert.equal(r.recBase,1000);assert.equal(r.custos,300);assert.equal(r.lucro,700);assert.equal(r.ivaEst,184);
 assert.deepEqual(G.costByCat(S,'2026-10-01','2026-10-31'),[['Cobre',150],['Mão de obra',100],['Cablagem',50]]);
 const ms=G.months(S,'2026-10-29');assert.equal(ms.length,12);assert.equal(ms[11].key,'2026-10');assert.equal(ms[10].custos,100);
});
test('clients join jobs and quotes with the same name, and search finds everything',()=>{
 const S={obras:[{id:'o1',name:'Moradia',client:'Ana Silva',phone:'912345678'}],tx:[{id:'t',obra:'o1',desc:'Cobre',date:'2026-01-02'}],inv:[{id:'i',store:'Leroy',number:'FT 1',obra:'o1'}]};
 const q=[{id:7,document:{client:'ana  silva',contact:'912345678',email:'ana@x.pt',topics:['VMC']}}];
 const c=G.clients(S.obras,q);assert.equal(c.length,1);assert.equal(c[0].email,'ana@x.pt');assert.equal(c[0].quotes.length,1);
 const r=G.search(S,q,'moradia');assert.equal(r.obras.length,1);assert.equal(r.tx.length,1);assert.equal(r.inv.length,1);
 assert.equal(G.search(S,q,'vmc').quotes.length,1);assert.equal(G.search(S,q,'  '),null);
 assert.equal(G.obraYear(S.obras[0],S.tx),'2026');
});

test('the accountant ZIP is a valid archive with the Excel and the invoice files',async()=>{
 const S={vat:23,obras:[{id:'o1',name:'Moradia',client:'Ana'}],tx:[{id:'f',obra:'o1',type:'fatura',date:'2026-10-03',total:246,base:200,iva:46,rate:23},{id:'r',obra:'o1',type:'recebimento',date:'2026-10-04',total:1230}],inv:[{id:'abc',tx:'f',store:'Loja/Norte',number:'FT 9',nif:'500000000',date:'2026-10-03',foto:1,mime:'application/pdf',obra:'o1'}]};
 const wb=Z.accountantWorkbook(ExcelJS,S,'2026-10-01','2026-10-31','outubro de 2026');
 assert.deepEqual(wb.worksheets.map(w=>w.name),['Resumo','Faturas','Mão de obra','Recebimentos','Despesas']);
 assert.equal(wb.getWorksheet('Faturas').getCell('J2').value,'2026-10-03 Loja-Norte FT 9-abc.pdf');
 assert.equal(Z.attachments(S,'2026-10-01','2026-10-31').length,1);assert.equal(Z.attachments(S,'2026-11-01','2026-11-30').length,0);
 const x=new Uint8Array(await wb.xlsx.writeBuffer()),pdf=new TextEncoder().encode('%PDF-1.4 teste');
 const zip=Z.makeZip([{name:'a.xlsx',data:x},{name:'Faturas/f.pdf',data:pdf}]);
 const dv=new DataView(zip.buffer),end=zip.length-22;
 assert.equal(dv.getUint32(0,true),0x04034b50);assert.equal(dv.getUint32(end,true),0x06054b50);assert.equal(dv.getUint16(end+10,true),2);
 assert.equal(Z.crc32(pdf),zlib.crc32(pdf));
 // The first entry holds the Excel bytes unchanged right after its header.
 const n=dv.getUint16(26,true);assert.deepEqual(zip.slice(30+n,30+n+x.length),x);
 const back=new ExcelJS.Workbook();await back.xlsx.load(Buffer.from(x));assert.equal(back.getWorksheet('Recebimentos').getCell('E2').value,1230);
});
