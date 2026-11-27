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
 for(const f of ['quote-math.js','sync.js','gestao.js','quote-obra.js','contabilista.js','price-tables.js','solucoes.js','quotes.js','empresa.js','portfolio.js','anuncios.js','equipamentos.js','material.js','dashboard.js','pedido-perguntas.js','pedido.js','quote-ai.js','leads.js','lead-contactos.js','push.js','agenda.js','pv-sizing.js','pv.js','bc-sizing.js'])vm.runInContext(read(f),c);
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

test('quotes show when the client opened them, their answer and the history, and new answers reach the home page',()=>{
 const {run}=app(state);
 const doc={client:'Família Araújo',address:'Rua 1',contact:'912345678',date:'2026-10-20',topics:['Ar condicionado'],brand:'LG',margin:20,vat:23,status:'aceite',validity:30,obra:'o1',lines:[{kind:'Equipamento',description:'Split',value:1000,quantity:1,unit:'un.'}]};
 const ev=[{id:1,kind:'enviado',note:'WhatsApp',at:'2026-10-20T10:00:00Z',read:true},{id:2,kind:'visto',note:'',at:'2026-10-20T18:40:00Z',read:true},{id:3,kind:'pdf',note:'',at:'2026-10-20T18:41:00Z',read:true},{id:4,kind:'adjudicar',note:'',at:'2026-10-21T09:00:00Z',read:true},{id:5,kind:'pensar',note:'Falar com a família',at:'2026-10-22T09:00:00Z',read:false}];
 run(`quoteRows=[{id:3,document:${JSON.stringify(doc)},events:${JSON.stringify(ev)}},{id:4,document:${JSON.stringify({...doc,status:'enviado',obra:undefined})},events:[{id:6,kind:'visto',at:'2026-10-22T09:00:00Z',read:true}]}]`);
 const home=run('vHome()');assert.match(home,/Respostas de clientes \(1\)/);assert.match(home,/q-pensar">A pensar/);assert.match(home,/q-new">Novo/);
 const list=run("V.tab='orc';quoteDraft=null;quoteClient=null;vQuotes()");assert.match(list,/Respostas novas de clientes/);assert.match(list,/Resposta nova/);
 run("quoteClient=quoteClients()[0].key");assert.match(run('vQuotes()'),/q-visto">Visto/);
 run('quoteOpen(3)');const ed=run('quoteEditor()');
 assert.match(ed,/Acompanhamento do cliente/);assert.match(ed,/A pensar/);assert.match(ed,/«Falar com a família»/);assert.match(ed,/O cliente tinha adjudicado e mudou para «A pensar»/);
 assert.match(ed,/O cliente abriu o PDF/);assert.match(ed,/Enviado por WhatsApp/);assert.match(ed,/Respondeu: Adjudicado/);
 assert.equal(run('quoteUnread().length'),0,'opening the quote marks the answer as seen');
});
test('leads: colored stages, optional fields, a quote prefilled from the lead and its quotes listed',()=>{
 const leads=[{id:'l1',name:'Ana Costa',contact:'913000000',email:'ana@exemplo.pt',address:'Rua A, Ponte de Lima',brand:'LG',stage:'perdido',solutions:['Ar condicionado','Painéis fotovoltaicos','Carregador automóvel'],call:'nao',house:'Moradia',date:'2026-10-20'},
  {id:'l2',name:'Rui',stage:'nova',solutions:[],date:'2026-10-21'}];
 const {run}=app({...state,leads});
 const list=run("V.tab='leads';vLeads()");
 assert.match(list,/lead-row lead-nova/);assert.match(list,/data-la="lt" data-id="no">Não atendeu/,'own tab for not answered');assert.match(run("V.lt='no';vLeads()"),/lead-row lead-perdido/);run("V.lt=''");
 run("V.ls='perdido'");assert.ok(!run('leadsList()').includes('Rui'));run("V.ls='';V.lq='costa'");assert.ok(!run('leadsList()').includes('Rui'));run("V.lq=''");
 // Nothing is required: an empty new lead saves with today's date.
 run("leadDraft=leadNew();leadDraft.name='  Teste ';leadDraft.date='';leadSave()");
 assert.equal(run("S.leads.at(-1).name"),'Teste');assert.equal(run("S.leads.at(-1).date"),run('leadToday()'));
 run("leadOpen('l1')");const ed=run('vLeads()');
 assert.match(ed,/Fatura elétrica/);assert.match(ed,/lead-ed lead-perdido/);assert.match(ed,/Orçamentos desta lead/);
 run("leadDraft.solutions=['VMC']");assert.ok(!run('vLeads()').includes('Fatura elétrica'),'the electricity bill only shows for PV');
 run("leadOpen('l1');quoteRows=[{id:7,document:{client:'Ana Costa',date:'2026-10-22',topics:['VMC'],lines:[{kind:'Equipamento',description:'VMC',quantity:1,value:100}],margin:20,vat:23,lead:'l1'},events:[]},{id:8,document:{client:'Outro',date:'2026-10-22',topics:['VMC'],lines:[],margin:20,vat:23},events:[]}]");
 const qs=run('leadQuotesHtml(leadDraft)');assert.match(qs,/data-a="openquote" data-id="7"/);assert.match(qs,/data-la="pdf" data-id="7"/);assert.ok(!qs.includes('data-id="8"'));
 run('leadQuote()');
 assert.equal(run('V.tab'),'orc');assert.equal(run('quoteDraft.client'),'Ana Costa');assert.equal(run('quoteDraft.contact'),'913000000');assert.equal(run('quoteDraft.lead'),'l1');assert.equal(run('quoteDraft.brand'),'LG');
 assert.deepEqual([...run('quoteDraft.topics')],['Ar condicionado','UPAC (fotovoltaico)','Carregador automóvel']);
 assert.match(run('quoteEditor()'),/Lead Ana Costa/);
 // Global search also finds leads.
 run("quoteDraft=null;V.gq='ana costa'");assert.match(run('globalRes()'),/Leads \(1\)/);
});
test('leads advance with their quotes, never go back and a lost lead stays lost',()=>{
 const {run}=app({...state,leads:[{id:'a',stage:'triagem',solutions:[]},{id:'b',stage:'perdido',solutions:[]},{id:'c',stage:'ganho',solutions:[]}]});
 run("leadFromQuote({lead:'a'},'orcamento')");assert.equal(run("S.leads[0].stage"),'orcamento');
 run("leadFromQuote({lead:'a'},'enviada')");assert.equal(run("S.leads[0].stage"),'enviada');
 run("leadFromQuote({lead:'a'},'orcamento')");assert.equal(run("S.leads[0].stage"),'enviada');
 run("leadFromQuote({lead:'b'},'ganho')");assert.equal(run("S.leads[1].stage"),'perdido');
 run("leadFromQuote({lead:'c'},'enviada')");assert.equal(run("S.leads[2].stage"),'ganho');
 assert.equal(run("leadQuoteStage({status:'rascunho'},[{kind:'adjudicar'}])"),'ganho');
 assert.equal(run("leadQuoteStage({status:'enviado'},[])"),'enviada');
});
test('leads merge between devices like jobs',()=>{
 const {run}=app(state);
 const out=run(`EnatSync.merge({ts:2,obras:[],tx:[],inv:[],leads:[{id:'x',name:'Telemóvel',u:5}]},{ts:1,obras:[],tx:[],inv:[],leads:[{id:'y',name:'PC',u:4}],del:{}})`);
 assert.deepEqual([...out.leads.map(l=>l.id)].sort(),['x','y']);
});

test('leads received by email appear as Leads novas until marked as received, called or moved to another stage',()=>{
 const {run}=app(state);
 const inbox=JSON.stringify([{id:'meta-x',src:'meta',received:'2026-10-31T10:00:00Z',name:'Nando Costa',contact:'+351927386939',email:'n@x.pt',house:'Moradia',timing:'Já',stage:'nova',solutions:[],call:'',date:'2026-10-31'}]);
 assert.equal(run(`leadInbox(${inbox})`),true);assert.equal(run(`leadInbox(${inbox})`),false,'not added twice');
 const main=run('vLeads()');assert.ok(!main.includes('lead-row lead-email'),'new leads only in their own tab');assert.match(main,/data-id="novas">Novas <span class="lead-seg-n">1/);assert.ok(!run('vHome()').includes('lead-row'),'the list of new leads is not on the home screen (the dashboard shows only how many)');
 const list=run("V.lt='novas';vLeads()");assert.match(list,/Leads novas \(1\)/);assert.match(list,/lead-row lead-email/);assert.match(list,/lead-src-email">Email</);run("V.lt=''");
 run("leadOpen('meta-x')");assert.match(run('vLeads()'),/Marcar como recebida/);
 run("leadDraft.seen=true;leadSave();leadDraft=null");const after=run('vLeads()');
 assert.ok(!after.includes('Leads novas'));assert.match(after,/lead-row lead-nova/);assert.ok(!after.includes('Sincronizada do Outlook'));
 run("S.leads[0].seen=false;S.leads[0].call='nao'");assert.ok(!run('vLeads()').includes('Leads novas'));assert.match(run("V.lt='no';vLeads()"),/Nando Costa/);run("V.lt=''");
 run("S.leads[0].call='';S.leads[0].stage='contacto'");assert.ok(!run('leadsNewHtml()'));
 run("S.leads=[];S.del={'leads:meta-x':Date.now()}");assert.equal(run(`leadInbox(${inbox})`),false,'deleted leads stay deleted');
});
test('the leads list shows 10 and «Mostrar mais» opens all of them in columns of 20',()=>{
 const leads=Array.from({length:45},(_,i)=>({id:'l'+i,name:'Cliente '+i,stage:'contacto',solutions:[],date:'2026-10-'+String(1+i%28).padStart(2,'0')}));
 const {run}=app({...state,leads});
 const list=run("V.tab='leads';vLeads()");
 assert.equal((list.match(/data-la="open"/g)||[]).length,10);assert.match(list,/Mostrar mais \(35\)/);
 run("V.lall='todas'");const all=run('vLeads()');
 assert.equal((all.match(/data-la="open"/g)||[]).length,45);assert.equal((all.match(/class="lead-col"/g)||[]).length,3);assert.match(all,/41–45/);
 run("V.lq='Cliente 44'");const found=run('leadsList()');assert.match(found,/Cliente 44/);assert.ok((found.match(/data-la="open"/g)||[]).length<45);
});

test('leads that did not answer move to their own column, with call day, contact time and a due reminder',()=>{
 const past=new Date(Date.now()-6e4),fut=new Date(Date.now()+36e5),loc=d=>new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16);
 const leads=[{id:'n1',name:'Rita Nunes',contact:'915 000 000',stage:'contacto',solutions:[],call:'nao',callDay:'2026-11-01',callAt:loc(past),date:'2026-10-30'},
  {id:'n2',name:'Paulo Sá',stage:'contacto',solutions:[],call:'nao',callAt:loc(fut),date:'2026-10-30'},
  {id:'a1',name:'Luís Mota',stage:'contacto',solutions:[],call:'atendeu',date:'2026-10-29'}];
 const {run,els}=app({...state,leads},{session:'s'});
 run("V.tab='leads'");
 const main=run('leadsList()'),side=run('leadsNoHtml()');
 assert.ok(!main.includes('Rita Nunes')&&!main.includes('Paulo Sá'),'not answered leads leave the main table');assert.match(main,/Luís Mota/);
 assert.match(side,/Não atendeu \(2\)/);assert.match(side,/data-ln="callDay" data-id="n1" value="2026-11-01"/);assert.match(side,/data-ln="callAt"/);
 assert.ok(side.indexOf('Rita Nunes')<side.indexOf('Paulo Sá'),'nearest contact time first');
 assert.match(run('vLeads()'),/Não atendeu <span class="lead-seg-n">2<\/span>/,'tab shows how many');assert.match(run("V.lt='no';vLeads()"),/id="lno"/);run("V.lt=''");
 assert.equal(run("leadDue().map(l=>l.id).join()"),'n1');
 run('leadRemind()');assert.match(els['lead-alert'].innerHTML,/Ligar a Rita Nunes/);assert.match(els['lead-alert'].innerHTML,/tel:915000000/);
 run("S.leads[0].callDone=S.leads[0].callAt;leadRemind()");assert.equal(els['lead-alert'].innerHTML,'');
 // Registering a «Não atendeu» call fills today's date and shows the call-back time.
 run("leadOpen('a1');leadDraft.calls.push(leadCallNew('nao'));leadCallsDerive(leadDraft)");
 assert.equal(run('leadDraft.call'),'nao');assert.equal(run('leadDraft.callDay'),run('leadToday()'));
 assert.match(run('vLeads()'),/horário em que o cliente quer ser contactado/);
});

test('lead editor has the campaign fields and a visit date for scheduled visits',()=>{
 const {run}=app({...state,leads:[{id:'v1',name:'Ana Lima',stage:'visita',solutions:[],heating:'Botija de gás',timing:'O mais rápido possível',date:'2026-11-01'}]});
 run("V.tab='leads';leadOpen('v1')");const ed=run('vLeads()');
 assert.match(ed,/Que sistema usa hoje para aquecer a água\?/);assert.match(ed,/value="Botija de gás"/);
 assert.match(ed,/Quando pretende fazer a instalação\?/);assert.match(ed,/Data e hora da visita/);
});

test('call alerts close on any action and stay in the notification history',()=>{
 const past=new Date(Date.now()-6e4),loc=d=>new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16);
 const {run,els}=app({...state,leads:[{id:'n1',name:'Rita Nunes',contact:'915 000 000',stage:'contacto',solutions:[],call:'nao',callAt:loc(past),date:'2026-10-30'}]},{session:'s'});
 run('leadRemind()');assert.match(els['lead-alert'].innerHTML,/Ligar a Rita Nunes/);assert.match(els['lead-alert'].innerHTML,/data-lr="dismiss"/);
 assert.equal(run('notifUnread()'),1);run('notifBell()');assert.match(els.bell.innerHTML,/bell-n">1</);
 // «Abrir lead» (ou qualquer outro botão do aviso) fecha o aviso, mas a notificação fica no histórico.
 run("notifClose(leadCallNotif(S.leads[0]));leadRemind()");assert.equal(els['lead-alert'].innerHTML,'');
 assert.equal(run('S.notifs.length'),1);assert.equal(run('notifUnread()'),0);
 run("notifOpen=true");const p=run('notifPanel()');assert.match(p,/Ligar a Rita Nunes/);assert.match(p,/Marcar como não lida/);assert.match(p,/Apagar todas/);
 // Apagada do histórico, não volta a aparecer.
 run("S.notifs=[];save();leadRemind()");assert.equal(run('S.notifs.length'),0);assert.equal(els['lead-alert'].innerHTML,'');
 // Leads novas recebidas por email também ficam no histórico.
 run(`leadInbox([{id:'meta-z',src:'meta',received:'2026-11-02T18:40:00Z',name:'Antonio Cacais',contact:'+351968185974',heating:'Botija de gás',stage:'nova',solutions:[],call:'',date:'2026-11-02'}])`);
 assert.match(run('notifPanel()'),/Nova lead: Antonio Cacais/);
});

test('calendar lists calls, visits and maintenance and marks each as contacted or not',()=>{
 const loc=d=>new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16),fut=loc(new Date(Date.now()+864e5)),fut2=loc(new Date(Date.now()+2*864e5));
 const {run}=app({...state,leads:[{id:'n1',name:'Rita Nunes',contact:'915000000',stage:'contacto',solutions:[],call:'nao',callAt:fut,date:'2026-10-30'},
  {id:'v1',name:'Ana Lima',stage:'visita',solutions:[],visitAt:fut2,address:'Rua A',date:'2026-10-30'},{id:'v2',name:'Sem Data',stage:'visita',solutions:[],date:'2026-10-30'}]},{session:'s'});
 assert.equal(run("calEvents().map(e=>e.kind).sort().join()"),'call,man,visit');
 run("V.tab='cal'");const cal=run('vCal()');
 assert.match(cal,/Calendário/);assert.match(cal,/Rita Nunes/);assert.match(cal,/Ana Lima/);assert.match(cal,/Visitas sem data \(1\)/);assert.match(cal,/Contactado/);assert.match(cal,/Não contactado/);
 assert.match(cal,/Por contactar/,'the past maintenance without status is overdue');
 run(`calSet('lead','n1','call|${fut}','sim')`);assert.equal(run("S.leads[0].callDone===S.leads[0].callAt"),true);assert.equal(run(`calEvents().find(e=>e.kind==='call').st`),'sim');
 run(`calSet('lead','n1','call|${fut}','nao')`);assert.equal(run(`calEvents().find(e=>e.kind==='call').st`),'nao');assert.equal(run("S.leads[0].callDone"),'');
 run(`calSet('obra','o2','man|2026-10-01','sim')`);assert.equal(run("S.obras[1].ct['man|2026-10-01']"),'sim');assert.ok(!run('vCal()').includes('Por contactar'));
 run(`V.cd='${fut2.slice(0,10)}'`);assert.match(run('vCal()'),/Ana Lima/);
});

