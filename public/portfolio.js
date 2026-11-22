/* Fotos das obras para as propostas («Obras perto de si»).
   Em cada obra: até 4 fotos do trabalho terminado, o tipo de trabalho, a localidade e o mês, e a autorização do cliente.
   As fotos e estes dados ficam na obra (estado da app) e numa lista publicada no servidor (/api/portfolio), que a página
   da proposta usa para mostrar obras da mesma zona. Nunca são publicados o nome nem a morada do cliente. */
let PF_MSG='',PF_BUSY=false;
const PF_URL={};
const pfOf=o=>o.port||{fotos:[],tipo:'',titulo:'',local:'',cp:'',mes:'',ok:false};
// «Rua X, 4990-062 Ponte de Lima» → código postal 4990 e localidade Ponte de Lima.
const pfFromAddress=a=>{const m=String(a||'').match(/\b(\d{4})-\d{3}\s+([^,\n]+)/);return m?{cp:m[1],local:m[2].trim()}:{cp:'',local:''}};
function pfStart(o){
 if(o.port)return;const {cp,local}=pfFromAddress(o.address);
 o.port={fotos:[],tipo:'',titulo:'',local,cp,mes:new Date().toISOString().slice(0,7),ok:false};
}
// As fotos precisam da sessão, por isso são carregadas como blob e mostradas por URL local.
function pfLoad(ids){for(const id of ids)if(!PF_URL[id]){PF_URL[id]='';API('portfolio/foto/'+id).then(r=>r.ok?r.blob():null).then(b=>{if(b){PF_URL[id]=URL.createObjectURL(b);if(V.seg==='fotos'&&idle())render()}}).catch(()=>{})}}
function pfSection(o){
 const p=pfOf(o),done=o.status==='concluida';pfLoad(p.fotos);
 const opt=(v,l)=>`<option value="${esc(v)}" ${p.tipo===v?'selected':''}>${esc(l)}</option>`;
 const live=p.ok&&done&&p.fotos.length&&p.titulo&&p.local;
 return `<h2>Fotos para as propostas</h2><p class="note" style="margin:-4px 6px 10px">Fotos do trabalho terminado. Aparecem nas propostas de clientes da mesma zona, só com o trabalho, a localidade e o mês. Nunca o nome nem a morada do cliente.</p>
 <div class="grp tpad"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${p.fotos.map((id,i)=>`<div style="position:relative">${PF_URL[id]?`<img src="${esc(PF_URL[id])}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block">`:'<div style="aspect-ratio:4/3;border-radius:10px;background:var(--line,#eee)"></div>'}<button class="mini neg" data-pf="rm" data-id="${i}" style="position:absolute;top:6px;right:6px" aria-label="Remover foto">✕</button></div>`).join('')}</div>
 ${p.fotos.length<4?`<button class="btn alt" data-pf="add" data-o="${esc(o.id)}" ${PF_BUSY?'disabled':''} style="margin-top:${p.fotos.length?10:0}px">${ic('cam')}${p.fotos.length?'Adicionar outra foto':'Adicionar fotos da obra'}</button>`:''}</div>
 <div class="fld"><label><span>Tipo de trabalho</span><select data-pff="tipo">${opt('','Escolher…')}${TOPICS.filter(t=>t!=='Geral / outros').map(t=>opt(t,t)).join('')}${opt('Geral / outros','Outro')}</select></label>
 <label><span>Título mostrado</span><input data-pff="titulo" value="${esc(p.titulo)}" maxlength="80" placeholder="Ex.: Ar condicionado em moradia"></label>
 <label><span>Localidade</span><input data-pff="local" value="${esc(p.local)}" maxlength="60" placeholder="Ex.: Ponte de Lima"></label>
 <label><span>Código postal (4 dígitos)</span><input data-pff="cp" value="${esc(p.cp)}" maxlength="4" inputmode="numeric" placeholder="4990"></label>
 <label><span>Mês da obra</span><input type="month" data-pff="mes" value="${esc(p.mes)}"></label></div>
 <label class="row kv" style="gap:10px;cursor:pointer"><input type="checkbox" data-pff="ok" ${p.ok?'checked':''} style="width:22px;height:22px;flex:none"><div class="rt"><b>O cliente autorizou mostrar estas fotos</b><span>Peça autorização antes. Sem ela, as fotos não aparecem em lado nenhum.</span></div></label>
 <p class="note" role="status">${esc(PF_MSG)||(live?'Visível nas propostas de clientes desta zona.':!p.fotos.length?'':!done?'Só aparece nas propostas quando a obra estiver concluída.':!p.ok?'Ainda não aparece: falta a autorização do cliente.':'Ainda não aparece: indique o título e a localidade.')}</p>
 <button class="btn" data-pf="save" data-o="${esc(o.id)}" ${PF_BUSY?'disabled':''}>${PF_BUSY?'A guardar…':'Guardar'}</button>`;
}
// Lista publicada: só dados que podem ser vistos pelo cliente; «ok» só quando a obra está concluída.
const pfPublic=()=>S.obras.filter(o=>o.port?.fotos?.length).map(o=>({id:o.id,tipo:o.port.tipo,titulo:o.port.titulo,local:o.port.local,cp:o.port.cp,mes:o.port.mes,fotos:o.port.fotos,ok:Boolean(o.port.ok&&o.status==='concluida')}));
async function pfPublish(){const r=await API('portfolio',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({portfolio:pfPublic()})});if(!r.ok)throw new Error('Não foi possível publicar. Verifique a ligação e toque em Guardar.')}
const pfObra=()=>S.obras.find(o=>o.id===V.obra);
document.addEventListener('input',ev=>{
 const t=ev.target,o=V.tab&&pfObra();if(!t.dataset?.pff||!o)return;pfStart(o);
 const k=t.dataset.pff;o.port[k]=k==='ok'?t.checked:k==='cp'?t.value.replace(/\D/g,'').slice(0,4):t.value;
});
document.addEventListener('change',ev=>{const t=ev.target,o=pfObra();if(t.dataset?.pff&&o){pfStart(o);const k=t.dataset.pff;o.port[k]=k==='ok'?t.checked:t.value}});
const pfPick=()=>new Promise(res=>{const f=document.createElement('input');f.type='file';f.accept='image/*';f.multiple=true;f.onchange=()=>res([...f.files]);f.click()});
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-pf]'),o=pfObra();if(!b||!o)return;pfStart(o);const a=b.dataset.pf;
 if(a==='rm'){o.port.fotos.splice(+b.dataset.id,1);PF_MSG='Foto retirada. Toque em Guardar.'}
 else if(a==='add'){
  const files=(await pfPick()).slice(0,4-o.port.fotos.length);if(!files.length)return;
  PF_BUSY=true;PF_MSG='A enviar '+(files.length>1?files.length+' fotos':'a foto')+'…';render();
  try{for(const f of files){const [blob]=await toImages(f),id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    const r=await API('portfolio/foto/'+id,{method:'PUT',headers:{'content-type':'image/jpeg'},body:blob});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Não foi possível enviar a foto.');
    PF_URL[id]=URL.createObjectURL(blob);o.port.fotos.push(id)}
   save();await pfPublish();PF_MSG='Fotos guardadas.'}
  catch(e){PF_MSG=e.message||'Não foi possível enviar a foto.'}
  PF_BUSY=false;
 }
 else if(a==='save'){
  PF_BUSY=true;PF_MSG='';render();
  try{save();await pfPublish();PF_MSG=o.port.ok&&o.status==='concluida'&&o.port.titulo&&o.port.local&&o.port.fotos.length?'Guardado. Já aparece nas propostas de clientes desta zona.':'Guardado.'}
  catch(e){PF_MSG=e.message}
  PF_BUSY=false;
 }
 else return;
 render();
});
