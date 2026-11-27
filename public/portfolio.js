/* Fotos das obras para o site e para as propostas («Obras perto de si»).
   Cada obra pode ter várias categorias (ex.: ar condicionado, bomba de calor AQS, UPAC), cada uma com as suas fotos,
   e partilha a localidade, o mês, a descrição e a autorização do cliente.
   - Obras da app: os dados ficam na obra (o.port, estado da app) e só aparecem quando a obra está concluída.
   - Obras só para o site (separador «Fotos para o site»): ficam apenas na lista publicada no servidor.
   A lista publicada (/api/portfolio) tem uma entrada por categoria. Nunca o nome nem a morada do cliente. */
let PF_MSG='',PF_BUSY=false,PF_SOLO=null,PF_SOLO_ERR='',PF_LOADING=false;
const PF_URL={},PF_MAX=8;
// «Rua X, 4990-062 Ponte de Lima» → código postal 4990 e localidade Ponte de Lima.
const pfFromAddress=a=>{const m=String(a||'').match(/\b(\d{4})-\d{3}\s+([^,\n]+)/);return m?{cp:m[1],local:m[2].trim()}:{cp:'',local:''}};
const pfNew=(local='',cp='')=>({cats:[],local,cp,mes:new Date().toISOString().slice(0,7),descricao:'',ok:false});
// Formato antigo (uma só categoria: fotos, tipo e título na obra) → lista de categorias.
function pfNorm(p){
 if(!p)return p;
 if(!Array.isArray(p.cats)){p.cats=p.fotos?.length||p.tipo?[{tipo:p.tipo||'Geral / outros',titulo:p.titulo||'',fotos:p.fotos||[]}]:[];delete p.fotos;delete p.tipo;delete p.titulo}
 if(p.descricao==null)p.descricao='';return p;
}
const pfOf=o=>pfNorm(o.port)||pfNew();
function pfStart(o){if(o.port)return pfNorm(o.port);const {cp,local}=pfFromAddress(o.address);return o.port=pfNew(local,cp)}
const pfHas=p=>Boolean(pfNorm(p)?.cats?.some(c=>c.fotos.length));
const pfTypes=()=>[...TOPICS.filter(t=>t!=='Geral / outros'),'Geral / outros'];
const pfLabel=t=>t==='Geral / outros'?'Outro':t;
const pfTitle=(c,p)=>c.titulo||((c.tipo==='Geral / outros'?'Obra':c.tipo)+(p.local?' em '+p.local:''));
// As fotos precisam da sessão, por isso são carregadas como blob e mostradas por URL local.
function pfLoad(ids){for(const id of ids)if(!PF_URL[id]){PF_URL[id]='';API('portfolio/foto/'+id).then(r=>r.ok?r.blob():null).then(b=>{if(b){PF_URL[id]=URL.createObjectURL(b);if((V.seg==='fotos'||V.tab==='site')&&idle())render()}}).catch(()=>{})}}
const pfImg=id=>PF_URL[id]?`<img src="${esc(PF_URL[id])}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block">`:'<div style="aspect-ratio:4/3;border-radius:10px;background:var(--line,#eee)"></div>';