test('a lead keeps every call with its day, result and notes, newest first, and old single calls become the first call',()=>{
 const {run}=app({...state,leads:[{id:'h1',name:'Hugo Reis',stage:'contacto',solutions:[],call:'nao',callDay:'2026-11-02',date:'2026-11-01'}]});
 run("V.tab='leads';leadOpen('h1')");
 assert.equal(run('leadDraft.calls.length'),1,'the old call becomes the first in the history');
 assert.match(run('vLeads()'),/Chamada 1 · /);
 run("leadDraft.calls.push({id:'c2',day:'2026-11-05',time:'10:15',result:'atendeu',notes:'Quer orçamento para AC\\nLigar depois'})");
 run("leadDraft.calls.push({id:'c3',day:'2026-11-04',time:'18:00',result:'nao',notes:''})");
 run('leadSave()');
 const l=run("S.leads.find(x=>x.id==='h1')");
 assert.equal(l.calls.length,3);assert.equal(l.call,'atendeu','the latest call sets the result');assert.equal(l.callDay,'2026-11-05');
 run("leadOpen('h1');leadCallOpen.add('c2')");const ed=run('vLeads()');
 assert.match(ed,/Chamadas \(3\)/);assert.match(ed,/Quer orçamento para AC/);assert.match(ed,/data-ci="c2" open/);
 assert.ok(ed.indexOf('data-ci="c2"')<ed.indexOf('data-ci="c3"')&&ed.indexOf('data-ci="c3"')<ed.indexOf('data-ci="c0"'),'newest call first');
 assert.match(run("leadRow(S.leads.find(x=>x.id==='h1'))"),/3 chamadas/);
});

