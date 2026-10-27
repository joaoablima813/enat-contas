# Enat Contas – publicar fora do Claude

## 1. Publicar
1. A leitura de faturas usa o Gemini através do Netlify AI Gateway: não é preciso chave.
2. GitHub: crie um repositório privado e carregue TODOS estes ficheiros (Add file > Upload files), mantendo as pastas.
3. Netlify: Add new site > Import an existing project > escolha o repositório (sem mudar nada).
4. Netlify > Site configuration > Environment variables:
   - GEMINI_API_KEY (opcional) = só se quiser usar a sua própria chave do Gemini em vez do AI Gateway
   - APP_CODE (recomendado) = código de recuperação, só usado para registar um dispositivo novo quando não há outro com sessão iniciada
   - GEMINI_MODEL (opcional) = outro modelo, se o predefinido deixar de existir
5. Deploys > Trigger deploy. Abra o link.

Dados, fotos das faturas e sincronização ficam guardados no Netlify (Blobs). A página fica em `public/` e a função do servidor em `netlify/functions/api.mjs`.
No telemóvel: abra o link e use "Adicionar ao ecrã principal"; o ícone é o logo da Enat.

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

## 5. Enviar orçamentos por email (pontedelima@enat.pt)
Os orçamentos têm um campo **Email do cliente (opcional)**. Em **Enviar ao cliente**, o botão **Enviar orçamento por email** envia a mesma mensagem do WhatsApp, com o PDF em anexo.

- **Envio automático (recomendado):** no Netlify > Project configuration > Environment variables, adicione `SMTP_PASSWORD` com a palavra-passe da caixa `pontedelima@enat.pt` (marque como segredo) e faça um novo deploy. O email sai de `pontedelima@enat.pt`, pelo servidor `mail.enat.pt` (porta 465, SSL), e é enviada uma cópia oculta para a própria caixa, para ficar registo.
  - Opcionais, se o fornecedor do email indicar outros dados: `SMTP_HOST`, `SMTP_PORT` (465 ou 587), `SMTP_USER`. Para não receber a cópia: `EMAIL_BCC_SELF=false`.
- **Sem a palavra-passe configurada:** o botão abre a app de email do telemóvel ou computador com o destinatário, o assunto e a mensagem já escritos (com o link do PDF). Envie a partir da conta pontedelima@enat.pt.