// Editor comum: k = «o» (obra aberta) ou «s:<id>» (obra só para o site).
function pfEditor(p,k,status){
 p.cats.forEach(c=>pfLoad(c.fotos));
 const on=new Set(p.cats.map(c=>c.tipo));
 return `<div data-pfk="${esc(k)}">
 <h2>Categorias da obra</h2><p class="note" style="margin:-4px 6px 10px">Escolha uma ou mais. Cada categoria tem as suas fotos.</p>
 <div class="chips" style="flex-wrap:wrap">${pfTypes().map(t=>`<button type="button" class="${on.has(t)?'on':''}" data-pf="cat" data-t="${esc(t)}" aria-pressed="${on.has(t)}">${esc(pfLabel(t))}</button>`).join('')}</div>
 ${p.cats.map((c,ci)=>`<h2>${esc(pfLabel(c.tipo))}</h2><div class="grp tpad">
  <div class="fld" style="margin:0 0 10px"><label><span>Título mostrado</span><input data-pfc="titulo" data-c="${ci}" value="${esc(c.titulo)}" maxlength="80" placeholder="${esc(pfTitle({...c,titulo:''},p))}"></label></div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${c.fotos.map((id,i)=>`<div style="position:relative">${pfImg(id)}<button class="mini neg" data-pf="rm" data-c="${ci}" data-id="${i}" style="position:absolute;top:6px;right:6px" aria-label="Remover foto">✕</button></div>`).join('')}</div>
  ${c.fotos.length<PF_MAX?`<button class="btn alt" data-pf="add" data-c="${ci}" ${PF_BUSY?'disabled':''} style="margin-top:${c.fotos.length?10:0}px">${ic('cam')}${c.fotos.length?'Adicionar outra foto':'Adicionar fotos'}</button>`:''}
 </div>`).join('')}
 <h2>Dados da obra</h2>
 <div class="fld"><label><span>Localidade</span><input data-pff="local" value="${esc(p.local)}" maxlength="60" placeholder="Ex.: Ponte de Lima"></label>
 <label><span>Código postal (4 dígitos)</span><input data-pff="cp" value="${esc(p.cp)}" maxlength="4" inputmode="numeric" placeholder="4990"></label>
 <label><span>Mês da obra</span><input type="month" data-pff="mes" value="${esc(p.mes)}"></label>
 <label><span>Descrição (opcional)</span><textarea data-pff="descricao" maxlength="400" rows="3" placeholder="Ex.: Multisplit com 3 unidades murais e bomba de calor de 200 L para águas quentes.">${esc(p.descricao)}</textarea></label></div>
 <label class="row kv" style="gap:10px;cursor:pointer"><input type="checkbox" data-pff="ok" ${p.ok?'checked':''} style="width:22px;height:22px;flex:none"><div class="rt"><b>O cliente autorizou mostrar estas fotos</b><span>Peça autorização antes. Sem ela, as fotos não aparecem em lado nenhum.</span></div></label>
 <p class="note" role="status">${esc(PF_MSG)||status}</p>
 <button class="btn" data-pf="save" ${PF_BUSY?'disabled':''}>${PF_BUSY?'A guardar…':'Guardar'}</button>
 ${typeof igSection==='function'?igSection(p,k):''}
 ${k.startsWith('s:')?`<button class="btn alt neg" data-pf="dels" ${PF_BUSY?'disabled':''} style="margin-top:10px">Eliminar esta obra do site</button>`:''}
 </div>`;
}
const pfStatus=(p,done)=>!pfHas(p)?'':done===false?'Só aparece quando a obra estiver concluída.':!p.ok?'Ainda não aparece: falta a autorização do cliente.':!p.local?'Ainda não aparece: indique a localidade.':'Visível no site e nas propostas de clientes desta zona.';
function pfSection(o){
 const p=pfOf(o);
 return `<h2>Fotos para o site e as propostas</h2><p class="note" style="margin:-4px 6px 10px">Fotos do trabalho terminado. Aparecem no site e nas propostas de clientes da mesma zona, só com o trabalho, a localidade e o mês. Nunca o nome nem a morada do cliente.</p>${pfEditor(p,'o',pfStatus(p,o.status==='concluida'))}`;
}

