import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// Runs the whole app script with a minimal page, then renders every screen with sample data.
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const html=read('index.html'),main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function app(state,opts={}){
 const els={},el=id=>els[id]||(els[id]={id,innerHTML:'',hidden:false,textContent:'',className:'',title:'',classList:{add(){},remove(){}},addEventListener(){},click(){}});
 const store=new Map(state?[['enat-contas-2',JSON.stringify(state)]]:[]),ls={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const c=vm.createContext({console,Intl,structuredClone,TextEncoder,URL,setTimeout,clearTimeout,setInterval(){},atob,
  localStorage:ls,sessionStorage:{getItem:()=>opts.session||'',setItem(){},removeItem(){}},history:{replaceState(){},pushState(){},go(){},back(){}},
  navigator:{onLine:true},location:{hostname:'localhost'},scrollTo(){},alert(){},confirm:()=>true,prompt:()=>'',
  fetch:opts.fetch||(()=>Promise.reject(new Error('offline'))),
  document:{querySelector:s=>s.startsWith('#')?el(s.slice(1)):null,querySelectorAll:()=>[],addEventListener(){},activeElement:{tagName:'BODY'},hidden:false,createElement:()=>el('x')}});
 c.window=c;c.addEventListener=()=>{};
 for(const f of ['quote-math.js','sync.js','gestao.js','contabilista.js','price-tables.js','quotes.js','pv-sizing.js','pv.js'])vm.runInContext(read(f),c);
 vm.runInContext(main,c);return{c,run:s=>vm.runInContext(s,c),els};
}
const state={vat:23,ts:5,obras:[
 {id:'o1',name:'Moradia T3',client:'Família Araújo',status:'em_curso',valor:12300,phone:'912345678',plano:[{desc:'Adjudicação',pct:50,date:'2026-01-10'},{desc:'Conclusão',pct:50,date:''}],previsto:{mat:5000,mo:2000},orc:3},
 {id:'o2',name:'Loja <Centro>',client:'Mercearia',status:'concluida',valor:6150,done:'2025-10-01',equip:['VMC']}],
 tx:[{id:'t1',obra:'o1',type:'recebimento',desc:'Sinal',date:'2026-01-12',total:2000,rate:0},{id:'t2',obra:'o1',type:'fatura',desc:'Cobre',topic:'Ar condicionado',date:'2026-02-01',total:1230,rate:23},{id:'t3',obra:'o2',type:'mao_obra',desc:'Montagem',topic:'VMC',date:'2025-09-20',total:600,rate:0}],inv:[]};

test('every screen renders with sample data, including the new management pages',()=>{
 const {run}=app(state);
 const home=run('vHome()');assert.match(home,/Pagamentos em atraso/);assert.match(home,/Fotografar fatura/);assert.match(home,/wa\.me\/351912345678/);
 assert.match(run('vObras()'),/Moradia T3/);assert.ok(!run('vObras()').includes('<Centro>'),'names are escaped');
 run("V.of='concluida'");assert.ok(!run('obrasList()').includes('Moradia T3'));run("V.of='';V.oq='araujo'");assert.match(run('obrasList()'),/Moradia T3/);
 run("V.obra='o1';V.seg='contas'");const contas=run('vObra()');assert.match(contas,/Orçamentado vs real/);assert.match(contas,/Ver o orçamento de origem/);
 run("V.seg='recebimentos'");const rec=run('vObra()');assert.match(rec,/Plano de pagamentos/);assert.match(rec,/Em atraso/);assert.match(rec,/Lembrar cliente por WhatsApp/);
 run("V.obra=null;V.tab='cli'");assert.match(run('vClientes()'),/Família Araújo/);run("V.cli=EnatGestao.clientKey('Família Araújo')");assert.match(run('vClientes()'),/Novo orçamento para este cliente/);
 for(const k of ['mes','tri','ano','ano_ant']){run(`V.per='${k}'`);assert.match(run('vRel()'),/Exportar para o contabilista/)}
 run("V.per='ano'");assert.match(run('vRel()'),/Lucro previsto por obra/);
 const def=run('vDef()');assert.match(def,/Cópias de segurança/);assert.match(def,/Apagar todos os dados/);
 run("V.gq='cobre'");assert.match(run('globalRes()'),/Movimentos \(1\)/);
 assert.match(run('vMov()')+run('vIva()')+run('vMan()'),/Movimentos/);
 run("D={kind:'obra',...S.obras[0]};sheet()");run("D={kind:'pickobra'};sheet()");
});
test('saving marks the changed items so other devices can merge them',()=>{
 const {run}=app(state);
 run("S.tx[0].total=2500;save()");assert.equal(typeof run("S.tx[0].u"),'number');assert.equal(run("S.tx[1].u"),undefined);
 run("S.obras=S.obras.filter(o=>o.id!=='o2');save()");assert.equal(typeof run("S.del['obras:o2']"),'number');
});
test('a save that meets a newer server version merges both and sends the result',async()=>{
 // The server follows the API rule: a PUT whose base differs from the stored version gets 409 with that version.
 let server={...structuredClone(state),ts:50,obras:[...state.obras,{id:'o9',name:'Obra do PC',client:'X',status:'em_curso',valor:1,u:40}]},puts=0;
 const res=(status,body)=>({status,ok:status<300,json:async()=>body});
 const fetch=async(url,o={})=>{
  if(url==='/api/estado'&&o.method==='PUT'){puts++;const b=JSON.parse(o.body);if(b.base!==server.ts)return res(409,{state:server});server=b.state;return res(200,{ok:true})}
  if(url==='/api/estado')return res(200,{state:server});
  return res(404,{});
 };
 const {run}=app(state,{session:'tok',fetch});
 run("S.tx.push(withBase({id:'tn',obra:'o1',type:'despesa',desc:'Gasóleo',date:'2026-02-02',total:40,rate:0}));LAST=EnatSync.stamp(S,LAST);S.ts=Date.now()");
 await run('sendState()');
 assert.equal(puts,2);
 assert.ok(server.obras.some(o=>o.id==='o9'),'keeps the job created on the other device');
 assert.ok(server.tx.some(x=>x.id==='tn'),'keeps the expense added here');
 assert.equal(run('BASE'),server.ts);assert.equal(run('SYNC'),'ok');
});
