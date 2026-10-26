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

## 2. Excel sempre sincronizado (Google Sheets)
1. Crie uma folha nova em sheets.google.com.
2. Extensões > Apps Script: cole o conteúdo de `apps-script.gs` e troque O_SEU_CODIGO pelo seu APP_CODE.
3. Implementar > Nova implementação > Tipo: Aplicação Web > Executar como: eu > Quem tem acesso: Qualquer pessoa. Copie o URL.
4. No Netlify crie a variável SHEETS_WEBHOOK com esse URL e faça novo deploy.
A folha (separadores Obras, Faturas, Materiais, Movimentos) é atualizada sozinha a cada alteração, com filtros em cada coluna (NIF, loja, valores com e sem IVA). Em Ficheiro > Transferir > Excel (.xlsx) tem a cópia em Excel.
Sem este passo, o botão "Descarregar Excel" da app gera sempre um .xlsx com os dados atuais.

## 3. Entrar com Face ID / Touch ID
Na primeira abertura toque em "Ativar Face ID / Touch ID". Esse passa a ser o dispositivo principal.
Depois disso, a app pede o Face ID ou Touch ID sempre que é aberta. Nos dispositivos Apple com a mesma conta iCloud a chave sincroniza sozinha.
Para outro dispositivo, use "Registar outro dispositivo" nas definições de um dispositivo com sessão iniciada. Também pode usar "Registar este dispositivo" no ecrã de entrada, que pede o APP_CODE.