// ---- Obras só para o site ----
async function pfSoloLoad(){
 if(PF_LOADING)return;PF_LOADING=true;PF_SOLO_ERR='';
 try{
  const r=await API('portfolio');if(!r.ok)throw 0;const {portfolio}=await r.json(),g=new Map();
  for(const w of portfolio||[]){if(!w.solo)continue;let x=g.get(w.grupo);if(!x)g.set(w.grupo,x={id:w.grupo,local:w.local,cp:w.cp,mes:w.mes,descricao:w.descricao||'',ok:w.ok,cats:[]});x.cats.push({tipo:w.tipo||'Geral / outros',titulo:w.titulo===pfTitle({tipo:w.tipo,titulo:''},w)?'':w.titulo,fotos:w.fotos})}
  // As obras ainda por guardar (sem fotos) mantêm-se.
  PF_SOLO=[...g.values(),...(PF_SOLO||[]).filter(w=>!g.has(w.id)&&!pfHas(w))];
 }catch{PF_SOLO_ERR='Sem ligação ao servidor. As obras do site aparecem quando houver internet.'}
 PF_LOADING=false;if(V.tab==='site'&&idle())render();
}
function vSite(){
 if(PF_SOLO===null&&!PF_LOADING&&!PF_SOLO_ERR)pfSoloLoad();
 const back=`<button class="back" data-a="tab" data-id="obras">${ic('back')}Obras</button>`;
 const w=V.pfs&&(PF_SOLO||[]).find(x=>x.id===V.pfs);
 if(w)return `<button class="back" data-pf="list">${ic('back')}Fotos para o site</button><h1>${esc(w.cats[0]?pfTitle(w.cats[0],w):'Nova obra')}</h1>${pfEditor(w,'s:'+w.id,pfStatus(w))}`;
 const fromApp=S.obras.filter(o=>pfHas(o.port));
 const row=(id,img,t,s,attrs)=>`<button class="row invoice-row" ${attrs}><div class="av" style="overflow:hidden;padding:0">${id&&PF_URL[id]?`<img src="${esc(PF_URL[id])}" alt="" style="width:100%;height:100%;object-fit:cover">`:img}</div><div class="rt"><b>${esc(t)}</b><span>${esc(s)}</span></div><div class="rr">${ic('chev')}</div></button>`;
 const solo=PF_SOLO||[];solo.forEach(x=>pfLoad(x.cats.flatMap(c=>c.fotos).slice(0,1)));fromApp.forEach(o=>pfLoad(pfOf(o).cats.flatMap(c=>c.fotos).slice(0,1)));
 const sub=p=>[p.cats.map(c=>pfLabel(c.tipo)).join(', '),p.local,!p.ok?'sem autorização':''].filter(Boolean).join(' · ');
 return `${back}<h1>Fotos para o site</h1><p class="note" style="margin:-4px 6px 12px">Obras para mostrar no site e nas propostas, sem precisar de criar a obra na app. Escolha as categorias, junte as fotos e uma descrição.</p>
 <button class="btn" data-pf="new" ${PF_BUSY?'disabled':''}>${ic('cam')}Nova obra para o site</button>
 <h2>Obras só para o site</h2><div class="grp">${PF_SOLO===null?`<div class="empty">${esc(PF_SOLO_ERR||'A carregar…')}</div>`:solo.length?solo.map(x=>row(x.cats.flatMap(c=>c.fotos)[0],ic('cam'),x.cats[0]?pfTitle(x.cats[0],x):'Nova obra',sub(x)||'Sem fotos',`data-pf="opens" data-id="${esc(x.id)}"`)).join(''):'<div class="empty">Ainda não há obras só para o site.</div>'}</div>
 ${fromApp.length?`<h2>Obras da app com fotos</h2><div class="grp">${fromApp.map(o=>{const p=pfOf(o);return row(p.cats.flatMap(c=>c.fotos)[0],ic('obras'),o.name,sub(p)+(o.status!=='concluida'?' · por concluir':''),`data-a="open" data-id="${esc(o.id)}" data-s="fotos"`)}).join('')}</div>`:''}`;
}