test('company screen: blank profile suggests credentials to fill, and the quote terms use it without the IBAN',()=>{
 const {run}=app(state);
 run("V.tab='emp'");const html=run('vEmp()');
 assert.match(html,/Técnico certificado em gases fluorados/);assert.match(html,/Semanas livres para instalação/);assert.match(html,/1 obra concluída/);
 assert.doesNotMatch(run("quoteTerms({validity:30}).join('|')"),/IBAN/);
 run("globalThis.ENAT_EMPRESA={garantiaEquip:'5 anos',semanas:['2099-03-04'],credenciais:[{nome:'DGEG',numero:'n.º 77'},{nome:'Sem n.º',numero:''}],contacto:{nome:'Ana Reis'}}");
 const t=run("quoteTerms({validity:30}).join('|')");
 assert.match(t,/Garantia dos equipamentos: 5 anos/);assert.match(t,/disponível a partir da semana de 2 de março/);assert.doesNotMatch(t,/DGEG: n\.º 77/);assert.doesNotMatch(t,/Sem n\.º/);
 assert.match(run("quoteWaText([{client:'Rui',id:1,date:'2026-11-22',topics:['VMC'],brand:'',lines:[],validity:15}],['https://x/1'])"),/Sou Ana Reis, da Enat[\s\S]*Ana Reis\nEnat/);
});

