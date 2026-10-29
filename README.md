# Enat Contas

App da Enat - Ponte de Lima para obras, faturas, orçamentos, clientes e relatórios. A página está em `public/` (a app publicada é `public/index.html`) e o servidor em `netlify/functions/api.mjs`, com módulos em `netlify/lib/`. A pasta `src/` tem componentes React de referência para o modelo financeiro. Não é usada pela app publicada.

## 1. Publicar
1. A leitura de faturas usa o Netlify AI Gateway: não é preciso chave.
2. O site publica a partir do repositório GitHub ligado ao Netlify, sem configuração de build.
3. Netlify > Site configuration > Environment variables:
   - APP_CODE (recomendado) = código de recuperação, só usado para registar um dispositivo novo quando não há outro com sessão iniciada
   - SMTP_PASSWORD (opcional) = envio automático de emails (ver secção 5)
4. Os dados, as fotos das faturas e as cópias de segurança ficam guardados no Netlify (Blobs). Os orçamentos ficam na base de dados do Netlify.

No telemóvel: abra o link e use "Adicionar ao ecrã principal"; o ícone é o logo da Enat.

## Uso no dia a dia
- **Início:** pesquisa em toda a app (obras, clientes, orçamentos, faturas e movimentos), botão **Fotografar fatura** (escolhe a obra e abre a câmara), pagamentos em atraso com lembrete por WhatsApp e atalhos para Clientes, Relatórios, Movimentos e Definições.
- **Estado da sincronização:** no topo, ao lado do logótipo (Sincronizado, A sincronizar…, Sem ligação). Toque para abrir as Definições.
- **Obras:** pesquisa e filtros por estado e ano. Cada obra tem email, NIF, morada e um **plano de pagamentos** (por omissão, 50% na adjudicação e 50% na conclusão). Em Recebimentos aparece o estado de cada prestação e o botão **Lembrar cliente por WhatsApp**, com o valor em falta e o IBAN.
- **Orçamentos:** estados Rascunho, Enviado, Aceite, Recusado e Expirado, e validade em dias (30 por omissão; os orçamentos antigos mantêm 15). Ao preparar o envio por WhatsApp ou email, um rascunho passa a Enviado. **Duplicar orçamento** cria uma cópia com a data de hoje. **Converter em obra** cria a obra com o cliente, o valor, os custos previstos e o plano 50/50. A obra mostra depois o **orçamentado vs real**. O PDF inclui as condições, a validade, o IBAN para transferência e um espaço para a aceitação do cliente.
- **Clientes:** junta as obras e os orçamentos com o mesmo nome de cliente: contactos, valores vendidos e por receber, obras e orçamentos.
- **Relatórios:** mês, trimestre ou ano, com recebido, custos, resultado, margem e estimativa de IVA, mais gráficos dos últimos 12 meses, custos por categoria e lucro por obra. **Pacote para o contabilista:** um ZIP com o Excel do período (faturas, mão de obra, recebimentos, despesas e resumo de IVA) e os anexos originais das faturas, na pasta `Faturas`.
- **Definições:** sincronização, cópias de segurança, Excel, dispositivos, terminar sessão e **Apagar todos os dados** (pede para escrever APAGAR e faz antes uma cópia).

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

## 5. Enviar orçamentos por email (pontedelima@enat.pt)
Os orçamentos têm um campo **Email do cliente (opcional)**. Em **Enviar ao cliente**, o botão **Enviar orçamento por email** envia a mesma mensagem do WhatsApp, com o PDF em anexo.

- **Envio automático (recomendado):** no Netlify > Project configuration > Environment variables, adicione `SMTP_PASSWORD` com a palavra-passe da caixa `pontedelima@enat.pt` (marque como segredo) e faça um novo deploy. O email sai de `pontedelima@enat.pt`, pelo servidor `mail.enat.pt` (porta 465, SSL), e fica guardado na pasta **Enviados** da caixa (via IMAP, `mail.enat.pt` porta 993), tal como se tivesse sido enviado pelo Outlook. Já não é enviada nenhuma cópia para a caixa de entrada.
  - Opcionais, se o fornecedor do email indicar outros dados: `SMTP_HOST`, `SMTP_PORT` (465 ou 587), `SMTP_USER`. Para o IMAP: `IMAP_HOST`, `IMAP_PORT` e `IMAP_SENT_FOLDER` (nome da pasta, se não for detetada automaticamente). Para não guardar em Enviados: `EMAIL_SAVE_SENT=false`.
- **Sem a palavra-passe configurada:** o botão abre a app de email do telemóvel ou computador com o destinatário, o assunto e a mensagem já escritos (com o link do PDF). Envie a partir da conta pontedelima@enat.pt.
