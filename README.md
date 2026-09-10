# Natural Point Flow

Sistema integrado de operação e gestão da Natural Point.

## Escopo atual

O projeto reúne os fluxos principais da loja em uma única aplicação:

- vendas / PDV;
- produtos por peso, unidade e adicionais;
- estoque e movimentações;
- abertura e fechamento de caixa;
- despesas;
- contas a pagar;
- contas a receber / fiado;
- dashboard e relatórios;
- lucro e divisão entre sócios;
- usuários e perfis de acesso.

## Perfis de acesso

### Sócio / Administrador

Pode administrar preços, custos, produtos, estoque, descontos, despesas, contas, usuários e configurações de gestão.

### Caixa / Colaborador

Focado na operação diária. Pode vender, consultar informações operacionais, abrir/fechar caixa e registrar recebimentos permitidos. Alterações sensíveis são protegidas por RLS/RPC no Supabase, e não apenas pela interface.

## Regras de segurança e integridade

- O navegador não é fonte confiável para regras financeiras.
- Totais, preços de produtos, taxas e permissões críticas são validados no banco.
- Operações que envolvem múltiplas tabelas usam RPCs/transações atômicas quando necessário.
- Tabelas expostas mantêm RLS habilitado.
- Funções `SECURITY DEFINER` devem validar explicitamente identidade e função do usuário e limitar `EXECUTE` às roles necessárias.
- Alterações de schema, RLS, funções e triggers devem ser versionadas em `supabase/migrations`.

## Convenções operacionais

- Data operacional: `America/Sao_Paulo`.
- Peso no PDV: informado em gramas e convertido para kg internamente.
- Valores monetários aceitam entrada com vírgula ou ponto decimal no frontend, mas o backend é responsável pela validação final.
- Venda fiada exige cliente e vencimento.
- Registros financeiros realizados não devem ser simplesmente apagados; cancelamentos/estornos devem preservar histórico.

## Banco de dados

O backend utiliza Supabase. Novas alterações de banco devem ser aplicadas por migration e mantidas no GitHub.

As migrations P0 desta branch reforçam:

- escrita direta restrita para o perfil Caixa em vendas, itens, pagamentos, contas a receber e sessões de caixa;
- cálculo de preço e total da venda no servidor;
- preços de produtos por unidade/adicionais obtidos diretamente do cadastro do banco;
- preço/kg do Caixa obtido do produto por peso ativo configurado;
- bloqueio de desconto pelo Caixa no backend;
- validação de quantidade e estoque no servidor;
- vencimento obrigatório para fiado dentro da própria RPC de venda;
- apenas um caixa aberto por vez, garantido também por índice único parcial;
- timezone operacional de São Paulo em operações de caixa e dashboard.

## Desenvolvimento

```bash
bun install
bun run dev
```

Validação local:

```bash
bun run build
bun x tsc --noEmit
```

O GitHub Actions valida o projeto; o CI não modifica automaticamente o código da branch principal.
