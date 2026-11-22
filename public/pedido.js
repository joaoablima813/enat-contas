/* «Pedir detalhes ao cliente» na ficha da lead: cria o link do questionário, abre o WhatsApp ou o email com a mensagem
   pronta e, quando o cliente responde, preenche a lead (morada, soluções, tipo de casa, prazo…) e mostra as respostas. */
let PED_MSG='',PED_BUSY=false,PED_AT=0;
const PED_URL={};
const pedFirst=l=>String(l.name||'').trim().split(/\s+/)[0]||'';
const pedText=(l,url)=>{
 const me=globalThis.ENAT_EMPRESA?.contacto?.nome||'João Lima',sol=(l.solutions||[]).filter(s=>EnatPedido.TECHS.includes(s));
 return `Olá${pedFirst(l)?' '+pedFirst(l):''}, sou ${me}, da Enat - Ponte de Lima. Obrigado pelo seu pedido${sol.length?' de orçamento para '+sol.join(' e ').toLowerCase():' de orçamento'}.\n\nPara lhe enviar uma proposta à medida, sem visitas desnecessárias, pode responder a umas perguntas rápidas (2 minutos) e indicar a morada da instalação?\n\n${url}\n\nObrigado!\n${me}\nEnat - Ponte de Lima`;
};
// Fotos do cliente: precisam da sessão, por isso são carregadas como blob.
function pedPhotos(ids){for(const id of ids)if(!(id in PED_URL)){PED_URL[id]='';API('pedido/foto/'+id).then(r=>r.ok?r.blob():null).then(b=>{if(b){PED_URL[id]=URL.createObjectURL(b);if(V.tab==='leads'&&idle())render()}}).catch(()=>{})}}
function pedidoSection(l){
 const p=l.pedido||{},r=p.resp,tel=waTel(l.contact),mail=String(l.email||'').trim();
 if(r)pedPhotos(r.fotos||[]);
 const when=t=>new Date(t).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const answers=r?`<div class="grp">${EnatPedido.summary(r).map(([k,v])=>`<div class="row kv"><div class="rt"><span>${esc(k)}</span><b style="white-space:normal">${esc(v)}</b></div></div>`).join('')}</div>${(r.fotos||[]).length?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0">${r.fotos.map(id=>PED_URL[id]?`<a href="${esc(PED_URL[id])}" target="_blank" rel="noopener"><img src="${esc(PED_URL[id])}" alt="Foto do cliente" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block"></a>`:'<div style="aspect-ratio:1;border-radius:10px;background:var(--chip)"></div>').join('')}</div>`:''}`:'';
 return `<h2>Pedir detalhes ao cliente</h2>
 ${r?`<p class="note">Respondeu a ${esc(when(r.at))}. Os dados já foram passados para esta lead.</p>${answers}`:p.sent?`<p class="note">Link enviado a ${esc(when(p.sent))}. Ainda sem resposta.</p>`:`<p class="note" style="margin:-4px 6px 10px">Envie ao cliente um link com perguntas rápidas: solução, gama (preço, equilíbrio ou qualidade), áreas, morada e fotos. As respostas entram nesta lead e recebe um aviso.</p>`}
 <div class="lead-call-add">${tel?`<button type="button" class="btn ${r?'alt':''}" data-ped="whatsapp" ${PED_BUSY?'disabled':''}>${r||p.sent?'Reenviar':'Enviar'} por WhatsApp</button>`:''}${mail?`<button type="button" class="btn alt" data-ped="email" ${PED_BUSY?'disabled':''}>${r||p.sent?'Reenviar':'Enviar'} por email</button>`:''}</div>
 ${!tel&&!mail?'<p class="note">Indique o contacto ou o email do cliente para enviar o link.</p>':''}
 ${PED_MSG?`<p class="note" role="status">${esc(PED_MSG)}</p>`:''}`;
}
// Passa as respostas para os campos da lead, sem apagar o que já foi escrito à mão.
function pedApply(l,resp){
 const a=resp.a||{},addr=[resp.morada,[resp.cp,resp.local].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 if(addr&&!String(l.address||'').trim())l.address=addr;
 l.solutions=[...new Set([...(l.solutions||[]),...resp.sol])];
 const house=a.casa&&LEAD_HOUSES.includes(a.casa)?a.casa:'';if(house&&!l.house)l.house=house;
 if(a.prazo&&!l.timing)l.timing=a.prazo;
 const heat=a.aqs_atual||a.st_atual;if(heat&&!l.heating)l.heating=heat;
 if(a.pv_fat&&!l.bill)l.bill=a.pv_fat+' por mês';
 if(a.ac_div&&!l.rooms)l.rooms=a.ac_div+' divisão(ões)'+(a.ac_txt?': '+a.ac_txt:'');
 const area=a.ac_area||a.bcc_area||a.pr_area||a.vmc_area;if(area&&!l.area)l.area=area;
 l.pedido={...(l.pedido||{}),resp};
 if(l.stage==='nova'||l.stage==='contacto')l.stage='triagem';
}
// Lê as respostas novas no servidor (no máximo a cada minuto, ao sincronizar).
async function pedidosPull(force){
 if(!force&&Date.now()-PED_AT<6e4)return;PED_AT=Date.now();
 const r=await API('pedidos').catch(()=>null);if(!r?.ok)return;
 const {pedidos}=await r.json().catch(()=>({}));let changed=false;
 for(const p of pedidos||[]){
  const l=(S.leads||[]).find(x=>x.id===p.lead);if(!l||l.pedido?.resp?.at>=p.at)continue;
  pedApply(l,{...EnatPedido.clean(p.resp),fotos:(p.resp.fotos||[]).filter(f=>/^[a-z0-9]{8,40}$/.test(f)),at:p.at});changed=true;
  if(leadDraft?.id===l.id){const keep=leadDirty();Object.assign(leadDraft,structuredClone(l));if(!keep)leadOrig=JSON.stringify(leadDraft)}
  if(typeof notifAdd==='function')notifAdd({id:'pedido|'+l.id+'|'+p.at,kind:'lead',lead:l.id,title:'Detalhes recebidos: '+leadName(l),text:p.resp.sol?.join(', ')||'O cliente respondeu ao questionário',at:p.at});
 }
 if(changed){save();if(idle())render()}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-ped]');if(!b||!leadDraft)return;const ch=b.dataset.ped;
 // A janela tem de abrir já no toque (o Safari bloqueia janelas abertas depois de esperar pela rede).
 const win=ch==='whatsapp'?window.open('','_blank'):null;
 PED_BUSY=true;PED_MSG='A preparar o link…';render();
 try{
  const l=leadSave();
  const r=await API('pedido',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lead:l.id,nome:l.name,sol:l.solutions})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não foi possível criar o link.');
  const text=pedText(l,j.url);
  if(ch==='whatsapp'){const href='https://wa.me/'+waTel(l.contact)+'?text='+encodeURIComponent(text);win?win.location.href=href:window.open(href,'_blank')}
  else location.href='mailto:'+encodeURIComponent(l.email.trim())+'?subject='+encodeURIComponent('O seu pedido de orçamento · Enat - Ponte de Lima')+'&body='+encodeURIComponent(text);
  const saved=(S.leads||[]).find(x=>x.id===l.id);saved.pedido={...(saved.pedido||{}),token:j.token,sent:Date.now()};
  if(saved.stage==='nova')saved.stage='contacto';
  save();Object.assign(leadDraft,{pedido:saved.pedido,stage:saved.stage});leadOrig=JSON.stringify(leadDraft);
  PED_MSG=ch==='whatsapp'?'Mensagem pronta no WhatsApp: toque em enviar.':'Email pronto: toque em enviar.';
 }catch(x){win?.close();PED_MSG=x.message}
 PED_BUSY=false;render();
});
