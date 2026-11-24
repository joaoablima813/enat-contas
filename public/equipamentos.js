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
const EQ_LIGAVEL=new Set(['Smart Life','AlphaCloud','Daikin Onecta']);
// Tipo do equipamento → tipo usado na Manutenção.
const EQ_MANUT={Inversor:'UPAC (fotovoltaico)',Bateria:'UPAC (fotovoltaico)','Painéis fotovoltaicos':'UPAC (fotovoltaico)'};
let EQ_OPEN=null;
// ---- Acesso remoto (AlphaESS, Smart Life e Daikin) ----
const EQ_LIVE={};let EQ_TUYA=null;
const EQ_NOMES={switch:'Ligado',switch_1:'Ligado',temp_set:'Temperatura pretendida',temp_current:'Temperatura atual',temp_top:'Temperatura do depósito',mode:'Modo',work_mode:'Modo',fault:'Avarias',fan_speed_enum:'Ventilação',eco:'Modo eco',sleep:'Modo noite',heat:'Aquecimento',power:'Potência',countdown:'Temporizador',child_lock:'Bloqueio',
 ppv:'Produção solar (W)',pload:'Consumo da casa (W)',soc:'Bateria (%)',pbat:'Bateria (W, + descarrega / − carrega)',pgrid:'Rede (W, + compra / − vende)',pev:'Carregador (W)',emsStatus:'Estado',sysSn:'Número de série',popv:'Potência dos painéis (kW)',cobat:'Capacidade da bateria (kWh)',poinv:'Potência do inversor (kW)'};
const eqNome=k=>EQ_NOMES[k]||String(k).replace(/_/g,' ');
const eqEscala=(f,v)=>{let x={};try{x=JSON.parse(f?.values||'{}')}catch{}return {s:Number(x.scale)||0,min:x.min,max:x.max,step:x.step,unit:x.unit||'',range:x.range||[]}};
// ---- Daikin (Onecta): o cliente autoriza com um link; depois vê-se o estado e as avarias aqui ----
const DK_TIPO={climateControl:'Climatização',climateControlMainZone:'Climatização',domesticHotWaterTank:'Água quente (depósito)',domesticHotWaterFlowThrough:'Água quente',indoorUnitHydro:'Unidade interior',indoorUnit:'Unidade interior',outdoorUnit:'Unidade exterior',userInterface:'Comando',gateway:'Adaptador Wi-Fi'};
const DK_NOMES={roomTemperature:'Temperatura da divisão',outdoorTemperature:'Temperatura exterior',tankTemperature:'Temperatura do depósito',leavingWaterTemperature:'Temperatura de saída da água',domesticHotWaterTemperature:'Água quente pretendida',leavingWaterOffset:'Ajuste da água de saída',roomHumidity:'Humidade',
 heating:'Aquecimento',cooling:'Arrefecimento',auto:'Automático',dry:'Desumidificar',fanOnly:'Só ventilação'};
