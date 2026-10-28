// PV sizing inside the quote editor: consumption, roof and equipment choices, results and the lines it adds.
let pvBusy='',pvMsg='',pvCat=null;
const pvTables=()=>typeof quoteTables==='function'?quoteTables():globalThis.PRICE_TABLES||[];
function pvCatalogNow(){const t=pvTables();if(pvCat?.t!==t)pvCat={t,c:pvCatalog(t)};return pvCat.c}
const pvOn=()=>quoteDraft&&(quoteDraft.pv||quoteDraft.topics.includes('UPAC (fotovoltaico)'));
// Optional figures left at 0 show as empty, so the placeholder (e.g. the automatic panel count) stays visible.
const pvShown=k=>{const v=quoteDraft.pv[k];return v===0&&['panels','roofW','roofH','consumption'].includes(k)?'':v??''};
const pvNum=(label,key,extra='',hint='')=>`<label class="q-field"><span>${label}</span><input type="number" data-pv="${key}" value="${esc(pvShown(key))}" inputmode="decimal" ${extra}>${hint?`<small class="note">${hint}</small>`:''}</label>`;
// Product lists grouped as in the price table, with the discounted cost.
function pvSelect(label,key,items,first,info=i=>''){
 const groups=new Map();for(const i of items){const g=i.brand+' · '+i.group;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(i)}
 const v=quoteDraft.pv[key]||'';
 return `<label class="q-field"><span>${label}</span><select data-pv="${key}">${first.map(([val,text])=>`<option value="${esc(val)}" ${v===val?'selected':''}>${esc(text)}</option>`).join('')}${[...groups].map(([g,list])=>`<optgroup label="${esc(g)}">${list.map(i=>`<option value="${esc(i.key)}" ${v===i.key?'selected':''}>${esc(i.name+info(i)+' · '+eur(i.cost))}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
}
// The sale price of the PV lines with the quote's VAT and margin, used for the payback time.
const pvPrice=d=>d.lines.length?quoteTotals({vat:quoteDraft.vat,margin:quoteDraft.margin,lines:d.lines}).total:0;
function pvResults(){
 const pv=quoteDraft.pv,c=pvCatalogNow(),d=pvDesign(pv,c),price=pvPrice(d),snap=pvSnapshot(d,pv,price),f=pvFmt;
 pv.result=snap;
 if(!d.panel)return '<p class="note neg">Não há painéis nas tabelas de preços.</p>';
 const max=Math.max(...d.months.map(m=>Math.max(m.prod,m.cons)),1);
 const row=(k,v)=>`<div class="q-break"><span>${k}</span><b>${v}</b></div>`;
 const applied=quoteDraft.lines.some(l=>l.pv);
 return `<div class="pv-kpis"><div><small>Potência</small><b>${f(d.kwp,2)} kWp</b><span>${d.n} × ${d.panel.wp} W</span></div><div><small>Produção anual</small><b>${f(d.production,0)} kWh</b><span>${f(d.kwhKwp,0)} kWh/kWp · ${d.source==='PVGIS'?'PVGIS':'estimativa'}</span></div><div><small>Poupança anual</small><b>${eur(d.savings)}</b><span>${snap.payback?'retorno em '+f(snap.payback)+' anos':'—'}</span></div></div>
${d.source!=='PVGIS'?'<p class="note">Produção estimada. Toque em «Calcular produção (PVGIS)» para usar os dados reais do local.</p>':''}
${row('Painéis sugeridos para '+f(pv.coverage,0)+'% do consumo',d.suggested+(d.fit?` · cabem ${d.fit.total} (${d.fit.cols} × ${d.fit.rows})`:''))}
${row('Inversor',d.inverter?(d.inverterQty>1?d.inverterQty+' × ':'')+esc(d.inverter.name)+(d.inverter.micro?'':' · DC/AC '+f(d.ratio,2)):'—')}
${row('Autoconsumo',f(d.self,0)+' kWh · '+f(d.selfShare*100,0)+'% da produção')}
${row('Consumo coberto pelo solar',f(d.coverage*100,0)+'%')}
${row('Excedente para a rede',f(d.exported,0)+' kWh')}
${d.battery?row('Bateria',f(d.battery.kwh*d.batteryQty,1)+' kWh'):row('Bateria sugerida (consumo noturno)','cerca de '+f(d.batteryHint)+' kWh')}
<div class="pv-chart" role="img" aria-label="Produção e consumo por mês">${d.months.map(m=>`<div><i style="height:${m.prod/max*100}%" title="Produção ${f(m.prod,0)} kWh"></i><i style="height:${m.cons/max*100}%" title="Consumo ${f(m.cons,0)} kWh"></i><small>${m.label[0]}</small></div>`).join('')}</div>
<p class="pv-legend"><span>Produção</span><span>Consumo</span></p>
${d.warnings.map(w=>`<p class="note neg">${esc(w)}</p>`).join('')}${d.structureNote?`<p class="note">${esc(d.structureNote)}</p>`:''}
<h3 class="pv-sub">Material a adicionar</h3>${d.lines.map(l=>`<div class="q-break"><span>${f(l.quantity,0)} × ${esc(l.description.replace(/^S\. Energias /,''))}</span><b>${eur(l.value*l.quantity)}</b></div>`).join('')}
<button type="button" class="btn" data-pva="apply" ${d.lines.length?'':'disabled'}>${applied?'Atualizar o material no orçamento':'Adicionar o material ao orçamento'}</button>
<p class="note">${applied?'Substitui as linhas adicionadas antes pelo dimensionamento; as outras linhas ficam como estão.':'Os preços são os da tabela com o desconto da marca. Mão de obra e outros materiais ficam por adicionar.'}</p>`;
}
function pvSection(){
 if(!pvOn())return '';
 const pv=quoteDraft.pv;
 if(!pv)return `<h2>Dimensionamento fotovoltaico</h2><div class="q-card" id="pv-card"><p class="note">Calcula os painéis, o inversor e a bateria a partir do consumo do cliente, e acrescenta o material ao orçamento.</p><button type="button" class="btn alt" data-pva="start">Dimensionar sistema fotovoltaico</button></div>`;
 const c=pvCatalogNow(),phase=Number(pv.phase),roofs=PV_ROOFS,structures=pvStructuresFor(c,pv.roof);
 const inv=c.inverters.filter(i=>i.micro||i.phase===phase),bat=c.batteries,first=pvDesign(pv,c);
 return `<h2>Dimensionamento fotovoltaico</h2><div class="q-card pv" id="pv-card">
<h3 class="pv-sub">Consumo</h3>
${pvNum('Consumo anual (kWh)','consumption','min="0" max="10000000" step="1" placeholder="Ex.: 4500"','Some os kWh das faturas de 12 meses, ou multiplique a média mensal por 12.')}
<div class="pv-2">${pvNum('Cobertura pretendida (%)','coverage','min="0" max="200" step="1"')}${pvNum('Consumo durante o dia (%)','dayShare','min="0" max="100" step="1"')}</div>
<label class="q-field"><span>Ligação</span><select data-pv="phase"><option value="1" ${phase===1?'selected':''}>Monofásica</option><option value="3" ${phase===3?'selected':''}>Trifásica</option></select></label>
<div class="pv-2">${pvNum('Preço do kWh comprado (€)','buy','min="0" max="5" step="0.001"')}${pvNum('Preço do kWh vendido à rede (€)','sell','min="0" max="5" step="0.001"','0 se não vender o excedente.')}</div>
<h3 class="pv-sub">Local e telhado</h3>
<label class="q-field"><span>Morada ou localidade</span><input data-pv="place" value="${esc(pv.place)}" maxlength="300" placeholder="Ex.: Ponte de Lima"></label>
<div class="pv-2">${pvNum('Latitude','lat','min="-60" max="70" step="0.0001"')}${pvNum('Longitude','lon','min="-180" max="180" step="0.0001"')}</div>
${pv.located?`<p class="note">${esc(pv.located)}</p>`:''}
<button type="button" class="btn alt" data-pva="locate" ${pvBusy?'disabled':''}>${pvBusy==='locate'?'A localizar…':'Localizar a morada e calcular produção'}</button>
<label class="q-field"><span>Tipo de cobertura</span><select data-pv="roof">${roofs.map(r=>`<option value="${r.id}" ${pv.roof===r.id?'selected':''}>${esc(r.label)}</option>`).join('')}</select></label>
<div class="pv-2">${pvNum('Inclinação (°)','tilt','min="0" max="90" step="1"')}<label class="q-field"><span>Orientação</span><select data-pv="azimuth">${PV_ORIENTATIONS.map(([v,l])=>`<option value="${v}" ${Number(pv.azimuth)===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
<label class="q-field"><span>Colocação dos painéis</span><select data-pv="layout"><option value="vertical" ${pv.layout==='vertical'?'selected':''}>Vertical (ao alto)</option><option value="horizontal" ${pv.layout==='horizontal'?'selected':''}>Horizontal (deitados)</option></select></label>
<div class="pv-2">${pvNum('Largura útil (m)','roofW','min="0" max="1000" step="0.01"')}${pvNum('Altura útil (m)','roofH','min="0" max="1000" step="0.01"')}</div>
<p class="note">Opcional: a área livre do telhado, já sem afastamentos às bordas. Serve para saber quantos painéis cabem.</p>
<button type="button" class="btn alt" data-pva="yield" ${pvBusy?'disabled':''}>${pvBusy==='yield'?'A calcular…':'Calcular produção (PVGIS)'}</button>
<p class="note" id="pv-msg" role="status">${esc(pvMsg)}</p>
<h3 class="pv-sub">Equipamento</h3>
${pvSelect('Painel','panel',c.panels,[],i=>i.length?` · ${i.length.toFixed(2).replace('.',',')} × ${i.width.toFixed(2).replace('.',',')} m`:'')}
${pvNum('Número de painéis','panels','min="0" max="10000" step="1" placeholder="Automático: '+first.suggested+'"','Deixe vazio para usar a sugestão.')}
${pvSelect('Inversor','inverter',inv,[['','Automático'+(first.suggestedInv?': '+first.suggestedInv.name:'')],['none','Sem inversor']],i=>i.micro?' (microinversor, 1 por painel)':i.hybrid?' (híbrido)':' (rede)')}
${first.inverter&&!first.inverter.micro?pvNum('Quantidade de inversores','inverterQty','min="1" max="50" step="1"'):''}
${pvSelect('Bateria','battery',bat,[['','Sem bateria']],i=>' · '+pvFmt(i.kwh)+' kWh')}
${pv.battery?pvNum('Quantidade de baterias','batteryQty','min="1" max="50" step="1"'):''}
${pvSelect('Backup','backup',c.backups,[['','Sem backup']])}
${pvSelect('Carregador para carro elétrico','charger',c.chargers,[['','Sem carregador']])}
${pvSelect('Estrutura','structure',PV_ROOFS.find(r=>r.id===pv.roof)?.kind==='outro'?c.structures:structures.length?structures:c.structures,[['','Automático para o tipo de cobertura'],['none','A definir (não incluir)']])}
${first.structureLines.some(s=>c.fixings.includes(s.item))||pv.fixing?pvSelect('Fixações ao telhado','fixing',c.fixings,[['','Automático'],['none','Não incluir']]):''}
${pvSelect('Quadro de proteções CC/CA','board',c.boards,[['','Automático'],['none','Não incluir']])}
<h3 class="pv-sub">Resultado</h3><div id="pv-results" aria-live="polite">${pvResults()}</div>
<button type="button" class="link neg" data-pva="remove">Remover o dimensionamento</button></div>`;
}
const pvRefresh=()=>{const el=document.querySelector('#pv-card');if(el){el.outerHTML=pvSection().replace(/^<h2>[^<]*<\/h2>/,'')}};
const pvRefreshResults=()=>{const el=document.querySelector('#pv-results');if(el)el.innerHTML=pvResults()};
document.addEventListener('input',e=>{
 const t=e.target,k=t.dataset?.pv;if(!k||!quoteDraft?.pv)return;
 quoteDraft.pv[k]=['place','roof','layout','panel','inverter','battery','backup','charger','structure','fixing','board'].includes(k)?t.value:t.value===''?0:Number(t.value);
 if(t.tagName==='SELECT'){if(k==='roof'){const r=PV_ROOFS.find(r=>r.id===t.value);if(r?.tilt)quoteDraft.pv.tilt=r.tilt;quoteDraft.pv.structure='';quoteDraft.pv.fixing=''}if(k==='phase'||k==='battery')quoteDraft.pv.inverter=quoteDraft.pv.inverter==='none'?'none':'';pvRefresh()}
 else pvRefreshResults();
});
// Ticking "UPAC (fotovoltaico)" shows the sizing section straight away.
document.addEventListener('change',e=>{if(e.target.dataset?.qt==='UPAC (fotovoltaico)'&&quoteDraft&&typeof render==='function')render()});
async function pvLocate(){
 const pv=quoteDraft.pv,q=String(pv.place||quoteDraft.address||'').trim();
 if(!q){pvMsg='Escreva a morada ou a localidade.';return false}
 const r=await API('pv/local?q='+encodeURIComponent(q)),b=await r.json().catch(()=>({}));
 if(!r.ok){pvMsg=b.error||'Não foi possível localizar a morada.';return false}
 Object.assign(pv,{lat:Math.round(b.lat*1e4)/1e4,lon:Math.round(b.lon*1e4)/1e4,located:b.label,place:q});pvMsg='Morada localizada.';return true;
}
async function pvYield(){
 const pv=quoteDraft.pv,r=await API(`pv/producao?lat=${pv.lat}&lon=${pv.lon}&angle=${pv.tilt}&aspect=${pv.azimuth}`),b=await r.json().catch(()=>({}));
 if(!r.ok){pvMsg=b.error||'O PVGIS não respondeu. A produção fica estimada.';return}
 pv.yield={key:pvYieldKey(pv),annual:b.annual,monthly:b.monthly,source:'PVGIS'};pvMsg=`PVGIS: ${pvFmt(b.annual,0)} kWh por kWp instalado, por ano.`;
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-pva]');if(!b||!quoteDraft||pvBusy)return;
 const a=b.dataset.pva;
 if(a==='start'){quoteDraft.pv=newPv(quoteDraft.address);if(!quoteDraft.topics.includes('UPAC (fotovoltaico)'))quoteDraft.topics.push('UPAC (fotovoltaico)');pvMsg='';render();return}
 if(a==='remove'){if(!window.confirm('Remover o dimensionamento? As linhas já adicionadas ao orçamento ficam.'))return;delete quoteDraft.pv;quoteDraft.lines.forEach(l=>delete l.pv);render();return}
 if(a==='locate'||a==='yield'){
  pvBusy=a;pvMsg='';pvRefresh();
  // "Localizar" finds the address and then asks PVGIS; "Calcular" uses the latitude and longitude as they are.
  try{if(a==='yield'||await pvLocate())await pvYield()}
  catch{pvMsg='Sem ligação ao servidor. A produção fica estimada.'}
  finally{pvBusy='';pvRefresh()}
  return;
 }
 if(a==='apply'){
  const d=pvDesign(quoteDraft.pv,pvCatalogNow());
  const keep=quoteDraft.lines.filter(l=>!l.pv&&!quoteLineBlank(l));
  quoteDraft.lines=[...d.lines.map(l=>({...l})),...keep];quoteEnsureBlank();
  if(!quoteDraft.topics.includes('UPAC (fotovoltaico)'))quoteDraft.topics.push('UPAC (fotovoltaico)');
  quoteDraft.pv.result=pvSnapshot(d,quoteDraft.pv,pvPrice(d));
  quoteError='Material do dimensionamento adicionado. Reveja as linhas e guarde o orçamento.';render();
  document.querySelector('#quote-lines')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 }
});
// PDF page with the study: system, yearly figures and the monthly chart.
function pvPdfSection(doc,r,{navy,grey,soft,money}){
 const f=pvFmt;let y=50;
 doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(...grey);doc.text('ESTUDO FOTOVOLTAICO',16,y);
 doc.setFontSize(13);doc.setTextColor(...navy);doc.text(`Sistema de ${f(r.kwp,2)} kWp · ${r.panels} painéis`,16,y+7);y+=12;
 const rows=[['Painéis',r.panels+' × '+r.panel],r.inverter&&['Inversor',r.inverter],r.battery&&['Bateria',r.battery+' ('+f(r.batteryKwh)+' kWh)'],r.backup&&['Backup',r.backup],r.charger&&['Carregador para carro elétrico',r.charger],
  ['Cobertura',r.roof+' · inclinação '+f(r.tilt,0)+'° · orientação '+r.orientation],['Consumo anual',f(r.consumption,0)+' kWh'],['Produção anual estimada',f(r.production,0)+' kWh'],
  ['Energia consumida diretamente',f(r.self,0)+' kWh ('+f(r.selfShare,0)+'% da produção)'],['Consumo coberto pelo solar',f(r.coverage,0)+'%'],['Excedente para a rede',f(r.exported,0)+' kWh'],
  ['Poupança anual estimada',money(r.savings)],r.payback&&['Retorno do investimento','cerca de '+f(r.payback)+' anos']].filter(Boolean);
 doc.autoTable({startY:y,margin:{left:16,right:16,top:46,bottom:20},theme:'plain',body:rows,styles:{font:'helvetica',fontSize:9.5,cellPadding:2.4,textColor:navy,lineColor:[221,228,231],lineWidth:{bottom:.2}},columnStyles:{0:{cellWidth:62,textColor:grey},1:{fontStyle:'bold'}}});
 y=doc.lastAutoTable.finalY+10;if(y>200){doc.addPage();y=50}
 doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(...grey);doc.text('PRODUÇÃO E CONSUMO POR MÊS (kWh)',16,y);y+=4;
 const h=48,w=178,max=Math.max(...r.months.map(m=>Math.max(m.prod,m.cons)),1),step=w/12;
 doc.setFillColor(...soft);doc.rect(16,y,w,h+10,'F');
 r.months.forEach((m,i)=>{const x=16+i*step+step*.18,bw=step*.3,ph=m.prod/max*h,ch=m.cons/max*h;
  doc.setFillColor(242,169,0);doc.rect(x,y+h+2-ph,bw,ph,'F');doc.setFillColor(...navy);doc.rect(x+bw+.8,y+h+2-ch,bw,ch,'F');
  doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...grey);doc.text(m.label,16+i*step+step/2,y+h+7.5,{align:'center'})});
 y+=h+16;doc.setFillColor(242,169,0);doc.rect(16,y-2.5,3,3,'F');doc.setFillColor(...navy);doc.rect(44,y-2.5,3,3,'F');doc.setFontSize(8);doc.setTextColor(...navy);doc.text('Produção',21,y);doc.text('Consumo',49,y);
 doc.setFontSize(7.5);doc.setTextColor(...grey);
 doc.text(doc.splitTextToSize(`Valores estimados${r.source==='PVGIS'?' com dados de radiação do PVGIS (Comissão Europeia)':''}, para o local, a inclinação e a orientação indicados. Poupança calculada a ${money(r.buy).replace(' €','')} €/kWh comprado${r.sell?' e '+money(r.sell).replace(' €','')+' €/kWh vendido':''}. A produção real depende do clima, de sombras e do perfil de consumo.`,178),16,y+8);
}
