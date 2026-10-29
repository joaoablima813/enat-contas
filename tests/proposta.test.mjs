import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
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
 const ctx=()=>vm.createContext({...f,Response,URL,Buffer,Headers,console,structuredClone,randomBytes:k=>Buffer.alloc(k,++n),process:{env:{}},store});
 const c=ctx(),w=ctx(),q=ctx();
 for(const p of ['public/quote-math.js','public/gestao.js','public/quote-obra.js'])vm.runInContext(read(p),c);
 vm.runInContext(ts('netlify/lib/proposta.ts'),c);vm.runInContext(ts('netlify/lib/whatsapp.ts'),w);vm.runInContext(ts('netlify/lib/quotes.ts'),q);
 const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
 const call=(token,method='GET',body,agent=ua)=>{c.req={method,url:'https://enat.example/proposta/'+token,headers:new Headers({'user-agent':agent}),text:async()=>JSON.stringify(body)};c.token=token;return vm.runInContext('handleProposta(req,token,store)',c)};
 // Sends a quote the way the app does: the PDF is stored and the link points to the quote page.
 const send=async(id,group)=>{w.req={method:'POST',url:'https://enat.example/api/whatsapp/pdf',json:async()=>({id,group,channel:'whatsapp',pdf:Buffer.from('%PDF-1.4').toString('base64')})};const r=await vm.runInContext('handleWhatsapp(req,"whatsapp/pdf",store)',w);return (await r.json()).url.split('/').pop()};
 return {c,q,f,store,call,send};
}
let n=0;

test('the link opens a branded quote page with the PDF and the five answers, and stays private',async()=>{
 const s=server();s.f.tables.quotes.push({id:42,document:sample,createdAt:new Date(),updatedAt:new Date()});
 const token=await s.send(42);
 const r=await s.call(token);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);
 const html=await r.text();
 assert.match(html,/enat-logo\.png/);assert.match(html,/Enat - Energias/);assert.match(html,/ORC \d{4}\/0042/);assert.match(html,/Olá, Família Araújo/);
 assert.match(html,new RegExp('/proposta/'+token+'/pdf'));
 for(const k of ['adjudicar','revisao','pensar','mais_tarde','rejeitar'])assert.match(html,new RegExp('data-kind="'+k+'"'));
 assert.match(html,/1771,20 €/,'total with VAT and margin');assert.match(html,/885,60 €/,'50% due on award');
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