const dkNome=k=>DK_NOMES[k]||String(k).replace(/([A-Z])/g,' $1').toLowerCase();
function dkRemoto(e,i,L){
 const d=L.data;
 let h='';
 if(L.link)h+=`<div class="eq-link"><p class="note">Envie este link ao cliente (válido ${L.link.validade} dias). Ele entra com a conta da app Onecta e carrega em «Permitir».</p><input readonly value="${esc(L.link.url)}" onclick="this.select()"><div class="eq-row"><a class="btn alt" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Olá! Para a ENAT poder acompanhar o seu equipamento Daikin e ajudar mais depressa em caso de avaria, abra este link, entre com a sua conta da app Onecta e carregue em «Permitir»: '+L.link.url)}">Enviar por WhatsApp</a><button type="button" class="btn alt" data-eqr="dk-copy" data-i="${i}">Copiar</button></div></div>`;
 if(!e.dkOk&&!L.link)h+=`<p class="note">O cliente autoriza uma vez, com a conta da app Onecta (Daikin ID). Crie o link e envie-lho, ou abra-o no telemóvel dele durante a instalação.</p><button type="button" class="btn alt" data-eqr="dk-link" data-i="${i}" ${L.loading?'disabled':''}>Criar link de autorização</button>`;
 h+=`<button type="button" class="btn alt" data-eqr="dk" data-i="${i}" ${L.loading?'disabled':''}>${L.loading?'A ler…':e.dkOk?'Ver estado agora':'Já autorizou? Ver estado'}</button>`;
 if(d){
  h+=(d.dispositivos||[]).map(g=>`<div class="eq-live"><p class="eq-on ${g.online?'ok':'off'}">${g.online?'● Online':'● Offline (sem ligação ao Wi-Fi)'}${g.modelo?' · '+esc(g.modelo):''}</p>
  ${g.unidades.map(m=>{
   const id=`data-i="${i}" data-dev="${esc(g.id)}" data-mp="${esc(m.id)}"`;
   return `<div class="eq-dk"><b>${esc(m.nome||DK_TIPO[m.tipo]||m.tipo)}</b>
   ${m.avaria||m.erro?`<div class="eq-faults"><b>Avaria</b><span>${esc(m.erro||'Em erro')}</span></div>`:m.aviso?'<div class="eq-faults"><b>Aviso</b><span>Veja na app Onecta</span></div>':''}
   <div class="eq-kv">
    ${m.ligado!=null?`<div><span>Ligado</span><b>${m.ligado?'Sim':'Não'}</b>${g.online&&m.ligarOk?`<button type="button" class="mini" data-eqr="dk-onoff" ${id} data-v="${m.ligado?'off':'on'}">${m.ligado?'Desligar':'Ligar'}</button>`:''}</div>`:''}
    ${m.modo?`<div><span>Modo</span>${g.online&&m.modoOk&&m.modos.length?`<select data-eqr-dkmodo="1" ${id}>${m.modos.map(x=>`<option value="${esc(x)}"${x===m.modo?' selected':''}>${esc(dkNome(x))}</option>`).join('')}</select>`:`<b>${esc(dkNome(m.modo))}</b>`}</div>`:''}
    ${Object.entries(m.sensores).map(([k,x])=>`<div><span>${esc(dkNome(k))}</span><b>${esc(String(x))}${typeof x==='number'&&/emperature/.test(k)?' °C':''}</b></div>`).join('')}
    ${m.pontos.map(p=>`<div><span>${esc(dkNome(p.code))}</span>${g.online&&p.settable?`<input type="number" data-dk-sp="${esc(p.path)}" ${id} value="${esc(String(p.value))}" ${p.min!=null?'min="'+p.min+'"':''} ${p.max!=null?'max="'+p.max+'"':''} step="${p.step||0.5}" style="width:80px"><button type="button" class="mini" data-eqr="dk-sp" ${id} data-path="${esc(p.path)}">Aplicar</button>`:`<b>${esc(String(p.value))} °C</b>`}</div>`).join('')}
   </div></div>`}).join('')}</div>`).join('')||'<p class="note">Nenhum equipamento Daikin nesta conta.</p>';
  h+=`<p class="note">Lido às ${new Date(d.at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}. A Daikin permite até 200 leituras por dia por cliente.</p>`;
 }
 if(e.dkOk)h+=`<button type="button" class="link neg" data-eqr="dk-off" data-i="${i}">Retirar a ligação Daikin</button>`;
 return h;
}
async function dkAcao(a,b,e,i,L){
 const ref=e.id;
 if(a==='dk-link'){L.link=await eqApi('remoto/daikin/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref})});return}
 if(a==='dk'){L.data=await eqApi('remoto/daikin/estado?ref='+encodeURIComponent(ref));L.link=null;if(!e.dkOk){e.dkOk=true;save()}return}
 if(a==='dk-off'){if(!confirm('Retirar a ligação à conta Daikin deste cliente? Para voltar a ver o equipamento, o cliente terá de autorizar outra vez.'))return;await eqApi('remoto/daikin/desligar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref})});e.dkOk=false;L.data=null;save();L.msg='Ligação Daikin retirada.';return}
 let characteristic,value,path,label;
 if(a==='dk-onoff'){characteristic='onOffMode';value=b.dataset.v;label=value==='on'?'Ligar':'Desligar'}
 else if(a==='dk-modo'){characteristic='operationMode';value=b.value;label='Modo = '+dkNome(value)}
 else if(a==='dk-sp'){const n=document.querySelector(`[data-dk-sp="${b.dataset.path}"][data-mp="${b.dataset.mp}"][data-i="${i}"]`);value=Number(n?.value);if(!Number.isFinite(value))throw new Error('Valor inválido.');characteristic='temperatureControl';path=b.dataset.path;label=dkNome(path.split('/').pop())+' = '+value+' °C'}
 else return;
 if(!confirm('Enviar ao equipamento: '+label+'?'))return;
 await eqApi('remoto/daikin/comando',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref,device:b.dataset.dev,mp:b.dataset.mp,characteristic,value,path})});
 e.notas=(e.notas?e.notas+'\n':'')+new Date().toLocaleString('pt-PT')+' · remoto Daikin: '+label;save();
 L.msg='Enviado. A ler o estado de novo…';await new Promise(r=>setTimeout(r,3000));L.data=await eqApi('remoto/daikin/estado?ref='+encodeURIComponent(ref));L.msg='Alteração enviada e registada nas notas.';
}
async function eqApi(path,opts){const r=await API(path,opts);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não foi possível ligar ao equipamento.');return j}
function eqRemoto(e,i){
 if(!EQ_LIGAVEL.has(e.app))return '';
 if(!e.remoto)return '<div class="eq-remote"><b>Acesso remoto</b><p class="note">Marque acima que o cliente autorizou, para ver o estado do equipamento a partir daqui.</p></div>';
 const L=EQ_LIVE[e.id]||{},d=L.data;
 let body='';
 if(e.app==='Daikin Onecta')body=dkRemoto(e,i,L);
 else if(e.app==='AlphaCloud'){
  const ok=e.alphaOk;
  body=(ok?'':`<p class="note">Primeiro associe este sistema à conta da ENAT (precisa do número de série e do CheckCode).</p><button type="button" class="btn alt" data-eqr="alpha-bind" data-i="${i}" ${L.loading?'disabled':''}>Associar à ENAT</button>`)+
   `<button type="button" class="btn alt" data-eqr="alpha" data-i="${i}" ${L.loading?'disabled':''}>${L.loading?'A ler…':'Ver estado agora'}</button>`;
  if(d){const u=d.ultimo||{},main=['ppv','pload','soc','pbat','pgrid'].filter(k=>u[k]!=null);
   body+=`<div class="eq-live"><div class="eq-kv">${main.map(k=>`<div><span>${esc(eqNome(k))}</span><b>${esc(String(u[k]))}</b></div>`).join('')||'<div><span>Sem dados recentes</span><b>—</b></div>'}</div>
   ${d.sistema?`<p class="note">Estado do sistema: <b>${esc(String(d.sistema.emsStatus||'—'))}</b></p>`:''}
   <details class="eq-raw"><summary>Todos os dados</summary>${Object.entries({...(d.sistema||{}),...u}).map(([k,v])=>`<div><span>${esc(eqNome(k))}</span><b>${esc(typeof v==='object'?JSON.stringify(v):String(v))}</b></div>`).join('')}</details>
   <p class="note">Lido às ${new Date(d.at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}.</p></div>`}
 } else {
  if(!e.tuyaId){
   const list=EQ_TUYA;
   body=`<p class="note">Ligue a conta Smart Life do cliente ao projeto da ENAT e escolha aqui o equipamento.</p><button type="button" class="btn alt" data-eqr="tuya-list" data-i="${i}" ${L.loading?'disabled':''}>${L.loading?'A procurar…':'Escolher o equipamento na Smart Life'}</button>`+
    (list?`<div class="grp eq-pick">${list.length?list.map(x=>`<button type="button" class="row invoice-row" data-eqr="tuya-pick" data-i="${i}" data-id="${esc(x.id)}" data-nome="${esc(x.nome)}"><div class="rt"><b>${esc(x.nome)}</b><span>${esc([x.produto,x.online?'online':'offline'].filter(Boolean).join(' · '))}</span></div></button>`).join(''):'<div class="empty">Nenhum equipamento encontrado. Confirme que a conta Smart Life do cliente está ligada ao projeto da ENAT.</div>'}</div>`:'');
  } else {
   body=`<p class="note">Smart Life: <b>${esc(e.tuyaNome||e.tuyaId)}</b> <button type="button" class="link" data-eqr="tuya-unpick" data-i="${i}">mudar</button></p><button type="button" class="btn alt" data-eqr="tuya" data-i="${i}" ${L.loading?'disabled':''}>${L.loading?'A ler…':'Ver estado agora'}</button>`;
   if(d){
    const fn=Object.fromEntries((d.funcoes||[]).map(f=>[f.code,f]));
    const ctl=s=>{const f=fn[s.code];if(!f)return '';const t=String(f.type||'').toLowerCase(),sc=eqEscala(f);
     if(t==='boolean')return `<button type="button" class="mini" data-eqr="tuya-cmd" data-i="${i}" data-code="${esc(s.code)}" data-v="${!s.value}">${s.value?'Desligar':'Ligar'}</button>`;
     if(t==='enum')return `<select data-eqr-sel="${esc(s.code)}" data-i="${i}">${sc.range.map(o=>`<option${o===s.value?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
     if(t==='integer')return `<input type="number" data-eqr-num="${esc(s.code)}" data-i="${i}" data-scale="${sc.s}" value="${Number(s.value)/10**sc.s}" ${sc.min!=null?'min="'+sc.min/10**sc.s+'"':''} ${sc.max!=null?'max="'+sc.max/10**sc.s+'"':''} step="${(sc.step||1)/10**sc.s}" style="width:90px"><button type="button" class="mini" data-eqr="tuya-num" data-i="${i}" data-code="${esc(s.code)}">Aplicar</button>`;
     return ''};
    const val=s=>{const f=fn[s.code]||{},sc=eqEscala(f);return typeof s.value==='number'&&sc.s?Number(s.value)/10**sc.s+(sc.unit?' '+sc.unit:''):typeof s.value==='boolean'?(s.value?'Sim':'Não'):String(s.value)+(sc.unit&&typeof s.value==='number'?' '+sc.unit:'')};
    body+=`<div class="eq-live"><p class="eq-on ${d.online?'ok':'off'}">${d.online?'● Online':'● Offline (sem ligação ao Wi-Fi)'}</p>
    ${d.avarias?.length?`<div class="eq-faults"><b>Avarias</b>${d.avarias.map(a=>`<span>${esc(a)}</span>`).join('')}</div>`:'<p class="note">Sem avarias.</p>'}
    <div class="eq-kv eq-dps">${(d.status||[]).filter(s=>!/fault|alarm/i.test(s.code)).map(s=>`<div><span>${esc(eqNome(s.code))}</span><b>${esc(val(s))}</b>${d.online?ctl(s):''}</div>`).join('')}</div>
    <p class="note">Lido às ${new Date(d.at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}. As alterações chegam ao equipamento em poucos segundos.</p></div>`;
   }
  }
 }
 return `<div class="eq-remote"><b>Acesso remoto · ${esc(e.app)}</b>${L.err?`<p class="neg" role="alert">${esc(L.err)}</p>`:''}${L.msg?`<p class="note">${esc(L.msg)}</p>`:''}${body}</div>`;
}
async function eqRemotoAcao(b){
 const o=eqObra(),i=+b.dataset.i,e=o?.eqs?.[i];if(!e)return;const a=b.dataset.eqr,L=EQ_LIVE[e.id]=EQ_LIVE[e.id]||{};
 L.err='';L.msg='';
 if(a==='tuya-pick'){e.tuyaId=b.dataset.id;e.tuyaNome=b.dataset.nome;EQ_TUYA=null;save();render();return}
 if(a==='tuya-unpick'){e.tuyaId='';e.tuyaNome='';L.data=null;save();render();return}
 if(a==='dk-copy'){navigator.clipboard?.writeText(L.link?.url||'').then(()=>{L.msg='Link copiado.';render()},()=>{});return}
 L.loading=true;render();
 try{
  if(a.startsWith('dk'))await dkAcao(a,b,e,i,L);
  else   if(a==='alpha-bind'){if(!e.sn||!e.check)throw new Error('Preencha o número de série e o código de verificação (CheckCode).');await eqApi('remoto/alpha/associar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sn:e.sn,check:e.check})});e.alphaOk=true;save();L.msg='Sistema associado à ENAT.'}
  else if(a==='alpha'){if(!e.sn)throw new Error('Preencha o número de série.');L.data=await eqApi('remoto/alpha/estado?sn='+encodeURIComponent(e.sn));if(!e.alphaOk){e.alphaOk=true;save()}}
  else if(a==='tuya-list'){EQ_TUYA=(await eqApi('remoto/tuya/dispositivos')).dispositivos||[]}
  else if(a==='tuya')L.data=await eqApi('remoto/tuya/estado?id='+encodeURIComponent(e.tuyaId));
  else if(a==='tuya-cmd'||a==='tuya-num'||a==='tuya-sel'){
   let value;
   if(a==='tuya-cmd')value=b.dataset.v==='true';
   else if(a==='tuya-num'){const n=document.querySelector(`[data-eqr-num="${b.dataset.code}"][data-i="${i}"]`);value=Math.round(Number(n?.value)*10**Number(n?.dataset.scale||0));if(!Number.isFinite(value))throw new Error('Valor inválido.')}
   else value=b.value;
   if(!confirm('Enviar ao equipamento: '+eqNome(b.dataset.code)+' = '+(a==='tuya-num'?document.querySelector(`[data-eqr-num="${b.dataset.code}"][data-i="${i}"]`).value:String(value))+'?')){L.loading=false;render();return}
   await eqApi('remoto/tuya/comando',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:e.tuyaId,code:b.dataset.code,value})});
   // Registo na obra: o que foi alterado à distância e quando.
   e.notas=(e.notas?e.notas+'\n':'')+new Date().toLocaleString('pt-PT')+' · remoto: '+eqNome(b.dataset.code)+' = '+String(value);save();
   L.msg='Enviado. A ler o estado de novo…';await new Promise(r=>setTimeout(r,2500));L.data=await eqApi('remoto/tuya/estado?id='+encodeURIComponent(e.tuyaId));L.msg='Alteração enviada e registada nas notas.';
  }
 }catch(x){L.err=x.message}
 L.loading=false;render();
}
document.addEventListener('click',ev=>{const b=ev.target.closest('[data-eqr]');if(b)eqRemotoAcao(b)});
document.addEventListener('change',ev=>{const k=ev.target.closest('[data-eqr-dkmodo]');if(k){k.dataset.eqr='dk-modo';eqRemotoAcao(k);return}const s=ev.target.closest('[data-eqr-sel]');if(s){s.dataset.eqr='tuya-sel';s.dataset.code=s.dataset.eqrSel;eqRemotoAcao(s)}});
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
   ${e.app?`<p class="note">${url?`<a class="btn alt eq-portal" href="${esc(url)}" target="_blank" rel="noopener">Abrir ${esc(e.app)}</a>`:`Para ver ou mexer no equipamento, abra a app <b>${esc(e.app)}</b> no telemóvel.`}${EQ_LIGAVEL.has(e.app)?' O estado e as avarias também se veem aqui em baixo, em «Acesso remoto».':''}</p>`:''}
   ${eqRemoto(e,i)}
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