test('job photos screen: several categories per job, legacy photos kept, and only finished jobs with consent are visible',()=>{
 const {run}=app({...state,obras:[...state.obras,{id:'o3',name:'AC',client:'Rui',status:'concluida',address:'Rua Nova 5, 4990-062 Ponte de Lima'}]});
 run("V.tab='obras';V.obra='o3';V.seg='fotos'");const html=run('vObra()');
 assert.match(html,/Categorias da obra/);assert.match(html,/O cliente autorizou/);assert.match(html,/Bomba de calor AQS/);
 run("pfStart(S.obras[2])");assert.equal(run('S.obras[2].port.local'),'Ponte de Lima');assert.equal(run('S.obras[2].port.cp'),'4990');
 run("Object.assign(S.obras[2].port,{ok:true,descricao:'Multisplit e AQS',cats:[{tipo:'Ar condicionado',titulo:'',fotos:['abcdefgh1']},{tipo:'Bomba de calor AQS',titulo:'AQS 200 L',fotos:['abcdefgh3']},{tipo:'UPAC',titulo:'',fotos:[]}]});S.obras[0].port={fotos:['abcdefgh2'],tipo:'VMC',titulo:'x',local:'y',ok:true}");
 const pub=JSON.parse(run('JSON.stringify(pfPublic())'));
 assert.deepEqual(pub.map(w=>[w.id,w.grupo,w.tipo,w.ok]),[['o1-0','o1','VMC',false],['o3-0','o3','Ar condicionado',true],['o3-1','o3','Bomba de calor AQS',true]],'one entry per category with photos; a job in progress is not shown yet; the old single-category format still works');
 assert.equal(pub[1].titulo,'Ar condicionado em Ponte de Lima','a default title');assert.equal(pub[2].descricao,'Multisplit e AQS');
 assert.ok(!JSON.stringify(pub).includes('Rui')&&!JSON.stringify(pub).includes('Rua Nova'),'no client name or address');
});

test('photos for the site without a job in the app: kept on the server only and published as solo',()=>{
 const {run}=app(state);
 run("PF_SOLO=[{id:'sabc123',cats:[{tipo:'UPAC',titulo:'',fotos:['abcdefgh9']}],local:'Arcos de Valdevez',cp:'4970',mes:'2026-10',descricao:'12 painéis',ok:true}];V.tab='site'");
 const html=run('vSite()');assert.match(html,/Fotos para o site/);assert.match(html,/Nova obra para o site/);assert.match(html,/UPAC em Arcos de Valdevez/);
 run("V.pfs='sabc123'");assert.match(run('vSite()'),/Eliminar esta obra do site/);
 const pub=JSON.parse(run('JSON.stringify(pfPublic())')).filter(w=>w.solo);
 assert.deepEqual(pub.map(w=>[w.id,w.grupo,w.ok,w.descricao]),[['sabc123-0','sabc123',true,'12 painéis']]);
 assert.ok(!JSON.parse(run('JSON.stringify(S)')).sabc123,'not stored in the app data');
});

