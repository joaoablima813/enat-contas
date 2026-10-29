import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const math=readFileSync(new URL('../public/quote-math.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/quotes.js',import.meta.url),'utf8');
const sample={client:'Cliente de teste',address:'Rua da Instalação, 12',contact:'912 345 678',date:'2026-10-26',topics:['Ar condicionado'],brand:'LG',margin:20,vat:23,warranty:'3 anos',lines:[{kind:'Equipamento',description:'Unidade',value:100,quantity:1,unit:'un.'}]};
const browser=()=>{const c=vm.createContext({window:{},navigator:{},document:{addEventListener(){},querySelector:()=>null},S:{vat:23},TOPICS:sample.topics,esc:s=>String(s),eur:n=>Number(n).toFixed(2)+' €',ic:()=>'',fd:s=>s,render(){},V:{tab:'orc'}});vm.runInContext(math+'\n'+ui,c);c.sample=sample;return c};
const server=rows=>{
 const source=readFileSync(new URL('../netlify/lib/whatsapp.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const blobs=new Map(),store={set:async(k,v,o)=>blobs.set(k,{data:v,metadata:o.metadata}),getWithMetadata:async k=>blobs.get(k)||null};
 const c=vm.createContext({db:{select:()=>({from:()=>({where:async()=>rows})})},quotes:{},eq:()=>null,Response,Buffer,URL,randomBytes:n=>Buffer.alloc(n,7),store,process:{env:{}}});
 vm.runInContext(stripTypeScriptTypes(source),c);return c;
};

test('client folder lets the user pick only that client\'s quotes for WhatsApp',()=>{
 const c=browser();
 vm.runInContext("quoteRows=[{id:9,document:sample},{id:8,document:{...sample,client:'Outro',contact:'911111111'}},{id:7,document:sample}];quoteClient=quoteClients()[0].key",c);
 const html=vm.runInContext('vQuotes()',c);
 assert.match(html,/data-qw="pick" value="9" checked/);assert.match(html,/data-qw="pick" value="7" >/);assert.doesNotMatch(html,/data-qw="pick" value="8"/);
 assert.match(html,/value="351912345678"/);assert.match(html,/Olá Cliente de teste/);
 assert.equal(vm.runInContext("quoteWaNumber('+44 7700 900123')",c),'447700900123');
});

test('message lists every selected quote with its link and a professional sign-off',()=>{
 const c=browser();
 const one=vm.runInContext("quoteWaText([{...sample,id:42}],['https://x/api/pdf/a'])",c);
 assert.match(one,/Segue o orçamento ORC 2026\/0042, referente a Ar condicionado LG, no valor total de \*147\.60 €\*/);assert.match(one,/:\nhttps:\/\/x\/api\/pdf\/a/);assert.match(one,/A proposta é válida por 15 dias/);assert.match(one,/João Lima\nEnat - Ponte de Lima$/);
 const many=vm.runInContext("quoteWaText([{...sample,id:42},{...sample,id:43}],['https://x/1','https://x/2'])",c);
 assert.match(many,/Seguem os orçamentos/);assert.match(many,/\*ORC 2026\/0042\*.*\nhttps:\/\/x\/1/);assert.match(many,/\*ORC 2026\/0043\*.*\nhttps:\/\/x\/2/);assert.match(many,/As propostas são válidas/);
});

test('server stores the PDF behind a private link that serves it back',async()=>{
 const c=server([{id:42,document:sample}]);
 c.req={method:'POST',url:'https://enat.example/api/whatsapp/pdf',json:async()=>({id:42,pdf:Buffer.from('%PDF-1.4').toString('base64')})};
 const r=await vm.runInContext("handleWhatsapp(req,'whatsapp/pdf',store)",c);
 assert.equal(r.status,200);const {url}=await r.json();assert.match(url,/^https:\/\/enat\.example\/proposta\/[A-Za-z0-9_-]{24}$/);
 const pdf=await vm.runInContext(`servePdf('pdf/${url.split('/').pop()}',store)`,c);
 assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.match(pdf.headers.get('content-disposition'),/ORC%20N%C2%BA%202026-0042%20Cliente%20de%20teste\.pdf/);
 assert.equal(Buffer.from(await pdf.arrayBuffer()).toString(),'%PDF-1.4');
 assert.equal((await vm.runInContext("servePdf('pdf/naoexiste',store)",c)).status,404);
 c.req={method:'POST',url:'https://enat.example/',json:async()=>({id:42,pdf:'não é base64'})};
 assert.equal((await vm.runInContext("handleWhatsapp(req,'whatsapp/pdf',store)",c)).status,400);
});

test('email field is optional, shown in the editor and copied into the send panel',()=>{
 const c=browser();
 vm.runInContext("quoteDraft={...newQuote(),...sample,id:42,email:'cliente@exemplo.pt'}",c);
 const html=vm.runInContext('vQuotes()',c);
 assert.match(html,/Email do cliente \(opcional\)/);assert.doesNotMatch(html,/data-qf="email"[^>]*required/);
 assert.match(html,/data-qw="email" value="cliente@exemplo\.pt"/);assert.match(html,/data-qa="mail-send"/);assert.match(html,/Enviar orçamento por email/);
 const link=vm.runInContext("quoteMailto('cliente@exemplo.pt',[{...sample,id:42}],quoteWaText([{...sample,id:42}],['https://x/1']))",c);
 assert.match(link,/^mailto:cliente%40exemplo\.pt\?subject=Or%C3%A7amento%20ORC%202026%2F0042%20%C2%B7%20Enat%20-%20Ponte%20de%20Lima&body=Ol%C3%A1/);assert.doesNotMatch(decodeURIComponent(link),/\*/);
});

test('server email: validates input, explains missing setup and formats a branded HTML body',async()=>{
 const c=server([]);
 let r=await vm.runInContext("handleEmail({method:'GET'},'email/estado',store)",c);assert.deepEqual(await r.json(),{configured:false,from:'pontedelima@enat.pt'});
 c.req={method:'POST',json:async()=>({})};
 r=await vm.runInContext("handleEmail(req,'email/enviar',store)",c);assert.equal(r.status,503);
 c.process.env.SMTP_PASSWORD='x';c.req={method:'POST',json:async()=>({to:'nao-e-email',subject:'s',text:'t',links:['https://x/api/pdf/'+'a'.repeat(24)]})};
 r=await vm.runInContext("handleEmail(req,'email/enviar',store)",c);assert.equal(r.status,400);
 c.req={method:'POST',json:async()=>({to:'a@b.pt',subject:'s',text:'t',links:['https://x/api/pdf/'+'a'.repeat(24)]})};
 r=await vm.runInContext("handleEmail(req,'email/enviar',store)",c);assert.equal(r.status,404);
 const html=vm.runInContext("emailHtml('Olá <b>,\\n*ORC 2026/0042*\\nhttps://x/api/pdf/abc')",c);
 assert.match(html,/Olá &lt;b&gt;,<br><b>ORC 2026\/0042<\/b><br><a href="https:\/\/x\/api\/pdf\/abc"/);
});

test('quotes API accepts an empty email and rejects an invalid one',async()=>{
 let saved;const db={insert:()=>({values:({document})=>{saved=document;return {returning:async()=>[{id:1,document}]}}})};
 const source=readFileSync(new URL('../netlify/lib/quotes.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
 const c=vm.createContext({db,quotes:{},Response,Date});vm.runInContext(stripTypeScriptTypes(source),c);
 for(const [email,status,stored] of [[undefined,201,''],['',201,''],[' cliente@exemplo.pt ',201,'cliente@exemplo.pt'],['cliente@',400]]){
  c.req={method:'POST',json:async()=>({...structuredClone(sample),email})};
  const r=await vm.runInContext("handleQuotes(req,'orcamentos')",c);assert.equal(r.status,status,String(email));if(stored!==undefined)assert.equal(saved.email,stored);
 }
});