// Lista publicada: só dados que podem ser vistos pelo cliente; numa obra da app, «ok» só quando está concluída.
const pfEntries=(p,id,ok,solo)=>pfNorm(p).cats.filter(c=>c.fotos.length).map((c,i)=>({id:id+'-'+i,grupo:id,solo,tipo:c.tipo,titulo:pfTitle(c,p),descricao:p.descricao||'',local:p.local,cp:p.cp,mes:p.mes,fotos:c.fotos,ok}));
const pfPublic=()=>[...S.obras.filter(o=>pfHas(o.port)).flatMap(o=>pfEntries(o.port,o.id,Boolean(o.port.ok&&o.status==='concluida'),false)),...(PF_SOLO||[]).flatMap(w=>pfEntries(w,w.id,Boolean(w.ok),true))];
async function pfPublish(){
 // Sem a lista das obras só para o site não se publica: apagaria essas obras e as fotos.
 if(PF_SOLO===null)await pfSoloLoad();
 if(PF_SOLO===null)throw new Error('Sem ligação ao servidor. Tente de novo e toque em Guardar.');
 const r=await API('portfolio',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({portfolio:pfPublic()})});if(!r.ok)throw new Error('Não foi possível publicar. Verifique a ligação e toque em Guardar.')
}
const pfObra=()=>S.obras.find(o=>o.id===V.obra);
// Obra a que pertence o campo ou botão: a obra aberta («o») ou uma obra só para o site («s:<id>»).
function pfTarget(el){
 const k=el.closest('[data-pfk]')?.dataset.pfk;if(!k)return null;
 if(k==='o'){const o=pfObra();return o?{p:pfStart(o),obra:o}:null}
 const w=(PF_SOLO||[]).find(x=>x.id===k.slice(2));return w?{p:w,obra:null}:null;
}
function pfField(t){
 const x=pfTarget(t);if(!x)return;
 if(t.dataset.pfc){const c=x.p.cats[+t.dataset.c];if(c)c.titulo=t.value;return}
 const k=t.dataset.pff;x.p[k]=k==='ok'?t.checked:k==='cp'?t.value.replace(/\D/g,'').slice(0,4):t.value;
}
document.addEventListener('input',ev=>{if(ev.target.dataset?.pff||ev.target.dataset?.pfc)pfField(ev.target)});
document.addEventListener('change',ev=>{if(ev.target.dataset?.pff||ev.target.dataset?.pfc)pfField(ev.target)});
const pfPick=()=>new Promise(res=>{const f=document.createElement('input');f.type='file';f.accept='image/*';f.multiple=true;f.onchange=()=>res([...f.files]);f.click()});
async function pfSave(x,msg){PF_BUSY=true;render();try{if(x.obra)save();await pfPublish();PF_MSG=msg}catch(e){PF_MSG=e.message||'Não foi possível guardar.'}PF_BUSY=false}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-pf]');if(!b)return;const a=b.dataset.pf;
 if(a==='list'){V.pfs='';PF_MSG='';window.scrollTo(0,0);render();return}
 if(a==='opens'){V.pfs=b.dataset.id;PF_MSG='';window.scrollTo(0,0);render();return}
 if(a==='new'){if(PF_SOLO===null)await pfSoloLoad();if(PF_SOLO===null){alert(PF_SOLO_ERR);return}const w={id:'s'+uid(),...pfNew(),ok:false};PF_SOLO.unshift(w);V.pfs=w.id;PF_MSG='';window.scrollTo(0,0);render();return}
 const x=pfTarget(b);if(!x)return;const p=x.p;
 if(a==='cat'){
  const t=b.dataset.t,i=p.cats.findIndex(c=>c.tipo===t);
  if(i<0)p.cats.push({tipo:t,titulo:'',fotos:[]});
  else{if(p.cats[i].fotos.length&&!confirm('Retirar «'+pfLabel(t)+'» e as suas fotos?'))return;p.cats.splice(i,1);if(pfHas(p)||x.obra)PF_MSG='Categoria retirada. Toque em Guardar.'}
 }
 else if(a==='rm'){p.cats[+b.dataset.c]?.fotos.splice(+b.dataset.id,1);PF_MSG='Foto retirada. Toque em Guardar.'}
 else if(a==='add'){
  const c=p.cats[+b.dataset.c];if(!c)return;
  const files=(await pfPick()).slice(0,PF_MAX-c.fotos.length);if(!files.length)return;
  PF_BUSY=true;PF_MSG='A enviar '+(files.length>1?files.length+' fotos':'a foto')+'…';render();
  try{for(const f of files){const [blob]=await toImages(f),id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    const r=await API('portfolio/foto/'+id,{method:'PUT',headers:{'content-type':'image/jpeg'},body:blob});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Não foi possível enviar a foto.');
    PF_URL[id]=URL.createObjectURL(blob);c.fotos.push(id)}
   if(x.obra)save();await pfPublish();PF_MSG='Fotos guardadas.'}
  catch(e){PF_MSG=e.message||'Não foi possível enviar a foto.'}
  PF_BUSY=false;
 }
 else if(a==='save')await pfSave(x,p.ok&&p.local&&pfHas(p)&&(!x.obra||x.obra.status==='concluida')?'Guardado. Já aparece no site e nas propostas.':'Guardado.');
 else if(a==='dels'){
  if(!confirm('Eliminar esta obra do site e as suas fotos?'))return;
  PF_SOLO=PF_SOLO.filter(w=>w!==p);V.pfs='';await pfSave(x,'Obra eliminada do site.');
 }
 else return;
 render();
});
