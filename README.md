# Natural Point Flow

Crie um novo projeto chamado **Natural Point Finance**. Este projeto deve ser SEPARADO do JR Clinic e será exclusivamente um sistema de gestão financeira para uma empresa de açaí chamada **Natural Point**.

IMPORTANTE: nesta primeira etapa, crie apenas a BASE VISUAL E ESTRUTURAL do sistema: layout, navegação lateral, dashboard, cards, áreas e componentes principais. Não implemente ainda regras financeiras complexas, integrações, banco de dados ou automações profundas; isso será definido depois.

DIREÇÃO VISUAL DA MARCA NATURAL POINT:
- Estética premium, natural, sofisticada e contemporânea.
- Paleta inspirada na identidade visual da marca: roxo/açaí profundo (vinho muito escuro) como cor principal, dourado quente como destaque, bege/areia/off-white como fundo e neutros quentes. Pode usar verde orgânico de forma muito sutil em indicadores positivos, sem dominar a interface.
- NÃO usar design preto e branco puro.
- Fundo geral claro em areia/off-white, cards claros com contraste suave, bordas discretas e sombras muito leves.
- Evitar excesso de dourado; usar em detalhes, ícones, estados ativos e pequenos acentos.
- Tipografia moderna, elegante, legível e profissional. Nada infantil, nada de estética genérica de açaíteria.
- O sistema deve parecer um produto SaaS financeiro premium, limpo e organizado.

REFERÊNCIA DE LAYOUT:
Use como inspiração um dashboard SaaS moderno com:
- Sidebar fixa à esquerda, clara, vertical.
- Logo/nome Natural Point no topo da sidebar.
- Menu com ícones e labels bem espaçados.
- Área principal ampla.
- Header superior com título da página, busca, ícone de notificações e avatar/perfil.
- Filtros de período no topo (Dia, Semana, Mês, Ano) e seletor de intervalo de datas.
- Cards de resumo financeiro logo abaixo.
- Gráficos e tabelas organizados em grid.
- Muitos espaços em branco, cantos arredondados e hierarquia visual clara.

ESTRUTURA INICIAL DO SISTEMA:
1. **Dashboard**
   - Cards: Faturamento, Entradas, Saídas, Resultado, Saldo em caixa.
   - Comparativo percentual com período anterior.
   - Gráfico de Entradas x Saídas.
   - Gráfico de faturamento por período.
   - Bloco de resumo do mês.
   - Lista das movimentações mais recentes.

2. **Entradas**
   - Tela base com filtros, busca, período e tabela/lista de entradas.
   - Botão “Nova entrada”.
   - Colunas: descrição, categoria, forma de pagamento, data, valor, status.

3. **Saídas**
   - Tela base semelhante à de entradas.
   - Botão “Nova saída”.
   - Colunas: descrição, categoria, fornecedor, forma de pagamento, data, valor, status.

4. **Caixa**
   - Saldo atual.
   - Abertura e fechamento de caixa como componentes visuais de base.
   - Movimentações do dia.

5. **Contas a pagar**
   - Cards de pendentes, vencendo e atrasadas.
   - Tabela base.

6. **Contas a receber**
   - Cards de pendentes, vencendo e atrasadas.
   - Tabela base.

7. **Categorias**
   - Estrutura visual para categorias de entrada e saída.

8. **Relatórios**
   - Área com filtros combinados, período e cards de resumo.
   - Espaço visual para relatórios mensais e exportações futuras.

9. **Configurações**
   - Blocos para dados da empresa, formas de pagamento, usuários e preferências do sistema.

SIDEBAR SUGERIDA:
Dashboard
Entradas
Saídas
Caixa
Contas a pagar
Contas a receber
Categorias
Relatórios
Configurações

DESIGN SYSTEM:
- Sidebar off-white clara com item ativo em fundo roxo/açaí profundo e texto claro, ou fundo bege com indicador dourado/roxo.
- Cards com radius grande, entre 18px e 24px.
- Métricas com número grande e título pequeno, porém legível.
- Ícones lineares e elegantes.
- Estados positivos em verde orgânico suave; negativos em vinho/vermelho terroso discreto.
- Botões primários em roxo/açaí profundo com hover levemente mais escuro.
- Dourado apenas em detalhes e destaques premium.
- Criar layout responsivo para desktop e tablet, mantendo sensação de sistema profissional.

Use dados fictícios apenas para demonstrar o layout. Não crie telas de vendas, estoque, pedidos, cardápio ou delivery nesta etapa: é SOMENTE sistema financeiro.

Objetivo desta primeira versão: entregar um dashboard financeiro visualmente forte, organizado, moderno e consistente com a marca Natural Point, pronto para receber as regras reais que serão enviadas depois.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/efdf9e80-737a-443a-8c17-fcd425ea23c9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
