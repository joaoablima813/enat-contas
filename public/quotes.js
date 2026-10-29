let quoteRows=null,quoteError='',quoteLoading=false,quoteDraft=null,quoteBusy=false,quoteClient=null;
// Numbered per year, e.g. ORC 2026/0042, using the year of the quote date.
const quoteNumber=(id,date)=>'ORC '+(String(date||'').slice(0,4)||new Date().getFullYear())+'/'+String(id).padStart(4,'0');
const quoteTitle=q=>'Orçamento para '+[q.topics.join(' + '),String(q.brand||'').trim()].filter(Boolean).join(' ');
// Quotes with the same client name and contact share one client folder.
const quoteNorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const quoteClientKey=q=>{const d=String(q.contact||'').replace(/\D/g,'').replace(/^(00)?351(?=\d{9}$)/,'');return quoteNorm(q.client)+'|'+(d||quoteNorm(q.contact))};
function quoteClients(){
 const groups=new Map();
 for(const r of [...(quoteRows||[])].sort((a,b)=>b.id-a.id)){const k=quoteClientKey(r.document);if(!groups.has(k))groups.set(k,{key:k,latest:r.document,rows:[]});groups.get(k).rows.push(r)}
 return [...groups.values()];
}
// WhatsApp delivery: Portuguese 9-digit numbers get the 351 prefix, others must include the country code.
let quoteWa={key:null,to:'',auto:true,email:'',autoEmail:true,ids:[],detailed:false,msg:'',ready:null,mail:null};
const quoteWaNumber=c=>{const m=String(c||'').replace(/[\s().-]/g,'').match(/(\+|00)?\d{9,15}/);if(!m)return '';const d=m[0].replace(/^\+|^00/,'');return /^[29]\d{8}$/.test(d)?'351'+d:d};
// The message sent from the user's own WhatsApp; links point to each quote PDF.
const quoteWaText=(docs,links=[])=>{
 const one=docs.length===1,q=docs[0],item=(d,i)=>`*${quoteNumber(d.id,d.date)}* · ${quoteTitle(d).replace('Orçamento para ','')} · ${eur(quoteTotals(d).total)} (IVA incluído)`+(links[i]?'\n'+links[i]:'');
 return `Olá ${String(q.client).trim()},\n\nAgradecemos o seu contacto e a confiança depositada na Enat - Energias.\n\n`+(one?`Segue o orçamento ${quoteNumber(q.id,q.date)}, referente a ${quoteTitle(q).replace('Orçamento para ','')}, no valor total de *${eur(quoteTotals(q).total)}* (IVA incluído)`+(links[0]?':\n'+links[0]:'.'):'Seguem os orçamentos solicitados:\n\n'+docs.map(item).join('\n\n'))+`\n\n${one?'A proposta é válida':'As propostas são válidas'} por 15 dias. Para adjudicar ou esclarecer qualquer dúvida, basta responder a esta mensagem.\n\nCom os melhores cumprimentos,\nJoão Lima\nEnat - Energias`;
};
const quoteWaLabel=n=>n>1?'Preparar '+n+' orçamentos para WhatsApp':'Preparar orçamento para WhatsApp';
const quoteMailLabel=n=>n>1?'Enviar '+n+' orçamentos por email':'Enviar orçamento por email';
const quoteMailOk=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e||'').trim());
const quoteMailSubject=docs=>(docs.length>1?'Orçamentos ':'Orçamento ')+docs.map(q=>quoteNumber(q.id,q.date)).join(', ')+' · Enat - Energias';
// Without the mailbox password on the server, the email opens ready in the user's mail app instead.
const quoteMailto=(to,docs,text)=>'mailto:'+encodeURIComponent(String(to).trim())+'?subject='+encodeURIComponent(quoteMailSubject(docs))+'&body='+encodeURIComponent(text.replace(/\*([^*\n]+)\*/g,'$1'));
function quoteWaPanel(key,contact,rows,email=''){
 if(quoteWa.key!==key)quoteWa={...quoteWa,key,to:quoteWaNumber(contact),auto:true,email:String(email||''),autoEmail:true,ids:rows.slice(0,1).map(r=>r.id),detailed:false,msg:'',ready:null};
 const pick=rows.length>1,chosen=pick?rows.filter(r=>quoteWa.ids.includes(r.id)):rows,ready=quoteWa.ready,share=ready?.files&&navigator.canShare?.({files:ready.files});
 const preview=chosen.length&&chosen[0].id&&String(chosen[0].document.client||'').trim()?quoteWaText(chosen.map(r=>({...r.document,id:r.id}))):'';
 return `<h2>Enviar ao cliente</h2><div class="q-card q-wa"><p class="note">WhatsApp: sai do seu WhatsApp Business, sem custos. A app prepara o PDF e a mensagem; depois basta tocar em enviar na conversa do cliente. Email: ${quoteWa.mail?.configured?'enviado automaticamente de '+esc(quoteWa.mail.from)+', com o PDF em anexo.':'abre na sua app de email, já escrito, para enviar a partir de pontedelima@enat.pt.'}</p>${pick?`<p class="note">Escolha os orçamentos deste cliente a enviar.</p><div class="q-wa-list">${rows.map(r=>`<label class="q-wa-pick"><input type="checkbox" data-qw="pick" value="${r.id}" ${quoteWa.ids.includes(r.id)?'checked':''}><span><b>${quoteNumber(r.id,r.document.date)}</b><small>${esc(quoteTitle(r.document).replace('Orçamento para ',''))} · ${eur(quoteTotals(r.document).total)}</small></span></label>`).join('')}</div>`:''}<label class="q-field"><span>Número WhatsApp do cliente</span><input type="tel" data-qw="to" value="${esc(quoteWa.to)}" placeholder="351912345678" inputmode="tel" autocomplete="off" maxlength="20"></label><label class="q-field"><span>Email do cliente</span><input type="email" data-qw="email" value="${esc(quoteWa.email)}" placeholder="cliente@exemplo.pt" autocomplete="off" maxlength="320"></label><fieldset class="q-wa-kind"><legend>Versão do PDF</legend><label><input type="radio" name="qw-kind" data-qw="kind" value="summary" ${quoteWa.detailed?'':'checked'}><span>Só com totais</span></label><label><input type="radio" name="qw-kind" data-qw="kind" value="detailed" ${quoteWa.detailed?'checked':''}><span>Detalhado</span></label></fieldset>${preview&&!ready?`<details class="q-wa-preview"><summary>Ver a mensagem que o cliente recebe</summary><p>${esc(preview).replace(/\n/g,'<br>')}</p></details>`:''}${ready?`<div class="q-wa-preview"><p>${esc(ready.text).replace(/\n/g,'<br>')}</p></div><a class="btn q-wa-open" href="${esc(ready.href)}" target="_blank" rel="noopener">Abrir conversa no WhatsApp</a>${ready.mailto?`<a class="btn alt q-mail-open" href="${esc(ready.mailto)}">Abrir email para ${esc(quoteWa.email.trim())}</a>`:`<button type="button" class="btn alt" id="quote-mail-send" data-qa="mail-send" ${quoteBusy||!chosen.length?'disabled':''}>${quoteBusy&&quoteWa.msg.startsWith('A enviar email')?'A enviar email…':quoteMailLabel(chosen.length)}</button>`}${share?'<button type="button" class="btn alt" data-qa="wa-share">Partilhar o PDF como anexo</button>':''}<button type="button" class="link" data-qa="wa-reset">Alterar escolha</button>`:`<button type="button" class="btn" id="quote-wa-send" data-qa="wa-send" ${quoteBusy||!chosen.length?'disabled':''}>${quoteBusy&&quoteWa.msg.startsWith('A preparar')?'A preparar…':quoteWaLabel(chosen.length)}</button><button type="button" class="btn alt" id="quote-mail-send" data-qa="mail-send" ${quoteBusy||!chosen.length?'disabled':''}>${quoteBusy&&quoteWa.msg.startsWith('A enviar email')?'A enviar email…':quoteMailLabel(chosen.length)}</button>`}<p id="quote-wa-msg" role="status" class="note">${esc(quoteWa.msg)}</p></div>`;
}
// The most recent email saved for the client, since older quotes may not have one.
const quoteClientEmail=g=>(g.rows.find(r=>String(r.document.email||'').trim())?.document.email||'').trim();
const quoteCount=n=>n+(n===1?' orçamento':' orçamentos');
const quoteSavedRow=r=>`<div class="q-saved"><button class="row invoice-row" data-qa="edit" data-id="${r.id}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${quoteNumber(r.id,r.document.date)}</b><span>${fd(r.document.date)}</span><span>${esc(quoteTitle(r.document).replace('Orçamento para ',''))}</span></div><div class="rr"><b>${eur(quoteTotals(r.document).total)}</b><span>com IVA</span></div></button><button class="link neg q-list-delete" data-qa="delete-saved" data-id="${r.id}" aria-label="Eliminar orçamento ${quoteNumber(r.id,r.document.date)}">Eliminar</button></div>`;
function vQuotes(){
 if(quoteDraft)return quoteEditor();
 const errors=quoteError?`<p role="alert" class="neg">${esc(quoteError)}</p><button class="link" data-qa="reload">Tentar novamente</button>`:'';
 const clients=quoteRows===null?null:quoteClients(),folder=clients&&quoteClient&&clients.find(g=>g.key===quoteClient);
 if(folder){const c=folder.latest;return `<button class="back" data-qa="list">${ic('back')} Orçamentos</button><h1>${esc(c.client)}</h1><p class="sub">${[c.contact,quoteClientEmail(folder),c.address].filter(v=>String(v||'').trim()).map(esc).join(' · ')}</p><button class="btn" data-qa="new-client">Novo orçamento para este cliente</button><h2>${quoteCount(folder.rows.length)}</h2>${errors}<div class="grp">${folder.rows.map(quoteSavedRow).join('')}</div>${quoteWaPanel('folder:'+folder.key,c.contact,folder.rows,quoteClientEmail(folder))}`}
 return `<h1>Orçamentos</h1><p class="sub">Propostas ENAT · Equipamentos e instalação</p><button class="btn" data-qa="new">Novo orçamento</button><h2>Clientes</h2>${errors}${clients===null?'<div class="grp empty" aria-busy="true">A carregar orçamentos…</div>':clients.length?`<div class="grp">${clients.map(g=>`<button class="row invoice-row q-client" data-qa="client" data-key="${esc(g.key)}"><div class="av">${ic('obras')}</div><div class="rt"><b>${esc(g.latest.client)}</b><span>${esc(g.latest.contact)}</span><span>${quoteCount(g.rows.length)} · ${g.rows.map(r=>quoteNumber(r.id,r.document.date)).join(', ')}</span></div><div class="rr"><b>${eur(g.rows.reduce((s,r)=>s+quoteTotals(r.document).total,0))}</b><span>${g.rows.length>1?'soma':'com IVA'}</span></div></button>`).join('')}</div>`:'<div class="grp empty">Ainda não existem orçamentos. Crie a primeira proposta para o seu cliente.</div>'}`;
}
// Tells the user when a new quote will join an existing client folder.
function quoteMatchNote(){
 const q=quoteDraft;if(!q.client.trim()||!q.contact.trim())return '';
 const others=(quoteRows||[]).filter(r=>r.id!==q.id&&quoteClientKey(r.document)===quoteClientKey(q));
 return others.length?'Este cliente já tem '+quoteCount(others.length)+' ('+others.map(r=>quoteNumber(r.id,r.document.date)).join(', ')+'). Este orçamento fica na mesma pasta.':'';
}
async function loadQuotes(){
 if(quoteLoading)return;quoteLoading=true;quoteError='';
 try{const r=await API('orcamentos');if(!r.ok)throw Error('Não foi possível carregar os orçamentos.');quoteRows=await r.json()}
 catch(e){quoteError=e.message}finally{quoteLoading=false;if(V.tab==='orc'&&!quoteDraft)render()}
 if(!quoteWa.mail)API('email/estado').then(r=>r.ok?r.json():null).then(b=>{if(b){quoteWa.mail=b;if(V.tab==='orc'&&!quoteBusy&&!document.activeElement?.matches?.('input,textarea,select'))render()}}).catch(()=>{});
}
function newQuote(){return {client:'',address:'',contact:'',email:'',date:new Date().toISOString().slice(0,10),topics:[],brand:'',margin:20,vat:Number(S.vat??23),warranty:'3 anos',lines:[{kind:'Equipamento',description:'',quantity:1,unit:'un.',value:0}]}}
const quoteField=(label,key,type='text',extra='')=>`<label class="q-field"><span>${label}</span><input type="${type}" data-qf="${key}" value="${esc(quoteDraft[key])}" ${extra}></label>`;
function quoteSummary(){const t=quoteTotals(quoteDraft);return `<div class="q-break"><span>Valor de venda sem IVA (custo)</span><b>${eur(t.cost)}</b></div><div class="q-break"><span>IVA</span><b>${quoteDraft.vat}%</b></div><div class="q-break"><span>Total com IVA</span><b>${eur(t.costVat)}</b></div><div class="q-break"><span>Margem</span><b>${quoteDraft.margin}%</b></div><div class="q-total"><span>Valor final cliente</span><strong>${eur(t.total)}</strong></div><div class="q-break"><span>Lucro</span><b>${eur(t.profitVat)}</b></div><p class="note">Total com IVA = custo × (1 + IVA). Valor final cliente = total com IVA × (1 + margem). Lucro = valor final cliente − total com IVA.</p>`}
// Price tables: pick a brand, walk its product groups (e.g. Ar condicionado › Multisplit › Unidade exterior) and add the product at the discounted price.
let quotePick=null,quotePickLast=null,quotePickOff=null;
// Products read from invoices (photo or PDF) join the brand tables automatically as soon as an invoice is saved or edited as "Faturas (compras)", grouped by category and supplier, at the last net price paid.
let quoteInvCache=null;
function quoteInvoiceTable(){
 const inv=(typeof S!=='undefined'&&S.inv)||[],key=inv.map(v=>v.id+'@'+(v.store||'')+(v.date||'')+(v.number||'')+':'+(v.items||[]).map(i=>i.name+'='+i.unit_price+'/'+(i.unit||'')+'/'+(i.cat||'')).join(',')).join('|');
 if(quoteInvCache?.key===key)return quoteInvCache.t;
 const unit=u=>{u=quoteNorm(u||'').replace(/[.\s]/g,'');return /^(m|ml|mt|mts|metro|metros)$/.test(u)?'m':/^(m2|mq)$/.test(u)?'m²':/^(m3)$/.test(u)?'m³':/^(h|hora|horas)$/.test(u)?'h':'un.'};
 const kind=c=>c==='Equipamentos'?'Equipamento':c==='Acessórios e fixação'?'Acessórios':'Material';
 const list=typeof products==='function'?products():[];
 const t=list.length?{brand:'Faturas (compras)',table:'Último preço pago s/ IVA',discount:0,invoices:true,products:list.filter(p=>Number(p.last.i.unit_price)>0).map(p=>{const v=p.last.v,c=p.cat||'Outros / consumíveis';return {group:[c,v.store||'Fornecedor não indicado'],name:p.name,price:Number(p.last.i.unit_price),unit:unit(p.last.i.unit),kind:kind(c),src:[v.store,v.number?'Fat. '+v.number:'',v.date?String(v.date).split('-').reverse().join('/'):''].filter(Boolean).join(' · ')}})}:null;
 quoteInvCache={key,t:t&&t.products.length?t:null};return quoteInvCache.t;
}
const quoteTables=()=>{const t=globalThis.PRICE_TABLES||[],f=quoteInvoiceTable();return f?[...t,f]:t};
const quoteNetPrice=(t,p)=>Math.round(Number(p.price)*(1-Number(t.discount||0)/100)*100)/100;
// The supplier's name (S. Energias) never reaches the client, also in quotes saved before.
const quoteClientText=t=>String(t??'').replace(/^S\.? ?Energias\s+/i,'');
const quoteBlankLine=()=>({kind:'Equipamento',description:'',quantity:1,unit:'un.',value:0});
const quoteLineBlank=l=>!String(l.description||'').trim()&&!l.value&&!l.catalog;
// Keeps an empty line at the end so the next product can be typed straight away.
function quoteEnsureBlank(){const ls=quoteDraft.lines;if(ls.length<200&&(!ls.length||!quoteLineBlank(ls[ls.length-1])))ls.push(quoteBlankLine())}
function quoteCatalogLine(t,p){return {kind:p.kind||(p.group.some(g=>g.startsWith('Acessórios'))?'Acessórios':'Equipamento'),description:t.invoices?p.name:quoteClientText(t.brand+' '+(p.ref?p.ref+' – ':'')+p.name),quantity:1,unit:p.unit||'un.',value:quoteNetPrice(t,p),catalog:{brand:t.brand,ref:p.ref||'',price:Number(p.price),discount:Number(t.discount||0),...(p.src?{src:p.src}:{})}}}
// Adds a line, replacing the empty line a new quote starts with.
function quoteAddLine(l){const ls=quoteDraft.lines;if(ls.length===1&&!ls[0].description.trim()&&!ls[0].value)ls[0]=l;else if(ls.length<200)ls.push(l)}
// Opens a brand on the quote's typologies: one ticked typology goes straight in (LG › Ar condicionado), several are listed alone.
function quotePickFor(brand,line){
 const P={brand,path:[],q:'',line},t=quoteTables()[brand];
 if(t){const tops=new Set(t.products.map(p=>p.group[0])),only=quoteDraft.topics.filter(g=>tops.has(g));if(only.length===1)P.path=only;else if(only.length)P.only=only}
 return P;
}
// Starts on the brand written in the quote ("LG", "Mitsubishi"…), else on the brand list.
function quotePickStart(line){
 const tables=quoteTables(),b=quoteNorm(quoteDraft.brand);
 const ns=tables.map(t=>quoteNorm(t.brand));
 let i=b.length<2?-1:[n=>n===b,n=>n.startsWith(b),n=>b.startsWith(n.split(' ')[0])].reduce((i,f)=>i<0?ns.findIndex(f):i,-1);
 if(i<0&&tables.length===1)i=0;
 return i<0?{brand:null,path:[],q:'',line}:quotePickFor(i,line);
}
function quotePickResults(){
 const P=quotePick,t=quoteTables()[P.brand],words=quoteNorm(P.q).split(' ').filter(Boolean);
 const items=t.products.map((p,i)=>({p,i}));
 const row=({p,i})=>`<button type="button" class="q-pick-row" data-qa="pick-product" data-index="${i}"><span><b>${esc(p.name)}</b><small>${esc([p.ref,words.length?p.group.join(' › '):''].filter(Boolean).join(' · '))}</small><small>${t.invoices?esc(p.src):`Tabela ${eur(p.price)} · −${Number(t.discount||0)}%`}</small></span><em>${eur(quoteNetPrice(t,p))}<small>s/ IVA</small></em></button>`;
 if(words.length){const found=items.filter(({p})=>words.every(w=>quoteNorm([p.ref,p.name,...p.group].join(' ')).includes(w)));return found.length?found.slice(0,80).map(row).join(''):'<p class="note">Nenhum produto encontrado nesta tabela.</p>'}
 const inside=items.filter(({p})=>P.path.every((g,d)=>p.group[d]===g)),groups=new Map();
 const only=!P.path.length&&P.only;
 for(const {p} of inside)if(p.group.length>P.path.length&&!(only&&!only.includes(p.group[0]))){const g=p.group[P.path.length];groups.set(g,(groups.get(g)||0)+1)}
 const all=only&&inside.some(({p})=>!only.includes(p.group[0]))?'<button type="button" class="link" data-qa="pick-all">Ver todas as categorias desta marca</button>':'';
 return [...groups].map(([g,n])=>`<button type="button" class="q-pick-row q-pick-group" data-qa="pick-group" data-name="${esc(g)}"><span><b>${esc(g)}</b><small>${n} ${n===1?'produto':'produtos'}</small></span><em>›</em></button>`).join('')+inside.filter(({p})=>p.group.length===P.path.length).map(row).join('')+all||'<p class="note">Sem produtos neste grupo.</p>';
}
// Typed text searches every price table and the invoice products at once; the quote's brand and typologies come first.
const quoteHay=new WeakMap();
function quoteSuggest(q){
 const words=quoteNorm(q).split(' ').filter(Boolean),tables=quoteTables(),first=quotePickStart().brand,topics=quoteDraft?.topics||[],found=[];
 tables.forEach((t,b)=>t.products.forEach((p,i)=>{let h=quoteHay.get(p);if(h===undefined){h=quoteNorm([t.invoices?'fatura':t.brand,p.ref,p.name,...p.group].join(' '));quoteHay.set(p,h)}if(words.every(w=>h.includes(w)))found.push({t,b,p,i,rank:(b===first?2:0)+(topics.includes(p.group[0])?1:0)})}));
 if(!found.length)return '<p class="note">Nenhum produto encontrado nas tabelas de preços nem nas faturas. Pode continuar a escrever à mão.</p>';
 found.sort((x,y)=>y.rank-x.rank);
 const row=({t,b,p,i})=>`<button type="button" class="q-pick-row" data-qa="pick-product" data-brand="${b}" data-index="${i}"><span><b>${esc(p.name)}</b><small>${esc([t.brand,p.ref,p.group.join(' › ')].filter(Boolean).join(' · '))}</small><small>${t.invoices?esc(p.src):`Tabela ${eur(p.price)} · −${Number(t.discount||0)}%`}</small></span><em>${eur(quoteNetPrice(t,p))}<small>s/ IVA</small></em></button>`;
 return found.slice(0,60).map(row).join('')+(found.length>60?`<p class="note">A mostrar 60 de ${found.length} produtos. Escreva mais palavras para afinar.</p>`:'');
}
function quotePicker(){
 const P=quotePick,tables=quoteTables(),t=tables[P.brand];
 const head=title=>`<div class="q-pick-head"><b>${title}</b><button type="button" class="link" data-qa="pick-close">Fechar</button></div>`;
 const line=P.line!==undefined,blank=`<button type="button" class="btn alt" data-qa="pick-blank">${line?'Escrever à mão (sem tabela de preços)':'Linha livre (sem tabela de preços)'}</button>`;
 if(line&&quoteNorm(P.q))return `<div class="q-card q-pick" id="quote-pick">${head('Sugestões')}<div class="q-pick-list">${quoteSuggest(P.q)}</div><p class="note">Tabelas de preços: preço de tabela com o desconto da marca. Faturas: último preço pago. Valores sem IVA; o IVA e a margem são acrescentados nos totais.</p>${blank}</div>`;
 if(!t)return `<div class="q-card q-pick" id="quote-pick">${head('Escolha a marca')}<div class="q-pick-list">${tables.map((t,i)=>`<button type="button" class="q-pick-row" data-qa="pick-brand" data-index="${i}"><span><b>${esc(t.brand)}</b><small>${esc(t.table||'Tabela de preços')} · ${t.products.length} produtos</small></span><em>${t.invoices?'<small>último preço</small>':`−${Number(t.discount||0)}%<small>desconto</small>`}</em></button>`).join('')}</div>${blank}</div>`;
 const crumbs=[`<button type="button" class="link" data-qa="pick-brands">Marcas</button>`,`<button type="button" class="link" data-qa="pick-path" data-depth="0">${esc(t.brand)}</button>`,...P.path.map((g,d)=>`<button type="button" class="link" data-qa="pick-path" data-depth="${d+1}">${esc(g)}</button>`)].join(' › ');
 return `<div class="q-card q-pick" id="quote-pick">${head(esc(t.brand)+(t.invoices?' · último preço pago':' · −'+Number(t.discount||0)+'% na tabela'))}<p class="q-pick-path">${crumbs}</p>${line?'<p class="note">Escreva na descrição para procurar em todas as marcas e faturas, pela referência ou pelo nome.</p>':`<label class="q-field"><span>Procurar nesta marca</span><input type="search" data-qp="search" value="${esc(P.q)}" placeholder="Referência ou nome do equipamento" autocomplete="off"></label>`}<div class="q-pick-list" id="quote-pick-results">${quotePickResults()}</div><p class="note">${t.invoices?"O custo é o último preço pago na fatura, sem IVA e já com o desconto da fatura.":"O custo é o preço de tabela com o desconto da marca, sem IVA."} O IVA e a margem são acrescentados nos totais.</p>${blank}</div>`;
}
function quoteEditor(){const q=quoteDraft,folder=quoteClient&&quoteRows&&quoteClients().find(g=>g.key===quoteClient);return `<button class="back" data-qa="close">${ic('back')} ${folder?esc(folder.latest.client):'Orçamentos'}</button><h1>${q.id?'Orçamento '+quoteNumber(q.id,q.date):'Novo orçamento'}</h1><p class="sub" id="quote-title">${esc(q.topics.length?quoteTitle(q):'Prepare uma proposta à medida do seu cliente.')}</p><form id="quote-form"><fieldset class="q-fields" ${quoteBusy?'disabled':''}><h2>Cliente e local de instalação</h2><div class="q-card">${quoteField('Nome do cliente','client','text','required maxlength="2000" autocomplete="name"')}${quoteField('Morada','address','text','required maxlength="4000" autocomplete="street-address"')}${quoteField('Contacto do cliente','contact','text','required maxlength="2000" autocomplete="tel"')}${quoteField('Email do cliente (opcional)','email','email','maxlength="320" autocomplete="email" placeholder="cliente@exemplo.pt"')}${quoteField('Data do orçamento','date','date','required')}<p class="note q-match" id="quote-match" aria-live="polite">${esc(quoteMatchNote())}</p></div><h2>Tipologias</h2><p class="note">Selecione todas as opções aplicáveis.</p><div class="q-topics">${TOPICS.map(t=>`<label><input type="checkbox" data-qt="${esc(t)}" ${q.topics.includes(t)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div><div class="q-card">${quoteField('Marca do equipamento','brand','text','maxlength="200" placeholder="Ex.: LG" list="quote-brands" autocomplete="off"')}<datalist id="quote-brands">${quoteTables().map(t=>`<option value="${esc(t.brand)}">`).join('')}</datalist></div>${typeof pvSection==='function'?pvSection():''}<h2>Produtos e serviços</h2><p class="note">Uma linha por produto ou serviço. Ajuste a quantidade para incluir várias unidades do mesmo produto.</p><div id="quote-lines">${q.lines.map((l,i)=>`<section class="q-card q-line"><div class="q-line-head"><button type="button" class="link neg" data-qa="remove" data-index="${i}" ${q.lines.length===1?'disabled':''}>Remover</button></div><label class="q-field"><span>Categoria</span><select data-ql="${i}" data-field="kind">${['Equipamento','Material','Acessórios','Mão de obra','Outros'].map(k=>`<option ${k===(l.kind==='Equipamento / material'?'Equipamento':l.kind)?'selected':''}>${k}</option>`).join('')}</select></label><label class="q-field"><span>Descrição</span><textarea data-ql="${i}" data-field="description" maxlength="4000" placeholder="${quoteTables().length?(i?'Escreva o próximo produto ou toque para escolher':'Escreva o produto ou toque para escolher'):'Produto, material ou serviço'}" rows="1">${esc(l.description)}</textarea></label>${quotePick?.line===i?quotePicker():quoteTables().length?`<button type="button" class="link q-line-pick" data-qa="pick-line" data-index="${i}">Escolher da tabela de preços</button>`:''}<div class="q-line-numbers"><label class="q-field"><span>Quantidade</span><input type="number" data-ql="${i}" data-field="quantity" value="${l.quantity??1}" min="0.001" max="1000000" step="0.001" required inputmode="decimal"></label><label class="q-field"><span>Unidade</span><select data-ql="${i}" data-field="unit">${["un.","m","m²","m³","h","dia","serviço"].map(u=>`<option ${u===(l.unit||"un.")?"selected":""}>${u}</option>`).join("")}</select></label><label class="q-field"><span>Custo/un. s/ IVA (€)</span><input type="number" data-ql="${i}" data-field="value" value="${l.value}" min="0" max="100000000" step="0.01" required inputmode="decimal"></label></div><div class="q-break q-line-cost"><span>Subtotal de custo</span><b data-qcost="${i}">${eur(l.value*(l.quantity??1))}</b></div>${l.catalog?.src?`<p class="note q-line-src">Fatura: ${esc(l.catalog.src)} · ${eur(l.catalog.price)} s/ IVA</p>`:l.catalog?`<p class="note q-line-src">Tabela ${esc(l.catalog.brand)}${l.catalog.ref?' · Ref. '+esc(l.catalog.ref):''} · ${eur(l.catalog.price)} − ${l.catalog.discount}%</p>`:''}</section>`).join('')}</div><button type="button" class="btn alt" data-qa="add" ${q.lines.length>=200?'disabled':''}>Adicionar produto ou serviço</button><h2>Margem e totais</h2><div class="q-card">${quoteField('Margem de lucro (%)','margin','number','min="0" max="99.99" step="0.01" required inputmode="decimal"')}${quoteField('IVA (%)','vat','number','min="0" max="100" step="0.01" required inputmode="decimal"')}<p class="note">A margem é aplicada sobre o total com IVA. Ex.: custo de 3 548,38 €, IVA 23% e margem 20% = 4 364,51 € com IVA, 5 237,41 € ao cliente e 872,90 € de lucro.</p></div><div class="q-card" id="quote-summary" aria-live="polite">${quoteSummary()}</div><h2>Condições da proposta</h2><div class="q-card"><p class="q-terms">Proposta válida por 15 dias<br>Garantia dos equipamentos: 3 anos<br>Garantia de instalação: 2 anos<br>Prazo de instalação: A combinar<br>Condições de pagamento: 50% na adjudicação</p><p class="q-terms">Responsável comercial<br><b>João Lima</b></p><p class="q-terms">Obra a cargo de<br><b>Enat - Energias</b></p></div></fieldset><p id="quote-message" role="status" class="note">${esc(quoteError)}</p><button class="btn" type="submit" ${quoteBusy?'disabled':''}>${quoteBusy?'A guardar…':'Guardar orçamento'}</button><h2>PDF para o cliente</h2><p class="note">Escolha se o cliente vê o preço de cada equipamento e serviço ou apenas os totais.</p><button type="button" class="btn alt" data-qa="pdf" data-pdf="summary" ${quoteBusy?'disabled':''}>PDF só com totais (sem preços por linha)</button><button type="button" class="btn alt" data-qa="pdf" data-pdf="detailed" ${quoteBusy?'disabled':''}>PDF detalhado (com preços por linha)</button>${quoteWaPanel('editor',q.contact,[{id:q.id,document:q}],q.email)}${q.id?`<button type="button" class="btn alt neg q-delete" data-qa="delete" ${quoteBusy?'disabled':''}>Eliminar orçamento</button>`:''}</form>`}
function quoteReadInput(t,typing){
 if(t.dataset.qw){
  if(t.dataset.qw==='to'){quoteWa.to=t.value;quoteWa.auto=false;const r=quoteWa.ready,o=document.querySelector('.q-wa-open');if(r){r.href='https://wa.me/'+t.value.replace(/\D/g,'')+'?text='+encodeURIComponent(r.text);if(o)o.href=r.href}}
  else if(t.dataset.qw==='email'){quoteWa.email=t.value;quoteWa.autoEmail=false;const r=quoteWa.ready,o=document.querySelector('.q-mail-open');if(r?.mailto){r.mailto=quoteMailto(t.value,r.docs,r.text);if(o)o.href=r.mailto}}
  else if(quoteWa.ready){quoteWa.ready=null;quoteWa.msg='';setTimeout(render,0)}
  if(t.dataset.qw==='kind')quoteWa.detailed=t.value==='detailed';
  if(t.dataset.qw==='pick'){const id=Number(t.value);quoteWa.ids=t.checked?[...new Set([...quoteWa.ids,id])]:quoteWa.ids.filter(v=>v!==id);const b=document.querySelector('#quote-wa-send');if(b){b.textContent=quoteWaLabel(quoteWa.ids.length);b.disabled=!quoteWa.ids.length}const m=document.querySelector('#quote-mail-send');if(m){m.textContent=quoteMailLabel(quoteWa.ids.length);m.disabled=!quoteWa.ids.length}}
  return;
 }
 if(!quoteDraft)return;
 if(t.dataset.qp==='search'&&quotePick){quotePick.q=t.value;const r=document.querySelector('#quote-pick-results');if(r)r.innerHTML=quotePickResults();return}
 if(t.dataset.qf==='email'&&quoteWa.autoEmail){quoteWa.email=t.value;const w=document.querySelector('[data-qw="email"]');if(w)w.value=t.value}
 if(t.dataset.qf==='contact'&&quoteWa.auto){quoteWa.to=quoteWaNumber(t.value);const w=document.querySelector('[data-qw="to"]');if(w)w.value=quoteWa.to}
 if(t.dataset.qf){const k=t.dataset.qf;quoteDraft[k]=['margin','vat'].includes(k)?Number(t.value):t.value}
 if(t.dataset.ql!==undefined){quoteDraft.lines[Number(t.dataset.ql)][t.dataset.field]=['value','quantity'].includes(t.dataset.field)?Number(t.value):t.value}
 if(t.dataset.qt){quoteDraft.topics=t.checked?[...new Set([...quoteDraft.topics,t.dataset.qt])]:quoteDraft.topics.filter(v=>v!==t.dataset.qt)}
 // Typing a description shows matching products from every table and invoice right under the line.
 if(typing&&t.dataset.field==='description'&&quoteTables().length){
  const i=Number(t.dataset.ql),l=quoteDraft.lines[i];
  if(quotePick?.line===i){if(quotePick.q===t.value)return;quotePick.q=t.value;const el=document.querySelector('#quote-pick');if(el)el.outerHTML=quotePicker()}
  else if(l&&!l.catalog&&quotePickOff!==i&&quoteNorm(t.value)){quotePick={...quotePickStart(i),q:t.value};render();const d=document.querySelector(`[data-ql="${i}"][data-field="description"]`);if(d){d.focus();d.setSelectionRange?.(d.value.length,d.value.length)}}
 }
 if(t.dataset.ql!==undefined){const i=Number(t.dataset.ql),l=quoteDraft.lines[i],cost=document.querySelector('[data-qcost="'+i+'"]');if(cost)cost.textContent=eur(l.value*(l.quantity??1))}
 const title=document.querySelector('#quote-title');if(title&&(t.dataset.qt||t.dataset.qf==='brand'))title.textContent=quoteDraft.topics.length?quoteTitle(quoteDraft):'Prepare uma proposta à medida do seu cliente.';
 const match=document.querySelector('#quote-match');if(match&&['client','contact'].includes(t.dataset.qf))match.textContent=quoteMatchNote();
 const summary=document.querySelector('#quote-summary');if(summary&&quoteDraft.margin>=0&&quoteDraft.margin<100)summary.innerHTML=quoteSummary();
 // A battery typed or picked as an ordinary line changes the PV figures and the payback.
 if((t.dataset.ql!==undefined||['margin','vat'].includes(t.dataset.qf))&&quoteDraft.pv&&typeof pvRefreshResults==='function')pvRefreshResults();
}
document.addEventListener('input',e=>quoteReadInput(e.target,true));
// Tapping an empty description opens the price table list of the quote's brand right under it.
document.addEventListener('focusin',e=>{
 const t=e.target;if(!quoteDraft||quoteBusy||t.dataset?.field!=='description'||!quoteTables().length)return;
 const i=Number(t.dataset.ql),l=quoteDraft.lines[i];if(!l||l.description.trim()||l.catalog||quotePick?.line===i)return;
 quotePick=quotePickLast&&quoteTables()[quotePickLast.brand]?{brand:quotePickLast.brand,path:quotePickLast.path,q:'',line:i}:quotePickStart(i);render();document.querySelector(`[data-ql="${i}"][data-field="description"]`)?.focus();
});
document.addEventListener('change',e=>quoteReadInput(e.target));
document.addEventListener('submit',e=>{if(e.target.id==='quote-form'){e.preventDefault();saveQuote(false)}});
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-a="tab"][data-id="orc"]');if(tab){setTimeout(loadQuotes,0);return}
 const b=e.target.closest('[data-qa]');if(!b)return;e.stopImmediatePropagation();if(quoteBusy)return;
 const a=b.dataset.qa;
 if(['new','new-client','edit','client','list'].includes(a))quoteWa.key=null;
 if(['new','new-client','edit','close','list'].includes(a)){quotePick=null;quotePickLast=null;quotePickOff=null}
 if(a==='wa-send'||a==='mail-send'){const ch=a==='wa-send'?'whatsapp':'email';await (quoteDraft?saveQuote(ch):quoteWaSendFolder(ch));return}
 if(a==='wa-share'){const r=quoteWa.ready;navigator.share({files:r.files,text:r.text.replace(/\n+https?:\S+/g,'')}).catch(()=>{});return}
 if(a==='wa-reset'){quoteWa.ready=null;quoteWa.msg=''}
 if(quoteDraft&&a!=='wa-reset'&&quoteWa.ready){quoteWa.ready=null;quoteWa.msg=''}
 if(a==='new'){quoteWa.key=null;quoteDraft=newQuote();quoteClient=null;quoteError=''}
 if(a==='list'){quoteDraft=null;quoteClient=null;quoteError='';loadQuotes()}
 if(a==='close'){quoteDraft=null;quoteError='';loadQuotes()}
 if(a==='client'){quoteClient=b.dataset.key;quoteError='';window.scrollTo?.(0,0)}
 if(a==='new-client'){quoteWa.key=null;const g=quoteClients().find(g=>g.key===quoteClient);quoteDraft=newQuote();if(g)Object.assign(quoteDraft,{client:g.latest.client,address:g.latest.address,contact:g.latest.contact,email:quoteClientEmail(g)});quoteError=''}
 if(a==='reload'){loadQuotes();return}
 if(a==='edit'){quoteWa.key=null;const r=quoteRows.find(r=>r.id===Number(b.dataset.id));quoteDraft={...structuredClone(r.document),id:r.id};quoteDraft.brand=quoteDraft.brand||'';quoteDraft.email=quoteDraft.email||'';quoteDraft.address=[quoteDraft.address,quoteDraft.locality].filter(Boolean).join(', ');delete quoteDraft.locality;quoteDraft.lines=quoteDraft.lines.map(l=>({...l,kind:l.kind==='Equipamento / material'?'Equipamento':l.kind,quantity:l.quantity??1,unit:l.unit||'un.'}));quoteEnsureBlank();quoteError=''}
 if(a==='add'){quoteEnsureBlank();quotePick=null;render();document.querySelector(`[data-ql="${quoteDraft.lines.length-1}"][data-field="description"]`)?.focus();return}
 if(a==='pick-line'){quotePick=quotePickStart(Number(b.dataset.index))}
 // After "Escrever à mão" or "Fechar", typing on that line no longer reopens the suggestions.
 if(a==='pick-blank'||a==='pick-close')quotePickOff=quotePick.line??null;
 if(a==='pick-blank'){if(quotePick.line===undefined)quoteAddLine(quoteBlankLine());quotePick=null}
 if(a==='pick-close')quotePick=null;
 if(a==='pick-brands')quotePick={brand:null,path:[],q:'',line:quotePick.line};
 if(a==='pick-brand')quotePick=quotePickFor(Number(b.dataset.index),quotePick.line);
 if(a==='pick-all')quotePick={...quotePick,only:null};
 if(a==='pick-path')quotePick={...quotePick,path:quotePick.path.slice(0,Number(b.dataset.depth)),q:''};
 if(a==='pick-group')quotePick={...quotePick,path:[...quotePick.path,b.dataset.name]};
 if(a==='pick-product'){
  const bi=b.dataset.brand!==undefined?Number(b.dataset.brand):quotePick.brand,t=quoteTables()[bi],p=t.products[Number(b.dataset.index)];
  const at=quotePick.line;
  if(at===undefined)quoteAddLine(quoteCatalogLine(t,p));else quoteDraft.lines[at]={...quoteCatalogLine(t,p),quantity:quoteDraft.lines[at].quantity??1};
  quoteEnsureBlank();
  if(!quoteDraft.brand.trim())quoteDraft.brand=t.brand;
  if(TOPICS.includes(p.group[0])&&!quoteDraft.topics.includes(p.group[0]))quoteDraft.topics.push(p.group[0]);
  // The next empty line reopens the same brand one level up, e.g. Multisplit after picking its outdoor unit.
  quotePickLast={brand:bi,path:p.group.slice(0,-1)};quotePick=null;
 }
 if(a==='remove'&&quoteDraft.lines.length>1){quoteDraft.lines.splice(Number(b.dataset.index),1);quotePick=null;quotePickOff=null}
 if(a==='delete'){await deleteQuote();return}
 if(a==='delete-saved'){await deleteQuote(quoteRows.find(r=>r.id===Number(b.dataset.id)));return}
 if(a==='pdf'){await saveQuote(b.dataset.pdf==='detailed'?'detailed':'summary');return}
 render();
},true);
async function deleteQuote(row){
 const target=row?{...row.document,id:row.id}:quoteDraft;
 if(!target?.id||quoteBusy)return;
 if(!window.confirm('Eliminar o orçamento '+quoteNumber(target.id,target.date)+' de '+target.client+'? Esta ação não pode ser anulada.'))return;
 const id=target.id;quoteBusy=true;quoteError='';render();
 try{const r=await API('orcamentos/'+id,{method:'DELETE'});if(!r.ok){const body=await r.json().catch(()=>({}));throw Error(body.error||'Não foi possível eliminar o orçamento.')}quoteRows=(quoteRows||[]).filter(r=>r.id!==id);if(quoteDraft?.id===id)quoteDraft=null}
 catch(e){quoteError=e.message}finally{quoteBusy=false;render()}
}
async function saveQuote(pdf){
 const form=document.querySelector('#quote-form');if(quoteBusy||!form.reportValidity())return;
 if(!quoteDraft.topics.length){document.querySelector('#quote-message').textContent='Selecione pelo menos uma tipologia.';return}
 // The empty line kept at the end for the next product is not saved.
 const lines=quoteDraft.lines.filter(l=>!quoteLineBlank(l));
 if(!lines.some(l=>l.value>0)||lines.some(l=>!l.description.trim()||!Number.isFinite(l.quantity??1)||(l.quantity??1)<=0)){document.querySelector('#quote-message').textContent='Preencha as descrições e pelo menos um valor positivo.';return}
 quoteDraft.lines=lines;quoteBusy=true;quoteError='';render();
 try{
  const r=await API('orcamentos'+(quoteDraft.id?'/'+quoteDraft.id:''),{method:quoteDraft.id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(quoteDraft)});
  const row=await r.json().catch(()=>({}));if(!r.ok)throw Error(row.error||'Não foi possível guardar o orçamento.');
  quoteDraft={...row.document,id:row.id};quoteRows=[row,...(quoteRows||[]).filter(r=>r.id!==row.id)];quoteClient=quoteClientKey(row.document);quoteError='Orçamento guardado.';
  if(pdf==='whatsapp'||pdf==='email'){quoteError='Orçamento guardado.';await quoteWaSend([quoteDraft],pdf)}
  else if(pdf){quoteError='Orçamento guardado. A preparar PDF…';await downloadQuotePdf(quoteDraft,pdf==='detailed');quoteError='Orçamento guardado e PDF descarregado.'}
 }catch(e){quoteError=e.message||'Não foi possível gerar o PDF. O orçamento permanece disponível.'}
 finally{quoteBusy=false;if(quoteDraft)quoteEnsureBlank();if(V.tab==='orc')render()}
}
async function quoteWaSendFolder(channel){
 const g=quoteClients().find(g=>g.key===quoteClient);if(!g)return;
 // Only quotes in this client's folder can be selected and sent.
 const docs=g.rows.filter(r=>quoteWa.ids.includes(r.id)).map(r=>({...r.document,id:r.id}));if(!docs.length)return;
 quoteBusy=true;render();try{await quoteWaSend(docs,channel)}finally{quoteBusy=false;render()}
}
// Builds each PDF, stores it behind a private link, then prepares WhatsApp or sends the email.
async function quoteWaSend(docs,channel='whatsapp'){
 const to=quoteWa.to.replace(/\D/g,''),email=quoteWa.email.trim(),list=docs.map(q=>quoteNumber(q.id,q.date)).join(', ');
 const status=t=>{quoteWa.msg=t;const m=document.querySelector('#quote-wa-msg');if(m)m.textContent=t};
 if(channel==='whatsapp'&&!/^\d{8,15}$/.test(to)){status('Indique um número de WhatsApp válido, com indicativo do país (ex.: 351912345678).');return}
 if(channel==='email'&&!quoteMailOk(email)){status('Indique o email do cliente para enviar o orçamento por email.');return}
 if(channel==='email'&&quoteWa.mail?.configured&&!window.confirm('Enviar '+list+' por email para '+email+'?'))return;
 const links=[],files=[];
 try{
  for(const q of docs){
   status('A preparar '+quoteNumber(q.id,q.date)+(docs.length>1?' ('+(links.length+1)+' de '+docs.length+')':'')+'…');
   const {doc,filename}=await buildQuotePdf(q,quoteWa.detailed);
   const r=await API('whatsapp/pdf',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:q.id,pdf:doc.output('datauristring').split(',').pop()})});
   const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||'Não foi possível preparar o PDF.');
   links.push(b.url);if(typeof File==='function')files.push(new File([doc.output('blob')],filename,{type:'application/pdf'}));
  }
  const text=quoteWaText(docs,links);
  quoteWa.ready={text,docs,links,href:'https://wa.me/'+to+'?text='+encodeURIComponent(text),files:files.length?files:null};
  if(channel==='whatsapp')return status('Pronto. Toque em «Abrir conversa no WhatsApp» e depois em enviar.');
  if(!quoteWa.mail?.configured){quoteWa.ready.mailto=quoteMailto(email,docs,text);return status('Pronto. Toque em «Abrir email» e depois em enviar.')}
  status('A enviar email para '+email+'…');
  const r=await API('email/enviar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:email,subject:quoteMailSubject(docs),text,links})});
  const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||'Não foi possível enviar o email.');
  status((docs.length>1?'Orçamentos '+list+' enviados':'Orçamento '+list+' enviado')+' por email para '+email+', com o PDF em anexo.');
 }catch(e){status(e.message||'Não foi possível preparar o envio.')}
}
async function downloadQuotePdf(q,detailed=true){const {doc,filename}=await buildQuotePdf(q,detailed);doc.save(filename)}
async function buildQuotePdf(q,detailed=true){
 if(!window.jspdf||!window.jspdf.jsPDF)throw Error('O gerador de PDF não carregou. Recarregue a página e tente novamente.');
 const {jsPDF}=window.jspdf,doc=new jsPDF();
 const logo=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Não foi possível carregar o logótipo ENAT. Tente novamente.'));img.src='/enat-logo.png'});
 const money=n=>Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/ | /g,' ')+' €',totals=quoteTotals(q);
 const navy=[18,44,59],grey=[110,120,125],soft=[242,246,248],number=quoteNumber(q.id,q.date);
 const day=d=>d.toISOString().slice(0,10).split('-').reverse().join('/'),issued=new Date(q.date+'T00:00:00Z'),valid=new Date(issued.getTime()+15*864e5);
 const logoW=46,logoH=Math.min(26,logoW*logo.height/logo.width);
 const header=first=>{
  doc.setFillColor(...navy);doc.rect(0,0,210,4,'F');
  if(!first){doc.addImage(logo,'PNG',16,10,28,28*logoH/logoW);doc.setTextColor(...navy);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Orçamento '+number,194,16,{align:'right'});doc.setDrawColor(210,218,222);doc.line(16,40,194,40);return}
  doc.addImage(logo,'PNG',16,12,logoW,logoH);
  doc.setTextColor(...navy);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('ORÇAMENTO',194,20,{align:'right'});
  doc.setFontSize(9);let ly=28;
  for(const [label,value] of [['N.º',number],['Data',day(issued)],['Válido até',day(valid)]]){doc.setFont('helvetica','normal');doc.setTextColor(...grey);doc.text(label,150,ly);doc.setFont('helvetica','bold');doc.setTextColor(...navy);doc.text(value,194,ly,{align:'right'});ly+=5}
 };
 header(true);
 // Client details sit in a shaded panel; the subject follows in bold.
 let y=Math.max(12+logoH,42)+8;doc.setFont('helvetica','normal');doc.setFontSize(10);
 const info=[[q.client,'bold'],...doc.splitTextToSize(q.address,166).map(t=>[t,'normal']),['Contacto: '+q.contact,'normal']];
 const boxH=11+info.length*5;doc.setFillColor(...soft);doc.roundedRect(16,y,178,boxH,2,2,'F');doc.setFillColor(...navy);doc.rect(16,y,1.4,boxH,'F');
 doc.setFontSize(7.5);doc.setTextColor(...grey);doc.setFont('helvetica','bold');doc.text('CLIENTE',22,y+6);
 doc.setFontSize(10);doc.setTextColor(...navy);let iy=y+11.5;for(const [t,w] of info){doc.setFont('helvetica',w);doc.text(t,22,iy);iy+=5}
 y+=boxH+9;doc.setFontSize(7.5);doc.setTextColor(...grey);doc.setFont('helvetica','bold');doc.text('ASSUNTO',16,y);
 doc.setFontSize(13);doc.setTextColor(...navy);const title=doc.splitTextToSize(quoteTitle(q),178);doc.text(title,16,y+6);y+=6+title.length*6;
 // Allocate rounded sale prices so the published line values add up to the exact net total.
 let remaining=Math.round(totals.net*100);
 const cents=q.lines.map(l=>Math.floor((totals.cost?(l.value*(l.quantity??1))/totals.cost*totals.net:0)*100));
 remaining-=cents.reduce((s,n)=>s+n,0);for(let i=0;remaining>0;i=(i+1)%cents.length,remaining--)cents[i]++;
 const quantity=n=>Number(n).toLocaleString('pt-PT',{maximumFractionDigits:3}).replace(/ | /g,' ');
 const margin={left:16,right:16,top:46,bottom:20},later=()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)header(false)};
 doc.autoTable({startY:y+2,margin,theme:'plain',
  // The summary version lists what is included without revealing line prices.
  ...(detailed?{head:[['Descrição','Qtd.','Un.','Preço unit.','Total']],body:q.lines.map((l,i)=>[quoteClientText(l.description),quantity(l.quantity??1),l.unit||'un.',money(cents[i]/100/(l.quantity??1)),money(cents[i]/100)])}:{head:[['Descrição','Qtd.','Un.']],body:q.lines.map(l=>[quoteClientText(l.description),quantity(l.quantity??1),l.unit||'un.'])}),
  styles:{font:'helvetica',fontSize:9,cellPadding:{top:3,right:2.5,bottom:3,left:2.5},overflow:'linebreak',textColor:navy,lineColor:[221,228,231],lineWidth:{bottom:.2}},headStyles:{fillColor:navy,textColor:255,fontStyle:'bold',fontSize:8.5,lineWidth:0},alternateRowStyles:{fillColor:[249,251,252]},
  columnStyles:detailed?{0:{cellWidth:82},1:{cellWidth:16,halign:'right'},2:{cellWidth:16},3:{cellWidth:32,halign:'right'},4:{cellWidth:32,halign:'right',fontStyle:'bold'}}:{0:{cellWidth:146},1:{cellWidth:16,halign:'right'},2:{cellWidth:16}},
  didParseCell:d=>{if(d.section==='head'&&d.column.index>0&&d.column.index!==2)d.cell.styles.halign='right'},rowPageBreak:'avoid',didDrawPage:later});
 const terms=['Proposta válida por 15 dias','Garantia dos equipamentos: 3 anos','Garantia de instalação: 2 anos','Prazo de instalação: A combinar','Condições de pagamento: 50% na adjudicação'].join('\n');
 const plain={fillColor:false},span=3;
 // Keep totals, conditions and signatures together whenever they fit on one page.
 // AutoTable measures wrapped text and moves the complete block before drawing it.
 doc.autoTable({startY:doc.lastAutoTable.finalY+6,margin,theme:'plain',pageBreak:'avoid',rowPageBreak:'avoid',styles:{font:'helvetica',fontSize:10,cellPadding:2.2,textColor:navy},columnStyles:{0:{cellWidth:94},1:{cellWidth:46},2:{cellWidth:38,halign:'right'}},body:[
  ['',{content:'Total sem IVA',styles:{textColor:grey}},money(totals.net)],
  ['',{content:'IVA ('+q.vat+'%)',styles:{textColor:grey}},money(totals.vat)],
  ['',{content:'Total com IVA',styles:{fontStyle:'bold',fontSize:11,fillColor:navy,textColor:255,cellPadding:4}},{content:money(totals.total),styles:{fontStyle:'bold',fontSize:13,fillColor:navy,textColor:255,cellPadding:4}}],
  [{content:'CONDIÇÕES GERAIS',colSpan:span,styles:{...plain,fontStyle:'bold',fontSize:8,textColor:grey,cellPadding:{top:10,right:0,bottom:1,left:0}}}],
  [{content:terms,colSpan:span,styles:{...plain,fontSize:9,cellPadding:{top:1,right:0,bottom:4,left:0}}}],
  [{content:'Responsável comercial\nJoão Lima',styles:{fontStyle:'bold',cellPadding:{top:16,right:0,bottom:2,left:0}}},{content:'Obra a cargo de:\nEnat - Energias',colSpan:2,styles:{fontStyle:'bold',cellPadding:{top:16,right:0,bottom:2,left:0}}}]
 ],didDrawCell:d=>{if(d.section==='body'&&d.row.index===5){doc.setDrawColor(...navy);doc.setLineWidth(.3);doc.line(d.cell.x,d.cell.y+12,d.cell.x+70,d.cell.y+12)}},didDrawPage:later});
 // Quotes with a PV sizing get one more page with the study and the monthly chart.
 if(q.pv?.result?.panels&&typeof pvPdfSection==='function'){doc.addPage();header(false);pvPdfSection(doc,q.pv.result,{navy,grey,soft,money})}
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setDrawColor(210,218,222);doc.setLineWidth(.2);doc.line(16,281,194,281);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...grey);doc.text('Enat - Energias · Orçamento '+number,16,286);doc.text('Página '+p+' de '+pages,194,286,{align:'right'})}
 // File names cannot contain slashes, so 2026/0042 becomes 2026-0042.
 const clean=v=>String(v||'').replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-').replace(/\s+/g,' ').trim();
 return {doc,filename:clean('ORC Nº '+number.replace(/^ORC\s*/,'')+' '+q.client)+'.pdf'};
}

