import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {jsPDF} from 'jspdf';
import {applyPlugin} from 'jspdf-autotable';
applyPlugin(jsPDF);
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const load=(extra={})=>{
 const c=vm.createContext({document:{addEventListener(){},querySelector(){return null}},esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),eur:n=>Number(n).toFixed(2)+' €',ic:()=>'',
  TOPICS:['Ar condicionado','UPAC (fotovoltaico)'],S:{vat:23},...extra});
 vm.runInContext(['quote-math.js','price-tables.js','quotes.js','pv-sizing.js','pv.js'].map(read).join('\n'),c);
 return s=>vm.runInContext(s,c);
};
test('the S. Energias table supplies panels, inverters, batteries, backup, chargers and structures',()=>{
 const run=load(),c=run('pvCatalog(PRICE_TABLES)');
 assert.deepEqual([...c.panels.map(p=>p.wp)],[485,540,645]);
 assert.equal(c.panels[0].length,1.8);assert.equal(c.panels[0].width,1.134);
 const inv=name=>c.inverters.find(i=>i.name.startsWith(name));
 assert.deepEqual([inv('GW1500-XS').kw,inv('GW1500-XS').phase,inv('GW1500-XS').hybrid],[1.5,1,false]);
 assert.deepEqual([inv('GW 10KW ET G2').kw,inv('GW 10KW ET G2').phase,inv('GW 10KW ET G2').hybrid],[10,3,true]);
 assert.deepEqual([inv('GW 8K-SDT').kw,inv('GW 8K-SDT').phase],[8,3]);
 assert.ok(c.inverters.some(i=>i.micro));
 assert.equal(c.batteries.find(b=>b.name.startsWith('Goodwe Lynx HV')).kwh,5);
 assert.ok(c.batteries.every(b=>!/base|bmu|cabo/i.test(b.name)));
 assert.ok(c.backups.some(b=>/Backup Box/.test(b.name)));
 assert.ok(c.chargers.length>=5&&c.chargers.every(x=>!/cabo|adaptador/i.test(x.name)));
 assert.equal(c.structures.filter(s=>s.kit).length,9);
 assert.ok(c.fixings.some(f=>/Salvatelha/.test(f.name)));
});
test('sizing proposes panels, inverter and tile structure for the consumption',()=>{
 const run=load();run('cat=pvCatalog(PRICE_TABLES)');
 const d=run(`pvDesign({...newPv(),consumption:5000,coverage:100},cat)`);
 // 5000 kWh at the estimated ~1330 kWh/kWp in Ponte de Lima needs about 3,8 kWp of 485 W panels.
 assert.equal(d.n,Math.ceil(5000/d.kwhKwp/.485));assert.equal(d.source,'estimativa');
 assert.equal(d.inverter.phase,1);assert.ok(d.ratio<=1.25&&d.ratio>.8,'DC/AC '+d.ratio);
 const kits=d.structureLines.filter(s=>s.item.kit);assert.equal(kits.reduce((s,k)=>s+k.item.kit*k.qty,0)>=d.n,true);
 assert.ok(d.structureLines.some(s=>/Salvatelha/.test(s.item.name)));
 assert.ok(d.lines.every(l=>l.pv&&l.value>0&&l.catalog.brand==='S. Energias'));
 assert.ok(d.self<=d.production&&d.self<=d.consumption);
});
test('PVGIS output, roof size, battery, flat roof and manual choices are respected',()=>{
 const run=load();run('cat=pvCatalog(PRICE_TABLES)');
 const pv=run(`p={...newPv(),consumption:8000,phase:3,roof:'terraco',layout:'horizontal',roofW:5,roofH:3,battery:cat.batteries.find(b=>/Lynx HV/.test(b.name)).key,batteryQty:2,charger:cat.chargers[0].key};p.yield={key:pvYieldKey(p),annual:1500,monthly:Array(12).fill(125),source:'PVGIS'};p`);
 const d=run('pvDesign(p,cat)');
 assert.equal(d.kwhKwp,1500);assert.equal(d.source,'PVGIS');
 assert.equal(d.fit.total,d.fit.cols*d.fit.rows);assert.ok(d.n<=d.fit.total);assert.ok(d.warnings.some(w=>/área indicada/.test(w)));
 assert.ok(d.inverter.hybrid&&d.inverter.phase===3);
 assert.ok(d.structureLines.some(s=>/Tabuleiro módulos horizontal/.test(s.item.name)&&s.qty>=12));
 assert.ok(d.lines.some(l=>/Lynx HV/.test(l.description)&&l.quantity===2));
 const none=run(`pvDesign({...p,yield:{...p.yield,key:'outro'},battery:'',structure:'none',panels:4,inverter:'none'},cat)`);
 assert.equal(none.source,'estimativa');assert.equal(none.n,4);assert.equal(none.inverter,null);assert.equal(none.structureLines.length,0);
 const battery=run(`pvDesign({...p,inverter:cat.inverters.find(i=>!i.hybrid&&i.phase===3).key},cat)`);
 assert.ok(battery.warnings.some(w=>/híbrido/.test(w)));
});
test('the editor shows the sizing for PV quotes and adds its lines to the quote',()=>{
 const run=load({API:async()=>({ok:false,json:async()=>({})})});
 run(`quoteDraft=newQuote();quoteDraft.topics=['UPAC (fotovoltaico)']`);
 assert.match(run('quoteEditor()'),/Dimensionar sistema fotovoltaico/);
 run(`quoteDraft.pv={...newPv('Ponte de Lima'),consumption:4000}`);
 const html=run('quoteEditor()');
 for(const t of ['Tipo de cobertura','Telha lusa','Terraço','Painel','Inversor','Bateria','Backup','Carregador para carro elétrico','Estrutura','Adicionar o material ao orçamento'])assert.ok(html.includes(t),t);
 const d=run('pvDesign(quoteDraft.pv,pvCatalogNow())');
 run(`quoteDraft.lines=[{kind:'Mão de obra',description:'Montagem',quantity:1,unit:'un.',value:300},...pvDesign(quoteDraft.pv,pvCatalogNow()).lines]`);
 assert.equal(run('quoteDraft.lines.filter(l=>l.pv).length'),d.lines.length);
 assert.ok(run('quoteDraft.pv.result.production')>0);
});
test('the PDF gets a PV study page',async()=>{
 const text=[];let pdf;
 const png=new Uint8Array(readFileSync(new URL('../public/enat-logo.png',import.meta.url)));
 function Document(){pdf=new jsPDF();const add=pdf.addImage.bind(pdf);pdf.addImage=(_img,...a)=>add(png,...a);const w=pdf.text.bind(pdf);pdf.text=(v,...a)=>{text.push(String(v));return w(v,...a)};pdf.save=()=>pdf;return pdf}
 class Image{width=400;height=150;set src(_){this.onload()}}
 const run=load({window:{jspdf:{jsPDF:Document}},Image});
 run(`cat=pvCatalog(PRICE_TABLES);pv={...newPv(),consumption:6000};d=pvDesign(pv,cat);proposal={client:'Cliente PV',address:'Ponte de Lima',contact:'900000000',date:'2026-10-28',topics:['UPAC (fotovoltaico)'],margin:20,vat:23,warranty:'',lines:d.lines,id:7,pv:{...pv,result:pvSnapshot(d,pv,5000)}}`);
 await run('downloadQuotePdf(proposal)');
 const out=text.join('\n');for(const t of ['ESTUDO FOTOVOLTAICO','Produção anual estimada','Poupança anual estimada','Retorno do investimento','PRODUÇÃO E CONSUMO POR MÊS (kWh)'])assert.ok(out.includes(t),t);
 assert.ok(pdf.getNumberOfPages()>=2);
});
test('the supplier name stays out of the lines and a battery added as a quote line lowers grid use and changes the payback',()=>{
 const run=load();run('cat=pvCatalog(PRICE_TABLES)');
 assert.ok(run('cat.batteries').some(b=>/BSL Powerwall 10,24kWh/.test(b.name)&&b.kwh===10.24));
 run(`quoteDraft=newQuote();quoteDraft.pv={...newPv(),consumption:5000};quoteDraft.lines=pvDesignNow(quoteDraft.pv,cat).lines`);
 assert.ok(run('quoteDraft.lines').every(l=>!/Energias/.test(l.description)));
 const snap=()=>{run('pvResults()');return run('quoteDraft.pv.result')};
 const before=snap();assert.equal(before.batteryKwh,0);
 run(`quoteDraft.lines.push(quoteCatalogLine(PRICE_TABLES[0],PRICE_TABLES[0].products.find(p=>/BSL Powerwall 10,24/.test(p.name))))`);
 assert.doesNotMatch(run('quoteDraft.lines.at(-1).description'),/Energias/);
 const after=snap();
 assert.equal(after.batteryKwh,10.24);assert.ok(after.self>before.self&&after.grid<before.grid&&after.savings>before.savings);
 assert.ok(after.price>before.price&&after.payback!==before.payback);
 assert.equal(run(`quoteClientText('S. Energias Bateria X')`),'Bateria X');
});
