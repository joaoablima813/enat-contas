/* Questionário enviado à lead («Pedir detalhes ao cliente»): perguntas comuns e perguntas de cada tecnologia.
   Usado pela página pública /pedido/<token> (servidor) e pela app, que mostra as respostas na lead e preenche os campos.
   Quase tudo é de escolher com um toque; só a morada e as notas são escritas. */
(function(root){
 const YEARS=['Antes de 1990','1990 a 2005','2006 a 2015','Depois de 2015','Em construção'];
 const ROOMS=['Sala','Quarto','Escritório','Cozinha','Outra'];
 const AC='Ar condicionado',BCC='Bomba de calor climatização',AQS='Bomba de calor AQS',ST='Painéis solares térmicos',PV='Painéis fotovoltaicos',PR='Piso radiante',VMC='VMC',CAR='Carregador automóvel';
 // Perguntas sobre a casa: feitas uma só vez, numa secção própria, e só se alguma solução escolhida precisar delas («for»).
 const HOUSE=[
  {id:'casa',q:'Tipo de imóvel',o:['Moradia','Apartamento','Moradia antiga','Moradia geminada','Comércio / escritório']},
  {id:'ano',q:'Ano aproximado da casa',o:YEARS,for:[AC,BCC,PR,VMC]},
  {id:'jan',q:'Janelas',o:['Vidro simples','Vidro duplo','Não sei'],for:[AC,BCC]},
  {id:'m2',q:'Área útil da casa (m²)',n:[20,2000],ph:'Ex.: 140',for:[BCC,PR,VMC]},
  {id:'obra',q:'Situação da casa',o:['Obra nova','Remodelação','Casa habitada, sem obras'],for:[PR,VMC]},
  {id:'pessoas',q:'Quantas pessoas vivem na casa?',o:['1 a 2','3 a 4','5 ou mais'],for:[AQS,ST]},
  {id:'agua',q:'Como aquece a água hoje?',o:['Esquentador a gás','Termoacumulador elétrico','Caldeira','Painel solar térmico','Outro'],for:[AQS,ST]},
  {id:'telhado',q:'Onde ficariam os painéis?',o:['Telhado de telha','Telhado de chapa','Terraço / laje','No chão / jardim','Não sei'],for:[ST,PV]},
  {id:'fase',q:'A instalação elétrica é…',o:['Monofásica','Trifásica','Não sei'],for:[PV,CAR]},
 ];
 const TECH={
  [AC]:[
   {id:'ac_div',q:'Quantas divisões quer climatizar?',o:['1','2','3','4','5','6 ou mais']},
   // Uma linha por divisão (tipo e área), conforme o número escolhido acima.
   {id:'ac_rooms',q:'Que divisões e com que área?',rooms:'ac_div'},
   {id:'ac_uso',q:'Vai usar sobretudo para…',o:['Arrefecer no verão','Aquecer no inverno','As duas coisas']},
   {id:'ac_ext',q:'Onde pode ficar a máquina exterior?',o:['Varanda','Parede exterior','Telhado','Jardim / quintal','Não sei']},
   {id:'ac_pre',q:'A casa já tem pré-instalação de ar condicionado?',o:['Sim','Não','Não sei']},
  ],
  [BCC]:[
   {id:'bcc_emis',q:'Como é distribuído o calor?',o:['Radiadores','Piso radiante','Ventiloconvectores','Ainda não tenho']},
   {id:'bcc_rad',q:'Quantos radiadores tem a casa?',n:[1,80],ph:'Ex.: 10',if:['bcc_emis','Radiadores']},
   {id:'bcc_elem',q:'Quantos elementos tem cada radiador, em média?',n:[2,40],ph:'Ex.: 10',if:['bcc_emis','Radiadores'],help:'Os elementos são as «fatias» verticais do radiador.'},
   {id:'bcc_atual',q:'Como aquece a casa hoje?',o:['Caldeira a gasóleo','Caldeira a gás','Lenha / salamandra','Aquecedores elétricos','Não aquece']},
   {id:'bcc_aqs',q:'Também quer água quente com a bomba de calor?',o:['Sim','Não']},
  ],
  [AQS]:[
   {id:'aqs_local',q:'Onde pode ficar o depósito?',o:['Garagem','Arrumos / lavandaria','Cozinha','Exterior','Não sei']},
  ],
  [ST]:[],
  [PV]:[
   {id:'pv_fat',q:'Quanto paga de eletricidade por mês, em média?',o:['Até 50 €','50 a 100 €','100 a 150 €','150 a 250 €','Mais de 250 €']},
   {id:'pv_or',q:'Para onde está virado o telhado?',o:['Sul','Este / Oeste','Norte','Não sei']},
   {id:'pv_bat',q:'Quer bateria para usar a energia à noite?',o:['Sim','Não','Quero saber mais']},
   {id:'pv_ev',q:'Tem ou vai ter carro elétrico?',o:['Já tenho','Em breve','Não']},
  ],
  [PR]:[
   {id:'pr_fonte',q:'Com que equipamento quer aquecer a água do piso?',o:['Bomba de calor','Caldeira','Ainda não sei']},
  ],
  [VMC]:[
   {id:'vmc_hum',q:'Tem problemas de humidade ou bolor?',o:['Sim, bastante','Um pouco','Não']},
  ],
  [CAR]:[
   {id:'car_dist',q:'Distância do quadro elétrico ao lugar do carro',o:['Até 10 m','10 a 25 m','Mais de 25 m','Não sei']},
   {id:'car_txt',q:'Que carro tem? (opcional)',t:'Ex.: Tesla Model 3'},
  ],
 };
 const GAMA=[['preco','Melhor preço','Equipamentos fiáveis, ao melhor preço'],['media','Equilíbrio','Gama média: boa eficiência e preço justo'],['qualidade','Máxima qualidade','Gama alta: mais eficiente, mais silenciosa, mais anos']];
 const COMMON=[
  {id:'prazo',q:'Quando pretende fazer a instalação?',o:['O mais rápido possível','Dentro de 1 mês','Dentro de 3 meses','Dentro de 6 meses','Ainda só a pedir valores']},
  {id:'hora',q:'Melhor altura para lhe ligarmos',o:['Manhã (9h–13h)','Tarde (14h–18h)','Fim do dia (18h–20h)','Qualquer hora']},
 ];
 const houseFor=sol=>HOUSE.filter(q=>!q.for||q.for.some(t=>sol.includes(t)));
 const TECHS=Object.keys(TECH);
 const ALL=[...HOUSE,...Object.values(TECH).flat(),...COMMON];
 // Respostas limpas: só soluções e opções conhecidas; textos curtos.
 function clean(b){
  b=b&&typeof b==='object'?b:{};const s=(v,n)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,n):'';
  const sol=(Array.isArray(b.sol)?b.sol:[]).filter(x=>TECHS.includes(x));
  const a={};const ids=new Set([...houseFor(sol),...sol.flatMap(t=>TECH[t]),...COMMON].map(q=>q.id)),raw=b.a||{};
  for(const q of ALL){
   if(!ids.has(q.id)||(q.if&&a[q.if[0]]!==q.if[1]))continue;
   const v=raw[q.id];
   if(q.rooms){const list=(Array.isArray(v)?v:[]).slice(0,12).map(x=>({t:ROOMS.includes(x?.t)?x.t:'Outra',m2:Math.round(Number(x?.m2))})).filter(x=>x.m2>=3&&x.m2<=500);if(list.length)a[q.id]=list}
   else if(q.n){const n=Math.round(Number(v));if(Number.isFinite(n)&&n>=q.n[0]&&n<=q.n[1])a[q.id]=n}
   else{const t=s(v,200);if(t&&(q.t||q.o.includes(t)))a[q.id]=t}
  }
  return {sol,a,gama:GAMA.some(g=>g[0]===b.gama)?b.gama:'',morada:s(b.morada,300),cp:/^\d{4}-\d{3}$/.test(s(b.cp,8))?s(b.cp,8):'',local:s(b.local,80),notas:s(b.notas,1500)};
 }
 const roomsText=list=>(list||[]).map(x=>x.t+' '+x.m2+' m²').join(', ');
 const value=(q,v)=>q.rooms?roomsText(v):q.n?String(v)+(/m²/.test(q.q)?' m²':''):v;
 // Linhas para mostrar na app: [pergunta, resposta].
 function summary(r){
  const out=[['Soluções',r.sol.join(', ')]];const g=GAMA.find(x=>x[0]===r.gama);if(g)out.push(['Gama preferida',g[1]+' ('+g[2].toLowerCase()+')']);
  for(const q of houseFor(r.sol))if(r.a[q.id]!=null&&r.a[q.id]!=='')out.push([q.q,value(q,r.a[q.id])]);
  for(const t of r.sol)for(const q of TECH[t])if(r.a[q.id]!=null&&r.a[q.id]!=='')out.push([q.q.replace(/ \(opcional\)$/,''),value(q,r.a[q.id])]);
  for(const q of COMMON)if(r.a[q.id])out.push([q.q,r.a[q.id]]);
  if(r.morada||r.cp)out.push(['Morada',[r.morada,[r.cp,r.local].filter(Boolean).join(' ')].filter(Boolean).join(', ')]);
  if(r.notas)out.push(['Notas do cliente',r.notas]);
  return out.filter(x=>x[1]);
 }
 // Mensagem com o link (WhatsApp, email manual e email automático às leads novas).
 function message(nome,solutions,me,url){
  const first=String(nome||'').trim().split(/\s+/)[0]||'',sol=(solutions||[]).filter(s=>TECHS.includes(s));me=me||'João Lima';
  return `Olá${first?' '+first:''}, sou ${me}, da Enat - Ponte de Lima. Obrigado pelo seu pedido${sol.length?' de orçamento para '+sol.join(' e ').toLowerCase():' de orçamento'}.\n\nPara lhe enviar uma proposta à medida, sem visitas desnecessárias, pode responder a umas perguntas rápidas (2 minutos) e indicar a morada da instalação?\n\n${url}\n\nObrigado!\n${me}\nEnat - Ponte de Lima`;
 }
 root.EnatPedido={TECH,TECHS,GAMA,COMMON,HOUSE,houseFor,ROOMS,clean,summary,message,roomsText};
})(globalThis);
