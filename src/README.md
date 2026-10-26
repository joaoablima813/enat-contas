# Modelo financeiro ENAT

Os modelos, cálculos e componentes React seguem a estrutura solicitada. `App` recebe
`dados: DadosFinanceiros` do código que o integrar. Os campos calculados do resumo
são recalculados a partir dos valores recebidos, e os indicadores acompanham essas
alterações. `index.css` aplica as cores diretamente, sem exigir compilação Tailwind;
`tailwind.config.js` disponibiliza também os mesmos tokens para integrações Tailwind.
As percentagens nestes modelos usam pontos percentuais: 23 representa 23%.

A aplicação publicada continua em `public/`, com o ficheiro Excel externo ligado à
app. Estes componentes React ficam disponíveis para integração e não criam outra
página financeira nem substituem a aplicação existente. A exportação pontual está
em `public/excel-export.js`; a criação do ficheiro com Power Query está em
`public/excel-connect.js`. No Excel, as percentagens são frações (0,23 = 23%).

Para validar os componentes: `npx tsc --noEmit`. Para verificar os ficheiros Excel:
`node --test tests/excel-export.test.mjs tests/excel-connection.test.mjs`.

Para obter os novos estilos no Excel ligado, descarregue novamente o assistente
na página «Excel ligado à app — configurar» e crie um novo ficheiro. Pode manter
o acesso de leitura existente. Atualizar Tudo no ficheiro antigo atualiza os dados,
mas não instala este novo desenho. O assistente preserva o ficheiro anterior.
