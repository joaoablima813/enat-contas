import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as portfolio from '../netlify/lib/portfolio.mjs';
import * as pageStyle from '../netlify/lib/page-style.mjs';
import * as googleOp from '../netlify/lib/google-opinioes.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const ts=f=>stripTypeScriptTypes(read(f).replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
const sample={client:'Família Araújo',address:'Rua da Instalação, 12',contact:'912 345 678',email:'a@b.pt',date:new Date().toISOString().slice(0,10),topics:['Ar condicionado'],brand:'LG',margin:20,vat:23,warranty:'3 anos',status:'enviado',validity:30,lines:[{kind:'Equipamento',description:'Unidade',value:1000,quantity:1,unit:'un.'},{kind:'Mão de obra',description:'Montagem',value:200,quantity:1,unit:'un.'}]};

// A small in-memory stand-in for the drizzle queries used by the quote page and the quotes API.
function fakeDb(){
 const tables={quotes:[],quote_events:[]},ids={quotes:0,quote_events:0};
 const col=(t,key)=>({t,key});
 const quotes={_:'quotes',id:col('quotes','id'),document:col('quotes','document')};
 const quoteEvents={_:'quote_events',id:col('quote_events','id'),quoteId:col('quote_events','quoteId'),kind:col('quote_events','kind'),readAt:col('quote_events','readAt')};
 const ops={eq:(c,v)=>r=>r[c.key]===v,and:(...f)=>r=>f.every(p=>p(r)),inArray:(c,v)=>r=>v.includes(r[c.key]),isNull:c=>r=>r[c.key]==null,desc:c=>({c,d:-1}),asc:c=>({c,d:1})};
 const query=rows=>{let out=rows;const q={where:p=>{out=out.filter(p);return q},orderBy:o=>{out=[...out].sort((a,b)=>(a[o.c.key]-b[o.c.key])*o.d);return q},limit:n=>{out=out.slice(0,n);return q},then:(ok,ko)=>Promise.resolve(out.map(r=>({...r}))).then(ok,ko)};return q};
 const db={
  select:()=>({from:t=>query(tables[t._])}),
  insert:t=>({values:v=>{const row={id:++ids[t._],note:'',createdAt:new Date(),readAt:null,updatedAt:new Date(),...v};tables[t._].push(row);const p=Promise.resolve();p.returning=async()=>[{...row}];return p}}),
  update:t=>({set:v=>({where:p=>{const hit=tables[t._].filter(p);hit.forEach(r=>Object.assign(r,v));const pr=Promise.resolve();pr.returning=async()=>hit.map(r=>({...r}));return pr}})}),
  delete:()=>({}),
 };
 return {db,tables,quotes,quoteEvents,...ops};
}
function blobs(){const m=new Map();return {m,set:async(k,v,o)=>m.set(k,{data:v,metadata:o?.metadata||{}}),setJSON:async(k,v)=>m.set(k,{data:JSON.parse(JSON.stringify(v))}),get:async k=>m.has(k)?structuredClone(m.get(k).data):null,getMetadata:async k=>m.has(k)?{metadata:m.get(k).metadata}:null,getWithMetadata:async k=>m.get(k)||null}}
function server(){
 const f=fakeDb(),store=blobs();
 // Each server module runs in its own context, sharing the same database and blob store.
 const ctx=()=>vm.createContext({...f,...portfolio,...pageStyle,...googleOp,Response,URL,Buffer,Headers,console,structuredClone,randomBytes:k=>Buffer.alloc(k,++n),process:{env:{}},store});
 const c=ctx(),w=ctx(),q=ctx();
 for(const p of ['public/quote-math.js','public/gestao.js','public/quote-obra.js','public/solucoes.js'])vm.runInContext(read(p),c);
 vm.runInContext(ts('netlify/lib/proposta.ts'),c);vm.runInContext(ts('netlify/lib/whatsapp.ts'),w);vm.runInContext(ts('netlify/lib/quotes.ts'),q);
 const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
 const call=(token,method='GET',body,agent=ua)=>{c.req={method,url:'https://enat.example/proposta/'+token,headers:new Headers({'user-agent':agent}),text:async()=>JSON.stringify(body)};c.token=token;return vm.runInContext('handleProposta(req,token,store)',c)};
 // Sends a quote the way the app does: the PDF is stored and the link points to the quote page.
 const send=async(id,group)=>{w.req={method:'POST',url:'https://enat.example/api/whatsapp/pdf',json:async()=>({id,group,channel:'whatsapp',pdf:Buffer.from('%PDF-1.4').toString('base64')})};const r=await vm.runInContext('handleWhatsapp(req,"whatsapp/pdf",store)',w);return (await r.json()).url.split('/').pop()};
 return {c,q,f,store,call,send};
}
let n=0;

