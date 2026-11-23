# Enat Contas

App da Enat - Ponte de Lima para obras, faturas, orçamentos, clientes e relatórios. A página está em `public/` (a app publicada é `public/index.html`) e o servidor em `netlify/functions/api.mjs`, com módulos em `netlify/lib/`. A pasta `src/` tem componentes React de referência para o modelo financeiro. Não é usada pela app publicada.

## 1. Publicar
1. A leitura de faturas usa o Netlify AI Gateway: não é preciso chave.
2. O site publica a partir do repositório GitHub ligado ao Netlify, sem configuração de build.
3. Netlify > Site configuration > Environment variables:
   - APP_CODE (recomendado) = código de recuperação, só usado para registar um dispositivo novo quando não há outro com sessão iniciada
   - SMTP_PASSWORD (recomendado) = envio e leitura dos emails de `pontedelima@enat.pt` (ver secção 5): orçamentos por email, leads da campanha e questionário automático
   - LINK_URL (opcional) = endereço dos links enviados aos clientes (propostas e questionário), ex.: `https://propostas.enat-pontedelima.pt`. Sem ele usa o endereço da app. Os links antigos continuam a funcionar no endereço da app.
   - SITE_ORIGINS (opcional) = sites autorizados a enviar pedidos de orçamento para a app, separados por vírgulas. Por omissão: `enat-pontedelima.netlify.app`, `enat-pontedelima.pt` e `www.enat-pontedelima.pt`.
4. Os dados, as fotos das faturas e as cópias de segurança ficam guardados no Netlify (Blobs). Os orçamentos ficam na base de dados do Netlify.

No telemóvel: abra o link e use "Adicionar ao ecrã principal"; o ícone é o logo da Enat.

## Uso no dia a dia
- **Início:** pesquisa em toda a app (obras, clientes, orçamentos, faturas e movimentos), botão **Fotografar fatura** (escolhe a obra e abre a câmara), pagamentos em atraso com lembrete por WhatsApp e atalhos para Clientes, Relatórios, Movimentos e Definições.
- **Estado da sincronização:** no topo, ao lado do logótipo (Sincronizado, A sincronizar…, Sem ligação). Toque para abrir as Definições.
- **Obras:** pesquisa e filtros por estado e ano. Cada obra tem email, NIF, morada e um **plano de pagamentos** (por omissão, 50% na adjudicação e 50% na conclusão). Em Recebimentos aparece o estado de cada prestação e o botão **Lembrar cliente por WhatsApp**, com o valor em falta e o IBAN.
- **Orçamentos:** estados Rascunho, Enviado, Aceite, Recusado e Expirado, e validade em dias (30 por omissão; os orçamentos antigos mantêm 15). Ao preparar o envio por WhatsApp ou email, um rascunho passa a Enviado. **Duplicar orçamento** cria uma cópia com a data de hoje. **Converter em obra** cria a obra com o cliente, o valor, os custos previstos e o plano 50/50. A obra mostra depois o **orçamentado vs real**. O PDF inclui as condições, a validade, as garantias e os dados da empresa no rodapé (Definições › Empresa: NIF, morada, alvará). **O IBAN não vai no PDF:** o cliente só o vê na página da proposta depois de adjudicar.
- **Leads novas (email / Outlook):** os emails de leads da campanha que chegam a `pontedelima@enat.pt` são lidos a cada minuto e criam uma lead com nome, email, telefone, tipo de casa, timing e origem. São lidos os dois formatos: o antigo («O/A visitante … enviou um pedido de contacto») e o novo da MA Media Leads («Nova lead · Contacto recebido de …»). Aparecem cor-de-rosa em **Leads novas** (em Leads e no Início), separadas das leads criadas na app, com a indicação «Sincronizada do Outlook». Ao abrir uma e tocar em **Marcar como recebida** (ou ao marcar a chamada ou mudar a fase), passa para as Leads com a cor normal. Só entram emails recebidos depois da ativação; os antigos não são importados. Usa a mesma `SMTP_PASSWORD` do envio de emails.
- **Chamadas de cada lead:** dentro da lead, a secção **Chamadas** guarda todas as chamadas feitas ao cliente (dia, hora, Atendeu / Não atendeu e observações). Registe uma chamada nova com **Registar chamada · Atendeu** ou **· Não atendeu**; a lista mostra a mais recente primeiro e, ao tocar numa chamada, abrem-se as observações desse dia. A última chamada define se a lead fica em «Não atendeu». As leads antigas passam a ter a chamada que já tinham como Chamada 1.
- **Notificações no telemóvel (app fechada):** em Definições › **Notificações no telemóvel**, toque em **Ativar notificações neste dispositivo** (uma vez em cada telemóvel/computador) e use **Enviar notificação de teste**. O servidor verifica a cada minuto e avisa das chamadas em hora, das visitas (30 min antes), das leads novas do email e das respostas dos clientes aos orçamentos. No iPhone é preciso instalar a app no ecrã principal (Partilhar › Adicionar ao ecrã principal, iOS 16.4+) e ativar a partir da app instalada. No Android funciona no Chrome. Não precisa de configuração: as chaves são criadas automaticamente.
- **Lista de leads:** mostra 10 leads; **Mostrar mais** abre uma página com todas, em colunas de 20 lado a lado (no telemóvel desliza-se para o lado), com pesquisa e filtros.
- **Clientes:** junta as obras e os orçamentos com o mesmo nome de cliente: contactos, valores vendidos e por receber, obras e orçamentos.
- **Relatórios:** mês, trimestre ou ano, com recebido, custos, resultado, margem e estimativa de IVA, mais gráficos dos últimos 12 meses, custos por categoria e lucro por obra. **Pacote para o contabilista:** um ZIP com o Excel do período (faturas, mão de obra, recebimentos, despesas e resumo de IVA) e os anexos originais das faturas, na pasta `Faturas`.
- **Definições:** sincronização, cópias de segurança, Excel, dispositivos, terminar sessão e **Apagar todos os dados** (pede para escrever APAGAR e faz antes uma cópia).

