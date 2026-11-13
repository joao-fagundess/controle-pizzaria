# Validação da API

Validação em 11/11/2026 no Windows com Node.js 24.21.0. Dependências estão fixadas em `api/package-lock.json`. O banco de testes e demonstração é PostgreSQL 18.6 embarcado via PGlite 0.5.16.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | Compilação TypeScript concluída. |
| `npm.cmd run test` | Verificação de tipos, 14 testes de banco e 61 testes Vitest passaram: 75 testes, zero falhas. |
| Validação OpenAPI | Contrato dos sete endpoints aprovado por Swagger Parser; incluído nos 61 testes. |
| `npm.cmd run test:smoke` | Versão compilada iniciou e respondeu a nove consultas HTTP; processo temporário encerrado ao final. |
| `npm.cmd run db:explain` | Planos reais de quatro consultas registrados com 10 mil chamados sintéticos. |
| `npm.cmd run docs:openapi` | Contrato exportado a partir da mesma definição usada pelo servidor. |

Arquivos gerados:

- [Saída dos testes](api-tests.txt)
- [Consulta HTTP à versão compilada](api-http-smoke.json)
- [Planos SQL com ANALYZE e BUFFERS](api-query-plans.json)

Para reproduzir, na pasta `api`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run test
npm.cmd run test:smoke
npm.cmd run db:explain
npm.cmd run docs:openapi
```

No ambiente Codex, o sandbox bloqueou conexões de loopback com `EACCES`. As suítes HTTP e a verificação do servidor foram executadas com a permissão necessária para rede local; os testes não foram substituídos por mocks para contornar essa restrição.

## Cenários cobertos

Os testes HTTP verificam fórmulas com valores conhecidos, combinação dos seis filtros, inclusão do último milissegundo do dia local, ausência de base, consulta sem período, três agrupamentos, zeros, semanas parciais, ranking e desempate, reabertura, paginação e ordenação, última consideração, detalhe e autoria ausente, catálogos, erros 400/401/403/404/422/500, CORS, bearer e sanitização de falhas.

O conector foi testado com uma origem HTTP local controlada: login por formulário, sessão, consulta somente de leitura, login incorreto, sessão expirada, HTML com status 200, restrição de HTTPS remoto, JSON inválido e limite de tamanho. A recepção foi exercitada contra PostgreSQL embarcado: preservação de payload, rejeição por campos ausentes, identidade Extended JSON, atualização sem duplicação, identidades inválidas e rollback do lote.

## Planos das consultas

O script cria um banco descartável, aplica as migrations, carrega o seed, expande para 10 mil chamados por cópia sintética, executa `ANALYZE` e captura SQL e parâmetros do próprio repositório. Depois roda `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre resumo, listagem, série e ranking.

Essa amostra serve para inspecionar o comportamento das consultas e índices. As cópias não representam novos dados reais nem alteram o seed entregue. Tempos do JSON são medidas isoladas do motor embarcado; não comprovam a meta de p95, capacidade para dez usuários ou desempenho de PostgreSQL por rede. Nenhum índice adicional foi criado apenas para favorecer essa amostra.

## Limites e próximos testes

Docker continua sem serviço disponível. Não houve integração com PostgreSQL independente por rede nem homologação com uma instância real do Thindesk; o ZIP não fornece os campos analíticos necessários. Também não houve implantação, autenticação corporativa ou benchmark concorrente.

Este relatório registra a API e a importação legada na data indicada. Os testes de componentes, as capturas do painel e a cobertura consolidada estão em [interface](interface.md) e [testes](testes.md).
