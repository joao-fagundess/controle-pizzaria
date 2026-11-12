# build: integrar ambiente Compose e validar entrega

O Compose reúne PostgreSQL, migrations, API e frontend, com volume persistente, dependências de saúde e seed opcional. A configuração local gera credenciais sem sobrescrever `.env`. O validador cria um projeto separado para testar a entrega e remove somente seus recursos descartáveis.

A documentação reúne requisitos, modelo, contrato, evidências, matriz de rastreabilidade, execução com contêineres e roteiro de vídeo de 2min55s. O workflow prepara verificações da aplicação e do Compose para o GitHub.

Validação: consultar os [resultados reais da Fase 6](../evidencias/fase-6.md) e o [resumo da Fase 5](../evidencias/fase-5/summary.json). CI remota, PRs e integração com o Thindesk real só devem ser declarados concluídos quando houver a evidência correspondente.

Base de revisão: `develop`. PR publicado em rascunho: [#3](https://github.com/joao-fagundess/controle-pizzaria/pull/3). Revisar após API e dashboard; revisão e integração pendentes.