test('the link opens a branded quote page with the PDF and the four choices, and stays private',async()=>{
 const s=server();s.f.tables.quotes.push({id:42,document:sample,createdAt:new Date(),updatedAt:new Date()});
 const token=await s.send(42);
 const r=await s.call(token);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);
 const html=await r.text();
 assert.match(html,/enat-logo\.png/);assert.match(html,/Enat - Ponte de Lima/);assert.match(html,/ORC \d{4}\/0042/);assert.match(html,/Olá, Família Araújo/);
 assert.match(html,new RegExp('/proposta/'+token+'/pdf'));
 for(const k of ['adjudicar','duvida','revisao','nao'])assert.match(html,new RegExp('data-kind="'+k+'"'));
 assert.match(html,/1771,20 €/,'total with VAT and margin');assert.match(html,/885,60 €/,'50% due on award');
 assert.doesNotMatch(html,/PT50/,'no bank details before the client awards');
 // Trust and value come before the price.
 assert.ok(html.indexOf('Porque escolher a Enat')<html.indexOf('O seu investimento'));assert.ok(html.indexOf('O que vai ganhar')<html.indexOf('1771,20 €'));
 assert.equal((await s.call('x'.repeat(24))).status,404);
 assert.deepEqual(s.f.tables.quote_events.map(e=>[e.kind,e.note]),[['enviado','WhatsApp']]);
});

test('link previews do not count as seen; a real visit counts once per 10 minutes',async()=>{
 const s=server();s.f.tables.quotes.push({id:1,document:sample});const token=await s.send(1);
 await s.call(token,'POST',{kind:'visto'},'WhatsApp/2.23.20.0');await s.call(token,'POST',{kind:'visto'},'facebookexternalhit/1.1');
 assert.equal(s.f.tables.quote_events.filter(e=>e.kind==='visto').length,0);
 await s.call(token,'POST',{kind:'visto'});await s.call(token,'POST',{kind:'visto'});await s.call(token,'POST',{kind:'pdf'});
 assert.deepEqual(s.f.tables.quote_events.map(e=>e.kind),['enviado','visto','pdf']);
});

test('awarding opens the job once; the client can change their mind and the job is kept',async()=>{
 const s=server();s.f.tables.quotes.push({id:7,document:sample});
 await s.store.setJSON('estado',{ts:5,vat:23,obras:[{id:'o1',name:'Outra'}],tx:[],inv:[]});
 const token=await s.send(7);
 let r=await s.call(token,'POST',{kind:'revisao',note:''});assert.equal(r.status,400);
 r=await s.call(token,'POST',{kind:'adjudicar',note:'Pode ser em novembro'});assert.equal(r.status,200);assert.equal((await r.json()).obra,true);
 let st=await s.store.get('estado'),doc=s.f.tables.quotes[0].document;
 assert.equal(st.obras.length,2);const o=st.obras[1];
 assert.equal(o.client,'Família Araújo');assert.equal(o.orc,7);assert.equal(o.status,'em_curso');assert.equal(o.valor,1771.2);assert.deepEqual(o.previsto,{mat:1000,mo:200});assert.equal(o.plano[0].pct,50);
 assert.ok(o.u>5&&st.ts===o.u,'stamped so every device merges it');
 assert.equal(doc.status,'aceite');assert.equal(doc.obra,o.id);
 await s.call(token,'POST',{kind:'adjudicar'});assert.equal((await s.store.get('estado')).obras.length,2,'no duplicate job');
 await s.call(token,'POST',{kind:'pensar'});doc=s.f.tables.quotes[0].document;assert.equal(doc.status,'enviado');assert.equal(doc.obra,o.id);
 const html=await (await s.call(token)).text();assert.match(html,/A sua resposta: Vai pensar/);
 assert.deepEqual(s.f.tables.quote_events.map(e=>e.kind),['enviado','adjudicar','adjudicar','pensar']);
});

