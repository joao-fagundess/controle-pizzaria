# Fase 6 — Empacotamento, Gitflow e entrega

Candidata de entrega `0.1.0`, verificada em 12/11/2026. O ambiente local com contêineres e a documentação estão preparados; revisão dos PRs antecede a aprovação da release. O vídeo não foi gravado: o escopo entregue é seu roteiro.

## Contêineres e validação

O Docker Desktop foi iniciado com engine Linux, Docker 29.8.2 e Compose 5.5.1. As imagens da API e do frontend compilaram usando os lockfiles e executando os verificadores TypeScript dentro dos contêineres Linux.

O comando `node scripts/validate-compose.mjs` passou em **27 verificações HTTP**, além dos passos de build, configuração e manutenção. Evidências: [relatório JSON](fase-6/compose-report.json), [saída dos comandos](fase-6/compose-validation.txt), [configuração sem credenciais](fase-6/compose-config.json) e [estado dos contêineres](fase-6/compose-containers.json).

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

O servidor testado foi **PostgreSQL 18.6 em Linux**, em contraste com o PostgreSQL nativo Windows já verificado na Fase 5. Versão completa e IDs/digests das imagens estão no JSON. As imagens base seguem tags de linha estável; o registro dos digests identifica o que foi testado, sem prometer que uma reconstrução futura com tags mutáveis produzirá a mesma imagem.

O validador usa projeto aleatório `thindesk-phase6-*` e diretório temporário dentro do cache do workspace. Antes da remoção, confere prefixos e confinamento. Não utiliza o volume normal do ambiente local. A configuração persistente da demonstração está descrita em [implantacao.md](../implantacao.md).

## Relação com os testes anteriores

As [evidências da Fase 5](fase-5.md) registram **99 casos distintos**, **176 execuções** e **13 verificações HTTP adicionais** da API compilada; cobertura de linhas de **80,45% na API** e **91,50% no frontend**. As 27 verificações do Compose são outra execução de integração e não foram somadas à quantidade de casos Vitest/Node nem ao relatório V8.

O código de produção da API e do dashboard não foi alterado pelo empacotamento. O frontend compilado em Linux contém os mesmos quatro assets com hash das Fases 4/5: `index-cvZfgB9g.css`, `index-D996G8jP.js`, `TicketCharts-BQvvKAxL.js` e `TicketDetailDialog-DtBLDseN.js`. Por isso, as [capturas reais](fase-4.md) continuam sendo a evidência visual da interface; não foram apresentadas como novas imagens da Fase 6.

## Git e GitHub

Repositório escolhido pelo usuário: [joao-fagundess/controle-pizzaria](https://github.com/joao-fagundess/controle-pizzaria). O remoto estava vazio. Os commits usam a autoria fornecida de João Pedro Flor; o Git Credential Manager confirmou autenticação como `joao-fagundess` e permissão de escrita. A seleção dessa conta foi configurada neste repositório, preservando a separação entre autoria e autenticação.

O baseline registra o código que já existia antes do empacotamento, com data real. As branches `feature/api-endpoints`, `feature/dashboard-ui` e `feature/delivery` registram mudanças concretas da Fase 6. A integração foi preparada localmente em `develop`; `release/0.1.0` é a candidata. `main` preserva o baseline até a revisão da entrega. Não foi criada uma branch `hotfix/*` sem uma correção concreta.

Os PRs para `develop` devem ser revisados na ordem API → dashboard → entrega, pois as branches posteriores partem da integração local das anteriores. A candidata para `main` reúne o resultado completo. Enquanto os PRs aguardam revisão, o `develop` remoto preserva a base para comparação; não é sobrescrito com os merges locais. Essa separação mantém diferenças revisáveis e evita declarar revisão humana que não ocorreu.

Os PRs [#1 — API](https://github.com/joao-fagundess/controle-pizzaria/pull/1), [#2 — dashboard](https://github.com/joao-fagundess/controle-pizzaria/pull/2) e [#3 — entrega](https://github.com/joao-fagundess/controle-pizzaria/pull/3) foram publicados em rascunho. URLs, bases e estados capturados constam no [relatório de PRs](fase-6/github-prs.json). Descrições em [docs/prs](../prs/delivery.md), com um [template comum](../../.github/pull_request_template.md). O [fluxo documentado](../gitflow.md) explica integração, sincronização de `develop` e tag. A tag `v0.1.0` fica para a aprovação efetiva; não é apresentada como release já aprovada.

## CI e documentação final

O [workflow de validação](../../.github/workflows/validation.yml) prepara os checks da aplicação em Windows e dos contêineres em Ubuntu, com permissões de leitura. Os relatórios são publicados como artefatos de teste; o workflow não publica imagens nem implanta o dashboard. Uma execução remota só conta como aprovada depois de seu resultado real no [GitHub Actions](https://github.com/joao-fagundess/controle-pizzaria/actions).

O [documento final](../entrega.md) reúne requisitos funcionais/não funcionais, decisões, modelo, endpoints, integração, dashboard, testes, cobertura, capturas e matriz RF → endpoint → teste. O [roteiro do vídeo](../roteiro-video.md) distribui a demonstração em 2min55s, com margem de cinco segundos.

Arquivos acrescentados: `docker-compose.yml`, `.env.example`, `.gitattributes`, Dockerfiles e `.dockerignore` de API/frontend, três arquivos Nginx, scripts de configuração/validação, workflow/template de PR, documentos de implantação/Gitflow/entrega/roteiro, descrições de PR e relatórios desta fase. README e documentos de estado foram atualizados. Credenciais locais, dependências e builds ficam fora do versionamento.

## Limitações e encerramento

O Compose é uma demonstração local com dados fictícios e credencial técnica entre proxy e API. Acesso compartilhado requer autenticação de pessoas e HTTPS. Continuam pendentes a homologação com o Thindesk real e seus campos analíticos complementares, a infraestrutura corporativa de acesso e a medição de p95/carga em ambiente representativo. As verificações locais não comprovam essas metas.

O próximo passo de revisão é aprovar e integrar os PRs, confirmar os checks remotos e então criar a tag da release. Gravar o vídeo é uma atividade posterior ao roteiro entregue. Essas ações não são declaradas realizadas sem a evidência correspondente.
