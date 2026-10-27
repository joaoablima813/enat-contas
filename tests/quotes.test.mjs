import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {jsPDF} from 'jspdf';
import {applyPlugin} from 'jspdf-autotable';
applyPlugin(jsPDF);
const math=readFileSync(new URL('../public/quote-math.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/quotes.js',import.meta.url),'utf8');
const ctx=vm.createContext({});vm.runInContext(math,ctx);
const totals=q=>vm.runInContext('quoteTotals('+JSON.stringify(q)+')',ctx);
const sample={client:'Cliente de teste',address:'Rua da Instalação, 12',locality:'Ponte de Lima',contact:'900000000',date:'2026-10-26',topics:['Ar condicionado','VMC'],margin:20,vat:23,warranty:'A confirmar junto do fornecedor',lines:[{kind:'Equipamento / material',description:'Unidade de climatização',value:100},{kind:'Mão de obra',description:'Montagem e ensaio',value:50}]};
test('profit margin is added on top of the cost including VAT',()=>{
 const t=totals(sample);assert.equal(t.cost,150);assert.equal(t.costVat,184.5);assert.equal(t.total,221.4);assert.equal(t.profitVat,36.9);assert.equal(t.net,180);assert.equal(t.vat,41.4);assert.equal(t.profit,30);
 assert.equal(t.profitVat,Math.round(t.costVat*20)/100);
});
test('zero margin, VAT exemptions and decimal rounding are supported',()=>{
 const q={...sample,margin:0,vat:0,lines:[{value:.1},{value:.2}]};const t=totals(q);assert.equal(t.total,.3);assert.equal(t.profit,0);
 assert.equal(totals({...q,margin:99}).total,.6);
});
test('PDF includes logo, customer, numbered title, selected topics, conditions and pagination without disclosing margin',async()=>{
 let pdf,filename;const text=[];
 const png=new Uint8Array(readFileSync(new URL('../public/enat-logo.png',import.meta.url)));
 function Document(){pdf=new jsPDF();const add=pdf.addImage.bind(pdf);pdf.addImage=(_img,...args)=>add(png,...args);const write=pdf.text.bind(pdf);pdf.text=(value,...args)=>{text.push(String(value));return write(value,...args)};pdf.save=name=>{filename=name;return pdf};return pdf}
 class Image{width=400;height=150;set src(_){this.onload()}}
 const c=vm.createContext({window:{jspdf:{jsPDF:Document}},Image,document:{addEventListener(){}},eur:n=>Number(n).toFixed(2)+' €'});
 vm.runInContext(math+'\n'+ui,c);c.proposal={...sample,id:42,lines:Array.from({length:65},(_,i)=>({...sample.lines[i%2],description:'Alínea '+(i+1)+' · Fornecimento e instalação de equipamento com acessórios e ensaios de funcionamento.'}))};
 await vm.runInContext('downloadQuotePdf(proposal)',c);
 assert.equal(filename,'ENAT-Orcamento-0042.pdf');assert.ok(pdf.getNumberOfPages()>1);
 const output=text.join('\n');for(const expected of ['0042','Cliente de teste','Ar condicionado + VMC','15 dias','Garantia de instalação: 2 anos','50% na adjudicação','João Lima','Total sem IVA','Total com IVA'])assert.ok(output.includes(expected),expected);
 assert.doesNotMatch(output,/Lucro previsto|Margem|Custo das alíneas/);
 assert.ok(pdf.output('arraybuffer').byteLength>10000);
});

test('quote editor retains multi-selection and separate labor lines, and blocks incomplete proposals',async()=>{
 let sent,body='',rendered=0;
 const nodes={'#quote-summary':{innerHTML:''},'#quote-message':{textContent:''},'#quote-form':{reportValidity:()=>true}};
 const c=vm.createContext({document:{addEventListener(){},querySelector:s=>nodes[s]},S:{vat:23},TOPICS:sample.topics,esc:s=>String(s),eur:n=>Number(n).toFixed(2),ic:()=>'',V:{tab:'orc'},render:()=>rendered++,API:async(path,options)=>{sent=path;body=JSON.parse(options.body);return {ok:true,json:async()=>({id:7,document:body})}}});
 vm.runInContext(math+'\n'+ui,c);
 vm.runInContext("quoteDraft=newQuote();quoteDraft.client='Família Lima';",c);
 for(const topic of sample.topics)vm.runInContext('quoteReadInput({dataset:{qt:'+JSON.stringify(topic)+'},checked:true})',c);
 assert.equal(vm.runInContext('quoteDraft.topics.length',c),2);
 await vm.runInContext('saveQuote(false)',c);assert.equal(sent,undefined);
 assert.match(nodes['#quote-message'].textContent,/descrições/);
 c.valid=sample;vm.runInContext('quoteDraft=JSON.parse(JSON.stringify(valid))',c);
 await vm.runInContext('saveQuote(false)',c);assert.equal(sent,'orcamentos');assert.equal(body.lines[1].kind,'Mão de obra');assert.equal(vm.runInContext('quoteDraft.id',c),7);
 await vm.runInContext('saveQuote(false)',c);assert.equal(sent,'orcamentos/7');assert.ok(rendered>=4);
});

test('quantities multiply unit costs, including fractional metres and legacy saved quotes',()=>{
 const q={...sample,margin:20,lines:[{value:80,quantity:2},{value:4,quantity:2.5}]};
 const t=totals(q);assert.equal(t.cost,170);assert.equal(t.costVat,209.1);assert.equal(t.total,250.92);
 assert.equal(totals(sample).cost,150);
});