test('choosing another quote sent together replaces the earlier choice',async()=>{
 const s=server();s.f.tables.quotes.push({id:1,document:sample},{id:2,document:{...sample,brand:'Daikin'}});
 const a=await s.send(1,'grupo123'),b=await s.send(2,'grupo123');
 assert.match(await (await s.call(a)).text(),/Outras propostas enviadas[\s\S]*Ar condicionado Daikin/);
 await s.call(a,'POST',{kind:'adjudicar'});await s.call(b,'POST',{kind:'adjudicar'});
 const ev=s.f.tables.quote_events.filter(e=>e.quoteId===1).map(e=>e.kind);assert.deepEqual(ev,['enviado','adjudicar','trocou']);
 assert.equal(s.f.tables.quotes[0].document.status,'enviado');assert.equal(s.f.tables.quotes[1].document.status,'aceite');
});

test('saving a quote that was open in the app keeps the client\'s newer answer',async()=>{
 const s=server();s.f.tables.quotes.push({id:3,document:{...sample,status:'aceite',obra:'ob1',clientAt:'2026-10-29T10:00:00Z'}});
 s.q.req={method:'PUT',json:async()=>({...structuredClone(sample),status:'enviado'})};
 let r=await vm.runInContext("handleQuotes(req,'orcamentos/3')",s.q);assert.equal(r.status,200);
 let d=s.f.tables.quotes[0].document;assert.equal(d.status,'aceite');assert.equal(d.obra,'ob1');
 s.q.req={method:'PUT',json:async()=>({...structuredClone(sample),status:'recusado',clientAt:'2026-10-29T10:00:00Z'})};
 await vm.runInContext("handleQuotes(req,'orcamentos/3')",s.q);d=s.f.tables.quotes[0].document;assert.equal(d.status,'recusado','the user can still change it');assert.equal(d.obra,'ob1');
 s.f.tables.quote_events.push({id:1,quoteId:3,kind:'adjudicar',note:'',createdAt:new Date(),readAt:null});
 r=await vm.runInContext("handleQuotes({method:'GET'},'orcamentos')",s.q);const [row]=await r.json();assert.equal(row.events[0].kind,'adjudicar');assert.equal(row.events[0].read,false);
 await vm.runInContext("handleQuotes({method:'POST'},'orcamentos/3/lido')",s.q);assert.ok(s.f.tables.quote_events[0].readAt);
});

test('the company profile shows the contact person, credentials with a number and real free weeks',async()=>{
 const s=server();s.f.tables.quotes.push({id:5,document:sample});
 await s.store.setJSON('empresa',{contacto:{nome:'João Lima',cargo:'Responsável comercial',telefone:'912 000 111',foto:'abcdefgh12'},credenciais:[{nome:'Técnico certificado em gases fluorados',numero:'Cert. n.º 123'},{nome:'Sem número',numero:''}],anos:'12',semanas:['2099-03-02','2000-01-03'],incluido:['Testes e arranque do sistema']});
 const token=await s.send(5);const html=await (await s.call(token)).text();
 assert.match(html,/João Lima/);assert.match(html,/wa\.me\/351912000111/);assert.match(html,/\/proposta\/[^/]+\/img\/abcdefgh12/);
 assert.match(html,/gases fluorados[\s\S]*Cert\. n\.º 123/);assert.doesNotMatch(html,/Sem número/,'a credential without its number is not shown');
 assert.match(html,/12<\/b><small>anos de experiência/);assert.match(html,/semana de 2 de março/);assert.doesNotMatch(html,/semana de 3 de janeiro/,'past weeks are hidden');
 assert.match(html,/Testes e arranque do sistema/);assert.match(html,/Conforto o ano inteiro/);
 // Google: the same rating and reviews as the site (synced), without the salesperson's own review.
 await s.store.setJSON('google-opinioes',{at:1,nota:5,total:7,link:'https://maps.google.com/?cid=1',reviews:[{autor:'Sara F.',estrelas:5,texto:'Muito profissionais',quando:'há 1 semana'},{autor:'João Lima',estrelas:5,texto:'Própria',quando:''}]});
 const g=await (await s.call(token)).text();
 assert.match(g,/5,0 ★<\/b><small>no Google \(7 opiniões\)/);assert.match(g,/Muito profissionais/);assert.doesNotMatch(g,/Própria/);
 // The chosen week is kept with the answer; a week that is not offered is ignored.
 let r=await s.call(token,'POST',{kind:'adjudicar',semana:'semana de 2 de março',note:'De manhã'});const j=await r.json();
 assert.match(j.pay,/PT50/,'bank details only after awarding');
 assert.equal(s.f.tables.quote_events.at(-1).note,'Semana preferida: semana de 2 de março · De manhã');
 await s.call(token,'POST',{kind:'adjudicar',semana:'semana de 9 de março'});assert.equal(s.f.tables.quote_events.at(-1).note,'');
 assert.match(await (await s.call(token)).text(),/PT50/,'the awarded client sees the payment details again');
});

