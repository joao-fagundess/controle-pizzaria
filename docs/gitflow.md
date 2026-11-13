# Versionamento e revisão

O código está em [joao-fagundess/controle-pizzaria](https://github.com/joao-fagundess/controle-pizzaria). As entregas entram na `main` depois da revisão e dos testes; a `develop` reúne as mudanças em desenvolvimento.

## Branches

| Branch | Uso |
| --- | --- |
| `main` | Código publicado e validado. |
| `develop` | Integração das próximas mudanças. |
| `feature/*` ou `codex/*` | Implementações e revisões isoladas. |
| `release/*` | Preparação de uma versão. |
| `hotfix/*` | Correção urgente de uma versão publicada. |

## Fluxo de trabalho

1. Atualizar a branch de origem e criar uma branch para a mudança.
2. Fazer commits pequenos, com mensagens que expliquem o resultado.
3. Abrir um PR com o problema, a solução, os testes executados e os limites conhecidos.
4. Conferir a CI e integrar por merge, preservando o histórico.
5. Sincronizar `develop` após uma publicação em `main`.

Funcionalidades normalmente passam pela `develop`. Revisões pontuais da versão publicada podem partir da `main`, desde que a `develop` também receba o resultado. O [template de PR](../.github/pull_request_template.md) orienta a descrição.

As mensagens seguem Conventional Commits em português. Exemplos: `fix: incluir o último dia do filtro`, `docs: esclarecer a importação do Thindesk` e `test: verificar reabertura de chamados`.

## Validação automática

O [workflow](../.github/workflows/validation.yml) roda em PRs para `main` e `develop`, em pushes das branches de entrega e por acionamento manual. São dois checks em Ubuntu com Node.js 24:

- **Application and PostgreSQL:** compila os projetos e executa os testes da aplicação, do contrato Thindesk e do PostgreSQL nativo.
- **Compose and HTTP:** monta o ambiente em contêineres e verifica as rotas, migrations, persistência e configuração do proxy.

O comando completo da aplicação é `npm --prefix api run validate`. Os relatórios ficam em [testes](evidencias/testes.md) e [Compose](evidencias/compose.md). O GitHub guarda os artefatos de cada execução por 14 dias. A CI não publica imagens nem implanta a aplicação.

## Versões publicadas

A tag `v0.1.0` identifica a primeira entrega, de 12/11/2026. Os PRs [#1](https://github.com/joao-fagundess/controle-pizzaria/pull/1), [#2](https://github.com/joao-fagundess/controle-pizzaria/pull/2) e [#3](https://github.com/joao-fagundess/controle-pizzaria/pull/3) integraram API, interface e empacotamento na `develop`; o [PR #4](https://github.com/joao-fagundess/controle-pizzaria/pull/4) publicou a versão na `main`.

O [PR #9](https://github.com/joao-fagundess/controle-pizzaria/pull/9) levou à `main` a integração local do Thindesk e a revisão dos textos, com CI aprovada. A tag original foi mantida. Escopo e limites da primeira versão estão nas [notas de versão](versao-0.1.0.md); o funcionamento atual está no [README](../README.md).
