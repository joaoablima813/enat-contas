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
const quoteCount=n=>n+(n===1?' orçamento':' orçamentos');
const quoteSavedRow=r=>`<div class="q-saved"><button class="row invoice-row" data-qa="edit" data-id="${r.id}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${quoteNumber(r.id,r.document.date)}</b><span>${fd(r.document.date)}</span><span>${esc(quoteTitle(r.document).replace('Orçamento para ',''))}</span></div><div class="rr"><b>${eur(quoteTotals(r.document).total)}</b><span>com IVA</span></div></button><button class="link neg q-list-delete" data-qa="delete-saved" data-id="${r.id}" aria-label="Eliminar orçamento ${quoteNumber(r.id,r.document.date)}">Eliminar</button></div>`;
function vQuotes(){
 if(quoteDraft)return quoteEditor();
 const errors=quoteError?`<p role="alert" class="neg">${esc(quoteError)}</p><button class="link" data-qa="reload">Tentar novamente</button>`:'';
 const clients=quoteRows===null?null:quoteClients(),folder=clients&&quoteClient&&clients.find(g=>g.key===quoteClient);
 if(folder){const c=folder.latest;return `<button class="back" data-qa="list">${ic('back')} Orçamentos</button><h1>${esc(c.client)}</h1><p class="sub">${[c.contact,c.address].filter(v=>String(v||'').trim()).map(esc).join(' · ')}</p><button class="btn" data-qa="new-client">Novo orçamento para este cliente</button><h2>${quoteCount(folder.rows.length)}</h2>${errors}<div class="grp">${folder.rows.map(quoteSavedRow).join('')}</div>`}
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
}
function newQuote(){return {client:'',address:'',contact:'',date:new Date().toISOString().slice(0,10),topics:[],brand:'',margin:20,vat:Number(S.vat??23),warranty:'3 anos',lines:[{kind:'Equipamento',description:'',quantity:1,unit:'un.',value:0}]}}
const quoteField=(label,key,type='text',extra='')=>`<label class="q-field"><span>${label}</span><input type="${type}" data-qf="${key}" value="${esc(quoteDraft[key])}" ${extra}></label>`;
function quoteSummary(){const t=quoteTotals(quoteDraft);return `<div class="q-break"><span>Valor de venda sem IVA (custo)</span><b>${eur(t.cost)}</b></div><div class="q-break"><span>IVA</span><b>${quoteDraft.vat}%</b></div><div class="q-break"><span>Total com IVA</span><b>${eur(t.costVat)}</b></div><div class="q-break"><span>Margem</span><b>${quoteDraft.margin}%</b></div><div class="q-total"><span>Valor final cliente</span><strong>${eur(t.total)}</strong></div><div class="q-break"><span>Lucro</span><b>${eur(t.profitVat)}</b></div><p class="note">Total com IVA = custo × (1 + IVA). Valor final cliente = total com IVA × (1 + margem). Lucro = valor final cliente − total com IVA.</p>`}
function quoteEditor(){const q=quoteDraft,folder=quoteClient&&quoteRows&&quoteClients().find(g=>g.key===quoteClient);return `<button class="back" data-qa="close">${ic('back')} ${folder?esc(folder.latest.client):'Orçamentos'}</button><h1>${q.id?'Orçamento '+quoteNumber(q.id,q.date):'Novo orçamento'}</h1><p class="sub" id="quote-title">${esc(q.topics.length?quoteTitle(q):'Prepare uma proposta à medida do seu cliente.')}</p><form id="quote-form"><fieldset class="q-fields" ${quoteBusy?'disabled':''}><h2>Cliente e local de instalação</h2><div class="q-card">${quoteField('Nome do cliente','client','text','required maxlength="2000" autocomplete="name"')}${quoteField('Morada','address','text','required maxlength="4000" autocomplete="street-address"')}${quoteField('Contacto do cliente','contact','text','required maxlength="2000" autocomplete="tel"')}${quoteField('Data do orçamento','date','date','required')}<p class="note q-match" id="quote-match" aria-live="polite">${esc(quoteMatchNote())}</p></div><h2>Tipologias</h2><p class="note">Selecione todas as opções aplicáveis.</p><div class="q-topics">${TOPICS.map(t=>`<label><input type="checkbox" data-qt="${esc(t)}" ${q.topics.includes(t)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div><div class="q-card">${quoteField('Marca do equipamento','brand','text','maxlength="200" placeholder="Ex.: LG"')}</div><h2>Produtos e serviços</h2><p class="note">Uma linha por produto ou serviço. Ajuste a quantidade para incluir várias unidades do mesmo produto.</p><div id="quote-lines">${q.lines.map((l,i)=>`<section class="q-card q-line"><div class="q-line-head"><button type="button" class="link neg" data-qa="remove" data-index="${i}" ${q.lines.length===1?'disabled':''}>Remover</button></div><label class="q-field"><span>Categoria</span><select data-ql="${i}" data-field="kind">${['Equipamento','Material','Acessórios','Mão de obra','Outros'].map(k=>`<option ${k===(l.kind==='Equipamento / material'?'Equipamento':l.kind)?'selected':''}>${k}</option>`).join('')}</select></label><label class="q-field"><span>Descrição</span><textarea data-ql="${i}" data-field="description" required maxlength="4000" placeholder="Produto, material ou serviço" rows="1">${esc(l.description)}</textarea></label><div class="q-line-numbers"><label class="q-field"><span>Quantidade</span><input type="number" data-ql="${i}" data-field="quantity" value="${l.quantity??1}" min="0.001" max="1000000" step="0.001" required inputmode="decimal"></label><label class="q-field"><span>Unidade</span><select data-ql="${i}" data-field="unit">${["un.","m","m²","m³","h","dia","serviço"].map(u=>`<option ${u===(l.unit||"un.")?"selected":""}>${u}</option>`).join("")}</select></label><label class="q-field"><span>Custo/un. s/ IVA (€)</span><input type="number" data-ql="${i}" data-field="value" value="${l.value}" min="0" max="100000000" step="0.01" required inputmode="decimal"></label></div><div class="q-break q-line-cost"><span>Subtotal de custo</span><b data-qcost="${i}">${eur(l.value*(l.quantity??1))}</b></div></section>`).join('')}</div><button type="button" class="btn alt" data-qa="add" ${q.lines.length>=200?'disabled':''}>Adicionar produto ou serviço</button><h2>Margem e totais</h2><div class="q-card">${quoteField('Margem de lucro (%)','margin','number','min="0" max="99.99" step="0.01" required inputmode="decimal"')}${quoteField('IVA (%)','vat','number','min="0" max="100" step="0.01" required inputmode="decimal"')}<p class="note">A margem é aplicada sobre o total com IVA. Ex.: custo de 3 548,38 €, IVA 23% e margem 20% = 4 364,51 € com IVA, 5 237,41 € ao cliente e 872,90 € de lucro.</p></div><div class="q-card" id="quote-summary" aria-live="polite">${quoteSummary()}</div><h2>Condições da proposta</h2><div class="q-card"><p class="q-terms">Proposta válida por 15 dias<br>Garantia dos equipamentos: 3 anos<br>Garantia de instalação: 2 anos<br>Prazo de instalação: A combinar<br>Condições de pagamento: 50% na adjudicação</p><p class="q-terms">Responsável comercial<br><b>João Lima</b></p><p class="q-terms">Obra a cargo de<br><b>Enat - Energias</b></p></div></fieldset><p id="quote-message" role="status" class="note">${esc(quoteError)}</p><button class="btn" type="submit" ${quoteBusy?'disabled':''}>${quoteBusy?'A guardar…':'Guardar orçamento'}</button><h2>PDF para o cliente</h2><p class="note">Escolha se o cliente vê o preço de cada equipamento e serviço ou apenas os totais.</p><button type="button" class="btn alt" data-qa="pdf" data-pdf="summary" ${quoteBusy?'disabled':''}>PDF só com totais (sem preços por linha)</button><button type="button" class="btn alt" data-qa="pdf" data-pdf="detailed" ${quoteBusy?'disabled':''}>PDF detalhado (com preços por linha)</button>${q.id?`<button type="button" class="btn alt neg q-delete" data-qa="delete" ${quoteBusy?'disabled':''}>Eliminar orçamento</button>`:''}</form>`}
function quoteReadInput(t){
 if(!quoteDraft)return;
 if(t.dataset.qf){const k=t.dataset.qf;quoteDraft[k]=['margin','vat'].includes(k)?Number(t.value):t.value}
 if(t.dataset.ql!==undefined){quoteDraft.lines[Number(t.dataset.ql)][t.dataset.field]=['value','quantity'].includes(t.dataset.field)?Number(t.value):t.value}
 if(t.dataset.qt){quoteDraft.topics=t.checked?[...new Set([...quoteDraft.topics,t.dataset.qt])]:quoteDraft.topics.filter(v=>v!==t.dataset.qt)}
 if(t.dataset.ql!==undefined){const i=Number(t.dataset.ql),l=quoteDraft.lines[i],cost=document.querySelector('[data-qcost="'+i+'"]');if(cost)cost.textContent=eur(l.value*(l.quantity??1))}
 const title=document.querySelector('#quote-title');if(title&&(t.dataset.qt||t.dataset.qf==='brand'))title.textContent=quoteDraft.topics.length?quoteTitle(quoteDraft):'Prepare uma proposta à medida do seu cliente.';
 const match=document.querySelector('#quote-match');if(match&&['client','contact'].includes(t.dataset.qf))match.textContent=quoteMatchNote();
 const summary=document.querySelector('#quote-summary');if(summary&&quoteDraft.margin>=0&&quoteDraft.margin<100)summary.innerHTML=quoteSummary();
}
document.addEventListener('input',e=>quoteReadInput(e.target));
document.addEventListener('change',e=>quoteReadInput(e.target));
document.addEventListener('submit',e=>{if(e.target.id==='quote-form'){e.preventDefault();saveQuote(false)}});
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-a="tab"][data-id="orc"]');if(tab){setTimeout(loadQuotes,0);return}
 const b=e.target.closest('[data-qa]');if(!b)return;e.stopImmediatePropagation();if(quoteBusy)return;
 const a=b.dataset.qa;
 if(a==='new'){quoteDraft=newQuote();quoteClient=null;quoteError=''}
 if(a==='list'){quoteDraft=null;quoteClient=null;quoteError='';loadQuotes()}
 if(a==='close'){quoteDraft=null;quoteError='';loadQuotes()}
 if(a==='client'){quoteClient=b.dataset.key;quoteError='';window.scrollTo?.(0,0)}
 if(a==='new-client'){const g=quoteClients().find(g=>g.key===quoteClient);quoteDraft=newQuote();if(g)Object.assign(quoteDraft,{client:g.latest.client,address:g.latest.address,contact:g.latest.contact});quoteError=''}
 if(a==='reload'){loadQuotes();return}
 if(a==='edit'){const r=quoteRows.find(r=>r.id===Number(b.dataset.id));quoteDraft={...structuredClone(r.document),id:r.id};quoteDraft.brand=quoteDraft.brand||'';quoteDraft.address=[quoteDraft.address,quoteDraft.locality].filter(Boolean).join(', ');delete quoteDraft.locality;quoteDraft.lines=quoteDraft.lines.map(l=>({...l,kind:l.kind==='Equipamento / material'?'Equipamento':l.kind,quantity:l.quantity??1,unit:l.unit||'un.'}));quoteError=''}
 if(a==='add'&&quoteDraft.lines.length<200)quoteDraft.lines.push({kind:'Equipamento',description:'',quantity:1,unit:'un.',value:0});
 if(a==='remove'&&quoteDraft.lines.length>1)quoteDraft.lines.splice(Number(b.dataset.index),1);
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
 if(!quoteDraft.lines.some(l=>l.value>0)||quoteDraft.lines.some(l=>!l.description.trim()||!Number.isFinite(l.quantity??1)||(l.quantity??1)<=0)){document.querySelector('#quote-message').textContent='Preencha as descrições e pelo menos um valor positivo.';return}
 quoteBusy=true;quoteError='';render();
 try{
  const r=await API('orcamentos'+(quoteDraft.id?'/'+quoteDraft.id:''),{method:quoteDraft.id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(quoteDraft)});
  const row=await r.json().catch(()=>({}));if(!r.ok)throw Error(row.error||'Não foi possível guardar o orçamento.');
  quoteDraft={...row.document,id:row.id};quoteRows=[row,...(quoteRows||[]).filter(r=>r.id!==row.id)];quoteClient=quoteClientKey(row.document);quoteError='Orçamento guardado.';
  if(pdf){quoteError='Orçamento guardado. A preparar PDF…';await downloadQuotePdf(quoteDraft,pdf==='detailed');quoteError='Orçamento guardado e PDF descarregado.'}
 }catch(e){quoteError=e.message||'Não foi possível gerar o PDF. O orçamento permanece disponível.'}
 finally{quoteBusy=false;if(V.tab==='orc')render()}
}
async function downloadQuotePdf(q,detailed=true){
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
  ...(detailed?{head:[['Descrição','Qtd.','Un.','Preço unit.','Total']],body:q.lines.map((l,i)=>[l.description,quantity(l.quantity??1),l.unit||'un.',money(cents[i]/100/(l.quantity??1)),money(cents[i]/100)])}:{head:[['Descrição','Qtd.','Un.']],body:q.lines.map(l=>[l.description,quantity(l.quantity??1),l.unit||'un.'])}),
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
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setDrawColor(210,218,222);doc.setLineWidth(.2);doc.line(16,281,194,281);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...grey);doc.text('Enat - Energias · Orçamento '+number,16,286);doc.text('Página '+p+' de '+pages,194,286,{align:'right'})}
 // File names cannot contain slashes, so 2026/0042 becomes 2026-0042.
 const clean=v=>String(v||'').replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-').replace(/\s+/g,' ').trim();
 doc.save(clean('ORC Nº '+number.replace(/^ORC\s*/,'')+' '+q.client)+'.pdf');
}

