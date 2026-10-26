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
