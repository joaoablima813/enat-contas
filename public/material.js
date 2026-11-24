// Material por obra: lista criada a partir do orçamento aceite, agrupada por fornecedor, com o que falta encomendar,
// o que já foi encomendado e o que já chegou. Também há uma vista com o material de todas as obras (Início → Material).
const MAT_KINDS=new Set(['Equipamento','Material','Acessórios','Equipamento / material']);
const MAT_EST={falta:'Por encomendar',encomendado:'Encomendado',chegou:'Chegou'};
const MAT_SEM='Sem fornecedor';
let MAT_EDIT=null;
const matNum=n=>String(Math.round(Number(n||0)*1000)/1000).replace('.',',');
// Fornecedor já usado antes para a mesma marca/tabela (aprende com as listas anteriores).
function matFornDe(brand){
 if(!brand)return '';
 for(const o of S.obras)for(const m of o.material||[])if(m.brand===brand&&m.forn&&m.forn!==MAT_SEM)return m.forn;
 return '';
}
function matFromQuote(q){
 return (q?.lines||[]).filter(l=>MAT_KINDS.has(l.kind||'Equipamento')&&String(l.description||'').trim()).map(l=>{
  const c=l.catalog||{},brand=c.src?'':String(c.brand||'');
  return {id:uid(),desc:String(l.description).trim().slice(0,400),ref:String(c.ref||'').slice(0,80),qtd:Number(l.quantity??1)||1,un:l.unit||'un.',brand,forn:String(c.src||matFornDe(brand)||brand||MAT_SEM).slice(0,80),estado:'falta'};
 });
}
const matItens=o=>o.material||[];
const matConta=o=>{const L=matItens(o);return {tot:L.length,chegou:L.filter(m=>m.estado==='chegou').length,falta:L.filter(m=>m.estado==='falta').length}};
function matGrupos(list){
 const g=new Map();
 for(const x of list){const k=x.m.forn||MAT_SEM;if(!g.has(k))g.set(k,[]);g.get(k).push(x)}
 return [...g.entries()].sort((a,b)=>(a[0]===MAT_SEM)-(b[0]===MAT_SEM)||a[0].localeCompare(b[0],'pt'));
}
// Mensagem de encomenda para o fornecedor (só o que ainda não foi encomendado).
function matMensagem(forn,list){
 const obras=[...new Set(list.map(x=>x.o.name))];
 return `Olá! Encomenda da ENAT Ponte de Lima${obras.length===1?' (obra: '+obras[0]+')':''}:\n`+list.map(({m})=>`- ${matNum(m.qtd)} ${m.un} ${m.desc}${m.ref?' (ref. '+m.ref+')':''}`).join('\n')+'\nObrigado.';
}
function matItem(o,m,global){
 const d=`data-o="${esc(o.id)}" data-id="${esc(m.id)}"`;
 const edit=MAT_EDIT===m.id;
 return `<div class="mat-it ${m.estado}"><label class="mat-chk"><input type="checkbox" data-mat="chegou" ${d} ${m.estado==='chegou'?'checked':''} aria-label="Chegou"></label>
 <div class="mat-tx"><b>${esc(m.desc)}</b><span>${esc([matNum(m.qtd)+' '+m.un,m.ref?'Ref. '+m.ref:'',global?o.name:''].filter(Boolean).join(' · '))}</span>
 <div class="mat-st"><button type="button" class="mat-est ${m.estado}" data-mat="estado" ${d}>${MAT_EST[m.estado]||MAT_EST.falta}</button><button type="button" class="link mat-ed" data-mat="editar" ${d}>${edit?'Fechar':'Editar'}</button></div></div></div>
 ${edit?`<div class="mat-form"><label class="q-field"><span>Descrição</span><input data-matf="desc" ${d} value="${esc(m.desc)}" maxlength="400"></label>
 <div class="eq-g2"><label class="q-field"><span>Quantidade</span><input type="number" data-matf="qtd" ${d} value="${esc(String(m.qtd))}" min="0" step="0.001" inputmode="decimal"></label><label class="q-field"><span>Fornecedor</span><input data-matf="forn" ${d} value="${esc(m.forn===MAT_SEM?'':m.forn)}" list="mat-forn" maxlength="80" placeholder="Ex.: Sanitop"></label></div>
 <label class="q-field"><span>Referência</span><input data-matf="ref" ${d} value="${esc(m.ref||'')}" maxlength="80"></label>
 <button type="button" class="link neg" data-mat="del" ${d}>Eliminar da lista</button></div>`:''}`;
}
function matGrupoHtml(forn,list,global){
 const por=list.filter(x=>x.m.estado==='falta'),ch=list.filter(x=>x.m.estado==='chegou').length;
 const msg=matMensagem(forn,por);
 return `<div class="mat-grp"><div class="mat-h"><b>${esc(forn)}</b><span>${ch} de ${list.length} chegaram</span></div>
 ${list.map(x=>matItem(x.o,x.m,global)).join('')}
 ${por.length?`<div class="eq-row mat-acts">${forn===MAT_SEM?'<p class="note">Escolha o fornecedor em «Editar» para poder encomendar.</p>':''}${forn===MAT_SEM?'':`<a class="btn alt" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Encomendar por WhatsApp</a>`}<button type="button" class="btn alt" data-mat="enc-todos" data-forn="${esc(forn)}" data-ids="${esc(por.map(x=>x.o.id+':'+x.m.id).join(','))}">Marcar ${por.length} como encomendado${por.length>1?'s':''}</button></div>`:''}</div>`;
}
const matDatalist=()=>{const f=new Set();for(const o of S.obras)for(const m of o.material||[])if(m.forn&&m.forn!==MAT_SEM)f.add(m.forn);return `<datalist id="mat-forn">${[...f].sort().map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`};
function matSection(o){
 const L=matItens(o),c=matConta(o);
 const fromQuote=o.orc&&!L.length?`<button type="button" class="btn" data-mat="do-orc" data-o="${esc(o.id)}">Criar a lista a partir do orçamento</button>`:'';
 return `<h2>Material${L.length?` · ${c.chegou} de ${c.tot} chegaram`:''}</h2><p class="note" style="margin:-4px 6px 10px">Agrupado por fornecedor. Toque no estado para passar de «Por encomendar» a «Encomendado»; marque o quadrado quando chegar.</p>${matDatalist()}
 ${L.length?matGrupos(L.map(m=>({o,m}))).map(([f,list])=>matGrupoHtml(f,list,false)).join(''):`<div class="grp"><div class="empty">${o.orc?'Ainda sem lista de material. Crie-a a partir do orçamento desta obra.':'Ainda sem material nesta obra.'}</div></div>`}
 ${fromQuote}<button type="button" class="btn alt" data-mat="add" data-o="${esc(o.id)}">Adicionar material</button>`;
}
// Vista geral: material de todas as obras em curso que ainda não chegou.
function vMaterial(){
 const tudo=V.matAll==='1',list=[];
 for(const o of S.obras)if(o.status!=='concluida')for(const m of o.material||[])if(tudo||m.estado!=='chegou')list.push({o,m});
 const por=list.filter(x=>x.m.estado==='falta').length,enc=list.filter(x=>x.m.estado==='encomendado').length;
 return `${backHome}<h1>Material</h1><p class="sub">${list.length?`${por} por encomendar · ${enc} encomendado${enc===1?'':'s'} à espera`:'Todo o material das obras em curso já chegou.'}</p>
 <div class="chips"><button class="${tudo?'':'on'}" data-mat="vista" data-v="">Por chegar</button><button class="${tudo?'on':''}" data-mat="vista" data-v="1">Tudo</button></div>${matDatalist()}
 ${list.length?matGrupos(list).map(([f,l])=>matGrupoHtml(f,l,true)).join(''):'<div class="grp"><div class="empty">Nada por chegar. A lista de cada obra cria-se ao converter o orçamento em obra, ou na obra → Material.</div></div>'}`;
}
function matAcha(b){const o=S.obras.find(x=>x.id===b.dataset.o);return {o,m:o&&(o.material||[]).find(x=>x.id===b.dataset.id)}}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-mat]');if(!b)return;const a=b.dataset.mat;
 if(a==='vista'){V.matAll=b.dataset.v;render();return}
 if(a==='enc-todos'){for(const p of String(b.dataset.ids||'').split(',')){const [oi,mi]=p.split(':');const m=(S.obras.find(x=>x.id===oi)?.material||[]).find(x=>x.id===mi);if(m&&m.estado==='falta'){m.estado='encomendado';m.encDia=new Date().toISOString().slice(0,10)}}save();render();return}
 if(a==='add'){const o=S.obras.find(x=>x.id===b.dataset.o);if(!o)return;const m={id:uid(),desc:'Novo material',ref:'',qtd:1,un:'un.',brand:'',forn:MAT_SEM,estado:'falta'};o.material=[...(o.material||[]),m];MAT_EDIT=m.id;save();render();setTimeout(()=>{const i=document.querySelector(`[data-matf="desc"][data-id="${m.id}"]`);i?.focus();i?.select?.()},50);return}
 if(a==='do-orc'){
  const o=S.obras.find(x=>x.id===b.dataset.o);if(!o)return;
  b.disabled=true;b.textContent='A ler o orçamento…';
  try{if(quoteRows===null)await loadQuotes();const row=(quoteRows||[]).find(r=>String(r.id)===String(o.orc));if(!row)throw Error('Não encontrei o orçamento desta obra.');
   o.material=matFromQuote(row.document);if(!o.material.length)throw Error('O orçamento não tem equipamento nem material.');save()}
  catch(x){alert(x.message)}
  render();return;
 }
 const {o,m}=matAcha(b);if(!m)return;
 if(a==='chegou'){m.estado=b.checked?'chegou':(m.encDia?'encomendado':'falta');if(b.checked)m.chegouDia=new Date().toISOString().slice(0,10);save();render()}
 else if(a==='estado'){m.estado=m.estado==='falta'?'encomendado':m.estado==='encomendado'?'chegou':'falta';if(m.estado==='encomendado')m.encDia=new Date().toISOString().slice(0,10);if(m.estado==='chegou')m.chegouDia=new Date().toISOString().slice(0,10);if(m.estado==='falta')delete m.encDia;save();render()}
 else if(a==='editar'){MAT_EDIT=MAT_EDIT===m.id?null:m.id;render()}
 else if(a==='del'){if(!confirm('Eliminar «'+m.desc+'» da lista?'))return;o.material=o.material.filter(x=>x!==m);MAT_EDIT=null;save();render()}
});
document.addEventListener('change',ev=>{
 const t=ev.target;if(!t.dataset?.matf)return;const {m}=matAcha(t);if(!m)return;const k=t.dataset.matf;
 if(k==='qtd'){const n=Number(t.value);if(Number.isFinite(n)&&n>=0)m.qtd=n}
 else if(k==='forn')m.forn=t.value.trim()||MAT_SEM;
 else m[k]=t.value.trim();
 save();if(k==='forn')render();
});
