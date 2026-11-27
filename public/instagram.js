/* «Criar para Instagram»: a partir das fotos de uma obra (Fotos para o site e as propostas), a app desenha
   a publicação (1080×1350), o carrossel, a história (1080×1920) e um Reel em vídeo (1080×1920, fotos com movimento e texto),
   com o logótipo e as cores da ENAT, e escreve o texto com as hashtags locais. Tudo no telemóvel/computador, sem custos. */
const IG={open:'',busy:'',msg:'',out:{},texto:''};
const IG_NOME={'UPAC (fotovoltaico)':'Painéis solares fotovoltaicos','Ar condicionado':'Ar condicionado','Bomba de calor AQS':'Bomba de calor para água quente','Bomba de calor climatização':'Bomba de calor para aquecimento','Ventiloconvectores':'Ventiloconvectores','Painéis solares térmicos':'Painéis solares térmicos','Carregador automóvel':'Carregador para carro elétrico','Piso radiante':'Piso radiante','VMC':'Ventilação mecânica (VMC)','Geral / outros':'Obra concluída'};
const IG_FRASE={'UPAC (fotovoltaico)':'Mais uma casa a produzir a própria energia','Ar condicionado':'Fresco no verão, quentinho no inverno','Bomba de calor AQS':'Água quente com uma fatura mais baixa','Bomba de calor climatização':'Casa quente com menos gastos','Piso radiante':'Conforto que vem do chão','Carregador automóvel':'Carregar o carro em casa, com segurança','VMC':'Ar novo, sem humidade nem bolores','Painéis solares térmicos':'Água quente com a energia do sol','Ventiloconvectores':'Calor e frio rápidos em cada divisão','Geral / outros':'Mais um trabalho concluído'};
const IG_TAGS={'UPAC (fotovoltaico)':'#paineissolares #fotovoltaico #autoconsumo #energiasolar','Ar condicionado':'#arcondicionado #climatizacao #conforto','Bomba de calor AQS':'#bombadecalor #aguasquentes #poupanca','Bomba de calor climatização':'#bombadecalor #aquecimento #aerotermia','Piso radiante':'#pisoradiante #aquecimento #conforto','Carregador automóvel':'#carroeletrico #wallbox #mobilidadeeletrica','VMC':'#vmc #ventilacao #qualidadedoar','Painéis solares térmicos':'#solartermico #aguasquentes #energiasolar','Ventiloconvectores':'#ventiloconvectores #climatizacao','Geral / outros':'#energiasrenovaveis'};
const igTel=()=>String(globalThis.ENAT_EMPRESA?.contacto?.telefone||'938 928 495').replace(/^\+?351\s*/,'').trim();
const igMes=m=>{const d=new Date(String(m||'')+'-01T12:00:00');return isNaN(d)?'':d.toLocaleDateString('pt-PT',{month:'long',year:'numeric'})};
const igSlug=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function igTexto(c,p){
 const nome=c.titulo||IG_NOME[c.tipo]||c.tipo,local=p.local||'',frase=IG_FRASE[c.tipo]||IG_FRASE['Geral / outros'];
 return `✅ ${frase}${local?' em '+local:''}!\n\n${nome}${p.descricao?': '+String(p.descricao).trim().replace(/\.$/,''):''}. Tratámos de tudo, do orçamento à instalação.\n\n📞 Orçamento grátis: ${igTel()}\n🌐 enat-pontedelima.pt\n\n${local?'#'+igSlug(local)+' ':''}#altominho #vianadocastelo ${IG_TAGS[c.tipo]||''} #enat`;
}
// ---- Desenho ----
const igImg=src=>new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=ko;i.src=src});
function igCover(x,img,X,Y,W,H,zoom=1,px=.5,py=.5){const s=Math.max(W/img.width,H/img.height)*zoom,w=img.width*s,h=img.height*s;x.save();x.beginPath();x.rect(X,Y,W,H);x.clip();x.drawImage(img,X+(W-w)*px,Y+(H-h)*py,w,h);x.restore()}
function igRound(x,X,Y,W,H,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+W,Y,X+W,Y+H,r);x.arcTo(X+W,Y+H,X,Y+H,r);x.arcTo(X,Y+H,X,Y,r);x.arcTo(X,Y,X+W,Y,r);x.closePath()}
function igWrap(x,t,X,Y,maxW,lh,maxL=3){const ws=String(t).split(/\s+/);let line='',n=0;for(const w of ws){const tst=line?line+' '+w:w;if(x.measureText(tst).width>maxW&&line){x.fillText(line,X,Y+n*lh);n++;line=w;if(n>=maxL)return n}else line=tst}if(line){x.fillText(line,X,Y+n*lh);n++}return n}
const igLaranja=(x,X,Y,W,H)=>{const g=x.createLinearGradient(X,Y,X+W,Y+H);g.addColorStop(0,'#f6a823');g.addColorStop(1,'#ec7d0f');return g};
function igPill(x,t,X,Y,size,fill){x.font=`700 ${size}px system-ui,Segoe UI,Arial`;const w=x.measureText(t).width+size*1.4,h=size*1.9;igRound(x,X,Y,w,h,h/2);x.fillStyle=fill||igLaranja(x,X,Y,w,h);x.fill();x.fillStyle='#fff';x.textBaseline='middle';x.fillText(t,X+size*.7,Y+h/2+1);x.textBaseline='alphabetic';return w}
function igGrad(x,W,H,from,to){const g=x.createLinearGradient(0,H*from,0,H);g.addColorStop(0,'rgba(13,42,19,0)');g.addColorStop(.45,'rgba(13,42,19,.6)');g.addColorStop(1,'rgba(13,42,19,.97)');x.fillStyle=g;x.fillRect(0,H*from,W,H*(1-from))}
const igCanvas=(W,H)=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c};
async function igPublicacao(d){
 const c=igCanvas(1080,1350),x=c.getContext('2d');igCover(x,d.fotos[d.capa],0,0,1080,1350);
 const t=x.createLinearGradient(0,0,0,300);t.addColorStop(0,'rgba(13,42,19,.6)');t.addColorStop(1,'rgba(13,42,19,0)');x.fillStyle=t;x.fillRect(0,0,1080,300);
 igGrad(x,1080,1350,.5,0);if(d.logo)x.drawImage(d.logo,56,48,78*d.logo.width/d.logo.height,78);
 x.font='700 28px system-ui,Segoe UI,Arial';const pw=x.measureText('☀ Obra concluída').width+40;igPill(x,'☀ Obra concluída',1024-pw,58,28);
 x.fillStyle='#f6a823';x.font='700 30px system-ui,Segoe UI,Arial';x.fillText(('📍 '+[d.local,d.mes].filter(Boolean).join(' · ')).toUpperCase(),64,1000);
 x.fillStyle='#fff';x.font='800 70px system-ui,Segoe UI,Arial';const n=igWrap(x,d.nome,64,1085,950,76,2);
 if(d.desc){x.font='500 32px system-ui,Segoe UI,Arial';x.fillStyle='rgba(255,255,255,.92)';igWrap(x,d.desc,64,1085+n*76+10,950,42,2)}
 x.font='500 30px system-ui,Segoe UI,Arial';x.fillStyle='#fff';x.fillText('Orçamento grátis · '+igTel(),64,1290);x.globalAlpha=.85;x.textAlign='right';x.fillText('enat-pontedelima.pt',1016,1290);x.textAlign='left';x.globalAlpha=1;
 return c;
}
async function igCarrossel(d){
 const c=igCanvas(1080,1350),x=c.getContext('2d');x.fillStyle='#f3f8f2';x.fillRect(0,0,1080,1350);
 x.fillStyle='#226c2e';x.font='800 32px system-ui,Segoe UI,Arial';x.fillText('COMO FOI A OBRA',56,92);x.fillStyle='#6b7080';x.font='500 26px system-ui,Segoe UI,Arial';x.textAlign='right';x.fillText((d.local?d.local+' · ':'')+'deslize →',1024,92);x.textAlign='left';
 const fs=d.fotos.slice(0,4),cols=fs.length<=1?1:2,rows=Math.ceil(fs.length/cols),gw=968,gh=1000,gap=16,cw=(gw-gap*(cols-1))/cols,ch=(gh-gap*(rows-1))/rows;
 fs.forEach((img,i)=>{const X=56+(i%cols)*(cw+gap),Y=124+Math.floor(i/cols)*(ch+gap);x.save();igRound(x,X,Y,cw,ch,24);x.clip();igCover(x,img,X,Y,cw,ch);x.restore();igPill(x,(i+1)+'',X+16,Y+16,26)});
 x.fillStyle='#163f1e';x.fillRect(0,1150,1080,200);if(d.logo)x.drawImage(d.logo,56,1180,62*d.logo.width/d.logo.height,62);
 x.fillStyle='rgba(255,255,255,.88)';x.font='500 26px system-ui,Segoe UI,Arial';x.fillText(d.nome+(d.local?' · '+d.local:''),56,1290);
 x.font='700 28px system-ui,Segoe UI,Arial';const w=x.measureText(igTel()).width+40;igPill(x,igTel(),1024-w,1216,28);
 return c;
}
function igHistoriaFrame(x,d,img,zoom=1,alpha=1){
 x.fillStyle='#0d2a13';x.fillRect(0,0,1080,1920);igCover(x,img,0,0,1080,1920,zoom);
 const t=x.createLinearGradient(0,0,0,1920);t.addColorStop(0,'rgba(13,42,19,.7)');t.addColorStop(.18,'rgba(13,42,19,0)');t.addColorStop(.5,'rgba(13,42,19,0)');t.addColorStop(.82,'rgba(13,42,19,.95)');x.fillStyle=t;x.fillRect(0,0,1080,1920);
 x.globalAlpha=alpha;if(d.logo)x.drawImage(d.logo,70,150,90*d.logo.width/d.logo.height,90);
 igPill(x,'Nova instalação ☀',70,1090,34);x.fillStyle='#fff';x.font='800 86px system-ui,Segoe UI,Arial';const n=igWrap(x,d.frase,70,1260,940,92,3);
 x.font='500 40px system-ui,Segoe UI,Arial';x.fillText('📍 '+[d.local,d.nome].filter(Boolean).join(' · '),70,1260+n*92+14);
 igRound(x,70,1680,940,130,28);x.fillStyle='#fff';x.fill();x.fillStyle='#163f1e';x.font='700 40px system-ui,Segoe UI,Arial';x.textAlign='center';x.fillText('Orçamento grátis · '+igTel(),540,1760);x.textAlign='left';x.globalAlpha=1;
}
async function igHistoria(d){const c=igCanvas(1080,1920);igHistoriaFrame(c.getContext('2d'),d,d.fotos[d.capa]);return c}
// Reel: 1,2 s de capa, 2,2 s por foto com zoom lento e transição, e 2,5 s de final com o contacto. Sem música (junta-se no Instagram).
async function igReel(d,prog){
 const c=igCanvas(1080,1920),x=c.getContext('2d'),fps=30,stream=c.captureStream(fps);
 const tipos=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'],mime=tipos.find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));
 if(!mime)throw Error('Este navegador não consegue gravar vídeo. Use o Chrome no computador ou no Android, ou o Safari no iPhone.');
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6e6}),parts=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
 const fotos=d.fotos.slice(0,8),cena=2.2,intro=1.4,outro=2.5,total=intro+fotos.length*cena+outro;
 const draw=t=>{
  if(t<intro){igHistoriaFrame(x,d,fotos[0],1+t*.03,1);return}
  const k=t-intro;
  if(k<fotos.length*cena){const i=Math.min(fotos.length-1,Math.floor(k/cena)),f=(k-i*cena)/cena;x.fillStyle='#000';x.fillRect(0,0,1080,1920);igCover(x,fotos[i],0,0,1080,1920,1.06+f*.08,.5,.5);
   if(f<.18&&i>0){x.globalAlpha=1-f/.18;igCover(x,fotos[i-1],0,0,1080,1920,1.14,.5,.5);x.globalAlpha=1}
   const g=x.createLinearGradient(0,1400,0,1920);g.addColorStop(0,'rgba(13,42,19,0)');g.addColorStop(1,'rgba(13,42,19,.9)');x.fillStyle=g;x.fillRect(0,1400,1080,520);
   if(d.logo)x.drawImage(d.logo,70,120,70*d.logo.width/d.logo.height,70);
   x.fillStyle='#fff';x.font='800 64px system-ui,Segoe UI,Arial';x.fillText(i===0?d.nome:i===fotos.length-1?'Pronto a funcionar ✅':(d.local?'📍 '+d.local:d.nome),70,1780);return}
  const o=(k-fotos.length*cena)/outro;x.fillStyle='#163f1e';x.fillRect(0,0,1080,1920);
  if(d.logo)x.drawImage(d.logo,540-160*d.logo.width/d.logo.height/2,620,160*d.logo.width/d.logo.height,160);
  x.globalAlpha=Math.min(1,o*3);x.fillStyle='#fff';x.textAlign='center';x.font='800 72px system-ui,Segoe UI,Arial';x.fillText('Orçamento grátis',540,960);
  x.font='700 64px system-ui,Segoe UI,Arial';x.fillStyle='#f6a823';x.fillText(igTel(),540,1060);x.fillStyle='rgba(255,255,255,.9)';x.font='500 44px system-ui,Segoe UI,Arial';x.fillText('enat-pontedelima.pt',540,1150);x.textAlign='left';x.globalAlpha=1;
 };
 draw(0);rec.start(250);const t0=performance.now();
 await new Promise(ok=>{const step=()=>{const t=(performance.now()-t0)/1000;if(t>=total){ok();return}draw(t);prog&&prog(Math.round(t/total*100));requestAnimationFrame(step)};requestAnimationFrame(step)});
 draw(total-0.01);await new Promise(r=>setTimeout(r,300));
 const fim=new Promise(r=>rec.onstop=r);rec.stop();await fim;stream.getTracks().forEach(t=>t.stop());
 return new Blob(parts,{type:mime.split(';')[0]});
}
const igBlob=c=>new Promise(r=>c.toBlob(r,'image/jpeg',.9));
async function igDados(c,p){
 const urls=c.fotos.map(id=>PF_URL[id]).filter(Boolean);
 if(!urls.length)throw Error('As fotos ainda estão a carregar. Tente daqui a uns segundos.');
 const fotos=await Promise.all(urls.map(igImg)),logo=await igImg('/logo-claro.svg').catch(()=>null);
 // Capa: a foto mais ao alto/largo de exterior costuma ser a melhor; usa-se a primeira (o utilizador escolhe a ordem ao juntar as fotos).
 return {fotos,logo,capa:0,nome:c.titulo||IG_NOME[c.tipo]||c.tipo,frase:IG_FRASE[c.tipo]||IG_FRASE['Geral / outros'],local:p.local||'',mes:igMes(p.mes),desc:String(p.descricao||'').trim()};
}
function igSection(p,k){
 const cats=(p.cats||[]).filter(c=>c.fotos.length);if(!cats.length)return '';
 return `<h2>Instagram</h2><div class="grp tpad ig">${cats.map((c,ci)=>{const key=k+'|'+ci,o=IG.open===key,out=o?IG.out:{};
  return `<button class="btn alt" data-ig="open" data-k="${esc(key)}" data-c="${(p.cats||[]).indexOf(c)}">📸 Criar para Instagram · ${esc(pfLabel(c.tipo))}</button>${o?`<div class="ig-box">
  <p class="note">A app cria as imagens e o vídeo com as fotos desta obra, o logótipo e o contacto. No telemóvel, toque em «Partilhar» para abrir no Instagram; no computador, descarregue.</p>
  <div class="ig-acts"><button class="btn" data-ig="gerar" ${IG.busy?'disabled':''}>${IG.busy==='img'?'A criar…':'Criar publicação, carrossel e história'}</button><button class="btn" data-ig="reel" ${IG.busy?'disabled':''}>${IG.busy==='reel'?'A gravar o Reel… '+(IG.prog||0)+'%':'🎬 Criar Reel (vídeo)'}</button></div>
  ${IG.msg?`<p class="note" role="status">${esc(IG.msg)}</p>`:''}
  <div class="ig-grid">${Object.entries(out).map(([n,v])=>`<figure>${v.video?`<video src="${v.url}" controls playsinline muted></video>`:`<img src="${v.url}" alt="">`}<figcaption>${esc(v.nome)}</figcaption><div class="ig-fa"><a class="btn alt" href="${v.url}" download="${esc(v.file)}">Descarregar</a>${navigator.canShare?`<button class="btn alt" data-ig="share" data-n="${esc(n)}">Partilhar</button>`:''}</div></figure>`).join('')}</div>
  ${IG.texto?`<label class="q-field"><span>Texto da publicação</span><textarea rows="9" data-ig-t>${esc(IG.texto)}</textarea></label><button class="btn alt" data-ig="copiar">Copiar texto</button>`:''}
  <p class="note">Reel: junte a música no Instagram (botão de música ao publicar). Histórias: junte uma sondagem ou a caixa de perguntas.</p></div>`:''}`}).join('')}</div>`;
}
const igTarget=b=>{const k=b.dataset.k||IG.open,[pk]=String(k).split('|');const p=pk==='o'?pfObra()?.port:(PF_SOLO||[]).find(x=>'s:'+x.id===pk);return p?pfNorm(p):null};
document.addEventListener('input',e=>{if(e.target.matches?.('[data-ig-t]'))IG.texto=e.target.value});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-ig]');if(!b)return;e.stopImmediatePropagation();
 const a=b.dataset.ig;
 if(a==='open'){const same=IG.open===b.dataset.k;Object.values(IG.out).forEach(v=>URL.revokeObjectURL(v.url));Object.assign(IG,{open:same?'':b.dataset.k,ci:Number(b.dataset.c),out:{},msg:'',texto:''});render();return}
 const p=igTarget(b),c=p&&p.cats[IG.ci];if(!c)return;
 if(a==='gerar'||a==='reel'){
  IG.busy=a==='reel'?'reel':'img';IG.msg='';IG.prog=0;render();
  try{
   const d=await igDados(c,p),base='enat-'+igSlug(c.tipo)+'-'+igSlug(p.local||'obra');
   if(a==='gerar'){for(const [n,f,nome] of [['pub',igPublicacao,'Publicação (1080×1350)'],['car',igCarrossel,'Carrossel (1080×1350)'],['hist',igHistoria,'História (1080×1920)']]){const blob=await igBlob(await f(d));IG.out[n]={url:URL.createObjectURL(blob),blob,nome,file:base+'-'+n+'.jpg'}}}
   else{const blob=await igReel(d,v=>{IG.prog=v;const el=document.querySelector('[data-ig="reel"]');if(el)el.textContent='A gravar o Reel… '+v+'%'});const ext=blob.type.includes('mp4')?'mp4':'webm';IG.out.reel={url:URL.createObjectURL(blob),blob,video:true,nome:'Reel ('+Math.round(blob.size/1e5)/10+' MB)',file:base+'-reel.'+ext};if(ext==='webm')IG.msg='O vídeo saiu em formato WebM. Se o Instagram não o aceitar, crie o Reel no Chrome do Android ou no Safari do iPhone (saem em MP4).'}
   IG.texto=IG.texto||igTexto(c,p);
  }catch(err){IG.msg=err.message||'Não foi possível criar.'}
  IG.busy='';render();return;
 }
 if(a==='share'){const v=IG.out[b.dataset.n];if(!v)return;const f=new File([v.blob],v.file,{type:v.blob.type});try{if(navigator.canShare({files:[f]}))await navigator.share({files:[f],text:IG.texto});else IG.msg='Este dispositivo não partilha ficheiros: use «Descarregar».'}catch{}render();return}
 if(a==='copiar'){try{await navigator.clipboard.writeText(IG.texto);IG.msg='Texto copiado. Cole-o na publicação do Instagram.'}catch{IG.msg='Selecione o texto e copie-o à mão.'}render()}
});
