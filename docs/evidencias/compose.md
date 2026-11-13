# Validação do Docker Compose e da entrega

Entrega `0.1.0`, verificada em 12/11/2026 e autorizada pelo usuário para integração e criação da tag. O ambiente local com contêineres e a documentação estão entregues, e os quatro PRs foram integrados. O vídeo não foi gravado: o escopo entregue é seu roteiro.

## Contêineres e validação

O Docker Desktop foi iniciado com engine Linux, Docker 29.8.2 e Compose 5.5.1. As imagens da API e do frontend compilaram usando os lockfiles e executando os verificadores TypeScript dentro dos contêineres Linux.

O comando `node scripts/validate-compose.mjs` passou em **27 verificações HTTP**, além dos passos de build, configuração e manutenção. Evidências: [relatório JSON](compose/compose-report.json), [saída dos comandos](compose/compose-validation.txt), [configuração sem credenciais](compose/compose-config.json) e [estado dos contêineres](compose/compose-containers.json).

| Verificação | Resultado |
| --- | --- |
| Inicialização | PostgreSQL saudável, migrations concluídas com código 0, API e Nginx saudáveis. |
| Portas | Apenas frontend publicado em `127.0.0.1`; banco e API sem porta publicada no host. |
| Estado inicial | Resumo sem chamados antes da carga explícita. |
| Seed | 480 chamados fictícios; repetir a carga mantém 480. |
| Contrato HTTP | Sete endpoints, agrupamentos dia/semana/mês, seis filtros combinados, detalhe, Swagger e estado vazio. |
| Entradas e acesso | Respostas 400, 403, 404 e 422 pelo proxy; resposta 401 no acesso direto à API sem bearer. |
| Arquivos privados | `/.env` bloqueado; os quatro assets servidos não contêm senha ou token de teste. |
| Usuários dos processos | API e Nginx sem root. |
| Migrations | Reaplicação com zero migrations novas. |
| Persistência | Reinício do banco preserva os chamados; o pool reconecta e o resumo volta com 480. |
| Saúde final | Banco, API e frontend saudáveis; serviço de migration encerrado com sucesso. |
| Limpeza | Contêineres, rede, volume e arquivo de configuração exclusivos do teste removidos. |

O servidor testado foi **PostgreSQL 18.6 em Linux**, em contraste com o PostgreSQL nativo Windows já verificado na validação consolidada. Versão completa e IDs/digests das imagens estão no JSON. As imagens base seguem tags de linha estável; o registro dos digests identifica o que foi testado, sem prometer que uma reconstrução futura com tags mutáveis produzirá a mesma imagem.

O validador usa projeto aleatório `thindesk-check-*` e diretório temporário dentro do cache do workspace. Antes da remoção, confere prefixos e confinamento. Não utiliza o volume normal do ambiente local. A configuração persistente da demonstração está descrita em [implantacao.md](../implantacao.md).

## Relação com os testes anteriores

As [evidências da validação consolidada](testes.md) registram **99 casos distintos**, **176 execuções** e **13 verificações HTTP adicionais** da API compilada; cobertura de linhas de **80,45% na API** e **91,50% no frontend**. As 27 verificações do Compose são outra execução de integração e não foram somadas à quantidade de casos Vitest/Node nem ao relatório V8.

O empacotamento não alterou o código de produção da API e do dashboard. Na data deste teste, o build Linux continha os mesmos quatro assets do build verificado no navegador: `index-cvZfgB9g.css`, `index-D996G8jP.js`, `TicketCharts-BQvvKAxL.js` e `TicketDetailDialog-DtBLDseN.js`. As [capturas da interface](interface.md) registram esse build; não foram refeitas para esta verificação.

## Git e GitHub