test('lead questionnaire: link buttons on the lead, and answers fill empty fields without overwriting',()=>{
 const {run}=app({...state,leads:[{id:'L1',name:'Maria Silva',contact:'912345678',email:'m@x.pt',stage:'nova',solutions:['VMC'],address:'',timing:'Já escrito',calls:[]}]});
 run("V.tab='leads';leadOpen('L1')");const html=run('leadEditor()');
 assert.match(html,/Pedir detalhes ao cliente/);assert.match(html,/Enviar por WhatsApp/);assert.match(html,/Enviar por email/);
 assert.match(run("pedText(S.leads[0],'https://x/pedido/abc')"),/Olá Maria, sou João Lima, da Enat[\s\S]*2 minutos[\s\S]*https:\/\/x\/pedido\/abc/);
 run("pedApply(S.leads[0],{sol:['Ar condicionado'],a:{ac_div:'2',ac_rooms:[{t:'Sala',m2:30},{t:'Quarto',m2:12}],casa:'Moradia',prazo:'Dentro de 1 mês'},gama:'media',morada:'Rua 1',cp:'4990-062',local:'Ponte de Lima',notas:'',fotos:[],at:1})");
 const l=JSON.parse(run('JSON.stringify(S.leads[0])'));
 assert.equal(l.address,'Rua 1, 4990-062 Ponte de Lima');assert.deepEqual(l.solutions,['VMC','Ar condicionado']);assert.equal(l.house,'Moradia');
 assert.equal(l.timing,'Já escrito','does not overwrite what was typed');assert.equal(l.area,'Sala 30 m², Quarto 12 m²');assert.equal(l.stage,'triagem');
 run("leadOpen('L1')");const after=run('leadEditor()');assert.match(after,/Respondeu a/);assert.match(after,/Gama preferida/);assert.match(after,/Equilíbrio/);
});

test('lead shows the suggested equipment calculated from the client answers',()=>{
 const {run}=app({...state,leads:[{id:'L2',name:'Rui',stage:'triagem',solutions:['Ar condicionado'],calls:[],pedido:{resp:{sol:['Ar condicionado'],a:{},gama:'',morada:'',cp:'',local:'',notas:'',fotos:[],at:1},sug:[{titulo:'Ar condicionado',linhas:['Sala (30 m²): 3,5 kW · 12 000 BTU'],nota:'Carga por divisão'}]}}]});
 run("V.tab='leads';leadOpen('L2')");const html=run('leadEditor()');
 assert.match(html,/Equipamentos sugeridos/);assert.match(html,/12 000 BTU/);assert.match(html,/primeira estimativa/);
});

test('a quote made from a lead with answers fills the AI box with the answers and the calculated sizes, and keeps the tier',()=>{
 const {run}=app({...state,leads:[{id:'L3',name:'Rita',contact:'912',stage:'triagem',solutions:['Ar condicionado'],calls:[],pedido:{resp:{sol:['Ar condicionado'],a:{ac_div:'2',ac_rooms:[{t:'Sala',m2:30},{t:'Quarto',m2:12}],ano:'Depois de 2015'},gama:'qualidade',morada:'Rua 1',cp:'4990-062',local:'Ponte de Lima',notas:'',fotos:[],at:1},sug:[{titulo:'Ar condicionado',linhas:['Sala (30 m²): 3,5 kW · 12 000 BTU']}]}}]});
 run("V.tab='leads';leadOpen('L3');leadQuote()");
 assert.equal(run('quoteDraft.gama'),'qualidade');
 const t=run('quoteAiLeadText(quoteDraft)');
 assert.match(t,/Que divisões e com que área\?: Sala 30 m², Quarto 12 m²/);assert.match(t,/EQUIPAMENTOS CALCULADOS[\s\S]*12 000 BTU/);assert.match(t,/Ano aproximado da casa: Depois de 2015/);
 assert.match(run('aiSection()'),/<option value="qualidade" selected>Máxima qualidade/);
});

test('leads that answered the questionnaire get their own section until opened',()=>{
 const {run}=app({...state,leads:[{id:'L5',name:'Sofia',stage:'triagem',solutions:[],calls:[],pedido:{resp:{sol:['VMC'],a:{},local:'Arcozelo',fotos:['abcdefgh1'],at:Date.now()}}},{id:'L6',name:'Tiago',stage:'nova',solutions:[],calls:[]}]});
 run("V.tab='leads'");
 const html=run('vLeads()');assert.match(html,/Novidades dos clientes \(1\)/);assert.match(html,/Sofia[\s\S]*VMC · Arcozelo[\s\S]*1 foto/);
 assert.match(run('vHome()'),/Novidades dos clientes/);
 run("leadOpen('L5');leadDraft=null");
 assert.doesNotMatch(run('vLeads()'),/Novidades dos clientes/,'gone once opened');
});