test('not going ahead needs a reason, which keeps the answer codes the app already knows',async()=>{
 const s=server();s.f.tables.quotes.push({id:6,document:sample});const token=await s.send(6);
 assert.equal((await s.call(token,'POST',{kind:'nao'})).status,400);
 assert.equal((await s.call(token,'POST',{kind:'nao',motivo:'outro'})).status,400,'other reason needs a comment');
 await s.call(token,'POST',{kind:'nao',motivo:'preco'});
 await s.call(token,'POST',{kind:'nao',motivo:'outra',note:'Mais perto de casa'});
 assert.deepEqual(s.f.tables.quote_events.slice(1).map(e=>[e.kind,e.note]),[['pensar','Motivo: O valor ficou acima do que esperava'],['rejeitar','Motivo: Escolhi outra empresa · Mais perto de casa']]);
 assert.equal(s.f.tables.quotes[0].document.status,'recusado');
});

test('a question is recorded once per 10 minutes and does not change the answer',async()=>{
 const s=server();s.f.tables.quotes.push({id:8,document:sample});const token=await s.send(8);
 await s.call(token,'POST',{kind:'duvida',note:'whatsapp'});await s.call(token,'POST',{kind:'duvida',note:'chamada'});
 await s.call(token,'POST',{kind:'duvida',note:'x'},'WhatsApp/2.23');
 assert.deepEqual(s.f.tables.quote_events.slice(1).map(e=>[e.kind,e.note]),[['duvida','WhatsApp']]);
 assert.equal(s.f.tables.quotes[0].document.status,'enviado');
});

test('a returning client without an answer is asked again, first thing on the page',async()=>{
 const s=server();s.f.tables.quotes.push({id:9,document:sample});const token=await s.send(9);
 assert.doesNotMatch(await (await s.call(token)).text(),/id="welcome"/);
 await s.call(token,'POST',{kind:'visto'});
 assert.match(await (await s.call(token)).text(),/id="welcome"/);
 await s.call(token,'POST',{kind:'pensar'});
 assert.doesNotMatch(await (await s.call(token)).text(),/id="welcome"/);
});

test('finished jobs near the client appear before the price, without client names, and only with consent',async()=>{
 const s=server();s.f.tables.quotes.push({id:11,document:{...sample,address:'Rua da Igreja 12, 4990-062 Ponte de Lima'}});const token=await s.send(11);
 await s.store.setJSON('portfolio',[{id:'o1',tipo:'Ar condicionado',titulo:'Ar condicionado em moradia',local:'Ponte de Lima',cp:'4990',mes:'2026-05',fotos:['abcdefgh1'],ok:true},{id:'o2',tipo:'VMC',titulo:'Obra secreta',local:'Ponte de Lima',cp:'4990',mes:'2026-06',fotos:['abcdefgh2'],ok:false}]);
 const html=await (await s.call(token)).text();
 assert.match(html,/Obras que fizemos perto de si/);assert.match(html,/Ar condicionado em moradia/);assert.match(html,/maio de 2026/);
 assert.match(html,new RegExp('/proposta/'+token+'/img/abcdefgh1'));assert.doesNotMatch(html,/Obra secreta|abcdefgh2/);
 assert.ok(html.indexOf('perto de si')<html.indexOf('O seu investimento'));
});
