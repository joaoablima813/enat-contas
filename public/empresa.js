/* Ecrã Empresa (Definições): o que o cliente vê na página da proposta antes do preço.
   Pessoa de contacto, apresentação, credenciais, garantias, opiniões do Google, o que está sempre incluído e as
   semanas livres para instalação (preenchidas à mão, depois de confirmar com as equipas).
   Guardado no servidor (/api/empresa) e numa cópia local, usada também no PDF e na mensagem do WhatsApp. */
let EMP=null,EMP_MSG='',EMP_BUSY=false;
const EMP_PREVIEW={};
try{globalThis.ENAT_EMPRESA=JSON.parse(localStorage.getItem('enat-empresa')||'null')||null}catch(e){}
const empKeep=e=>{globalThis.ENAT_EMPRESA=e;try{localStorage.setItem('enat-empresa',JSON.stringify(e))}catch(x){}};
// Lido do servidor ao abrir o ecrã e antes de enviar um orçamento, para o PDF usar sempre os dados atuais.
async function empresaLoad(){const r=await API('empresa');if(!r.ok)throw new Error('Sem ligação ao servidor.');const {empresa}=await r.json();if(empresa)empKeep(empresa);return empresa}
const empBlank=()=>({contacto:{nome:'João Lima',cargo:'Responsável comercial',telefone:'',foto:''},apresentacao:'',instalacao:'',posVenda:'',anos:'',instalacoes:'',equipaFoto:'',nif:'',morada:'',email:'pontedelima@enat.pt',site:'',
 credenciais:EnatSolucoes.CREDENTIALS.map(nome=>({nome,numero:''})),garantiaEquip:'3 anos',garantiaInst:'2 anos',google:{nota:'',total:'',link:''},incluido:[...EnatSolucoes.INCLUDED],semanas:[]});