## Questionário do cliente (link de perguntas)
Cada lead pode receber um link (`/pedido/…`) com perguntas sobre a casa e a tecnologia pedida, para preparar o orçamento sem visita.

- **Perguntas:** as da casa aparecem **uma só vez**, mesmo com várias tecnologias (tipo de casa, ano, janelas, área, obra). **Monofásica ou trifásica é perguntado sempre**, seja qual for a tecnologia. Pessoas em casa só aparecem quando há água quente (AQS, termoacumulador, solar térmico ou bomba de calor com AQS). Com radiadores, pergunta o número de radiadores e de elementos. O cliente escolhe a gama: **Preço**, **Gama média** ou **Qualidade**, e pode juntar fotos. As definições estão em `public/pedido-perguntas.js`, partilhadas pela página e pela app.
- **Envio automático:** as leads na fase «Lead nova» com email, recebidas nos últimos 7 dias, recebem o link por email **logo que chegam** (verificado a cada minuto, só entre as 8h e as 22h), a partir de `pontedelima@enat.pt`. Cada cliente recebe no máximo um email automático. Desliga-se em Definições › Empresa › Leads novas. Os pedidos feitos no site mostram o link logo no ecrã e não recebem email.
- **Na app:** as respostas entram na lead sozinhas, mesmo com a app aberta (aviso no telemóvel e secção **Responderam ao questionário** em Leads e no Início). A lead mostra as respostas, as fotos e os **Equipamentos sugeridos** calculados a partir delas (`netlify/lib/sugestoes.mjs`): potência do ar condicionado por divisão, bomba de calor, depósito de AQS por pessoas (40–50 L por pessoa), inércia (cerca de 10 L/kW), fase, etc.

## Orçamento por IA a partir da lead
**Orçamento IA** na lead passa as respostas e os equipamentos sugeridos para a caixa do orçamento, com a gama escolhida pelo cliente. A lista de material (`netlify/lib/quote-kit.mjs`) inclui máquinas, acessórios, tubos, cabos e consumíveis, e cada linha é procurada nas tabelas dos fornecedores (`public/quote-ai.js`).

Regras a manter:
- **Fornecedores por gama:** Preço = Sanipower e Ekallor; Gama média = LG, Ekallor e Sanipower; Qualidade = Daikin e LG. **Acessórios, cabos e tubos vêm sempre da Sanipower e da Sanitop.** Estão no painel «Fornecedores e regras».
- Só entram produtos que existem nas tabelas. Cada linha tem família e exclusões (ex.: uma unidade interior nunca escolhe uma exterior; o tubo de cobre é isolado e há uma linha por diâmetro), potência e número de saídas pelo valor mais próximo, e as unidades interiores de um multisplit são da mesma marca da exterior.
- A **mão de obra é uma única linha, sempre a última, sem valor**: o valor é escolhido por si.
- Quando troca um produto escolhido, a app aprende e usa essa escolha da próxima vez.

