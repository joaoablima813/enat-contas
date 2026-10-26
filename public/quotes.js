let quoteRows=null,quoteError='',quoteLoading=false,quoteDraft=null,quoteBusy=false;
const quoteNumber=id=>String(id).padStart(4,'0');
const quoteTitle=q=>'Orçamento para '+q.topics.join(' + ');
function vQuotes(){
 if(quoteDraft)return quoteEditor();
 return `<h1>Orçamentos</h1><p class="sub">Propostas ENAT · Equipamentos e instalação</p><button class="btn" data-qa="new">Novo orçamento</button><h2>Propostas guardadas</h2>${quoteError?`<p role="alert" class="neg">${esc(quoteError)}</p><button class="link" data-qa="reload">Tentar novamente</button>`:''}${quoteRows===null?'<div class="grp empty" aria-busy="true">A carregar orçamentos…</div>':quoteRows.length?`<div class="grp">${quoteRows.map(r=>`<button class="row invoice-row" data-qa="edit" data-id="${r.id}"><div class="av">${ic('fatura')}</div><div class="rt"><b>${esc(r.document.client)}</b><span>N.º ${quoteNumber(r.id)} · ${fd(r.document.date)}</span><span>${esc(r.document.topics.join(' · '))}</span></div><div class="rr"><b>${eur(quoteTotals(r.document).total)}</b><span>com IVA</span></div></button>`).join('')}</div>`:'<div class="grp empty">Ainda não existem orçamentos. Crie a primeira proposta para o seu cliente.</div>'}`;
}
async function loadQuotes(){
 if(quoteLoading)return;quoteLoading=true;quoteError='';
 try{const r=await API('orcamentos');if(!r.ok)throw Error('Não foi possível carregar os orçamentos.');quoteRows=await r.json()}
 catch(e){quoteError=e.message}finally{quoteLoading=false;if(V.tab==='orc'&&!quoteDraft)render()}
}
function newQuote(){return {client:'',address:'',locality:'',contact:'',date:new Date().toISOString().slice(0,10),topics:[],margin:20,vat:Number(S.vat??23),warranty:'A confirmar junto do fornecedor',lines:[{kind:'Equipamento / material',description:'',value:0}]}}
const quoteField=(label,key,type='text',extra='')=>`<label class="q-field"><span>${label}</span><input type="${type}" data-qf="${key}" value="${esc(quoteDraft[key])}" ${extra}></label>`;
function quoteSummary(){const t=quoteTotals(quoteDraft);return `<div class="q-break"><span>Custo das alíneas</span><b>${eur(t.cost)}</b></div><div class="q-break"><span>Lucro previsto</span><b>${eur(t.profit)}</b></div><div class="q-break"><span>Total sem IVA</span><b>${eur(t.net)}</b></div><div class="q-break"><span>IVA (${quoteDraft.vat}%)</span><b>${eur(t.vat)}</b></div><div class="q-total"><span>Total com IVA</span><strong>${eur(t.total)}</strong></div>`}
function quoteEditor(){const q=quoteDraft;return `<button class="back" data-qa="list">${ic('back')} Orçamentos</button><h1>${q.id?'Orçamento n.º '+quoteNumber(q.id):'Novo orçamento'}</h1><p class="sub">${esc(q.topics.length?quoteTitle(q):'Prepare uma proposta à medida do seu cliente.')}</p><form id="quote-form"><fieldset class="q-fields" ${quoteBusy?'disabled':''}><h2>Cliente e local de instalação</h2><div class="q-card">${quoteField('Nome do cliente','client','text','required maxlength="2000" autocomplete="name"')}${quoteField('Morada','address','text','required maxlength="2000" autocomplete="street-address"')}${quoteField('Localidade','locality','text','required maxlength="2000" autocomplete="address-level2"')}${quoteField('Contacto do cliente','contact','text','required maxlength="2000" autocomplete="tel"')}${quoteField('Data do orçamento','date','date','required')}</div><h2>Tipologias</h2><p class="note">Selecione todas as opções aplicáveis.</p><div class="q-topics">${TOPICS.map(t=>`<label><input type="checkbox" data-qt="${esc(t)}" ${q.topics.includes(t)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div><h2>Alíneas da proposta</h2><p class="note">Introduza os custos sem IVA, incluindo a mão de obra. A margem é aplicada ao conjunto das alíneas.</p><div id="quote-lines">${q.lines.map((l,i)=>`<section class="q-card q-line"><div class="q-line-head"><b>Alínea ${i+1}</b><button type="button" class="link neg" data-qa="remove" data-index="${i}" ${q.lines.length===1?'disabled':''}>Remover</button></div><label class="q-field"><span>Tipo</span><select data-ql="${i}" data-field="kind">${['Equipamento / material','Mão de obra','Outros'].map(k=>`<option ${k===l.kind?'selected':''}>${k}</option>`).join('')}</select></label><label class="q-field"><span>Descrição</span><textarea data-ql="${i}" data-field="description" required maxlength="4000" rows="3">${esc(l.description)}</textarea></label><label class="q-field"><span>Custo sem IVA (€)</span><input type="number" data-ql="${i}" data-field="value" value="${l.value}" min="0" max="100000000" step="0.01" required inputmode="decimal"></label></section>`).join('')}</div><button type="button" class="btn alt" data-qa="add" ${q.lines.length>=200?'disabled':''}>Adicionar alínea</button><h2>Margem e totais</h2><div class="q-card">${quoteField('Margem de lucro (%)','margin','number','min="0" max="99.99" step="0.01" required inputmode="decimal"')}${quoteField('IVA (%)','vat','number','min="0" max="100" step="0.01" required inputmode="decimal"')}<p class="note">Margem sobre o preço de venda: preço sem IVA = custo ÷ (1 − margem / 100). Ex.: custo de 100 € e margem de 20% = 125 € sem IVA.</p></div><div class="q-card" id="quote-summary" aria-live="polite">${quoteSummary()}</div><h2>Condições da proposta</h2><div class="q-card"><label class="q-field"><span>Garantia dos equipamentos</span><textarea data-qf="warranty" maxlength="2000" rows="2">${esc(q.warranty)}</textarea></label><p class="note">Confirme a garantia com o fornecedor e substitua o texto antes de enviar.</p><p class="q-terms">Proposta válida por 15 dias<br>Garantia de instalação: 2 anos<br>Prazo de instalação: A combinar<br>Condições de pagamento: 50% na adjudicação</p><p class="q-terms">Responsável comercial<br><b>João Lima</b></p></div></fieldset><p id="quote-message" role="status" class="note">${esc(quoteError)}</p><button class="btn" type="submit" ${quoteBusy?'disabled':''}>${quoteBusy?'A guardar…':'Guardar orçamento'}</button><button type="button" class="btn alt" data-qa="pdf" ${quoteBusy?'disabled':''}>Guardar e descarregar PDF</button></form>`}
function quoteReadInput(t){
 if(!quoteDraft)return;
 if(t.dataset.qf){const k=t.dataset.qf;quoteDraft[k]=['margin','vat'].includes(k)?Number(t.value):t.value}
 if(t.dataset.ql!==undefined){quoteDraft.lines[Number(t.dataset.ql)][t.dataset.field]=t.dataset.field==='value'?Number(t.value):t.value}
 if(t.dataset.qt){quoteDraft.topics=t.checked?[...new Set([...quoteDraft.topics,t.dataset.qt])]:quoteDraft.topics.filter(v=>v!==t.dataset.qt)}
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
 if(a==='edit'){const r=quoteRows.find(r=>r.id===Number(b.dataset.id));quoteDraft={...structuredClone(r.document),id:r.id};quoteError=''}
 if(a==='add'&&quoteDraft.lines.length<200)quoteDraft.lines.push({kind:'Equipamento / material',description:'',value:0});
 if(a==='remove'&&quoteDraft.lines.length>1)quoteDraft.lines.splice(Number(b.dataset.index),1);
 if(a==='pdf'){await saveQuote(true);return}
 render();
},true);
async function saveQuote(pdf){
 const form=document.querySelector('#quote-form');if(quoteBusy||!form.reportValidity())return;
 if(!quoteDraft.topics.length){document.querySelector('#quote-message').textContent='Selecione pelo menos uma tipologia.';return}
 if(!quoteDraft.lines.some(l=>l.value>0)||quoteDraft.lines.some(l=>!l.description.trim())){document.querySelector('#quote-message').textContent='Preencha as descrições e pelo menos um valor positivo.';return}
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
 const money=n=>eur(n).replace(/\u00a0|\u202f/g,' '),totals=quoteTotals(q);
 const header=()=>{doc.setFillColor(18,44,59);doc.rect(0,0,210,7,'F');doc.addImage(logo,'PNG',16,16,52,52*logo.height/logo.width);doc.setTextColor(18,44,59);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('ORÇAMENTO',194,24,{align:'right'});doc.setFontSize(11);doc.text('N.º '+quoteNumber(q.id),194,31,{align:'right'});doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(q.date.split('-').reverse().join('/'),194,38,{align:'right'})};
 header();doc.setFont('helvetica','bold');doc.setFontSize(17);const title=doc.splitTextToSize(quoteTitle(q),178);doc.text(title,16,61);let y=64+title.length*7;
 doc.setFontSize(10);doc.setFont('helvetica','normal');
 for(const text of [q.client,q.address,q.locality,'Contacto: '+q.contact]){const lines=doc.splitTextToSize(text,178);if(y+lines.length*5>275){doc.addPage();header();y=56}doc.text(lines,16,y);y+=lines.length*5+2}
 // Allocate rounded sale prices so the published line values add up to the exact net total.
 let remaining=Math.round(totals.net*100);
 const cents=q.lines.map(l=>Math.floor((totals.cost?l.value/totals.cost*totals.net:0)*100));
 remaining-=cents.reduce((s,n)=>s+n,0);for(let i=0;remaining>0;i=(i+1)%cents.length,remaining--)cents[i]++;
 doc.autoTable({startY:y+6,margin:{left:16,right:16,top:53,bottom:20},head:[['Alínea','Descrição','Valor sem IVA']],body:q.lines.map((l,i)=>[String(i+1),l.kind+'\n'+l.description,money(cents[i]/100)]),styles:{font:'helvetica',fontSize:10,cellPadding:4,overflow:'linebreak'},headStyles:{fillColor:[18,44,59]},columnStyles:{0:{cellWidth:17},1:{cellWidth:119},2:{cellWidth:42,halign:'right'}},didDrawPage:()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)header()}});
 y=doc.lastAutoTable.finalY+12;if(y>225){doc.addPage();header();y=57}
 doc.setTextColor(18,44,59);doc.setFontSize(11);doc.text('Total sem IVA',116,y);doc.text(money(totals.net),194,y,{align:'right'});y+=8;doc.text('IVA ('+q.vat+'%)',116,y);doc.text(money(totals.vat),194,y,{align:'right'});y+=6;doc.setFillColor(235,242,245);doc.roundedRect(108,y,90,20,2,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Total com IVA',112,y+12);doc.setFontSize(16);doc.text(money(totals.total),194,y+12,{align:'right'});y+=33;
 doc.setFont('helvetica','normal');doc.setFontSize(9);
 for(const text of ['Proposta válida por 15 dias.','Garantia dos equipamentos: '+(q.warranty||'A confirmar junto do fornecedor'),'Garantia de instalação: 2 anos','Prazo de instalação: A combinar','Condições de pagamento: 50% na adjudicação']){const lines=doc.splitTextToSize(text,178);if(y+lines.length*4.5>270){doc.addPage();header();y=57}doc.text(lines,16,y);y+=lines.length*4.5+2}
 if(y>242){doc.addPage();header();y=57}y+=12;doc.setDrawColor(180,190,195);doc.line(16,y,80,y);doc.text('Responsável comercial',16,y+6);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('João Lima',16,y+13);
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110,120,125);doc.text('ENAT · Orçamento n.º '+quoteNumber(q.id),16,287);doc.text(p+' / '+pages,194,287,{align:'right'})}
 doc.save('ENAT-Orcamento-'+quoteNumber(q.id)+'.pdf');
}