function empStart(){
 if(EMP)return;EMP=structuredClone(globalThis.ENAT_EMPRESA||empBlank());EMP_MSG='A carregar…';
 empresaLoad().then(e=>{EMP=structuredClone(e||globalThis.ENAT_EMPRESA||empBlank());EMP_MSG=''}).catch(e=>{EMP_MSG=e.message}).finally(()=>{if(V.tab==='emp'&&idle())render()});
}
const empImg=id=>EMP_PREVIEW[id]||(id?'/proposta/empresa/img/'+encodeURIComponent(id):'');
const empIn=(path,label,ph='',type='text',extra='')=>{const v=path.split('.').reduce((o,k)=>o?.[k],EMP)??'';return `<label><span>${label}</span><input data-emp="${path}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" ${extra}></label>`};
const empArea=(path,ph,rows=3)=>`<div class="fld"><textarea data-emp="${path}" rows="${rows}" placeholder="${esc(ph)}" style="width:100%;border:0;background:none;padding:12px 14px;font:inherit;resize:vertical;outline:0">${esc(path.split('.').reduce((o,k)=>o?.[k],EMP)||'')}</textarea></div>`;
const empPhoto=(field,label,round)=>{const id=field==='contacto'?EMP.contacto.foto:EMP.equipaFoto,src=empImg(id);return `<div class="row kv">${src?`<img src="${esc(src)}" alt="" style="width:${round?56:88}px;height:56px;object-fit:cover;border-radius:${round?'50%':'10px'};flex:none">`:`<div class="av">${ic('cam')}</div>`}<div class="rt"><b>${label}</b><span>${src?'Foto escolhida':'Sem foto'}</span></div><div class="rr"><button class="mini" style="color:var(--blue)" data-ea="foto" data-id="${field}">${src?'Trocar':'Escolher'}</button>${src?`<button class="mini neg" data-ea="semfoto" data-id="${field}">Remover</button>`:''}</div></div>`};
function vEmp(){
 empStart();const e=EMP,done=S.obras.filter(o=>o.status==='concluida').length,weeks=e.semanas||[];
 return `<button class="back" data-a="tab" data-id="def">${ic('back')}Definições</button><h1>Empresa</h1>
 <p class="note" style="margin:-6px 6px 14px">É o que o cliente vê na proposta antes do preço, para confiar em quem não conhece. Só aparece o que preencher: deixe em branco o que não tem. Nunca indique credenciais, números ou opiniões que não possa comprovar.</p>
 ${EMP_MSG?`<p class="note" role="status">${esc(EMP_MSG)}</p>`:''}
 <h2>Pessoa de contacto</h2><div class="grp">${empPhoto('contacto','Foto da pessoa de contacto',true)}</div><div class="fld" style="margin-top:10px">${empIn('contacto.nome','Nome','João Lima')}${empIn('contacto.cargo','Cargo','Responsável comercial')}${empIn('contacto.telefone','Telemóvel (WhatsApp)','912 345 678','tel','inputmode="tel"')}</div>
 <p class="note">Com o telemóvel, a proposta mostra os botões WhatsApp e Ligar. Uma foto real aumenta muito a confiança.</p>
 <h2>Dados no orçamento (PDF)</h2><div class="fld">${empIn('nif','NIF','Ex.: 512345678','text','inputmode="numeric"')}${empIn('morada','Morada','Ex.: Rua …, 4990-000 Ponte de Lima')}${empIn('email','Email','pontedelima@enat.pt','email')}${empIn('site','Site','Ex.: enat.pt')}</div>
 <p class="note">Aparecem no cabeçalho e no rodapé do PDF, como em qualquer documento comercial.</p>
 <h2>Quem somos</h2>${empArea('apresentacao','Ex.: Somos a Enat de Ponte de Lima. Instalamos climatização, bombas de calor e painéis solares no Alto Minho, com acompanhamento do início ao fim.')}
 <div class="fld">${empIn('anos','Anos de experiência','Ex.: 10','text','inputmode="numeric"')}${empIn('instalacoes','Instalações feitas','Ex.: 250','text','inputmode="numeric"')}</div><p class="note">Na app há ${done} obra${done===1?'':'s'} concluída${done===1?'':'s'}. Pode indicar o total real, incluindo obras anteriores à app.</p>
 <h2>Credenciais</h2><p class="note" style="margin:-4px 6px 10px">Só aparecem as que tiverem o número ou a referência preenchidos (ex.: n.º do certificado, seguradora e capital).</p>
 ${(e.credenciais||[]).map((c,i)=>`<div class="fld"><label><span>Credencial</span><input data-emp-cred="${i}" data-f="nome" value="${esc(c.nome)}"></label><label><span>N.º / referência</span><input data-emp-cred="${i}" data-f="numero" value="${esc(c.numero)}" placeholder="Por preencher"></label></div><button class="link neg" data-ea="rmcred" data-id="${i}">Remover credencial</button>`).join('')}<button class="link" data-ea="addcred">Adicionar credencial</button>
 <h2>Garantias</h2><div class="fld">${empIn('garantiaEquip','Equipamentos','3 anos')}${empIn('garantiaInst','Instalação','2 anos')}</div>
 <h2>Perguntas frequentes</h2><p class="note" style="margin:-4px 6px 10px">Quem faz a instalação?</p>${empArea('instalacao','Ex.: Técnicos qualificados, coordenados por nós do início ao fim. O João acompanha a obra e é o seu contacto direto.',2)}
 <p class="note" style="margin:0 6px 10px">E depois da instalação?</p>${empArea('posVenda','Ex.: Ficamos disponíveis para qualquer dúvida e lembramos a manutenção anual.',2)}
 <h2>Opiniões no Google</h2><div class="fld">${empIn('google.nota','Nota (ex.: 4,9)','','text','inputmode="decimal"')}${empIn('google.total','N.º de opiniões','','text','inputmode="numeric"')}${empIn('google.link','Link das opiniões','https://g.page/…','url')}</div>
 <h2>Foto da equipa ou de uma obra</h2><div class="grp">${empPhoto('equipa','Foto da equipa',false)}</div>
 <h2>Incluído no preço, sem surpresas</h2><p class="note" style="margin:-4px 6px 10px">Uma linha por item. Deixe só o que está incluído em todas as obras.</p>${empArea('incluido','Equipamentos e materiais indicados na proposta',5).replace(/>[^<]*<\/textarea>/,'>'+esc((e.incluido||[]).join('\n'))+'</textarea>')}
 <h2>Leads novas</h2><label class="row kv" style="gap:10px;cursor:pointer"><input type="checkbox" data-emp="autoPedido" ${e.autoPedido!==false?'checked':''} style="width:22px;height:22px;flex:none"><div class="rt"><b>Enviar o questionário por email automaticamente</b><span>Às leads na fase «Lead nova» com email, recebidas nos últimos 7 dias, uma vez por lead (das 8h às 22h).</span></div></label><label class="row kv" style="gap:10px;cursor:pointer"><input type="checkbox" data-emp="lembretes" ${e.lembretes!==false?'checked':''} style="width:22px;height:22px;flex:none"><div class="rt"><b>Lembrar os clientes que não responderam à proposta</b><span>Email e WhatsApp aos 4 e aos 10 dias depois do envio, com o link para responderem. Param quando o cliente responde (das 10h às 19h, de segunda a sábado).</span></div></label>
 <h2>Semanas livres para instalação</h2><p class="note" style="margin:-4px 6px 10px">Indique só semanas já confirmadas com as equipas. O cliente escolhe uma ao avançar; as semanas passadas desaparecem sozinhas.</p>
 <div class="fld">${weeks.length?weeks.map((d,i)=>`<label><span>Semana de</span><input type="date" data-emp-week="${i}" value="${esc(d)}"><button class="mini neg" data-ea="rmweek" data-id="${i}" aria-label="Remover semana">✕</button></label>`).join(''):'<div class="empty">Sem semanas indicadas. A proposta diz «a combinar».</div>'}</div><button class="link" data-ea="addweek">Adicionar semana</button>
 <button class="btn" data-ea="save" ${EMP_BUSY?'disabled':''}>${EMP_BUSY?'A guardar…':'Guardar'}</button>
 <p class="note">Para ver o resultado, abra o link de um orçamento já enviado e toque em «Testar como cliente».</p>`;
}
const empSet=(path,v)=>{const ks=path.split('.'),last=ks.pop();ks.reduce((o,k)=>o[k]=o[k]||{},EMP)[last]=v};
document.addEventListener('input',ev=>{
 const t=ev.target;if(!EMP||V.tab!=='emp')return;
 if(t.type==='checkbox'&&t.dataset.emp)empSet(t.dataset.emp,t.checked);
 else if(t.dataset.emp)empSet(t.dataset.emp,t.dataset.emp==='incluido'?t.value.split('\n').map(s=>s.trim()).filter(Boolean):t.value);
 else if(t.dataset.empCred!==undefined)EMP.credenciais[+t.dataset.empCred][t.dataset.f]=t.value;
 else if(t.dataset.empWeek!==undefined)EMP.semanas[+t.dataset.empWeek]=t.value;
});
const empPick=()=>new Promise(res=>{const f=document.createElement('input');f.type='file';f.accept='image/*';f.onchange=()=>res(f.files[0]||null);f.click()});
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-ea]');if(!b||!EMP)return;
 const a=b.dataset.ea,i=+b.dataset.id;
 if(a==='addcred')EMP.credenciais.push({nome:'',numero:''});
 else if(a==='rmcred')EMP.credenciais.splice(i,1);
 else if(a==='addweek'){const last=EMP.semanas.at(-1),d=new Date((last||new Date().toISOString().slice(0,10))+'T12:00:00Z');if(last)d.setUTCDate(d.getUTCDate()+7);EMP.semanas.push(d.toISOString().slice(0,10))}
 else if(a==='rmweek')EMP.semanas.splice(i,1);
 else if(a==='semfoto'){if(b.dataset.id==='contacto')EMP.contacto.foto='';else EMP.equipaFoto=''}
 else if(a==='foto'){
  const f=await empPick();if(!f)return;
  try{EMP_MSG='A enviar a foto…';render();const [blob]=await toImages(f),id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
   const r=await API('empresa/foto/'+id,{method:'PUT',headers:{'content-type':'image/jpeg'},body:blob});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Não foi possível enviar a foto.');
   EMP_PREVIEW[id]=URL.createObjectURL(blob);if(b.dataset.id==='contacto')EMP.contacto.foto=id;else EMP.equipaFoto=id;EMP_MSG='Foto pronta. Toque em Guardar para a publicar na proposta.'}
  catch(e){EMP_MSG=e.message||'Não foi possível enviar a foto.'}
 }
 else if(a==='save'){
  EMP_BUSY=true;EMP_MSG='';render();
  try{EMP.semanas=[...new Set(EMP.semanas.filter(Boolean))].sort();const r=await API('empresa',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({empresa:EMP})});
   if(!r.ok)throw new Error('Não foi possível guardar. Verifique a ligação.');const {empresa}=await r.json();empKeep(empresa);EMP=structuredClone(empresa);EMP_MSG='Guardado. As propostas já abertas mostram estes dados na próxima vez que o cliente as abrir.'}
  catch(e){EMP_MSG=e.message}
  EMP_BUSY=false;
 }
 render();
});