## Fotos de obras, site e propostas
- No separador **Fotos** da obra pode juntar fotos. Só aparecem no site público e nas propostas («Obras perto de si», pelo código postal) quando está marcada a **autorização do cliente**. Sem autorização, as fotos ficam só na app.
- O site público (repositório à parte, `enat-site`) usa a app em `/site-api/*`: o formulário de orçamento cria uma lead (marcada «Site», com aviso no telemóvel e o link do questionário logo a seguir ao pedido) e a galeria mostra as obras autorizadas. O pedido tem proteção contra spam (campo escondido, tempo mínimo e limite por endereço).

## Segurança dos dados
- **Cópias de segurança:** na primeira alteração de cada dia, o servidor guarda uma cópia de todos os dados. Ficam guardadas as dos últimos 30 dias. Em Definições pode fazer uma cópia manual ou restaurar qualquer cópia. Antes de restaurar, o estado atual também fica guardado numa cópia.
- **Vários dispositivos:** cada obra, movimento e fatura alterada fica com a hora da alteração. Se o telemóvel e o computador gravarem ao mesmo tempo, as duas versões juntam-se item a item, sem uma substituir a outra.
- **Sem rede:** a app fica guardada no dispositivo e abre mesmo sem internet. Sem ligação, o ecrã de entrada mostra **Entrar sem ligação** (Face ID / Touch ID deste dispositivo) e usa os dados guardados nele. Quando a internet volta, a app pede login e sincroniza as alterações. A leitura de faturas, os orçamentos e o envio precisam de internet.

## 2. Excel no Ambiente de Trabalho ligado à app
No Início da app, abra **Excel ligado à app — configurar**. O guia em `/excel.html` explica a criação de um acesso de leitura e o download de um assistente para Excel 2016+ no Windows (recomendado Microsoft 365).

O assistente usa a instalação local do Excel para criar `ENAT-Financas.xlsx`, com consultas Power Query ao servidor. As consultas usam autenticação Básica por HTTPS com credenciais introduzidas na janela do Excel, sem incluir a palavra-passe no assistente ou nas consultas. O servidor guarda apenas o hash do acesso, que pode ser revogado na app. A migração nova é aplicada pela plataforma durante o deploy.

As tabelas atualizam ao abrir e a cada cinco minutos enquanto o Excel está aberto com internet. O ficheiro não atualiza fechado. Cada computador precisa de configurar as credenciais. Os dados locais ainda não sincronizados não são incluídos. O botão **Descarregar cópia Excel** continua disponível para obter uma cópia sem ligação.

## 3. Entrar com Face ID / Touch ID
Na primeira abertura toque em "Ativar Face ID / Touch ID". Esse passa a ser o dispositivo principal.
Depois disso, a app pede o Face ID ou Touch ID sempre que é aberta. Nos dispositivos Apple com a mesma conta iCloud a chave sincroniza sozinha.
Para outro dispositivo, use "Registar outro dispositivo" nas definições de um dispositivo com sessão iniciada. Também pode usar "Registar este dispositivo" no ecrã de entrada, que pede o APP_CODE.

## 4. Enviar orçamentos por WhatsApp (gratuito)
Dentro de um orçamento, ou na pasta de um cliente (escolhendo os orçamentos desse cliente), use **Preparar orçamento para WhatsApp**. A app gera o PDF, guarda-o num link privado e prepara a mensagem. Depois, **Abrir conversa no WhatsApp** abre a conversa desse cliente no seu WhatsApp Business com a mensagem e os links já escritos: basta tocar em enviar.

Não precisa de configuração nem tem custos: a mensagem sai do seu próprio WhatsApp Business. Se tiver o WhatsApp normal e o Business no mesmo telemóvel, escolha o Business quando o telemóvel perguntar. No telemóvel também pode usar **Partilhar o PDF como anexo** para enviar o ficheiro em vez do link.

## 4.1 Página da proposta e respostas do cliente
Os links enviados por WhatsApp e por email abrem uma página da Enat (`/proposta/…`) com o logótipo, o resumo da proposta, o valor, a validade, o botão **Ver orçamento completo (PDF)** e cinco respostas: **Adjudicar**, **Pedir revisão**, **Vou pensar**, **Fica para mais tarde** e **Rejeitar**. Quando são enviados vários orçamentos juntos, cada página mostra também as outras opções.

