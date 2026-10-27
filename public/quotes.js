let quoteRows=null,quoteError='',quoteLoading=false,quoteDraft=null,quoteBusy=false;
const quoteNumber=id=>String(id).padStart(4,'0');
const quoteTitle=q=>'Orçamento para '+q.topics.join(' + ');
function vQuotes(){
 if(quoteDraft)return quoteEditor();
 return `<h1>Orçamentos</h1><p class="sub">Propostas ENAT · Equipamentos e instalação</p><button class="btn" data-qa="new">Novo orçamento</button><h2>Propostas guardadas</h2>${quoteError?`<p role="alert" class="neg">${esc(quoteError)}</p><button class="link" data-qa="reload">Tentar novamente</button>`:''}${quoteRows===null?'<div class="grp empty" aria-busy="true">A carregar orçamentos…</div>':quoteRows.length?`<div class="grp">${quoteRows.map(r=>`<div class="q-saved"><button class="row invoice-row" data-qa="edit" data-id="${r.id}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${esc(r.document.client)}</b><span>N.º ${quoteNumber(r.id)} · ${fd(r.document.date)}</span><span>${esc(r.document.topics.join(' · '))}</span></div><div class="rr"><b>${eur(quoteTotals(r.document).total)}</b><span>com IVA</span></div></button><button class="link neg q-list-delete" data-qa="delete-saved" data-id="${r.id}" aria-label="Eliminar orçamento n.º ${quoteNumber(r.id)}">Eliminar</button></div>`).join('')}</div>`:'<div class="grp empty">Ainda não existem orçamentos. Crie a primeira proposta para o seu cliente.</div>'}`;
}
async function loadQuotes(){
 if(quoteLoading)return;quoteLoading=true;quoteError='';
 try{const r=await API('orcamentos');if(!r.ok)throw Error('Não foi possível carregar os orçamentos.');quoteRows=await r.json()}
 catch(e){quoteError=e.message}finally{quoteLoading=false;if(V.tab==='orc'&&!quoteDraft)render()}
}
function newQuote(){return {client:'',address:'',contact:'',date:new Date().toISOString().slice(0,10),topics:[],margin:20,vat:Number(S.vat??23),warranty:'A confirmar junto do fornecedor',lines:[{kind:'Equipamento',description:'',quantity:1,unit:'un.',value:0}]}}
const quoteField=(label,key,type='text',extra='')=>`<label class="q-field"><span>${label}</span><input type="${type}" data-qf="${key}" value="${esc(quoteDraft[key])}" ${extra}></label>`;
function quoteSummary(){const t=quoteTotals(quoteDraft);return `<div class="q-break"><span>1. Total dos produtos e serviços sem IVA</span><b>${eur(t.cost)}</b></div><div class="q-break"><span>2. Total com IVA (${quoteDraft.vat}%)</span><b>${eur(t.costVat)}</b></div><div class="q-break"><span>3. Margem de lucro</span><b>${quoteDraft.margin}%</b></div><div class="q-total"><span>4. Valor final ao cliente (com IVA)</span><strong>${eur(t.total)}</strong></div><div class="q-break"><span>Sem IVA ${eur(t.net)} + IVA ${eur(t.vat)}</span><b></b></div><div class="q-break"><span>5. Lucro para mim (com IVA)</span><b>${eur(t.profitVat)}</b></div><p class="note">Lucro com IVA = valor final ao cliente − total com IVA. Inclui ${eur(t.profitVat-t.profit)} de IVA a entregar ao Estado (sem IVA: ${eur(t.profit)}).</p>`}
function quoteEditor(){const q=quoteDraft;return `<button class="back" data-qa="list">${ic('back')} Orçamentos</button><h1>${q.id?'Orçamento n.º '+quoteNumber(q.id):'Novo orçamento'}</h1><p class="sub">${esc(q.topics.length?quoteTitle(q):'Prepare uma proposta à medida do seu cliente.')}</p><form id="quote-form"><fieldset class="q-fields" ${quoteBusy?'disabled':''}><h2>Cliente e local de instalação</h2><div class="q-card">${quoteField('Nome do cliente','client','text','required maxlength="2000" autocomplete="name"')}${quoteField('Morada','address','text','required maxlength="4000" autocomplete="street-address"')}${quoteField('Contacto do cliente','contact','text','required maxlength="2000" autocomplete="tel"')}${quoteField('Data do orçamento','date','date','required')}</div><h2>Tipologias</h2><p class="note">Selecione todas as opções aplicáveis.</p><div class="q-topics">${TOPICS.map(t=>`<label><input type="checkbox" data-qt="${esc(t)}" ${q.topics.includes(t)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div><h2>Produtos e serviços</h2><p class="note">Uma linha por produto ou serviço. Ajuste a quantidade para incluir várias unidades do mesmo produto.</p><div id="quote-lines">${q.lines.map((l,i)=>`<section class="q-card q-line"><div class="q-line-head"><button type="button" class="link neg" data-qa="remove" data-index="${i}" ${q.lines.length===1?'disabled':''}>Remover</button></div><label class="q-field"><span>Categoria</span><select data-ql="${i}" data-field="kind">${['Equipamento','Material','Acessórios','Mão de obra','Outros'].map(k=>`<option ${k===(l.kind==='Equipamento / material'?'Equipamento':l.kind)?'selected':''}>${k}</option>`).join('')}</select></label><label class="q-field"><span>Descrição</span><textarea data-ql="${i}" data-field="description" required maxlength="4000" placeholder="Produto, material ou serviço" rows="1">${esc(l.description)}</textarea></label><div class="q-line-numbers"><label class="q-field"><span>Quantidade</span><input type="number" data-ql="${i}" data-field="quantity" value="${l.quantity??1}" min="0.001" max="1000000" step="0.001" required inputmode="decimal"></label><label class="q-field"><span>Unidade</span><select data-ql="${i}" data-field="unit">${["un.","m","m²","m³","h","dia","serviço"].map(u=>`<option ${u===(l.unit||"un.")?"selected":""}>${u}</option>`).join("")}</select></label><label class="q-field"><span>Custo/un. s/ IVA (€)</span><input type="number" data-ql="${i}" data-field="value" value="${l.value}" min="0" max="100000000" step="0.01" required inputmode="decimal"></label></div><div class="q-break q-line-cost"><span>Subtotal de custo</span><b data-qcost="${i}">${eur(l.value*(l.quantity??1))}</b></div></section>`).join('')}</div><button type="button" class="btn alt" data-qa="add" ${q.lines.length>=200?'disabled':''}>Adicionar produto ou serviço</button><h2>Margem e totais</h2><div class="q-card">${quoteField('Margem de lucro (%)','margin','number','min="0" max="99.99" step="0.01" required inputmode="decimal"')}${quoteField('IVA (%)','vat','number','min="0" max="100" step="0.01" required inputmode="decimal"')}<p class="note">Margem sobre o preço de venda: preço sem IVA = custo ÷ (1 − margem / 100). Ex.: custo de 100 € e margem de 20% = 125 € sem IVA.</p></div><div class="q-card" id="quote-summary" aria-live="polite">${quoteSummary()}</div><h2>Condições da proposta</h2><div class="q-card"><label class="q-field"><span>Garantia dos equipamentos</span><textarea data-qf="warranty" maxlength="2000" rows="2">${esc(q.warranty)}</textarea></label><p class="note">Confirme a garantia com o fornecedor e substitua o texto antes de enviar.</p><p class="q-terms">Proposta válida por 15 dias<br>Garantia de instalação: 2 anos<br>Prazo de instalação: A combinar<br>Condições de pagamento: 50% na adjudicação</p><p class="q-terms">Responsável comercial<br><b>João Lima</b></p></div></fieldset><p id="quote-message" role="status" class="note">${esc(quoteError)}</p><button class="btn" type="submit" ${quoteBusy?'disabled':''}>${quoteBusy?'A guardar…':'Guardar orçamento'}</button><button type="button" class="btn alt" data-qa="pdf" ${quoteBusy?'disabled':''}>Guardar e descarregar PDF</button>${q.id?`<button type="button" class="btn alt neg q-delete" data-qa="delete" ${quoteBusy?'disabled':''}>Eliminar orçamento</button>`:''}</form>`}
function quoteReadInput(t){
 if(!quoteDraft)return;
 if(t.dataset.qf){const k=t.dataset.qf;quoteDraft[k]=['margin','vat'].includes(k)?Number(t.value):t.value}
 if(t.dataset.ql!==undefined){quoteDraft.lines[Number(t.dataset.ql)][t.dataset.field]=['value','quantity'].includes(t.dataset.field)?Number(t.value):t.value}
 if(t.dataset.qt){quoteDraft.topics=t.checked?[...new Set([...quoteDraft.topics,t.dataset.qt])]:quoteDraft.topics.filter(v=>v!==t.dataset.qt)}
 if(t.dataset.ql!==undefined){const i=Number(t.dataset.ql),l=quoteDraft.lines[i],cost=document.querySelector('[data-qcost="'+i+'"]');if(cost)cost.textContent=eur(l.value*(l.quantity??1))}
 const summary=document.querySelector('#quote-summary');if(summary&&quoteDraft.margin>=0&&quoteDraft.margin<100)summary.innerHTML=quoteSummary();
}
document.addEventListener('input',e=>quoteReadInput(e.target));
document.addEventListener('change',e=>quoteReadInput(e.target));
document.addEventListener('submit',e=>{if(e.target.id==='quote-form'){e.preventDefault();saveQuote(false)}});
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-a="tab"][data-id="orc"]');if(tab){setTimeout(loadQuotes,0);return}
 const b=e.target.closest('[data-qa]');if(!b)return;e.stopImmediatePropagation();if(quoteBusy)return;
 const a=b.dataset.qa;
 if(a==='new'){quoteDraft=newQuote();quoteError=''}
 if(a==='list'){quoteDraft=null;quoteError='';loadQuotes()}
 if(a==='reload'){loadQuotes();return}
 if(a==='edit'){const r=quoteRows.find(r=>r.id===Number(b.dataset.id));quoteDraft={...structuredClone(r.document),id:r.id};quoteDraft.address=[quoteDraft.address,quoteDraft.locality].filter(Boolean).join(', ');delete quoteDraft.locality;quoteDraft.lines=quoteDraft.lines.map(l=>({...l,kind:l.kind==='Equipamento / material'?'Equipamento':l.kind,quantity:l.quantity??1,unit:l.unit||'un.'}));quoteError=''}
 if(a==='add'&&quoteDraft.lines.length<200)quoteDraft.lines.push({kind:'Equipamento',description:'',quantity:1,unit:'un.',value:0});
 if(a==='remove'&&quoteDraft.lines.length>1)quoteDraft.lines.splice(Number(b.dataset.index),1);
 if(a==='delete'){await deleteQuote();return}
 if(a==='delete-saved'){await deleteQuote(quoteRows.find(r=>r.id===Number(b.dataset.id)));return}
 if(a==='pdf'){await saveQuote(true);return}
 render();
},true);
async function deleteQuote(row){
 const target=row?{...row.document,id:row.id}:quoteDraft;
 if(!target?.id||quoteBusy)return;
 if(!window.confirm('Eliminar o orçamento n.º '+quoteNumber(target.id)+' de '+target.client+'? Esta ação não pode ser anulada.'))return;
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
  quoteDraft={...row.document,id:row.id};quoteRows=[row,...(quoteRows||[]).filter(r=>r.id!==row.id)];quoteError='Orçamento guardado.';
  if(pdf){quoteError='Orçamento guardado. A preparar PDF…';await downloadQuotePdf(quoteDraft);quoteError='Orçamento guardado e PDF descarregado.'}
 }catch(e){quoteError=e.message||'Não foi possível gerar o PDF. O orçamento permanece disponível.'}
 finally{quoteBusy=false;if(V.tab==='orc')render()}
}
async function downloadQuotePdf(q){
 if(!window.jspdf||!window.jspdf.jsPDF)throw Error('O gerador de PDF não carregou. Recarregue a página e tente novamente.');
 const {jsPDF}=window.jspdf,doc=new jsPDF();
 const logo=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Não foi possível carregar o logótipo ENAT. Tente novamente.'));img.src='/enat-logo.png'});
 const money=n=>Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/\u00a0|\u202f/g,' ')+' €',totals=quoteTotals(q);
 const header=()=>{doc.setFillColor(18,44,59);doc.rect(0,0,210,7,'F');doc.addImage(logo,'PNG',16,16,52,52*logo.height/logo.width);doc.setTextColor(18,44,59);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('ORÇAMENTO',194,24,{align:'right'});doc.setFontSize(11);doc.text('N.º '+quoteNumber(q.id),194,31,{align:'right'});doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(q.date.split('-').reverse().join('/'),194,38,{align:'right'})};
 header();doc.setFont('helvetica','bold');doc.setFontSize(17);const title=doc.splitTextToSize(quoteTitle(q),178);doc.text(title,16,54);let y=57+title.length*7;
 doc.setFontSize(10);doc.setFont('helvetica','normal');
 for(const text of [q.client,[q.address,q.locality].filter(Boolean).join(', '),'Contacto: '+q.contact]){const lines=doc.splitTextToSize(text,178);if(y+lines.length*5>275){doc.addPage();header();y=56}doc.text(lines,16,y);y+=lines.length*5+2}
 // Allocate rounded sale prices so the published line values add up to the exact net total.
 let remaining=Math.round(totals.net*100);
 const cents=q.lines.map(l=>Math.floor((totals.cost?(l.value*(l.quantity??1))/totals.cost*totals.net:0)*100));
 remaining-=cents.reduce((s,n)=>s+n,0);for(let i=0;remaining>0;i=(i+1)%cents.length,remaining--)cents[i]++;
 const quantity=n=>Number(n).toLocaleString('pt-PT',{maximumFractionDigits:3}).replace(/\u00a0|\u202f/g,' ');
 doc.autoTable({startY:y+4,margin:{left:16,right:16,top:46,bottom:18},head:[['Descrição','Qtd.','Un.','Preço unit.','Total']],body:q.lines.map((l,i)=>[l.description,quantity(l.quantity??1),l.unit||'un.',money(cents[i]/100/(l.quantity??1)),money(cents[i]/100)]),styles:{font:'helvetica',fontSize:9,cellPadding:2.2,overflow:'linebreak',textColor:[18,44,59]},headStyles:{fillColor:[18,44,59]},alternateRowStyles:{fillColor:[245,248,249]},columnStyles:{0:{cellWidth:82},1:{cellWidth:16,halign:'right'},2:{cellWidth:16},3:{cellWidth:32,halign:'right'},4:{cellWidth:32,halign:'right'}},rowPageBreak:'avoid',didDrawPage:()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)header()}});
 const terms=['Proposta válida por 15 dias.','Garantia dos equipamentos: '+(q.warranty||'A confirmar junto do fornecedor'),'Garantia de instalação: 2 anos','Prazo de instalação: A combinar','Condições de pagamento: 50% na adjudicação'].join('\n');
 // Keep totals, conditions and signature together whenever they fit on one page.
 // AutoTable measures wrapped text and moves the complete block before drawing it.
 doc.autoTable({startY:doc.lastAutoTable.finalY+5,margin:{left:16,right:16,top:46,bottom:18},theme:'plain',pageBreak:'avoid',rowPageBreak:'avoid',styles:{font:'helvetica',fontSize:10,cellPadding:2,textColor:[18,44,59]},columnStyles:{0:{cellWidth:116},1:{cellWidth:62,halign:'right'}},body:[
 ['Total sem IVA',money(totals.net)],
 ['IVA ('+q.vat+'%)',money(totals.vat)],
 [{content:'Total com IVA',styles:{fontStyle:'bold',fontSize:13,fillColor:[235,242,245],cellPadding:4}},{content:money(totals.total),styles:{fontStyle:'bold',fontSize:15,fillColor:[235,242,245],cellPadding:4}}],
 [{content:terms,colSpan:2,styles:{fontSize:8.5,cellPadding:{top:3,right:0,bottom:2,left:0}}}],
 [{content:'Responsável comercial\nJoão Lima',colSpan:2,styles:{fontStyle:'bold',fontSize:10,cellPadding:{top:3,right:0,bottom:2,left:0}}}]
 ],didDrawPage:()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)header()}});
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110,120,125);doc.text('ENAT · Orçamento n.º '+quoteNumber(q.id),16,287);doc.text(p+' / '+pages,194,287,{align:'right'})}
 doc.save('ENAT-Orcamento-'+quoteNumber(q.id)+'.pdf');
}
