# Fase 5 — Testes e evidências

Validação concluída em 12/11/2026 no Windows x64, Node.js 24.21.0. O [resumo gerado](fase-5/summary.json) registra comandos, códigos de saída, contagens e cobertura. Todos os sete passos do comando consolidado passaram.

## Resultados

| Suíte | Banco/ambiente | Casos aprovados | Evidência |
| --- | --- | ---: | --- |
| Integridade, migrations e seed | PGlite descartável | 14 | [Saída](fase-5/embedded-integrity.txt) |
| API, cálculos, conector e OpenAPI | PGlite + Supertest/origem controlada | 63 | [Saída](fase-5/api-tests.txt), [JSON](fase-5/api-tests.json) |
| Componentes, serviço HTTP e polling | React/jsdom | 22 | [Saída](fase-5/web-tests.txt), [JSON](fase-5/web-tests.json) |
| Mesmos casos de integridade | PostgreSQL 18.6 nativo via TCP | 14 | [TAP](fase-5/postgres-integrity.tap) |
| Mesmos casos de API/conector | PostgreSQL 18.6 nativo via TCP | 63 | [Saída](fase-5/postgres-tests.txt), [JSON](fase-5/postgres-tests.json) |
| API compilada com `pg.Pool` | HTTP real + PostgreSQL nativo | 13 verificações | [Relatório](fase-5/postgres-report.json) |

São **99 casos distintos** e **176 execuções de testes**, pois os 77 casos do backend são repetidos em dois ambientes de banco. As 13 verificações HTTP são adicionais e não entram nessas contagens. Build da API, tipos da API/testes e build do frontend passaram: [API](fase-5/api-build.txt), [tipos](fase-5/api-typecheck.txt), [frontend](fase-5/web-build.txt).

## Cenários verificados

As regras cobrem fechados entre os resolvidos, taxa sobre a população criada, média em segundos corridos, métricas nulas sem base, reabertura e nova resolução sem dupla contagem. Há testes de dia/semana/mês, preenchimento de intervalos vazios, limites de dia local, dia histórico de 23 horas em São Paulo, filtros combinados com E lógico, ranking, desempates, paginação e ordenação.

A integração cobre os sete endpoints, considerações sem multiplicar contagens, histórico cronológico, ausência de técnico/nota, parâmetros inválidos e erros sem detalhes internos. O conector usa uma origem HTTP controlada: login/sessão, limites, falhas e preservação dos registros incompletos sem inventar dados. Isso não é homologação com a instância real do Thindesk.

Os componentes cobrem KPIs, ranking, filtros, tabela, detalhe e foco, carregamento inicial, vazio, falha parcial, recuperação e resposta atrasada de filtros anteriores. O serviço HTTP verifica contrato, erros, timeout e cancelamento. O relógio de polling é verificado com timers controlados, inclusive pausa em aba oculta e desativação. As adaptações de layout e diálogo do jsdom estão restritas aos testes; o comportamento visual nativo foi verificado no navegador na Fase 4.

## PostgreSQL independente

O Docker estava sem daemon disponível. Para validar o caminho real de rede, `test:postgres` inicia um `postgres.exe` 18.6 separado da aplicação, com autenticação SCRAM, senha aleatória e escuta exclusiva em `127.0.0.1`. Os binários vêm da dependência de desenvolvimento fixada `embedded-postgres@18.6.0-beta.19` e de seu pacote para Windows x64. O servidor testado é PostgreSQL nativo; a biblioteca apenas fornece os executáveis.

Cada execução cria um cluster temporário e um banco `thindesk_test_*`. Cada suíte recebe um schema aleatório, aplica migrations reais, executa os casos e remove seu próprio schema. A mesma interface de banco permite rodar os testes em PGlite ou TCP sem duplicar cenários. `TEST_DATABASE_URL` aceita somente bancos locais com esse prefixo; os testes não leem `DATABASE_URL`. A configuração operacional da aplicação não é alterada.

Depois das suítes, o processo compilado `dist/server.js` usa o pool real. As verificações incluem saúde, sete rotas, 480 chamados no resumo, respostas 400/401/404/422 e **500 após desligar o cluster de teste**. A resposta pública 500 foi verificada para não conter a senha. O [relatório nativo](fase-5/postgres-report.json) registra versão, transporte, zero schemas de suíte remanescentes e limpeza concluída. O servidor e a API temporários são encerrados e o diretório do cluster é removido; não há instalação de serviço ou criação de usuário do Windows.

## Cobertura V8

| Escopo | Linhas | Instruções | Funções | Ramificações |
| --- | ---: | ---: | ---: | ---: |
| API | 80,45% (317/394) | 77,48% | 79,01% | 80,57% |
| Frontend | 91,50% (237/259) | 90,35% | 85,59% | 79,16% |

