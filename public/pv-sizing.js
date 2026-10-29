// Solar PV sizing: reads panels, inverters, batteries, backup, EV chargers and structures from the price
// tables, proposes the system for the client's yearly consumption and estimates self-consumption and savings.
(function(root){
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const dec=s=>Number(String(s).replace(',','.'));
  const round=(n,d=2)=>Math.round((n+Number.EPSILON)*10**d)/10**d;
  const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
  const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  // Typical share of the yearly output per month in mainland Portugal, used until PVGIS answers.
  const PV_SHARE=[.05,.06,.085,.09,.105,.11,.115,.11,.09,.075,.06,.05];
  // Roof types; `fit` picks the structures that suit them. Structures added to the price tables later
  // (e.g. "Estrutura triangular" or "Gancho telha lusa") are offered as soon as their name matches.
  const ROOFS=[
    {id:'lusa',label:'Telha lusa',kind:'telha',word:'lusa'},
    {id:'marselha',label:'Telha marselha',kind:'telha',word:'marselha'},
    {id:'plana',label:'Telha plana / ardósia',kind:'telha',word:'ardosia'},
    {id:'sandwich',label:'Chapa / painel sandwich',kind:'sandwich',word:'sandwich'},
    {id:'terraco',label:'Terraço / cobertura plana (estrutura triangular)',kind:'plano',word:'terraco',tilt:30},
    {id:'solo',label:'Solo',kind:'plano',word:'solo',tilt:30},
    {id:'outro',label:'Outro',kind:'outro',word:'outro'}
  ];
  const FIT={telha:/coplanar|telha|gancho|salvatelha/,sandwich:/sandwich|chapa/,plano:/triang|tabuleiro|betao|izibloc|lastro|terraco|solo/,outro:/./};
  const ORIENTATIONS=[[0,'Sul'],[-45,'Sudeste'],[45,'Sudoeste'],[-90,'Este'],[90,'Oeste'],[180,'Norte']];
  const netPrice=(t,p)=>Math.round(Number(p.price)*(1-Number(t.discount||0)/100)*100)/100;
  const phaseOf=text=>/trifas|goodwe (sdt|smt|gt)\b|stax|\btri\b/.test(text)?3:/monofas/.test(text)?1:0;
  function inverterKw(name){
    let m=name.match(/GW\s?(\d{4,5})(?=[\s_-])/i);if(m)return Number(m[1])/1000;
    m=name.match(/(\d+(?:[.,]\d+)?)\s?kw?(?=[\s_)-]|$)/i);if(m)return dec(m[1]);
    m=name.match(/\bM(\d{2})\b/);return m?Number(m[1]):0;
  }
  function batteryKwh(name){
    const m=name.match(/(\d+(?:[.,]\d+)?)\s?kwh/i)||name.match(/lynx (?:lv u|hv d)\s?(\d+(?:\.\d+)?)/i)||name.match(/m-bat-(\d+(?:\.\d+)?)p/i);
    return m?dec(m[1]):0;
  }
  // S. Energias is the supplier, not a product brand: the client never sees it.
  const label=(brand,text)=>(/^s\.? ?energias$/i.test(brand)?'':brand+' ')+text;
  // Groups every PV product of the price tables by role, with the figures parsed from its name.
  function pvCatalog(tables){
    const c={panels:[],inverters:[],batteries:[],backups:[],chargers:[],structures:[],fixings:[],boards:[]};
    (tables||[]).forEach(t=>{if(t.invoices)return;t.products.forEach(p=>{
      const g=p.group.map(norm),name=String(p.name),n=norm(name),text=g.join(' ')+' '+n;
      const item={key:t.brand+'|'+name,brand:t.brand,name,group:p.group.slice(1).join(' › '),cost:netPrice(t,p),t,p};
      const pv=g[0].startsWith('upac'),ev=g[0].startsWith('carregadores');
      if(pv&&/modulo/.test(g[1]||'')&&!/micro|cabo|12v/.test(g[2]||'')){
        const w=name.match(/(\d{3,4})\s?W\b/),d=name.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})\s*[x×]\s*\d+\s*mm/i);
        if(w)c.panels.push({...item,wp:Number(w[1]),length:d?Number(d[1])/1000:0,width:d?Number(d[2])/1000:0});
      }
      else if(pv&&/microinversor/.test(g[2]||'')){const w=n.match(/potencia (\d+)\s?w/);if(w)c.inverters.push({...item,kw:Number(w[1])/1000,phase:0,hybrid:false,micro:true})}
      else if(pv&&(/^inversor/.test(g[2]||'')||/^inversor/.test(n))&&!/^bateria/.test(n)){const kw=inverterKw(name);if(kw)c.inverters.push({...item,kw,phase:phaseOf(text)||1,hybrid:/hibrid|retrofit|alpha ?ess/.test(text),micro:false})}
      if(pv&&(/bateria/.test(g.slice(1).join(' '))||/^bateria/.test(n))&&(/^bateria/.test(n)||!/base|bmu|pdu|bcu|cabo|armario|suporte|bracket|asas|wall|floor|modulo hv/.test(n))){const kwh=batteryKwh(name);if(kwh)c.batteries.push({...item,kwh})}
      if(pv&&/backup/.test(n))c.backups.push({...item,phase:phaseOf(n)});
      if((ev&&!/^acessorios/.test(g[1]||'')&&!/adaptador|cabo|tomada|bolsa|pedestal|suporte|card|sensor/.test(n))||(pv&&/^carregador/.test(n))){
        const kw=n.match(/(\d+(?:[.,]\d+)?)\s?kw?\b/);c.chargers.push({...item,kw:kw?dec(kw[1]):0,phase:phaseOf(n)});
      }
      if(pv&&/estrutura/.test(g[1]||'')){
        const kit=n.match(/coplanar (\d+) paineis/);
        if(!kit&&/^(fixacao|gancho)/.test(n))c.fixings.push(item);
        else if(!/^fixador/.test(n)){const fix=n.match(/acrescentar (\d+) fixa/),min=n.match(/min\.?\s*(\d+)/);c.structures.push({...item,kit:kit?Number(kit[1]):0,fix:fix?Number(fix[1]):0,perPanel:/por modulo/.test(n),min:min?Number(min[1]):0,text:(g[2]&&!/^acessorios/.test(g[2])?g[2]+' ':'')+n})}
      }
      if(pv&&/quadro (cc|de prote)/.test(n)){const s=n.match(/(\d+) string/),kw=n.match(/(\d+(?:[.,]\d+)?)\s?kw/);c.boards.push({...item,strings:s?Number(s[1]):1,kw:kw?dec(kw[1]):0,phase:phaseOf(n)})}
    })});
    c.inverters.sort((a,b)=>a.micro-b.micro||a.phase-b.phase||a.kw-b.kw);c.batteries.sort((a,b)=>a.kwh-b.kwh);
    return c;
  }
  const roofOf=id=>ROOFS.find(r=>r.id===id)||ROOFS[0];
  // Structures that suit the roof, the ones naming it (e.g. "lusa") first.
  function structuresFor(c,roofId){
    const r=roofOf(roofId),fit=c.structures.filter(s=>FIT[r.kind].test(s.text));
    return fit.sort((a,b)=>b.text.includes(r.word)-a.text.includes(r.word));
  }
  function newPv(address=''){return {consumption:0,coverage:80,dayShare:40,phase:1,place:String(address||''),lat:41.767,lon:-8.583,located:'',roof:'lusa',tilt:30,azimuth:0,layout:'vertical',roofW:0,roofH:0,panel:'',panels:0,inverter:'',inverterQty:1,battery:'',batteryQty:1,backup:'',charger:'',structure:'',fixing:'',board:'',buy:.2,sell:.05,yield:null}}
  const yieldKey=pv=>[Number(pv.lat).toFixed(3),Number(pv.lon).toFixed(3),Number(pv.tilt),Number(pv.azimuth)].join(',');
  // Rough yearly kWh per kWp for Portugal when PVGIS is unavailable: latitude, tilt and orientation.
  function estimateYield(pv){
    const base=1550-(Math.min(Math.max(Number(pv.lat)||40,36.9),42.2)-37)*45,az=Number(pv.azimuth)*Math.PI/180,tilt=Number(pv.tilt)||0;
    const f=(1-.00012*(tilt-33)**2)*(1-.17*(1-Math.cos(az))*Math.min(tilt,60)/30);
    return Math.round(base*Math.max(f,.45));
  }
  // How many panels fit on the usable area, with 2 cm between panels.
  function roofFit(panel,w,h,layout){
    if(!panel||!panel.length||!(w>0)||!(h>0))return null;
    const gap=.02,pw=layout==='horizontal'?panel.length:panel.width,ph=layout==='horizontal'?panel.width:panel.length;
    const cols=Math.floor((w+gap)/(pw+gap)),rows=Math.floor((h+gap)/(ph+gap));
    return {cols,rows,total:Math.max(cols,0)*Math.max(rows,0)};
  }
  // Splits the panels into rows of coplanar kits of similar size, e.g. 14 panels = 2 × 7.
  function kitRows(n,kits,perRow){
    const sizes=kits.map(k=>k.kit).filter(Boolean),max=Math.min(Math.max(...sizes,0),perRow||Infinity),min=Math.min(...sizes);
    if(!n||!sizes.length||max<min)return [];
    const rows=Math.ceil(n/max),base=Math.floor(n/rows),extra=n%rows,out=new Map();
    for(let i=0;i<rows;i++){let s=base+(i<extra?1:0);const k=kits.filter(k=>k.kit>=s).sort((a,b)=>a.kit-b.kit)[0]||kits.sort((a,b)=>b.kit-a.kit)[0];out.set(k,(out.get(k)||0)+1)}
    return [...out];
  }
  const find=(list,key)=>list.find(i=>i.key===key);
  function pvDesign(pv,c,extraKwh=0){
    const warnings=[],consumption=Math.max(Number(pv.consumption)||0,0);
    const panel=find(c.panels,pv.panel)||c.panels[0]||null;
    const fresh=pv.yield&&pv.yield.key===yieldKey(pv)&&pv.yield.annual>0;
    const kwhKwp=fresh?pv.yield.annual:estimateYield(pv);
    const monthlyKwp=fresh&&pv.yield.monthly?.length===12?pv.yield.monthly:PV_SHARE.map(s=>s*kwhKwp);
    const fit=roofFit(panel,Number(pv.roofW),Number(pv.roofH),pv.layout);
    let suggested=panel&&consumption?Math.max(1,Math.ceil(consumption*(Number(pv.coverage)||0)/100/kwhKwp/(panel.wp/1000))):0;
    if(fit&&fit.total&&suggested>fit.total){warnings.push(`A área indicada só leva ${fit.total} painéis (${fit.cols} × ${fit.rows}); a proposta foi limitada a esse número.`);suggested=fit.total}
    const n=Math.round(Number(pv.panels))>0?Math.round(Number(pv.panels)):suggested;
    if(fit&&n>fit.total)warnings.push(`${n} painéis não cabem na área indicada (máximo ${fit.total}).`);
    const kwp=panel?round(n*panel.wp/1000,2):0;
    const battery=find(c.batteries,pv.battery)||null,batteryQty=battery?Math.max(1,Math.round(Number(pv.batteryQty)||1)):0;
    // Suggests the smallest inverter for the phase (hybrid with a battery) keeping DC/AC up to 1.25.
    const fits=c.inverters.filter(i=>!i.micro&&i.phase===Number(pv.phase)&&(!(battery||extraKwh>0)||i.hybrid));
    const suggestedInv=kwp?(fits.filter(i=>i.kw>=kwp/1.25)[0]||fits[fits.length-1]||null):null;
    const inverter=pv.inverter==='none'?null:find(c.inverters,pv.inverter)||suggestedInv;
    const inverterQty=inverter?(inverter.micro?n:Math.max(1,Math.round(Number(pv.inverterQty)||1))):0;
    const ac=inverter?round(inverter.kw*inverterQty,2):0,ratio=ac?kwp/ac:0;
    if(inverter&&!inverter.micro&&ratio>1.35)warnings.push(`Os painéis (${fmt(kwp)} kWp) estão muito acima do inversor (${fmt(ac)} kW): escolha um inversor maior.`);
    if(inverter&&!inverter.micro&&ratio&&ratio<.8)warnings.push(`O inversor (${fmt(ac)} kW) está sobredimensionado para ${fmt(kwp)} kWp.`);
    if(inverter&&!inverter.micro&&inverter.phase!==Number(pv.phase))warnings.push(`O inversor escolhido é ${inverter.phase===3?'trifásico':'monofásico'} e a instalação é ${Number(pv.phase)===3?'trifásica':'monofásica'}.`);
    if((battery||extraKwh>0)&&inverter&&!inverter.hybrid)warnings.push('Com bateria é preciso um inversor híbrido; o inversor escolhido é de rede.');
    if(Number(pv.phase)===1&&ac>6.9)warnings.push('Acima de 6,9 kW de inversor, a ligação costuma ter de ser trifásica.');
    if(inverter&&inverter.micro&&panel&&panel.wp>inverter.kw*1000*1.35)warnings.push(`O microinversor de ${fmt(inverter.kw*1000,0)} W é pequeno para painéis de ${panel.wp} W.`);
    const backup=find(c.backups,pv.backup)||null,charger=find(c.chargers,pv.charger)||null;
    if(backup&&backup.phase&&backup.phase!==Number(pv.phase))warnings.push('O backup escolhido não corresponde ao número de fases da instalação.');
    if(charger&&charger.phase===3&&Number(pv.phase)===1)warnings.push('O carregador escolhido é trifásico e a instalação é monofásica.');
    // Structure: automatic picks coplanar kits on tiles and per-panel structures elsewhere; "none" leaves it to be defined.
    const roof=roofOf(pv.roof),options=structuresFor(c,pv.roof),structureLines=[];
    let structure=null,structureNote='';
    if(pv.structure!=='none'&&n){
      const chosen=find(c.structures,pv.structure);
      const kits=options.filter(s=>s.kit);
      if(chosen&&!chosen.kit)structure={item:chosen,qty:chosen.perPanel?Math.max(n,chosen.min):n};
      else if((chosen&&chosen.kit)||(!chosen&&roof.kind==='telha'&&kits.length)){
        const rows=kitRows(n,chosen?c.structures.filter(s=>s.kit):kits,fit?.cols);
        rows.forEach(([k,q])=>structureLines.push({item:k,qty:q}));
        const fixes=rows.reduce((s,[k,q])=>s+k.fix*q,0),fix=find(c.fixings,pv.fixing)||c.fixings.find(f=>norm(f.name).includes(roof.word))||c.fixings.find(f=>/salvatelha|gancho/i.test(f.name))||c.fixings[0];
        if(fixes&&fix&&pv.fixing!=='none')structureLines.push({item:fix,qty:fixes});
      }
      else if(!chosen){
        const pick=roof.kind==='outro'?null:options.filter(s=>!s.kit).sort((a,b)=>b.perPanel-a.perPanel||norm(b.name).includes(pv.layout)-norm(a.name).includes(pv.layout))[0];
        if(pick)structure={item:pick,qty:pick.perPanel?Math.max(n,pick.min):n};
        else structureNote=roof.kind==='outro'?'Escolha a estrutura na lista: por agora fica a definir.':`Ainda não há estruturas para «${roof.label}» na tabela de preços: a estrutura fica a definir.`;
      }
      if(structure)structureLines.unshift(structure);
    }else if(n)structureNote='Estrutura a definir.';
    // Protection board: smallest for the phase that covers the inverter power.
    const boards=c.boards.filter(b=>!b.phase||b.phase===Number(pv.phase)).sort((a,b)=>a.kw-b.kw);
    const board=pv.board==='none'||(inverter&&inverter.micro)?null:find(c.boards,pv.board)||(ac?boards.find(b=>b.kw>=ac)||boards[boards.length-1]:null)||null;
    // Monthly balance: daytime use is covered first, the battery stores part of the surplus for the night.
    const dayShare=Math.min(Math.max(Number(pv.dayShare)||0,0),100)/100,storage=(battery?battery.kwh*batteryQty:0)+(Number(extraKwh)||0),store=storage*.9;
    const months=MONTHS.map((label,m)=>{
      const cons=consumption*DAYS[m]/365,prod=kwp*monthlyKwp[m],direct=Math.min(prod,cons*dayShare);
      const charged=Math.min((prod-direct)*.95,cons-direct,store*DAYS[m]*.85),self=direct+charged;
      return {label,cons,prod,self,stored:charged,exported:Math.max(prod-direct-charged/.95,0),grid:Math.max(cons-self,0)};
    });
    const sum=k=>months.reduce((s,m)=>s+m[k],0),production=sum('prod'),self=sum('self'),exported=sum('exported'),stored=sum('stored');
    const savings=self*(Number(pv.buy)||0)+exported*(Number(pv.sell)||0);
    const dailyNight=consumption/365*(1-dayShare);
    const lines=[];
    const add=(item,qty,kind='Equipamento')=>{if(item&&qty>0)lines.push({kind,description:label(item.brand,(item.p.ref?item.p.ref+' – ':'')+item.name),quantity:qty,unit:item.p.unit||'un.',value:item.cost,catalog:{brand:item.brand,ref:item.p.ref||'',price:Number(item.p.price),discount:Number(item.t.discount||0)},pv:true})};
    add(panel,n);add(inverter,inverterQty);add(battery,batteryQty);add(backup,1);add(charger,1);
    structureLines.forEach(s=>add(s.item,s.qty,c.fixings.includes(s.item)?'Acessórios':'Material'));add(board,board?1:0,'Material');
    return {panel,n,suggested,fit,kwp,kwhKwp,source:fresh?pv.yield.source||'PVGIS':'estimativa',inverter,suggestedInv,inverterQty,ac,ratio,battery,batteryQty,
      batteryHint:round(dailyNight*.8,1),backup,charger,structureLines,structureNote,structureOptions:options,board,months,production,self,exported,stored,storage,extraKwh:Number(extraKwh)||0,
      grid:sum('grid'),consumption,selfShare:production?self/production:0,coverage:consumption?self/consumption:0,savings,warnings,lines};
  }
  function fmt(n,d=1){return Number(n||0).toLocaleString('pt-PT',{maximumFractionDigits:d,minimumFractionDigits:0})}
  // What the PDF shows; kept in the quote so it does not change when the price tables do.
  function pvSnapshot(d,pv,price){
    return {kwp:d.kwp,panels:d.n,panel:d.panel?label(d.panel.brand,d.panel.name):'',inverter:d.inverter?(d.inverterQty>1?d.inverterQty+' × ':'')+label(d.inverter.brand,d.inverter.name):'',
      battery:d.battery?(d.batteryQty>1?d.batteryQty+' × ':'')+label(d.battery.brand,d.battery.name):'',batteryKwh:round(d.storage,2),extraBattery:round(d.extraKwh,2),stored:round(d.stored,0),grid:round(d.grid,0),
      backup:d.backup?d.backup.name:'',charger:d.charger?label(d.charger.brand,d.charger.name):'',roof:roofOf(pv.roof).label,tilt:Number(pv.tilt),orientation:(ORIENTATIONS.find(o=>o[0]===Number(pv.azimuth))||[0,Number(pv.azimuth)+'°'])[1],
      consumption:round(d.consumption,0),production:round(d.production,0),self:round(d.self,0),exported:round(d.exported,0),selfShare:round(d.selfShare*100,0),coverage:round(d.coverage*100,0),
      savings:round(d.savings,0),buy:Number(pv.buy),sell:Number(pv.sell),price:round(price||0,2),payback:d.savings>0&&price?round(price/d.savings,1):0,source:d.source,
      months:d.months.map(m=>({label:m.label,prod:round(m.prod,0),cons:round(m.cons,0)}))};
  }
  Object.assign(root,{pvCatalog,pvBatteryKwh:batteryKwh,pvLabel:label,pvDesign,pvSnapshot,newPv,pvYieldKey:yieldKey,pvEstimateYield:estimateYield,pvStructuresFor:structuresFor,pvFmt:fmt,PV_ROOFS:ROOFS,PV_ORIENTATIONS:ORIENTATIONS});
})(globalThis);
