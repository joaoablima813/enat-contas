# Enat Contas – publicar fora do Claude

## 1. Publicar
1. Chave do Gemini: https://aistudio.google.com/apikey
2. GitHub: crie um repositório privado e carregue TODOS estes ficheiros (Add file > Upload files), mantendo as pastas.
3. Netlify: Add new site > Import an existing project > escolha o repositório (sem mudar nada).
4. Netlify > Site configuration > Environment variables:
   - GEMINI_API_KEY = a chave do passo 1
   - APP_CODE = um código à sua escolha (a app pede-o uma vez em cada dispositivo)
   - GEMINI_MODEL (opcional) = outro modelo, se o predefinido deixar de existir
5. Deploys > Trigger deploy. Abra o link.

Dados, fotos das faturas e sincronização ficam guardados no Netlify (Blobs). A chave do Gemini fica só no servidor.
No telemóvel: abra o link e use "Adicionar ao ecrã principal"; o ícone é o logo da Enat.

## 2. Excel sempre sincronizado (Google Sheets)
1. Crie uma folha nova em sheets.google.com.
2. Extensões > Apps Script: cole o conteúdo de `apps-script.gs` e troque O_SEU_CODIGO pelo seu APP_CODE.
3. Implementar > Nova implementação > Tipo: Aplicação Web > Executar como: eu > Quem tem acesso: Qualquer pessoa. Copie o URL.
4. No Netlify crie a variável SHEETS_WEBHOOK com esse URL e faça novo deploy.
A folha (separadores Obras, Faturas, Materiais, Movimentos) é atualizada sozinha a cada alteração, com filtros em cada coluna (NIF, loja, valores com e sem IVA). Em Ficheiro > Transferir > Excel (.xlsx) tem a cópia em Excel.
Sem este passo, o botão "Descarregar Excel" da app gera sempre um .xlsx com os dados atuais.