test('short PDF fits on one page with quantities, totals and signature and no numbered item labels',async()=>{
 let pdf;const writes=[];const png=new Uint8Array(readFileSync(new URL('../public/enat-logo.png',import.meta.url)));
 function Document(){pdf=new jsPDF();const add=pdf.addImage.bind(pdf);pdf.addImage=(_img,...args)=>add(png,...args);const write=pdf.text.bind(pdf);pdf.text=(value,...args)=>{writes.push({value:String(value),page:pdf.getNumberOfPages(),y:args[1]});return write(value,...args)};pdf.save=()=>{};return pdf}
 class Image{width=400;height=150;set src(_){this.onload()}}
 const c=vm.createContext({window:{jspdf:{jsPDF:Document}},Image,document:{addEventListener(){}},eur:n=>Number(n).toFixed(2)+' €'});
 vm.runInContext(math+'\n'+ui,c);c.proposal={...sample,id:7,lines:sample.lines.map(l=>({...l,quantity:2,unit:'un.'}))};
 await vm.runInContext('downloadQuotePdf(proposal)',c);
 assert.equal(pdf.getNumberOfPages(),1);
 const output=writes.map(w=>w.value).join('\n');assert.doesNotMatch(output,/Alínea|Equipamento \/ material/);assert.match(output,/Qtd\./);assert.match(output,/Preço unit\./);assert.match(output,/442,80/);
 assert.equal(writes.find(w=>w.value.includes('João Lima')).page,writes.find(w=>w.value==='Total com IVA').page);
 for(const w of writes)if(typeof w.y==='number')assert.ok(w.y<=287,'text stays within the page');
});

test('deleting a quote requires confirmation, removes it after success and retains it on failure',async()=>{
 let request,allowed=false,ok=true;
 const c=vm.createContext({window:{confirm:()=>allowed},document:{addEventListener(){}},render(){},API:async(path,options)=>{request={path,options};return {ok,json:async()=>({error:'Falha ao eliminar'})}}});
 vm.runInContext(ui,c);c.sample=sample;
 vm.runInContext('quoteDraft={...sample,id:7};quoteRows=[{id:7,document:sample}]',c);
 await vm.runInContext('deleteQuote()',c);assert.equal(request,undefined);
 allowed=true;ok=false;await vm.runInContext('deleteQuote()',c);assert.equal(vm.runInContext('quoteDraft.id',c),7);assert.equal(vm.runInContext('quoteRows.length',c),1);assert.match(vm.runInContext('quoteError',c),/Falha/);
 ok=true;await vm.runInContext('deleteQuote()',c);assert.equal(request.path,'orcamentos/7');assert.equal(request.options.method,'DELETE');assert.equal(vm.runInContext('quoteDraft',c),null);assert.equal(vm.runInContext('quoteRows.length',c),0);
});

test('editor uses one address field and exposes quantity and deletion in the saved list',()=>{
 const c=vm.createContext({document:{addEventListener(){}},TOPICS:sample.topics,esc:s=>String(s),eur:n=>String(n),ic:()=>'',fd:s=>s});
 vm.runInContext(math+'\n'+ui,c);c.sample=sample;
 vm.runInContext('quoteDraft={...sample,id:7}',c);
 const editor=vm.runInContext('quoteEditor()',c);
 assert.doesNotMatch(editor,/Localidade|Alínea|Produto ou serviço 1/);
 assert.match(editor,/data-qf="address"/);assert.match(editor,/data-field="quantity"/);assert.match(editor,/rows="1"/);
 assert.match(editor,/data-qa="delete"/);
 vm.runInContext('quoteDraft=null;quoteRows=[{id:7,document:sample}]',c);
 assert.match(vm.runInContext('vQuotes()',c),/data-qa="delete-saved" data-id="7"/);
});

test('deleting from the saved list works without opening a draft',async()=>{
 let request;
 const c=vm.createContext({window:{confirm:()=>true},document:{addEventListener(){}},render(){},API:async(path,options)=>{request={path,options};return {ok:true}}});
 vm.runInContext(ui,c);c.sample=sample;
 vm.runInContext('quoteRows=[{id:7,document:sample}]',c);
 await vm.runInContext('deleteQuote(quoteRows[0])',c);
 assert.equal(request.path,'orcamentos/7');assert.equal(request.options.method,'DELETE');
 assert.equal(vm.runInContext('quoteRows.length',c),0);assert.equal(vm.runInContext('quoteDraft',c),null);
});

test('API saves quotes without locality and combines legacy addresses without changing quantities',async()=>{
 const {stripTypeScriptTypes}=await import('node:module');
 let saved;
 const db={insert:()=>({values:({document})=>{saved=document;return {returning:async()=>[{id:1,document}]}}})};
 const source=readFileSync(new URL('../netlify/lib/quotes.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
 const c=vm.createContext({db,quotes:{},Response,Date});vm.runInContext(stripTypeScriptTypes(source),c);
 c.path='orcamentos';
 const proposal={...sample,lines:[{kind:'Material',description:'Tubo',value:4,quantity:2.5,unit:'m'}]};delete proposal.locality;
 c.req={method:'POST',json:async()=>proposal};
 let response=await vm.runInContext('handleQuotes(req,path)',c);
 assert.equal(response.status,201);assert.equal(saved.address,sample.address);assert.equal(saved.locality,undefined);assert.equal(saved.lines[0].quantity,2.5);
 c.req={method:'POST',json:async()=>structuredClone(sample)};
 response=await vm.runInContext('handleQuotes(req,path)',c);
 assert.equal(response.status,201);assert.equal(saved.address,sample.address+', '+sample.locality);assert.equal(saved.locality,undefined);
});
