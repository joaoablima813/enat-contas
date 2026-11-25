/* Textos da proposta para o cliente: benefícios de cada solução, o que está sempre incluído e as perguntas frequentes.
   Usado pela página pública do orçamento (servidor) e pela app (ecrã Empresa). Os textos são prudentes de propósito:
   não prometem valores que dependem da casa do cliente; os números só aparecem quando vêm do próprio orçamento (ex.: estudo PV). */
(function(root){
 const BENEFITS={
  'Ar condicionado':[
   ['Conforto o ano inteiro','Fresco no verão e calor no inverno, com a temperatura que escolher em cada divisão.'],
   ['Aquece com menos eletricidade','Por cada kWh de eletricidade, uma bomba de calor ar-ar entrega cerca de 3 a 4 kWh de calor, muito mais do que um aquecedor elétrico.'],
   ['Silencioso e simples de usar','Programação por horário e controlo por comando.'],
  ],
  'Bomba de calor AQS':[
   ['Água quente com muito menos energia','Gasta cerca de 3 vezes menos eletricidade do que um termoacumulador elétrico para a mesma água quente.'],
   ['Sem gás nem chama em casa','Mais segurança e sem contratos de gás ou botijas.'],
   ['Funciona todo o ano','De dia e de noite, mesmo no inverno.'],
  ],
  'Bomba de calor climatização':[
   ['Aquecimento central eficiente','Sem gasóleo nem gás: aproveita o calor do ar exterior.'],
   ['Calor uniforme em toda a casa','Temperatura estável, sem zonas frias.'],
   ['Menos custos com energia','Consome menos do que caldeiras a gasóleo ou aquecedores elétricos para o mesmo conforto.'],
  ],
  'Ventiloconvectores':[
   ['Calor ou frio rápido em cada divisão','Ligados à bomba de calor, aquecem e arrefecem.'],
   ['Discretos e silenciosos','Controlo independente por divisão.'],
  ],
  'UPAC (fotovoltaico)':[
   ['Produza a sua própria eletricidade','Consome a energia do sol e compra menos à rede.'],
   ['Menos dependência dos preços da energia','Uma parte da sua fatura passa a ter um custo fixo: o do sistema.'],
   ['Valoriza a casa','Um investimento que fica no imóvel.'],
  ],
  'Painéis solares térmicos':[
   ['Água quente aquecida pelo sol','Reduz o gás ou a eletricidade gastos a aquecer água.'],
   ['Tecnologia simples e duradoura','Poucas peças móveis e manutenção reduzida.'],
  ],
  'Carregador automóvel':[
   ['Carregue em casa, em segurança','Instalação própria para o carregamento, com as proteções elétricas necessárias.'],
   ['Normalmente mais barato','Carregar em casa custa, em regra, menos do que nos postos públicos.'],
  ],
  'Piso radiante':[
   ['O conforto mais uniforme','O calor sobe do chão, sem radiadores à vista.'],
   ['Silencioso e invisível','Sem ruído nem correntes de ar.'],
   ['Ideal com bomba de calor','Trabalha a baixa temperatura e por isso gasta menos.'],
  ],
  'VMC':[
   ['Ar novo e filtrado, sem abrir janelas','Renova o ar da casa de forma contínua.'],
   ['Menos humidade e bolores','Ajuda a evitar condensações nas paredes e janelas.'],
   ['Poupa no aquecimento','Nos modelos com recuperação de calor, o ar novo entra já aquecido pelo ar que sai.'],
  ],
 };
 // Máximo de 4 benefícios: o primeiro de cada solução e depois os restantes, sem repetir.
 function benefits(topics){
  const lists=(topics||[]).map(t=>BENEFITS[t]).filter(Boolean),out=[];
  for(let i=0;out.length<4&&lists.some(l=>l[i]);i++)for(const l of lists)if(l[i]&&out.length<4&&!out.some(b=>b[0]===l[i][0]))out.push(l[i]);
  return out;
 }
 // Pré-preenchido no ecrã Empresa; o utilizador confirma ou altera (só deve ficar o que é verdade em todas as obras).
 const INCLUDED=['Equipamentos e materiais indicados na proposta','Mão de obra de instalação','Testes e arranque do sistema','Explicação do funcionamento no fim da obra','Limpeza do local de trabalho'];
 // Incluído só em certos tipos de obra: junta-se à lista da empresa quando o orçamento tem essa tipologia.
 const INCLUDED_BY_TOPIC={'UPAC (fotovoltaico)':['Registo da UPAC na DGEG']};
 const includedFor=(base,topics)=>{const out=[...(base||[])];for(const t of topics||[])for(const x of INCLUDED_BY_TOPIC[t]||[])if(!out.some(y=>y.toLowerCase()===x.toLowerCase()))out.push(x);return out};
 const CREDENTIALS=['Técnico certificado em gases fluorados','Técnico registado na DGEG','Alvará / certificado IMPIC','Seguro de responsabilidade civil'];
 // Perguntas frequentes feitas com os dados da empresa; uma pergunta sem resposta não aparece.
 function faq(e,weeks){
  e=e||{};const g=[e.garantiaEquip&&'Equipamentos: '+e.garantiaEquip,e.garantiaInst&&'instalação: '+e.garantiaInst].filter(Boolean).join(' · ');
  return [
   ['Quem faz a instalação?',e.instalacao||''],
   ['Que garantia tenho?',g?g+'.':''],
   ['Quando pode ser feita a instalação?',weeks&&weeks.length?'Neste momento temos disponibilidade a partir da '+weeks[0]+'. Ao avançar, escolhe a semana que prefere e confirmamos consigo.':''],
   ['Como funciona o pagamento?','50% na adjudicação e 50% no fim da obra, por transferência bancária. Os dados para pagamento são enviados depois de confirmar.'],
   ['E depois da instalação?',e.posVenda||''],
  ].filter(([,a])=>a);
 }
 // «2026-12-07» → «semana de 7 de dezembro»; só semanas a partir de hoje, no máximo 4.
 const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const weekLabel=d=>'semana de '+Number(d.slice(8,10))+' de '+MONTHS[Number(d.slice(5,7))-1];
 function nextWeeks(list,today=new Date().toISOString().slice(0,10)){
  const monday=d=>{const t=new Date(d+'T12:00:00Z'),w=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-w);return t.toISOString().slice(0,10)};
  const now=monday(today);
  return [...new Set((list||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).map(monday))].filter(d=>d>=now).sort().slice(0,4);
 }
 root.EnatSolucoes={BENEFITS,benefits,INCLUDED,INCLUDED_BY_TOPIC,includedFor,CREDENTIALS,faq,weekLabel,nextWeeks};
})(globalThis);