- **Visto:** a app regista quando o cliente abre a página e o PDF. As pré-visualizações automáticas do WhatsApp e do email não contam, nem as aberturas num dispositivo onde a app Enat está instalada (para testar como cliente, use **Testar como cliente** na própria página).
- **Na app:** cada orçamento mostra a etiqueta da resposta (Visto, Adjudicado, Pedido de revisão, A pensar, Mais tarde, Rejeitado), a secção **Acompanhamento do cliente** com o histórico, e as respostas novas aparecem em **Respostas de clientes** no Início e em Orçamentos.
- **Adjudicar** marca o orçamento como Aceite e abre logo a obra, com o mesmo cliente, valor, custos previstos e plano 50/50. Se o cliente voltar a adjudicar, não é criada outra obra.
- **Mudar de ideias:** o cliente pode mudar a resposta quando quiser; fica tudo no histórico. Se tinha adjudicado e muda, a obra não é apagada: a app avisa para a eliminar se já não avançar.
- Os links enviados antes desta versão continuam a abrir só o PDF.

## 4.2 Faturas no TOC Online
Na obra (separador Contas), **Criar fatura no TOC Online** emite a fatura (FT) já **finalizada** no TOC Online, com as linhas do orçamento da obra: equipamentos, material, acessórios, mão de obra e outros. Cada linha leva a quantidade e o preço de venda sem IVA (o total sem IVA do orçamento repartido pelas linhas, como no PDF detalhado) e o **IVA é sempre 23%**. A mão de obra vai como serviço; o resto como produto.

- Antes de emitir aparece o ecrã de confirmação: cliente (nome, NIF, morada, código postal, localidade, email), linhas e totais. Sem NIF, a fatura sai para consumidor final. Se o cliente ainda não existir no TOC Online, é criado com estes dados.
- Depois de emitida, a fatura só pode ser corrigida no TOC Online com nota de crédito. A app avisa se o mesmo orçamento já foi faturado e não cria uma segunda fatura se o pedido for repetido.
- O TOC Online envia a fatura para o email do cliente. Para seguir o PDF em anexo (e não só o link), ative essa opção nas definições do TOC Online.
- A obra guarda o número, o total e o link do PDF, com os botões **Ver PDF**, **Enviar por email** e **WhatsApp**.

Configuração (uma vez): no TOC Online, em Empresa › Configurações › Dados API, autorize a integração e receba as credenciais. Guarde-as em Netlify > Environment variables: `TOC_CLIENT_ID`, `TOC_CLIENT_SECRET`, `TOC_OAUTH_URL` e `TOC_API_URL`. A licença de Gestão Comercial tem de estar ativa. A app renova o acesso sozinha.

## 5. Enviar orçamentos por email (pontedelima@enat.pt)
Os orçamentos têm um campo **Email do cliente (opcional)**. Em **Enviar ao cliente**, o botão **Enviar orçamento por email** envia a mesma mensagem do WhatsApp, com o PDF em anexo.

- **Envio automático (recomendado):** no Netlify > Project configuration > Environment variables, adicione `SMTP_PASSWORD` com a palavra-passe da caixa `pontedelima@enat.pt` (marque como segredo) e faça um novo deploy. O email sai de `pontedelima@enat.pt`, pelo servidor `mail.enat.pt` (porta 465, SSL), e fica guardado na pasta **Enviados** da caixa (via IMAP, `mail.enat.pt` porta 993), tal como se tivesse sido enviado pelo Outlook. Já não é enviada nenhuma cópia para a caixa de entrada.
  - Opcionais, se o fornecedor do email indicar outros dados: `SMTP_HOST`, `SMTP_PORT` (465 ou 587), `SMTP_USER`. Para o IMAP: `IMAP_HOST`, `IMAP_PORT` e `IMAP_SENT_FOLDER` (nome da pasta, se não for detetada automaticamente). Para não guardar em Enviados: `EMAIL_SAVE_SENT=false`.
- **Sem a palavra-passe configurada:** o botão abre a app de email do telemóvel ou computador com o destinatário, o assunto e a mensagem já escritos (com o link do PDF). Envie a partir da conta pontedelima@enat.pt.