Repositório escolhido pelo usuário: [joao-fagundess/controle-pizzaria](https://github.com/joao-fagundess/controle-pizzaria). O remoto estava vazio. Os commits usam a autoria fornecida de João Pedro Flor; o Git Credential Manager confirmou autenticação como `joao-fagundess` e permissão de escrita. A seleção dessa conta foi configurada neste repositório, preservando a separação entre autoria e autenticação.

O primeiro commit registra o código existente antes do empacotamento. As branches `feature/api-endpoints`, `feature/dashboard-ui` e `feature/delivery` contêm as mudanças de imagens, proxy e Compose. Seus PRs foram integrados em `develop`, e `release/0.1.0` foi integrada em `main`. As branches foram mantidas para consulta.

Os PRs foram integrados na ordem API → dashboard → entrega → release, depois da autorização do usuário no chat. A atualização da entrega com os merges remotos ocorreu localmente sem conflitos ou mudanças de conteúdo. Os novos heads da entrega e da release tiveram os dois jobs da CI aprovados antes da integração. A sincronização de `develop` preserva tanto os merges locais quanto os remotos, sem force push.

Os PRs [#1 — API](https://github.com/joao-fagundess/controle-pizzaria/pull/1), [#2 — dashboard](https://github.com/joao-fagundess/controle-pizzaria/pull/2) e [#3 — entrega](https://github.com/joao-fagundess/controle-pizzaria/pull/3) foram integrados em `develop`. URLs, bases, horários e estados capturados constam no [relatório de PRs](compose/github-prs.json). Descrições em [docs/prs](../prs/delivery.md), com um [template comum](../../.github/pull_request_template.md). O [fluxo documentado](../gitflow.md) explica integração, sincronização de `develop` e tag.

O [PR #4 — entrega 0.1.0](https://github.com/joao-fagundess/controle-pizzaria/pull/4) foi integrado em `main`. Os quatro PRs estão encerrados como integrados. A aprovação da integração e da tag foi dada pelo usuário no chat em 12/11/2026; não é uma revisão humana registrada no GitHub. A tag anotada `v0.1.0` identifica o commit final de `main` após seus checks.

## CI e documentação final

O [workflow de validação](../../.github/workflows/validation.yml) executa aplicação e contêineres em dois jobs Ubuntu, com permissões de leitura. O primeiro teste remoto identificou que o runner Windows hospedado usa administrador, condição recusada pelo PostgreSQL. O job foi ajustado para Linux sem privilégios, com instalação que hidrata os links de bibliotecas do pacote nativo. A versão 18.6 foi confirmada também com UID 1000 no contêiner de diagnóstico; não houve criação de usuários no computador do usuário.

Os relatórios são publicados como artefatos de teste; o workflow não publica imagens nem implanta o dashboard. Uma execução remota só conta como aprovada depois de seu resultado real no [GitHub Actions](https://github.com/joao-fagundess/controle-pizzaria/actions). Os resultados Windows locais da validação consolidada permanecem válidos; a mudança é do ambiente da CI.

O [documento final](../entrega.md) reúne requisitos funcionais/não funcionais, decisões, modelo, endpoints, integração, dashboard, testes, cobertura, capturas e matriz RF → endpoint → teste. O [roteiro do vídeo](../roteiro-video.md) distribui a demonstração em 2min55s, com margem de cinco segundos.

A demonstração persistente foi iniciada em [http://127.0.0.1:8080/](http://127.0.0.1:8080/), com 480 chamados fictícios; o [registro local](compose/local-demo.json) distingue esse ambiente dos recursos descartáveis já removidos pelo validador. Para encerrar preservando os chamados, usar `docker compose down` na raiz.

Arquivos acrescentados: `docker-compose.yml`, `.env.example`, `.gitattributes`, Dockerfiles e `.dockerignore` de API/frontend, três arquivos Nginx, scripts de configuração/validação, workflow/template de PR, documentos de implantação/Gitflow/entrega/roteiro, descrições de PR e relatórios desta versão. README e documentos de estado foram atualizados. Credenciais locais, dependências e builds ficam fora do versionamento.

## Limitações e encerramento

O Compose é uma demonstração local com dados fictícios e credencial técnica entre proxy e API. Acesso compartilhado requer autenticação de pessoas e HTTPS. Continuam pendentes a homologação com o Thindesk real e seus campos analíticos complementares, a infraestrutura corporativa de acesso e a medição de p95/carga em ambiente representativo. As verificações locais não comprovam essas metas.

A integração dos quatro PRs concluiu o fluxo de entrega autorizado. As [notas da versão](../versao-0.1.0.md) reúnem escopo, execução e limites. A tag é publicada somente após a CI do commit final de `main`. Gravar o vídeo e homologar a origem real são atividades posteriores, com dependências já documentadas.