test('installed equipment per job: serial number, warranty, brand app, remote access consent, and search by serial number',()=>{
 const st=JSON.parse(JSON.stringify(state));st.obras=[{id:'o9',name:'Casa Silva',client:'Ana Silva',status:'concluida',valor:2000,equip:[],eqs:[{id:'e1',tipo:'Bomba de calor AQS',marca:'Energie',modelo:'Aquapura 200',sn:'ENG123XY',check:'',instalado:'2026-11-01',garantiaAte:'2029-11-01',app:'Smart Life',conta:'ana@x.pt',remoto:true,notas:''}]}];
 const {run}=app(st);
 const html=run("V.tab='obras';V.obra='o9';V.seg='equip';vObra()");
 assert.match(html,/Equipamentos \(1\)/);assert.match(html,/Bomba de calor AQS · Energie Aquapura 200/);assert.match(html,/SN ENG123XY/);assert.match(html,/Garantia até/);assert.match(html,/Acesso remoto/);
 assert.match(html,/abra a app <b>Smart Life<\/b>/);
 const r=run("EnatGestao.search(S,[],'eng123xy')");assert.equal(r.obras.length,1,'found by serial number');
});
test('material per job: list from the accepted quote grouped by supplier, order message, and what has arrived',()=>{
 const {run}=app(state);
 run(`S.obras[0].material=matFromQuote({lines:[
  {kind:'Equipamento',description:'Bomba de calor 200 L',quantity:1,unit:'un.',value:900,catalog:{brand:'Energie',ref:'AQ200'}},
  {kind:'Material',description:'Tubo multicamada 20x2',quantity:8,unit:'m',value:2,catalog:{brand:'Sanitop',ref:'MC20'}},
  {kind:'Material',description:'Válvula misturadora',quantity:1,unit:'un.',value:40,catalog:{brand:'S. Energias',src:'Sanitop'}},
  {kind:'Mão de obra',description:'Montagem',quantity:1,value:300}]})`);
 assert.equal(run('S.obras[0].material.length'),3,'labour is not material');
 run("V.obra='o1';V.seg='material'");let h=run('vObra()');
 assert.match(h,/Material \(0\/3\)/);assert.match(h,/<b>Sanitop<\/b><span>0 de 2 chegaram/);assert.match(h,/<b>Energie<\/b>/);
 assert.match(h,/wa\.me\/\?text=[^"]*Tubo%20multicamada%2020x2%20\(ref\.%20MC20\)/);assert.match(h,/Marcar 2 como encomendados/);
 run("S.obras[0].material[1].estado='chegou'");h=run('vObra()');assert.match(h,/1 de 2 chegaram/);assert.match(h,/Material \(1\/3\)/);
 run("V.obra=null;V.tab='enc'");const g=run('vMaterial()');assert.match(g,/2 por encomendar/);assert.match(g,/Moradia T3/);assert.doesNotMatch(g,/Tubo multicamada/,'arrived items hidden by default');
 assert.match(run('vHome()'),/data-id="enc"/);
 // A marca já usada com um fornecedor é lembrada para a próxima lista.
 run("S.obras[0].material[0].forn='Climafrio'");assert.equal(run("matFromQuote({lines:[{kind:'Equipamento',description:'Outra',catalog:{brand:'Energie'}}]})[0].forn"),'Climafrio');
});
test('home dashboard: business numbers that open their page, 12-month chart and leads by stage; the logo goes to Início',()=>{
 const {run}=app(state);
 const h=run('vHome()');
 for(const l of ['Recebido este mês','Resultado do mês','Recebido este ano','Por receber','Obras em curso','Leads novas','Orçamentos à espera','Taxa de aceitação'])assert.ok(h.includes(l),l);
 assert.match(h,/class="dash-k[^"]*" data-a="tab" data-id="rel"/);assert.match(h,/Últimos 12 meses/);
 assert.match(html,/<button class="logo-btn" data-a="tab" data-id="home" aria-label="Ir para o Início"><img src="\/enat-logo.png"/);
 assert.match(html,/<nav><button class="logo-btn nav-logo" data-a="tab" data-id="home"/);
});
test('Equipamentos tab: every installed unit from every job, warranty status, search by serial number and filters',()=>{
 const {run}=app(state);
 run(`S.obras[0].eqs=[{id:'e1',tipo:'Inversor',marca:'AlphaESS',modelo:'SMILE5',sn:'AL123',garantiaAte:'2020-01-01',remoto:true,app:'AlphaCloud'},{id:'e2',tipo:'Bomba de calor AQS',marca:'Energie',sn:'EN9',garantiaAte:'2099-01-01'}];S.obras[1].eqs=[{id:'e3',tipo:'VMC',marca:'Ekallor',garantiaAte:''}]`);
 run("V.tab='equip'");let h=run('vEquipamentos()');
 assert.match(h,/<h1>Equipamentos<\/h1>/);assert.match(h,/Inversor · AlphaESS SMILE5/);assert.match(h,/Fora de garantia/);assert.match(h,/Em garantia/);
 assert.match(h,/data-a="open" data-s="equip" data-id="o1" data-eqopen="e1"/);
 run("V.eqq='en9'");h=run('vEquipamentos()');assert.match(h,/Energie/);assert.doesNotMatch(h,/AlphaESS SMILE5/);
 run("V.eqq='';V.eqf='remoto'");h=run('vEquipamentos()');assert.match(h,/AlphaESS/);assert.doesNotMatch(h,/Ekallor/);
 assert.match(html,/\['equip','<span class="nl-l">Equipamentos<\/span>/);
});
test('AlphaESS panel: energy of the day with chart, and charge/discharge schedule forms after the system is linked',()=>{
 const {run}=app(state);
 run(`S.obras[0].eqs=[{id:'a1',tipo:'Inversor',marca:'AlphaESS',sn:'AL1',app:'AlphaCloud',remoto:true,alphaOk:true}]`);
 run(`EQ_LIVE.a1={dia:{dia:'2026-11-24',energia:{epv:21.4,eInput:3.1},potencia:[{uploadTime:'2026-11-24 12:00:00',ppv:3000,load:900,cbat:70}]},cfg:{carga:{gridCharge:1,timeChaf1:'02:00',timeChae1:'05:30',timeChaf2:'00:00',timeChae2:'00:00',batHighCap:90},descarga:{ctrDis:0,timeDisf1:'00:00',timeDise1:'00:00',timeDisf2:'00:00',timeDise2:'00:00',batUseCap:10}}}`);
 const h=run('eqRemoto(S.obras[0].eqs[0],0)');
 assert.match(h,/Produção solar/);assert.match(h,/21,4 kWh/);assert.match(h,/<polyline points=/);
 assert.match(h,/data-acfg="timeChaf1" data-t="carga" data-i="0" value="02:00"/);assert.match(h,/data-acfg="gridCharge" data-t="carga" data-i="0" checked/);
 assert.match(h,/data-acfg="batUseCap" data-t="descarga" data-i="0" value="10"/);assert.match(h,/uma vez a cada 24 horas/);
});
test('leads search finds a lead in any tab or stage and says where it is', () => {
 const {run} = app({...state, leads: [
  {id: 'la', name: 'Ana Sousa', contact: '912111222', stage: 'contacto', call: 'nao', date: '2026-11-20'},
  {id: 'lb', name: 'Bruno Costa', contact: '933444555', stage: 'nova', src: 'meta', date: '2026-11-21'},
  {id: 'lc', name: 'Carla Dias', contact: '966777888', stage: 'enviada', date: '2026-11-22'}]});
 run("V.tab='leads';V.lt='novas';V.lq='912111'");
 const novas = run('leadsList()');
 assert.match(novas, /Ana Sousa/, 'a «Não atendeu» lead is found from the «Novas» tab');
 assert.match(novas, /Está em: <b>Não atendeu<\/b>/);
 run("V.lt='';V.ls='ganho';V.lq='carla'");
 const main = run('leadsList()');
 assert.match(main, /Carla Dias/, 'the stage filter does not hide search results');
 assert.match(main, /Leads · Proposta enviada/);
 run("V.lt='no';V.lq='bruno'");
 assert.match(run('leadsNoHtml()'), /Bruno Costa[\s\S]*Está em: <b>Novas<\/b>/);
 run("V.lq=''");assert.doesNotMatch(run('leadsNoHtml()'), /Resultados em todas/);
});
test('lead page: emails exchanged with the client and the WhatsApps opened from the app', async () => {
 const fetch = async (u) => String(u).includes('/api/email/conversa?email=ana%40exemplo.pt')
  ? new Response(JSON.stringify({configurado: true, emails: [{id: 'enviado-7', tipo: 'enviado', data: '2026-11-24T10:00:00Z', assunto: 'Proposta ORC 2026/0090', texto: 'Segue a proposta.', anexos: ['Orcamento.pdf']}, {id: 'recebido-3', tipo: 'recebido', data: '2026-11-25T09:00:00Z', assunto: 'Re: Proposta', texto: 'Obrigada, vou ver.', anexos: []}]}))
  : Promise.reject(new Error('offline'));
 const {run} = app({...state, leads: [{id: 'la', name: 'Ana', email: 'ana@exemplo.pt', contact: '+351 912 111 222', stage: 'enviada', solutions: []}]}, {fetch});
 run("V.tab='leads';leadDraft=structuredClone(S.leads[0])");
 assert.match(run('leadEmailsHtml(leadDraft)'), /A procurar emails/);
 await new Promise((r) => setTimeout(r, 20));
 const h = run('leadEmailsHtml(leadDraft)');
 assert.match(h, /Emails \(2\)/); assert.match(h, /Proposta ORC 2026\/0090/); assert.match(h, /Enviado ·/); assert.match(h, /Recebido ·/); assert.match(h, /📎 1/);
 run("LE_OPEN.add('recebido-3')"); assert.match(run('leadEmailsHtml(leadDraft)'), /Obrigada, vou ver\./);
 assert.match(run('leadWaHtml(leadDraft)'), /Ainda não abriu o WhatsApp/);
 run("leadWaMark('351912111222','Proposta')");
 assert.equal(run('S.leads[0].wa.length'), 1);
 assert.match(run('leadWaHtml(leadDraft)'), /WhatsApp \(1\)[\s\S]*Proposta[\s\S]*Aberto para envio/);
 run("leadWaMark('966000000','Outra')"); assert.equal(run('S.leads[0].wa.length'), 1, 'other numbers do not count');
 run("leadDraft={...leadDraft,email:''}"); assert.match(run('leadEmailsHtml(leadDraft)'), /Preencha o email do cliente/);
});
test('quotes page: search finds quotes by client, number or equipment', () => {
 const {run} = app(state);
 run(`quoteRows=[{id:54,document:{client:'Filipa Fernandes',contact:'912000111',email:'filipa@x.pt',date:'2026-11-09',topics:['Ar condicionado'],brand:'Daikin',lines:[{description:'Daikin Perfera 3,5 kW',quantity:1,value:900}],vat:23,margin:20},events:[]},{id:60,document:{client:'Rui Costa',contact:'933',date:'2026-11-12',topics:['Bomba de calor AQS'],lines:[{description:'Bomba de calor 200 L',quantity:1,value:1500}],vat:23,margin:20},events:[]}]`);
 run("V.tab='orc';V.qq=''");assert.match(run('vQuotes()'), /id="qq"/);assert.match(run('vQuotes()'), /<h2>Clientes<\/h2>/);
 run("V.qq='perfera'");const a=run('vQuotes()');assert.match(a,/Resultados \(1\)/);assert.match(a,/Filipa Fernandes/);assert.doesNotMatch(a,/Rui Costa/);
 run("V.qq='0060'");assert.match(run('vQuotes()'),/Rui Costa/);
 run("V.qq='nada disto'");assert.match(run('vQuotes()'),/Nenhum orçamento encontrado/);
});
test('heat pump sizing: losses, radiators at the flow temperature, DHW tank and the package from the price tables', () => {
 const {run} = app(state);
 const c = JSON.parse(run(`JSON.stringify(bcCalc({...newBc(),text:0,expo:'1',area:100,pisos:1,pe:2.5,paredes:100,janelas:20,uParede:'1',uTelhado:'1',uJanela:'2',estore:'1',pav:'0.5',rph:'0.5',tida:55,aqs:true,pessoas:3,rads:[{tipo:'al600',qtd:10,elem:10}]}))`));
 assert.equal(Math.round(c.qTrans), 5400); assert.equal(Math.round(c.qVent), 850);
 assert.equal(Math.round(c.pAquec * 1000), 6875); assert.equal(Math.round(c.pNec * 1000), 7625);
 assert.equal(Math.round(c.pRadReal * 100), 714); assert.equal(c.aqsLitros, 150);
 assert.equal(run('bcAqsLitros(1)'), 150); assert.equal(run('bcAqsLitros(4)'), 200); assert.equal(run('bcAqsLitros(6)'), 300); assert.equal(run('bcAqsLitros(8)'), 400);
 // Mono client never gets a three-phase machine; at 65 °C only high-temperature machines; capacity × 0,85 above 45 °C.
 const k = JSON.parse(run(`(()=>{const b={...newBc(),area:150,pisos:2,tida:65,fase:'1',aqs:true,pessoas:4};const c=bcCalc(b),k=bcPick(c,bcCatalog(PRICE_TABLES),b);return JSON.stringify({p:c.pNec,n:k.bomba.nome,kw:k.bomba.kw,cap:k.bomba.cap,t:k.bomba.tmax,f:k.bomba.fase,aqs:k.aqs&&k.aqs.litros,all:k.allInOne,in:k.inercia&&k.inercia.litros,inMin:k.inMin,ops:k.opcoes.map(o=>o.fase+'/'+o.tmax)})})()`));
 assert.ok(k.cap >= k.p && Math.abs(k.cap - k.kw * 0.85) < 0.01); assert.equal(k.f, 1); assert.ok(k.t >= 65);
 assert.ok(k.ops.every((o) => o.startsWith('1/') && Number(o.split('/')[1]) >= 65));
 assert.ok(k.all || k.aqs >= 200, 'DHW tank of at least 200 L for 4 people'); assert.ok(k.in >= k.inMin);
 // Screen inside the quote: shown with the topic, adds the package as quote lines.
 run("V.tab='orc';quoteDraft=newQuote();quoteDraft.topics=['Bomba de calor climatização']");
 assert.match(run('quoteEditor()'), /Dimensionar bomba de calor/);
 run("quoteDraft.bc={...newBc(),aqs:true,pessoas:4}");
 const h = run('quoteEditor()'); assert.match(h, /Potência necessária/); assert.match(h, /Acumulador mínimo/); assert.match(h, /Adicionar conjunto completo ao orçamento/);
});
test('heat pump sizing: supplier catalogues count (power/litres in the model) and the installation kit comes from the material suppliers', () => {
 const {run} = app(state);
 run("globalThis.priceDisc=globalThis.priceDisc||((t,p)=>p&&p.disc!=null?Number(p.disc):Number(t.discount||0));globalThis.priceNet=globalThis.priceNet||((t,p)=>p&&p.net!=null?Number(p.net):Math.round(Number(p.price)*(1-Number(t.discount||0)/100)*100)/100)");
 run(`PRICE_TABLES.push({brand:'Sanipower',supplier:'sanipower',live:true,discount:0,products:[
  {group:['Bomba de calor climatização','Bombas de Calor'],maker:'Proteu',name:'Proteu Bomba Calor Queen Monobloco Monofásica R32',model:'AR101PA 10kW',price:3000,net:1500},
  {group:['Bomba de calor climatização','Bombas de Calor','Acumuladores'],maker:'Proteu',name:'Proteu Acumulador Báltico Inox Ligações Laterais',model:'1 Serpentina 200L',price:900,net:450},
  {group:['Aquecimento','Vasos'],maker:'Zilmet',name:'Vaso expansão aquecimento 18 L',price:60,net:30},
  {group:['Aquecimento','Segurança'],maker:'Caleffi',name:'Válvula segurança aquecimento 1/2 3 bar',price:20,net:10},
  {group:['Tubo','Multicamada'],maker:'X',name:'Tubo multicamada 32x3 rolo 50 m',price:250,net:125}]})`);
 const k = JSON.parse(run(`(()=>{const b={...newBc(),area:110,pisos:2,tida:45,fase:'1',aqs:true,pessoas:3};const cat=bcCatalog(quoteTables()),c=bcCalc(b),k=bcPick(c,cat,b);return JSON.stringify({bombas:cat.bombas.filter(x=>x.t.live).map(x=>x.kw),aqs:cat.aqs.filter(x=>x.t.live).map(x=>x.litros)})})()`));
 assert.deepEqual(k.bombas, [10]); assert.deepEqual(k.aqs, [200]);
 run("V.tab='orc';quoteDraft=newQuote();quoteDraft.topics=['Bomba de calor climatização'];quoteDraft.bc={...newBc(),area:110,pisos:2,tida:45,aqs:true,pessoas:3}");
 const lines = JSON.parse(run(`(()=>{const bc=quoteDraft.bc,c=bcCalc(bc),k=bcPick(c,bcCatalog(quoteTables()),bc);return JSON.stringify(aiResolve(bcKitItens(k,bc)).lines.map(l=>[l.description,l.value,l.quantity,l.kind,!!l.semPreco]))})()`));
 const vaso = lines.find((l) => /vaso/i.test(l[0]) && !/sanit/i.test(l[0])); assert.ok(vaso && vaso[1] > 0 && /Zilmet|18 L/.test(vaso[0]), 'expansion vessel priced from Sanipower: ' + JSON.stringify(vaso));
 const tubo = lines.find((l) => /multicamada 32/i.test(l[0])); assert.ok(tubo && tubo[1] > 0 && tubo[2] >= 12, 'pipe priced per metre');
 assert.ok(lines.some((l) => l[3] === 'Mão de obra'), 'labour line at the end');
});
test('lead page: send all the lead quotes at once, optionally with just the client page link', () => {
 const {run} = app({...state, leads: [{id: 'la', name: 'Ana', email: 'ana@x.pt', contact: '912111222', stage: 'enviada', solutions: []}]});
 run(`quoteRows=[1,2,3].map(i=>({id:90+i,document:{client:'Ana',contact:'912111222',lead:'la',date:'2026-11-2'+i,topics:['Ar condicionado'],lines:[{description:'AC',quantity:1,value:500}],vat:23,margin:20,validity:30},events:[]}))`);
 run("V.tab='leads';leadDraft=structuredClone(S.leads[0])");
 const h = run('leadQuotesHtml(leadDraft)');
 assert.match(h, /Enviar ao cliente/); assert.equal((h.match(/data-qw="pick" value="\d+" checked/g) || []).length, 3, 'all three ticked');
 assert.match(h, /Enviar só o link da página do cliente/); assert.match(h, /Preparar 3 orçamentos para WhatsApp/); assert.match(h, /Enviar 3 orçamentos por email/);
 const t = run(`quoteWaText(quoteRows.map(r=>({...r.document,id:r.id})),['https://p/1','https://p/2','https://p/3'],'https://p/pedido/abc')`);
 assert.match(t, /https:\/\/p\/pedido\/abc/); assert.doesNotMatch(t, /https:\/\/p\/1/); assert.match(t, /ORC 2026\/0091[\s\S]*ORC 2026\/0093/);
});
