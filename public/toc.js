/* Faturas ao cliente no TOC Online: secção na obra, ecrã de confirmação e envio por email / WhatsApp.
   As linhas vêm do orçamento da obra (equipamentos, material, acessórios, mão de obra e outros), com IVA a 23%. */
let tocConfigured=null;
const tocKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
const tocNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
// Orçamentos que podem dar origem à fatura: o de origem da obra, os ligados a ela e os do mesmo cliente.
function tocQuotesFor(o){
 const rows=(typeof quoteRows!=='undefined'&&quoteRows)||[];
 const list=rows.filter(r=>String(r.id)===String(o.orc)||r.document?.obra===o.id||(tocNorm(r.document?.client)&&tocNorm(r.document?.client)===tocNorm(o.client)));
 return list.sort((a,b)=>(String(b.id)===String(o.orc))-(String(a.id)===String(o.orc))||(b.document?.status==='aceite')-(a.document?.status==='aceite')||b.id-a.id);
}
function tocWaHref(o,f){
 const tel=waTel(o.phone);if(!tel)return '';
 const text=`Olá ${String(o.client||'').trim()}, segue a fatura ${f.number||''} da Enat - Ponte de Lima, no valor de ${eur(f.total)}.${f.pdf?'\n\nFatura (PDF): '+f.pdf:''}\n\nPagamento por transferência para o IBAN ${ENAT_IBAN}.\n\nObrigado!`;
 return 'https://wa.me/'+tel+'?text='+encodeURIComponent(text);
}
const tocNumber=f=>f.number||('Fatura '+f.id);
function tocSection(o){
 const list=o.toc||[];
 return `<h2>Faturas ao cliente · TOC Online</h2>${list.length?`<div class="grp">${[...list].reverse().map(f=>{const wa=tocWaHref(o,f);return `<div class="row kv" style="flex-wrap:wrap"><div class="rt"><b>${esc(tocNumber(f))}</b><span>${esc(fd(f.date))} · ${esc(f.ref||'')}${f.emailedAt?' · enviada para '+esc(f.email):''}</span></div><div class="rr"><b>${eur(f.total)}</b><span>c/ IVA</span></div><div style="display:flex;gap:8px;width:100%;margin-top:8px;flex-wrap:wrap"><button class="mini" data-toc="pdf" data-id="${esc(f.id)}">Ver PDF</button><button class="mini" data-toc="mail" data-id="${esc(f.id)}">Enviar por email</button>${wa?`<a class="mini" target="_blank" rel="noopener" href="${esc(wa)}">WhatsApp</a>`:''}</div></div>`}).join('')}</div>`:'<p class="note">Emita a fatura desta obra no TOC Online a partir do orçamento, sem escrever as linhas outra vez.</p>'}<button class="btn" data-toc="new" data-id="${esc(o.id)}">${ic('fatura')}Criar fatura no TOC Online</button>`;
}
// Prepara o ecrã de confirmação com o orçamento escolhido e os dados do cliente da obra.
function tocDraft(o,quote,prev={}){
 const q=quote.document,lines=EnatToc.invoiceLines(q),parts=EnatToc.splitAddress(o.address||q.address);
 return {kind:'toc',step:'form',obra:o.id,quote:quote.id,key:prev.key||tocKey(),lines,totals:EnatToc.invoiceTotals(lines),
  tname:prev.tname??String(o.client||q.client||'').trim(),tnif:prev.tnif??String(o.nif||'').trim(),taddr:prev.taddr??parts.address,tpost:prev.tpost??parts.postcode,tcity:prev.tcity??parts.city,
  temail:prev.temail??String(o.email||q.email||'').trim(),send:prev.send??true,msg:''};
}
async function tocOpen(id){
 const o=S.obras.find(o=>o.id===id);if(!o)return;
 D={kind:'toc',step:'loading',obra:id};sheet();
 try{
  const [st]=await Promise.all([tocConfigured===null?API('toc/estado').then(r=>r.ok?r.json():null):null,typeof loadQuotes==='function'?loadQuotes():null]);
  if(st)tocConfigured=Boolean(st.configured);
 }catch(e){}
 if(D?.kind!=='toc'||D.obra!==id)return;
 if(tocConfigured===false){D={kind:'toc',step:'info',obra:id,msg:'A ligação ao TOC Online ainda não está configurada. Faltam as credenciais da API do TOC Online (Empresa › Configurações › Dados API) nas variáveis do site.'};sheet();return}
 const qs=tocQuotesFor(o);
 if(!qs.length){D={kind:'toc',step:'info',obra:id,msg:(typeof quoteRows!=='undefined'&&quoteRows===null)?'Não foi possível carregar os orçamentos. Verifique a ligação e tente de novo.':'Esta obra não tem orçamento associado. Crie o orçamento do cliente na app (ou converta-o em obra) para a fatura usar as mesmas linhas.'};sheet();return}
 D={...tocDraft(o,qs[0]),quotes:qs.map(r=>r.id)};sheet();
}
function tocSheet(d){
 const o=S.obras.find(o=>o.id===d.obra)||{},close='<button class="btn alt" data-a="close">Fechar</button>';
 if(d.step==='loading')return '<div class="grab"></div><h3>Fatura no TOC Online</h3><div class="empty">A preparar a fatura…</div>';
 if(d.step==='info')return `<div class="grab"></div><h3>Fatura no TOC Online</h3><p class="note">${esc(d.msg)}</p>${close}`;
 if(d.step==='done'){const f=d.rec,wa=tocWaHref(o,f);return `<div class="grab"></div><h3>Fatura emitida</h3><div class="grp">${kv('Fatura',esc(tocNumber(f)))}${kv('Cliente',esc(d.tname))}${kv('Total sem IVA',eur(f.net))}${kv('IVA 23%',eur(f.vat))}${kv('Total com IVA',eur(f.total),'tot')}</div><p class="note">${f.emailedAt?'Enviada por email para '+esc(f.email)+'.':'Ainda não foi enviada por email.'}</p>${d.msg?`<p class="note neg">${esc(d.msg)}</p>`:''}<button class="btn alt" data-toc="pdf" data-id="${esc(f.id)}">Ver PDF da fatura</button>${f.emailedAt?'':`<button class="btn alt" data-toc="mail" data-id="${esc(f.id)}">Enviar por email</button>`}${wa?`<a class="btn alt" target="_blank" rel="noopener" href="${esc(wa)}">Enviar por WhatsApp</a>`:''}${close}`}
 const busy=d.step==='busy',rows=typeof quoteRows!=='undefined'&&quoteRows||[],again=(o.toc||[]).filter(f=>f.quote===d.quote);
 const qLabel=id=>{const r=rows.find(r=>r.id===id);return r?quoteNumber(r.id,r.document.date)+' · '+(r.document.topics||[]).join(' + ')+' · '+eur(quoteTotals(r.document).total):'Orçamento '+id};
 return `<div class="grab"></div><h3>Fatura no TOC Online</h3><p class="note" style="margin:-6px 4px 12px">A fatura é emitida já <b>finalizada</b> no TOC Online, com número definitivo. Depois de emitida só pode ser corrigida com nota de crédito. Confirme os dados.</p>
 <fieldset class="toc-form" ${busy?'disabled':''}>${(d.quotes||[]).length>1?`<div class="fld toc-quote"><label><span>Orçamento</span><select data-toc-quote>${d.quotes.map(id=>`<option value="${id}" ${id===d.quote?'selected':''}>${esc(qLabel(id))}</option>`).join('')}</select></label></div>`:`<p class="note">Linhas do orçamento ${esc(qLabel(d.quote))}.</p>`}
 <h2>Cliente</h2><div class="fld"><label><span>Nome</span><input data-k="tname" value="${esc(d.tname)}" maxlength="200" autocomplete="off"></label><label><span>NIF</span><input data-k="tnif" value="${esc(d.tnif)}" inputmode="numeric" maxlength="9" placeholder="Vazio: consumidor final"></label><label><span>Morada</span><input data-k="taddr" value="${esc(d.taddr)}" maxlength="300"></label><label><span>Código postal</span><input data-k="tpost" value="${esc(d.tpost)}" inputmode="numeric" maxlength="8" placeholder="0000-000"></label><label><span>Localidade</span><input data-k="tcity" value="${esc(d.tcity)}" maxlength="100"></label><label><span>Email</span><input data-k="temail" type="email" value="${esc(d.temail)}" maxlength="320" placeholder="cliente@exemplo.pt"></label><label><span>Enviar por email ao cliente</span><input type="checkbox" data-toc-send ${d.send?'checked':''} style="width:22px;height:22px"></label></div>
 <h2>Linhas (${d.lines.length})</h2><div class="grp invoice-items">${d.lines.map(l=>`<div class="row kv"><div class="rt"><b>${esc(l.description)}</b><span>${esc(l.kind)} · ${esc(String(l.quantity).replace('.',','))} ${esc(l.unit)} × ${eur(l.unit_price)} s/ IVA · IVA 23%</span></div><div class="rr"><b>${eur(l.net)}</b><span>s/ IVA</span></div></div>`).join('')||'<div class="empty">O orçamento não tem linhas com valor.</div>'}</div>
 <div class="grp">${kv('Total sem IVA',eur(d.totals.net))}${kv('IVA 23%',eur(d.totals.vat))}${kv('Total com IVA',eur(d.totals.total),'tot')}</div></fieldset>
 ${again.length?`<p class="note neg">Já foi emitida ${again.length===1?'uma fatura':again.length+' faturas'} deste orçamento (${esc(again.map(tocNumber).join(', '))}). Só continue se quiser outra.</p>`:''}
 <div class="toc-actions"><p class="note ${d.msg?'neg':''}" role="status">${esc(d.msg||'')}</p>
 <button class="btn" data-toc="emit" ${busy||!d.lines.length?'disabled':''}>${busy?'A emitir no TOC Online…':'Emitir fatura de '+eur(d.totals.total)}</button>${busy?'':'<button class="btn alt" data-a="close">Cancelar</button>'}</div>`;
}
async function tocEmit(){
 const d=D;if(d?.kind!=='toc'||d.step!=='form')return;
 const nif=d.tnif.replace(/\s/g,''),email=d.temail.trim();
 const err=!d.tname.trim()?'Indique o nome do cliente.':nif&&!EnatToc.validNif(nif)?'O NIF não é válido. Corrija-o ou deixe vazio para consumidor final.':d.tpost.trim()&&!/^\d{4}-\d{3}$/.test(d.tpost.trim())?'O código postal deve ter o formato 0000-000.':d.send&&!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)?'Indique o email do cliente ou desmarque o envio por email.':'';
 if(err){d.msg=err;sheet();return}
 if(!confirm(`Emitir a fatura definitiva de ${eur(d.totals.total)} para ${d.tname.trim()} no TOC Online?${d.send?'\nVai ser enviada para '+email+'.':''}`))return;
 d.step='busy';d.msg='';d.saving=true;sheet();
 try{
  const rec=await post('toc/fatura',{key:d.key,obra:d.obra,quote:d.quote,send:d.send,email,customer:{name:d.tname.trim(),nif,address:d.taddr.trim(),postcode:d.tpost.trim(),city:d.tcity.trim()}});
  const {emailError,...f}=rec,o=S.obras.find(o=>o.id===d.obra);
  if(o){o.toc=[...(o.toc||[]).filter(x=>x.id!==f.id),f];if(!o.nif&&nif)o.nif=nif;if(!o.email&&email)o.email=email;save()}
  Object.assign(d,{step:'done',rec:f,msg:emailError||'',saving:false});
 }catch(e){Object.assign(d,{step:'form',msg:e.message||'Não foi possível emitir a fatura.',saving:false})}
 if(D===d){sheet();render()}
}
function tocFind(id){for(const o of S.obras){const f=(o.toc||[]).find(f=>f.id===id);if(f)return {o,f}}return null}
async function tocPdf(id){
 const w=window.open('','_blank');
 try{const r=await API('toc/pdf/'+encodeURIComponent(id)),j=await r.json().catch(()=>({}));if(!r.ok||!j.url)throw Error(j.error||'Não foi possível obter o PDF.');
  const hit=tocFind(id);if(hit&&hit.f.pdf!==j.url){hit.f.pdf=j.url;save()}
  if(w)w.location.href=j.url;else location.href=j.url}
 catch(e){w?.close();const hit=tocFind(id);if(hit?.f.pdf)window.open(hit.f.pdf,'_blank');else alert(e.message)}
}
async function tocMail(id){
 const hit=tocFind(id);if(!hit)return;
 const to=prompt('Enviar a fatura '+tocNumber(hit.f)+' para o email:',hit.f.email||hit.o.email||'');if(to===null)return;
 try{const r=await post('toc/enviar',{id,email:to.trim(),number:hit.f.number});Object.assign(hit.f,{email:r.email,emailedAt:r.emailedAt});save();if(D?.kind==='toc'&&D.rec?.id===id){D.rec=hit.f;D.msg='';sheet()}render();alert('Fatura enviada para '+r.email+'.')}
 catch(e){alert(e.message)}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-toc]');if(!b)return;e.preventDefault();e.stopPropagation();
 const a=b.dataset.toc,id=b.dataset.id;
 if(a==='new')tocOpen(id);else if(a==='emit')tocEmit();else if(a==='pdf')tocPdf(id);else if(a==='mail')tocMail(id);
},true);
document.addEventListener('change',e=>{
 const t=e.target;if(D?.kind!=='toc'||D.step!=='form')return;
 if(t.matches('[data-toc-send]'))D.send=t.checked;
 else if(t.matches('[data-toc-quote]')){const o=S.obras.find(o=>o.id===D.obra),r=(quoteRows||[]).find(r=>r.id===Number(t.value));if(o&&r){const prev=D;D={...tocDraft(o,r,prev),quotes:prev.quotes};sheet()}}
});