Relatórios navegáveis: [API](fase-5/api-coverage/index.html) e [frontend](fase-5/web-coverage/index.html). Totais por arquivo: [API JSON](fase-5/api-coverage/coverage-summary.json) e [frontend JSON](fase-5/web-coverage/coverage-summary.json). Os diretórios também contêm LCOV e os dados completos de cobertura.

A API inclui todos os `src/**/*.ts` e `scripts/database.mjs`; o frontend inclui todos os `src/**/*.{ts,tsx}`. Arquivos não importados também aparecem. `ticket-repository.ts` e `ticket-metrics.ts` tiveram 100% de linhas; `ticket-filters.ts`, 97,36%. No frontend, formatação e `use-dashboard.ts` tiveram 100% de linhas. Esses números não demonstram todos os comportamentos possíveis.

O relatório V8 corresponde às suítes Vitest em PGlite/jsdom. Ele não mescla os subprocessos da API compilada, os testes de integridade do executor Node ou a execução nativa. Assim, `server.ts` e `thindesk-sync.ts` aparecem com 0% no relatório, mesmo com o servidor compilado exercitado separadamente. O comando operacional de sincronização ainda não tem cobertura de subprocesso. A parte CLI de `database.mjs` também tem lacunas. SQL não recebe cobertura de instruções: suas regras são verificadas pelos resultados e pelas constraints nos dois bancos.

No frontend, `main.tsx` não é importado pelos testes de componentes. Há ramificações não exercitadas em tooltips, diálogo, controles da tabela e adaptadores HTTP; os testes do dashboard substituem o serviço por respostas controladas. As capturas reais complementam a validação, sem aumentar artificialmente o percentual. Nenhum percentual mínimo arbitrário foi definido.

## Capturas, requisições e rastreabilidade

- [Desktop](fase-4-desktop.jpg), [tablet](fase-4-tablet.jpg), [mobile com filtros](fase-4-mobile-filtrado.jpg), [detalhe](fase-4-detalhe.jpg) e [falha da API](fase-4-erro-api.jpg).
- [Validação no navegador e contexto das imagens](fase-4.md), incluindo 360, 768 e 1440 pixels, filtros, detalhe, polling e recuperação.
- [Coleção de requisições HTTP](../requisicoes.http), incluindo filtros combinados, agrupamentos, ranking, detalhe, intervalo vazio e erros de entrada. Ajustar host/token e IDs a partir das opções/listagem quando usar outro seed.
- [Matriz RF → endpoint → teste](../rastreabilidade.md), [fonte JSON](../rastreabilidade.json) e [checagem dos sete RF](fase-5/traceability-check.json).

As capturas são da Fase 4. O código de produção do frontend não mudou na Fase 5 e os quatro nomes de assets com hash coincidem com o build registrado anteriormente; essa comparação consta em `phase_4_visual_evidence_matches_bundle` no resumo. As imagens não são apresentadas como novas capturas desta fase.

O validador confirma que cada cenário nomeado na matriz existe no arquivo indicado e passou. Os cenários da API precisam passar nos dois bancos. Os endpoints são conferidos com o OpenAPI; a matriz não apenas relaciona nomes genéricos de testes.

## Reprodução

Na raiz do projeto, com Node.js 24+ e dependências instaladas:

```powershell
npm.cmd --prefix api ci
npm.cmd --prefix web ci
npm.cmd --prefix api run validate:phase-5
```

A instalação precisa obter os pacotes e os binários portáteis da plataforma. O comando consolidado executa os passos sequencialmente para evitar disputa de recursos durante a instrumentação, sobrescreve os relatórios e gera a matriz. A execução nativa foi validada no Windows x64; outras plataformas não foram homologadas nesta entrega. Detalhes dos passos estão em `api/scripts/validate-phase-5.mjs`; o cluster está em `api/scripts/test-postgres.mjs` e o isolamento das suítes em `api/tests/test-database.mjs`.

## Arquivos e próximo passo

Foram criados os dois scripts de validação, a infraestrutura de banco de teste com sua declaração TypeScript, a fonte/geração da matriz e este relatório. Foram atualizados testes, configurações de cobertura, manifests/lockfiles, coleção HTTP e documentação de estado. As saídas verificáveis estão em `docs/evidencias/fase-5/`.

A validação com PostgreSQL independente foi concluída. Continuam pendentes a origem real do Thindesk com os campos analíticos necessários, autenticação/TLS corporativos e medição de p95/carga em infraestrutura representativa. Testes locais não comprovam essas metas. A próxima fase, após confirmação, é Gitflow, Compose, documentação final e roteiro de vídeo de até três minutos.

## Referências técnicas

- [Vitest — configuração da cobertura](https://main.vitest.dev/config/coverage): inclusão explícita dos arquivos de origem e formatos de relatório.
- [Embedded Postgres — projeto que distribui os binários](https://github.com/leinelissen/embedded-postgres): dependências por plataforma e executáveis portáteis; o projeto utiliza os binários diretamente, sem a criação de usuários de sistema oferecida pela biblioteca.
