# Versão 0.1.0 — Dashboard de chamados técnicos

Entrega local aprovada para integração pelo usuário em **12/11/2026**. Os PRs [#1](https://github.com/joao-fagundess/controle-pizzaria/pull/1), [#2](https://github.com/joao-fagundess/controle-pizzaria/pull/2) e [#3](https://github.com/joao-fagundess/controle-pizzaria/pull/3) foram integrados em `develop`; o [PR #4](https://github.com/joao-fagundess/controle-pizzaria/pull/4) integrou a release em `main`. Os estados reais estão no [relatório de PRs](evidencias/compose/github-prs.json).

## Escopo entregue

- API Node.js/TypeScript com sete endpoints, PostgreSQL, migrations, validação, bearer e OpenAPI.
- Dashboard React com KPIs, gráficos, seis filtros, tabela paginada, considerações técnicas, histórico e atualização automática/manual.
- Seed de 480 chamados fictícios e recepção dos legados incompletos separada dos indicadores.
- Compose com banco persistente, API e frontend com Nginx; token técnico mantido no proxy.
- Requisitos, modelo, decisões, matriz RF → endpoint → teste, capturas reais, evidências e roteiro de vídeo de 2min55s.

## Validação

O [relatório da validação consolidada](evidencias/testes.md) registra 99 casos distintos, 176 execuções em dois ambientes de banco e 13 verificações HTTP da API compilada. Cobertura local de linhas: API 80,45% e frontend 91,50%. A [validação do Compose](evidencias/compose.md) acrescenta 27 verificações HTTP do Compose, persistência após reinício e ausência das credenciais de teste nos assets.

Os heads atualizados da entrega e da candidata passaram nos dois jobs remotos antes da integração. A tag anotada `v0.1.0` é publicada no commit final de `main` depois de sua CI. Os checks e artefatos são consultáveis no [GitHub Actions](https://github.com/joao-fagundess/controle-pizzaria/actions). `develop` recebe também a documentação de encerramento, preservando os históricos sem force push.

## Execução

Seguir [implantacao.md](implantacao.md) para gerar o `.env`, iniciar o Compose e carregar o seed opcional. O dashboard local usa [http://127.0.0.1:8080/](http://127.0.0.1:8080/); a publicação padrão fica restrita ao computador local. Código da versão: [tag v0.1.0](https://github.com/joao-fagundess/controle-pizzaria/tree/v0.1.0).

## Limites

Esta entrega usa dados fictícios. A homologação com o Thindesk real depende de acesso e de campos analíticos ausentes na origem fornecida. Autenticação corporativa, HTTPS compartilhado e medição de desempenho sob carga permanecem pendentes. A tag identifica o código entregue; não representa implantação em produção. O roteiro foi entregue, e a gravação do vídeo é posterior.
