/* Equipamentos instalados em cada obra (separador «Equipamentos» da obra).
   Marca, modelo, número de série, código de verificação, datas de instalação e de fim de garantia, a app da marca,
   a conta do cliente e a autorização para acesso remoto. Guardado na obra (o.eqs), com o resto do estado da app.
   Fase 2 (mais tarde): ligar à AlphaESS e à Smart Life (Tuya) para ver o estado e as avarias. */
const EQ_TIPOS=['Ar condicionado','Bomba de calor AQS','Bomba de calor climatização','Inversor','Bateria','Painéis fotovoltaicos','Piso radiante','Ventiloconvectores','VMC','Solar térmico','Carregador automóvel','Outro'];
const EQ_MARCAS=['Ekallor','LG','Proteu','Daikin','Mitsubishi','Energie','AlphaESS','GoodWe'];
const EQ_APPS=['Smart Life','AC Freedom','Comfort Life','NetHome Plus','EWPE Smart','Daikin Onecta','LG ThinQ','MELCloud','AlphaCloud','SEMS Portal','Outra'];
// App habitual de cada marca (a Proteu e a Ekallor variam com a gama: confirmar no manual).
const EQ_APP_DE={Ekallor:'Smart Life',Energie:'Smart Life',Proteu:'AC Freedom',Daikin:'Daikin Onecta',LG:'LG ThinQ',Mitsubishi:'MELCloud',AlphaESS:'AlphaCloud',GoodWe:'SEMS Portal'};
// Portais no navegador (as outras só existem como app no telemóvel).
const EQ_PORTAL={AlphaCloud:'https://cloud.alphaess.com/','SEMS Portal':'https://www.semsportal.com/',MELCloud:'https://app.melcloud.com/'};
// Plataformas que a app poderá ler mais tarde (estado e avarias).
const EQ_LIGAVEL=new Set(['Smart Life','AlphaCloud']);
// Tipo do equipamento → tipo usado na Manutenção.
const EQ_MANUT={Inversor:'UPAC (fotovoltaico)',Bateria:'UPAC (fotovoltaico)','Painéis fotovoltaicos':'UPAC (fotovoltaico)'};
let EQ_OPEN=null;
const eqObra=()=>S.obras.find(o=>o.id===V.obra);
const eqAnos=()=>parseInt(String(globalThis.ENAT_EMPRESA?.garantiaEquip||'3'),10)||3;
const eqMais=(d,anos)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '';const x=new Date(d+'T12:00:00');x.setFullYear(x.getFullYear()+anos);return x.toISOString().slice(0,10)};
const eqDia=d=>String(d||'').split('-').reverse().join('/');
const eqTitulo=e=>[e.tipo||'Equipamento',[e.marca,e.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
function eqSection(o){
 const L=o.eqs||[],hoje=new Date().toISOString().slice(0,10);
 const opt=(list,v)=>['',...list].map(x=>`<option value="${esc(x)}"${x===(v||'')?' selected':''}>${esc(x||'— escolher —')}</option>`).join('');
 const f=(i,k,label,v,attrs='')=>`<label class="q-field"><span>${label}</span><input data-eqf="${k}" data-i="${i}" value="${esc(v||'')}" ${attrs}></label>`;
 const card=(e,i)=>{
  const fimG=e.garantiaAte,emG=fimG&&fimG>=hoje,url=EQ_PORTAL[e.app];
  return `<details class="eq-card"${EQ_OPEN===e.id?' open':''} data-eqid="${esc(e.id)}"><summary><span class="eq-ic">${ic(/Inversor|Bateria|fotovolt/.test(e.tipo||'')?'iva':'obras')}</span><span class="eq-t"><b>${esc(eqTitulo(e))}</b><small>${esc([e.sn?'SN '+e.sn:'Sem número de série',fimG?(emG?'Garantia até '+eqDia(fimG):'Garantia terminou a '+eqDia(fimG)):''].filter(Boolean).join(' · '))}</small></span>${e.remoto?'<span class="lead-badge eq-rem">Acesso remoto</span>':''}</summary>
  <div class="eq-body">
   <div class="eq-g2"><label class="q-field"><span>Tipo</span><select data-eqf="tipo" data-i="${i}">${opt(EQ_TIPOS,e.tipo)}</select></label>
   <label class="q-field"><span>Marca</span><input data-eqf="marca" data-i="${i}" value="${esc(e.marca||'')}" list="eq-marcas" placeholder="Ex.: Energie"></label></div>
   ${f(i,'modelo','Modelo',e.modelo,'placeholder="Ex.: Aquapura 200"')}
   <div class="eq-g2">${f(i,'sn','Número de série (SN)',e.sn,'autocapitalize="characters" spellcheck="false"')}${f(i,'check','Código de verificação (opcional)',e.check,'spellcheck="false" placeholder="Ex.: CheckCode AlphaESS"')}</div>
   <div class="eq-g2"><label class="q-field"><span>Data de instalação</span><input type="date" data-eqf="instalado" data-i="${i}" value="${esc(e.instalado||'')}"></label><label class="q-field"><span>Garantia até</span><input type="date" data-eqf="garantiaAte" data-i="${i}" value="${esc(e.garantiaAte||'')}"></label></div>
   <div class="eq-g2"><label class="q-field"><span>App / portal da marca</span><select data-eqf="app" data-i="${i}">${opt(EQ_APPS,e.app)}</select></label>${f(i,'conta','Conta do cliente na app',e.conta,'placeholder="Email ou utilizador" autocomplete="off"')}</div>
   <label class="row kv eq-chk"><input type="checkbox" data-eqf="remoto" data-i="${i}" ${e.remoto?'checked':''}><div class="rt"><b>O cliente autorizou o acesso remoto</b><span>Peça autorização (de preferência por escrito) e partilhe o equipamento com a conta da ENAT na app da marca.</span></div></label>
   <label class="q-field"><span>Notas</span><textarea data-eqf="notas" data-i="${i}" rows="2" maxlength="2000" placeholder="Ex.: Wi-Fi do cliente 2,4 GHz; unidade exterior no telhado">${esc(e.notas||'')}</textarea></label>
   ${e.app?`<p class="note">${url?`<a class="btn alt eq-portal" href="${esc(url)}" target="_blank" rel="noopener">Abrir ${esc(e.app)}</a>`:`Para ver ou mexer no equipamento, abra a app <b>${esc(e.app)}</b> no telemóvel.`}${EQ_LIGAVEL.has(e.app)?' Esta plataforma poderá ser ligada à app mais tarde (estado e avarias à distância).':''}</p>`:''}
   <button type="button" class="link neg" data-eqa="del" data-i="${i}">Eliminar este equipamento</button>
  </div></details>`};
 return `<h2>Equipamentos instalados${L.length?' ('+L.length+')':''}</h2><p class="note" style="margin:-4px 6px 10px">Registe cada equipamento: número de série, garantia e a app da marca. Quando o cliente ligar com uma avaria, está tudo aqui. Também pode procurar pelo número de série no Início.</p>
 <datalist id="eq-marcas">${EQ_MARCAS.map(m=>`<option value="${esc(m)}">`).join('')}</datalist>
 <div class="eq-list">${L.length?L.map(card).join(''):'<div class="grp"><div class="empty">Ainda sem equipamentos registados nesta obra.</div></div>'}</div>
 <button type="button" class="btn alt" data-eqa="add">${ic('obras')}Adicionar equipamento</button>`;
}
function eqSet(t,saveNow){
 const o=eqObra(),e=o?.eqs?.[+t.dataset.i];if(!e)return;const k=t.dataset.eqf;
 e[k]=k==='remoto'?t.checked:k==='sn'||k==='check'?t.value.trim().toUpperCase():t.value;
 // A marca sugere a app; a data de instalação sugere o fim da garantia.
 if(k==='marca'){const m=EQ_MARCAS.find(x=>x.toLowerCase()===String(t.value).trim().toLowerCase());if(m&&!e.app){e.app=EQ_APP_DE[m];const s=document.querySelector(`select[data-eqf="app"][data-i="${t.dataset.i}"]`);if(s)s.value=e.app}}
 if(k==='instalado'&&!e.garantiaAte){e.garantiaAte=eqMais(e.instalado,eqAnos());const g=document.querySelector(`input[data-eqf="garantiaAte"][data-i="${t.dataset.i}"]`);if(g)g.value=e.garantiaAte}
 // O tipo entra também na Manutenção (lembrete anual).
 if(k==='tipo'&&e.tipo){const m=EQ_MANUT[e.tipo]||e.tipo;if(EQ.includes(m)){o.equip=o.equip||[];if(!o.equip.includes(m))o.equip.push(m)}}
 if(saveNow)save();
}
document.addEventListener('input',ev=>{if(ev.target.dataset?.eqf&&ev.target.type!=='checkbox')eqSet(ev.target,false)});
document.addEventListener('change',ev=>{if(ev.target.dataset?.eqf)eqSet(ev.target,true)});
document.addEventListener('toggle',ev=>{const d=ev.target;if(d.classList?.contains('eq-card'))EQ_OPEN=d.open?d.dataset.eqid:(EQ_OPEN===d.dataset.eqid?null:EQ_OPEN)},true);
document.addEventListener('click',ev=>{
 const b=ev.target.closest('[data-eqa]');if(!b)return;const o=eqObra();if(!o)return;
 if(b.dataset.eqa==='add'){
  const hoje=new Date().toISOString().slice(0,10),tipo=(o.equip||[])[0]||'',inst=o.done||hoje;
  const e={id:uid(),tipo:tipo==='UPAC (fotovoltaico)'?'Inversor':tipo,marca:'',modelo:'',sn:'',check:'',instalado:inst,garantiaAte:eqMais(inst,eqAnos()),app:'',conta:'',remoto:false,notas:''};
  o.eqs=[...(o.eqs||[]),e];EQ_OPEN=e.id;save();render();
  setTimeout(()=>document.querySelector(`[data-eqid="${e.id}"] [data-eqf="marca"]`)?.focus(),50);
 }
 else if(b.dataset.eqa==='del'){const e=o.eqs?.[+b.dataset.i];if(!e||!confirm('Eliminar '+eqTitulo(e)+'?'))return;o.eqs=o.eqs.filter(x=>x!==e);save();render()}
});
