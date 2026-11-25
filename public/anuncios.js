/* Anúncios / promoções para o site (separador «Anúncios»).
   Cada anúncio tem título, descrição, preço (e preço antes, opcional), validade, fotos (normalmente 1, até 6) e
   «Mostrar no site». A lista fica só no servidor (/api/promocoes) e o site mostra os ativos em destaque, na secção «Promoções». */
let AN_LIST=null,AN_ERR='',AN_LOADING=false,AN_BUSY=false,AN_MSG='';
const AN_URL={},AN_MAX=6;
const anToday=()=>new Date().toISOString().slice(0,10);
// Estado mostrado na lista e no editor.
const anState=p=>!p.ativo?'Oculto':!p.titulo?'Falta o título':!p.fotos.length?'Falta a foto':p.ate&&p.ate<anToday()?'Terminou a '+fd(p.ate):'Visível no site';
const anVisible=p=>anState(p)==='Visível no site';
// As fotos precisam da sessão, por isso são carregadas como blob e mostradas por URL local.
function anLoad(ids){for(const id of ids)if(!AN_URL[id]){AN_URL[id]='';API('promocoes/foto/'+id).then(r=>r.ok?r.blob():null).then(b=>{if(b){AN_URL[id]=URL.createObjectURL(b);if(V.tab==='anu'&&idle())render()}}).catch(()=>{})}}
const anImg=(id,h='4/3')=>AN_URL[id]?`<img src="${esc(AN_URL[id])}" alt="" style="width:100%;aspect-ratio:${h};object-fit:cover;border-radius:12px;display:block">`:`<div style="aspect-ratio:${h};border-radius:12px;background:var(--chip)"></div>`;
async function anFetch(){
 if(AN_LOADING)return;AN_LOADING=true;AN_ERR='';
 try{const r=await API('promocoes');if(!r.ok)throw 0;const {promocoes}=await r.json();
  // Os anúncios novos ainda por guardar mantêm-se.
  AN_LIST=[...(promocoes||[]),...(AN_LIST||[]).filter(p=>p.novo&&!(promocoes||[]).some(x=>x.id===p.id))]}
 catch{AN_ERR='Sem ligação ao servidor. Os anúncios aparecem quando houver internet.'}
 AN_LOADING=false;if(V.tab==='anu'&&idle())render();
}
async function anPublish(){
 if(AN_LIST===null)await anFetch();
 if(AN_LIST===null)throw new Error('Sem ligação ao servidor. Tente de novo.');
 const body=AN_LIST.map(({novo,...p})=>p);
 const r=await API('promocoes',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({promocoes:body})});
 if(!r.ok)throw new Error('Não foi possível guardar. Verifique a ligação e toque em Guardar.');
 AN_LIST.forEach(p=>delete p.novo);
}
function vAnuncios(){
 if(AN_LIST===null&&!AN_LOADING&&!AN_ERR)anFetch();
 const p=V.anu&&(AN_LIST||[]).find(x=>x.id===V.anu);
 if(p){
  anLoad(p.fotos);
  return `<button class="back" data-an="list">${ic('back')}Anúncios</button><h1>${esc(p.titulo||'Novo anúncio')}</h1>
  <p class="note" style="margin:-6px 6px 12px">${esc(anState(p))}${anVisible(p)?' · aparece em destaque na secção «Promoções» do site.':''}</p>
  <h2>Fotos</h2><div class="grp tpad">
   <div style="display:grid;grid-template-columns:repeat(${p.fotos.length>1?2:1},1fr);gap:8px">${p.fotos.map((id,i)=>`<div style="position:relative">${anImg(id)}<button class="mini neg" data-an="rm" data-id="${i}" style="position:absolute;top:6px;right:6px" aria-label="Remover foto">✕</button>${i===0&&p.fotos.length>1?'<span class="note" style="position:absolute;left:8px;bottom:6px;margin:0;background:rgba(0,0,0,.55);color:#fff;border-radius:8px;padding:2px 8px">Principal</span>':''}</div>`).join('')}</div>
   ${p.fotos.length<AN_MAX?`<button class="btn alt" data-an="add" ${AN_BUSY?'disabled':''} style="margin-top:${p.fotos.length?10:0}px">${ic('cam')}${p.fotos.length?'Adicionar outra foto':'Adicionar foto'}</button>`:''}
   <p class="note">Normalmente basta uma. A primeira é a que aparece no site; as outras veem-se ao tocar.</p>
  </div>
  <h2>Anúncio</h2>
  <div class="grp tpad an-form"><label><span>Título</span><input data-anf="titulo" value="${esc(p.titulo)}" maxlength="80" placeholder="Ex.: Ar condicionado Daikin 2,5 kW instalado"></label>
  <label><span>Descrição</span><textarea data-anf="descricao" maxlength="700" rows="5" placeholder="Ex.: Inclui equipamento, 3 metros de tubagem e instalação certificada. Garantia de 3 anos.">${esc(p.descricao)}</textarea></label>
  <label><span>Preço da promoção (opcional)</span><input data-anf="preco" value="${esc(p.preco)}" maxlength="30" placeholder="Ex.: 899 €"></label>
  <label><span>Preço antes (opcional, aparece riscado no site)</span><input data-anf="precoAntes" value="${esc(p.precoAntes)}" maxlength="30" placeholder="Ex.: 1 099 €"></label>
  <label><span>Válido até (opcional)</span><input type="date" data-anf="ate" value="${esc(p.ate)}"></label></div>
  <label class="row kv" style="gap:10px;cursor:pointer"><input type="checkbox" data-anf="ativo" ${p.ativo?'checked':''} style="width:22px;height:22px;flex:none"><div class="rt"><b>Mostrar no site</b><span>Desligue para esconder sem apagar. Depois da data de validade sai sozinho.</span></div></label>
  <p class="note" role="status">${esc(AN_MSG)}</p>
  <button class="btn" data-an="save" ${AN_BUSY?'disabled':''}>${AN_BUSY?'A guardar…':'Guardar'}</button>
  <button class="btn alt neg" data-an="del" ${AN_BUSY?'disabled':''} style="margin-top:10px">Eliminar anúncio</button>`;
 }
 const list=AN_LIST||[];list.forEach(x=>anLoad(x.fotos.slice(0,1)));
 const row=x=>`<button class="row invoice-row" data-an="open" data-id="${esc(x.id)}"><div class="av" style="overflow:hidden;padding:0">${x.fotos[0]&&AN_URL[x.fotos[0]]?`<img src="${esc(AN_URL[x.fotos[0]])}" alt="" style="width:100%;height:100%;object-fit:cover">`:ic('cam')}</div><div class="rt"><b>${esc(x.titulo||'Novo anúncio')}</b><span>${esc([x.preco,anState(x)].filter(Boolean).join(' · '))}</span></div><div class="rr">${anVisible(x)?'<span class="lead-badge" style="--lc:var(--green)">No site</span>':ic('chev')}</div></button>`;
 const on=list.filter(anVisible),off=list.filter(x=>!anVisible(x));
 return `<h1>Anúncios</h1><p class="sub" style="margin:-6px 4px 14px">Promoções em destaque no site. Junte uma foto e uma descrição; aparecem logo na secção «Promoções».</p>
 <button class="btn" data-an="new" ${AN_BUSY?'disabled':''}>${ic('cam')}Novo anúncio</button>
 ${AN_LIST===null?`<div class="grp" style="margin-top:14px"><div class="empty">${esc(AN_ERR||'A carregar…')}</div></div>`:
 !list.length?`<div class="grp" style="margin-top:14px"><div class="empty">Ainda não há anúncios. Toque em «Novo anúncio» para criar o primeiro.</div></div>`:
 `${on.length?`<h2>No site (${on.length})</h2><div class="grp">${on.map(row).join('')}</div>`:''}${off.length?`<h2>Fora do site (${off.length})</h2><div class="grp">${off.map(row).join('')}</div>`:''}`}`;
}
function anField(t){const p=(AN_LIST||[]).find(x=>x.id===V.anu);if(!p)return;const k=t.dataset.anf;p[k]=k==='ativo'?t.checked:t.value}
document.addEventListener('input',ev=>{if(ev.target.dataset?.anf)anField(ev.target)});
document.addEventListener('change',ev=>{if(ev.target.dataset?.anf)anField(ev.target)});
const anPick=()=>new Promise(res=>{const f=document.createElement('input');f.type='file';f.accept='image/*';f.multiple=true;f.onchange=()=>res([...f.files]);f.click()});
async function anSave(msg){AN_BUSY=true;render();try{await anPublish();AN_MSG=msg}catch(e){AN_MSG=e.message||'Não foi possível guardar.'}AN_BUSY=false}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-an]');if(!b)return;const a=b.dataset.an;
 if(a==='list'){V.anu='';AN_MSG='';window.scrollTo(0,0);render();return}
 if(a==='open'){V.anu=b.dataset.id;AN_MSG='';window.scrollTo(0,0);render();return}
 if(a==='new'){
  if(AN_LIST===null)await anFetch();if(AN_LIST===null){alert(AN_ERR);return}
  const p={id:'a'+uid(),titulo:'',descricao:'',preco:'',precoAntes:'',ate:'',ativo:true,fotos:[],criado:Date.now(),novo:true};
  AN_LIST.unshift(p);V.anu=p.id;AN_MSG='';window.scrollTo(0,0);render();return;
 }
 const p=(AN_LIST||[]).find(x=>x.id===V.anu);if(!p)return;
 if(a==='rm'){p.fotos.splice(+b.dataset.id,1);AN_MSG='Foto retirada. Toque em Guardar.'}
 else if(a==='add'){
  const files=(await anPick()).slice(0,AN_MAX-p.fotos.length);if(!files.length)return;
  AN_BUSY=true;AN_MSG='A enviar '+(files.length>1?files.length+' fotos':'a foto')+'…';render();
  try{for(const f of files){const [blob]=await toImages(f),id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    const r=await API('promocoes/foto/'+id,{method:'PUT',headers:{'content-type':'image/jpeg'},body:blob});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Não foi possível enviar a foto.');
    AN_URL[id]=URL.createObjectURL(blob);p.fotos.push(id)}
   await anPublish();AN_MSG=anVisible(p)?'Foto guardada. Já aparece no site.':'Foto guardada.'}
  catch(e){AN_MSG=e.message||'Não foi possível enviar a foto.'}
  AN_BUSY=false;
 }
 else if(a==='save')await anSave(anVisible(p)?'Guardado. Já aparece no site.':'Guardado. '+anState(p)+'.');
 else if(a==='del'){
  if(!confirm('Eliminar este anúncio e as suas fotos?'))return;
  AN_LIST=AN_LIST.filter(x=>x!==p);V.anu='';await anSave('Anúncio eliminado.');
 }
 else return;
 render();
});
