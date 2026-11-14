/* Catálogos online dos fornecedores (Sanipower, Sanitop): a app descarrega a cópia guardada pelo servidor,
   junta-a às tabelas de preços e confirma o preço no site do fornecedor quando um produto entra num orçamento.
   Cada produto traz o seu preço de cliente (net) e desconto (disc), que podem variar de produto para produto. */
(function(root){
 const IDS=['sanipower','sanitop'];
 const r2=n=>Math.round(Number(n)*100)/100;
 // Preço com desconto e desconto de um produto, em qualquer tabela (as tabelas fixas usam o desconto da marca).
 root.priceNet=(t,p)=>p&&p.net!=null?Number(p.net):r2(Number(p.price)*(1-Number(t.discount||0)/100));
 root.priceDisc=(t,p)=>p&&p.disc!=null?Number(p.disc):Number(t.discount||0);
 // Texto curto do preço de tabela, com aviso quando o preço de cliente ainda é uma estimativa.
 root.priceNote=(t,p)=>`Tabela ${eur(p.price)} · −${String(root.priceDisc(t,p)).replace('.',',')}%`+(p.est?' (estimado)':'')+(t.live&&p.stock===0?' · sem stock':'');
 const state=root.SUPPLIERS={status:[],loading:false,error:''};
 // Estado da confirmação do preço de cada linha de orçamento (não é guardado com o orçamento).
 const LIVE=root.SUPPLIER_LIVE=new WeakMap();
 const when=iso=>{if(!iso)return '';const d=new Date(iso),m=Math.round((Date.now()-d)/60000);if(m<1)return 'agora mesmo';if(m<60)return 'há '+m+' min';if(m<24*60&&d.getDate()===new Date().getDate())return 'hoje às '+d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});return d.toLocaleDateString('pt-PT')+' '+d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})};
 root.supplierWhen=when;
 function table(d){
  const C=Object.fromEntries(d.cols.map((c,i)=>[c,i])),groups=d.groups,discs=[];
  const products=d.rows.map(r=>{const chg=r[C.chg];const p={group:groups[r[C.g]],key:r[C.key],ref:r[C.model]||r[C.ref],sref:r[C.ref],model:r[C.model],name:r[C.name],maker:r[C.brand]||'',price:r[C.pvp],net:r[C.net],disc:r[C.disc],stock:r[C.stock],est:r[C.est]?1:0,url:r[C.url]};if(chg){p.changed=chg[0];p.was=chg[1]}if(!p.est)discs.push(p.disc);return p});
  discs.sort((a,b)=>a-b);
  return {brand:d.name,table:'Catálogo online · atualizado '+when(d.at),discount:discs.length?discs[Math.floor(discs.length/2)]:0,live:true,supplier:d.supplier,at:d.at,products};
 }
 // Substitui a tabela do fornecedor no mesmo lugar (os índices das outras tabelas não mudam).
 function put(t){const l=root.PRICE_TABLES=root.PRICE_TABLES||[],i=l.findIndex(x=>x.supplier===t.supplier);if(i<0)l.push(t);else l[i]=t}
 const redraw=()=>{try{if(typeof idle==='function'&&idle()&&typeof render==='function')render()}catch(e){}};
 async function loadCatalogs(){
  if(state.loading||typeof API!=='function')return;state.loading=true;let changed=false;
  try{
   for(const id of IDS){
    const r=await API('fornecedores/catalogo/'+id);
    if(r.status!==200)continue;
    const d=await r.json(),cur=(root.PRICE_TABLES||[]).find(x=>x.supplier===id);
    if(cur&&cur.at===d.at)continue;
    put(table(d));changed=true;
   }
   state.error='';
  }catch(e){state.error='Não foi possível descarregar os catálogos dos fornecedores.'}
  state.loading=false;if(changed)redraw();
 }
 async function loadStatus(){
  try{const r=await API('fornecedores/estado');if(!r.ok)return;state.status=await r.json();
   const done=state.status.some(s=>{const t=(root.PRICE_TABLES||[]).find(x=>x.supplier===s.id);return s.catalog&&(!t||t.at!==s.catalog.at)});
   if(done)await loadCatalogs();
   if(state.status.some(s=>s.running)){clearTimeout(state.poll);state.poll=setTimeout(loadStatus,15000)}
   if(V?.tab==='mat')redraw();
  }catch(e){}
 }
 root.supplierStart=()=>{loadCatalogs().then(loadStatus);if(!state.timer)state.timer=setInterval(loadStatus,10*60000)};
 root.supplierSync=async()=>{
  const r=await API('fornecedores/atualizar',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(!r.ok){alert('Não foi possível iniciar a atualização dos fornecedores.');return}
  await loadStatus();
 };
 // Confirma o preço de agora no site do fornecedor e atualiza a linha do orçamento se tiver mudado.
 root.supplierLive=async(t,p,line)=>{
  if(!t?.live)return;
  const mark=v=>{LIVE.set(line,v)};mark('checking');
  try{
   const r=await API('fornecedores/preco',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({supplier:t.supplier,key:p.key})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'erro');
   if(d.gone){mark('gone');return}
   const before=line.value;
   Object.assign(p,{price:d.pvp,net:d.net,disc:d.disc,stock:d.stock==null?null:d.stock?1:0,est:0});
   if(line.catalog?.ref===p.key){line.catalog={...line.catalog,price:d.pvp,discount:d.disc};if(Math.abs(Number(line.value)-before)<0.005)line.value=d.net}
   mark(Math.abs(d.net-before)>=0.005?'changed:'+before:'ok');
  }catch(e){mark('fail')}
 };
 // Nota por baixo da linha do orçamento com o resultado da confirmação do preço.
 root.supplierLineNote=(l,i)=>{const v=LIVE.get(l);if(!v)return '';const txt=v==='checking'?'A confirmar o preço no site do fornecedor…':v==='ok'?'Preço confirmado agora no site do fornecedor.':v==='gone'?'Atenção: este produto já não aparece à venda no site do fornecedor.':v==='fail'?'Não foi possível confirmar agora no site; ficou o último preço lido.':'Preço atualizado no site do fornecedor (antes '+eur(Number(v.split(':')[1]))+').';return `<p class="note q-line-src" data-qlive="${i}">${txt}</p>`};
 // Bloco "Fornecedores online" na página de materiais.
 root.supplierPanel=()=>{
  const st=state.status;if(!st.length)return '';
  const rows=st.map(s=>{const t=(root.PRICE_TABLES||[]).find(x=>x.supplier===s.id),n=t?.products.length||s.catalog?.count||0,est=t?t.products.filter(p=>p.est).length:0;
   const line=s.running?`A atualizar… ${esc(s.phase||'')}`:s.error?`Última tentativa falhou: ${esc(s.error)}`:s.finishedAt?`Atualizado ${esc(when(s.finishedAt))}`:'Ainda não sincronizado';
   return `<button class="row invoice-row" data-a="sug" data-id="${esc(s.name)}"><div class="av">${ic('mat')}</div><div class="rt"><b>${esc(s.name)}</b><span>${n?n.toLocaleString('pt-PT')+' produtos'+(est?` · ${est.toLocaleString('pt-PT')} com preço estimado`:''):'Sem produtos ainda'}</span><span>${line}</span></div><div class="rr"><b>${s.running?'…':s.error?'!':'online'}</b><span>preços</span></div></button>`}).join('');
  const busy=st.some(s=>s.running);
  return `<h2>Fornecedores online</h2><div class="grp">${rows}</div><button class="btn alt" data-a="sup-sync" ${busy?'disabled':''}>${busy?'A atualizar preços dos fornecedores…':'Atualizar preços dos fornecedores agora'}</button><p class="note">Os catálogos da Sanipower e da Sanitop são atualizados automaticamente a cada 3 horas, com o seu preço de cliente. Ao adicionar um produto a um orçamento, o preço é confirmado no site nesse momento.</p>`;
 };
})(globalThis);
