import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const quote={client:'Família Araújo',address:'Rua do Souto, 12, 4990-062 Ponte de Lima',contact:'912345678',email:'cliente@exemplo.pt',date:'2026-11-02',topics:['Ar condicionado'],margin:20,vat:23,lines:[
 {kind:'Equipamento',description:'Unidade exterior',value:1000,quantity:1,unit:'un.'},
 {kind:'Material',description:'Tubo de cobre',value:3.2,quantity:25,unit:'m'},
 {kind:'Acessórios',description:'Suportes',value:12.5,quantity:3,unit:'un.'},
 {kind:'Mão de obra',description:'Montagem e ensaio',value:35,quantity:8,unit:'h'},
 {kind:'Outros',description:'',value:0}]};

function load(fetchImpl,rows){
 const ctx=vm.createContext({console,URL,URLSearchParams,Response,Buffer,AbortSignal,Intl,Date,JSON,Math,Number,String,Array,Object,Error,Boolean,process:{env:{TOC_CLIENT_ID:'cid',TOC_CLIENT_SECRET:'sec',TOC_OAUTH_URL:'https://app9.toconline.pt/oauth/',TOC_API_URL:'https://app9.toconline.pt/api'}},fetch:fetchImpl,
  db:{select:()=>({from:()=>({where:async()=>rows})})},quotes:{id:'id'},eq:()=>null});
 ctx.globalThis=ctx;
 vm.runInContext(read('public/quote-math.js')+'\n'+read('public/toc-invoice.js'),ctx);
 vm.runInContext(stripTypeScriptTypes(read('netlify/lib/toconline.ts').replace(/^import .*;\n/gm,'').replace(/^export /gm,''))+'\nglobalThis.handleToc=handleToc;',ctx);
 return ctx;
}
const memStore=()=>{const m=new Map();return {m,get:async(k)=>m.has(k)?JSON.parse(m.get(k)):null,setJSON:async(k,v)=>{m.set(k,JSON.stringify(v))},delete:async k=>{m.delete(k)}}};

test('invoice lines keep the quote net total and use 23% VAT',()=>{
 const c=load(()=>{},[]);const L=c.EnatToc.invoiceLines(quote),t=c.EnatToc.invoiceTotals(L);
 assert.equal(L.length,4);
 assert.deepEqual(L.map(l=>l.item_type),['Product','Product','Product','Service']);
 assert.equal(t.net,c.quoteTotals(quote).net);
 assert.equal(t.vat,Math.round(t.net*23)/100);
 assert.equal(L[1].quantity,25);assert.equal(L[1].unit,'m');
});
test('address, postcode and NIF helpers',()=>{
 const c=load(()=>{},[]);
 assert.deepEqual({...c.EnatToc.splitAddress(quote.address)},{address:'Rua do Souto, 12',postcode:'4990-062',city:'Ponte de Lima'});
 assert.deepEqual({...c.EnatToc.splitAddress('Rua A')},{address:'Rua A',postcode:'',city:''});
 assert.equal(c.EnatToc.validNif('229659179'),true);assert.equal(c.EnatToc.validNif('229659178'),false);
});
test('issues a finalized FT from the quote, gets the PDF and emails the client once',async()=>{
 const calls=[];
 const fetchImpl=async(url,o={})=>{const u=String(url);calls.push({u,o});
  if(u.includes('/oauth/auth?'))return new Response(null,{status:302,headers:{location:'https://oauth.pstmn.io/v1/callback?code=abc'}});
  if(u.endsWith('/oauth/token'))return Response.json({access_token:'tok',expires_in:14400,refresh_token:'ref',token_type:'Bearer'});
  if(u.endsWith('/api/v1/commercial_sales_documents')&&o.method==='POST')return Response.json({data:{id:'77',type:'commercial_sales_documents',attributes:{document_no:'FT 2026/15'}}});
  if(u.includes('/api/v1/commercial_sales_documents/77'))return Response.json({data:{id:'77',attributes:{document_no:'FT 2026/15',date:'2026-11-09',gross_total:2000}}});
  if(u.includes('/api/url_for_print/77'))return Response.json({data:{attributes:{url:{scheme:'https',host:'app9.toconline.pt',port:443,path:'/public-file/x'}}}});
  if(u.endsWith('/api/email/document'))return new Response(null,{status:200});
  return new Response('nope',{status:500})};
 const c=load(fetchImpl,[{id:42,document:quote}]),store=memStore();
 const body={key:'abcdef123456',obra:'o1',quote:42,send:true,email:'cliente@exemplo.pt',customer:{name:'Família Araújo',nif:'229659179',address:'Rua do Souto, 12',postcode:'4990-062',city:'Ponte de Lima'}};
 const req=()=>new Request('https://x/api/toc/fatura',{method:'POST',body:JSON.stringify(body)});
 const r=await c.handleToc(req(),'toc/fatura',store);const j=await r.json();
 assert.equal(r.status,201);assert.equal(j.number,'FT 2026/15');assert.equal(j.pdf,'https://app9.toconline.pt/public-file/x');assert.equal(j.email,'cliente@exemplo.pt');assert.equal(j.total,2000);
 const create=calls.find(x=>x.u.endsWith('/api/v1/commercial_sales_documents'));const sent=JSON.parse(create.o.body);
 assert.equal(sent.document_type,'FT');assert.equal(sent.finalize,true);assert.equal(sent.customer_tax_registration_number,'229659179');assert.equal(sent.external_reference,'ORC 2026/0042');
 assert.equal(sent.lines.length,4);assert.ok(sent.lines.every(l=>l.tax_percentage===23));
 assert.equal(create.o.headers.authorization,'Bearer tok');
 const tokenCall=calls.find(x=>x.u.endsWith('/oauth/token'));assert.equal(tokenCall.o.headers.authorization,'Basic '+Buffer.from('cid:sec').toString('base64'));
 // The same request again returns the same invoice without creating another.
 const n=calls.length,again=await (await c.handleToc(req(),'toc/fatura',store)).json();
 assert.equal(again.id,'77');assert.equal(calls.length,n);
});
test('a TOC Online error does not block a retry and invalid NIFs are refused',async()=>{
 const fetchImpl=async(url)=>{const u=String(url);
  if(u.includes('/oauth/auth?'))return new Response(null,{status:302,headers:{location:'https://oauth.pstmn.io/v1/callback?code=abc'}});
  if(u.endsWith('/oauth/token'))return Response.json({access_token:'tok',expires_in:14400});
  return Response.json({errors:[{title:'Erro',detail:'Série inexistente'}]},{status:422})};
 const c=load(fetchImpl,[{id:42,document:quote}]),store=memStore();
 const body={key:'abcdef654321',obra:'o1',quote:42,send:false,customer:{name:'Cliente'}};
 const r=await c.handleToc(new Request('https://x',{method:'POST',body:JSON.stringify(body)}),'toc/fatura',store);
 assert.equal(r.status,502);assert.match((await r.json()).error,/Série inexistente/);assert.equal(store.m.has('toc-pedido-abcdef654321'),false);
 const bad=await c.handleToc(new Request('https://x',{method:'POST',body:JSON.stringify({...body,customer:{name:'C',nif:'123456780'}})}),'toc/fatura',store);
 assert.equal(bad.status,400);
});
